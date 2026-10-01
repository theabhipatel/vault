This page lists every Secure Vault setting, its default and what it does. Backend settings live in `backend/.env` in development and in `.env.prod` with the production compose file. Frontend settings are only needed for development and for building the public site.

## How settings are loaded

The API reads its settings from environment variables and, in development, from a `.env` file in the directory it runs from (`backend/`). Start from the documented example:

```bash
cp backend/.env.example backend/.env
```

The dev scripts do this for you the first time, with a random `SECRET_KEY`.

Every setting also works as a plain environment variable with the same name, for example `SMTP_HOST=mail.example.com`. Environment variables take precedence over the `.env` file. Names aren't case-sensitive, but the docs use upper case throughout.

Boolean settings accept `true` or `false`. Settings without a default in the tables below are empty unless you set them.

## General

| Setting | Default | What it does |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. `production` turns off the interactive API docs (`/api/docs`) and the OpenAPI schema. `test` is for the test suite and doesn't start the email worker. The production compose file sets `production` for you. |
| `APP_URL` | `http://localhost:29180` | The public origin of the web app, exactly as it appears in the browser's address bar. Used for links in emails, the CSRF Origin check, CORS and the Google sign-in redirect URI. |
| `APP_NAME` | `Vault` | The name shown in emails, at the top of each message and in the signature line. |

## Database

| Setting | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://vault:vault@localhost:29432/vault` | PostgreSQL connection URL. Keep the `postgresql+asyncpg://` scheme. The default matches the development `docker-compose.yml`. The production compose file builds this for you from `POSTGRES_PASSWORD`. |
| `DATABASE_ECHO` | `false` | Logs every SQL statement. Useful for debugging, too noisy otherwise. |

## Security and sessions

| Setting | Default | What it does |
|---|---|---|
| `SECRET_KEY` | An insecure development value | Signs the short-lived state cookie used during Google sign-in. Must be long and random in production. Generate one with `python3 -c "import secrets;print(secrets.token_urlsafe(48))"`. |
| `COOKIE_SECURE` | `false` | Set to `true` whenever the app is served over HTTPS, which production always should be. It marks cookies `Secure`, gives them the `__Host-` prefix and makes the API send HSTS. |
| `SESSION_TTL_DAYS` | `30` | Absolute session lifetime. After this many days you have to sign in again, however active you are. |
| `SESSION_IDLE_DAYS` | `7` | A session that isn't used for this many days expires. |

These settings only affect sign-in sessions. The vault's auto-lock isn't a server setting: each person picks it under **Lock automatically after** in their vault settings, and it's remembered per browser.

## Email

| Setting | Default | What it does |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server host name. |
| `SMTP_PORT` | `29025` | SMTP server port. The default is Mailpit from the development `docker-compose.yml`. |
| `SMTP_USERNAME` | | SMTP user name. Leave it empty if your server doesn't need authentication. |
| `SMTP_PASSWORD` | | SMTP password. |
| `SMTP_STARTTLS` | `false` | Connects in plain text, then upgrades with STARTTLS. Usually port 587. |
| `SMTP_TLS` | `false` | Uses TLS from the first byte (implicit TLS). Usually port 465. Turn on at most one of `SMTP_STARTTLS` and `SMTP_TLS`. |
| `MAIL_FROM` | `Vault <no-reply@vault.local>` | The sender of every email, as `Name <address>`. |
| `EMAIL_WORKER_ENABLED` | `true` | Runs the background worker that delivers queued emails and does housekeeping, such as removing expired sessions and expiring old invitations. If it's off, emails stay queued and are never sent. |

Emails are written to an outbox in the database first, then delivered by the worker, which retries failed deliveries with increasing delays. See [Email and Google sign-in](/docs/email-and-google).

## Google sign-in

| Setting | Default | What it does |
|---|---|---|
| `GOOGLE_CLIENT_ID` | | OAuth client ID from Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | | OAuth client secret. |

Google sign-in is on only when both are set. Otherwise the Google buttons are hidden. Register `<APP_URL>/api/auth/google/callback` as the authorised redirect URI.

## Link lifetimes

| Setting | Default | What it does |
|---|---|---|
| `EMAIL_VERIFICATION_TTL_HOURS` | `48` | How long an email verification link works. |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | How long a password reset link works. Each link works once. |
| `INVITATION_TTL_DAYS` | `7` | How long a workspace invitation stays open before it expires. |

## Rate limits

Rate limits are stored in PostgreSQL, so they hold across restarts and across several API workers.

| Setting | Default | What it does |
|---|---|---|
| `SIGNIN_IP_LIMIT` | `30` | Sign-in attempts allowed from one IP address per sign-in window. |
| `SIGNIN_EMAIL_FAILURE_LIMIT` | `5` | Failed sign-ins allowed for one email address per sign-in window. After that, the address is locked out until the window passes. It behaves the same for addresses that don't have an account. |
| `SIGNIN_WINDOW_MINUTES` | `15` | Length of the sign-in window, in minutes. |
| `EMAIL_ACTION_LIMIT` | `5` | Sign-ups, verification resends and password reset requests allowed for one email address per email-action window. One IP address may make four times as many. |
| `EMAIL_ACTION_WINDOW_MINUTES` | `30` | Length of the email-action window, in minutes. |
| `TOKEN_SUBMIT_IP_LIMIT` | `30` | Verification and password reset links that one IP address may submit per 15 minutes. |

When a limit is hit, the user sees "Too many attempts. Please try again in about N minutes."

## Uploads

| Setting | Default | What it does |
|---|---|---|
| `MAX_AVATAR_BYTES` | `1000000` | Largest profile picture you can upload, in bytes (about 1 MB). |

## Production compose settings

The production compose file reads two more variables from `.env.prod`. They configure the containers, not the API.

| Setting | Default | What it does |
|---|---|---|
| `POSTGRES_PASSWORD` | None, required | Password for the `vault` database user. Compose refuses to start without it. Use letters and digits only, because it's placed inside a URL. |
| `WEB_PORT` | `29080` | Host port where the `web` container (nginx) is published. Put your TLS reverse proxy in front of it. |

See [Production](/docs/production) for how these fit together.

## Frontend settings

The browser app has no runtime settings or secrets: it always talks to the API on its own origin, under `/api`. The frontend settings below are read by the Vite dev server and by the build.

| Setting | Default | What it does |
|---|---|---|
| `API_PROXY_TARGET` | `http://127.0.0.1:29100` | Where the Vite dev server (`npm run dev`) and preview server (`npm run preview`) forward `/api` requests. Change it if your API runs on another port or host. |
| `VITE_SITE_URL` | | The absolute public origin of the site, for example `https://vault.example.com`. Used for canonical and Open Graph URLs and for the sitemap. |
| `VITE_DEMO_MODE` | | Set to `true` to show the public-demo notices on the landing page and in the docs. Leave it unset on your own deployment. |

`API_PROXY_TARGET` is read from the environment when the dev or preview server starts:

```bash
API_PROXY_TARGET=http://127.0.0.1:29101 npm run dev
```

`VITE_SITE_URL` and `VITE_DEMO_MODE` are **build-time** settings. They're baked into the files when you run `npm run build`, so changing them later requires a rebuild. Set them in the environment for the build, or in `frontend/.env.production`, which Vite reads during a production build:

```env
VITE_SITE_URL=https://vault.example.com
VITE_DEMO_MODE=false
```

> [!NOTE]
> Never put secrets in a `VITE_` setting. Anything with that prefix ends up in the JavaScript that every visitor downloads.
