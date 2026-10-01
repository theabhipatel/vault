Each workspace has an audit log: an append-only record of who did what, when, from where, and whether it worked. It covers sign-ins, vault activity, membership, permissions, projects and documents. It never contains secret content.

## Who can view it

You need the **View audit log** permission ("See and export the workspace audit log."). The default **Owner** and **Admin** roles have it. You can add it to custom roles in [Roles and permissions](/docs/roles-and-permissions).

Open **Audit log** from the sidebar. It only appears there if you have the permission. Going to the page directly without it shows **Audit log unavailable**.

## What's recorded

Every entry records the action, who did it, the target, the project, the time, the IP address and device, the result, and structured details. Actions fall into these groups, which are also the options in the **Action** filter:

| Group | Examples |
|---|---|
| **Sign-in & account** | Signed in, Signed out, Created account, Reset password, Signed out a device |
| **Members** | Joined workspace, Left workspace, Removed member, Changed role |
| **Invitations** | Invited, Resent invitation, Revoked invitation, Accepted invitation |
| **Roles & permissions** | Created role, Updated role, Deleted role |
| **Workspace** | Created workspace, Renamed workspace, Transferred ownership |
| **Projects** | Created project, Archived project, Added to project, Removed from project |
| **Documents** | Created document, Viewed document, Edited document, Viewed old version, Restored version |
| **Secure documents** | Created secure document, Fetched secure document, Fetched old secure version, Decrypted secure document, Copied a secret value, Denied access to secure document |
| **Vault & keys** | Set up vault, Unlocked vault, Wrong vault password, Locked vault, Reset vault, Created project key, Shared project key, Rotated project key, Secure access revoked |

### Account-level events

Some events belong to your account rather than one workspace: sign-ins and vault events such as unlocking or a wrong vault password. These appear in the audit log of **every workspace you belong to**, so each workspace's admins can see them.

### Refused access

If someone tries to open a secure document they aren't allowed to read, the attempt is recorded as **Denied access to secure document** with the result `denied`.

## Server-recorded vs browser-reported events

Most events are **recorded by the server** as part of the request it handles: saves, fetches, permission changes, key grants and so on.

Some things never reach the server, though. Your vault password and decrypted content stay on your device. The server can't see you type a wrong vault password or decrypt a document, so your browser reports those events instead:

- wrong vault passwords and recovery keys, with the attempt count in that tab and a server-side count of **Failures in the last hour**;
- unlocking, and locking, with the reason: **Locked by the user**, **Auto-lock after inactivity** or **Signed out**;
- successful decryption of a document or version;
- **integrity-check failures**, where encrypted data failed to authenticate;
- downloading a decrypted copy;
- copying a `.env` value, and revealing values (with a count).

These rows have a small device icon in the **Action** column. Their details panel says "Reported by the user's browser."

Browser reports carry only event names, fixed values and numbers. They never include free text, `.env` key names or values. They're rate limited. Reveals and copies are reported at most once a minute per document.

> [!NOTE]
> Browser-reported events are best effort. A modified client could leave them out, and someone who copied an encrypted key blob could guess passwords offline without the server ever knowing. The real defence against guessing is Argon2id plus a strong vault password. These reports catch everyday mistakes and misuse through the normal app. See [Known limitations](/docs/limitations).

## The details panel

Click any row to open its details panel. It shows the action's label and result, the raw action name (for example `vault.unlock_failed`), and whether the server recorded it or the browser reported it. It also shows:

| Field | What it shows |
|---|---|
| **When** | Local date and time, plus the exact UTC timestamp |
| **Who** | Name and email of the person who acted |
| **Target** | What was acted on, with its type and ID |
| **Project** | The project, if any |
| **IP address** | Where the request came from |
| **Device** | A readable browser and OS, plus the full user agent |
| **Details** | Extra fields for that action, such as **Version**, **Key version**, **Method**, **Reason**, **Attempt in this tab**, **Failures in the last hour** or **Values** |

## Filtering

Filters sit above the table:

- **Member**: one person, or **Anyone**.
- **Project**: one project, or **All projects**.
- **Action**: one of the groups above, or **All actions**.
- **From** and **To**: a date range.

Click **Clear** to remove all filters. The newest events come first. Click **Load older events** to see more.

## Exporting to CSV

Click **Export CSV** to download the log as a spreadsheet. The export uses your current filters and includes up to 100,000 rows. Columns:

```text
time_utc,actor_name,actor_email,action,result,target_type,target,project,ip,user_agent,details
```

Cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe, so spreadsheet apps don't run them as formulas.

## Results

Each entry has one of three results:

| Result | Meaning |
|---|---|
| `success` | The action happened |
| `failure` | The action was attempted but failed, for example a wrong vault password or a failed integrity check |
| `denied` | The server refused it, for example an attempt to read a secure document without access |

## Alerts

Two kinds of event also alert people directly.

**Repeated wrong vault secrets.** When the fifth wrong vault password or recovery key within an hour is reported, the account owner gets:

- an email, **Several wrong vault password attempts**, and
- an in-app notification, **Wrong vault password entered 5 times**, with advice to change the login password and sign out other devices if it wasn't them.

**Integrity-check failures.** If a browser can't decrypt a secure document because its data failed authentication, the stored data may have been tampered with. The workspace owner and everyone whose role can change member roles (admins by default) get a notification telling them to review the audit log. This happens at most once per document per hour.

## What's never logged

The audit log never contains document content, `.env` values or key names, vault passwords, recovery keys, private keys, project keys, or any other key material.

## Append-only

Entries can't be edited or deleted, by anyone. A PostgreSQL trigger rejects every `UPDATE`, `DELETE` and `TRUNCATE` on the audit table, so even the application's own code can't rewrite history.
