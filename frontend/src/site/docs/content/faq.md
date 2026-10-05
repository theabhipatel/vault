Quick answers to the questions people ask most often, and fixes for common problems. If your question isn't here, check [Core concepts](/docs/core-concepts) or open an issue on [GitHub](https://github.com/theabhipatel/vault).

## General

### What's the difference between a normal and a secure document?

A **normal document** is protected by access control. The server stores it readable, so it suits runbooks, notes and guides. A **secure document** is end-to-end encrypted in your browser before it's saved. The server only ever stores ciphertext, so it suits passwords, API keys and `.env` files. You choose the type when you create a document and can't change it later. See [Documents](/docs/documents) and [Secure documents](/docs/secure-documents).

### Who built Secure Vault?

Secure Vault is designed and developed by [TheAbhiPatel](https://www.theabhipatel.com/) (Abhishek Patel), a full stack developer and DevOps engineer. The source code is on [GitHub](https://github.com/theabhipatel/vault), and more projects are on the [TheAbhiPatel portfolio](https://www.theabhipatel.com/).

### Is there a hosted version, or do I have to self-host?

Secure Vault is self-hosted software: you or your organisation run the server. See [Self-hosting](/docs/self-hosting) and [Production](/docs/production). If you try an instance someone else runs, for example a public demo, remember that its operator controls the server and the app it serves. Don't store real secrets on a server you don't trust.

### I was invited to a workspace. Why am I asked to create one?

Every new account starts by creating its own workspace during onboarding. Name it and continue; you can skip vault setup for now. As soon as you reach the app, your pending invitations pop up so you can accept them. See [Members and invitations](/docs/members-and-invitations).

### Why can't I see a project, or the Roles or Audit log pages?

You only see projects you're assigned to, unless your role has **Access all projects**. Ask someone with **Manage project members** (a Manager or Admin, by default) to add you. **Roles** appears only if your role can manage roles or change member roles, and **Audit log** only if it can view the audit log. See [Roles and permissions](/docs/roles-and-permissions).

### Can I use Secure Vault on my phone?

Yes, in a mobile browser. The layout adapts to small screens and the sidebar becomes a slide-out menu. The side-by-side Markdown preview is only offered on wider screens. There's no native mobile app.

### Does it work offline?

No. Every page loads its data from your Secure Vault server, so you need a connection to it. Your vault keys also live only in the memory of the open tab, never on disk.

## Vault and encryption

### I forgot my vault password. What now?

Use your recovery key. In the unlock dialog select **Use your recovery key**, or go to **Account settings** → **Vault** and select **Forgot it? Use your recovery key**. You'll set a new vault password and get a new recovery key. If you've lost both, you can reset your vault, but secure documents that only you could read are lost for good. See [Recovery](/docs/recovery).

Nobody else can reset your vault password: not an Admin, not the workspace owner and not the server operator.

### I forgot my login password. What now?

Select **Forgot password?** on the sign-in page and follow the emailed link. It expires after 60 minutes. This changes your login password only; your vault password and secure documents are unaffected. See [Accounts](/docs/accounts).

### Can admins read my secure documents?

Secure documents belong to projects, not to people. Anyone whose role has Secure documents **View** and who can see the project can read that project's secure documents, once a key holder's browser has shared the key with them. By default the Owner and Admins can see every project, so yes, they can read them. Nobody can open your vault or learn your vault password. See [Roles and permissions](/docs/roles-and-permissions).

### Can the server operator read my secrets?

Not from stored data. The server holds only ciphertext, sealed keys and public keys, and never receives your vault password or decrypted content. Normal documents are a different matter: the server can read them.

There's one important limit. Someone who controls the **live** server could change the app it sends to your browser and capture secrets the next time you unlock. Run Secure Vault on infrastructure you trust. See [Security model](/docs/security-model) and [Limitations](/docs/limitations).

### Why do I see "Secure access pending"?

You're allowed to read the project's secure documents, but nobody has shared the project key with you yet. The key can only be shared by the browser of a teammate who already holds it, while their vault is unlocked. It happens automatically, with no action from them, and you get a **Secure access granted** notification. If it's taking long, ask a teammate with access to unlock their vault. See [Sharing access](/docs/sharing-access).

### Why did my vault lock?

Your vault locks when:

- you're inactive for the auto-lock time (15 minutes by default; choose 5, 15, 30 or 60 under **Account settings** → **Vault** → **Lock automatically after**);
- you reload or close the tab, or open the app in a new tab;
- you sign out;
- you select **Lock now**.

This is deliberate: your keys live only in the tab's memory. See [Unlocking](/docs/unlocking).

### A secure document "failed its integrity check". What does that mean?

The encrypted data didn't pass authentication when your browser tried to decrypt it. It may have been modified on the server, or moved to a different location. Your browser refuses to show it, and the workspace owner and Admins get a notification. They should review the [Audit log](/docs/audit-log) and the server.

### I'm warned that a teammate's key has changed

That happens when a teammate resets their vault, but it's also what an attacker controlling the server would do. Before selecting **Fingerprint matches, share**, ask the teammate to read their fingerprint from **Account settings** → **Vault** over a call or in person. If you're unsure, select **Don't share now**. See [Security model](/docs/security-model).

## Self-hosting

### Why don't emails arrive?

- **Local development:** emails never leave your machine. Open Mailpit at `http://localhost:29825` to read them.
- **Production:** check the `SMTP_*` and `MAIL_FROM` settings, and your spam folder. Failed sends are retried automatically several times before they're given up. See [Email and Google sign-in](/docs/email-and-google) and [Configuration](/docs/configuration).
- **Rate limits:** each address gets at most 5 sign-up, verification and reset emails per 30 minutes by default.

Also note that sign-up and **Forgot password?** always say a message is on its way, even when the address can't receive one. That's deliberate, so nobody can probe for accounts.

### The dev script says a port is already in use

The script stops with "Port 29100 is already in use" (or 29180) when something is listening there, usually an earlier run of the script. Stop that process and try again. To use different ports, see the port table in [Self-hosting](/docs/self-hosting).

### Scripts fail on Windows with line-ending errors

The repository keeps Unix (LF) line endings for shell scripts and files used inside containers, and Windows (CRLF) endings only for the `.cmd` and `.ps1` launchers. Errors such as `/bin/bash^M: bad interpreter` mean some files were converted. Clone the repository again with Git, or reset the files in your existing clone:

```bash
# Warning: discards uncommitted changes
git rm --cached -r -q .
git reset --hard
```

On Windows without WSL, start the app with `scripts\dev.cmd`. With WSL, clone into your Linux home directory, not `/mnt/c`.

### How do I back up Secure Vault?

Everything lives in the PostgreSQL database: accounts, workspaces, documents, encrypted secure documents, sealed keys and the audit log. Back up the database regularly, for example with the production stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U vault vault > vault-backup.sql
```

Keep your `.env.prod` too. Secure documents in a backup are still encrypted, so restoring a backup doesn't help anyone who has lost both their vault password and recovery key. See [Production](/docs/production).

### How do I turn on Google sign-in?

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and register `<APP_URL>/api/auth/google/callback` as the redirect URI in Google Cloud. The Google buttons appear only when both are set. See [Email and Google sign-in](/docs/email-and-google).

## Troubleshooting

### "Too many attempts. Please try again in about N minutes."

You hit a rate limit. After 5 failed sign-ins for one email address, sign-in for that address pauses for up to 15 minutes. Wait, or reset your password by email, which clears the lockout. See [Accounts](/docs/accounts).

### Sign-in says "Verify your email first"

Your password was right, but you haven't verified your email address yet. Select **Send a new link** on the sign-in page and open the newest email. Verification links expire after 48 hours and work once.

### "Someone else saved a newer version"

A teammate saved the document while you were editing. Copy your changes, select **Load latest**, then re-apply them and save. See [Documents](/docs/documents).

### I can't delete my account

You own a workspace that still has other members. The error names it. Transfer ownership to another member or remove the other members, then try again. See [Workspaces](/docs/workspaces).

### I can't leave a workspace

Owners can't leave. Transfer ownership in **Settings** first (you become an Admin, then you can leave), or delete the workspace.
