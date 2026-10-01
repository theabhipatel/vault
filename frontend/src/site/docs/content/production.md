This page shows you how to run Secure Vault on a server with `docker-compose.prod.yml`, put HTTPS in front of it, and keep it updated and backed up. You only need Docker and Docker Compose v2 on the server. uv and Node.js aren't required, because the images build everything themselves.

## What runs

The production stack (Compose project name `vault-prod`) has three containers:

| Container | Built from | What it does |
|---|---|---|
| `postgres` | `postgres:17-alpine` | Stores everything in the `pgdata` volume. It isn't published to the host. |
| `api` | `backend/Dockerfile` (Python 3.12) | Applies database migrations on every start, then serves the FastAPI app with uvicorn (2 workers, port 8000, inside the Docker network only). Runs as a non-root user. It also sends queued emails. |
| `web` | `frontend/Dockerfile` (built with Node 22, served by nginx 1.27) | Serves the built web app with strict security headers and proxies `/api/` to the `api` container. Listens on port 8080 inside the container, published on the host as `WEB_PORT` (default `29080`). |

All three restart automatically (`restart: unless-stopped`). The `api` container waits until PostgreSQL is healthy.

```text
browser ──HTTPS──► your reverse proxy (TLS) ──HTTP──► web :29080 (nginx)
                                                        ├─ /       the web app
                                                        └─ /api/   ──► api :8000 ──► postgres
```

## 1. Create .env.prod

Clone the repository on the server and create `.env.prod` in its root, starting from the backend example:

```bash
git clone https://github.com/theabhipatel/vault.git vault
cd vault
cp backend/.env.example .env.prod
```

`.env.prod` does two jobs. Compose reads it for variables in the compose file (`POSTGRES_PASSWORD`, `WEB_PORT`), and passes it to the `api` container as its settings. It's listed in `.gitignore`, so it won't be committed.

Edit these settings:

```env
APP_URL=https://vault.example.com
SECRET_KEY=replace-with-a-long-random-string
COOKIE_SECURE=true
POSTGRES_PASSWORD=replace-with-a-long-random-password

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=vault@example.com
SMTP_PASSWORD=replace-with-your-smtp-password
SMTP_STARTTLS=true
SMTP_TLS=false
MAIL_FROM=Secure Vault <vault@example.com>

# Optional
# WEB_PORT=29080
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

| Setting | Why it matters |
|---|---|
| `APP_URL` | The exact public address people type into their browser, including `https://` and no trailing path. It's used for links in emails, the CSRF Origin check, CORS and the Google sign-in redirect. If it doesn't match, every sign-in and save is rejected. |
| `SECRET_KEY` | Signs short-lived Google sign-in state cookies. Generate one with `python3 -c "import secrets;print(secrets.token_urlsafe(48))"`. |
| `POSTGRES_PASSWORD` | Required: Compose refuses to start without it. It's placed inside a database URL, so use letters and digits only (for example `openssl rand -hex 32`). PostgreSQL only applies it when the volume is first created. Changing it later doesn't change the database password. |
| `SMTP_*`, `MAIL_FROM` | Your mail server. Without working email, people can't verify their address, reset passwords or receive invitations. See [Email and Google sign-in](/docs/email-and-google). |
| `COOKIE_SECURE=true` | Required for HTTPS. Turns on `Secure` and `__Host-` cookies and makes the API send HSTS. |
| `ENVIRONMENT` | You don't need to set it. The compose file forces `production`, which also hides the API docs. |

The compose file also sets `DATABASE_URL` for the `api` container, so the value copied from the example is ignored. Every other setting is described in the [Configuration reference](/docs/configuration).

## 2. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The first build takes a few minutes. Check it's healthy:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
curl http://127.0.0.1:29080/api/health      # {"status":"ok"}
```

> [!TIP]
> The commands are long. Put `alias vault-compose='docker compose -f docker-compose.prod.yml --env-file .env.prod'` in your shell profile and run `vault-compose ps`, `vault-compose logs -f api` and so on from the repository root.

## 3. Put TLS in front

The `web` container speaks plain HTTP. Put a reverse proxy that terminates TLS in front of it, such as Caddy, nginx or Traefik, or a cloud load balancer. Forward all traffic for your hostname, both `/` and `/api/`, to `WEB_PORT`.

With **Caddy**, which fetches certificates automatically:

```text
vault.example.com {
    reverse_proxy 127.0.0.1:29080
}
```

With **nginx**:

```nginx
server {
    listen 443 ssl;
    server_name vault.example.com;
    ssl_certificate     /etc/ssl/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/vault.example.com/privkey.pem;

    client_max_body_size 256m;   # key rotation uploads a whole project at once

    location / {
        proxy_pass http://127.0.0.1:29080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # replace, don't append: clients can't spoof it
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Two details matter here:

- **Allow large requests.** Key rotation re-uploads every encrypted document and version of a project in one request, up to 256 MB. nginx's default limit is 1 MB, so raise it as shown.
- **Pass the real client IP.** Rate limits and the audit log use the first address in `X-Forwarded-For`, and the containers behind your proxy trust it. Have your proxy set it to the connecting client's address instead of appending to whatever the client sent, as in the nginx example. Caddy ignores client-supplied forwarding headers by default.

By default Docker publishes `WEB_PORT` on all interfaces. If the proxy runs on the same host, set `WEB_PORT=127.0.0.1:29080` in `.env.prod`, so only the proxy can reach the container and nobody can bypass TLS or fake the forwarded IP.

## Why one origin matters

The web app and the API must be served from **the same origin** (scheme, host and port), which is what the `web` container gives you: `/` serves the app and `/api/` is proxied to the API. Don't put the API on a separate domain.

- Session cookies are `HttpOnly` and `SameSite=Lax`. With `COOKIE_SECURE=true` they use the `__Host-` prefix, which pins them to exactly one origin.
- Every request that changes something must carry a CSRF token that only same-origin JavaScript can read, and its `Origin` header must equal `APP_URL`.
- CORS only allows `APP_URL`.

So if the address in the browser differs from `APP_URL` in any way, such as `http` vs `https`, `www` vs no `www`, or an extra port, requests are blocked.

## Migrations

You don't run migrations by hand. Every time the `api` container starts, it runs `alembic upgrade head` before starting the server. If a migration fails, the container exits and restarts. Check `logs api` to see why.

## Updating

1. Back up the database, as shown under **Backups** below.
2. Pull the new version and rebuild:

   ```bash
   git pull
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
   ```

3. The `api` container applies any new migrations as it starts. Watch its logs until it's serving again.

Compare `backend/.env.example` with your `.env.prod` after an update, in case new settings appeared.

## Backups

Back up two things: the PostgreSQL database and your `.env.prod`. Dump the database with `pg_dump` inside the `postgres` container:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres pg_dump -U vault -d vault > vault-$(date +%F).sql
```

Run it on a schedule (for example with cron) and copy the files off the server.

To restore, start from an empty database, so no migrations have run yet:

```bash
# on a fresh pgdata volume, start only Postgres
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U vault -d vault < vault-2026-10-01.sql
# then start everything else
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

> [!IMPORTANT]
> Secure documents stay encrypted in a backup, but normal documents, names, members and the audit log are readable. Protect backups like the live database. A backup also can't help someone who lost both their vault password and recovery key: those never reach the server. See [Recovery](/docs/recovery).

## Security headers

The `web` container's nginx sends these on every page:

- A strict **Content Security Policy**: scripts, styles, fonts, workers and connections only from your own origin, no inline scripts, no `eval`, and `frame-ancestors 'none'`. Only `wasm-unsafe-eval` is allowed, so the cryptography library's WebAssembly can compile. Inline styles are allowed because the UI library injects small style elements.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and `Strict-Transport-Security` (two years, including subdomains).

The build adds a sha384 **Subresource Integrity** hash to every script, stylesheet and module preload in `index.html`, and never inlines assets. `index.html` is always revalidated, while hashed files under `/assets/` are cached for a year. The web app loads nothing from third-party servers: fonts and libraries are bundled.

The API adds its own headers to every response, including `Cache-Control: no-store`.

Because `ENVIRONMENT` is `production`, the interactive API docs (`/api/docs`) and the OpenAPI schema (`/api/openapi.json`) are turned off. `/api/health` stays available for monitoring.

To understand what these measures do and don't protect against, read the [Security model](/docs/security-model) and [Limitations](/docs/limitations).
