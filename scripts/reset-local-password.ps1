$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$python = Join-Path $root ".venv\Scripts\python.exe"
$database = Join-Path $root "data\db.sqlite"

if (-not (Test-Path $python)) {
    throw "Project Python environment was not found. Run run-local.cmd once first."
}
if (-not (Test-Path $database)) {
    throw "Local user database was not found. Run run-local.cmd once first."
}

$username = Read-Host "Username [admin]"
if (-not $username) {
    $username = "admin"
}

$passwordValue = $null
$confirmValue = $null
try {
    $password = Read-Host "New password (at least 8 characters)" -AsSecureString
    $confirm = Read-Host "Confirm new password" -AsSecureString

    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $confirmPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    try {
        $passwordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
        $confirmValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPtr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPtr)
    }

    if ($passwordValue.Length -lt 8) {
        throw "Password must contain at least 8 characters."
    }
    if ($passwordValue -cne $confirmValue) {
        throw "The two passwords do not match."
    }

    $env:TGFLOWPULSE_RESET_USERNAME = $username
    $env:TGFLOWPULSE_RESET_PASSWORD = $passwordValue
    $env:TGFLOWPULSE_RESET_DATABASE = $database

    $code = "import os, sqlite3; from backend.core.security import hash_password; db = sqlite3.connect(os.environ['TGFLOWPULSE_RESET_DATABASE']); cur = db.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hash_password(os.environ['TGFLOWPULSE_RESET_PASSWORD']), os.environ['TGFLOWPULSE_RESET_USERNAME'])); db.commit(); db.close(); raise SystemExit(0 if cur.rowcount == 1 else 2)"

    Push-Location $root
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $python -c $code
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
    } finally {
        Pop-Location
    }

    if ($exitCode -eq 2) {
        throw "User '$username' was not found."
    }
    if ($exitCode -ne 0) {
        throw "Password update failed with code $exitCode."
    }

    Write-Host "Password reset completed. Login username: $username" -ForegroundColor Green
} finally {
    Remove-Item Env:TGFLOWPULSE_RESET_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:TGFLOWPULSE_RESET_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:TGFLOWPULSE_RESET_DATABASE -ErrorAction SilentlyContinue
    $passwordValue = $null
    $confirmValue = $null
}
