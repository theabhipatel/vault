"""Server-side enforcement of workspace, role, project and document permissions."""

from typing import Any

from tests.conftest import (
    PASSWORD,
    Client,
    add_member,
    new_http,
    role_id,
    signup_and_verify,
    unique_email,
)


async def _project(c: Client, ws: str, name: str = "Project") -> dict[str, Any]:
    res = await c.post(f"/api/workspaces/{ws}/projects", json={"name": name})
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    return data


async def test_onboarding_creates_default_workspace_with_roles(client: Client) -> None:
    me = await signup_and_verify(client, workspace=None)
    assert me["needs_onboarding"]
    res = await client.post("/api/workspaces", json={"name": "Acme"})
    ws = res.json()
    assert ws["is_owner"] and ws["is_default"]
    me = (await client.get("/api/auth/me")).json()
    assert me["needs_onboarding"] is False and me["default_workspace_id"] == ws["id"]
    roles = (await client.get(f"/api/workspaces/{ws['id']}/roles")).json()
    assert [r["name"] for r in roles] == ["Owner", "Admin", "Manager", "Member"]


async def test_non_members_get_404(client: Client) -> None:
    owner = await signup_and_verify(client)
    async with new_http() as http:
        stranger = Client(http)
        await signup_and_verify(stranger)
        assert (await stranger.get(f"/api/workspaces/{owner['workspace_id']}")).status_code == 404
        assert (
            await stranger.get(f"/api/workspaces/{owner['workspace_id']}/members")
        ).status_code == 404


async def test_member_restrictions(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    member, _ = await add_member(client, ws, "Member")
    assert (await member.get(f"/api/workspaces/{ws}/audit")).status_code == 403
    assert (
        await member.post(f"/api/workspaces/{ws}/projects", json={"name": "Nope"})
    ).status_code == 403
    res = await member.post(
        f"/api/workspaces/{ws}/invitations",
        json={"email": unique_email(), "role_id": await role_id(client, ws, "Member")},
    )
    assert res.status_code == 403
    assert (await member.patch(f"/api/workspaces/{ws}", json={"name": "X"})).status_code == 403


async def test_invitation_must_match_email(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    target = unique_email()
    res = await client.post(
        f"/api/workspaces/{ws}/invitations",
        json={"email": target, "role_id": await role_id(client, ws, "Member")},
    )
    inv_id = res.json()["id"]
    async with new_http() as http:
        other = Client(http)
        await signup_and_verify(other)
        assert (await other.get("/api/invitations")).json() == []
        assert (await other.post(f"/api/invitations/{inv_id}/accept")).status_code == 404


async def test_invite_new_user_waits_for_signup(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    target = unique_email("newbie")
    await client.post(
        f"/api/workspaces/{ws}/invitations",
        json={"email": target, "role_id": await role_id(client, ws, "Member")},
    )
    dup = await client.post(
        f"/api/workspaces/{ws}/invitations",
        json={"email": target, "role_id": await role_id(client, ws, "Member")},
    )
    assert dup.status_code == 409
    async with new_http() as http:
        newbie = Client(http)
        await signup_and_verify(newbie, email=target, workspace="Newbie's")
        invitations = (await newbie.get("/api/invitations")).json()
        assert len(invitations) == 1 and invitations[0]["workspace_id"] == ws


async def test_admin_cannot_manage_peers_or_owner(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    admin, admin_me = await add_member(client, ws, "Admin", name="Admin One")
    _, admin2_me = await add_member(client, ws, "Admin", name="Admin Two")
    _, member_me = await add_member(client, ws, "Member", name="Plain Member")
    manager_role = await role_id(client, ws, "Manager")
    admin_role = await role_id(client, ws, "Admin")

    # Admin -> other admin: forbidden (rank not below).
    res = await admin.patch(
        f"/api/workspaces/{ws}/members/{admin2_me['id']}", json={"role_id": manager_role}
    )
    assert res.status_code == 403
    assert (
        await admin.delete(f"/api/workspaces/{ws}/members/{admin2_me['id']}")
    ).status_code == 403
    # Admin -> owner: forbidden.
    assert (await admin.delete(f"/api/workspaces/{ws}/members/{owner['id']}")).status_code == 403
    # Admin cannot promote someone to Admin.
    res = await admin.patch(
        f"/api/workspaces/{ws}/members/{member_me['id']}", json={"role_id": admin_role}
    )
    assert res.status_code == 403
    # Admin can promote a member to Manager.
    res = await admin.patch(
        f"/api/workspaces/{ws}/members/{member_me['id']}", json={"role_id": manager_role}
    )
    assert res.status_code == 200
    # Owner can manage admins.
    res = await client.patch(
        f"/api/workspaces/{ws}/members/{admin2_me['id']}", json={"role_id": manager_role}
    )
    assert res.status_code == 200
    # Nobody can be given the Owner role.
    res = await client.patch(
        f"/api/workspaces/{ws}/members/{admin_me['id']}",
        json={"role_id": await role_id(client, ws, "Owner")},
    )
    assert res.status_code == 403


async def test_role_editing_hierarchy(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    admin, _ = await add_member(client, ws, "Admin")
    roles = {r["name"]: r for r in (await client.get(f"/api/workspaces/{ws}/roles")).json()}

    # Admin cannot edit the Admin role or the Owner role.
    assert (
        await admin.patch(
            f"/api/workspaces/{ws}/roles/{roles['Admin']['id']}", json={"permissions": []}
        )
    ).status_code == 403
    assert (
        await admin.patch(
            f"/api/workspaces/{ws}/roles/{roles['Owner']['id']}", json={"name": "Boss"}
        )
    ).status_code == 403
    # Owner removes audit.view from Admins...
    admin_perms = [p for p in roles["Admin"]["permissions"] if p != "audit.view"]
    assert (
        await client.patch(
            f"/api/workspaces/{ws}/roles/{roles['Admin']['id']}", json={"permissions": admin_perms}
        )
    ).status_code == 200
    # ...so an admin can no longer grant audit.view to Managers,
    manager_perms = roles["Manager"]["permissions"]
    res = await admin.patch(
        f"/api/workspaces/{ws}/roles/{roles['Manager']['id']}",
        json={"permissions": [*manager_perms, "audit.view"]},
    )
    assert res.status_code == 403
    # but can still grant permissions they hold.
    res = await admin.patch(
        f"/api/workspaces/{ws}/roles/{roles['Manager']['id']}",
        json={"permissions": [*manager_perms, "members.remove"]},
    )
    assert res.status_code == 200, res.text
    # And the admin now really cannot view the audit log.
    assert (await admin.get(f"/api/workspaces/{ws}/audit")).status_code == 403


async def test_custom_roles_placement_and_deletion(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    admin, _ = await add_member(client, ws, "Admin")
    roles = {r["name"]: r for r in (await client.get(f"/api/workspaces/{ws}/roles")).json()}

    # Admin cannot place a role above themselves (directly below Owner).
    res = await admin.post(
        f"/api/workspaces/{ws}/roles",
        json={"name": "Super", "permissions": [], "place_below_role_id": roles["Owner"]["id"]},
    )
    assert res.status_code == 403
    res = await admin.post(
        f"/api/workspaces/{ws}/roles",
        json={
            "name": "Auditor",
            "permissions": ["audit.view", "docs.view"],
            "place_below_role_id": roles["Manager"]["id"],
        },
    )
    assert res.status_code == 201, res.text
    auditor = res.json()
    assert roles["Member"]["rank"] < auditor["rank"] < roles["Manager"]["rank"]

    # Squeeze many roles into the same gap to force renumbering; order must be preserved.
    for i in range(12):
        res = await client.post(
            f"/api/workspaces/{ws}/roles",
            json={
                "name": f"Tier {i}",
                "permissions": [],
                "place_below_role_id": roles["Manager"]["id"],
            },
        )
        assert res.status_code == 201, res.text
    ranked = (await client.get(f"/api/workspaces/{ws}/roles")).json()
    names = [r["name"] for r in ranked]
    assert names[:3] == ["Owner", "Admin", "Manager"] and names[-1] == "Member"
    assert names.index("Tier 11") < names.index("Tier 0") < names.index("Auditor")

    # Deleting a role in use requires a replacement.
    _, m = await add_member(client, ws, "Auditor", name="Audra")
    res = await client.post(f"/api/workspaces/{ws}/roles/{auditor['id']}/delete", json={})
    assert res.status_code == 409
    res = await client.post(
        f"/api/workspaces/{ws}/roles/{auditor['id']}/delete",
        json={"replacement_role_id": roles["Member"]["id"]},
    )
    assert res.status_code == 200
    members = (await client.get(f"/api/workspaces/{ws}/members")).json()
    assert next(x for x in members if x["user_id"] == m["id"])["role_name"] == "Member"
    # Built-in roles cannot be deleted.
    res = await client.post(
        f"/api/workspaces/{ws}/roles/{roles['Member']['id']}/delete",
        json={"replacement_role_id": roles["Manager"]["id"]},
    )
    assert res.status_code == 403


async def test_project_visibility_and_manager_scope(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    p1 = await _project(client, ws, "Assigned")
    p2 = await _project(client, ws, "Hidden")
    manager, manager_me = await add_member(client, ws, "Manager", project_ids=[p1["id"]])
    member, _ = await add_member(client, ws, "Member")

    listed = [p["name"] for p in (await manager.get(f"/api/workspaces/{ws}/projects")).json()]
    assert listed == ["Assigned"]
    assert (await member.get(f"/api/workspaces/{ws}/projects")).json() == []
    assert (await manager.get(f"/api/workspaces/{ws}/projects/{p2['id']}")).status_code == 404
    # Manager edits assigned project, not the other.
    assert (
        await manager.patch(f"/api/workspaces/{ws}/projects/{p1['id']}", json={"description": "ok"})
    ).status_code == 200
    assert (
        await manager.patch(f"/api/workspaces/{ws}/projects/{p2['id']}", json={"description": "no"})
    ).status_code == 404
    # Manager-created projects are auto-assigned.
    mine = await _project(manager, ws, "Manager's")
    members = (await client.get(f"/api/workspaces/{ws}/projects/{mine['id']}/members")).json()
    assert any(m["user"]["id"] == manager_me["id"] and m["assigned"] for m in members)
    # Search never leaks hidden projects.
    found = (await manager.get(f"/api/workspaces/{ws}/search", params={"q": "Hidden"})).json()
    assert found["projects"] == []


async def test_documents_permissions_versions_and_conflicts(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    project = await _project(client, ws)
    member, _ = await add_member(client, ws, "Member", project_ids=[project["id"]])
    base = f"/api/workspaces/{ws}"

    res = await member.post(
        f"{base}/projects/{project['id']}/documents",
        json={"name": "Runbook", "kind": "normal", "format": "markdown", "content": "# v1"},
    )
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["version"] == 1 and doc["can_edit"] and not doc["can_delete"]

    res = await member.patch(
        f"{base}/documents/{doc['id']}", json={"expected_version": 1, "content": "# v2"}
    )
    assert res.status_code == 200 and res.json()["version"] == 2
    # Stale write is rejected.
    res = await client.patch(
        f"{base}/documents/{doc['id']}", json={"expected_version": 1, "content": "# stale"}
    )
    assert res.status_code == 409
    # Restore v1 creates v3.
    res = await client.post(
        f"{base}/documents/{doc['id']}/versions/1/restore", json={"expected_version": 2}
    )
    assert res.status_code == 200
    assert res.json()["content"] == "# v1" and res.json()["version"] == 3
    versions = (await client.get(f"{base}/documents/{doc['id']}/versions")).json()
    assert [v["version"] for v in versions] == [3, 2, 1] and versions[0]["restored_from"] == 1

    # Members cannot delete; owners can. The env format is secure-only.
    assert (await member.delete(f"{base}/documents/{doc['id']}")).status_code == 403
    res = await client.post(
        f"{base}/projects/{project['id']}/documents",
        json={"name": "x", "kind": "normal", "format": "env"},
    )
    assert res.status_code == 422
    assert (await client.delete(f"{base}/documents/{doc['id']}")).status_code == 200

    # Archived projects are read-only.
    await client.post(f"{base}/projects/{project['id']}/archive")
    res = await member.post(
        f"{base}/projects/{project['id']}/documents",
        json={"name": "Late", "kind": "normal", "format": "text"},
    )
    assert res.status_code == 409


async def test_ownership_transfer(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    admin, admin_me = await add_member(client, ws, "Admin")
    res = await admin.post(
        f"/api/workspaces/{ws}/transfer", json={"user_id": owner["id"], "confirm_name": "Workspace"}
    )
    assert res.status_code == 403
    res = await client.post(
        f"/api/workspaces/{ws}/transfer",
        json={"user_id": admin_me["id"], "confirm_name": "Workspace"},
    )
    assert res.status_code == 200, res.text
    members = (await client.get(f"/api/workspaces/{ws}/members")).json()
    owners = [m for m in members if m["is_owner"]]
    assert len(owners) == 1 and owners[0]["user_id"] == admin_me["id"]
    assert next(m for m in members if m["user_id"] == owner["id"])["role_name"] == "Admin"
    # The old owner can now leave; the new owner cannot.
    assert (await admin.post(f"/api/workspaces/{ws}/leave")).status_code == 409
    assert (await client.post(f"/api/workspaces/{ws}/leave")).status_code == 200


async def test_delete_workspace_requires_owner_and_name(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    admin, _ = await add_member(client, ws, "Admin")
    assert (
        await admin.post(f"/api/workspaces/{ws}/delete", json={"confirm_name": "Workspace"})
    ).status_code == 403
    assert (
        await client.post(f"/api/workspaces/{ws}/delete", json={"confirm_name": "wrong"})
    ).status_code == 400
    assert (
        await client.post(f"/api/workspaces/{ws}/delete", json={"confirm_name": "Workspace"})
    ).status_code == 200
    assert (await admin.get(f"/api/workspaces/{ws}")).status_code == 404


async def test_delete_account_blocked_while_owning_shared_workspace(client: Client) -> None:
    owner = await signup_and_verify(client)
    ws = owner["workspace_id"]
    _, member_me = await add_member(client, ws, "Member")
    body = {"confirm_email": owner["email"], "password": PASSWORD}
    assert (await client.post("/api/account/delete", json=body)).status_code == 409
    await client.delete(f"/api/workspaces/{ws}/members/{member_me['id']}")
    assert (await client.post("/api/account/delete", json=body)).status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_audit_log_records_and_filters(client: Client) -> None:
    ws = (await signup_and_verify(client))["workspace_id"]
    await _project(client, ws, "Audited")
    entries = (
        await client.get(f"/api/workspaces/{ws}/audit", params={"action": "project."})
    ).json()
    assert entries and all(e["action"].startswith("project.") for e in entries)
    assert entries[0]["target_label"] == "Audited"
    signins = (
        await client.get(f"/api/workspaces/{ws}/audit", params={"action": "auth.sign_in"})
    ).json()
    assert signins
    csv_res = await client.get(f"/api/workspaces/{ws}/audit/export.csv")
    assert csv_res.status_code == 200 and "project.created" in csv_res.text
