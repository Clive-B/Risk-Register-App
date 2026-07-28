[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$NssmPath,

    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),

    [string]$ServiceName = 'NcaGrcApi'
)

$ErrorActionPreference = 'Stop'

$resolvedProject = (Resolve-Path -LiteralPath $ProjectRoot).Path
$backendRoot = Join-Path $resolvedProject 'backend'
$serverFile = Join-Path $backendRoot 'server.js'
$environmentFile = Join-Path $backendRoot '.env'
$resolvedNssm = (Resolve-Path -LiteralPath $NssmPath).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$logRoot = Join-Path $resolvedProject '.local\production-logs'

if (-not (Test-Path -LiteralPath $serverFile -PathType Leaf)) {
    throw "Backend entry point not found: $serverFile"
}
if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) {
    throw "Production environment file not found: $environmentFile"
}

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

& $resolvedNssm install $ServiceName $nodePath $serverFile
& $resolvedNssm set $ServiceName AppDirectory $backendRoot
& $resolvedNssm set $ServiceName AppEnvironmentExtra 'NODE_ENV=production'
& $resolvedNssm set $ServiceName AppStdout (Join-Path $logRoot 'api.out.log')
& $resolvedNssm set $ServiceName AppStderr (Join-Path $logRoot 'api.err.log')
& $resolvedNssm set $ServiceName AppRotateFiles 1
& $resolvedNssm set $ServiceName AppRotateBytes 10485760
& $resolvedNssm set $ServiceName Start SERVICE_AUTO_START
& $resolvedNssm set $ServiceName AppExit Default Restart

Write-Output "Service $ServiceName installed but not started."
Write-Output 'Before starting it, use Windows Services to assign the approved NCA service account and grant that account read access to backend\.env.'
Write-Output "Then run: Start-Service -Name '$ServiceName'"
