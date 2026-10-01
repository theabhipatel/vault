Projects group related documents and secrets inside a workspace, such as everything for one service or one client. Each project has its own members and, once it holds secure documents, its own encryption key.

## Create a project

You need the **Create projects** permission (Owner, Admin and Manager by default).

1. Select **New project** on the dashboard or the **Projects** page. You can also use the **+** next to **Projects** in the sidebar, or **New project** in the command palette (`Ctrl` + `K`).
2. Enter a **Name** (up to 100 characters) and an optional **Description**.
3. Select **Create project**.

You're added to the new project automatically and it opens straight away.

## Who can see a project

A project is visible to:

- **Assigned members**: people added to the project, and the person who created it.
- **Roles with Access all projects**: by default the Owner and Admins. They see every project in the workspace without being assigned.

Everyone else doesn't see the project at all. It doesn't appear in their lists, search or dashboard. The **Projects** page reflects this: with **Access all projects** it says "Every project in this workspace", otherwise "The projects you've been assigned to".

What someone can do inside a project they can see comes from their role. A Member can read and edit documents, a Manager can also manage the project, and so on. See [Roles and permissions](/docs/roles-and-permissions).

## Browse projects

- The **sidebar** lists up to eight active projects. A lock icon marks projects with secure documents. **All projects** appears when there are more, or when some are archived.
- The **Projects** page shows every project you can see as cards, with **Active** and **Archived** tabs and a **Filter projects** box. Each card shows the number of normal documents, secure documents and assigned members, plus the last activity.

## The project page

The header shows the project name, its description, and who created it and when.

- **New document** creates a document in this project, if you can create normal or secure documents. See [Documents](/docs/documents) and [Secure documents](/docs/secure-documents).
- The project actions menu (**⋯**) appears if you can edit projects. See below.

The **Documents** tab lists the project's documents, most recently edited first. Use **All**, **Normal** and **Secure** to filter. Secure documents carry a lock and a **Secure** badge. You only see the kinds of documents your role can view.

| | Normal documents | Secure documents |
|---|---|---|
| Protection | Access control | End-to-end encryption in your browser, plus access control |
| Server can read the content | Yes | No |
| Formats | Markdown, Plain text | .env, Markdown, Plain text |
| Needs your vault | No | Yes, unlocked |

The **Members** tab lists everyone who can see the project. Roles with access to all projects are listed automatically, with an **All projects** badge.

## Add and remove people

You need the **Manage project members** permission (Owner, Admin and Manager by default).

**To add people:**

1. Open the project's **Members** tab and select **Add members**.
2. Tick the workspace members to add. People who can already see the project aren't listed.
3. Select **Add**.

Each person gets a notification that they were added.

**To remove someone**, select the remove button on their row and confirm with **Remove**. You can remove assigned people whose role ranks below yours, and yourself. People whose role has **Access all projects** keep seeing the project either way, because the access comes from their role.

You can also set someone's projects all at once from the **Members** page with **Edit project access**. See [Members and invitations](/docs/members-and-invitations).

> [!NOTE]
> Removing someone takes away their access immediately. If they could read secure documents, the project's key is rotated so their old copy stops working for anything saved afterwards. See [Key rotation](/docs/key-rotation).

## Edit, archive and delete

These actions need the **Edit, archive and delete projects** permission, and are in the project actions menu (**⋯**).

### Edit details

Select **Edit details**, change the **Name** or **Description**, and select **Save changes**.

### Archive and restore

Select **Archive project** and confirm. An archived project:

- is read-only for everyone. Nobody can create, edit or delete documents in it, or edit its details;
- disappears from the sidebar and the dashboard, and moves to the **Archived** tab of the **Projects** page;
- keeps all its documents, versions and members.

To make changes again, open the project and select **Restore project**.

### Delete

1. Select **Delete project**.
2. Type the project name exactly.
3. Select **Delete project**.

This permanently deletes the project and all of its documents, including every version. Secure documents are destroyed along with their keys. It can't be undone.

## The project vault banner

When a project has secure documents, a banner at the top of the project page explains your secure-access situation and offers the one action that helps.

| Banner | What it means | What to do |
|---|---|---|
| **Set up your vault to open this project's secure documents** | You're allowed to read secure documents here, but you don't have a vault yet. | Select **Set up vault**. See [Vault setup](/docs/vault-setup). |
| **Secure access pending** | You're allowed in, but nobody has shared the project key with you yet. | Nothing. A teammate's browser shares it automatically the next time their vault is unlocked, and you get a notification. See [Sharing access](/docs/sharing-access). |
| **Key rotation pending** | Shown to key holders. Someone lost access, so the key will be replaced and every secure document re-encrypted. | It happens automatically while a key holder's vault is unlocked. Select **Rotate now** (or **Unlock** first). See [Key rotation](/docs/key-rotation). |
| **This project's secure documents can't be decrypted** | Nobody holds the project key any more, for example after the only key holder reset their vault. | If you can delete secure documents, **Clear and start over** deletes the unreadable ones so the project can get a new key. See [Recovery](/docs/recovery). |

No banner means there's nothing for you to do.
