"""Vercel entry point for the Secure Vault API. Used only by the Vercel demo deployment.

Self-hosted installs never load this file (or vercel.json / requirements.txt at the repo root):
Docker and ./scripts/dev.sh run `uvicorn vault_api.main:app` straight from backend/. The demo
runs the very same application object, configured with environment variables.

How the Vercel deployment fits together (vercel.json can't hold comments, so they live here):

- Frontend: `npm run build` in frontend/ produces the pre-rendered public site plus the app
  shell (app.html). Vercel serves frontend/dist from its CDN.
- API: Vercel turns each .py file in /api into a function, so this file becomes one function.
  vercel.json rewrites every /api/* request to it. FastAPI still sees the original path
  (/api/auth/session, ...), so the routes are exactly the self-hosted ones.
- Packages: installed from requirements.txt at the repo root, generated from backend/uv.lock
  by `make vercel-requirements` (same versions as the Docker image).
- Pages: real files win, as with nginx's try_files. /docs/<page> and /privacy map to their
  pre-rendered index.html, and every other path falls back to app.html (the React app).
- Headers: the same Content-Security-Policy and security headers as frontend/nginx.conf.
- Cron: once a day Vercel calls GET /api/internal/cron with "Authorization: Bearer
  <CRON_SECRET>", which retries unsent emails and removes expired sessions and tokens.
- Function files: frontend/, tests, migrations and docs are excluded from the function bundle.

Required environment variables (Project → Settings → Environment Variables):
  SERVERLESS=true          no background loops, inline email, per-request DB connections
  DATABASE_URL             Neon's *pooled* connection string, pasted as-is
  APP_URL                  https://<your-project>.vercel.app (or your custom domain)
  SECRET_KEY, CRON_SECRET  long random strings
  COOKIE_SECURE=true, ENVIRONMENT=production, CLIENT_IP_HEADER=x-real-ip
  SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / SMTP_STARTTLS / MAIL_FROM
  VITE_DEMO_MODE=true, VITE_SITE_URL=<same as APP_URL>   (read by the frontend build)
See the docs page "Deploy a demo on Vercel" (frontend/src/site/docs/content/vercel-demo.md).
"""

import sys
from pathlib import Path

# The API is a src-layout package in backend/ that isn't pip-installed on Vercel; its files are
# part of the function bundle, so make them importable directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "src"))

from vault_api.main import app  # (importable thanks to the path above)

__all__ = ["app"]
