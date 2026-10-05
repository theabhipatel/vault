<div align="center">

<img src="frontend/public/logo.svg" width="72" height="72" alt="Secure Vault logo" />

# Secure Vault

**Your team's docs and secrets in one place, with secrets end-to-end encrypted in the browser.**

Self-hosted · Multi-workspace · Roles and permissions · Audit log · Free

[Live demo](https://secure-vault-navy-delta.vercel.app) · [Documentation](https://secure-vault-navy-delta.vercel.app/docs) · [Self-hosting guide](https://secure-vault-navy-delta.vercel.app/docs/self-hosting)

</div>

---

## What is Secure Vault?

Secure Vault is a team vault you run on your own server. A team works in **workspaces**, organises
work into **projects**, and keeps two kinds of documents in each project:

| | Normal documents | Secure documents |
|---|---|---|
| Formats | Plain text, Markdown | Plain text, Markdown, `.env` files |
| Protection | Access control (roles and permissions) | **End-to-end encryption** in the browser |
| Can the server read them? | Yes | **No.** It only stores ciphertext |
| Good for | Notes, runbooks, onboarding docs | API keys, passwords, `.env` files, credentials |

Secure documents are encrypted and decrypted only in your browser, with keys unlocked by your
**vault password**. The server never sees that password, your private key, any project key or any
plaintext secret. Even someone who steals the whole database gets nothing readable.

### Features

- **Workspaces and teams:** invite people by email, with Owner, Admin, Manager, Member and custom roles.
- **Fine-grained permissions:** choose who can see which projects, who can edit, and who can open secure documents.
- **End-to-end encrypted `.env` editor:** a table editor with reveal, copy (auto-cleared clipboard) and download.
- **Version history** for every document, with restore.
- **Automatic key sharing:** new teammates get access without any manual key exchange.
- **Key rotation when someone loses access:** removed people can't read anything new.
- **Recovery key** for a forgotten vault password.
- **Append-only audit log:** every sign-in, view, edit, download, wrong vault password and access change, with IP and device.
- **Notifications and security emails**, for example after repeated wrong vault passwords.
- **Sign in with email and password, or Google** (optional).
- **Light and dark themes, and a responsive layout** that works on phones.

---

## Try the demo

Open the **[live demo](https://secure-vault-navy-delta.vercel.app)**, create an account and look around.

> **The demo is for trying things out only.** Anyone can sign up, data may be wiped at any time, and
> you don't control the server. **Never store real secrets there.** For real use, self-host it
> (below).

---

## Run it on your computer

You need three things. uv installs Python 3.12 for you if needed.

1. **[Docker](https://docs.docker.com/get-docker/):** Docker Desktop on macOS and Windows, or Docker Engine on Linux. It must be running.
2. **[uv](https://docs.astral.sh/uv/getting-started/installation/)**, the Python package manager.
3. **[Node.js](https://nodejs.org/) 22 LTS** (20.19 or newer also works).

Then run the start script for your system:

**Linux and macOS**

```bash
git clone https://github.com/theabhipatel/vault.git
cd vault
./scripts/dev.sh
```

**Windows** (PowerShell or Command Prompt, no WSL needed)

```bat
git clone https://github.com/theabhipatel/vault.git
cd vault
scripts\dev.cmd
```

**Windows with WSL:** clone inside your Linux home (`cd ~`), not under `/mnt/c`, and use the Linux
steps. Install uv and Node inside WSL, and turn on Docker Desktop → Settings → Resources → WSL
Integration for your distro.

The script:
1. checks that everything is installed and tells you what's missing;
2. starts PostgreSQL and a mail catcher (Mailpit) in Docker;
3. creates `backend/.env` with a random secret key;
4. installs the packages and sets up the database;
5. starts the API and the web app.

Press **Ctrl+C** to stop everything.

Then open these addresses:

| What | Address |
|---|---|
| Website | http://localhost:29180 |
| The app | http://localhost:29180/app |
| Documentation | http://localhost:29180/docs |
| Emails the app sends (Mailpit) | http://localhost:29825 |
| API reference (development only) | http://localhost:29100/api/docs |

**First steps:**
1. Sign up.
2. Open the verification email in Mailpit and click the link.
3. Name your workspace.
4. Set up your vault.
5. Create a secure `.env` document.

<details>
<summary><b>Ports used, and how to change them</b></summary>

Every port is in the uncommon 29xxx range, so Secure Vault doesn't clash with a local PostgreSQL
(5432) or other dev servers (3000, 5173, 8000, 8080 and so on).

| Service | Port | Change it in |
|---|---|---|
| Web app (Vite) | 29180 | `frontend/vite.config.ts`, `APP_URL` in `backend/.env`, the dev scripts |
| API (uvicorn) | 29100 | the dev scripts, `API_PROXY_TARGET` (frontend) |
| PostgreSQL | 29432 | `docker-compose.yml`, `DATABASE_URL` in `backend/.env` |
| Mailpit SMTP / web inbox | 29025 / 29825 | `docker-compose.yml`, `SMTP_PORT` in `backend/.env` |
| Production web (nginx) | 29080 | `WEB_PORT` in `.env.prod` |

</details>

<details>
<summary><b>Run each part by hand instead of the script</b></summary>

```bash
docker compose up -d                           # PostgreSQL :29432 and Mailpit :29025/:29825
cd backend && cp .env.example .env && uv sync
uv run alembic upgrade head
uv run uvicorn vault_api.main:app --reload --port 29100 --proxy-headers
cd ../frontend && npm install && npm run dev   # http://localhost:29180
```

`npm run build && npm run preview` serves the production build with the production Content
Security Policy. The dev server can't enforce it, because hot reload needs inline scripts.

</details>

---

## Deploy it for real use (Docker)

This is the recommended way to run Secure Vault for your team. All you need on the server is Docker.

```bash
git clone https://github.com/theabhipatel/vault.git && cd vault
cp backend/.env.example .env.prod
```

Edit `.env.prod`. At minimum, set:

```env
APP_URL=https://vault.example.com          # your address, exactly as in the browser
SECRET_KEY=a-long-random-string            # python3 -c "import secrets;print(secrets.token_urlsafe(48))"
COOKIE_SECURE=true
POSTGRES_PASSWORD=a-long-random-password   # letters and digits only
SMTP_HOST=smtp.example.com                 # plus SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_STARTTLS, MAIL_FROM
```

Start it:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This runs three containers:
- **`postgres`**, the database;
- **`api`**, which updates the database on every start;
- **`web`**, nginx with strict security headers, on port **29080**.

Put HTTPS in front of port 29080, for example with Caddy, Traefik or your load balancer.

The full guide, covering HTTPS, backups and updates, is the [production deployment docs](https://secure-vault-navy-delta.vercel.app/docs/production).
Every setting is listed in [backend/.env.example](backend/.env.example) and in the
[configuration reference](https://secure-vault-navy-delta.vercel.app/docs/configuration).

---

## Deploy a free public demo (Vercel + Neon)

The same code can run as a free public demo on **Vercel**, with a free **Neon** PostgreSQL database.
This is only for letting people try the app. Use Docker for real secrets.

Only three files at the repository root are Vercel-specific, and Docker and the dev scripts ignore them:
- `vercel.json`: build, routing, security headers and a daily cleanup job;
- `api/index.py`: runs the API as a Vercel function. Its comments explain the whole setup;
- `requirements.txt`: Python packages, generated from `backend/uv.lock` by `make vercel-requirements`.

**Steps**

1. In **Neon**, create a project in region **AWS US East 1** and copy two connection strings: the **pooled** one and the **direct** one.
2. Create the tables once, from your computer:
   ```bash
   cd backend
   DATABASE_URL='<direct connection string>' uv run alembic upgrade head
   ```
3. In **Vercel**, click **Add New → Project** and import this GitHub repository. Keep the root directory as it is.
4. Under **Settings → Environment Variables**, add:
   ```env
   SERVERLESS=true
   ENVIRONMENT=production
   COOKIE_SECURE=true
   CLIENT_IP_HEADER=x-real-ip
   APP_URL=https://<your-project>.vercel.app
   SECRET_KEY=<long random string>
   CRON_SECRET=<another long random string>
   DATABASE_URL=<Neon pooled connection string>
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_STARTTLS=true
   SMTP_USERNAME=<you@gmail.com>
   SMTP_PASSWORD=<Gmail app password>
   MAIL_FROM=Secure Vault Demo <you@gmail.com>
   VITE_DEMO_MODE=true
   VITE_SITE_URL=https://<your-project>.vercel.app
   ```
5. **Deploy.** Open `/api/health`; it should show `{"status":"ok"}`.

After that, every push deploys automatically. When a release adds database migrations, run step 2 again first.

**What `SERVERLESS=true` changes:**
- emails are sent straight away instead of by a background worker;
- database connections aren't kept open between requests;
- a daily Vercel Cron call retries failed emails and cleans up.

All of these settings are **off by default**, so self-hosted installs behave exactly as before.

**Free-plan limits:**
- requests are capped at 4.5 MB;
- the database sleeps when idle, so the first request after a pause is slower;
- the cleanup runs once a day.

The full guide is the [Deploy a demo on Vercel docs](https://secure-vault-navy-delta.vercel.app/docs/vercel-demo).

---

## For developers

### Tests and checks

```bash
make test                   # backend tests (pytest against a real PostgreSQL; run `docker compose up -d` first)
cd frontend && npm test     # frontend tests, including the encryption flows with real libsodium + WebCrypto
make check                  # lint + strict type checks for backend and frontend, and a production build
make gen-api                # regenerate the typed API client from the backend's OpenAPI schema
make vercel-requirements    # regenerate requirements.txt after changing backend packages
```

<details>
<summary><b>What the tests cover</b></summary>

| Area | Where |
|---|---|
| Vault setup, unlock, wrong password, private key bound to its owner | `frontend/src/vault/crypto.test.ts` |
| Recovery key, password change (same keypair), recovery flow, old recovery key revoked | same |
| Sharing: Alice encrypts, Bob's separately unlocked vault decrypts | same |
| Sealed keys only open for their recipient, project and key version | same |
| Swapping or replaying ciphertext between documents, versions, key versions and projects fails | same |
| Rotation: every version re-encrypted; the removed user's old key opens nothing new | same |
| Vault reset: keys sealed to the old keypair become useless | same |
| `.env` parsing and writing | `frontend/src/vault/env.test.ts` |
| Server vault rules: key setup, grants, pending access, revocation, atomic rotation, reset, secure-document access, audit events | `backend/tests/test_vault.py` |
| Permission and rank rules (pure, and enforced over HTTP) | `backend/tests/test_permission_rules.py`, `test_workspaces.py` |
| Sign-in: verification, lockout, CSRF, generic errors, account-takeover protection, sessions | `backend/tests/test_auth.py` |
| Hosting modes: self-hosted defaults unchanged; serverless email, cron, client IP, Neon URLs | `backend/tests/test_deployment.py` |

</details>

### How it's built

```
browser ──► /, /docs/*, /privacy   public site: pre-rendered static HTML (good for SEO)
        ├─► /app, /login, /w/* …   the React app (every script and style has an integrity hash)
        │                          └─ vault: libsodium (Argon2id, X25519 sealed boxes) + WebCrypto (AES-256-GCM)
        └─► /api/*                 FastAPI ──► PostgreSQL
                                        └─► email outbox ──► SMTP (Mailpit in development)
```

The website, the app and the API are always served from **one address**, so cookies stay
first-party and cross-origin requests are blocked.

- **Backend** (`backend/src/vault_api`):
  - Python 3.12 and FastAPI, fully typed (`mypy --strict`);
  - SQLAlchemy 2 (async) with Alembic migrations;
  - rate limits and the email outbox live in PostgreSQL.
- **Frontend** (`frontend/src`):
  - React 19, strict TypeScript and Vite;
  - Tailwind CSS v4 and shadcn/ui, styled through the theme tokens in `src/index.css`;
  - a typed API client generated from the backend's OpenAPI schema.
- **Encryption** (`frontend/src/vault`):
  - `crypto.ts` holds all cryptography;
  - `kdf.worker.ts` runs Argon2id in a Web Worker;
  - `session.ts` keeps keys in memory only;
  - `protocol.ts` covers sharing and rotation;
  - `trust.ts` pins teammates' public keys.
- **Public site** (`frontend/src/site`):
  - the landing page, the docs (Markdown files in `docs/content/`, listed in `docs/catalog.ts`) and the privacy page;
  - `npm run build` pre-renders every page to static HTML with titles, meta tags, Open Graph and structured data, plus `robots.txt` and `sitemap.xml`;
  - the app is never loaded on these pages.

Build-time settings for the site:
- `VITE_SITE_URL`: your public address, used for canonical URLs and the sitemap;
- `VITE_DEMO_MODE=true`: shows the "public demo" notices.

### Project layout

```
backend/
  src/vault_api/            FastAPI app: routers, services (access, vault, email, audit), models
  migrations/               Alembic migrations (including the append-only audit trigger)
  tests/                    pytest against a real PostgreSQL
frontend/
  src/routes/               app pages
  src/components/           UI, including vault dialogs and the .env editor (src/components/vault)
  src/vault/                browser cryptography, key session, sharing protocol, key pinning (+ tests)
  src/site/                 public site: landing page, docs (Markdown in docs/content), privacy page
  scripts/prerender.mjs     turns the public site into static HTML after the build
  nginx.conf, Dockerfile    production web image with strict security headers
scripts/                    start scripts: dev.sh (Linux/macOS/WSL), dev.cmd + dev.ps1 (Windows)
docker-compose.yml          PostgreSQL + Mailpit for development
docker-compose.prod.yml     PostgreSQL + API + web for production
vercel.json, api/, requirements.txt   Vercel demo only (ignored by Docker)
```

---

## Security

**In short:**
- Secure documents are encrypted in your browser before they're sent, with AES-256-GCM.
- Each project has its own key, shared with each teammate by sealing it to their public key (X25519).
- Your private key is protected by your vault password (Argon2id).
- The server stores only encrypted data and public keys, so a full database leak reveals no secrets.
- Normal documents aren't end-to-end encrypted. The app says so on every one.

Read the **limitations** in the details below before you rely on it. The most important one: someone
who takes over your **live** server could change the app's JavaScript to capture a vault password at
the next unlock. This is true of every browser-based end-to-end encrypted app.

<details>
<summary><b>Full security model: threat model, algorithms, key hierarchy, lifecycle, limitations</b></summary>

### Goal and threat model

**Design goal:** an attacker who fully compromises the server gets nothing readable. That includes the
server, the database, the backend code, backups and every stored encrypted blob. They can't decrypt
a single secure document.

Everything the server stores for secure documents is one of the following:

| Stored | What it is | Useful to an attacker? |
|---|---|---|
| Public key (X25519) | Per user, in the clear | No |
| Encrypted private key (×2) | AES-256-GCM under a password-derived key, and under the recovery key | Only with the vault password (Argon2id-hardened) or the 256-bit recovery key |
| Argon2id salt and parameters | Per user | No |
| Sealed project keys | libsodium sealed box to one member's public key | Only with that member's private key |
| Document ciphertext | AES-256-GCM, fresh 96-bit nonce, bound to its location through additional authenticated data | Only with the project key |

Normal documents are **out of scope** for end-to-end encryption: they are access-controlled and
readable by the server. The UI says so on every normal document.

### Algorithms

| Purpose | Algorithm | Implementation |
|---|---|---|
| Vault password → KEK | **Argon2id**, 16-byte random salt, 32-byte output. At least 64 MiB and 3 passes; calibrated per device to about 1 s (memory first, up to 256 MiB, then passes). Parameters stored per user. | libsodium.js (sumo) in a Web Worker |
| User keypair | **X25519** | libsodium `crypto_box_keypair` |
| Sharing a project key | **Sealed box** (`crypto_box_seal`) to the recipient's public key | libsodium |
| Private key and all secure content | **AES-256-GCM**, random 96-bit nonce per encryption | WebCrypto |
| Randomness | `crypto.getRandomValues` / libsodium's CSPRNG | browser |
| Login passwords (server, unrelated) | Argon2id | argon2-cffi |

No custom cryptographic primitives are used; only the compositions described here.

### Key hierarchy

```
vault password ──Argon2id(salt, params)──► KEK ──AES-GCM──► X25519 private key  (stored encrypted)
recovery key (256 bit) ──────────────────────AES-GCM──► same private key        (second copy)

project key vN (256 bit, random) ──sealed box──► one copy per member with secure access
project key vN ──AES-GCM──► every secure document version in the project
```

**Binding (additional authenticated data).** Every ciphertext names where it belongs, so a malicious
server can't swap or replay blobs undetected:

- private key: `vault:v1|private-key|<password|recovery>|user:<id>|pk:<public key>`
- documents: `vault:v1|document|ws:<id>|project:<id>|doc:<id>|ver:<n>|key:<key version>|format:<fmt>`
- sealed project keys: sealed boxes have no AAD, so the sealed payload carries
  `SHA-256("vault:v1|project-key|<project>|<version>")[0:16]` after the key, and is checked on opening.
- On unlock, the public key is recomputed from the decrypted private key and must match the stored one.

### Lifecycle

- **Vault setup (skippable, prompted after the first workspace):**
  1. The browser generates the keypair.
  2. It calibrates Argon2id and derives the KEK.
  3. It encrypts the private key twice: once with the KEK, once with a new recovery key.
  4. It uploads only public and encrypted material.

  The recovery key is shown once: grouped, with copy and download buttons and an "I have saved it"
  confirmation. Minimum 8 characters and a strength check apply, with advice to use something
  different from the login password.
- **Unlock:**
  - The private key lives only in JavaScript memory as a byte array, overwritten on lock.
  - Project keys are imported as **non-extractable** WebCrypto keys. Their raw bytes exist only
    briefly while being re-sealed for a teammate, and are wiped afterwards.
  - Nothing goes to localStorage, sessionStorage, IndexedDB or cookies, to the server, or to logs.
  - Decrypted content is purged from the query cache on lock.
  - The vault locks after inactivity (15 minutes by default; 5, 15, 30 or 60 is selectable), on
    sign-out, and on reload or tab close. The lock state is always visible in the top bar.
- **First secure document in a project:** the creator's browser generates the project key and seals it
  for itself and for every member with secure access and a vault.
- **Granting (new member, role change, project assignment):**
  - The server computes pending grants: people who are entitled, have a vault and hold no copy of
    the current key.
  - Whenever any key holder's vault is unlocked (on unlock and every 60 s), their browser seals the
    key for them in the background, with no manual step.
  - The recipient sees "Secure access pending" until then, and gets a notification when access
    arrives.
- **Revocation (removed from a project or workspace, role loses secure access, vault reset):**
  1. The server immediately stops serving that user anything from the project and deletes their
     sealed copies.
  2. If they ever held the key, the project is marked **rotation pending**.
  3. The next key holder's browser generates key version N+1, decrypts and re-encrypts **every secure
     document and every stored version** (fresh nonces, new AAD), and seals the new key for the
     remaining members.
  4. It submits everything in one request. The server applies it in **one transaction**, only if the
     key version is unchanged and the set of (document, version) ciphertexts matches exactly.
     Otherwise nothing changes and the browser retries. A rotation is never half-applied.
  5. Old sealed copies are then deleted.
- **Change vault password:** the same private key is re-wrapped under a new salt. Nothing is
  re-shared. The current password is verified in the browser first.
- **Forgot vault password, has recovery key:** the recovery key decrypts the private key, then the
  user sets a new password and gets a new recovery key. The old recovery key stops working.
- **Forgot both: vault reset.**
  - The user gets a new keypair and password. All their sealed copies are discarded, and projects
    they held keys for are rotated.
  - They return to "pending" until teammates re-grant.
  - Before confirming, the UI lists every project where they are the **only** key holder. Those
    become permanently unreadable, and nobody can recover them, operators included. Such a project
    can later be cleared and restarted with a fresh key.

### Public key authenticity

A compromised server could hand out a fake public key to receive sealed project keys itself. These
measures counter that:

- Every user has a **fingerprint**: the first 128 bits of SHA-256 of their public key. It is
  **computed in the browser**, shown in Vault settings and in the members list, and meant to be
  compared out of band.
- Browsers **pin** the public keys they have sealed to (trust on first use, stored per user in
  localStorage, since public keys aren't secret). If a key changes, nothing is sealed to that person
  until the user sees a loud warning comparing old and new fingerprints and confirms.
- Every key change (vault reset) is written to the audit log of each workspace the user belongs to,
  and notifies that workspace's admins.

### Accounts, sessions and the API

- **Passwords and sessions:**
  - Login passwords use Argon2id. The login password never touches encryption.
  - Sessions are random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` and
    `__Host-` with HTTPS), stored hashed. They have absolute and idle expiry and can be revoked
    per device.
  - Changing or resetting the password signs out other sessions.
- **CSRF:** a double-submit token plus an Origin check on every mutating request.
- **Resistance to guessing and enumeration:**
  - Generic responses on sign-up, forgot-password and sign-in, with timing equalised for missing
    accounts.
  - Per-IP rate limits, plus a per-address lockout (5 failures per 15 minutes) that behaves the
    same for addresses that don't exist.
- **Account takeover:** a sign-up password is bound to its own verification link. Linking Google to
  an unverified account clears that account's unproven password.
- **Enforced on the server:** every permission and hierarchy rule runs on every request. The acting
  identity always comes from the session, never from request data.
- **Audit log:**
  - A PostgreSQL trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`.
  - Every entry records who, what, when, from where (IP address and user agent), the result
    (`success`, `failure` or `denied`) and structured details. Select a row on the audit page to see
    all of it.
  - **Recorded by the server:** secure-document fetches (current and old versions), saves, renames,
    restores, deletes, refused access attempts, key creation, grants, rotations, and vault setup,
    password change, recovery and reset.
  - **Reported by the browser** (marked "Reported by the browser"): things the server can't observe,
    because vault passwords and plaintext never leave the device. These are:
    - wrong vault passwords and recovery keys (with the attempt count and a server-side count of
      failures in the last hour);
    - unlocks, and locks (manual, idle timeout or sign-out);
    - successful decryption, and integrity-check failures, which can mean tampered ciphertext and
      alert workspace admins;
    - plaintext downloads, and copied or revealed `.env` values.
  - Reports carry only enums and numbers, never free text or `.env` key names, and are rate-limited.
  - Five wrong vault secrets within an hour email the account owner and show an in-app alert.
  - Account-level events (sign-ins and vault events) appear in the audit log of every workspace the
    user belongs to.
  - It never contains content, passwords or key material. The browser run checks the database for
    the plaintext secret and finds zero occurrences.
- **Headers and front-end integrity:**
  - The SPA gets a strict CSP: scripts only from our own origin, no inline scripts, no `eval`.
    `wasm-unsafe-eval` is allowed only so libsodium's WebAssembly can compile.
  - Every script, stylesheet and module preload in `index.html` carries a sha384 **Subresource
    Integrity** hash.
  - No third-party scripts, fonts or CDNs: fonts are bundled, and `data:` asset inlining is disabled.
  - Also set: `frame-ancestors 'none'`, `nosniff`, `no-referrer`, COOP and HSTS.

### Known limitations (read these)

1. **A live server compromise can still steal future secrets.** Stored data stays safe under full
   server compromise. But an attacker who controls the **live** server can serve modified JavaScript
   that captures a vault password (or decrypted content) the next time a user unlocks. This is
   inherent to every browser-based end-to-end encrypted application. CSP, same-origin-only assets
   and SRI shrink the attack surface: they block injected third-party scripts and tampered CDN
   files. They can't help if the attacker replaces `index.html` itself, because it carries the
   hashes. Organisations that need more should distribute the frontend through a channel the server
   can't alter, such as a signed browser extension or desktop app.
2. **Pinning is per browser.** The key-change warning relies on the browser remembering keys. On a
   fresh browser, the first key seen is trusted. Comparing fingerprints out of band is the real
   defence.
3. **Metadata isn't encrypted.** Server-visible metadata includes:
   - document and project names (the UI warns you not to put secrets in names), formats and sizes;
   - who accessed what and when;
   - membership.
4. **JavaScript can't guarantee memory hygiene.** Keys are held as wiped byte arrays and
   non-extractable CryptoKeys, but passwords and decrypted text are JavaScript strings, which can't
   be zeroed. They disappear only when garbage-collected.
5. **CSP allows inline styles** (`style-src 'unsafe-inline'`) because the UI library injects small
   `<style>` elements. Scripts remain strictly controlled.
6. **Rotation is one request.** Very large projects (hundreds of MB of secure history) are limited by
   the 256 MB request cap on the rotation endpoint (4.5 MB on the Vercel demo).
7. **Clipboard clearing is best effort.** Copied secrets are cleared after 30 s only where the browser
   allows clipboard access.
8. **Browser-reported audit events are best effort.** Wrong vault passwords, unlocks and
   decryptions happen only on the user's device, so the server can't verify them. A modified
   client, or someone who copied the encrypted key blob, can guess passwords offline without
   reporting anything. The real protection against guessing is Argon2id with a strong vault
   password. These reports catch everyday misuse and mistakes through the normal app.

</details>

<details>
<summary><b>Permissions model</b></summary>

Roles are ranked: **Owner > Admin > Manager > Member**, plus custom roles placed anywhere below your
own. The server enforces these rules on every request:

- **Rank:** you can only manage people and roles ranked **strictly below** your own.
- **Grants:** you can only grant or remove permissions **you hold yourself**. This includes creating
  roles and assigning them.
- **Owner:**
  - Only the owner manages admins and edits the Admin role.
  - The Owner role can't be edited, assigned or deleted, only transferred.
  - The database guarantees exactly one owner per workspace.
- **Projects:** members see only the projects assigned to them, unless their role has "access all
  projects". Project-scoped permissions apply only inside visible projects.
- **Secure access:** secure access to a project means the role has "view secure documents" and the
  user can see the project. Losing it triggers the revocation flow above.

</details>

---

<div align="center">

Developed by **[TheAbhiPatel](https://www.theabhipatel.com/)** · [GitHub](https://github.com/theabhipatel)

If Secure Vault is useful to you, please **[give it a star on GitHub](https://github.com/theabhipatel/vault)**.

</div>
