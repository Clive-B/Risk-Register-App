$projectRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $projectRoot '.local\test-servers.json'
$postgresBin = 'C:\Program Files\PostgreSQL\16\bin'
$postgresData = 'C:\tmp\nca-grc-test-pgdata'

if (Test-Path $stateFile) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    foreach ($processId in @($state.backendPid, $state.frontendPid)) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node') {
            Stop-Process -Id $processId
        }
    }
    Remove-Item -LiteralPath $stateFile -Force
}

& (Join-Path $postgresBin 'pg_ctl.exe') -D $postgresData stop
Write-Output 'NCA GRC test servers stopped.'
