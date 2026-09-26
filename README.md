# Vault

A self-hosted, multi-workspace team vault. Teams keep two kinds of documents in projects:

- **Normal documents**: plain text or Markdown, protected by access control. The server can read them.
- **Secure documents**: text, Markdown or `.env` files, **end-to-end encrypted in the browser**. The server
  only ever stores ciphertext.

> **Build status.** The project is delivered in two parts.
> **Part 1 (this delivery)** is the full platform: accounts, workspaces, invitations, roles and permissions,
> projects, normal documents, audit log, notifications and the complete UI.
> **Part 2** adds the vault: key generation, unlock, secure documents, sharing, revocation and rotation,
> recovery. Until then, secure documents show a locked "Set up your vault" state.

---

## Quick start

Requirements: Docker (with Compose), Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 20+.

```bash
./scripts/dev.sh        # or: make dev
```

This starts PostgreSQL and Mailpit in Docker, creates `backend/.env` with a random `SECRET_KEY` if it's
missing, runs migrations, and starts the API and the web app:

| What | URL |
|---|---|
| Web app | http://localhost:5180 |
| API docs (dev only) | http://localhost:8000/api/docs |
| Mailpit (all outgoing email) | http://localhost:8025 |

Sign up, open the verification email in Mailpit, and you'll be taken through onboarding.

### Running the parts yourself

```bash
docker compose up -d                           # Postgres :5433, Mailpit :1025/:8025
cd backend && cp .env.example .env && uv sync
uv run alembic upgrade head
uv run uvicorn vault_api.main:app --reload --port 8000 --proxy-headers
cd ../frontend && npm install && npm run dev   # http://localhost:5180
```

### Tests and checks

```bash
make test     # backend: auth flows, CSRF, lockout, permission and hierarchy rules (real Postgres)
make check    # ruff + mypy --strict, tsc (strict) + oxlint, production build
make gen-api  # regenerate frontend/src/lib/api-schema.ts from the backend's OpenAPI schema
```

Tests use the `vault_test` database that Docker Compose creates on first start.

### Configuration

Every setting is listed with comments in [backend/.env.example](backend/.env.example) and
[frontend/.env.example](frontend/.env.example). Google sign-in is optional: set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` and register `<APP_URL>/api/auth/google/callback` as the redirect URI. The
button appears automatically.

---

## Architecture

```
browser ──► /  (React SPA, built by Vite)
        └─► /api/*  ──► FastAPI ──► PostgreSQL
                          └─► email outbox ──► SMTP (Mailpit in dev)
```

The SPA and the API are always served from **one origin** (the Vite proxy in development, a reverse
proxy in production). Cookies stay first-party, and CORS stays closed.

**Backend** (`backend/src/vault_api`): FastAPI, fully typed (`mypy --strict`).
- SQLAlchemy 2 (async, asyncpg) with Alembic migrations.
- `permissions.py` holds the permission catalogue, default roles and the **pure** hierarchy rules, unit
  tested directly.
- `deps.py` resolves the acting user from the session cookie and their role in the workspace from the URL.
  Identity never comes from request data.
- `services/access.py` computes project visibility and "who has secure access to which project".
  Every change that could alter secure access (role, permissions, project assignment, membership) takes a
  snapshot before and diffs after. Losses trigger the revocation flow, gains queue key grants. Part 2
  attaches the key operations to these hooks.
- Email uses a transactional **outbox**: emails are committed in the same transaction as the change,
  then a worker delivers them with retries and backoff. Multiple instances are safe (`SKIP LOCKED`).
- Rate limits live in PostgreSQL, so they hold across instances.

**Frontend** (`frontend/src`): React 19, TypeScript strict, Vite, Tailwind v4, shadcn/ui (Radix).
- A typed API client is generated from the backend's OpenAPI schema (`openapi-typescript` +
  `openapi-fetch`); no hand-written API types.
- TanStack Query for server state, React Router for routing, react-hook-form + zod for forms.
- The theme lives in `src/index.css`: all colours (OKLCH), fonts, radii and shadows are tokens, with
  light and dark designed separately. Secure content has its own amber accent everywhere.
  `public/theme-init.js` applies the saved theme before first paint, so there's no flash.

---

## Permissions model

Roles are ranked: **Owner > Admin > Manager > Member**, plus any custom roles placed in the ladder.
The server enforces, on every request:

- You can only manage people and roles ranked **strictly below** your own.
- You can only grant or remove permissions **you hold yourself** (this also covers creating roles and
  assigning them).
- Only the owner manages admins and edits the Admin role. The Owner role can't be edited, assigned
  or deleted, only transferred.
- The database guarantees exactly one owner per workspace (a partial unique index).
- Members see only projects they're assigned to, unless their role has "access all projects".
  Project-scoped permissions (edit project, manage members, documents) only apply inside visible
  projects. That is how "Managers: own assigned projects" works.
- Deleting a role in use requires a replacement, and its members and pending invitations move over.

---

## Security model

### Accounts and sessions
- Login passwords are hashed with **Argon2id** (RFC 9106 parameters). The login password is unrelated
  to encryption; the vault password (Part 2) is separate and never sent to the server.
- Sessions are random 256-bit tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and
  `__Host-` prefixed when `COOKIE_SECURE=true`). Only a SHA-256 of the token is stored. Sessions have
  an absolute and an idle expiry, and can be listed and revoked individually or all at once.
  Changing or resetting a password signs out other sessions.
- **CSRF:** mutating requests need a matching double-submit token (the cookie value echoed in
  `X-CSRF-Token`) and, when present, an `Origin` equal to `APP_URL`.
- **Enumeration resistance:** sign-up, forgot-password and resend-verification return the same response
  whether or not the address exists. Sign-in failures share one message, and missing accounts cost the
  same Argon2 time.
- **Rate limiting and lockout:** per-IP limits on sign-in and email-sending endpoints; 5 failed
  sign-ins per address per 15 minutes locks that address. This applies equally to addresses that
  don't exist.
- **Pre-account-takeover protection:** a sign-up password is bound to its own verification link, so an
  unverified sign-up by someone else can't decide your password. Linking Google to an unverified
  account clears that account's unproven password.
- Google sign-in uses the authorization-code flow with PKCE and a signed, short-lived state cookie.
  Accounts are matched by Google's verified email.
- Security headers on every API response (`nosniff`, `frame-ancestors 'none'`, `no-referrer`,
  COOP/CORP, `no-store`, HSTS over HTTPS). Tokens and key material never appear in URLs, logs or
  error bodies. The only exception is the single-use email links themselves.

### Audit log
Append-only by construction: a PostgreSQL trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on
`audit_logs`. Entries record who, what, when, IP, user agent and result. They never contain document
content, passwords or key material, and they survive deletion of the user or workspace they describe.

### End-to-end encryption (Part 2)
Argon2id → KEK → AES-256-GCM-wrapped X25519 private key; per-project 256-bit keys sealed per member with
libsodium sealed boxes; AES-256-GCM content encryption bound to its location through associated data;
recovery key; rotation on revocation. The full key hierarchy and threat model will be documented here
with the implementation.

### Known limitation (inherent to browser-based E2EE)
Stored data is designed to stay safe under full server compromise. However, an attacker who controls
the **live** server could serve modified JavaScript that captures a vault password the next time a
user unlocks. Every browser-based end-to-end encrypted app shares this limitation. Mitigations:
self-hosted assets only (no third-party scripts, fonts or CDNs; fonts are bundled), a strict Content
Security Policy, and Subresource Integrity. Part 2 finalises these.

---

## Repository layout

```
docker-compose.yml        Postgres + Mailpit for local development
scripts/dev.sh            one-command local run
backend/
  src/vault_api/          FastAPI app (routers, services, models, permissions)
  migrations/             Alembic migrations (includes the audit-log trigger)
  tests/                  pytest suite against a real Postgres
frontend/
  src/components/ui/      shadcn components (CLI-generated, restyled via tokens)
  src/components/         app components (layout, dialogs, states)
  src/routes/             pages
  src/lib/                API client, generated schema types, theme, helpers
```
