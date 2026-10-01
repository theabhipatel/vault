This page shows you how to run a public **demo** of Secure Vault on Vercel with a Neon PostgreSQL database, using only free plans. The demo runs exactly the same code as a self-hosted install. A few settings adapt it to serverless hosting, and nothing else changes.

> [!WARNING]
> A Vercel demo is for letting people try Secure Vault. For real secrets, [self-host it](/docs/production) on a server you control. Set `VITE_DEMO_MODE=true` so every visitor sees that message.

## How it fits together

| Part | Self-hosted (Docker) | Vercel demo |
|---|---|---|
| Web app and public site | nginx serves `frontend/dist` | Vercel's CDN serves `frontend/dist` |
| API | uvicorn runs `vault_api.main:app` | One Vercel Function (`api/index.py`) runs the same `app` |
| Database | PostgreSQL container | Neon (free plan) |
| Sending email | Background worker | Sent during the request that queued it, with a daily retry |
| Housekeeping | Background worker, every 10 minutes | Daily Vercel Cron call |
| Security headers | `frontend/nginx.conf` | `vercel.json`, same values |

The Vercel-only files are `vercel.json`, `api/index.py` and `requirements.txt` at the repository root. Docker and the dev scripts never read them. `api/index.py` explains each part of `vercel.json` in its comments.

## What you need

- The repository on your GitHub account.
- A free [Vercel](https://vercel.com) account (Hobby plan).
- A free [Neon](https://neon.com) account.
- An SMTP account that can send to any address, for example a Gmail account with an app password (`smtp.gmail.com`, port 587) or Brevo's free plan (`smtp-relay.brevo.com`, port 587).
- On your computer: the repository and [uv](https://docs.astral.sh/uv/), to run the database migration once.

## 1. Create the database

1. In Neon, create a project. Choose the region **AWS US East 1 (N. Virginia)**, which is next to Vercel's default function region (`iad1`), so every query is fast.
2. Open **Connect** and copy two connection strings:
   - the **pooled** one, with `-pooler` in the host name, for the app;
   - the **direct** one, without `-pooler`, for migrations.

Paste them exactly as Neon shows them (`postgresql://...?sslmode=require`). The API converts them to the format its driver needs.

## 2. Create the tables

From the repository on your computer, run the migrations against the **direct** URL:

```bash
cd backend
DATABASE_URL='postgresql://user:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require' \
  uv run alembic upgrade head
```

Run this again whenever you deploy a version that adds migrations. The Docker image does this on every start, but a serverless function shouldn't change the schema while requests are running.

## 3. Import the project into Vercel

1. In Vercel, click **Add New → Project** and import the repository.
2. Leave **Root Directory** at the repository root. `vercel.json` already sets the framework preset, build command and output directory.
3. Before deploying, add the environment variables from the next step.

## 4. Set the environment variables

Add these under **Settings → Environment Variables** for the **Production** environment:

```env
# Serverless mode: no background loops, inline email, per-request database connections
SERVERLESS=true
ENVIRONMENT=production
COOKIE_SECURE=true
CLIENT_IP_HEADER=x-real-ip

# Your production address, exactly as in the browser (no trailing slash)
APP_URL=https://your-project.vercel.app
SECRET_KEY=a-long-random-string
CRON_SECRET=another-long-random-string

# Neon's POOLED connection string
DATABASE_URL=postgresql://user:password@ep-example-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require

# Your SMTP account (Gmail shown)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=your-16-character-app-password
MAIL_FROM=Secure Vault Demo <you@gmail.com>

# Read by the frontend build
VITE_DEMO_MODE=true
VITE_SITE_URL=https://your-project.vercel.app
```

Generate each random string with `python3 -c "import secrets;print(secrets.token_urlsafe(48))"`.

If you don't know the final address yet, deploy once, copy the address from Vercel, update `APP_URL` and `VITE_SITE_URL`, and redeploy.

Optional: to enable Google sign-in, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and register `<APP_URL>/api/auth/google/callback` as the redirect URI. See [Email and Google sign-in](/docs/email-and-google).

## 5. Deploy and check

Click **Deploy**. When the build finishes:

1. Open `https://your-project.vercel.app/api/health`. It should show `{"status":"ok"}`.
2. Open the home page, sign up, and check that the verification email arrives.
3. Under **Settings → Cron Jobs**, check that `/api/internal/cron` is listed.

Every push to your main branch then deploys automatically. Run step 2 first when a release adds migrations.

## What the serverless settings change

| Setting | Effect |
|---|---|
| `SERVERLESS=true` | The email worker and housekeeping loops don't start, because Vercel pauses the function between requests. Each email is sent before the request that queued it returns. Database connections are opened per request and are safe through Neon's pooler. |
| `CRON_SECRET` | Turns on `GET /api/internal/cron`, which Vercel calls once a day with this secret. It retries emails that failed to send and removes expired sessions, links and rate-limit records. Without the secret the endpoint returns 404. |
| `CLIENT_IP_HEADER=x-real-ip` | Takes the visitor's IP from Vercel's header, for rate limits, the audit log and the sessions list. Set it only behind a proxy that always overwrites that header, as Vercel does. |

All three default to off, so a self-hosted install behaves exactly as before. See the [Configuration reference](/docs/configuration).

## Limits of the free demo

| Limit | What it means |
|---|---|
| 4.5 MB per request | Vercel rejects larger request bodies. Single documents are fine, because the app already limits them to about 1 MB. Rotating keys in a project with several MB of encrypted documents can fail, and the user sees "This is too large for the server to accept". Self-hosted allows 256 MB for key rotation. |
| Neon pauses when idle | The first request after a quiet period can take a second or two. |
| Cron runs once a day | On the Hobby plan, an email that failed to send is retried the next day. A user can also ask for it again, for example with **Send a new link** on the sign-in page. |
| Preview deployments | Preview URLs differ from `APP_URL`, so the API's same-origin check blocks sign-in and other changes there. Use the production address. |
| Hobby plan | Vercel's free plan is for personal, non-commercial projects. |

## Troubleshooting

| Problem | Fix |
|---|---|
| Every action fails with "Cross-origin request blocked" | `APP_URL` doesn't exactly match the address in the browser. Fix it (including `https://`, no trailing slash) and redeploy. |
| API calls fail with "relation ... does not exist" | The migrations haven't run. Do step 2. |
| No emails arrive | Check the SMTP settings, and check the function logs in Vercel for "Inline email delivery failed". With Gmail you need an app password, not your normal password. |
