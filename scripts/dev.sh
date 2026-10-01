#!/usr/bin/env bash
# Start everything for local development on Linux, macOS or Windows WSL:
# Postgres + Mailpit (Docker), the API and the web app. Windows without WSL: scripts\dev.cmd
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

WEB_PORT=29180
API_PORT=29100
MAIL_UI_PORT=29825

fail() { printf '\n  \033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# ---- Prerequisites ---------------------------------------------------------------------
command -v docker >/dev/null || fail "Docker is not installed. Install Docker Desktop (macOS) or Docker Engine (Linux)."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running (or needs sudo). Start Docker Desktop / the docker service and retry."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is missing ('docker compose'). Update Docker."
command -v uv >/dev/null || fail "uv is not installed: curl -LsSf https://astral.sh/uv/install.sh | sh   (then open a new terminal)"
command -v node >/dev/null || fail "Node.js is not installed. Install Node 22 LTS from https://nodejs.org (or: brew install node)."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)' \
  || fail "Node $(node --version) is too old. Vite needs Node 20.19+ or 22.12+."

case "$ROOT" in /mnt/[a-z]/*)
  echo "  Note: the repo is on the Windows drive ($ROOT). It works, but it is slow and auto-reload may"
  echo "  not notice changes. For best results clone it inside WSL, e.g. into ~/vault."
esac

for port in "$API_PORT" "$WEB_PORT"; do
  port_busy "$port" && fail "Port $port is already in use. Stop whatever is using it (maybe an earlier run of this script)."
done

# ---- Database and mail catcher --------------------------------------------------------
docker compose -f "$ROOT/docker-compose.yml" up -d --wait

# ---- Backend ---------------------------------------------------------------------------
cd "$ROOT/backend"
if [ ! -f .env ]; then
  secret="$(uv run --no-project python -c 'import secrets;print(secrets.token_urlsafe(48))')"
  sed "s/^SECRET_KEY=.*/SECRET_KEY=$secret/" .env.example > .env
  echo "  Created backend/.env with a random SECRET_KEY."
fi
uv sync --quiet
uv run alembic upgrade head

# ---- Frontend --------------------------------------------------------------------------
cd "$ROOT/frontend"
[ -d node_modules ] || npm install

# ---- Run both; Ctrl+C stops both -------------------------------------------------------
trap 'kill 0' EXIT INT TERM
(cd "$ROOT/backend" && uv run uvicorn vault_api.main:app --reload --host 127.0.0.1 --port "$API_PORT" --proxy-headers) &
(cd "$ROOT/frontend" && npx vite --host localhost) &

echo ""
echo "  Web app:  http://localhost:$WEB_PORT"
echo "  API docs: http://localhost:$API_PORT/api/docs"
echo "  Mailpit:  http://localhost:$MAIL_UI_PORT   (every email the app sends lands here)"
echo "  Press Ctrl+C to stop."
echo ""
wait
