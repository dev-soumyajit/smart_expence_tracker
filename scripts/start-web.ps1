param([switch]$Production, [switch]$Check)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $localNode = Get-ChildItem -Path (Join-Path $projectRoot '.tools\node-*\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $localNode) { throw 'Install Node 22 LTS, or use the workspace Node runtime in .tools.' }
    $env:PATH = $localNode.Directory.FullName + ';' + $env:PATH
}
if ($Check) { node --version; exit 0 }
Push-Location (Join-Path $projectRoot 'apps\web')
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed.' }
    }
    if ($Production) {
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
        npm.cmd start
    } else {
        npm.cmd run dev
    }
    if ($LASTEXITCODE -ne 0) { throw 'Web server exited with an error.' }
} finally { Pop-Location }
