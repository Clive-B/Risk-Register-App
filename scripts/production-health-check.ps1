[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$ApplicationUrl,

    [uri]$ApiUrl
)

$ErrorActionPreference = 'Stop'
$base = $ApplicationUrl.AbsoluteUri.TrimEnd('/')
$apiBase = if ($ApiUrl) { $ApiUrl.AbsoluteUri.TrimEnd('/') } else { $base }

$web = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 15
$api = Invoke-RestMethod "$apiBase/api/health" -TimeoutSec 15

if ($web.StatusCode -ne 200) { throw "Frontend returned HTTP $($web.StatusCode)." }
if (-not $api.success -or $api.status -ne 'healthy') { throw 'API health check failed.' }

try {
    Invoke-WebRequest "$apiBase/api/risks" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop | Out-Null
    throw 'Protected endpoint unexpectedly allowed an unauthenticated request.'
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
}

Write-Output "NCA GRC is healthy at $base"
Write-Output 'Frontend: HTTP 200'
Write-Output 'Database/API: healthy'
Write-Output 'Unauthenticated access control: HTTP 401'
