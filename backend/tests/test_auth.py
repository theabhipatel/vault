from sqlalchemy import text

from tests.conftest import (
    PASSWORD,
    Client,
    emails_to,
    latest_email,
    new_http,
    signup_and_verify,
    unique_email,
)
from vault_api.db import SessionLocal


async def test_signup_verify_and_me(client: Client) -> None:
    me = await signup_and_verify(client, name="Ada Lovelace", workspace=None)
    assert me["email_verified"] is True
    assert me["needs_onboarding"] is True
    res = await client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["name"] == "Ada Lovelace"


async def test_session_cookie_is_http_only(client: Client) -> None:
    address = unique_email()
    await client.post(
        "/api/auth/signup", json={"name": "C", "email": address, "password": PASSWORD}
    )
    token = await latest_email(address, r"verify-email\?token=([\w-]+)")
    res = await client.post("/api/auth/verify-email", json={"token": token})
    cookie = next(c for c in res.headers.get_list("set-cookie") if "vault_session=" in c)
    assert "vault_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    # The session token never appears in a response body.
    assert "vault_session" not in res.text


async def test_signup_does_not_reveal_existing_accounts(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    async with new_http() as http:
        other = Client(http)
        res_existing = await other.post(
            "/api/auth/signup",
            json={"name": "Someone", "email": me["email"], "password": "another password 123"},
        )
        res_new = await other.post(
            "/api/auth/signup",
            json={"name": "Someone", "email": unique_email(), "password": "another password 123"},
        )
    assert res_existing.status_code == res_new.status_code == 202
    assert res_existing.json() == res_new.json()
    subjects = [e.subject for e in await emails_to(me["email"])]
    assert "Sign-up attempt for your account" in subjects


async def test_signin_errors_are_generic(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    async with new_http() as http:
        c = Client(http)
        wrong = await c.post("/api/auth/signin", json={"email": me["email"], "password": "nope"})
        missing = await c.post(
            "/api/auth/signin", json={"email": unique_email(), "password": "nope"}
        )
        assert wrong.status_code == missing.status_code == 401
        assert wrong.json() == missing.json()
        ok = await c.post("/api/auth/signin", json={"email": me["email"], "password": PASSWORD})
        assert ok.status_code == 200


async def test_unverified_user_cannot_sign_in(client: Client) -> None:
    address = unique_email()
    await client.post(
        "/api/auth/signup", json={"name": "U", "email": address, "password": PASSWORD}
    )
    res = await client.post("/api/auth/signin", json={"email": address, "password": PASSWORD})
    assert res.status_code == 403


async def test_lockout_after_repeated_failures(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    async with new_http() as http:
        c = Client(http)
        for _ in range(5):
            res = await c.post("/api/auth/signin", json={"email": me["email"], "password": "bad"})
            assert res.status_code == 401
        res = await c.post("/api/auth/signin", json={"email": me["email"], "password": PASSWORD})
        assert res.status_code == 429
        assert "Retry-After" in res.headers
    # Nonexistent addresses lock out the same way (no enumeration through lockout behaviour).
    ghost = unique_email()
    async with new_http() as http:
        c = Client(http)
        for _ in range(5):
            await c.post("/api/auth/signin", json={"email": ghost, "password": "bad"})
        res = await c.post("/api/auth/signin", json={"email": ghost, "password": "bad"})
        assert res.status_code == 429


async def test_csrf_token_and_origin_are_enforced(client: Client) -> None:
    await signup_and_verify(client, workspace=None)
    res = await client.http.post("/api/workspaces", json={"name": "No token"})
    assert res.status_code == 403
    res = await client.post(
        "/api/workspaces", json={"name": "Evil"}, headers={"Origin": "https://evil.example"}
    )
    assert res.status_code == 403
    res = await client.post(
        "/api/workspaces", json={"name": "Fine"}, headers={"Origin": "http://testserver"}
    )
    assert res.status_code == 201


async def test_password_reset_revokes_sessions(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    async with new_http() as http:
        anon = Client(http)
        res = await anon.post("/api/auth/forgot-password", json={"email": me["email"]})
        assert res.status_code == 202
        token = await latest_email(me["email"], r"reset-password\?token=([\w-]+)")
        new_password = "a brand new password 42"
        res = await anon.post(
            "/api/auth/reset-password", json={"token": token, "password": new_password}
        )
        assert res.status_code == 200
        # Single use.
        res = await anon.post(
            "/api/auth/reset-password", json={"token": token, "password": new_password}
        )
        assert res.status_code == 400
        assert (
            await anon.post("/api/auth/signin", json={"email": me["email"], "password": PASSWORD})
        ).status_code == 401
        assert (
            await anon.post(
                "/api/auth/signin", json={"email": me["email"], "password": new_password}
            )
        ).status_code == 200
    # The original session was signed out.
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_forgot_password_is_generic(client: Client) -> None:
    a = await client.post("/api/auth/forgot-password", json={"email": unique_email()})
    assert a.status_code == 202


async def test_resignup_password_binds_to_verification_link(client: Client) -> None:
    """Pre-account-takeover: an attacker's unverified sign-up must not decide the password."""
    victim_email = unique_email("victim")
    attacker_password = "attacker password 123"
    victim_password = "victim password 123456"
    async with new_http() as http:
        attacker = Client(http)
        await attacker.post(
            "/api/auth/signup",
            json={"name": "Attacker", "email": victim_email, "password": attacker_password},
        )
    await client.post(
        "/api/auth/signup",
        json={"name": "Victim", "email": victim_email, "password": victim_password},
    )
    token = await latest_email(victim_email, r"verify-email\?token=([\w-]+)")
    assert (await client.post("/api/auth/verify-email", json={"token": token})).status_code == 200
    async with new_http() as http:
        c = Client(http)
        assert (
            await c.post(
                "/api/auth/signin", json={"email": victim_email, "password": attacker_password}
            )
        ).status_code == 401
        assert (
            await c.post(
                "/api/auth/signin", json={"email": victim_email, "password": victim_password}
            )
        ).status_code == 200


async def test_change_password_and_sessions(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    async with new_http() as http:
        second = Client(http)
        await second.post("/api/auth/signin", json={"email": me["email"], "password": PASSWORD})
        sessions = (await client.get("/api/account/sessions")).json()
        assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
        bad = await client.post(
            "/api/account/password", json={"current_password": "wrong", "new_password": "x" * 12}
        )
        assert bad.status_code == 400
        ok = await client.post(
            "/api/account/password",
            json={"current_password": PASSWORD, "new_password": "a new login password"},
        )
        assert ok.status_code == 200
        assert (await second.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 200
    assert len((await client.get("/api/account/sessions")).json()) == 1


async def test_audit_log_is_append_only() -> None:
    async with SessionLocal() as db:
        try:
            await db.execute(text("UPDATE audit_logs SET action = 'tampered'"))
            await db.commit()
            raised = False
        except Exception:
            await db.rollback()
            raised = True
    assert raised
    async with SessionLocal() as db:
        try:
            await db.execute(text("DELETE FROM audit_logs"))
            await db.commit()
            raised = False
        except Exception:
            await db.rollback()
            raised = True
    assert raised
