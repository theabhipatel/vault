Secure Vault keeps you informed in three ways: in-app notifications for things that happen to you, emails for account and security events, and a **Recent activity** feed on each workspace dashboard. This page explains what shows up where.

## The notification centre

The bell in the top bar opens your notifications. A badge on the bell shows how many unread notifications or pending invitations you have (up to **9+**). The app checks for new notifications every 30 seconds.

In the menu:

- **Pending invitations** appear at the top, with **Accept** and **Decline** buttons. See [Members and invitations](/docs/members-and-invitations).
- Recent notifications follow, newest first. Unread ones are highlighted with a dot.
- Select a notification to mark it as read and go to the page it refers to.
- **Mark all read** clears the unread state of everything.
- **View all notifications** opens the **Notifications** page.

Notifications belong to your account, not to a workspace, so you see them whichever workspace you have open.

### The Notifications page

The **Notifications** page shows your pending invitations, then your recent notifications under **Recent**, with a **Mark all read** button. You can also reach it from the command palette (`Ctrl` + `K`, then **Notifications**).

### The Invitations page

The **Invitations** page lists only the workspace invitations waiting for your answer. Invitation emails link here. Invitations expire after 7 days. If one you expected is missing, ask the sender to resend it to the email address you signed up with.

## What triggers a notification

| Notification | Who gets it | When |
|---|---|---|
| *Name* invited you to *workspace* | The invitee, if they already have an account | Someone invites you. It's shown as a pending invitation until you answer |
| *Name* joined *workspace* | Whoever sent the invitation | The invitee accepts |
| *Name* declined the invitation to *workspace* | Whoever sent the invitation | The invitee declines |
| You were added to *project* | The person added | Someone assigns you to a project |
| Your role in *workspace* is now *role* | The member | Someone changes your role |
| You were removed from *workspace* | The member | Someone removes you from a workspace |
| You now own *workspace* | The new owner | Ownership is transferred to you |
| *workspace* was deleted | Every member except the owner | The owner deletes the workspace |
| Set up your vault | You | You create a workspace without having a vault, or gain secure access to a project before setting one up |
| Secure access to *project* is pending | You | You gain secure access to a project that already has a key, and you have a vault. A teammate's browser will share the key |
| Secure access granted to *project* | You | A teammate's browser shared the project key with you. You can now read and edit its secure documents |
| *Name* reset their vault | The owner, and everyone whose role can change member roles (Admins by default), in each workspace the person belongs to | A teammate resets their vault, so their public key changed. Compare their new fingerprint with them before trusting it |
| Wrong vault password entered 5 times | You | Five wrong vault passwords or recovery keys are entered on your account within an hour |
| *document* failed its integrity check | The owner, and everyone whose role can change member roles | Someone's browser couldn't decrypt a secure document, which can mean its stored data was modified. Sent at most once an hour per document |

The vault notifications are explained further in [Sharing access](/docs/sharing-access), [Recovery](/docs/recovery) and [Security model](/docs/security-model).

> [!IMPORTANT]
> If you get a "Wrong vault password entered 5 times" notification and it wasn't you, someone may be signed in to your account. Change your login password and sign out your other devices under **Account settings** → **Security**. See [Accounts](/docs/accounts).

## Emails

Some events also, or only, send email. Emails go to your account's address.

| Email | When |
|---|---|
| Verify your email address | You sign up, or ask for a new verification link |
| Sign-up attempt for your account | Someone tries to sign up with an address that already has an account |
| Reset your password | You use **Forgot password?** or **Email me a link to set one** |
| Your password was changed | Your login password is changed or reset |
| New sign-in to your account | Your account signs in from a browser it hasn't signed in from before |
| *Name* invited you to *workspace* | You're invited to a workspace, or the invitation is resent |
| Your vault password was changed | You change your vault password |
| Your vault was recovered | You use your recovery key to set a new vault password |
| Your vault was reset | You reset your vault |
| Several wrong vault password attempts | Five wrong vault passwords or recovery keys within an hour |

Emails never contain key material or document content. Security emails link to **Account settings** → **Security** so you can review your sessions.

Role changes, project assignments, removals and the other in-app events above don't send email.

If emails don't arrive, see [FAQ](/docs/faq) and [Email and Google sign-in](/docs/email-and-google).

## Recent activity on the dashboard

Each workspace dashboard has a **Recent activity** feed with the latest changes in that workspace. It's meant for keeping up with your team's work, not for auditing.

**It includes** successful changes to projects and documents, such as:

- projects created, updated, archived or restored;
- people added to or removed from projects;
- normal documents created, edited, restored or deleted;
- secure documents created, edited, renamed, restored or deleted.

**It excludes:**

- anything in projects you can't see, including projects that have since been deleted;
- views: opening a document or an old version;
- things that happen in someone's browser: decrypting a secure document, downloading a decrypted copy, and copying or revealing `.env` values;
- failed and refused actions;
- membership, role, invitation, sign-in and vault events.

Select a document or project name in the feed to open it.

For the complete record of everything, including views, sign-ins, vault events and failures, people with the **View audit log** permission can use the [Audit log](/docs/audit-log).
