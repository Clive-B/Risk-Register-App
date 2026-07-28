[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$BackupDirectory,

    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin',

    [int]$RetentionDays = 30
)

$ErrorActionPreference = 'Stop'

$required = 'DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        throw "$name must be supplied to the backup task as a protected environment variable."
    }
}

$target = [System.IO.Path]::GetFullPath($BackupDirectory)
if ([System.IO.Path]::GetPathRoot($target) -eq $target) {
    throw 'BackupDirectory must be a dedicated folder, not a drive root.'
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$databaseName = [Environment]::GetEnvironmentVariable('DB_NAME')
$backupFile = Join-Path $target "$databaseName-$timestamp.dump"
$checksumFile = "$backupFile.sha256"
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'

if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) {
    throw "pg_dump.exe was not found at $pgDump"
}

$env:PGPASSWORD = [Environment]::GetEnvironmentVariable('DB_PASSWORD')
try {
    & $pgDump `
        --host ([Environment]::GetEnvironmentVariable('DB_HOST')) `
        --port ([Environment]::GetEnvironmentVariable('DB_PORT')) `
        --username ([Environment]::GetEnvironmentVariable('DB_USER')) `
        --dbname $databaseName `
        --format custom `
        --compress 9 `
        --no-password `
        --file $backupFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

(Get-FileHash -LiteralPath $backupFile -Algorithm SHA256).Hash | Set-Content -LiteralPath $checksumFile -Encoding ASCII

$cutoff = (Get-Date).AddDays(-[Math]::Abs($RetentionDays))
Get-ChildItem -LiteralPath $target -File |
    Where-Object { $_.LastWriteTime -lt $cutoff -and ($_.Extension -eq '.dump' -or $_.Name.EndsWith('.dump.sha256')) } |
    Remove-Item -Force

Write-Output "Backup completed: $backupFile"
Write-Output "Checksum: $checksumFile"
