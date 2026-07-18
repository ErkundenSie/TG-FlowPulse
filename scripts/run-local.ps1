param(
    [object]$BackendPort = 8000,
    [object]$FrontendPort = 3000,
    [string]$Python = "",
    [switch]$SkipInstall,
    [switch]$NoBrowser,
    [switch]$DevFrontend
)

$ErrorActionPreference = "Stop"
$ControlCExitCode = -1073741510 # 0xC000013A: CTRL+C / terminal closed

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
        Write-Warning "$Name '$raw' is invalid; using default port $Default."
        return $Default
    }

    return $port
}

function Test-PortAvailable {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Get-PortProcessIds {
    param([int]$Port)

    $processIds = @()
    $getConnection = Get-Command "Get-NetTCPConnection" -ErrorAction SilentlyContinue
    if ($getConnection) {
        $processIds += Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess
    } else {
        $netstatLines = & netstat.exe -ano -p tcp 2>$null
        foreach ($line in $netstatLines) {
            if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
                $processIds += [int]$Matches[1]
            }
        }
    }

    return @($processIds | Where-Object { $_ -and $_ -ne $PID } | Select-Object -Unique)
}

function Stop-PortProcesses {
    param(
        [int]$Port,
        [string]$Name
    )

    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        $processIds = @(Get-PortProcessIds -Port $Port)
        if ($processIds.Count -eq 0) {
            return
        }

        foreach ($processId in $processIds) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            $processName = if ($process) { $process.ProcessName } else { "unknown" }
            Write-Host "Stopping previous $Name process on port $Port (PID $processId, $processName)..."
            $taskkill = Start-Process -FilePath "taskkill.exe" -ArgumentList @(
                "/PID",
                "$processId",
                "/T",
                "/F"
            ) -Wait -NoNewWindow -PassThru
            if ($taskkill.ExitCode -ne 0 -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
                throw "Unable to stop PID $processId on port $Port."
            }
        }

        [System.Threading.Thread]::Sleep(500)
    }

    if (-not (Test-PortAvailable $Port)) {
        throw "$Name port $Port is still in use after cleanup."
    }
}

function Stop-ProjectFrontendProcesses {
    param([string]$ProjectFrontendDir)

    $normalizedDir = $ProjectFrontendDir.TrimEnd("\")
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $_.CommandLine -and
            $_.CommandLine.IndexOf($normalizedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            ($_.CommandLine -match "(?i)(next|\\.next)")
        }

    foreach ($process in $processes) {
        Write-Host "Stopping previous project frontend process (PID $($process.ProcessId))..."
        Start-Process -FilePath "taskkill.exe" -ArgumentList @(
            "/PID",
            "$($process.ProcessId)",
            "/T",
            "/F"
        ) -Wait -NoNewWindow | Out-Null
    }
}

$BackendPort = Resolve-Port -Value $BackendPort -Default 8000 -Name "BackendPort"
$FrontendPort = Resolve-Port -Value $FrontendPort -Default 3000 -Name "FrontendPort"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDir = Join-Path $root "frontend"

Stop-ProjectFrontendProcesses -ProjectFrontendDir $frontendDir
if ($DevFrontend) {
    Stop-PortProcesses -Port $FrontendPort -Name "frontend"
}
Stop-PortProcesses -Port $BackendPort -Name "backend"

$dataDir = Join-Path $root "data"
$repoVenvDir = Join-Path $root ".venv"
$repoVenvPython = Join-Path $repoVenvDir "Scripts\python.exe"

function Test-CompatiblePython {
    param([string]$Executable)

    $resolvedExecutable = $null
    if (Test-Path $Executable) {
        $resolvedExecutable = (Resolve-Path $Executable).Path
    } else {
        $command = Get-Command $Executable -ErrorAction SilentlyContinue
        if ($command) {
            $resolvedExecutable = $command.Source
        }
    }

    if (-not $resolvedExecutable -or $resolvedExecutable -like "*\Microsoft\WindowsApps\*") {
        return $false
    }

    & $resolvedExecutable -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)" 2>$null
    return $LASTEXITCODE -eq 0
}

function New-RepoVirtualEnvironment {
    $launcher = Get-Command "py.exe" -ErrorAction SilentlyContinue
    if ($launcher -and $launcher.Source -notlike "*\Microsoft\WindowsApps\*") {
        foreach ($version in @("3.13", "3.12", "3.11", "3.10")) {
            & $launcher.Source "-$version" -c "import sys" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Creating Python $version virtual environment..."
                & $launcher.Source "-$version" -m venv $repoVenvDir
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to create the Python virtual environment."
                }
                return
            }
        }
    }

    $pythonCandidates = @()
    $workspaceVenvPython = Join-Path (Split-Path $root -Parent) ".venv\Scripts\python.exe"
    if (Test-Path $workspaceVenvPython) {
        $pythonCandidates += $workspaceVenvPython
    }
    $localPythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
    if (Test-Path $localPythonRoot) {
        $pythonCandidates += Get-ChildItem -Path $localPythonRoot -Filter "python.exe" -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName
    }
    $pathPython = Get-Command "python.exe" -ErrorAction SilentlyContinue
    if ($pathPython -and $pathPython.Source -notlike "*\Microsoft\WindowsApps\*") {
        $pythonCandidates += $pathPython.Source
    }

    foreach ($candidate in ($pythonCandidates | Select-Object -Unique)) {
        if (Test-CompatiblePython $candidate) {
            Write-Host "Creating project Python virtual environment..."
            & $candidate -m venv $repoVenvDir
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to create the Python virtual environment."
            }
            return
        }
    }

    if (-not $SkipInstall) {
        $winget = Get-Command "winget.exe" -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host "Python 3.10-3.13 was not found. Installing Python 3.13 for the current user..."
            & $winget.Source install --id Python.Python.3.13 --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -eq 0) {
                $installedPython = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"
                if (Test-CompatiblePython $installedPython) {
                    Write-Host "Creating Python 3.13 project virtual environment..."
                    & $installedPython -m venv $repoVenvDir
                    if ($LASTEXITCODE -ne 0) {
                        throw "Failed to create the Python virtual environment."
                    }
                    return
                }
            }
            throw "Python 3.13 installation failed. Install Python 3.13 (64-bit) manually and run again."
        }
    }

    throw "Python 3.10-3.13 was not found. Install Python 3.13 (64-bit) and run this script again."
}

if ($Python) {
    if (-not (Test-CompatiblePython $Python)) {
        throw "The selected Python is incompatible. TG-FlowPulse requires Python 3.10-3.13."
    }
} else {
    if (-not (Test-CompatiblePython $repoVenvPython)) {
        if (Test-Path $repoVenvDir) {
            throw "The project .venv is incompatible or damaged. Remove '$repoVenvDir' and run again."
        }
        New-RepoVirtualEnvironment
    }
    $Python = $repoVenvPython
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
$env:APP_WEB_DIR = Join-Path $frontendDir "out"
$env:NEXT_TELEMETRY_DISABLED = "1"
if (-not $env:NODE_OPTIONS) {
    $env:NODE_OPTIONS = "--max-old-space-size=2048"
} elseif ($env:NODE_OPTIONS -notmatch "max-old-space-size") {
    $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) --max-old-space-size=2048"
}

$initialPasswordFile = Join-Path $dataDir "initial_admin_password.txt"
$databaseFile = Join-Path $dataDir "db.sqlite"

$previousErrorActionPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = "SilentlyContinue"
    & $Python -c "import importlib.util; required = ('fastapi', 'uvicorn', 'sqlalchemy', 'pyrogram'); raise SystemExit(0 if all(importlib.util.find_spec(name) for name in required) else 1)" 1>$null 2>$null
    $backendDependenciesReady = $LASTEXITCODE -eq 0
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
if (-not $backendDependenciesReady) {
    if ($SkipInstall) {
        throw "Backend dependencies are missing. Run without -SkipInstall first."
    }
    Write-Host "Installing backend dependencies..."
    try {
        $ErrorActionPreference = "Continue"
        & $Python -m pip install --disable-pip-version-check -e $root
        $pipExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($pipExitCode -ne 0) {
        throw "Backend dependency installation failed."
    }
}

$npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "Node.js/npm was not found. Install the current Node.js LTS release and run again."
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    if ($SkipInstall) {
        throw "Frontend dependencies are missing. Run without -SkipInstall first."
    }
    Write-Host "Installing frontend dependencies..."
    Push-Location $frontendDir
    try {
        $ErrorActionPreference = "Continue"
        & $npm.Source ci
        $npmInstallExitCode = $LASTEXITCODE
        if ($npmInstallExitCode -ne 0) {
            throw "Frontend dependency installation failed."
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }
}

Write-Host "Starting backend: http://127.0.0.1:$BackendPort"
$backendArguments = @(
    "-m",
    "uvicorn",
    "backend.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "$BackendPort"
)
if ($DevFrontend) {
    $backendArguments += "--reload"
}
$backend = Start-Process -FilePath $Python -ArgumentList $backendArguments -WorkingDirectory $root -PassThru

try {
    $backendReady = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($backend.HasExited) {
            if ($backend.ExitCode -eq $ControlCExitCode) {
                Write-Host "Backend stopped by console interrupt."
                return
            }
            throw "Backend exited during startup with code $($backend.ExitCode)."
        }
        try {
            $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 1
            if ($health.StatusCode -eq 200) {
                $backendReady = $true
                break
            }
        } catch {
            [System.Threading.Thread]::Sleep(500)
        }
    }
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    $appUrl = "http://127.0.0.1:$BackendPort"
    if ($DevFrontend) {
        $appUrl = "http://127.0.0.1:$FrontendPort"
        Write-Host "Starting development frontend: $appUrl"
    } else {
        Write-Host "Serving static frontend: $appUrl"
    }
    if ($env:ADMIN_PASSWORD) {
        if (Test-Path $databaseFile) {
            Write-Host "ADMIN_PASSWORD only applies when creating the first user."
            Write-Host "An existing local database was found; use its current credentials."
        } else {
            Write-Host "Login username: admin"
            Write-Host "Login password: $env:ADMIN_PASSWORD"
        }
    } elseif (Test-Path $initialPasswordFile) {
        Write-Host "Login username: admin"
        Write-Host "Initial password file: $initialPasswordFile"
    } elseif (Test-Path $databaseFile) {
        Write-Host "Existing local user database detected. Username is usually: admin"
        Write-Host "If the password is unknown, run: reset-local-password.cmd"
    } else {
        Write-Host "Initial admin password will be generated at: $initialPasswordFile"
    }
    Write-Host "Press Ctrl+C to stop."

    if (-not $NoBrowser) {
        $browserCommand = "timeout /t 1 /nobreak >nul & start `"`" `"$appUrl`""
        Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $browserCommand) -WindowStyle Hidden | Out-Null
    }

    if (-not $DevFrontend) {
        Write-Host "Static mode is active. Run with -DevFrontend only when editing the frontend."
        while ($true) {
            if ($backend.HasExited) {
                if ($backend.ExitCode -eq $ControlCExitCode) {
                    Write-Host "Backend stopped."
                    return
                }
                throw "Backend exited with code $($backend.ExitCode)."
            }
            [System.Threading.Thread]::Sleep(1000)
        }
    }

    Push-Location $frontendDir
    try {
        $ErrorActionPreference = "Continue"
        & $npm.Source run dev -- --hostname 127.0.0.1 --port $FrontendPort
        $frontendExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($frontendExitCode -ne 0) {
        throw "Frontend exited with code $frontendExitCode."
    }
} finally {
    if ((Get-Location).Path -eq $frontendDir) {
        Pop-Location
    }
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
    }
}
