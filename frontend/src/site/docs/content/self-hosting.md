This page shows you how to run Secure Vault on your own computer with one command, on Linux, macOS or Windows. When you're ready to put it on a server, continue with [Production](/docs/production).

## Requirements

Install these three things first. The start scripts check for each one and tell you exactly what's missing.

| Tool | Version | Notes |
|---|---|---|
| **Docker** | Docker Compose v2 (`docker compose`) | Docker Desktop on macOS and Windows, Docker Engine on Linux. It must be running. |
| **[uv](https://docs.astral.sh/uv/getting-started/installation/)** | Any recent version | The Python package manager. It installs Python 3.12 for you if needed. |
| **Node.js** | 22.12 or newer, or 20.19 or newer on Node 20 | Node 22 LTS is recommended. Vite refuses older versions. |

You also need Git to clone the repository.

## Linux and macOS

```bash
git clone https://github.com/theabhipatel/vault.git vault
cd vault
./scripts/dev.sh
```

If you have `make`, `make dev` does the same thing.

## Windows without WSL

Use PowerShell or Command Prompt. You need Docker Desktop, uv and Node.js installed for Windows.

```powershell
git clone https://github.com/theabhipatel/vault.git vault
cd vault
scripts\dev.cmd
```

`dev.cmd` runs `scripts\dev.ps1` with PowerShell's execution policy bypassed for that run only, so you don't have to change any system setting. It works in Windows PowerShell 5.1 and PowerShell 7+.

## Windows with WSL

If you prefer WSL, run everything inside your Linux distribution:

1. In Docker Desktop, open **Settings** → **Resources** → **WSL Integration** and turn it on for your distro.
2. Open the WSL terminal and install uv and Node.js **inside WSL**. The Windows versions don't count.
3. Clone into your Linux home directory, not into `/mnt/c`:

   ```bash
   cd ~
   git clone https://github.com/theabhipatel/vault.git vault
   cd vault
   ./scripts/dev.sh
   ```

> [!TIP]
> A repository under `/mnt/c` works, but it's slow, and auto-reload may not notice your changes. The script prints a note if it detects this. Clone into `~` instead.

## What the script does

The scripts for each system do the same steps, in this order:

1. **Checks requirements.** Docker is installed and running, uv and Node.js are installed, and Node.js is new enough. On Linux and macOS it also checks for Docker Compose v2.
2. **Checks ports.** It stops if port 29100 (API) or 29180 (web app) is already in use.
3. **Starts PostgreSQL and Mailpit** in Docker with `docker compose up -d --wait`, using `docker-compose.yml`. It waits until PostgreSQL is healthy.
4. **Creates `backend/.env`** from `backend/.env.example` if it doesn't exist yet, with a freshly generated random `SECRET_KEY`. An existing `backend/.env` is never overwritten.
5. **Installs backend packages** with `uv sync`.
6. **Runs database migrations** with `uv run alembic upgrade head`.
7. **Installs frontend packages** with `npm install`, only if `frontend/node_modules` doesn't exist yet.
8. **Starts the API** (uvicorn with auto-reload on `127.0.0.1:29100`) and **the web app** (the Vite dev server on port 29180).

Press `Ctrl` + `C` to stop both servers. PostgreSQL and Mailpit keep running in Docker. Stop them with `docker compose down`. Your data lives in a Docker volume and survives restarts.

## URLs and ports

| What | Address |
|---|---|
| Web app | `http://localhost:29180` |
| API docs (development only) | `http://localhost:29100/api/docs` |
| Mailpit web UI, where every outgoing email lands | `http://localhost:29825` |

Every port is in the uncommon 29xxx range, so Secure Vault doesn't clash with a local PostgreSQL (5432) or other dev servers (3000, 5173, 8000, 8080 and so on).

| Service | Port | Change it in |
|---|---|---|
| Web app (Vite) | 29180 | `frontend/vite.config.ts`, `APP_URL` in `backend/.env`, both dev scripts |
| API (uvicorn) | 29100 | Both dev scripts, `API_PROXY_TARGET` (frontend) |
| PostgreSQL | 29432 | `docker-compose.yml`, `DATABASE_URL` in `backend/.env` |
| Mailpit SMTP / web UI | 29025 / 29825 | `docker-compose.yml`, `SMTP_PORT` in `backend/.env` |
| Production web (nginx) | 29080 | `WEB_PORT` in `.env.prod` |

Docker publishes the development ports on `127.0.0.1` only, so they aren't reachable from other machines.

Open the web app, sign up, open the verification email in Mailpit, name your workspace and set up your vault. The [Quick start](/docs/quick-start) walks you through it.

## Running the pieces by hand

If you'd rather start each part yourself, for example to see each log in its own terminal:

```bash
docker compose up -d                  # Postgres on 29432 (plus a vault_test database), Mailpit on 29025/29825

cd backend
cp .env.example .env                  # then set SECRET_KEY to a long random string
uv sync
uv run alembic upgrade head
uv run uvicorn vault_api.main:app --reload --port 29100 --proxy-headers
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev                           # http://localhost:29180
```

The Vite dev server proxies `/api` to the backend, so the app and the API share one origin, just as in production.

To try the production build locally, run `npm run build && npm run preview` in `frontend`. The preview server applies the production Content Security Policy. The dev server can't, because Vite's hot reload needs inline scripts.

## Running tests and checks

The backend tests run against a real PostgreSQL database (`vault_test`, created automatically by `docker-compose.yml`), so start Docker first with `docker compose up -d`.

```bash
make test                   # backend: pytest
cd frontend && npm test     # frontend: vitest, including the crypto flows with real libsodium and WebCrypto
make check                  # ruff + mypy --strict, tsc + oxlint, and a production build
make gen-api                # regenerate the typed API client from the backend's OpenAPI schema
```

Without `make` (for example on Windows), run the commands directly:

```powershell
cd backend; uv run pytest -q
cd ..\frontend; npm test
```

## Common problems

### "Port 29100 is already in use" (or 29180)

Something else is listening on that port, usually an earlier run of the script that didn't shut down. Stop it and run the script again.

- Linux and macOS: find it with `lsof -i :29100`.
- Windows: find it with `netstat -ano | findstr :29100`, then end the process in Task Manager.

If PostgreSQL's port 29432 or Mailpit's ports are taken, `docker compose` reports the conflict instead. Change the ports as shown in the table above.

### Docker isn't running

The script stops with "Docker is installed but not running" (Linux and macOS) or "Docker Desktop is not running" (Windows).

- macOS and Windows: start Docker Desktop and wait until it shows that the engine is running.
- Linux: start the service with `sudo systemctl start docker`. If Docker only works with `sudo`, add yourself to the `docker` group with `sudo usermod -aG docker $USER`, then log out and back in.
- WSL: make sure WSL integration is on for your distro in Docker Desktop.

### CRLF line endings

If `./scripts/dev.sh` fails with `/usr/bin/env: 'bash\r': No such file or directory` or `$'\r': command not found`, the shell script has Windows line endings. The repository's `.gitattributes` keeps Unix line endings on checkout, so this usually means the files were copied from a ZIP download or converted by an editor. Clone the repository again with Git, inside WSL if you use it. To fix just the one file:

```bash
sed -i 's/\r$//' scripts/dev.sh
```

### Node.js is too old

The script stops with "Node … is too old. Vite needs Node 20.19+ or 22.12+." Install Node.js 22 LTS from [nodejs.org](https://nodejs.org), or with your version manager, then open a new terminal so the new version is on your `PATH`. On WSL, upgrade the Node.js inside WSL.

### A tool was just installed but isn't found

After installing uv or Node.js, open a **new** terminal. The old one still has the previous `PATH`.
