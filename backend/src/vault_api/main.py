"""FastAPI application: middleware, error handling, background workers and routes."""

import asyncio
import logging
import secrets
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from datetime import timedelta
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import delete, update

from vault_api.config import get_settings
from vault_api.db import SessionLocal, utcnow
from vault_api.models import EmailToken, Invitation, UserSession
from vault_api.permissions import PermissionDenied
from vault_api.routers import (
    account,
    activity,
    auth,
    documents,
    invitations,
    projects,
    roles,
    vault,
    workspaces,
)
from vault_api.security import ratelimit
from vault_api.services import email

log = logging.getLogger("vault")
settings = get_settings()

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-csrf-token"
MAX_BODY_BYTES = 8 * 1024 * 1024
# Key rotation re-uploads every secure ciphertext (and version) of a project in one request.
MAX_ROTATION_BODY_BYTES = 256 * 1024 * 1024


async def housekeeping(stop: asyncio.Event, interval: float = 600) -> None:
    while not stop.is_set():
        try:
            async with SessionLocal() as db:
                now = utcnow()
                await db.execute(delete(UserSession).where(UserSession.expires_at < now))
                await db.execute(
                    delete(EmailToken).where(EmailToken.expires_at < now - timedelta(days=7))
                )
                await db.execute(
                    update(Invitation)
                    .where(Invitation.status == "pending", Invitation.expires_at < now)
                    .values(status="expired")
                )
                await ratelimit.purge_expired(db, timedelta(days=1))
                await db.commit()
        except Exception:
            log.exception("Housekeeping failed")
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    stop = asyncio.Event()
    tasks: list[asyncio.Task[None]] = []
    if settings.email_worker_enabled and settings.environment != "test":
        tasks.append(asyncio.create_task(email.run_worker(stop)))
        tasks.append(asyncio.create_task(housekeeping(stop)))
    yield
    stop.set()
    for task in tasks:
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Vault API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.environment != "production" else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_url.rstrip("/")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

_app_origin = "{0.scheme}://{0.netloc}".format(urlsplit(settings.app_url))


def _forbidden(message: str) -> JSONResponse:
    return JSONResponse({"detail": message}, status_code=status.HTTP_403_FORBIDDEN)


@app.middleware("http")
async def security_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    is_api = request.url.path.startswith("/api/")
    if is_api and request.method not in SAFE_METHODS:
        length = request.headers.get("content-length")
        limit = (
            MAX_ROTATION_BODY_BYTES
            if request.url.path.endswith("/vault/rotate")
            else MAX_BODY_BYTES
        )
        if length and length.isdigit() and int(length) > limit:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
        # 1) The request must come from our own origin.
        origin = request.headers.get("origin")
        if origin is not None and origin != _app_origin:
            return _forbidden("Cross-origin request blocked.")
        # 2) Double-submit token: only same-origin JavaScript can read the cookie to echo it.
        cookie = request.cookies.get(settings.csrf_cookie_name)
        header = request.headers.get(CSRF_HEADER)
        if not cookie or not header or not secrets.compare_digest(cookie, header):
            return _forbidden(
                "Your session security token is missing. Reload the page and try again."
            )

    response = await call_next(request)

    if is_api and settings.csrf_cookie_name not in request.cookies:
        response.set_cookie(
            settings.csrf_cookie_name,
            secrets.token_urlsafe(32),
            httponly=False,
            secure=settings.cookie_secure,
            samesite="strict",
            path="/",
        )
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    if is_api:
        headers.setdefault("Cache-Control", "no-store")
        if not request.url.path.startswith("/api/docs"):
            headers.setdefault(
                "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
            )
    if settings.cookie_secure:
        headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


@app.exception_handler(PermissionDenied)
async def permission_denied(_: Request, exc: PermissionDenied) -> JSONResponse:
    return JSONResponse({"detail": exc.message}, status_code=status.HTTP_403_FORBIDDEN)


@app.exception_handler(ratelimit.RateLimited)
async def rate_limited(_: Request, exc: ratelimit.RateLimited) -> JSONResponse:
    minutes = max(1, round(exc.retry_after / 60))
    return JSONResponse(
        {
            "detail": f"Too many attempts. Please try again in about {minutes} minute"
            f"{'s' if minutes != 1 else ''}."
        },
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(exc.retry_after)},
    )


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


for module in (auth, account, workspaces, roles, invitations, projects, documents, activity, vault):
    app.include_router(module.router, prefix="/api")
app.include_router(account.users_router, prefix="/api")
