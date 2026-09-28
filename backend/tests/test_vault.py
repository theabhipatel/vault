"""Server-side vault rules. The server treats every key and ciphertext as opaque bytes, so these
tests use random blobs; the real browser cryptography is tested in the frontend (vitest)."""

import base64
import os
import uuid
from typing import Any

from sqlalchemy import select

from tests.conftest import Client, add_member, signup_and_verify
from vault_api.db import SessionLocal
from vault_api.models import AuditLog

MIB = 1024 * 1024


def b64(n: int) -> str:
    return base64.b64encode(os.urandom(n)).decode()


def vault_payload() -> dict[str, Any]:
    return {
        "public_key": b64(32),
        "kdf": {"algorithm": "argon2id13", "salt": b64(16), "ops": 3, "mem": 64 * MIB},
        "encrypted_private_key": b64(48),
        "private_key_nonce": b64(12),
        "recovery_encrypted_private_key": b64(48),
        "recovery_nonce": b64(12),
    }


async def setup_vault(c: Client) -> str:
    body = vault_payload()
    res = await c.post("/api/vault", json=body)
    assert res.status_code == 201, res.text
    return str(body["public_key"])


def grant(user_id: str, public_key: str) -> dict[str, str]:
    return {"user_id": user_id, "public_key": public_key, "sealed_key": b64(120)}


async def project(c: Client, ws: str) -> str:
    res = await c.post(f"/api/workspaces/{ws}/projects", json={"name": "Secrets"})
    assert res.status_code == 201
    return str(res.json()["id"])


def base(ws: str, pid: str) -> str:
    return f"/api/workspaces/{ws}/projects/{pid}/vault"


async def secure_doc(c: Client, ws: str, pid: str, key_version: int = 1) -> dict[str, Any]:
    res = await c.post(
        f"/api/workspaces/{ws}/projects/{pid}/secure-documents",
        json={
            "id": str(uuid.uuid4()),
            "name": "prod.env",
            "format": "env",
            "key_version": key_version,
            "ciphertext": b64(64),
            "nonce": b64(12),
        },
    )
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    return data


async def test_vault_setup_validation(client: Client) -> None:
    await signup_and_verify(client)
    assert (await client.get("/api/vault")).json() is None
    weak = vault_payload()
    weak["kdf"]["ops"] = 2
    assert (await client.post("/api/vault", json=weak)).status_code == 422
    small = vault_payload()
    small["kdf"]["mem"] = 32 * MIB
    assert (await client.post("/api/vault", json=small)).status_code == 422
    short_key = vault_payload()
    short_key["public_key"] = b64(16)
    assert (await client.post("/api/vault", json=short_key)).status_code == 422
    pk = await setup_vault(client)
    assert (await client.get("/api/vault")).json()["public_key"] == pk
    assert (await client.post("/api/vault", json=vault_payload())).status_code == 409


async def test_password_change_keeps_keypair(client: Client) -> None:
    await signup_and_verify(client)
    pk = await setup_vault(client)
    body = {
        "public_key": pk,
        "kdf": vault_payload()["kdf"],
        "encrypted_private_key": b64(48),
        "private_key_nonce": b64(12),
    }
    assert (await client.put("/api/vault/password", json=body)).status_code == 200
    body["public_key"] = b64(32)  # a different keypair is not a password change
    assert (await client.put("/api/vault/password", json=body)).status_code == 409


async def test_key_init_grants_and_pending_access(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    pid = await project(client, ws)
    member, member_me = await add_member(client, ws, "Member", project_ids=[pid])
    outsider, outsider_me = await add_member(client, ws, "Member", name="Outsider")
    owner_pk = await setup_vault(client)
    outsider_pk = await setup_vault(outsider)

    state = (await client.get(base(ws, pid))).json()
    assert state["my_state"] == "uninitialized"
    # The member has no vault yet, so they are not a sealing target.
    assert [r["user_id"] for r in state["recipients"]] == [owner["id"]]

    # Sealing to someone without access to the project is refused.
    res = await client.post(
        f"{base(ws, pid)}/init",
        json={"grants": [grant(owner["id"], owner_pk), grant(outsider_me["id"], outsider_pk)]},
    )
    assert res.status_code == 409
    # A copy for yourself is mandatory, and the key must be the recipient's current one.
    res = await client.post(f"{base(ws, pid)}/init", json={"grants": [grant(owner["id"], b64(32))]})
    assert res.status_code == 409
    res = await client.post(
        f"{base(ws, pid)}/init", json={"grants": [grant(owner["id"], owner_pk)]}
    )
    assert res.status_code == 200
    assert (
        await client.post(f"{base(ws, pid)}/init", json={"grants": [grant(owner["id"], owner_pk)]})
    ).status_code == 409

    assert (await member.get(base(ws, pid))).json()["my_state"] == "no_vault"
    member_pk = await setup_vault(member)
    member_state = (await member.get(base(ws, pid))).json()
    assert member_state["my_state"] == "pending" and member_state["my_sealed_key"] is None
    summary = (await member.get("/api/vault/summary")).json()
    assert summary["pending_projects"] == 1

    work = (await client.get("/api/vault/pending-work")).json()
    item = next(w for w in work if w["project_id"] == pid)
    assert [r["user_id"] for r in item["recipients"]] == [member_me["id"]]

    # Only key holders can grant.
    res = await member.post(
        f"{base(ws, pid)}/grants",
        json={"key_version": 1, "grants": [grant(member_me["id"], member_pk)]},
    )
    assert res.status_code == 403
    res = await client.post(
        f"{base(ws, pid)}/grants",
        json={"key_version": 1, "grants": [grant(member_me["id"], member_pk)]},
    )
    assert res.status_code == 200
    assert (await member.get(base(ws, pid))).json()["my_state"] == "ready"
    notes = (await member.get("/api/notifications")).json()["items"]
    assert any(n["type"] == "vault.access_granted" for n in notes)
    members = (await client.get(f"/api/workspaces/{ws}/members")).json()
    statuses = {m["user_id"]: m["vault_status"] for m in members}
    assert statuses[member_me["id"]] == "ready"


async def test_revocation_deletes_grants_and_schedules_rotation(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    pid = await project(client, ws)
    member, member_me = await add_member(client, ws, "Member", project_ids=[pid])
    owner_pk, member_pk = await setup_vault(client), await setup_vault(member)
    await client.post(
        f"{base(ws, pid)}/init",
        json={"grants": [grant(owner["id"], owner_pk), grant(member_me["id"], member_pk)]},
    )
    doc = await secure_doc(member, ws, pid)
    # Member can read ciphertext while entitled.
    assert (await member.get(f"/api/workspaces/{ws}/documents/{doc['id']}")).json()["ciphertext"]

    res = await client.delete(f"/api/workspaces/{ws}/projects/{pid}/members/{member_me['id']}")
    assert res.status_code == 200
    # Immediately: no project, no key, no ciphertext.
    assert (await member.get(base(ws, pid))).status_code == 404
    assert (await member.get(f"/api/workspaces/{ws}/documents/{doc['id']}")).status_code == 404
    assert all(g["project_id"] != pid for g in (await member.get("/api/vault/pending-work")).json())
    state = (await client.get(base(ws, pid))).json()
    assert state["rotation_pending"] is True and state["holders"] == 1


async def test_rotation_is_atomic_and_complete(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    pid = await project(client, ws)
    owner_pk = await setup_vault(client)
    await client.post(f"{base(ws, pid)}/init", json={"grants": [grant(owner["id"], owner_pk)]})
    d1 = await secure_doc(client, ws, pid)
    await secure_doc(client, ws, pid)
    res = await client.put(
        f"/api/workspaces/{ws}/documents/{d1['id']}/secure",
        json={"expected_version": 1, "key_version": 1, "ciphertext": b64(80), "nonce": b64(12)},
    )
    assert res.status_code == 200 and res.json()["version"] == 2

    material = (await client.get(f"{base(ws, pid)}/rotation-material")).json()
    assert material["key_version"] == 1 and len(material["items"]) == 3
    items = [
        {
            "document_id": i["document_id"],
            "version": i["version"],
            "ciphertext": b64(90),
            "nonce": b64(12),
        }
        for i in material["items"]
    ]
    new_grant = [grant(owner["id"], owner_pk)]

    # Missing one ciphertext -> rejected, nothing changes.
    res = await client.post(
        f"{base(ws, pid)}/rotate",
        json={"from_version": 1, "grants": new_grant, "items": items[:-1]},
    )
    assert res.status_code == 409
    res = await client.post(
        f"{base(ws, pid)}/rotate", json={"from_version": 7, "grants": new_grant, "items": items}
    )
    assert res.status_code == 409
    assert (await client.get(base(ws, pid))).json()["key_version"] == 1

    res = await client.post(
        f"{base(ws, pid)}/rotate", json={"from_version": 1, "grants": new_grant, "items": items}
    )
    assert res.status_code == 200, res.text
    state = (await client.get(base(ws, pid))).json()
    assert state["key_version"] == 2 and state["rotation_pending"] is False
    doc = (await client.get(f"/api/workspaces/{ws}/documents/{d1['id']}")).json()
    assert doc["key_version"] == 2
    assert doc["ciphertext"] == next(
        i["ciphertext"] for i in items if i["document_id"] == d1["id"] and i["version"] == 2
    )
    # Saving with the old key version is refused.
    res = await client.put(
        f"/api/workspaces/{ws}/documents/{d1['id']}/secure",
        json={"expected_version": 2, "key_version": 1, "ciphertext": b64(80), "nonce": b64(12)},
    )
    assert res.status_code == 409


async def test_secure_document_rules(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    pid = await project(client, ws)
    member, _member_me = await add_member(client, ws, "Member", project_ids=[pid])
    owner_pk = await setup_vault(client)
    await setup_vault(member)
    await client.post(f"{base(ws, pid)}/init", json={"grants": [grant(owner["id"], owner_pk)]})
    # Without a sealed copy you can't write ciphertext.
    res = await member.post(
        f"/api/workspaces/{ws}/projects/{pid}/secure-documents",
        json={
            "id": str(uuid.uuid4()),
            "name": "x",
            "format": "text",
            "key_version": 1,
            "ciphertext": b64(40),
            "nonce": b64(12),
        },
    )
    assert res.status_code == 403
    doc = await secure_doc(client, ws, pid)
    url = f"/api/workspaces/{ws}/documents/{doc['id']}"
    assert (
        await client.patch(url, json={"expected_version": 1, "content": "plain"})
    ).status_code == 409
    renamed = await client.patch(url, json={"expected_version": 1, "name": "staging.env"})
    assert renamed.json()["name"] == "staging.env" and renamed.json()["version"] == 1
    assert (await member.delete(url)).status_code == 403  # Members lack secure.delete
    await client.get(url)
    async with SessionLocal() as db:
        viewed = await db.scalar(
            select(AuditLog).where(
                AuditLog.action == "secure_document.viewed", AuditLog.target_id == doc["id"]
            )
        )
    assert viewed is not None


async def test_vault_reset_revokes_and_warns(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    shared, solo = await project(client, ws), await project(client, ws)
    member, member_me = await add_member(client, ws, "Admin", name="Admin")
    owner_pk, member_pk = await setup_vault(client), await setup_vault(member)
    await client.post(
        f"{base(ws, shared)}/init",
        json={"grants": [grant(owner["id"], owner_pk), grant(member_me["id"], member_pk)]},
    )
    await member.post(
        f"{base(ws, solo)}/init", json={"grants": [grant(member_me["id"], member_pk)]}
    )
    # The owner is also entitled to `solo`, but hasn't received a copy yet.

    impact = {i["project_id"]: i for i in (await member.get("/api/vault/reset-impact")).json()}
    assert impact[shared]["sole_holder"] is False and impact[solo]["sole_holder"] is True

    body = vault_payload() | {"confirm": "RESET"}
    assert (await member.post("/api/vault/reset", json=body)).status_code == 200
    assert (await client.get(base(ws, shared))).json()["rotation_pending"] is True
    assert (await client.get(base(ws, solo))).json()["my_state"] == "lost"
    assert (await member.get(base(ws, shared))).json()["my_state"] == "pending"
    notes = (await client.get("/api/notifications")).json()["items"]
    assert any(n["type"] == "vault.key_changed" for n in notes)
    # A lost project can be cleared and started again.
    assert (await client.post(f"{base(ws, solo)}/abandon")).status_code == 200
    assert (await client.get(base(ws, solo))).json()["my_state"] == "uninitialized"
