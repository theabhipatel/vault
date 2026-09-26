"""The signed-in user's own account: profile, avatar, password, sessions and deletion."""

import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import aliased, undefer

from vault_api.config import get_settings
from vault_api.db import utcnow
from vault_api.deps import DB, CurrentAuth, Meta
from vault_api.models import AuditLog, Membership, User, UserSession, Workspace
from vault_api.schemas.auth import (
    AccountActivity,
    ChangePasswordIn,
    DeleteAccountIn,
    Me,
    ProfileUpdate,
    SessionOut,
)
from vault_api.schemas.common import Message
from vault_api.security import ratelimit
from vault_api.security.passwords import hash_password, verify_password
from vault_api.services import audit, email
from vault_api.services.access import apply_secure_access_changes, secure_access_snapshot
from vault_api.services.sessions import clear_session_cookie, me, revoke_all_sessions

router = APIRouter(prefix="/account", tags=["account"])
users_router = APIRouter(prefix="/users", tags=["account"])

# Magic bytes of the image formats we accept; the declared content type is not trusted.
IMAGE_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
}


def _sniff_image(data: bytes) -> str | None:
    for content_type, signatures in IMAGE_SIGNATURES.items():
        if any(data.startswith(sig) for sig in signatures):
            if content_type == "image/webp" and data[8:12] != b"WEBP":
                continue
            return content_type
    return None


@router.patch("")
async def update_profile(body: ProfileUpdate, auth: CurrentAuth, db: DB, meta: Meta) -> Me:
    user = auth.user
    changed: list[str] = []
    if body.name is not None and body.name != user.name:
        user.name = body.name
        changed.append("name")
    if body.theme is not None:
        user.theme = body.theme
    if changed:
        audit.record(
            db, action="account.profile_updated", actor=user, meta=meta, details={"fields": changed}
        )
    await db.commit()
    return me(user)


@router.put("/avatar")
async def upload_avatar(file: Annotated[UploadFile, File()], auth: CurrentAuth, db: DB) -> Me:
    limit = get_settings().max_avatar_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Images must be under 1 MB.")
    content_type = _sniff_image(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Use a PNG, JPEG, GIF or WebP image."
        )
    user = auth.user
    user.avatar = data
    user.avatar_content_type = content_type
    user.avatar_updated_at = utcnow()
    await db.commit()
    return me(user)


@router.delete("/avatar")
async def delete_avatar(auth: CurrentAuth, db: DB) -> Me:
    user = auth.user
    user.avatar = None
    user.avatar_content_type = None
    user.avatar_updated_at = None
    await db.commit()
    return me(user)


@users_router.get("/{user_id}/avatar", include_in_schema=False)
async def get_avatar(user_id: uuid.UUID, auth: CurrentAuth, db: DB) -> Response:
    if user_id != auth.user.id:
        mine = aliased(Membership)
        theirs = aliased(Membership)
        shares_workspace = await db.scalar(
            select(func.count())
            .select_from(mine)
            .join(theirs, theirs.workspace_id == mine.workspace_id)
            .where(mine.user_id == auth.user.id, theirs.user_id == user_id)
        )
        if not shares_workspace:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    user = await db.scalar(select(User).options(undefer(User.avatar)).where(User.id == user_id))
    if user is None or user.avatar is None or user.avatar_content_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return Response(
        user.avatar,
        media_type=user.avatar_content_type,
        headers={
            "Cache-Control": "private, max-age=86400, immutable",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.post("/password")
async def change_password(body: ChangePasswordIn, auth: CurrentAuth, db: DB, meta: Meta) -> Message:
    user = auth.user
    await ratelimit.hit(f"change_password:user:{user.id}", 10, timedelta(minutes=15))
    if user.password_hash is not None and not verify_password(
        user.password_hash, body.current_password or ""
    ):
        await audit.record_now(
            action="account.password_changed", actor=user, meta=meta, result="failure"
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = utcnow()
    await revoke_all_sessions(db, user, except_id=auth.session.id)
    email.send_password_changed(db, user.email)
    audit.record(db, action="account.password_changed", actor=user, meta=meta)
    await db.commit()
    return Message(message="Password updated. Your other sessions were signed out.")


@router.get("/sessions")
async def list_sessions(auth: CurrentAuth, db: DB) -> list[SessionOut]:
    rows = (
        await db.execute(
            select(UserSession)
            .where(UserSession.user_id == auth.user.id)
            .order_by(UserSession.last_seen_at.desc())
        )
    ).scalars()
    return [
        SessionOut(
            id=s.id,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            ip=str(s.ip) if s.ip else None,
            user_agent=s.user_agent,
            current=s.id == auth.session.id,
        )
        for s in rows
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: uuid.UUID, auth: CurrentAuth, db: DB, meta: Meta, response: Response
) -> Message:
    result = await db.execute(
        delete(UserSession).where(UserSession.id == session_id, UserSession.user_id == auth.user.id)
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    audit.record(db, action="auth.session_revoked", actor=auth.user, meta=meta)
    await db.commit()
    if session_id == auth.session.id:
        clear_session_cookie(response)
    return Message(message="Signed out that device.")


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(auth: CurrentAuth, db: DB, meta: Meta) -> Message:
    await revoke_all_sessions(db, auth.user, except_id=auth.session.id)
    audit.record(db, action="auth.sessions_revoked_others", actor=auth.user, meta=meta)
    await db.commit()
    return Message(message="Signed out all other devices.")


@router.get("/activity")
async def account_activity(auth: CurrentAuth, db: DB) -> list[AccountActivity]:
    rows = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.actor_id == auth.user.id,
                AuditLog.action.like("auth.%") | AuditLog.action.like("account.%"),
            )
            .order_by(AuditLog.id.desc())
            .limit(50)
        )
    ).scalars()
    return [
        AccountActivity(
            id=r.id,
            created_at=r.created_at,
            action=r.action,
            result=r.result,
            ip=str(r.ip) if r.ip else None,
            user_agent=r.user_agent,
        )
        for r in rows
    ]


@router.post("/delete")
async def delete_account(
    body: DeleteAccountIn, auth: CurrentAuth, db: DB, meta: Meta, response: Response
) -> Message:
    user = auth.user
    if body.confirm_email.strip().lower() != user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type your email address to confirm.")
    if user.password_hash is not None and not verify_password(
        user.password_hash, body.password or ""
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your password is incorrect.")

    owned = (
        (await db.execute(select(Workspace).where(Workspace.owner_id == user.id))).scalars().all()
    )
    blocking: list[str] = []
    for ws in owned:
        others = await db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(Membership.workspace_id == ws.id, Membership.user_id != user.id)
        )
        if others:
            blocking.append(ws.name)
    if blocking:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Transfer ownership or remove the other members first: " + ", ".join(blocking),
        )

    for ws in owned:
        audit.record(
            db,
            action="workspace.deleted",
            actor=user,
            meta=meta,
            workspace_id=ws.id,
            target_type="workspace",
            target_id=ws.id,
            target_label=ws.name,
            details={"reason": "account_deleted"},
        )
        await db.delete(ws)
    await db.flush()

    # Leaving shared workspaces removes secure access, which triggers revocation there.
    memberships = (
        (await db.execute(select(Membership).where(Membership.user_id == user.id))).scalars().all()
    )
    for m in memberships:
        before = await secure_access_snapshot(db, m.workspace_id)
        await db.delete(m)
        await db.flush()
        audit.record(
            db,
            action="member.left",
            actor=user,
            meta=meta,
            workspace_id=m.workspace_id,
            target_type="user",
            target_id=user.id,
            target_label=user.email,
            details={"reason": "account_deleted"},
        )
        await apply_secure_access_changes(db, m.workspace_id, before, actor=user, meta=meta)

    audit.record(db, action="account.deleted", actor=user, meta=meta)
    await db.delete(user)
    await db.commit()
    clear_session_cookie(response)
    return Message(message="Your account has been deleted.")
