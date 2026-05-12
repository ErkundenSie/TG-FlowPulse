param(
    [object]$BackendPort = 8000,
    [object]$FrontendPort = 3000,
    [string]$Python = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Resolve-Port {
    param(
        [object]$Value,
        [int]$Default,
        [string]$Name
    )

    if ($null -eq $Value) {
        return $Default
    }

    $raw = "$Value".Trim()
    if (-not $raw) {
        return $Default
    }

    $port = 0
    if (-not [int]::TryParse($raw, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        Write-Warning "$Name '$raw' 无效，使用默认端口 $Default。"
        return $Default
    }

    return $port
}

$BackendPort = Resolve-Port -Value $BackendPort -Default 8000 -Name "BackendPort"
$FrontendPort = Resolve-Port -Value $FrontendPort -Default 3000 -Name "FrontendPort"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDir = Join-Path $root "frontend"
$dataDir = Join-Path $root "data"

if (-not $Python) {
    $repoVenvPython = Join-Path $root ".venv\Scripts\python.exe"
    $workspaceVenvPython = Join-Path (Split-Path $root -Parent) ".venv\Scripts\python.exe"
    if (Test-Path $repoVenvPython) {
        $Python = $repoVenvPython
    } elseif (Test-Path $workspaceVenvPython) {
        $Python = $workspaceVenvPython
    } else {
        $Python = "python"
    }
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$env:APP_HOST = "127.0.0.1"
$env:APP_PORT = "$BackendPort"
$env:PORT = "$BackendPort"
$env:APP_DATA_DIR = $dataDir
$env:APP_CORS_ORIGINS = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"
$env:BACKEND_PORT = "$BackendPort"

if (-not $env:ADMIN_PASSWORD) {
    $env:ADMIN_PASSWORD = "admin123"
}

if (-not $SkipInstall) {
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Host "Installing frontend dependencies..."
        Push-Location $frontendDir
        try {
            npm ci
        } finally {
            Pop-Location
        }
    }
}

Write-Host "Starting backend: http://127.0.0.1:$BackendPort"
$backend = Start-Process -FilePath $Python -ArgumentList @(
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "$BackendPort",
    "--reload"
) -WorkingDirectory $root -PassThru

try {
    Write-Host "Starting frontend: http://localhost:$FrontendPort"
    Write-Host "Login: admin / $env:ADMIN_PASSWORD"
    Write-Host "Press Ctrl+C to stop."
    Push-Location $frontendDir
    npm run dev -- --hostname 127.0.0.1 --port $FrontendPort
} finally {
    Pop-Location
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
    }
}
