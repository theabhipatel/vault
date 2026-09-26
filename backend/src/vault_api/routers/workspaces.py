"""Workspaces, membership, ownership transfer."""

import uuid
from collections import defaultdict

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import aliased

from vault_api.deps import DB, CurrentAuth, Meta, WsCtx, load_workspace_context
from vault_api.models import Membership, Project, ProjectMember, Role, User, Workspace
from vault_api.permissions import (
    Perm,
    PermissionDenied,
    can_manage_rank,
    check_assignable_role,
    check_manage_member,
)
from vault_api.schemas.common import Message, avatar_url
from vault_api.schemas.workspace import (
    ConfirmName,
    MemberOut,
    MemberProjectsUpdate,
    MemberRoleUpdate,
    ProjectRef,
    TransferOwnership,
    WorkspaceCreate,
    WorkspaceDetail,
    WorkspaceSummary,
    WorkspaceUpdate,
)
from vault_api.services import audit, notifications
from vault_api.services.access import (
    accessible_project_ids,
    apply_secure_access_changes,
    notify_project_access,
    secure_access_snapshot,
)
from vault_api.services.workspaces import (
    create_workspace,
    get_role,
    get_system_role,
    role_member_counts,
    role_out,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("")
async def list_workspaces(auth: CurrentAuth, db: DB) -> list[WorkspaceSummary]:
    owner = aliased(User)
    counts = (
        select(Membership.workspace_id, func.count().label("n"))
        .group_by(Membership.workspace_id)
        .subquery()
    )
    rows = await db.execute(
        select(Workspace, Membership.is_owner, Role.name, owner.name, counts.c.n)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .join(Role, Role.id == Membership.role_id)
        .join(owner, owner.id == Workspace.owner_id)
        .join(counts, counts.c.workspace_id == Workspace.id)
        .where(Membership.user_id == auth.user.id)
        .order_by(func.lower(Workspace.name))
    )
    return [
        WorkspaceSummary(
            id=ws.id,
            name=ws.name,
            is_owner=is_owner,
            role_name=role_name,
            owner_name=owner_name,
            member_count=n,
            is_default=ws.id == auth.user.default_workspace_id,
        )
        for ws, is_owner, role_name, owner_name, n in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: WorkspaceCreate, auth: CurrentAuth, db: DB, meta: Meta) -> WorkspaceSummary:
    ws = await create_workspace(db, auth.user, body.name)
    audit.record(
        db,
        action="workspace.created",
        actor=auth.user,
        meta=meta,
        workspace_id=ws.id,
        target_type="workspace",
        target_id=ws.id,
        target_label=ws.name,
    )
    await db.commit()
    return WorkspaceSummary(
        id=ws.id,
        name=ws.name,
        is_owner=True,
        role_name="Owner",
        owner_name=auth.user.name,
        member_count=1,
        is_default=auth.user.default_workspace_id == ws.id,
    )


@router.get("/{workspace_id}")
async def get_workspace(ctx: WsCtx, db: DB) -> WorkspaceDetail:
    counts = await role_member_counts(db, ctx.workspace.id)
    perms = sorted(p.value for p in Perm if ctx.actor.has(p))
    return WorkspaceDetail(
        id=ctx.workspace.id,
        name=ctx.workspace.name,
        owner_id=ctx.workspace.owner_id,
        created_at=ctx.workspace.created_at,
        is_owner=ctx.is_owner,
        is_default=ctx.user.default_workspace_id == ctx.workspace.id,
        role=role_out(ctx.role, ctx.actor, counts.get(ctx.role.id, 0)),
        permissions=perms,
    )


@router.patch("/{workspace_id}")
async def update_workspace(body: WorkspaceUpdate, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    ctx.require(Perm.WORKSPACE_SETTINGS)
    old = ctx.workspace.name
    ctx.workspace.name = body.name
    audit.record(
        db,
        action="workspace.renamed",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        target_type="workspace",
        target_id=ctx.workspace.id,
        target_label=body.name,
        details={"from": old},
    )
    await db.commit()
    return Message(message="Workspace updated.")


@router.post("/{workspace_id}/default")
async def make_default(ctx: WsCtx, db: DB) -> Message:
    ctx.user.default_workspace_id = ctx.workspace.id
    await db.commit()
    return Message(message="Default workspace updated.")


@router.post("/{workspace_id}/delete")
async def delete_workspace(body: ConfirmName, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    if not ctx.is_owner:
        raise PermissionDenied("Only the owner can delete the workspace.")
    if body.confirm_name.strip() != ctx.workspace.name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the workspace name exactly.")
    member_ids = (
        (
            await db.execute(
                select(Membership.user_id).where(Membership.workspace_id == ctx.workspace.id)
            )
        )
        .scalars()
        .all()
    )
    audit.record(
        db,
        action="workspace.deleted",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        target_type="workspace",
        target_id=ctx.workspace.id,
        target_label=ctx.workspace.name,
    )
    name = ctx.workspace.name
    await db.delete(ctx.workspace)
    await db.flush()
    for uid in member_ids:
        if uid != ctx.user.id:
            notifications.notify(
                db,
                user_id=uid,
                type="workspace.deleted",
                title=f"{name} was deleted",
                body=f"{ctx.user.name} deleted the workspace.",
            )
    await db.commit()
    return Message(message="Workspace deleted.")


@router.post("/{workspace_id}/transfer")
async def transfer_ownership(body: TransferOwnership, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    ctx = await load_workspace_context(db, ctx.workspace.id, ctx.user, lock=True)
    if not ctx.is_owner:
        raise PermissionDenied("Only the owner can transfer ownership.")
    if body.confirm_name.strip() != ctx.workspace.name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the workspace name exactly.")
    if body.user_id == ctx.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already own this workspace.")
    target = await db.scalar(
        select(Membership).where(
            Membership.workspace_id == ctx.workspace.id, Membership.user_id == body.user_id
        )
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
    new_owner = await db.get(User, body.user_id)
    assert new_owner is not None
    before = await secure_access_snapshot(db, ctx.workspace.id)
    owner_role = await get_system_role(db, ctx.workspace.id, "owner")
    admin_role = await get_system_role(db, ctx.workspace.id, "admin")

    # Order matters: the database allows exactly one owner row per workspace at any time.
    ctx.membership.is_owner = False
    ctx.membership.role_id = admin_role.id
    await db.flush()
    target.is_owner = True
    target.role_id = owner_role.id
    ctx.workspace.owner_id = new_owner.id
    await db.flush()

    audit.record(
        db,
        action="workspace.ownership_transferred",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        target_type="user",
        target_id=new_owner.id,
        target_label=new_owner.email,
    )
    notifications.notify(
        db,
        user_id=new_owner.id,
        workspace_id=ctx.workspace.id,
        type="workspace.ownership_received",
        title=f"You now own {ctx.workspace.name}",
        body=f"{ctx.user.name} transferred ownership to you.",
        link=f"/w/{ctx.workspace.id}/settings",
    )
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return Message(message=f"{new_owner.name} is now the owner. You are now an Admin.")


@router.post("/{workspace_id}/leave")
async def leave_workspace(ctx: WsCtx, db: DB, meta: Meta) -> Message:
    if ctx.is_owner:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Owners cannot leave. Transfer ownership or delete the workspace.",
        )
    await _remove_membership(
        db, ctx.workspace.id, ctx.user, actor=ctx.user, meta=meta, action="member.left"
    )
    await db.commit()
    return Message(message=f"You left {ctx.workspace.name}.")


# ---- Members -----------------------------------------------------------------------------------


@router.get("/{workspace_id}/members")
async def list_members(ctx: WsCtx, db: DB) -> list[MemberOut]:
    visible = await accessible_project_ids(ctx, db)
    rows = (
        await db.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .join(Role, Role.id == Membership.role_id)
            .where(Membership.workspace_id == ctx.workspace.id)
            .order_by(Role.rank.desc(), func.lower(User.name))
        )
    ).all()
    projects_by_user: dict[uuid.UUID, list[ProjectRef]] = defaultdict(list)
    for pm_user, pid, pname in await db.execute(
        select(ProjectMember.user_id, Project.id, Project.name)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
        .order_by(func.lower(Project.name))
    ):
        if pid in visible:
            projects_by_user[pm_user].append(ProjectRef(id=pid, name=pname))
    can_act = ctx.actor.has(Perm.MEMBERS_CHANGE_ROLE) or ctx.actor.has(Perm.MEMBERS_REMOVE)
    return [
        MemberOut(
            user_id=user.id,
            name=user.name,
            email=user.email,
            avatar_url=avatar_url(user),
            role_id=role.id,
            role_name=role.name,
            role_rank=role.rank,
            is_owner=m.is_owner,
            joined_at=m.joined_at,
            all_projects=m.is_owner or Perm.PROJECTS_ACCESS_ALL.value in role.permissions,
            projects=projects_by_user[user.id],
            vault_status="not_set_up",
            key_fingerprint=None,
            can_manage=(
                can_act
                and user.id != ctx.user.id
                and not m.is_owner
                and can_manage_rank(ctx.actor, role.rank)
            ),
        )
        for m, user, role in rows
    ]


async def _load_member(
    db: DB, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Membership, User, Role]:
    row = (
        await db.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .join(Role, Role.id == Membership.role_id)
            .where(Membership.workspace_id == workspace_id, Membership.user_id == user_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
    return row


@router.patch("/{workspace_id}/members/{user_id}")
async def change_member_role(
    user_id: uuid.UUID, body: MemberRoleUpdate, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    ctx = await load_workspace_context(db, ctx.workspace.id, ctx.user, lock=True)
    ctx.require(Perm.MEMBERS_CHANGE_ROLE)
    if user_id == ctx.user.id:
        raise PermissionDenied("You cannot change your own role.")
    membership, user, current_role = await _load_member(db, ctx.workspace.id, user_id)
    check_manage_member(ctx.actor, current_role.rank, membership.is_owner)
    new_role = await get_role(db, ctx.workspace.id, body.role_id)
    check_assignable_role(
        ctx.actor, new_role.rank, frozenset(new_role.permissions), new_role.system_key == "owner"
    )
    if new_role.id == current_role.id:
        return Message(message="No change.")
    before = await secure_access_snapshot(db, ctx.workspace.id)
    membership.role_id = new_role.id
    await db.flush()
    audit.record(
        db,
        action="member.role_changed",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        target_type="user",
        target_id=user.id,
        target_label=user.email,
        details={"from": current_role.name, "to": new_role.name},
    )
    notifications.notify(
        db,
        user_id=user.id,
        workspace_id=ctx.workspace.id,
        type="member.role_changed",
        title=f"Your role in {ctx.workspace.name} is now {new_role.name}",
        body=f"Changed by {ctx.user.name}.",
        link=f"/w/{ctx.workspace.id}",
    )
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return Message(message=f"{user.name} is now {new_role.name}.")


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(user_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    ctx = await load_workspace_context(db, ctx.workspace.id, ctx.user, lock=True)
    ctx.require(Perm.MEMBERS_REMOVE)
    if user_id == ctx.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use “Leave workspace” instead.")
    membership, user, role = await _load_member(db, ctx.workspace.id, user_id)
    check_manage_member(ctx.actor, role.rank, membership.is_owner)
    await _remove_membership(
        db, ctx.workspace.id, user, actor=ctx.user, meta=meta, action="member.removed"
    )
    notifications.notify(
        db,
        user_id=user.id,
        type="member.removed",
        title=f"You were removed from {ctx.workspace.name}",
        body=f"Removed by {ctx.user.name}.",
    )
    await db.commit()
    return Message(message=f"{user.name} was removed.")


async def _remove_membership(
    db: DB, workspace_id: uuid.UUID, user: User, *, actor: User, meta: Meta, action: str
) -> None:
    before = await secure_access_snapshot(db, workspace_id)
    project_ids = select(Project.id).where(Project.workspace_id == workspace_id)
    await db.execute(
        delete(ProjectMember).where(
            ProjectMember.user_id == user.id, ProjectMember.project_id.in_(project_ids)
        )
    )
    await db.execute(
        delete(Membership).where(
            Membership.workspace_id == workspace_id, Membership.user_id == user.id
        )
    )
    if user.default_workspace_id == workspace_id:
        user.default_workspace_id = await db.scalar(
            select(Membership.workspace_id)
            .where(Membership.user_id == user.id)
            .order_by(Membership.is_owner.desc(), Membership.joined_at)
            .limit(1)
        )
    await db.flush()
    audit.record(
        db,
        action=action,
        actor=actor,
        meta=meta,
        workspace_id=workspace_id,
        target_type="user",
        target_id=user.id,
        target_label=user.email,
    )
    await apply_secure_access_changes(db, workspace_id, before, actor=actor, meta=meta)


@router.put("/{workspace_id}/members/{user_id}/projects")
async def set_member_projects(
    user_id: uuid.UUID, body: MemberProjectsUpdate, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    """Set a member's project assignments, limited to projects the actor can access."""
    ctx.require(Perm.PROJECTS_MANAGE_MEMBERS)
    membership, user, role = await _load_member(db, ctx.workspace.id, user_id)
    visible = await accessible_project_ids(ctx, db)
    wanted = set(body.project_ids)
    if not wanted <= visible:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    current = set(
        (
            await db.execute(
                select(ProjectMember.project_id).where(
                    ProjectMember.user_id == user_id, ProjectMember.project_id.in_(visible)
                )
            )
        )
        .scalars()
        .all()
    )
    to_add, to_remove = wanted - current, current - wanted
    if to_remove and user_id != ctx.user.id:
        check_manage_member(ctx.actor, role.rank, membership.is_owner)
    before = await secure_access_snapshot(db, ctx.workspace.id)
    projects = {
        p.id: p
        for p in (
            await db.execute(select(Project).where(Project.id.in_(to_add | to_remove)))
        ).scalars()
    }
    for pid in to_add:
        db.add(ProjectMember(project_id=pid, user_id=user_id, added_by_id=ctx.user.id))
        notify_project_access(
            db, user_id=user_id, workspace_id=ctx.workspace.id, project=projects[pid]
        )
        audit.record(
            db,
            action="project.member_added",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=pid,
            target_type="user",
            target_id=user_id,
            target_label=user.email,
        )
    if to_remove:
        await db.execute(
            delete(ProjectMember).where(
                ProjectMember.user_id == user_id, ProjectMember.project_id.in_(to_remove)
            )
        )
        for pid in to_remove:
            audit.record(
                db,
                action="project.member_removed",
                actor=ctx.user,
                meta=meta,
                workspace_id=ctx.workspace.id,
                project_id=pid,
                target_type="user",
                target_id=user_id,
                target_label=user.email,
            )
    await db.flush()
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return Message(message="Project access updated.")
