$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
try {
    $existing = Invoke-RestMethod -Uri 'http://127.0.0.1:7860/api/config' -TimeoutSec 2 -ErrorAction Stop
} catch {
    $existing = $null
}
if ($existing -and $existing.model_version -and $existing.demo_mode) {
    Write-Host 'MPLADS Insight is already running at http://127.0.0.1:7860'
    return
}
$env:DEMO_MODE = "true"
$env:SECURE_COOKIES = "false"
$env:DATA_DIR = Join-Path $PSScriptRoot "data"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    $shared = Join-Path (Split-Path -Parent $PSScriptRoot) ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $shared) {
        $python = $shared
    } else {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or later is required." }
    }
}
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
if (-not (Test-Path -LiteralPath "node_modules")) {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "Node dependency installation failed." }
}
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "React build failed." }
Write-Host "MPLADS Insight: http://127.0.0.1:7860"
& $python -m uvicorn backend.main:app --host 127.0.0.1 --port 7860

