This page defines the building blocks of Secure Vault and shows how they fit together. Read it once and the rest of the docs will make more sense.

## The big picture

```text
Account (you)
 ├─ Vault: your keypair, protected by your vault password and recovery key
 └─ Memberships
     └─ Workspace ── has ──► Roles (ranked) and an Audit log
         └─ Member (account + one role)
             └─ sees ──► Projects
                          ├─ Normal documents (access control)
                          └─ Secure documents (encrypted with the project key)
                               └─ Project key ── sealed per member ──► Grants
```

Access control decides **who is allowed** to see something. Encryption decides **who is able** to read a secure document. Secure documents need both.

## Accounts

An **account** is you: a name, an email address, an optional avatar and your sign-in methods. You sign in with an email and a **login password**, or with Google if the server has it turned on. A Google account and an email account with the same verified address are the same account.

Your login password only signs you in. It never encrypts anything. Changing or resetting it signs out your other devices. See [Accounts](/docs/accounts).

## Workspaces

A **workspace** is a team's space. It holds projects, members, roles and an audit log. You can own several workspaces and be a member of others, and switch between them at any time. Your first workspace, which you create during sign-up, becomes your default.

Nothing crosses workspace boundaries: a project, document or role belongs to exactly one workspace. See [Workspaces](/docs/workspaces).

## Members

A **member** is an account that belongs to a workspace. Each member has exactly one role in that workspace. People join by **invitation**: someone with permission to invite enters an email address, picks a role and, optionally, the projects the new member gets. Invitations expire after 7 days by default. See [Members and invitations](/docs/members-and-invitations).

## Roles

A **role** is a named set of permissions with a **rank**. Every workspace starts with four roles, from highest to lowest:

| Role | What it's for |
|---|---|
| **Owner** | Full control of the workspace. Exactly one per workspace. It can't be assigned or edited, only transferred. |
| **Admin** | Manages everything and everyone except the owner and other admins. |
| **Manager** | Runs the projects they're assigned to: invites people, creates and edits projects, manages project members, and works on normal and secure documents. |
| **Member** | Works on documents in their assigned projects: views and edits normal and secure documents. |

You can also create **custom roles** anywhere below your own rank. Two rules always apply, and the server enforces them on every request:

- You can only manage people and roles ranked **strictly below** your own.
- You can only grant permissions **you hold yourself**.

See [Roles and permissions](/docs/roles-and-permissions).

## Projects

A **project** groups related documents, for example one per service or environment. Members only see the projects they're assigned to, unless their role has **Access all projects**. Projects can be archived. See [Projects](/docs/projects).

## Normal documents

A **normal document** is plain text or Markdown, protected by access control. The server stores it readably, so it's simple and searchable. Every save creates a new version you can look back at. Use normal documents for notes, runbooks and guides, never for secrets. See [Documents](/docs/documents).

## Secure documents

A **secure document** is plain text, Markdown or a `.env` file that your browser encrypts before it leaves your device. The server only stores ciphertext. To read or write one, your role needs the secure-document permissions for that project, and you need an unlocked vault that holds the project key. The `.env` format gets a table editor with per-value reveal and copy. Names stay unencrypted. See [Secure documents](/docs/secure-documents).

You choose normal or secure when you create a document. You can't switch later.

## The vault

Your **vault** is your personal set of encryption keys. Every account has its own, and it's the same across all your workspaces.

- **Keypair.** When you set up your vault, your browser generates an X25519 keypair. The public key is stored in the clear so teammates can share keys with you. The private key is stored only in encrypted form.
- **Vault password.** It encrypts your private key. It's separate from your login password, never leaves your device, and can't be reset by email. You enter it to **unlock** the vault. The vault locks again after inactivity (15 minutes by default), on sign-out, and on reload or tab close.
- **Recovery key.** A second, random key that also decrypts your private key. It's shown once, at setup. If you forget your vault password, the recovery key lets you set a new one without losing access.
- **Fingerprint.** A short code derived from your public key. Teammates can compare it with you outside the app to confirm nobody swapped your key.

If you lose both your vault password and your recovery key, the only option is a **vault reset**: you get a new keypair and wait for teammates to share project keys again. See [Setting up your vault](/docs/vault-setup), [Unlocking](/docs/unlocking) and [Recovery](/docs/recovery).

| | Login password | Vault password |
|---|---|---|
| Used for | Signing in | Decrypting your private key, in your browser |
| Seen by the server | Yes, stored as an Argon2id hash | Never |
| Forgot it? | Reset it by email | Use your recovery key |
| Google users | None, unless they choose to set one | Always needed for secure documents |

## Project keys

Each project that has secure documents has a **project key**: a random 256-bit key that encrypts every secure document and every version in that project. The browser of whoever creates the first secure document generates it.

Project keys have **versions**. When someone loses secure access after having held the key, the project is marked for **rotation**. The next key holder's browser creates a new key version, re-encrypts everything, and shares the new key only with the people who should still have it. See [Key rotation](/docs/key-rotation).

## Grants

A **grant** is one copy of a project key, sealed to one member's public key. Only that member's private key can open it. You have secure access to a project when your role can view secure documents, you can see the project, and you hold a grant for the current key version.

Grants happen automatically. When someone becomes entitled (a new member, a role change, a project assignment) and has a vault, the server marks a **pending grant**. The next time any key holder's vault is unlocked, their browser seals the key for the new person in the background. Until then, the new person sees **Secure access pending**. See [Sharing and access](/docs/sharing-access).

## Audit log

Each workspace has an append-only **audit log**. Every entry records who did what, when, from where (IP address and user agent), the result (`success`, `failure` or `denied`) and structured details. The database rejects any attempt to change or delete entries.

It covers sign-ins, membership and role changes, document activity, every secure-document fetch, key creation, grants, rotations and vault events. Some events only happen in your browser, such as unlocks and wrong vault passwords. The browser reports these, and they're marked as reported by the browser. The log never contains document content, passwords or key material.

Roles with **View audit log** can browse, filter and export it. See [Audit log](/docs/audit-log).
