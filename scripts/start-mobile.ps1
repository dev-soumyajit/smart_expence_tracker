param([switch]$Preview, [switch]$Android, [switch]$BuildAndroid, [switch]$Check, [ValidateRange(1024,65535)][int]$Port = 8091)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $localNode = Get-ChildItem -Path (Join-Path $projectRoot '.tools\node-*\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $localNode) { throw 'Install Node 22 LTS, or use the workspace Node runtime in .tools.' }
    $env:PATH = $localNode.Directory.FullName + ';' + $env:PATH
}
if ($Check) { node --version; exit 0 }
Push-Location (Join-Path $projectRoot 'apps\mobile')
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Mobile dependency installation failed.' }
    }
    if ($Preview) {
        Write-Host ('Read-only design gallery: http://localhost:' + $Port + '/design-preview')
        npx.cmd expo start --web --port $Port
    } elseif ($BuildAndroid) {
        if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath 'C:\Program Files\Android\Android Studio\jbr')) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
        if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath "$env:LOCALAPPDATA\Android\Sdk")) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
        npx.cmd expo run:android
    } elseif ($Android) {
        npx.cmd expo start --android
    } else {
        npx.cmd expo start
    }
    if ($LASTEXITCODE -ne 0) { throw 'The Expo server exited with an error.' }
} finally { Pop-Location }
