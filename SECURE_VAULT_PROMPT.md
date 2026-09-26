# Build: Secure Team Vault (working name "Vault", rename freely)

You are building a production-grade, self-hosted, multi-workspace team vault. Teams use it to store two kinds of documents inside projects: **normal documents** (plain text or markdown notes) and **secure documents** (for example `.env` files, API keys, credentials) that are **end-to-end encrypted in the browser**, so the server can never read them.

This document is the requirements. It says **what** to build and **how the encryption must behave**. Everything else (API design, data model, folder structure, libraries not named here, state management, etc.) is your decision. Work autonomously. If something is not mentioned but any serious product of this kind would obviously have it, build it.

---

## 1. Tech stack (fixed)

**Frontend**
- React (latest stable) + TypeScript (strict, no `any`) + Vite.
- Tailwind CSS v4 (v4 syntax only, no `tailwind.config.js`).
- shadcn/ui components, restyled through a custom theme (see section 9).
- Light, dark and system theme modes.

**Backend**
- Python + FastAPI, fully typed.
- Database, ORM, migrations, email delivery and background work: your choice, production-grade (a relational database such as PostgreSQL is expected).

**Setup rule (to save tokens and avoid hand-written boilerplate)**
- Scaffold the frontend with the official tool: `npm create vite@latest` with the React + TypeScript template.
- Add Tailwind v4 the official way (its Vite plugin, per the Tailwind docs).
- Initialise shadcn with `npx shadcn@latest init` and add every component with `npx shadcn@latest add <component>`. Never hand-write a component the CLI can generate; install it, then style it through the theme.
- Install backend packages with standard tooling (uv or pip). Never hand-write generated files or lockfiles.

**Running it**
- One documented way to run everything locally (Docker Compose for the database and a local mail catcher is recommended).
- `.env.example` files listing every setting, and a README covering setup, architecture, the security model and its known limitations.

---

## 2. Accounts and authentication

- Sign up with email + password, with email verification.
- Sign in with Google. A Google account and an email account with the same verified email are the same user.
- Forgot password / reset password by email. Change password from settings.
- The **login password** only signs the user in. It is completely separate from the **vault password** (section 6) and is never used for encryption. Google users have no login password but still set a vault password.
- Profile: name, avatar, email, theme preference.
- Active sessions list, with "sign out this device" and "sign out all other devices".
- Delete account (blocked while the user owns a workspace that has other members, until ownership is transferred).
- Standard protections: rate limiting and lockout on sign in, reset and verification; generic error messages that do not reveal whether an email exists; secure session handling (no tokens in browser storage or URLs).

---

## 3. Onboarding flow

1. User signs up or signs in with Google.
2. **First sign in:** the user is asked to name their first workspace. This becomes their **default workspace** (they are its owner). Every user goes through this, including users who were invited by someone else.
3. **After the workspace is created**, gently prompt the user to create their vault password. It is **skippable**. If skipped:
   - a dismissible banner and an in-app notification keep reminding them,
   - everything works except secure documents, which show a locked state with a "Set up your vault" call to action.
4. **Pending invitations:** if the user has pending workspace invitations, show them in an in-app popup after sign in (after the first workspace step for new users). Accept or decline right there. If skipped, they remain in the notification centre until acted on or expired.

---

## 4. Workspaces, members and invitations

- A user can own many workspaces and be a member of many others. A workspace switcher shows both, clearly separated ("Your workspaces" / "Shared with you").
- Owners (and roles with permission) invite people by email, choosing a role and optionally which projects they get.
  - Existing users: in-app popup + notification + email.
  - New users: email with a sign-up link; the invitation is waiting for them after sign-up.
  - Invitations expire (7 days), can be resent and revoked, and are listed as pending.
- Members list: name, email, role, projects, joined date, vault status (set up or not, secure access pending), key fingerprint (section 7.6).
- Remove a member, change a member's role, leave a workspace (not allowed for the owner).
- Workspace settings: rename, transfer ownership (owner only, to an existing member), delete workspace (owner only, strong confirmation by typing the name).
- Exactly one owner per workspace at all times.

---

## 5. Roles and permissions

### 5.1 Model
- Each member has one role per workspace. The role decides **what** they can do; project assignment decides **where**.
- Members see only the projects they are assigned to, unless their role has "access all projects".
- Default roles, ranked: **Owner > Admin > Manager > Member**. Custom roles can be created and placed in this ranking.
- **Owner** always has every permission. The Owner role cannot be edited, deleted or given to a second person (only transferred).
- **Hierarchy rules** (enforced on the server, never trusted from the client):
  - A user can only manage users whose role ranks below their own.
  - A user can only grant permissions they hold themselves.
  - Only the owner manages admins and edits the Admin role.
  - Admins manage everything and everyone except the owner and other admins, including editing the Manager and Member roles' permissions.
  - Managers and members have exactly the permissions an owner or admin gives their role.
- Owners and admins (or any role granted "manage roles") can create, edit and delete custom roles. Deleting a role in use requires choosing a replacement role for its members.

### 5.2 Permissions
Workspace: manage workspace settings, invite members, remove members, change member roles, manage roles, view audit log.
Projects: access all projects, create projects, edit/archive/delete projects, manage project members.
Normal documents: view, create and edit, delete.
Secure documents: view, create and edit, delete.

### 5.3 Defaults (editable as per 5.1, except Owner)

| Permission | Owner | Admin | Manager | Member |
|---|---|---|---|---|
| Manage workspace settings | yes | yes | no | no |
| Delete workspace / transfer ownership | yes | no | no | no |
| Invite members | yes | yes | yes | no |
| Remove members / change roles | yes | yes (below admin) | no | no |
| Manage roles | yes | yes | no | no |
| View audit log | yes | yes | no | no |
| Access all projects | yes | yes | no | no |
| Create projects | yes | yes | yes | no |
| Edit / delete projects | yes | yes | own assigned projects | no |
| Manage project members | yes | yes | own assigned projects | no |
| Normal docs: view, create, edit | yes | yes | yes | yes |
| Normal docs: delete | yes | yes | yes | no |
| Secure docs: view | yes | yes | yes | yes |
| Secure docs: create, edit | yes | yes | yes | yes |
| Secure docs: delete | yes | yes | yes | no |

Any change in role, permission or project assignment that removes someone's secure-document access must trigger the revocation flow in section 7.5.

---

## 6. Projects and documents

- Projects live inside a workspace: name, description, members, created by, last activity. Archive and delete (with confirmation).
- The creator of a project is automatically assigned to it.
- Documents live inside a project. When creating one, the user picks:
  - **Normal document:** plain text or markdown. Protected by access control only; the server can read it. The UI must say so clearly.
  - **Secure document:** plain text, markdown, or `.env` (key/value). End-to-end encrypted as in section 7. The server can never read it.
- Markdown: editor with live preview.
- `.env` editor: key/value rows, values masked by default, reveal per value, copy per value, paste or import an existing `.env` file, export/download as `.env`, duplicate key warnings.
- Version history for every document, with view and restore (secure versions stay encrypted, section 7).
- Rename, delete, last edited by and when, unsaved changes warning.
- Secure documents are visibly distinct everywhere (lock badge, colour accent). Their **names are not encrypted**, so warn users not to put secrets in names.
- Search across projects and documents by name (secure content is never searchable by the server).
- Copying a secret should clear the clipboard after 30 seconds where the browser allows it.

---

## 7. Encryption requirements (the core of this product)

### 7.1 Goal and threat model
- All encryption and decryption of secure documents happens **in the browser**.
- The server stores only ciphertext, wrapped keys and public keys. It never receives a vault password, a private key, a project key or plaintext secret content, in any form, ever.
- **Worst case to design for:** an attacker fully compromises the server, database, backend code, backups and every stored encrypted blob. They must still be unable to decrypt any secure document.
- Normal documents are **out of scope** for end-to-end encryption.

### 7.2 Algorithms (use only these, never custom crypto)

| Purpose | Algorithm |
|---|---|
| Vault password -> Key Encryption Key (KEK) | **Argon2id**, random 16 byte salt per user, 32 byte output |
| User keypair | **X25519** |
| Wrapping a project key for a user | **libsodium sealed box** (`crypto_box_seal`, X25519 based) to that user's public key |
| Encrypting the private key, and all secure document content | **AES-256-GCM** |
| All random keys, salts and nonces | Cryptographically secure browser RNG (`crypto.getRandomValues`) |
| Login password storage (server side, unrelated to encryption) | Argon2id |

- Libraries: **libsodium.js (sumo build, which includes Argon2id)** for Argon2id and sealed boxes, **Web Crypto API** for AES-256-GCM.
- Argon2id parameters: at least 64 MiB memory and 3 iterations, tuned to roughly one second on a mid-range laptop. Store the parameters with each user so they can be raised later without breaking existing users.
- AES-256-GCM: a fresh random 96 bit nonce for every single encryption, never reused. Bind each ciphertext to where it belongs (workspace, project, document, version, key version) as additional authenticated data, so a malicious server cannot swap or replay ciphertexts between documents undetected.

### 7.3 Key hierarchy
- **Vault password** (user's memory only) -> Argon2id -> **KEK**.
- **KEK** encrypts the user's **X25519 private key** (AES-256-GCM). The server stores the encrypted private key, its nonce, the salt, the Argon2id parameters, and the public key in the clear.
- **Recovery key**: a second, independent way to decrypt the same private key (section 7.7).
- **Project key**: one random 256 bit key per project, with a version number. It encrypts every secure document (and every version) in that project.
- The project key is never stored raw. It is stored once **per user who has secure access**, sealed to that user's public key.

### 7.4 Lifecycle

**Vault setup (after workspace creation, skippable)**
1. Browser generates the X25519 keypair.
2. User chooses a vault password (minimum 12 characters, with a strength meter; advise that it must differ from the login password).
3. Browser derives the KEK with Argon2id and encrypts the private key with AES-256-GCM.
4. Browser generates the recovery key, encrypts the private key a second time with it, and shows the recovery key once (section 7.7).
5. Only the encrypted private key (both copies), salt, parameters and public key are uploaded.

**Unlocking the vault**
- User enters the vault password; the browser re-derives the KEK and decrypts the private key.
- The private key and any unwrapped project keys live **only in memory** (non-extractable where possible). Never in localStorage, sessionStorage, IndexedDB or cookies, never sent to the server, never logged.
- The vault locks automatically after inactivity (default 15 minutes, user configurable), on sign out, and on page reload or tab close. A lock button and a clear locked/unlocked indicator are always visible.

**First secure document in a project**
- The first user with permission creates the project key in their browser, seals it to their own public key, and seals it for every other user who currently has secure access to that project and a vault set up.

**Creating, viewing and editing secure documents**
- Browser unwraps the project key with the user's private key, then encrypts or decrypts the content with AES-256-GCM. Only ciphertext goes to the server.

**Granting access (new member, role change, project assignment)**
- An existing key holder's browser seals the project key to the new user's public key and uploads it. The new user can then read all existing secure documents immediately.
- **Pending access:** if the new user has no vault yet, or no key holder is online, the user is shown "Secure access pending". The next time any key holder has their vault unlocked, their browser completes all pending grants automatically, in the background, with no manual step. The user gets a notification when access arrives.

### 7.5 Revocation (member removed from project or workspace, role loses secure access, or a user's vault is reset)
1. The server immediately stops serving that user anything from the project, and deletes their sealed copy.
2. **Key rotation**, because the removed user may still hold the old key in memory or a copy of old ciphertext: a key holder's browser generates a new project key (new version), re-encrypts every secure document and every stored version, and seals the new key for every remaining member. Old key versions are then discarded.
3. If the person revoking access does not hold the key or does not have their vault unlocked, the project is marked "rotation pending" and the next key holder with an unlocked vault completes it automatically. Rotation must be safe against interruption (never leave a project half re-encrypted and unreadable).

### 7.6 Public key authenticity
- A compromised server could hand out a fake public key to trick a key holder into sealing a project key to the attacker.
- Every user's public key has a short human-readable **fingerprint**, shown on their profile and in member lists, so teammates can compare it out of band.
- Browsers remember the public keys they have sealed keys to, and **warn loudly** before sealing to a user whose key has changed since last time.
- Any key change (vault reset) is recorded in the audit log and notifies workspace admins.

### 7.7 Recovery and password changes

**Recovery key**
- 256 bits of randomness, shown once at vault setup in an easy-to-copy grouped format, with copy and download buttons and an "I have saved it" confirmation.
- It decrypts the second encrypted copy of the private key. The server never sees it.
- The user can regenerate it from settings (with vault unlocked); the old one stops working.

**Change vault password** (vault unlocked, current password required)
- Re-derive a new KEK with a new salt and re-encrypt the **same** private key. The keypair does not change, so nothing else needs re-sharing.

**Forgot vault password, has recovery key**
- Decrypt the private key with the recovery key, set a new vault password, then issue a new recovery key.

**Forgot vault password, no recovery key: vault reset**
- The user generates a new keypair and vault password. All their old sealed project keys are discarded (treated as revocation, section 7.5) and they return to "Secure access pending" until key holders re-grant automatically (section 7.4).
- Before confirming, warn clearly: any project where they are the only key holder becomes **permanently unreadable**. Nobody, including the operators, can recover it.

### 7.8 Known limitation (document it in the README)
- Stored data stays safe under full server compromise. But an attacker who controls the live server could serve modified frontend code to capture vault passwords on the next unlock. This is inherent to any browser-based end-to-end encrypted app. Reduce the risk with a strict Content Security Policy, no third-party scripts or runtime CDNs, and Subresource Integrity, and state this limitation honestly.

---

## 8. Audit log and notifications

**Audit log** (per workspace, append only, never editable or deletable from the app)
- Records who, what, when, from where (IP, user agent), and result for: sign in events, invitations, member and role changes, permission and custom role changes, project create/edit/delete, document create/view/edit/delete/restore, secure document views (logged when the ciphertext is fetched), key grants, key rotations, vault setup/reset/password change/recovery key regeneration, ownership transfer.
- Never contains secret content, passwords or key material.
- Viewable by roles with permission; filter by user, project, action and date; export to CSV.

**Notifications**
- In-app notification centre with unread badge: invitations, project access granted, secure access granted/pending, role changes, removal, teammate key changes (admins), reminders to set up the vault.
- Email for invitations and security-sensitive account events (password changed, vault reset, new sign in).

---

## 9. UI and design

- Clean, modern, professional, trustworthy. It should feel like a premium security product, **not a stock shadcn demo**.
- Build a distinct theme: your own colour palette (a calm neutral base with a confident signature accent), a deliberate font pairing, custom radius, spacing, shadows and subtle depth. All colours, fonts and radii come from theme tokens, never hardcoded in components. Every shadcn component is restyled through those tokens.
- Light, dark and system modes, all fully designed, with no flash of the wrong theme on load.
- Layout: sidebar with workspace switcher and projects, top bar with search, command palette (Ctrl/Cmd + K), notifications, vault lock status and user menu. Breadcrumbs inside workspaces and projects.
- A workspace dashboard: projects, recently edited documents, recent activity, and any pending prompts (vault setup, invitations, pending secure access).
- Polished states everywhere: loading skeletons, empty states with clear actions, error states, toasts, confirmation dialogs for anything destructive, a 404 page.
- Fully responsive down to mobile. Accessible: keyboard navigation, visible focus, labels, sufficient contrast in both themes.
- Security moments (vault setup, recovery key, unlock, vault reset warning, key change warning) get extra care: calm, clear wording and no dark patterns.

---

## 10. Security baseline (beyond encryption)

- Every permission and ownership check is enforced on the server for every request. The client is never trusted to decide access.
- The acting user's identity always comes from their authenticated session, never from request data.
- Input validation on every request; rate limiting on sensitive endpoints; locked-down CORS; CSRF protection where cookies are used; security headers and strict CSP.
- No secrets, tokens or key material in logs, URLs or error responses.

---

## 11. Quality bar and done criteria

- Frontend builds and typechecks with strict TypeScript; backend is fully typed and linted.
- Tests at minimum for: the crypto flows (setup, unlock, share, rotate, password change, recovery, reset), cross-user sharing (one user's browser encrypts, another's decrypts), revocation and rotation, and the permission/hierarchy rules on the server.
- Both themes checked on every screen.
- README: setup, how the key hierarchy works, the threat model and the limitation in 7.8.
- Suggested build order (adjust as you see fit): project scaffolding and theme -> auth and onboarding -> workspaces, invitations, roles and permissions -> projects and normal documents -> vault and secure documents -> sharing, pending access and rotation -> audit log and notifications -> polish.
- When finished, report plainly what works, what was not built, and anything you could not verify.
