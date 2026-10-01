People join a workspace by invitation. Each member has exactly one role, which decides what they can do, and a set of assigned projects, which decides where. This page covers inviting people, answering invitations and managing members.

## The Members page

Select **Members** in the sidebar. Everyone in the workspace can see this page. The table shows:

| Column | What it shows |
|---|---|
| **Member** | Name and email. Your own row is marked **You** |
| **Role** | The member's role |
| **Projects** | Their assigned projects, **All projects** if their role can access every project, or **None** |
| **Joined** | When they joined |
| **Vault** | **Ready**, **Access pending** or **Not set up** |
| **Key fingerprint** | A short fingerprint of their vault public key |

Use **Filter by name or email** to narrow the list. Compare fingerprints with teammates over another channel, such as in person or on a call, before trusting them with secrets. See [Security model](/docs/security-model).

## Invite people

You need the **Invite members** permission. Managers, Admins and the Owner have it by default.

1. Select **Invite people** on the Members page, **Invite** on the dashboard, or **Invite people** at the bottom of the sidebar.
2. Enter the **Email address**.
3. Choose a **Role**. The list only shows roles you're allowed to give: ranked below your own, and with no permission you don't hold yourself. The role's description appears under the list.
4. Under **Projects**, tick the projects they should see. This section appears only if you have the **Manage project members** permission. If the chosen role can access every project, it says so instead.
5. Select **Send invitation**.

The invitation expires after 7 days. You can't invite someone who is already a member, or someone who already has a live pending invitation (resend that one instead). Each person can send up to 60 invitations an hour.

### What the invitee receives

- **Everyone** gets an email titled "*Your name* invited you to *workspace*", naming the role.
- **People who already have an account** also get an in-app notification, and the email links to their **Invitations** page.
- **People without an account** get a **Create your account** link that opens sign-up with their email filled in. After they sign up and verify, the invitation is waiting for them.

The invitation belongs to the email address. The invitee must sign in with that exact address, and it must be verified.

## Manage pending invitations

The **Pending** tab on the Members page lists invitations nobody has answered yet. You see it if you can invite members. Each row shows the email, role, projects, who invited them and when it expires. Expired invitations show an **Expired** badge.

- **Resend** emails the invitation again and resets the expiry to 7 days from now. Wait at least a minute between resends.
- **Revoke** cancels the invitation after you confirm with **Revoke invitation**. The link in their email stops working. You can invite them again later.

You can only resend or revoke invitations for roles ranked below your own.

## Accept or decline an invitation

Pending invitations show up in several places:

- A **You've been invited** dialog when you open the app. Select **Decide later** to close it. It reappears in your next browser session.
- The top of the notifications menu (the bell).
- The **Pending invitations** section of the **Notifications** page.
- A **You have N pending invitations** alert on the dashboard, with a **Review** button.
- The **Invitations** page, which the invitation email links to.

Each invitation shows the workspace, who invited you and your role. Select **Accept** or **Decline**.

- **Accept** adds you to the workspace with that role and the projects listed in the invitation. The person who invited you gets a notification. If you don't have a default workspace yet, this one becomes your default.
- **Decline** closes the invitation. The person who invited you gets a notification.

If your role includes secure-document access, you may see "Secure access pending" in some projects until a teammate's browser shares the project key with you. That happens automatically. See [Sharing access](/docs/sharing-access).

## Manage members

Open the actions menu (**⋯**) at the end of a member's row. You only see the actions you're allowed to take on that person.

### Change a member's role

Select **Change role** and pick the new role. You need the **Change member roles** permission, and:

- the member's current role must rank below yours;
- the new role must rank below yours, and you must hold every permission it contains (the Owner is exempt from this);
- you can't change your own role;
- nobody can change the owner's role, and nobody can be given the Owner role. Ownership can only be transferred. See [Workspaces](/docs/workspaces).

The member gets a notification about their new role.

### Edit project access

Select **Edit project access**, tick the projects the member should see, and select **Save access**. You need the **Manage project members** permission, and you can only assign projects you can see yourself.

- Anyone with the permission can **add** a member to a project.
- **Removing** someone from a project requires their role to rank below yours. You can always remove yourself.
- This option isn't shown for members whose role can access all projects, because they already see everything.

The member gets a notification for each project they're added to. You can also manage access from a project's **Members** tab. See [Projects](/docs/projects).

### Remove a member

Select **Remove from workspace** and confirm with **Remove member**. You need the **Remove members** permission, and the member's role must rank below yours. You can't remove the owner, and you can't remove yourself (use **Leave workspace** in **Settings** instead).

The member immediately loses access to the workspace and all of its projects, and gets a notification.

> [!NOTE]
> Removing someone, or taking away their secure-document access, rotates the keys of projects where they held a key. Copies they may still have stop working for anything saved afterwards. Content they could already read before can't be taken back. See [Key rotation](/docs/key-rotation).

## Who can manage whom

The rule is the same everywhere: **you can only manage people whose role ranks strictly below yours**, and you can only grant permissions you hold yourself. The server enforces this on every request.

| You are | You can manage |
|---|---|
| Owner | Everyone else, including Admins |
| Admin | Managers, Members and custom roles ranked below Admin. Not other Admins |
| Manager | Members and custom roles ranked below Manager, within the permissions Managers have |
| Member | Nobody, by default |

What each role can actually do depends on its permissions. See [Roles and permissions](/docs/roles-and-permissions).
