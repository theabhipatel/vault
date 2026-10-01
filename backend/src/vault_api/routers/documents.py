"""Documents, version history, search and recent documents.

Normal documents are protected by access control only and stored readable by the server.
Secure documents are end-to-end encrypted in the browser and handled by the vault endpoints.
"""

import uuid
from collections.abc import Sequence

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from vault_api.db import utcnow
from vault_api.deps import DB, Meta, WorkspaceContext, WsCtx
from vault_api.models import Document, DocumentVersion, Project
from vault_api.permissions import Perm
from vault_api.schemas.common import Message
from vault_api.schemas.project import (
    DocumentCreate,
    DocumentOut,
    DocumentSummary,
    DocumentUpdate,
    RestoreIn,
    SearchResults,
    VersionOut,
    VersionSummary,
)
from vault_api.services import audit
from vault_api.services.access import accessible_project_ids, get_project
from vault_api.services.audit import RequestMeta
from vault_api.services.users import escape_like, user_refs

from .projects import project_outs

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["documents"])

VIEW_PERM = {"normal": Perm.DOCS_VIEW, "secure": Perm.SECURE_VIEW}
EDIT_PERM = {"normal": Perm.DOCS_EDIT, "secure": Perm.SECURE_EDIT}
DELETE_PERM = {"normal": Perm.DOCS_DELETE, "secure": Perm.SECURE_DELETE}


def visible_kinds(ctx: WorkspaceContext) -> list[str]:
    return [kind for kind, perm in VIEW_PERM.items() if ctx.actor.has(perm)]


async def summaries(db: DB, rows: Sequence[tuple[Document, str]]) -> list[DocumentSummary]:
    refs = await user_refs(db, [i for d, _ in rows for i in (d.created_by_id, d.updated_by_id)])
    return [
        DocumentSummary(
            id=d.id,
            project_id=d.project_id,
            project_name=pname,
            name=d.name,
            kind=d.kind,
            format=d.format,
            version=d.version,
            created_at=d.created_at,
            created_by=refs.get(d.created_by_id) if d.created_by_id else None,
            updated_at=d.updated_at,
            updated_by=refs.get(d.updated_by_id) if d.updated_by_id else None,
        )
        for d, pname in rows
    ]


async def _document_out(
    ctx: WorkspaceContext, db: DB, doc: Document, project: Project
) -> DocumentOut:
    summary = (await summaries(db, [(doc, project.name)]))[0]
    writable = project.archived_at is None
    return DocumentOut(
        **summary.model_dump(),
        content=doc.content if doc.kind == "normal" else None,
        ciphertext=doc.ciphertext if doc.kind == "secure" else None,
        nonce=doc.nonce if doc.kind == "secure" else None,
        key_version=doc.key_version if doc.kind == "secure" else None,
        can_edit=writable and ctx.actor.has(EDIT_PERM[doc.kind]),
        can_delete=writable and ctx.actor.has(DELETE_PERM[doc.kind]),
    )


async def _load(
    ctx: WorkspaceContext,
    db: DB,
    document_id: uuid.UUID,
    *,
    writable: bool = False,
    lock: bool = False,
) -> tuple[Document, Project]:
    stmt = (
        select(Document, Project)
        .join(Project, Project.id == Document.project_id)
        .where(Document.id == document_id, Project.workspace_id == ctx.workspace.id)
    )
    if lock:
        stmt = stmt.with_for_update(of=Document)
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    doc, _ = row
    project = await get_project(ctx, db, doc.project_id, writable=writable)
    if not ctx.actor.has(VIEW_PERM[doc.kind]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    return doc, project


async def _load_for_read(
    ctx: WorkspaceContext, db: DB, document_id: uuid.UUID, meta: RequestMeta
) -> tuple[Document, Project]:
    """`_load` for reads. Refused attempts to read a secure document are audited."""
    try:
        return await _load(ctx, db, document_id)
    except HTTPException as exc:
        doc = await db.scalar(
            select(Document)
            .join(Project, Project.id == Document.project_id)
            .where(Document.id == document_id, Project.workspace_id == ctx.workspace.id)
        )
        if doc is not None and doc.kind == "secure":
            await audit.record_now(
                action="secure_document.access_denied",
                actor=ctx.user,
                meta=meta,
                workspace_id=ctx.workspace.id,
                project_id=doc.project_id,
                target_type="document",
                target_id=doc.id,
                target_label=doc.name,
                result="denied",
                details={"status": exc.status_code},
            )
        raise


@router.get("/projects/{project_id}/documents")
async def list_documents(project_id: uuid.UUID, ctx: WsCtx, db: DB) -> list[DocumentSummary]:
    project = await get_project(ctx, db, project_id)
    docs = (
        (
            await db.execute(
                select(Document)
                .where(Document.project_id == project.id, Document.kind.in_(visible_kinds(ctx)))
                .order_by(Document.updated_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return await summaries(db, [(d, project.name) for d in docs])


@router.post("/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
async def create_document(
    project_id: uuid.UUID, body: DocumentCreate, ctx: WsCtx, db: DB, meta: Meta
) -> DocumentOut:
    project = await get_project(ctx, db, project_id, writable=True)
    ctx.require(EDIT_PERM[body.kind])
    if body.kind == "secure":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Secure documents are created through the vault."
        )
    if body.format == "env":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The .env format is only available for secure documents.",
        )
    now = utcnow()
    doc = Document(
        project_id=project.id,
        name=body.name,
        kind="normal",
        format=body.format,
        content=body.content,
        version=1,
        created_by_id=ctx.user.id,
        created_at=now,
        updated_by_id=ctx.user.id,
        updated_at=now,
    )
    db.add(doc)
    await db.flush()
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=1,
            name=doc.name,
            content=doc.content,
            created_by_id=ctx.user.id,
            created_at=now,
        )
    )
    project.last_activity_at = now
    audit.record(
        db,
        action="document.created",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"kind": doc.kind, "format": doc.format},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)


@router.get("/documents/recent")
async def recent_documents(
    ctx: WsCtx, db: DB, limit: int = Query(default=8, ge=1, le=50)
) -> list[DocumentSummary]:
    ids = await accessible_project_ids(ctx, db)
    rows = (
        await db.execute(
            select(Document, Project.name)
            .join(Project, Project.id == Document.project_id)
            .where(
                Document.project_id.in_(ids),
                Document.kind.in_(visible_kinds(ctx)),
                Project.archived_at.is_(None),
            )
            .order_by(Document.updated_at.desc())
            .limit(limit)
        )
    ).all()
    return await summaries(db, rows)


@router.get("/documents/{document_id}")
async def get_document(document_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> DocumentOut:
    doc, project = await _load_for_read(ctx, db, document_id, meta)
    # Secure views are logged when the ciphertext is fetched (the server can't see decryption).
    audit.record(
        db,
        action="secure_document.viewed" if doc.kind == "secure" else "document.viewed",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"kind": doc.kind},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)


@router.patch("/documents/{document_id}")
async def update_document(
    document_id: uuid.UUID, body: DocumentUpdate, ctx: WsCtx, db: DB, meta: Meta
) -> DocumentOut:
    doc, project = await _load(ctx, db, document_id, writable=True, lock=True)
    ctx.require(EDIT_PERM[doc.kind])
    if doc.kind == "secure" and body.content is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Secure content is saved through the vault.")
    if body.expected_version != doc.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Someone else saved this document in the meantime. Reload to see their changes.",
        )
    if doc.kind == "secure":
        # Names are not encrypted. Renaming doesn't create a new encrypted version, because
        # each ciphertext is bound to its version number.
        if body.name is not None and body.name != doc.name:
            audit.record(
                db,
                action="secure_document.renamed",
                actor=ctx.user,
                meta=meta,
                workspace_id=ctx.workspace.id,
                project_id=project.id,
                target_type="document",
                target_id=doc.id,
                target_label=body.name,
                details={"from": doc.name},
            )
            doc.name = body.name
            doc.updated_at = utcnow()
            doc.updated_by_id = ctx.user.id
            await db.commit()
        return await _document_out(ctx, db, doc, project)
    changed: list[str] = []
    if body.name is not None and body.name != doc.name:
        doc.name = body.name
        changed.append("name")
    if body.content is not None and body.content != doc.content:
        doc.content = body.content
        changed.append("content")
    if not changed:
        return await _document_out(ctx, db, doc, project)
    now = utcnow()
    doc.version += 1
    doc.updated_at = now
    doc.updated_by_id = ctx.user.id
    project.last_activity_at = now
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=doc.version,
            name=doc.name,
            content=doc.content,
            created_by_id=ctx.user.id,
            created_at=now,
        )
    )
    audit.record(
        db,
        action="document.updated",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"fields": changed, "version": doc.version},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)


@router.delete("/documents/{document_id}")
async def delete_document(document_id: uuid.UUID, ctx: WsCtx, db: DB, meta: Meta) -> Message:
    doc, project = await _load(ctx, db, document_id, writable=True, lock=True)
    ctx.require(DELETE_PERM[doc.kind])
    audit.record(
        db,
        action="secure_document.deleted" if doc.kind == "secure" else "document.deleted",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"kind": doc.kind},
    )
    project.last_activity_at = utcnow()
    await db.delete(doc)
    await db.commit()
    return Message(message=f"{doc.name} was deleted.")


@router.get("/documents/{document_id}/versions")
async def list_versions(document_id: uuid.UUID, ctx: WsCtx, db: DB) -> list[VersionSummary]:
    doc, _ = await _load(ctx, db, document_id)
    versions = (
        (
            await db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .order_by(DocumentVersion.version.desc())
            )
        )
        .scalars()
        .all()
    )
    refs = await user_refs(db, (v.created_by_id for v in versions))
    return [
        VersionSummary(
            version=v.version,
            name=v.name,
            created_at=v.created_at,
            created_by=refs.get(v.created_by_id) if v.created_by_id else None,
            restored_from=v.restored_from,
        )
        for v in versions
    ]


async def _version(db: DB, doc: Document, version: int) -> DocumentVersion:
    v = await db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc.id, DocumentVersion.version == version
        )
    )
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found.")
    return v


@router.get("/documents/{document_id}/versions/{version}")
async def get_version(
    document_id: uuid.UUID, version: int, ctx: WsCtx, db: DB, meta: Meta
) -> VersionOut:
    doc, project = await _load_for_read(ctx, db, document_id, meta)
    v = await _version(db, doc, version)
    secure = doc.kind == "secure"
    audit.record(
        db,
        action="secure_document.version_viewed" if secure else "document.version_viewed",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"version": v.version, "current_version": doc.version}
        | ({"key_version": v.key_version} if secure else {}),
    )
    await db.commit()
    refs = await user_refs(db, [v.created_by_id])
    return VersionOut(
        version=v.version,
        name=v.name,
        created_at=v.created_at,
        created_by=refs.get(v.created_by_id) if v.created_by_id else None,
        restored_from=v.restored_from,
        content=v.content if doc.kind == "normal" else None,
        ciphertext=v.ciphertext if doc.kind == "secure" else None,
        nonce=v.nonce if doc.kind == "secure" else None,
        key_version=v.key_version if doc.kind == "secure" else None,
    )


@router.post("/documents/{document_id}/versions/{version}/restore")
async def restore_version(
    document_id: uuid.UUID, version: int, body: RestoreIn, ctx: WsCtx, db: DB, meta: Meta
) -> DocumentOut:
    doc, project = await _load(ctx, db, document_id, writable=True, lock=True)
    ctx.require(EDIT_PERM[doc.kind])
    if doc.kind == "secure":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Secure versions are restored through the vault."
        )
    if body.expected_version != doc.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "The document changed. Reload and try again.")
    old = await _version(db, doc, version)
    now = utcnow()
    doc.version += 1
    doc.name = old.name
    doc.content = old.content
    doc.updated_at = now
    doc.updated_by_id = ctx.user.id
    project.last_activity_at = now
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version=doc.version,
            name=doc.name,
            content=doc.content,
            created_by_id=ctx.user.id,
            created_at=now,
            restored_from=old.version,
        )
    )
    audit.record(
        db,
        action="document.restored",
        actor=ctx.user,
        meta=meta,
        workspace_id=ctx.workspace.id,
        project_id=project.id,
        target_type="document",
        target_id=doc.id,
        target_label=doc.name,
        details={"restored_from": old.version, "version": doc.version},
    )
    await db.commit()
    return await _document_out(ctx, db, doc, project)


@router.get("/search")
async def search(ctx: WsCtx, db: DB, q: str = Query(min_length=1, max_length=100)) -> SearchResults:
    """Name search only. Secure document content is never searchable by the server."""
    ids = await accessible_project_ids(ctx, db)
    pattern = f"%{escape_like(q.strip())}%"
    projects = (
        (
            await db.execute(
                select(Project)
                .where(Project.id.in_(ids), Project.name.ilike(pattern, escape="\\"))
                .order_by(Project.archived_at.is_not(None), func.lower(Project.name))
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    docs = (
        await db.execute(
            select(Document, Project.name)
            .join(Project, Project.id == Document.project_id)
            .where(
                Document.project_id.in_(ids),
                Document.kind.in_(visible_kinds(ctx)),
                Document.name.ilike(pattern, escape="\\"),
            )
            .order_by(Document.updated_at.desc())
            .limit(20)
        )
    ).all()
    return SearchResults(
        projects=await project_outs(ctx, db, projects), documents=await summaries(db, docs)
    )
