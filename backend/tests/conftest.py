"""Test harness: a real PostgreSQL test database, migrated with Alembic, and an in-process client.

Tests never truncate between runs (the audit log is append-only by design); every test uses
fresh, unique email addresses instead.
"""

import os
import re
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://vault:vault@localhost:29432/vault_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["APP_URL"] = "http://testserver"
os.environ["SIGNIN_IP_LIMIT"] = "100000"
os.environ["EMAIL_ACTION_LIMIT"] = "100000"
os.environ["TOKEN_SUBMIT_IP_LIMIT"] = "100000"

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text

from vault_api.db import SessionLocal
from vault_api.main import app
from vault_api.models import EmailOutbox

BACKEND = Path(__file__).resolve().parent.parent
PASSWORD = "correct horse battery staple"


def _migrate() -> None:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    import asyncio

    await asyncio.to_thread(_migrate)
    async with SessionLocal() as db:
        await db.execute(text("DELETE FROM rate_limits"))
        await db.commit()
    yield


class Client:
    """httpx client that behaves like the web app: echoes the CSRF cookie in a header."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self.http = http

    async def _ensure_csrf(self) -> str:
        token = self.http.cookies.get("vault_csrf")
        if token is None:
            await self.http.get("/api/health")
            token = self.http.cookies.get("vault_csrf")
        assert token
        return token

    async def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        if method.upper() not in ("GET", "HEAD", "OPTIONS"):
            headers.setdefault("X-CSRF-Token", await self._ensure_csrf())
        return await self.http.request(method, url, headers=headers, **kwargs)

    async def get(self, url: str, **kw: Any) -> httpx.Response:
        return await self.request("GET", url, **kw)

    async def post(self, url: str, **kw: Any) -> httpx.Response:
        return await self.request("POST", url, **kw)

    async def patch(self, url: str, **kw: Any) -> httpx.Response:
        return await self.request("PATCH", url, **kw)

    async def put(self, url: str, **kw: Any) -> httpx.Response:
        return await self.request("PUT", url, **kw)

    async def delete(self, url: str, **kw: Any) -> httpx.Response:
        return await self.request("DELETE", url, **kw)


def new_http() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.fixture
async def client() -> AsyncIterator[Client]:
    async with new_http() as http:
        yield Client(http)


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


async def latest_email(to: str, pattern: str) -> str:
    """Return the first regex group from the newest queued email to `to`."""
    async with SessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(EmailOutbox)
                    .where(EmailOutbox.to_address == to)
                    .order_by(EmailOutbox.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
    for row in rows:
        match = re.search(pattern, row.text_body)
        if match:
            return match.group(1)
    raise AssertionError(f"No email to {to} matching {pattern}")


async def emails_to(to: str) -> list[EmailOutbox]:
    async with SessionLocal() as db:
        return list(
            (await db.execute(select(EmailOutbox).where(EmailOutbox.to_address == to))).scalars()
        )


async def signup_and_verify(
    client: Client,
    name: str = "Test User",
    email: str | None = None,
    password: str = PASSWORD,
    workspace: str | None = "Workspace",
) -> dict[str, Any]:
    """Create a verified, signed-in user (optionally with a first workspace)."""
    address = email or unique_email(name.split()[0].lower())
    res = await client.post(
        "/api/auth/signup", json={"name": name, "email": address, "password": password}
    )
    assert res.status_code == 202, res.text
    token = await latest_email(address, r"verify-email\?token=([\w-]+)")
    res = await client.post("/api/auth/verify-email", json={"token": token})
    assert res.status_code == 200, res.text
    me: dict[str, Any] = res.json()
    if workspace:
        res = await client.post("/api/workspaces", json={"name": workspace})
        assert res.status_code == 201, res.text
        me["workspace_id"] = res.json()["id"]
    return me


async def role_id(client: Client, workspace_id: str, name: str) -> str:
    roles = (await client.get(f"/api/workspaces/{workspace_id}/roles")).json()
    return next(r["id"] for r in roles if r["name"] == name)


async def add_member(
    owner: Client,
    workspace_id: str,
    role: str,
    name: str = "Member",
    project_ids: list[str] | None = None,
) -> tuple[Client, dict[str, Any]]:
    """Invite a fresh user with `role`, have them sign up and accept. Returns their client."""
    member_http = new_http()
    member = Client(member_http)
    me = await signup_and_verify(member, name=name, workspace=f"{name}'s own")
    res = await owner.post(
        f"/api/workspaces/{workspace_id}/invitations",
        json={
            "email": me["email"],
            "role_id": await role_id(owner, workspace_id, role),
            "project_ids": project_ids or [],
        },
    )
    assert res.status_code == 201, res.text
    invitations = (await member.get("/api/invitations")).json()
    inv = next(i for i in invitations if i["workspace_id"] == workspace_id)
    res = await member.post(f"/api/invitations/{inv['id']}/accept")
    assert res.status_code == 200, res.text
    return member, me
