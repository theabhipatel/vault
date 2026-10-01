A workspace is a team's space in Secure Vault. It has its own members, roles, projects and audit log, and nothing crosses from one workspace to another. You can own several workspaces and belong to others at the same time.

## Create a workspace

### During onboarding

Every new account starts by creating a workspace:

1. After you verify your email, you're asked to name your workspace. The name is prefilled with "*your first name*'s workspace". Use up to 80 characters; you can rename it later.
2. Select **Create workspace**. You become its owner, and it becomes your default workspace.
3. If you don't have a vault yet, you're offered vault setup next. Set it up now, or select **Skip for now**. Everything except secure documents works without a vault. See [Vault setup](/docs/vault-setup).
4. You land on the workspace dashboard.

If someone invited you before you signed up, you still create your own workspace first. Your pending invitations appear as soon as you reach the app. See [Members and invitations](/docs/members-and-invitations).

### Later

1. Open the workspace switcher at the top of the sidebar.
2. Select **Create workspace**.
3. Enter a **Workspace name** and select **Create workspace**.

The new workspace opens right away. It starts with the four built-in roles (Owner, Admin, Manager, Member) and you as the owner. If you haven't set up your vault yet, you also get a "Set up your vault" notification.

## Switch workspaces

Select the workspace switcher at the top of the sidebar. It shows the current workspace and your role in it. The list has two groups:

- **Your workspaces**: the ones you own, with their member count.
- **Shared with you**: the ones you've joined, with your role and the owner's name.

A star marks your default workspace and a check mark shows the current one.

When you open the app at `/app`, Secure Vault takes you to the workspace you last used in this browser. If there isn't one, it opens your default workspace.

### Your default workspace

Your first workspace becomes your default automatically. To change it, open the workspace you want, go to **Settings**, and select **Make this my default**. If you leave or are removed from your default workspace, another one you belong to becomes the default.

## The dashboard

The dashboard is the first page of every workspace. It shows only what you can access.

- **Buttons:** **Invite** (if you can invite members) and **New project** (if you can create projects).
- **Prompts** at the top, when they apply:
  - **Set up your vault**, if you haven't yet, with a **Set up vault** button.
  - **Secure access pending in N projects**, when you're entitled to secure documents but a teammate hasn't shared the project key with you yet. See [Sharing access](/docs/sharing-access).
  - **You have N pending invitations**, with a **Review** button.
- **Stats:** **Active projects**, **Documents you can see** and **Members**.
- **Projects:** up to six of your active projects. **All projects** opens the full list.
- **Recently edited:** the most recently changed documents in your active projects.
- **Recent activity:** the latest changes to projects and documents you can access, such as created, edited, restored or deleted documents and people added to projects. Views and downloads aren't listed. See [Notifications](/docs/notifications) for details.

## Workspace settings

Select **Settings** in the sidebar. Every member can open this page, but what you can do depends on your role.

### Rename the workspace

Change **Workspace name** and select **Save**. This needs the **Manage workspace settings** permission. Everyone in the workspace sees the new name.

### Transfer ownership

Every workspace has exactly one owner. Only the owner sees this section.

1. Under **Transfer ownership**, choose the **New owner** from the list of members.
2. Select **Transfer…**.
3. Type the workspace name to confirm, then select **Transfer ownership**.

The new owner gets full control, including deleting the workspace, and receives a notification. You become an Admin. Only the new owner can transfer ownership back.

### Leave a workspace

If you aren't the owner, the **Danger zone** shows **Leave workspace**. Select it and confirm.

- You immediately lose access to the workspace's projects and documents, and your project assignments are removed.
- If you held project keys there, those projects get a new key, so your old copy stops working for new changes. See [Key rotation](/docs/key-rotation).
- To come back, you need a new invitation.

Owners can't leave. Transfer ownership first, or delete the workspace.

### Delete a workspace

Only the owner can delete a workspace.

1. In the **Danger zone**, select **Delete workspace**.
2. Type the workspace name exactly.
3. Select **Delete workspace forever**.

> [!WARNING]
> Deleting a workspace permanently deletes it for everyone: all projects, documents, versions, secure documents and keys. Nobody can recover it, operators included.

Every other member gets a notification that the workspace was deleted.

## Related

- [Members and invitations](/docs/members-and-invitations)
- [Roles and permissions](/docs/roles-and-permissions)
- [Projects](/docs/projects)
