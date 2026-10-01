# Vault

A self-hosted, multi-workspace team vault. Teams keep two kinds of documents in projects:

- **Normal documents**: plain text or Markdown, protected by access control. The server can read them.
- **Secure documents**: text, Markdown or `.env` files, **end-to-end encrypted in the browser**. The
  server only ever stores ciphertext, sealed keys and public keys. It never sees a vault password,
  a private key, a project key or a plaintext secret.

---

## Quick start (local development)

Install three things first (uv installs Python 3.12 for you if needed):

- **Docker**: Docker Desktop on macOS and Windows, or Docker Engine on Linux. It must be running.
- **[uv](https://docs.astral.sh/uv/getting-started/installation/)**, the Python package manager.
- **Node.js 22 LTS** (20.19+ also works).

Then use the script for your system.

**Linux and macOS**

```bash
git clone <repo-url> vault && cd vault
./scripts/dev.sh        # or: make dev
```

**Windows (PowerShell or Command Prompt, no WSL needed)**

```bat
git clone <repo-url> vault
cd vault
scripts\dev.cmd
```

**Windows with WSL**: open the WSL terminal, clone into your Linux home (`cd ~`), not into `/mnt/c`,
and follow the Linux steps. Install uv and Node inside WSL, and turn on Docker Desktop →
Settings → Resources → WSL Integration for your distro.

The script checks the requirements and tells you what's missing. It then starts PostgreSQL and
Mailpit in Docker, creates `backend/.env` with a random `SECRET_KEY` if it doesn't exist, installs
packages, runs migrations, and starts the API and the web app. Ctrl+C stops both.

| What | URL |
|---|---|
| Website (landing page) | http://localhost:29180 |
| Documentation | http://localhost:29180/docs |
| Web app | http://localhost:29180/app (sign-up at `/signup`) |
| API docs (dev only) | http://localhost:29100/api/docs |
| Mailpit (all outgoing email) | http://localhost:29825 |

Sign up, open the verification email in Mailpit, name your workspace and set up your vault.

**Ports.** Every port is in the uncommon 29xxx range, so the app doesn't clash with a local Postgres
(5432), other dev servers (3000, 5173, 8000, 8080…) or the operating system's random port ranges.

| Service | Port | Change it in |
|---|---|---|
| Web app (Vite) | 29180 | `frontend/vite.config.ts`, `APP_URL` in `backend/.env`, both dev scripts |
| API (uvicorn) | 29100 | both dev scripts, `API_PROXY_TARGET` (frontend) |
| PostgreSQL | 29432 | `docker-compose.yml`, `DATABASE_URL` in `backend/.env` |
| Mailpit SMTP / web UI | 29025 / 29825 | `docker-compose.yml`, `SMTP_PORT` in `backend/.env` |
| Production web (nginx) | 29080 | `WEB_PORT` in `.env.prod` |

To run the parts by hand:

```bash
docker compose up -d                           # Postgres :29432 (+ vault_test DB), Mailpit :29025/:29825
cd backend && cp .env.example .env && uv sync
uv run alembic upgrade head
uv run uvicorn vault_api.main:app --reload --port 29100 --proxy-headers
cd ../frontend && npm install && npm run dev   # http://localhost:29180
```

`npm run build && npm run preview` serves the production build with the production Content Security
Policy. The dev server can't enforce it, because Vite's hot reload needs inline scripts.

### Tests and checks

```bash
make test                   # backend: pytest against a real Postgres
cd frontend && npm test     # frontend: vitest, the crypto flows with the real libsodium + WebCrypto
make check                  # ruff + mypy --strict, tsc (strict) + oxlint, production build
make gen-api                # regenerate the typed API client from the backend's OpenAPI schema
```

What the tests cover:

| Area | Where |
|---|---|
| Vault setup, unlock, wrong password, private key bound to its owner | `frontend/src/vault/crypto.test.ts` |
| Recovery key, password change (same keypair), recovery flow, old recovery key revoked | same |
| Cross-user sharing: Alice encrypts, Bob's separately unlocked vault decrypts | same |
| Sealed keys only open for their recipient, project and key version | same |
| Ciphertext swap and replay between documents, versions, key versions and projects fails | same |
| Rotation: every version re-encrypted; the removed user's old key opens nothing new | same |
| Vault reset: keys sealed to the old keypair become useless | same |
| `.env` parsing and serialisation | `frontend/src/vault/env.test.ts` |
| Server vault rules: key init, grant validation, pending access, revocation, atomic rotation, reset, secure-doc access | `backend/tests/test_vault.py` |
| Permission and hierarchy rules (pure, and enforced over HTTP) | `backend/tests/test_permission_rules.py`, `test_workspaces.py` |
| Auth: verification, lockout, CSRF, generic errors, pre-account-takeover, sessions | `backend/tests/test_auth.py` |

### Production deployment

```bash
cp backend/.env.example .env.prod    # set APP_URL, SECRET_KEY, SMTP_*, COOKIE_SECURE=true, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This runs three containers. The `api` container applies migrations and serves uvicorn. The `web`
container is nginx serving the built SPA with a strict CSP and security headers, and proxying `/api`.
Postgres is the third. The web container listens on port 29080 (set `WEB_PORT` in `.env.prod` to
change it). Put TLS in front of it (a load balancer or Caddy/Traefik) and keep
`COOKIE_SECURE=true`.

Every setting is documented in [backend/.env.example](backend/.env.example) and
[frontend/.env.example](frontend/.env.example). Google sign-in is optional: set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` and register `<APP_URL>/api/auth/google/callback` as the redirect URI.

---

## Architecture

```
browser ──► /, /docs/*, /privacy   public site: pre-rendered static HTML (SEO), hydrated by a small bundle
        ├─► /app, /login, /w/* …   React SPA (every script and style carries an SRI hash)
        │                          └─ vault: libsodium (Argon2id, X25519 sealed boxes) + WebCrypto (AES-256-GCM)
        └─► /api/*                 FastAPI ──► PostgreSQL
                                        └─► email outbox ──► SMTP (Mailpit in dev)
```

The SPA and the API are always served from **one origin**. Cookies stay first-party and CORS stays
closed.

**Backend** (`backend/src/vault_api`): FastAPI, fully typed (`mypy --strict`), SQLAlchemy 2 (async)
with Alembic.
- `permissions.py` holds the permission catalogue, default roles and the hierarchy rules, as pure,
  unit-tested functions.
- `services/access.py` computes project visibility and who has secure access to which project. Any
  change that can alter secure access (role, permissions, project assignment, membership) takes a
  snapshot before and diffs after, then calls the vault's grant and revocation hooks.
- `services/vault.py` and `routers/vault.py` hold the server side of the vault: entitlement, grant
  validation, revocation, rotation bookkeeping and secure-document storage.
- Emails go through a transactional outbox with a retrying worker. Rate limits live in Postgres.

**Frontend** (`frontend/src`): React 19, strict TypeScript, Vite, Tailwind v4, shadcn/ui restyled
entirely through theme tokens (`src/index.css`).
- `src/vault/crypto.ts` holds all cryptography. `kdf.worker.ts` runs Argon2id in a Web Worker.
  `session.ts` keeps keys in memory. `protocol.ts` covers key creation, encrypt and decrypt, grants
  and rotation. `trust.ts` pins public keys (trust on first use).
- A typed API client is generated from the backend's OpenAPI schema.

**Public site** (`frontend/src/site`): the landing page, the documentation and the privacy page.
- A separate entry (`site.html`, `src/site/entry-client.tsx`) with its own small, code-split bundle;
  the app is never loaded on public pages.
- `npm run build` pre-renders every public page to static HTML (`scripts/prerender.mjs`, using
  React Router's static handler) with per-page titles, meta, Open Graph tags and JSON-LD, then
  writes `robots.txt` and, when `VITE_SITE_URL` is set, `sitemap.xml`. The browser hydrates the
  same markup; loader data travels in a JSON data block, so the strict CSP still applies.
- Docs are Markdown files in `src/site/docs/content/`, listed in `src/site/docs/catalog.ts`.
- Build output: `dist/index.html` (landing), `dist/docs/<page>/index.html`, `dist/privacy/index.html`
  and `dist/app.html` (the app shell). Servers try the file, then `<path>/index.html`, then fall back
  to `app.html` (see `frontend/nginx.conf`; `vite dev` and `vite preview` do the same).
- Build-time settings: `VITE_SITE_URL` (absolute public origin for canonical URLs and the sitemap)
  and `VITE_DEMO_MODE=true` (shows the "public demo, self-host for real secrets" notices).

### Public demo on Vercel (optional)

The same code can run as a free public demo on Vercel + Neon. Only three root files are
Vercel-specific, and self-hosted installs ignore them: `vercel.json`, `api/index.py` (the API
function, with comments explaining the whole setup) and `requirements.txt` (generated from
`backend/uv.lock` by `make vercel-requirements`). The API adapts through opt-in settings,
`SERVERLESS`, `CRON_SECRET` and `CLIENT_IP_HEADER`, that are off by default. Step-by-step guide:
`/docs/vercel-demo` (`frontend/src/site/docs/content/vercel-demo.md`).

---

## Security model

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
  confirmation. Minimum 12 characters and a strength check apply, with advice to use something
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
   the 256 MB request cap on the rotation endpoint.
7. **Clipboard clearing is best effort.** Copied secrets are cleared after 30 s only where the browser
   allows clipboard access.
8. **Browser-reported audit events are best effort.** Wrong vault passwords, unlocks and
   decryptions happen only on the user's device, so the server can't verify them. A modified
   client, or someone who copied the encrypted key blob, can guess passwords offline without
   reporting anything. The real protection against guessing is Argon2id with a strong vault
   password. These reports catch everyday misuse and mistakes through the normal app.

---

## Permissions model

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

---

## Repository layout

```
docker-compose.yml          Postgres + Mailpit for development
docker-compose.prod.yml     Postgres + API + nginx web (production-style)
scripts/dev.sh              one-command local run
backend/
  src/vault_api/            FastAPI app: routers, services (access, vault, email, audit), models
  migrations/               Alembic migrations (incl. the append-only audit trigger)
  tests/                    pytest against a real Postgres
  Dockerfile
frontend/
  src/site/                 public site: landing page, docs (Markdown in docs/content), privacy
  scripts/prerender.mjs     pre-renders the public site to static HTML after the build
  src/vault/                browser cryptography, key session, protocol, pinning, .env parser (+ tests)
  src/components/vault/     vault dialogs, recovery key panel, .env editor, fingerprints, status
  src/components/ui/        shadcn components (CLI-generated, restyled via tokens)
  src/routes/               pages
  Dockerfile, nginx.conf    production image with CSP
```
