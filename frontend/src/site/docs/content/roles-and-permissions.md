A role decides **what** someone can do in a workspace. Project assignment decides **where** they can do it. Roles are ranked from most to least powerful, and the ranking controls who can manage whom.

## Built-in roles

Every workspace starts with four roles, from highest to lowest rank:

| Role | Description in the app | Starting rank |
|---|---|---|
| **Owner** | Full control of the workspace. Exactly one per workspace. | 1000 |
| **Admin** | Manages everything and everyone except the owner and admins. | 900 |
| **Manager** | Runs the projects they are assigned to. | 500 |
| **Member** | Works on documents in their assigned projects. | 100 |

Rank numbers are internal. The **Roles & permissions** page shows each role's position (1, 2, 3 and so on) instead, and positions are renumbered automatically when you add or move roles.

The Owner role is special. It always has every permission, it can't be edited, assigned or deleted, and it can only change hands through ownership transfer. See [Workspaces](/docs/workspaces). The other built-in roles can be edited by someone who ranks above them, but can't be deleted.

## Permissions

There are 16 permissions in four groups. The labels match what you see in the role editor.

### Workspace

| Permission | What it allows |
|---|---|
| **Manage workspace settings** | Rename the workspace and change its settings. |
| **Invite members** | Invite people by email with a role ranked below their own. Also lets them see, resend and revoke pending invitations. |
| **Remove members** | Remove members whose role ranks below their own. |
| **Change member roles** | Change the role of members ranked below them. |
| **Manage roles** | Create, edit and delete roles ranked below their own. |
| **View audit log** | See and export the workspace audit log. See [Audit log](/docs/audit-log). |

### Projects

| Permission | What it allows |
|---|---|
| **Access all projects** | See every project, not only assigned ones. |
| **Create projects** | Create new projects. The creator is added to the new project automatically. |
| **Edit, archive and delete projects** | Rename, describe, archive, restore and delete projects they can access. |
| **Manage project members** | Assign people to projects they can access. |

### Normal documents

| Permission | What it allows |
|---|---|
| **View** | Read normal documents. |
| **Create and edit** | Create and edit normal documents, and restore old versions. |
| **Delete** | Delete normal documents. |

### Secure documents

| Permission | What it allows |
|---|---|
| **View** | Decrypt and read secure documents. Grants a copy of the project key. |
| **Create and edit** | Create and edit secure documents. |
| **Delete** | Delete secure documents. |

Every project-level permission applies only inside projects the person can see: projects they're assigned to, or every project if their role has **Access all projects**.

## Default permissions per role

| Permission | Owner | Admin | Manager | Member |
|---|:---:|:---:|:---:|:---:|
| Manage workspace settings | Yes | Yes | | |
| Invite members | Yes | Yes | Yes | |
| Remove members | Yes | Yes | | |
| Change member roles | Yes | Yes | | |
| Manage roles | Yes | Yes | | |
| View audit log | Yes | Yes | | |
| Access all projects | Yes | Yes | | |
| Create projects | Yes | Yes | Yes | |
| Edit, archive and delete projects | Yes | Yes | Yes | |
| Manage project members | Yes | Yes | Yes | |
| Normal documents: View | Yes | Yes | Yes | Yes |
| Normal documents: Create and edit | Yes | Yes | Yes | Yes |
| Normal documents: Delete | Yes | Yes | Yes | |
| Secure documents: View | Yes | Yes | Yes | Yes |
| Secure documents: Create and edit | Yes | Yes | Yes | Yes |
| Secure documents: Delete | Yes | Yes | Yes | |

These are the starting values. Apart from the Owner, anyone with the right rank and the **Manage roles** permission can change them for their workspace.

## The Roles & permissions page

Select **Roles** in the sidebar. You see it if your role has **Manage roles** or **Change member roles**. Roles are listed from highest to lowest rank. Each shows a **Built-in** or **Custom** badge, how many members have it, and how many permissions it has.

- **Edit** opens the role editor for roles you can change. **View** opens it read-only for roles you can't, such as your own role or roles at or above your rank.
- The delete button (trash icon) appears only on custom roles you can manage.

## Custom roles

### Create a role

You need the **Manage roles** permission.

1. Select **New role**.
2. Enter a **Name** (up to 50 characters, unique in the workspace) and an optional **Description**.
3. Under **Rank**, choose where it sits: **Directly below** an existing role. You can only place a role below your own.
4. Tick its permissions. New roles start with Normal documents **View** ticked. Permissions you don't hold yourself are greyed out with "You don't hold this permission."
5. Select **Create role**.

The new role can now be assigned when inviting people or changing roles.

### Edit a role

Select **Edit**, change the name, description, rank or permissions, and select **Save role**. Changes apply immediately to everyone with that role.

You can't edit your own role, roles ranked at or above yours, or the Owner role. You can only add or remove permissions you hold yourself.

### Delete a role

1. Select the trash icon next to the role.
2. If anyone has the role, choose a **Replacement role**. Its members, and any pending invitations for it, move to that role.
3. Select **Delete role**.

Built-in roles can't be deleted.

## Hierarchy rules

The server enforces these rules on every request, whatever the UI shows:

- **Rank.** You can only manage people, invitations and roles ranked **strictly below** your own. Two Admins can't change each other's role or remove each other. Only the Owner can manage Admins and edit the Admin role.
- **Grants.** You can only grant or remove permissions you hold yourself. That applies to creating roles, editing roles, inviting people and assigning roles. The Owner is exempt.
- **Yourself.** You can't change your own role or edit your own role's permissions.
- **Owner.** There is always exactly one owner. The owner can't be removed, demoted or managed by anyone else.

See [Members and invitations](/docs/members-and-invitations) for how these rules apply to inviting, changing roles and removing people.

## Secure-document permissions and vault keys

Permissions decide who is **allowed** to read secure documents. Encryption decides who is **able** to. Someone has secure access to a project when:

1. their role has Secure documents **View**, and
2. they can see the project (they're assigned to it, or their role has **Access all projects**).

Any change that alters this, such as a role change, a permission change, a project assignment or a removal, updates secure access straight away:

- **Gaining access.** The person needs a vault. If the project already has a key, their access shows as pending until a teammate who holds the key unlocks their vault. That teammate's browser then shares the key automatically. See [Sharing access](/docs/sharing-access).
- **Losing access.** The server deletes their copy of the project key immediately. If they ever held it, the project is marked for key rotation, and the next key holder's browser re-encrypts every secure document with a new key. See [Key rotation](/docs/key-rotation).

> [!TIP]
> Secure documents **Create and edit** and **Delete** only work together with Secure documents **View**. Creating or saving a secure document needs a copy of the project key, and only **View** gives you one.

Admins and the Owner have **Access all projects** and Secure documents **View** by default, so they can read the secure documents of every project once a key holder has shared the key with them. Your vault password and private key stay yours, but secure documents belong to projects, not to individuals.
