"""Sign up, email verification, sign in (password and Google), password reset, sign out."""

import base64
import hashlib
import logging
import secrets
from contextlib import suppress
from datetime import timedelta
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, select

from vault_api.config import get_settings
from vault_api.db import utcnow
from vault_api.deps import DB, CurrentAuth, Meta
from vault_api.models import EmailToken, User, UserSession
from vault_api.schemas.auth import (
    Me,
    PublicConfig,
    ResetPasswordIn,
    SigninIn,
    SignupIn,
    TokenIn,
)
from vault_api.schemas.common import EmailIn, Message
from vault_api.security import ratelimit
from vault_api.security.passwords import hash_password, needs_rehash, verify_password
from vault_api.security.tokens import hash_token, sign_payload, verify_payload
from vault_api.services import audit, email
from vault_api.services.sessions import (
    clear_session_cookie,
    consume_email_token,
    issue_email_token,
    me,
    revoke_all_sessions,
    start_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("vault.auth")

GENERIC_EMAIL_SENT = "If that address can receive email from us, a message is on its way."


def _window(minutes: int) -> timedelta:
    return timedelta(minutes=minutes)


async def _limit_email_action(ip: str | None, address: str, action: str) -> None:
    s = get_settings()
    window = _window(s.email_action_window_minutes)
    await ratelimit.hit(f"{action}:ip:{ip}", s.email_action_limit * 4, window)
    await ratelimit.hit(f"{action}:email:{hash_token(address)}", s.email_action_limit, window)


@router.get("/config")
async def public_config() -> PublicConfig:
    s = get_settings()
    return PublicConfig(app_name=s.app_name, google_enabled=s.google_enabled)


@router.get("/me")
async def get_me(auth: CurrentAuth) -> Me:
    return me(auth.user)


@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
async def signup(body: SignupIn, db: DB, meta: Meta) -> Message:
    await _limit_email_action(meta.ip, body.email, "signup")
    if body.password.strip().lower() == body.email:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Your password must not be your email address."
        )
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        # Same response either way so sign-up cannot be used to discover accounts.
        if existing.email_verified_at is None and existing.google_sub is None:
            # Re-sign-up of an unverified account: the password travels with this token, so the
            # password that becomes active is the one chosen by whoever proves the mailbox.
            token = await issue_email_token(
                db,
                existing,
                "verify_email",
                timedelta(hours=get_settings().email_verification_ttl_hours),
                password_hash=hash_password(body.password),
            )
            email.send_verification(db, existing.email, body.name, token)
        else:
            email.send_account_exists(db, existing.email)
        await db.commit()
        return Message(message=GENERIC_EMAIL_SENT)

    password_hash = hash_password(body.password)
    user = User(
        email=body.email, name=body.name, password_hash=password_hash, password_changed_at=utcnow()
    )
    db.add(user)
    await db.flush()
    token = await issue_email_token(
        db,
        user,
        "verify_email",
        timedelta(hours=get_settings().email_verification_ttl_hours),
        password_hash=password_hash,
    )
    email.send_verification(db, user.email, user.name, token)
    audit.record(db, action="auth.sign_up", actor=user, meta=meta, details={"method": "password"})
    await db.commit()
    return Message(message=GENERIC_EMAIL_SENT)


@router.post("/verify-email")
async def verify_email(body: TokenIn, db: DB, meta: Meta, response: Response) -> Me:
    await ratelimit.hit(f"verify:ip:{meta.ip}", get_settings().token_submit_ip_limit, _window(15))
    consumed = await consume_email_token(db, body.token, "verify_email")
    if consumed is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "This verification link is invalid or has expired."
        )
    user, record = consumed
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
        if record.password_hash is not None:
            user.password_hash = record.password_hash
            user.password_changed_at = utcnow()
    audit.record(db, action="auth.email_verified", actor=user, meta=meta)
    await start_session(db, response, user, meta, "email_verification")
    return me(user)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(body: EmailIn, db: DB, meta: Meta) -> Message:
    await _limit_email_action(meta.ip, body.email, "verify_resend")
    user = await db.scalar(select(User).where(User.email == body.email))
    if user is not None and user.email_verified_at is None:
        latest = await db.scalar(
            select(EmailToken.password_hash)
            .where(EmailToken.user_id == user.id, EmailToken.purpose == "verify_email")
            .order_by(EmailToken.created_at.desc())
            .limit(1)
        )
        token = await issue_email_token(
            db,
            user,
            "verify_email",
            timedelta(hours=get_settings().email_verification_ttl_hours),
            password_hash=latest,
        )
        email.send_verification(db, user.email, user.name, token)
        await db.commit()
    return Message(message=GENERIC_EMAIL_SENT)


@router.post("/signin")
async def signin(body: SigninIn, db: DB, meta: Meta, response: Response) -> Me:
    s = get_settings()
    window = _window(s.signin_window_minutes)
    await ratelimit.hit(f"signin:ip:{meta.ip}", s.signin_ip_limit, window)
    # Lockout is keyed on the submitted address, not the account, so it behaves identically
    # for addresses that do not exist.
    email_key = f"signin:email:{hash_token(body.email)}"
    retry = await ratelimit.is_limited(email_key, s.signin_email_failure_limit, window)
    if retry is not None:
        raise ratelimit.RateLimited(retry)

    user = await db.scalar(select(User).where(User.email == body.email))
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        with suppress(ratelimit.RateLimited):
            await ratelimit.hit(email_key, s.signin_email_failure_limit, window)
        await audit.record_now(
            action="auth.sign_in",
            actor=user,
            actor_email=body.email,
            meta=meta,
            result="failure",
            details={"method": "password"},
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")

    if user.email_verified_at is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Please verify your email address before signing in."
        )
    await ratelimit.reset(email_key)
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    await start_session(db, response, user, meta, "password")
    return me(user)


@router.post("/signout")
async def signout(auth: CurrentAuth, db: DB, meta: Meta, response: Response) -> Message:
    await db.execute(delete(UserSession).where(UserSession.id == auth.session.id))
    audit.record(db, action="auth.sign_out", actor=auth.user, meta=meta)
    await db.commit()
    clear_session_cookie(response)
    return Message(message="Signed out.")


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: EmailIn, db: DB, meta: Meta) -> Message:
    await _limit_email_action(meta.ip, body.email, "reset")
    user = await db.scalar(select(User).where(User.email == body.email))
    if user is not None:
        token = await issue_email_token(
            db, user, "reset_password", timedelta(minutes=get_settings().password_reset_ttl_minutes)
        )
        email.send_password_reset(db, user.email, token)
        audit.record(db, action="auth.password_reset_requested", actor=user, meta=meta)
        await db.commit()
    return Message(message=GENERIC_EMAIL_SENT)


@router.post("/reset-password")
async def reset_password(body: ResetPasswordIn, db: DB, meta: Meta) -> Message:
    await ratelimit.hit(
        f"reset_submit:ip:{meta.ip}", get_settings().token_submit_ip_limit, _window(15)
    )
    consumed = await consume_email_token(db, body.token, "reset_password")
    if consumed is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired."
        )
    user = consumed[0]
    user.password_hash = hash_password(body.password)
    user.password_changed_at = utcnow()
    # Following the link proves control of the mailbox.
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    await revoke_all_sessions(db, user)
    email.send_password_changed(db, user.email)
    audit.record(db, action="auth.password_reset", actor=user, meta=meta)
    await db.commit()
    await ratelimit.reset(f"signin:email:{hash_token(user.email)}")
    return Message(message="Your password has been reset. You can sign in now.")


# ---- Google sign-in (OAuth 2.0 authorization code flow with PKCE) -----------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - URL, not a secret
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _redirect_uri() -> str:
    return get_settings().app_url.rstrip("/") + "/api/auth/google/callback"


def _safe_next(value: str | None) -> str:
    """Only allow same-site relative paths, preventing open redirects."""
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    return "/"


def _fail(message: str) -> RedirectResponse:
    target = get_settings().app_url.rstrip("/") + "/login?" + urlencode({"error": message})
    return RedirectResponse(target, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/google/start", include_in_schema=False)
async def google_start(meta: Meta, next: Annotated[str | None, Query()] = None) -> RedirectResponse:
    s = get_settings()
    if not s.google_enabled or not s.google_client_id:
        return _fail("Google sign-in is not configured.")
    await ratelimit.hit(f"google:ip:{meta.ip}", 30, _window(15))
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge.decode(),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=303)
    cookie = sign_payload({"state": state, "verifier": verifier, "next": _safe_next(next)}, 600)
    response.set_cookie(
        s.oauth_cookie_name,
        cookie,
        max_age=600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/google/callback", include_in_schema=False)
async def google_callback(request: Request, db: DB, meta: Meta) -> RedirectResponse:
    s = get_settings()
    stored = verify_payload(request.cookies.get(s.oauth_cookie_name, ""))
    state = request.query_params.get("state")
    code = request.query_params.get("code")
    if not stored or not state or not code or not secrets.compare_digest(stored["state"], state):
        return _fail("Google sign-in failed. Please try again.")
    if not s.google_client_id or not s.google_client_secret:
        return _fail("Google sign-in is not configured.")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": s.google_client_id,
                    "client_secret": s.google_client_secret.get_secret_value(),
                    "code": code,
                    "code_verifier": stored["verifier"],
                    "grant_type": "authorization_code",
                    "redirect_uri": _redirect_uri(),
                },
            )
            token_res.raise_for_status()
            access_token = token_res.json()["access_token"]
            info_res = await client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            info_res.raise_for_status()
            info = info_res.json()
    except (httpx.HTTPError, KeyError, ValueError):
        log.warning("Google token exchange failed")
        return _fail("Google sign-in failed. Please try again.")

    sub = str(info.get("sub", ""))
    address = str(info.get("email", "")).strip().lower()
    if not sub or not address or info.get("email_verified") is not True:
        return _fail("Your Google account email address is not verified.")

    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == address))
        if user is not None:
            if user.email_verified_at is None:
                # An unverified account with this address was never proven to belong to anyone.
                # Drop its password so whoever registered it cannot sign in to the linked account.
                user.password_hash = None
                user.email_verified_at = utcnow()
                await revoke_all_sessions(db, user)
            user.google_sub = sub
            audit.record(db, action="auth.google_linked", actor=user, meta=meta)
        else:
            name = str(info.get("name") or address.split("@")[0])[:120]
            user = User(email=address, name=name, google_sub=sub, email_verified_at=utcnow())
            db.add(user)
            await db.flush()
            audit.record(
                db, action="auth.sign_up", actor=user, meta=meta, details={"method": "google"}
            )

    response = RedirectResponse(s.app_url.rstrip("/") + stored["next"], status_code=303)
    response.delete_cookie(s.oauth_cookie_name, path="/")
    await start_session(db, response, user, meta, "google")
    return response
