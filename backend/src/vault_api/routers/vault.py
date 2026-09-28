"""Vault endpoints: the user's encrypted keypair, project key grants, rotation, secure documents.

All cryptography happens in the browser. These handlers enforce *who* may store or receive
which opaque blob, and keep operations atomic so a project is never left half re-encrypted.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from vault_api.db import utcnow
from vault_api.deps import DB, CurrentAuth, Meta, WsCtx
from vault_api.models import (
    Document,
    DocumentVersion,
    Membership,
    Notification,
    Project,
    ProjectKeyGrant,
    User,
    UserVault,
)
from vault_api.permissions import Perm
from vault_api.schemas.common import Message
from vault_api.schemas.project import DocumentOut
from vault_api.schemas.vault import (
    GrantKeysIn,
    InitKeyIn,
    KdfParams,
    PendingWork,
    ProjectVaultState,
    ResetImpact,
    RotateIn,
    RotationItem,
    RotationMaterial,
    SecureDocumentCreate,
    SecureDocumentUpdate,
    VaultKeysIn,
    VaultOut,
    VaultPasswordIn,
    VaultRecoverIn,
    VaultRecoveryIn,
    VaultResetIn,
    VaultSummary,
)
from vault_api.services import audit, email, notifications, vault
from vault_api.services.access import get_project, secure_access_snapshot

from .documents import _document_out, _load

router = APIRouter(tags=["vault"])


def _out(v: UserVault) -> VaultOut:
    return VaultOut(
        user_id=v.user_id,
        public_key=v.public_key,
        kdf=KdfParams(algorithm="argon2id13", salt=v.kdf_salt, ops=v.kdf_ops, mem=v.kdf_mem),
        encrypted_private_key=v.encrypted_private_key,
        private_key_nonce=v.private_key_nonce,
        recovery_encrypted_private_key=v.recovery_encrypted_private_key,
        recovery_nonce=v.recovery_nonce,
        key_epoch=v.key_epoch,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


async def _my_vault(db: DB, user: User, *, lock: bool = False) -> UserVault:
    stmt = select(UserVault).where(UserVault.user_id == user.id)
    if lock:
        stmt = stmt.with_for_update()
    v = await db.scalar(stmt)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set up your vault first.")
    return v


def _apply_keys(v: UserVault, body: VaultKeysIn) -> None:
    v.public_key = body.public_key
    v.kdf_algorithm = body.kdf.algorithm
    v.kdf_salt = body.kdf.salt
    v.kdf_ops = body.kdf.ops
    v.kdf_mem = body.kdf.mem
    v.encrypted_private_key = body.encrypted_private_key
    v.private_key_nonce = body.private_key_nonce
    v.recovery_encrypted_private_key = body.recovery_encrypted_private_key
    v.recovery_nonce = body.recovery_nonce


def _require_same_key(v: UserVault, public_key: str) -> None:
    # Password changes and recovery re-wrap the *same* private key; the keypair never changes.
    if v.public_key != public_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your vault keys changed. Reload the page.")


# ---- The user's own vault ----------------------------------------------------------------------


@router.get("/vault")
async def get_vault(auth: CurrentAuth, db: DB) -> VaultOut | None:
    v = await db.get(UserVault, auth.user.id)
    return _out(v) if v else None


@router.get("/vault/summary")
async def vault_summary(auth: CurrentAuth, db: DB) -> VaultSummary:
    v = await db.get(UserVault, auth.user.id)
    return VaultSummary(
        has_vault=v is not None,
        public_key=v.public_key if v else None,
        pending_projects=await vault.pending_projects_for(db, auth.user),
    )


@router.post("/vault", status_code=status.HTTP_201_CREATED)
async def setup_vault(body: VaultKeysIn, auth: CurrentAuth, db: DB, meta: Meta) -> VaultOut:
    if await db.get(UserVault, auth.user.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your vault is already set up.")
    v = UserVault(user_id=auth.user.id, key_epoch=1)
    _apply_keys(v, body)
    db.add(v)
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == auth.user.id,
            Notification.type == "vault.setup_reminder",
            Notification.read_at.is_(None),
        )
        .values(read_at=utcnow())
    )
    audit.record(
        db,
        action="vault.setup",
        actor=auth.user,
        meta=meta,
        details={"kdf_ops": body.kdf.ops, "kdf_mem": body.kdf.mem},
    )
    await db.commit()
    return _out(v)


@router.put("/vault/password")
async def change_vault_password(
    body: VaultPasswordIn, auth: CurrentAuth, db: DB, meta: Meta
) -> VaultOut:
    v = await _my_vault(db, auth.user, lock=True)
    _require_same_key(v, body.public_key)
    v.kdf_algorithm, v.kdf_salt = body.kdf.algorithm, body.kdf.salt
    v.kdf_ops, v.kdf_mem = body.kdf.ops, body.kdf.mem
    v.encrypted_private_key, v.private_key_nonce = (
        body.encrypted_private_key,
        body.private_key_nonce,
    )
    audit.record(db, action="vault.password_changed", actor=auth.user, meta=meta)
    email.send_vault_event(db, auth.user.email, "password_changed")
    await db.commit()
    return _out(v)


@router.put("/vault/recovery")
async def regenerate_recovery(
    body: VaultRecoveryIn, auth: CurrentAuth, db: DB, meta: Meta
) -> VaultOut:
    v = await _my_vault(db, auth.user, lock=True)
    _require_same_key(v, body.public_key)
    v.recovery_encrypted_private_key = body.recovery_encrypted_private_key
    v.recovery_nonce = body.recovery_nonce
    audit.record(db, action="vault.recovery_regenerated", actor=auth.user, meta=meta)
    await db.commit()
    return _out(v)


@router.post("/vault/recover")
async def recover_vault(body: VaultRecoverIn, auth: CurrentAuth, db: DB, meta: Meta) -> VaultOut:
    """Forgot the vault password but has the recovery key: new password + new recovery key."""
    v = await _my_vault(db, auth.user, lock=True)
    _require_same_key(v, body.public_key)
    v.kdf_algorithm, v.kdf_salt = body.kdf.algorithm, body.kdf.salt
    v.kdf_ops, v.kdf_mem = body.kdf.ops, body.kdf.mem
    v.encrypted_private_key, v.private_key_nonce = (
        body.encrypted_private_key,
        body.private_key_nonce,
    )
    v.recovery_encrypted_private_key = body.recovery_encrypted_private_key
    v.recovery_nonce = body.recovery_nonce
    audit.record(db, action="vault.recovered", actor=auth.user, meta=meta)
    email.send_vault_event(db, auth.user.email, "recovered")
    await db.commit()
    return _out(v)


async def _held_projects(db: DB, user: User) -> list[Project]:
    rows = await db.execute(
        select(Project)
        .join(
            ProjectKeyGrant,
            (ProjectKeyGrant.project_id == Project.id)
            & (ProjectKeyGrant.key_version == Project.key_version),
        )
        .where(ProjectKeyGrant.user_id == user.id)
    )
    return list(rows.scalars())


@router.get("/vault/reset-impact")
async def reset_impact(auth: CurrentAuth, db: DB) -> list[ResetImpact]:
    projects = await _held_projects(db, auth.user)
    names = await vault.workspace_names(db, {p.workspace_id for p in projects})
    out: list[ResetImpact] = []
    for p in projects:
        others = [uid for uid in await vault.holders(db, p) if uid != auth.user.id]
        out.append(
            ResetImpact(
                workspace_id=p.workspace_id,
                workspace_name=names.get(p.workspace_id, ""),
                project_id=p.id,
                project_name=p.name,
                secure_document_count=await vault.secure_document_count(db, p.id),
                sole_holder=not others,
            )
        )
    return out


@router.post("/vault/reset")
async def reset_vault(body: VaultResetIn, auth: CurrentAuth, db: DB, meta: Meta) -> VaultOut:
    """Forgot everything: new keypair. Old sealed keys are discarded (treated as revocation)."""
    v = await _my_vault(db, auth.user, lock=True)
    held = await _held_projects(db, auth.user)
    await db.execute(delete(ProjectKeyGrant).where(ProjectKeyGrant.user_id == auth.user.id))
    for p in held:
        if await vault.holders(db, p):
            # Someone else still holds the key: rotate it, the old private key may be exposed.
            p.rotation_pending = True
            audit.record(
                db,
                action="vault.rotation_scheduled",
                actor=auth.user,
                meta=meta,
                workspace_id=p.workspace_id,
                project_id=p.id,
                target_type="project",
                target_id=p.id,
                target_label=p.name,
                details={"reason": "vault_reset"},
            )
        else:
            audit.record(
                db,
                action="vault.key_lost",
                actor=auth.user,
                meta=meta,
                workspace_id=p.workspace_id,
                project_id=p.id,
                target_type="project",
                target_id=p.id,
                target_label=p.name,
            )
    _apply_keys(v, body)
    v.key_epoch += 1
    audit.record(
        db, action="vault.reset", actor=auth.user, meta=meta, details={"key_epoch": v.key_epoch}
    )
    # Tell each workspace's admins: a teammate's key changed (they should re-verify it).
    workspace_ids = (
        (
            await db.execute(
                select(Membership.workspace_id).where(Membership.user_id == auth.user.id)
            )
        )
        .scalars()
        .all()
    )
    for wid in workspace_ids:
        audit.record(
            db,
            action="vault.key_changed",
            actor=auth.user,
            meta=meta,
            workspace_id=wid,
            target_type="user",
            target_id=auth.user.id,
            target_label=auth.user.email,
        )
        for admin_id in await notifications.workspace_admin_ids(db, wid):
            if admin_id != auth.user.id:
                notifications.notify(
                    db,
                    user_id=admin_id,
                    workspace_id=wid,
                    type="vault.key_changed",
                    title=f"{auth.user.name} reset their vault",
                    body="Their public key changed. Compare the new fingerprint with them before "
                    "trusting it.",
                    link=f"/w/{wid}/members",
                )
    email.send_vault_event(db, auth.user.email, "reset")
    await db.commit()
    return _out(v)


@router.get("/vault/pending-work")
async def pending_work(auth: CurrentAuth, db: DB) -> list[PendingWork]:
    """Grants and rotations this user's browser can complete right now."""
    out: list[PendingWork] = []
    held = await _held_projects(db, auth.user)
    names = await vault.workspace_names(db, {p.workspace_id for p in held})
    snapshots: dict[uuid.UUID, dict[uuid.UUID, set[uuid.UUID]]] = {}
    for p in held:
        if p.workspace_id not in snapshots:
            snapshots[p.workspace_id] = await secure_access_snapshot(db, p.workspace_id)
        entitled = snapshots[p.workspace_id].get(p.id, set())
        if auth.user.id not in entitled or p.key_version is None:
            continue
        current = await vault.holders(db, p)
        recipients = [r for r in await vault.recipients(db, p) if r.user_id not in current]
        if recipients or p.rotation_pending:
            out.append(
                PendingWork(
                    workspace_id=p.workspace_id,
                    workspace_name=names.get(p.workspace_id, ""),
                    project_id=p.id,
                    project_name=p.name,
                    key_version=p.key_version,
                    rotation_pending=p.rotation_pending,
                    recipients=recipients,
                )
            )
    return out


# ---- Project keys --------------------------------------------------------------------------------

PROJECT = "/workspaces/{workspace_id}/projects/{project_id}/vault"


@router.get(PROJECT)
async def project_vault(project_id: uuid.UUID, ctx: WsCtx, db: DB) -> ProjectVaultState:
    project = await get_project(ctx, db, project_id)
    entitled = await vault.entitled_user_ids(db, project)
    recipients = await vault.recipients(db, project)
    current = await vault.holders(db, project)
    has_vault = await db.get(UserVault, ctx.user.id) is not None
    mine = current.get(ctx.user.id)
    if ctx.user.id not in entitled:
        state = "no_permission"
    elif not has_vault:
        state = "no_vault"
    elif project.key_version is None:
        state = "uninitialized"
    elif mine is not None:
        state = "ready"
    elif not current:
        state = "lost"
    else:
        state = "pending"
    return ProjectVaultState(
        project_id=project.id,
        workspace_id=project.workspace_id,
        key_version=project.key_version,
        rotation_pending=project.rotation_pending,
        holders=len(current),
        my_state=state,
        my_sealed_key=mine.sealed_key if mine and ctx.user.id in entitled else None,
        recipients=recipients if ctx.user.id in entitled else [],
        missing=[r.user_id for r in recipients if r.user_id not in current],
    )


@router.post(f"{PROJECT}/init")
async def init_project_key(
    project_id: uuid.UUID, body: InitKeyIn, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    """The first secure document: the creator's browser made a key and sealed it for everyone."""
    ctx.require(Perm.SECURE_EDIT)
    project = await get_project(ctx, db, project_id, writable=True, lock=True)
    if project.key_version is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project already has a key. Reload.")
    if await db.get(UserVault, ctx.user.id) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Set up your vault first.")
    grants = await vault.validate_grants(db, project, body.grants, must_include=ctx.user.id)
    project.key_version = 1
    project.rotation_pending = False
    vault.add_grants(db, project, 1, grants, ctx.user)
    audit.record(
        db,
        action="vault.key_created",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="project",
        target_id=project.id,
        target_label=project.name,
        details={"key_version": 1, "recipients": len(grants)},
    )
    for g in grants:
        if g.user_id != ctx.user.id:
            _notify_granted(db, g.user_id, ctx.workspace.id, project)
    await db.commit()
    return Message(message="Project key created.")


def _notify_granted(db: DB, user_id: uuid.UUID, workspace_id: uuid.UUID, project: Project) -> None:
    notifications.notify(
        db,
        user_id=user_id,
        workspace_id=workspace_id,
        type="vault.access_granted",
        title=f"Secure access granted to {project.name}",
        body="You can now read and edit its secure documents.",
        link=f"/w/{workspace_id}/projects/{project.id}",
    )


@router.post(f"{PROJECT}/grants")
async def grant_project_key(
    project_id: uuid.UUID, body: GrantKeysIn, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    """A key holder's browser shares the current project key with pending members."""
    project = await get_project(ctx, db, project_id, lock=True)
    if project.key_version != body.key_version:
        raise HTTPException(status.HTTP_409_CONFLICT, "The project key changed. Reload.")
    await vault.require_holder(db, project, ctx.user)
    grants = await vault.validate_grants(db, project, body.grants, skip_existing=True)
    vault.add_grants(db, project, body.key_version, grants, ctx.user)
    for g in grants:
        audit.record(
            db,
            action="vault.key_granted",
            actor=ctx.user,
            meta=meta,
            workspace_id=ctx.workspace.id,
            project_id=project.id,
            target_type="user",
            target_id=g.user_id,
            details={"key_version": body.key_version},
        )
        _notify_granted(db, g.user_id, ctx.workspace.id, project)
    await db.commit()
    return Message(message=f"Shared the project key with {len(grants)} people.")


@router.get(f"{PROJECT}/rotation-material")
async def rotation_material(project_id: uuid.UUID, ctx: WsCtx, db: DB) -> RotationMaterial:
    project = await get_project(ctx, db, project_id)
    await vault.require_holder(db, project, ctx.user)
    assert project.key_version is not None
    rows = await db.execute(
        select(DocumentVersion, Document.format)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(Document.project_id == project.id, Document.kind == "secure")
        .order_by(DocumentVersion.document_id, DocumentVersion.version)
    )
    items = [
        RotationItem(
            document_id=v.document_id,
            version=v.version,
            format=fmt,
            ciphertext=v.ciphertext or "",
            nonce=v.nonce or "",
            key_version=v.key_version or 0,
        )
        for v, fmt in rows
    ]
    return RotationMaterial(key_version=project.key_version, items=items)


@router.post(f"{PROJECT}/rotate")
async def rotate_project_key(
    project_id: uuid.UUID, body: RotateIn, ctx: WsCtx, db: DB, meta: Meta
) -> Message:
    """Atomically swap every secure ciphertext of the project to a new key version.

    Either everything (all documents, all versions, new grants) is replaced in one transaction,
    or nothing is, so an interrupted rotation can never leave a project unreadable.
    """
    project = await get_project(ctx, db, project_id, lock=True)
    if project.key_version is None or project.key_version != body.from_version:
        raise HTTPException(status.HTTP_409_CONFLICT, "The project key changed. Reload.")
    await vault.require_holder(db, project, ctx.user)
    grants = await vault.validate_grants(db, project, body.grants, must_include=ctx.user.id)

    versions = (
        (
            await db.execute(
                select(DocumentVersion)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(Document.project_id == project.id, Document.kind == "secure")
                .with_for_update(of=DocumentVersion)
            )
        )
        .scalars()
        .all()
    )
    stored = {(v.document_id, v.version): v for v in versions}
    submitted = {(i.document_id, i.version): i for i in body.items}
    if len(submitted) != len(body.items) or set(stored) != set(submitted):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Documents changed during rotation. It will be retried."
        )

    new_version = project.key_version + 1
    for key, item in submitted.items():
        row = stored[key]
        row.ciphertext, row.nonce, row.key_version = item.ciphertext, item.nonce, new_version
    docs = (
        (
            await db.execute(
                select(Document)
                .where(Document.project_id == project.id, Document.kind == "secure")
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for doc in docs:
        current = submitted[(doc.id, doc.version)]
        doc.ciphertext, doc.nonce, doc.key_version = current.ciphertext, current.nonce, new_version

    # Old key versions are discarded: only the new version's sealed copies remain.
    await db.execute(delete(ProjectKeyGrant).where(ProjectKeyGrant.project_id == project.id))
    vault.add_grants(db, project, new_version, grants, ctx.user)
    project.key_version = new_version
    project.rotation_pending = False
    audit.record(
        db,
        action="vault.key_rotated",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="project",
        target_id=project.id,
        target_label=project.name,
        details={
            "key_version": new_version,
            "ciphertexts": len(submitted),
            "recipients": len(grants),
        },
    )
    await db.commit()
    return Message(message=f"Rotated the key for {project.name}.")


@router.post(f"{PROJECT}/abandon")
async def abandon_project_key(project_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    """When nobody holds the key any more, delete the unreadable secure documents and start over."""
    ctx.require(Perm.SECURE_DELETE)
    project = await get_project(ctx, db, project_id, writable=True, lock=True)
    if project.key_version is None or await vault.holders(db, project):
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone still holds this project's key.")
    count = await vault.secure_document_count(db, project.id)
    await db.execute(
        delete(Document).where(Document.project_id == project.id, Document.kind == "secure")
    )
    await db.execute(delete(ProjectKeyGrant).where(ProjectKeyGrant.project_id == project.id))
    project.key_version = None
    project.rotation_pending = False
    audit.record(
        db,
        action="vault.key_abandoned",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="project",
        target_id=project.id,
        target_label=project.name,
        details={"secure_documents_deleted": count},
    )
    await db.commit()
    return Message(message="Unreadable secure documents were deleted. You can start fresh.")


# ---- Secure documents ----------------------------------------------------------------------


async def _require_current_key(db: DB, ctx: WsCtx, project: Project, key_version: int) -> None:
    if project.key_version is None or key_version != project.key_version:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The project key was rotated. Reload to use the new key."
        )
    await vault.require_holder(db, project, ctx.user)


@router.post(
    "/workspaces/{workspace_id}/projects/{project_id}/secure-documents",
    status_code=status.HTTP_201_CREATED,
)
async def create_secure_document(
    project_id: uuid.UUID, body: SecureDocumentCreate, ctx: WsCtx, db: DB, meta: Meta
) -> DocumentOut:
    ctx.require(Perm.SECURE_EDIT)
    project = await get_project(ctx, db, project_id, writable=True, lock=True)
    await _require_current_key(db, ctx, project, body.key_version)
    now = utcnow()
    doc = Document(
        id=body.id,
        project_id=project.id,
        name=body.name,
        kind="secure",
        format=body.format,
        content=None,
        ciphertext=body.ciphertext,
        nonce=body.nonce,
        key_version=body.key_version,
        version=1,
        created_by_id=ctx.user.id,
        created_at=now,
        updated_by_id=ctx.user.id,
        updated_at=now,
    )
    db.add(doc)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Document id already used.") from exc
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=1,
            name=doc.name,
            ciphertext=body.ciphertext,
            nonce=body.nonce,
            key_version=body.key_version,
            created_by_id=ctx.user.id,
            created_at=now,
        )
    )
    project.last_activity_at = now
    audit.record(
        db,
        action="secure_document.created",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"format": doc.format},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)


@router.put("/workspaces/{workspace_id}/documents/{document_id}/secure")
async def save_secure_document(
    document_id: uuid.UUID, body: SecureDocumentUpdate, ctx: WsCtx, db: DB, meta: Meta
) -> DocumentOut:
    doc, project = await _load(ctx, db, document_id, writable=True, lock=True)
    if doc.kind != "secure":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a secure document.")
    ctx.require(Perm.SECURE_EDIT)
    await _require_current_key(db, ctx, project, body.key_version)
    if body.expected_version != doc.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Someone else saved this document in the meantime. Reload to see their changes.",
        )
    if body.restored_from is not None and not 1 <= body.restored_from <= doc.version:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown version.")
    now = utcnow()
    doc.version += 1
    if body.name is not None:
        doc.name = body.name
    doc.ciphertext, doc.nonce, doc.key_version = body.ciphertext, body.nonce, body.key_version
    doc.updated_at, doc.updated_by_id = now, ctx.user.id
    project.last_activity_at = now
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=doc.version,
            name=doc.name,
            ciphertext=body.ciphertext,
            nonce=body.nonce,
            key_version=body.key_version,
            restored_from=body.restored_from,
            created_by_id=ctx.user.id,
            created_at=now,
        )
    )
    action = "secure_document.restored" if body.restored_from else "secure_document.updated"
    audit.record(
        db,
        action=action,
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"version": doc.version, "restored_from": body.restored_from},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)
