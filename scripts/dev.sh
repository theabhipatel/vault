#!/usr/bin/env bash
# Start everything for local development: Postgres + Mailpit (Docker), the API and the web app.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker compose -f "$ROOT/docker-compose.yml" up -d --wait

cd "$ROOT/backend"
[ -f .env ] || { cp .env.example .env; sed -i.bak "s/^SECRET_KEY=.*/SECRET_KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')/" .env && rm -f .env.bak; }
uv sync --quiet
uv run alembic upgrade head

cd "$ROOT/frontend"
[ -d node_modules ] || npm install

trap 'kill 0' EXIT INT TERM
(cd "$ROOT/backend" && uv run uvicorn vault_api.main:app --reload --host 127.0.0.1 --port 8000 --proxy-headers) &
(cd "$ROOT/frontend" && npx vite --host localhost) &

echo ""
echo "  Web app:  http://localhost:5180"
echo "  API docs: http://localhost:8000/api/docs"
echo "  Mailpit:  http://localhost:8025   (every email the app sends lands here)"
echo ""
wait
