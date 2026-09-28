"""Server side of the vault: who should hold which project key, grants, revocation, rotation state.

The server never sees a key. It decides *who is entitled* to a sealed copy (access control) and
keeps the bookkeeping that lets browsers complete grants and rotations automatically.
"""

import uuid
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.models import (
    Document,
    Membership,
    Project,
    ProjectKeyGrant,
    User,
    UserVault,
    Workspace,
)
from vault_api.schemas.vault import GrantIn, Recipient
from vault_api.services import audit, notifications
from vault_api.services.access import secure_access_snapshot
from vault_api.services.audit import RequestMeta


async def entitled_user_ids(db: AsyncSession, project: Project) -> set[uuid.UUID]:
    """Users with secure-document access to this project right now."""
    snapshot = await secure_access_snapshot(db, project.workspace_id)
    return snapshot.get(project.id, set())


async def vault_keys(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    rows = await db.execute(
        select(UserVault.user_id, UserVault.public_key).where(UserVault.user_id.in_(user_ids))
    )
    return {r.user_id: r.public_key for r in rows}


async def recipients(db: AsyncSession, project: Project) -> list[Recipient]:
    """Entitled users who have a vault, i.e. everyone who should hold the project key."""
    keys = await vault_keys(db, await entitled_user_ids(db, project))
    if not keys:
        return []
    users = (await db.execute(select(User).where(User.id.in_(keys)))).scalars()
    return [
        Recipient(user_id=u.id, name=u.name, email=u.email, public_key=keys[u.id])
        for u in sorted(users, key=lambda u: u.name.lower())
    ]


async def holders(db: AsyncSession, project: Project) -> dict[uuid.UUID, ProjectKeyGrant]:
    if project.key_version is None:
        return {}
    rows = await db.execute(
        select(ProjectKeyGrant).where(
            ProjectKeyGrant.project_id == project.id,
            ProjectKeyGrant.key_version == project.key_version,
        )
    )
    return {g.user_id: g for g in rows.scalars()}


async def require_holder(db: AsyncSession, project: Project, user: User) -> ProjectKeyGrant:
    """The acting user must currently hold (and be entitled to) the project key."""
    grant = (await holders(db, project)).get(user.id)
    if grant is None or user.id not in await entitled_user_ids(db, project):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't hold this project's key.")
    return grant


async def validate_grants(
    db: AsyncSession,
    project: Project,
    grants: list[GrantIn],
    *,
    must_include: uuid.UUID | None = None,
    skip_existing: bool = False,
) -> list[GrantIn]:
    """Grants may only target entitled users, sealed to their *current* public key."""
    entitled = await entitled_user_ids(db, project)
    keys = await vault_keys(db, {g.user_id for g in grants})
    seen: set[uuid.UUID] = set()
    existing = set(await holders(db, project)) if skip_existing else set()
    valid: list[GrantIn] = []
    for g in grants:
        if g.user_id in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate recipient.")
        seen.add(g.user_id)
        if g.user_id not in entitled:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A recipient no longer has secure access. Reload."
            )
        if keys.get(g.user_id) != g.public_key:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A recipient's public key changed. Reload and verify."
            )
        if g.user_id not in existing:
            valid.append(g)
    if must_include is not None and must_include not in seen:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Include a copy sealed to yourself.")
    return valid


def add_grants(
    db: AsyncSession, project: Project, version: int, grants: list[GrantIn], by: User
) -> None:
    for g in grants:
        db.add(
            ProjectKeyGrant(
                project_id=project.id,
                key_version=version,
                user_id=g.user_id,
                sealed_key=g.sealed_key,
                recipient_public_key=g.public_key,
                granted_by_id=by.id,
            )
        )


async def revoke_secure_access(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_ids: set[uuid.UUID],
    *,
    actor: User,
    meta: RequestMeta | None,
) -> None:
    """Requirement 7.5: stop serving, delete sealed copies, schedule rotation if a key leaked."""
    project = await db.get(Project, project_id)
    if project is None:
        return
    result = await db.execute(
        delete(ProjectKeyGrant)
        .where(ProjectKeyGrant.project_id == project_id, ProjectKeyGrant.user_id.in_(user_ids))
        .returning(ProjectKeyGrant.user_id)
    )
    had_key = set(result.scalars().all())
    for user_id in user_ids:
        audit.record(
            db,
            action="vault.access_revoked",
            actor=actor,
            meta=meta,
            workspace_id=workspace_id,
            project_id=project_id,
            target_type="user",
            target_id=user_id,
            details={"held_key": user_id in had_key},
        )
    if had_key and project.key_version is not None and not project.rotation_pending:
        project.rotation_pending = True
        audit.record(
            db,
            action="vault.rotation_scheduled",
            actor=actor,
            meta=meta,
            workspace_id=workspace_id,
            project_id=project_id,
            target_type="project",
            target_id=project_id,
            target_label=project.name,
        )


async def queue_secure_grants(
    db: AsyncSession, workspace_id: uuid.UUID, project_id: uuid.UUID, user_ids: set[uuid.UUID]
) -> None:
    """Requirement 7.4: new entitlement. Grants are computed as pending; notify people."""
    project = await db.get(Project, project_id)
    if project is None or project.key_version is None:
        return
    with_vault = await vault_keys(db, user_ids)
    for user_id in user_ids:
        if user_id in with_vault:
            notifications.notify(
                db,
                user_id=user_id,
                workspace_id=workspace_id,
                type="vault.access_pending",
                title=f"Secure access to {project.name} is pending",
                body="A teammate who holds the project key will share it automatically the next "
                "time their vault is unlocked.",
                link=f"/w/{workspace_id}/projects/{project_id}",
            )
        else:
            notifications.notify(
                db,
                user_id=user_id,
                workspace_id=workspace_id,
                type="vault.setup_reminder",
                title=f"Set up your vault to read secure documents in {project.name}",
                link="/settings/vault",
            )


async def pending_projects_for(db: AsyncSession, user: User) -> int:
    """Projects with a key where this user is entitled but holds no current copy."""
    if await db.get(UserVault, user.id) is None:
        return 0
    workspace_ids = (
        (await db.execute(select(Membership.workspace_id).where(Membership.user_id == user.id)))
        .scalars()
        .all()
    )
    count = 0
    for wid in workspace_ids:
        snapshot = await secure_access_snapshot(db, wid)
        entitled_projects = [pid for pid, users in snapshot.items() if user.id in users]
        if not entitled_projects:
            continue
        projects = (
            (
                await db.execute(
                    select(Project).where(
                        Project.id.in_(entitled_projects), Project.key_version.is_not(None)
                    )
                )
            )
            .scalars()
            .all()
        )
        for p in projects:
            held = await db.get(ProjectKeyGrant, (p.id, p.key_version, user.id))
            if held is None:
                count += 1
    return count


async def member_vault_status(
    db: AsyncSession, workspace_id: uuid.UUID
) -> dict[uuid.UUID, tuple[str, str | None]]:
    """user id -> (status, public key) for the members list."""
    member_ids = set(
        (
            await db.execute(
                select(Membership.user_id).where(Membership.workspace_id == workspace_id)
            )
        )
        .scalars()
        .all()
    )
    keys = await vault_keys(db, member_ids)
    snapshot = await secure_access_snapshot(db, workspace_id)
    keyed = {
        p.id: p.key_version
        for p in (
            await db.execute(
                select(Project).where(
                    Project.workspace_id == workspace_id, Project.key_version.is_not(None)
                )
            )
        ).scalars()
    }
    held: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    if keyed:
        for g in (
            await db.execute(select(ProjectKeyGrant).where(ProjectKeyGrant.project_id.in_(keyed)))
        ).scalars():
            if keyed.get(g.project_id) == g.key_version:
                held[g.user_id].add(g.project_id)
    out: dict[uuid.UUID, tuple[str, str | None]] = {}
    for uid in member_ids:
        if uid not in keys:
            out[uid] = ("not_set_up", None)
            continue
        missing = [pid for pid in keyed if uid in snapshot.get(pid, set()) and pid not in held[uid]]
        out[uid] = ("pending" if missing else "ready", keys[uid])
    return out


async def secure_document_count(db: AsyncSession, project_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.project_id == project_id, Document.kind == "secure")
        )
        or 0
    )


async def workspace_names(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = await db.execute(select(Workspace.id, Workspace.name).where(Workspace.id.in_(ids)))
    return {r.id: r.name for r in rows}
