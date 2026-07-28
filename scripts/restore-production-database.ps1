[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupFile,

    [Parameter(Mandatory)]
    [string]$TargetDatabase,

    [Parameter(Mandatory)]
    [string]$Confirmation,

    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin'
)

$ErrorActionPreference = 'Stop'

if ($Confirmation -ne "RESTORE $TargetDatabase") {
    throw "Confirmation must exactly equal: RESTORE $TargetDatabase"
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$checksumFile = "$resolvedBackup.sha256"
if (-not (Test-Path -LiteralPath $checksumFile -PathType Leaf)) {
    throw "Checksum file not found: $checksumFile"
}

$expected = (Get-Content -LiteralPath $checksumFile -Raw).Trim()
$actual = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash
if ($expected -ne $actual) {
    throw 'Backup checksum validation failed. Restore was not attempted.'
}

$required = 'DB_HOST','DB_PORT','DB_USER','DB_PASSWORD'
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        throw "$name must be supplied as a protected environment variable."
    }
}

$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
if (-not (Test-Path -LiteralPath $pgRestore -PathType Leaf)) {
    throw "pg_restore.exe was not found at $pgRestore"
}

$env:PGPASSWORD = [Environment]::GetEnvironmentVariable('DB_PASSWORD')
try {
    & $pgRestore `
        --host ([Environment]::GetEnvironmentVariable('DB_HOST')) `
        --port ([Environment]::GetEnvironmentVariable('DB_PORT')) `
        --username ([Environment]::GetEnvironmentVariable('DB_USER')) `
        --dbname $TargetDatabase `
        --clean `
        --if-exists `
        --no-owner `
        --no-privileges `
        --exit-on-error `
        $resolvedBackup
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output "Restore completed for database $TargetDatabase."
