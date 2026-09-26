"""Project visibility and secure-access computation.

Secure access to a project = the member's role has `secure.view` AND they can access the project
(assigned to it, or their role has `projects.access_all`). Every change that could alter this
(roles, permissions, assignments, membership) takes a snapshot before and calls
`apply_secure_access_changes` after, which drives the vault key grant / revocation flows.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.deps import WorkspaceContext
from vault_api.models import Membership, Project, ProjectMember, Role, User
from vault_api.permissions import Perm
from vault_api.services import notifications, vault_hooks
from vault_api.services.audit import RequestMeta

SecureSnapshot = dict[uuid.UUID, set[uuid.UUID]]


async def accessible_project_ids(ctx: WorkspaceContext, db: AsyncSession) -> set[uuid.UUID]:
    if ctx.actor.has(Perm.PROJECTS_ACCESS_ALL):
        rows = await db.execute(select(Project.id).where(Project.workspace_id == ctx.workspace.id))
    else:
        rows = await db.execute(
            select(Project.id)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(Project.workspace_id == ctx.workspace.id, ProjectMember.user_id == ctx.user.id)
        )
    return set(rows.scalars().all())


async def can_access_project(
    ctx: WorkspaceContext, db: AsyncSession, project_id: uuid.UUID
) -> bool:
    if ctx.actor.has(Perm.PROJECTS_ACCESS_ALL):
        return True
    row = await db.get(ProjectMember, (project_id, ctx.user.id))
    return row is not None


async def get_project(
    ctx: WorkspaceContext,
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    writable: bool = False,
    lock: bool = False,
) -> Project:
    """Load a project the acting user may see, or 404. `writable` rejects archived projects."""
    stmt = select(Project).where(Project.id == project_id, Project.workspace_id == ctx.workspace.id)
    if lock:
        stmt = stmt.with_for_update()
    project = (await db.execute(stmt)).scalar_one_or_none()
    if project is None or not await can_access_project(ctx, db, project.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    if writable and project.archived_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project is archived. Restore it first.")
    return project


@dataclass(frozen=True)
class _MemberAccess:
    user_id: uuid.UUID
    all_projects: bool
    secure: bool


async def secure_access_snapshot(db: AsyncSession, workspace_id: uuid.UUID) -> SecureSnapshot:
    """Map project id -> ids of users who currently have secure-document access to it."""
    member_rows = await db.execute(
        select(Membership.user_id, Membership.is_owner, Role.permissions)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.workspace_id == workspace_id)
    )
    members = [
        _MemberAccess(
            user_id=r.user_id,
            all_projects=r.is_owner or Perm.PROJECTS_ACCESS_ALL.value in r.permissions,
            secure=r.is_owner or Perm.SECURE_VIEW.value in r.permissions,
        )
        for r in member_rows
    ]
    project_ids = (
        (await db.execute(select(Project.id).where(Project.workspace_id == workspace_id)))
        .scalars()
        .all()
    )
    assigned: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for pm in await db.execute(
        select(ProjectMember.project_id, ProjectMember.user_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(Project.workspace_id == workspace_id)
    ):
        assigned[pm.project_id].add(pm.user_id)

    snapshot: SecureSnapshot = {}
    for pid in project_ids:
        snapshot[pid] = {
            m.user_id
            for m in members
            if m.secure and (m.all_projects or m.user_id in assigned[pid])
        }
    return snapshot


async def apply_secure_access_changes(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    before: SecureSnapshot,
    *,
    actor: User,
    meta: RequestMeta | None,
) -> None:
    """Compare against a snapshot taken before a change and run grant/revocation flows."""
    after = await secure_access_snapshot(db, workspace_id)
    # Only projects that still exist: a deleted project's keys go with it.
    for project_id in after:
        lost = before.get(project_id, set()) - after.get(project_id, set())
        gained = after.get(project_id, set()) - before.get(project_id, set())
        if lost:
            await on_secure_access_lost(db, workspace_id, project_id, lost, actor=actor, meta=meta)
        if gained:
            await on_secure_access_gained(db, workspace_id, project_id, gained)


async def on_secure_access_lost(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_ids: set[uuid.UUID],
    *,
    actor: User,
    meta: RequestMeta | None,
) -> None:
    """Revocation (requirement 7.5). The vault layer deletes sealed keys and schedules rotation."""
    await vault_hooks.revoke_secure_access(
        db, workspace_id, project_id, user_ids, actor=actor, meta=meta
    )


async def on_secure_access_gained(
    db: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID, user_ids: set[uuid.UUID]
) -> None:
    """Grant (requirement 7.4). The vault layer queues pending grants for key holders."""
    await vault_hooks.queue_secure_grants(db, workspace_id, project_id, user_ids)


def notify_project_access(
    db: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID, project: Project
) -> None:
    notifications.notify(
        db,
        user_id=user_id,
        workspace_id=workspace_id,
        type="project.access_granted",
        title=f"You were added to {project.name}",
        link=f"/w/{workspace_id}/projects/{project.id}",
    )
