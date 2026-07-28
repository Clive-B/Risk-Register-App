$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$postgresBin = 'C:\Program Files\PostgreSQL\16\bin'
$postgresData = 'C:\tmp\nca-grc-test-pgdata'
$localState = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $localState -Force | Out-Null
$stateFile = Join-Path $localState 'test-servers.json'

try {
    $runningApi = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
    $runningFrontend = Invoke-WebRequest 'http://127.0.0.1:5500/' -UseBasicParsing -TimeoutSec 2
    if ($runningApi.success -and $runningFrontend.StatusCode -eq 200) {
        Write-Output 'NCA GRC test servers are already running.'
        Write-Output 'Backend: http://127.0.0.1:3000'
        Write-Output 'Frontend: http://127.0.0.1:5500'
        exit 0
    }
} catch {}

& (Join-Path $postgresBin 'pg_isready.exe') -h 127.0.0.1 -p 55432 -U nca_test | Out-Null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $postgresData -l 'C:\tmp\nca-grc-test-postgres.log' -o '-p 55432 -h 127.0.0.1' start
}

$backendOut = Join-Path $localState 'backend.out.log'
$backendErr = Join-Path $localState 'backend.err.log'
$frontendOut = Join-Path $localState 'frontend.out.log'
$frontendErr = Join-Path $localState 'frontend.err.log'

$backend = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $backendRoot -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath 'node' -ArgumentList 'scripts/serve-frontend.js' -WorkingDirectory $projectRoot -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru

[PSCustomObject]@{
    backendPid = $backend.Id
    frontendPid = $frontend.Id
    startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

$healthy = $false
foreach ($attempt in 1..30) {
    try {
        $api = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
        $web = Invoke-WebRequest 'http://127.0.0.1:5500/' -UseBasicParsing -TimeoutSec 2
        if ($api.success -and $web.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}

if (-not $healthy) {
    Get-Content $backendErr,$frontendErr -ErrorAction SilentlyContinue
    throw 'The test servers did not become healthy.'
}

Write-Output 'Backend: http://127.0.0.1:3000'
Write-Output 'Frontend: http://127.0.0.1:5500'
