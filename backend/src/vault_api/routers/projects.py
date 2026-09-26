"""Projects and project membership."""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, delete, func, select

from vault_api.db import utcnow
from vault_api.deps import DB, Meta, WorkspaceContext, WsCtx
from vault_api.models import Document, Membership, Project, ProjectMember, Role, User
from vault_api.permissions import Perm, check_manage_member
from vault_api.schemas.common import Message, user_ref
from vault_api.schemas.project import (
    ProjectCreate,
    ProjectMemberOut,
    ProjectMembersAdd,
    ProjectOut,
    ProjectUpdate,
)
from vault_api.schemas.workspace import ConfirmName
from vault_api.services import audit
from vault_api.services.access import (
    accessible_project_ids,
    apply_secure_access_changes,
    get_project,
    notify_project_access,
    secure_access_snapshot,
)
from vault_api.services.users import user_refs

router = APIRouter(prefix="/workspaces/{workspace_id}/projects", tags=["projects"])


async def project_outs(
    ctx: WorkspaceContext, db: DB, projects: Sequence[Project]
) -> list[ProjectOut]:
    ids = [p.id for p in projects]
    if not ids:
        return []
    member_counts = dict(
        (
            await db.execute(
                select(ProjectMember.project_id, func.count())
                .where(ProjectMember.project_id.in_(ids))
                .group_by(ProjectMember.project_id)
            )
        ).all()
    )
    doc_counts = {
        r.project_id: (r.total, r.secure)
        for r in await db.execute(
            select(
                Document.project_id,
                func.count().label("total"),
                func.count(case((Document.kind == "secure", 1))).label("secure"),
            )
            .where(Document.project_id.in_(ids))
            .group_by(Document.project_id)
        )
    }
    creators = await user_refs(db, (p.created_by_id for p in projects))
    return [
        ProjectOut(
            id=p.id,
            name=p.name,
            description=p.description,
            created_by=creators.get(p.created_by_id) if p.created_by_id else None,
            created_at=p.created_at,
            archived_at=p.archived_at,
            last_activity_at=p.last_activity_at,
            member_count=member_counts.get(p.id, 0),
            document_count=doc_counts.get(p.id, (0, 0))[0],
            secure_document_count=doc_counts.get(p.id, (0, 0))[1],
            can_edit=ctx.actor.has(Perm.PROJECTS_EDIT),
            can_manage_members=ctx.actor.has(Perm.PROJECTS_MANAGE_MEMBERS),
        )
        for p in projects
    ]


@router.get("")
async def list_projects(
    ctx: WsCtx, db: DB, include_archived: bool = Query(default=True)
) -> list[ProjectOut]:
    ids = await accessible_project_ids(ctx, db)
    stmt = select(Project).where(Project.id.in_(ids)).order_by(Project.last_activity_at.desc())
    if not include_archived:
        stmt = stmt.where(Project.archived_at.is_(None))
    return await project_outs(ctx, db, (await db.execute(stmt)).scalars().all())


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, ctx: WsCtx, db: DB, meta: Meta) -> ProjectOut:
    ctx.require(Perm.PROJECTS_CREATE)
    before = await secure_access_snapshot(db, ctx.workspace.id)
    project = Project(
        workspace_id=ctx.workspace.id,
        name=body.name,
        description=body.description,
        created_by_id=ctx.user.id,
    )
    db.add(project)
    await db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=ctx.user.id, added_by_id=ctx.user.id))
    await db.flush()
    audit.record(
        db,
        action="project.created",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="project",
        target_id=project.id,
        target_label=project.name,
    )
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return (await project_outs(ctx, db, [project]))[0]


@router.get("/{project_id}")
async def get_one(project_id: uuid.UUID, ctx: WsCtx, db: DB) -> ProjectOut:
    project = await get_project(ctx, db, project_id)
    return (await project_outs(ctx, db, [project]))[0]


@router.patch("/{project_id}")
async def update_project(
    project_id: uuid.UUID, body: ProjectUpdate, ctx: WsCtx, db: DB, meta: Meta
) -> ProjectOut:
    ctx.require(Perm.PROJECTS_EDIT)
    project = await get_project(ctx, db, project_id, writable=True)
    changes: dict[str, object] = {}
    if body.name is not None and body.name != project.name:
        changes["name"] = {"from": project.name, "to": body.name}
        project.name = body.name
    if body.description is not None and body.description != project.description:
        changes["description"] = True
        project.description = body.description
    if changes:
        project.last_activity_at = utcnow()
        audit.record(
            db,
            action="project.updated",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=project.id,
            target_type="project",
            target_id=project.id,
            target_label=project.name,
            details=changes,
        )
    await db.commit()
    return (await project_outs(ctx, db, [project]))[0]


@router.post("/{project_id}/archive")
async def archive_project(project_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> ProjectOut:
    ctx.require(Perm.PROJECTS_EDIT)
    project = await get_project(ctx, db, project_id)
    if project.archived_at is None:
        project.archived_at = utcnow()
        audit.record(
            db,
            action="project.archived",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=project.id,
            target_type="project",
            target_id=project.id,
            target_label=project.name,
        )
        await db.commit()
    return (await project_outs(ctx, db, [project]))[0]


@router.post("/{project_id}/unarchive")
async def unarchive_project(project_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> ProjectOut:
    ctx.require(Perm.PROJECTS_EDIT)
    project = await get_project(ctx, db, project_id)
    if project.archived_at is not None:
        project.archived_at = None
        project.last_activity_at = utcnow()
        audit.record(
            db,
            action="project.unarchived",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=project.id,
            target_type="project",
            target_id=project.id,
            target_label=project.name,
        )
        await db.commit()
    return (await project_outs(ctx, db, [project]))[0]


@router.post("/{project_id}/delete")
async def delete_project(
    project_id: uuid.UUID, body: ConfirmName, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    ctx.require(Perm.PROJECTS_EDIT)
    project = await get_project(ctx, db, project_id, lock=True)
    if body.confirm_name.strip() != project.name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the project name exactly.")
    audit.record(
        db,
        action="project.deleted",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="project",
        target_id=project.id,
        target_label=project.name,
    )
    await db.delete(project)
    await db.commit()
    return Message(message=f"{project.name} was deleted.")


# ---- Project members ---------------------------------------------------------------------------


@router.get("/{project_id}/members")
async def list_project_members(project_id: uuid.UUID, ctx: WsCtx, db: DB) -> list[ProjectMemberOut]:
    project = await get_project(ctx, db, project_id)
    assigned = {
        r.user_id: r.added_at
        for r in await db.execute(
            select(ProjectMember.user_id, ProjectMember.added_at).where(
                ProjectMember.project_id == project.id
            )
        )
    }
    rows = (
        await db.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .join(Role, Role.id == Membership.role_id)
            .where(Membership.workspace_id == ctx.workspace.id)
            .order_by(Role.rank.desc(), func.lower(User.name))
        )
    ).all()
    can_manage = ctx.actor.has(Perm.PROJECTS_MANAGE_MEMBERS)
    out: list[ProjectMemberOut] = []
    for m, user, role in rows:
        all_access = m.is_owner or Perm.PROJECTS_ACCESS_ALL.value in role.permissions
        if user.id not in assigned and not all_access:
            continue
        removable = (
            can_manage
            and user.id in assigned
            and not m.is_owner
            and (user.id == ctx.user.id or ctx.actor.is_owner or role.rank < ctx.actor.rank)
        )
        out.append(
            ProjectMemberOut(
                user=user_ref(user),
                role_name=role.name,
                via_all_access=all_access,
                assigned=user.id in assigned,
                added_at=assigned.get(user.id),
                can_remove=removable,
            )
        )
    return out


@router.post("/{project_id}/members")
async def add_project_members(
    project_id: uuid.UUID, body: ProjectMembersAdd, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    ctx.require(Perm.PROJECTS_MANAGE_MEMBERS)
    project = await get_project(ctx, db, project_id)
    wanted = set(body.user_ids)
    members = {
        u.id: u
        for u in (
            await db.execute(
                select(User)
                .join(Membership, Membership.user_id == User.id)
                .where(Membership.workspace_id == ctx.workspace.id, User.id.in_(wanted))
            )
        ).scalars()
    }
    if set(members) != wanted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
    existing = set(
        (
            await db.execute(
                select(ProjectMember.user_id).where(
                    ProjectMember.project_id == project.id, ProjectMember.user_id.in_(wanted)
                )
            )
        )
        .scalars()
        .all()
    )
    before = await secure_access_snapshot(db, ctx.workspace.id)
    for uid in wanted - existing:
        db.add(ProjectMember(project_id=project.id, user_id=uid, added_by_id=ctx.user.id))
        if uid != ctx.user.id:
            notify_project_access(db, user_id=uid, workspace_id=ctx.workspace.id, project=project)
        audit.record(
            db,
            action="project.member_added",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=project.id,
            target_type="user",
            target_id=uid,
            target_label=members[uid].email,
        )
    await db.flush()
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return Message(message="Members added.")


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: uuid.UUID, user_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    ctx.require(Perm.PROJECTS_MANAGE_MEMBERS)
    project = await get_project(ctx, db, project_id)
    row = (
        await db.execute(
            select(Membership, User, Role)
            .join(User, User.id == Membership.user_id)
            .join(Role, Role.id == Membership.role_id)
            .where(Membership.workspace_id == ctx.workspace.id, Membership.user_id == user_id)
        )
    ).one_or_none()
    assignment = await db.get(ProjectMember, (project.id, user_id))
    if row is None or assignment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "That person is not assigned to this project."
        )
    membership, user, role = row
    if user_id != ctx.user.id:
        check_manage_member(ctx.actor, role.rank, membership.is_owner)
    before = await secure_access_snapshot(db, ctx.workspace.id)
    await db.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == user_id
        )
    )
    await db.flush()
    audit.record(
        db,
        action="project.member_removed",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="user",
        target_id=user_id,
        target_label=user.email,
    )
    await apply_secure_access_changes(db, ctx.workspace.id, before, actor=ctx.user, meta=meta)
    await db.commit()
    return Message(message=f"{user.name} was removed from {project.name}.")
