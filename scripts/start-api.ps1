param([int]$Port = 8000, [switch]$Migrate, [switch]$Check)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Create .venv and install backend/requirements.txt first; see README.' }
if ($Check) { & $pythonExe --version; exit 0 }
Push-Location (Join-Path $projectRoot 'backend')
try {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Copy backend/.env.example to backend/.env and configure the database.' }
    if ($Migrate) {
        & $pythonExe -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw 'Migration failed; the API has not been started.' }
    }
    & $pythonExe -m uvicorn app.main:app --reload --host 0.0.0.0 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'The backend server exited with an error.' }
} finally { Pop-Location }
