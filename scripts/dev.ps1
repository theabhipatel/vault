# Start everything for local development on Windows (no WSL needed):
# Postgres + Mailpit (Docker Desktop), the API and the web app.
# Run it with scripts\dev.cmd (that wrapper takes care of PowerShell's execution policy).
# Works in Windows PowerShell 5.1 and PowerShell 7+.

$ErrorActionPreference = 'Continue'   # native tools write progress to stderr; we check exit codes instead
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

$WebPort = 29180
$ApiPort = 29100
$MailUiPort = 29825

function Fail([string]$Message) {
    Write-Host ''
    Write-Host "  $Message" -ForegroundColor Red
    Write-Host ''
    exit 1
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PortBusy([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true } catch { return $false } finally { $client.Close() }
}

function Invoke-Step([string]$What, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE). See the output above." }
}

# ---- Prerequisites ---------------------------------------------------------------------
if (-not (Test-Command 'docker')) { Fail 'Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is not running. Start it, wait until it says "Engine running", then retry.' }
if (-not (Test-Command 'uv')) {
    Fail 'uv is not installed. Run:  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"   then open a new terminal.'
}
if (-not (Test-Command 'node')) { Fail 'Node.js is not installed. Install Node 22 LTS from https://nodejs.org, then open a new terminal.' }
$nodeVersion = [version]((node --version).TrimStart('v'))
if (-not (($nodeVersion.Major -gt 22) -or ($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 12) -or ($nodeVersion.Major -eq 20 -and $nodeVersion.Minor -ge 19))) {
    Fail "Node $nodeVersion is too old. Vite needs Node 20.19+ or 22.12+."
}

foreach ($port in @($ApiPort, $WebPort)) {
    if (Test-PortBusy $port) { Fail "Port $port is already in use. Stop whatever is using it (maybe an earlier run of this script)." }
}

# ---- Database and mail catcher --------------------------------------------------------
Invoke-Step 'Starting Postgres and Mailpit' { docker compose -f (Join-Path $Root 'docker-compose.yml') up -d --wait }

# ---- Backend ---------------------------------------------------------------------------
Set-Location $Backend
$envFile = Join-Path $Backend '.env'
if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $content = (Get-Content (Join-Path $Backend '.env.example') -Raw) -replace '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$secret"
    [System.IO.File]::WriteAllText($envFile, $content)   # UTF-8 without BOM
    Write-Host '  Created backend\.env with a random SECRET_KEY.'
}
Invoke-Step 'Installing backend packages (uv sync)' { uv sync --quiet }
Invoke-Step 'Database migrations' { uv run alembic upgrade head }

# ---- Frontend --------------------------------------------------------------------------
Set-Location $Frontend
if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
    Invoke-Step 'Installing frontend packages (npm install)' { npm install }
}

# ---- Run both; Ctrl+C stops both -------------------------------------------------------
$api = Start-Process -FilePath (Get-Command uv).Source -WorkingDirectory $Backend -NoNewWindow -PassThru -ArgumentList @(
    'run', 'uvicorn', 'vault_api.main:app', '--reload', '--host', '127.0.0.1', '--port', "$ApiPort", '--proxy-headers')
$web = Start-Process -FilePath (Get-Command node).Source -WorkingDirectory $Frontend -NoNewWindow -PassThru -ArgumentList @(
    'node_modules/vite/bin/vite.js', '--host', 'localhost')

Write-Host ''
Write-Host "  Web app:  http://localhost:$WebPort"
Write-Host "  API docs: http://localhost:$ApiPort/api/docs"
Write-Host "  Mailpit:  http://localhost:$MailUiPort   (every email the app sends lands here)"
Write-Host '  Press Ctrl+C to stop.'
Write-Host ''

try {
    while (-not $api.HasExited -and -not $web.HasExited) { Start-Sleep -Seconds 1 }
    Write-Host '  One of the servers stopped; shutting down the other.' -ForegroundColor Yellow
}
finally {
    foreach ($process in @($api, $web)) {
        if ($process -and -not $process.HasExited) { taskkill /PID $process.Id /T /F *> $null }
    }
}
