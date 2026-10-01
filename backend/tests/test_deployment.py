"""Hosting modes: the self-hosted defaults stay as they were, and SERVERLESS=true (the Vercel
demo) sends email inline, exposes the cron endpoint and reads the client IP from a header."""

import tomllib
from pathlib import Path
from typing import Any

import pytest
from pydantic import SecretStr
from sqlalchemy import NullPool, text
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.requests import Request

from vault_api import main
from vault_api.config import Settings, get_settings
from vault_api.db import _engine_options
from vault_api.deps import client_ip
from vault_api.models import EmailOutbox
from vault_api.services import email

from .conftest import Client, emails_to, unique_email

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Replace SMTP with a list of recipient addresses."""
    recipients: list[str] = []

    async def fake_send(message: EmailOutbox) -> None:
        recipients.append(message.to_address)

    monkeypatch.setattr(email, "_send", fake_send)
    return recipients


@pytest.fixture
def serverless(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main.settings, "serverless", True)


async def _signup(client: Client) -> str:
    address = unique_email("host")
    res = await client.post(
        "/api/auth/signup",
        json={"name": "Host Test", "email": address, "password": "correct horse battery"},
    )
    assert res.status_code == 202, res.text
    return address


# ---- Self-hosted defaults --------------------------------------------------------------------


def test_self_hosted_defaults_are_unchanged() -> None:
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.serverless is False
    assert settings.cron_secret is None
    assert settings.client_ip_header is None
    options = _engine_options(serverless=False)
    assert options == {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}


async def test_self_hosted_queues_email_for_the_worker(client: Client, sent: list[str]) -> None:
    address = await _signup(client)
    [message] = await emails_to(address)
    assert message.status == "pending"
    assert sent == []


async def test_cron_endpoint_is_off_without_a_secret(client: Client) -> None:
    res = await client.get("/api/internal/cron", headers={"Authorization": "Bearer anything"})
    assert res.status_code == 404


def test_asyncpg_urls_pass_through_untouched() -> None:
    url = "postgresql+asyncpg://vault:secret@db:5432/vault"
    assert Settings(database_url=url).database_url == url
    with_ssl = "postgresql+asyncpg://u:p@h/db?ssl=require"
    assert Settings(database_url=with_ssl).database_url == with_ssl


# ---- Serverless (Vercel demo) ----------------------------------------------------------------


async def test_serverless_sends_the_request_emails_before_responding(
    client: Client, sent: list[str], serverless: None
) -> None:
    address = await _signup(client)
    assert sent == [address]
    [message] = await emails_to(address)
    assert message.status == "sent"


async def test_serverless_inline_failure_keeps_the_email_for_retry(
    client: Client, monkeypatch: pytest.MonkeyPatch, serverless: None
) -> None:
    async def broken_send(message: EmailOutbox) -> None:
        raise OSError("SMTP down")

    monkeypatch.setattr(email, "_send", broken_send)
    address = await _signup(client)  # still succeeds for the user
    [message] = await emails_to(address)
    assert message.status == "pending"
    assert message.attempts == 1


async def test_cron_endpoint_requires_the_secret(
    client: Client, monkeypatch: pytest.MonkeyPatch, sent: list[str]
) -> None:
    monkeypatch.setattr(main.settings, "cron_secret", SecretStr("cron-test-secret"))
    for header in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": "cron-test-secret"}):
        res = await client.get("/api/internal/cron", headers=header)
        assert res.status_code == 404
    res = await client.get(
        "/api/internal/cron", headers={"Authorization": "Bearer cron-test-secret"}
    )
    assert res.status_code == 200
    assert res.json()["emails_sent"] == len(sent)


def test_neon_style_urls_are_converted_for_asyncpg() -> None:
    neon = "postgresql://user:pw@ep-x-pooler.eu.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert Settings(database_url=neon).database_url == (
        "postgresql+asyncpg://user:pw@ep-x-pooler.eu.aws.neon.tech/neondb?ssl=require"
    )
    assert Settings(database_url="postgres://u:p@h/db").database_url == (
        "postgresql+asyncpg://u:p@h/db"
    )


async def test_serverless_engine_works_against_postgres() -> None:
    options = _engine_options(serverless=True)
    assert options["poolclass"] is NullPool
    engine = create_async_engine(get_settings().database_url, **options)
    try:
        for _ in range(3):  # repeated statements must not collide on prepared-statement names
            async with engine.connect() as conn:
                assert (await conn.execute(text("SELECT 1"))).scalar() == 1
    finally:
        await engine.dispose()


def _request(headers: dict[str, str]) -> Request:
    scope: dict[str, Any] = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": ("10.0.0.1", 1234),
    }
    return Request(scope)


def test_client_ip_header(monkeypatch: pytest.MonkeyPatch) -> None:
    spoof = {"x-real-ip": "203.0.113.7"}
    # Not configured (self-hosted): the header is ignored, the connection address is used.
    assert client_ip(_request(spoof)) == "10.0.0.1"
    monkeypatch.setattr(get_settings(), "client_ip_header", "x-real-ip")
    assert client_ip(_request(spoof)) == "203.0.113.7"
    assert client_ip(_request({"x-real-ip": "198.51.100.2, 10.0.0.9"})) == "198.51.100.2"
    assert client_ip(_request({"x-real-ip": "not-an-ip"})) == "10.0.0.1"
    assert client_ip(_request({})) == "10.0.0.1"


def test_vercel_requirements_cover_every_backend_dependency() -> None:
    """requirements.txt at the repo root (for Vercel) must not drift from pyproject.toml."""
    project = tomllib.loads((REPO / "backend" / "pyproject.toml").read_text())
    required = {
        dep.split("[")[0].split(">")[0].split("=")[0].strip().lower()
        for dep in project["project"]["dependencies"]
    }
    pinned = {
        line.split("==")[0].split("[")[0].strip().lower()
        for line in (REPO / "requirements.txt").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith(("#", "-"))
    }
    assert required <= pinned, f"Run `make vercel-requirements`; missing: {required - pinned}"
