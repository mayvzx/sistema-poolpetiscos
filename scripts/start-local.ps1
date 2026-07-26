[CmdletBinding()]
param(
    [int]$SitePort = 4173,
    [int]$CompanionPort = 8765,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $env:LOCALAPPDATA 'PoolPetiscos\venv\Scripts\python.exe'
$vinextCli = Join-Path $projectRoot 'node_modules\vinext\dist\cli.js'
$serverEntry = Join-Path $projectRoot 'dist\server\index.js'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'PoolPetiscos\runtime'
$siteUrl = "http://127.0.0.1:$SitePort"
$companionUrl = "http://127.0.0.1:$CompanionPort/api/health"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw 'Execute scripts\install-local.ps1 antes de iniciar.'
}
if (-not (Test-Path -LiteralPath $vinextCli)) {
    throw 'Dependências do site ausentes. Execute scripts\install-local.ps1.'
}
if (-not (Test-Path -LiteralPath $serverEntry)) {
    throw 'Build local ausente. Execute scripts\install-local.ps1.'
}

New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null

$companion = $null
$site = $null
$companionPidFile = Join-Path $runtimeDirectory 'companion.pid'
$sitePidFile = Join-Path $runtimeDirectory 'site.pid'

function Test-HttpEndpoint {
    param([string]$Uri)
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Write-ProcessMetadata {
    param(
        [string]$Path,
        [System.Diagnostics.Process]$Process
    )
    [pscustomobject]@{
        id = $Process.Id
        started_at_ticks = $Process.StartTime.ToUniversalTime().Ticks
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $Path
}

if (Test-HttpEndpoint -Uri $companionUrl) {
    throw 'O companion já está aberto. Use scripts\stop-local.ps1 antes de iniciar novamente.'
}
if (Test-HttpEndpoint -Uri $siteUrl) {
    throw "A porta $SitePort já está em uso. Encerre o serviço existente antes de continuar."
}

try {
    $companion = Start-Process `
        -FilePath $venvPython `
        -ArgumentList @('-m', 'local_service.server', '--port', $CompanionPort) `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -PassThru

    $site = Start-Process `
        -FilePath (Get-Command node).Source `
        -ArgumentList @($vinextCli, 'start', '-p', $SitePort, '-H', '127.0.0.1') `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -PassThru

    Write-ProcessMetadata -Path $companionPidFile -Process $companion
    Write-ProcessMetadata -Path $sitePidFile -Process $site

    $deadline = (Get-Date).AddSeconds(30)

    do {
        try {
            Invoke-RestMethod -Uri $companionUrl -TimeoutSec 2 | Out-Null
            $companionReady = $true
        }
        catch {
            $companionReady = $false
        }
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 2 | Out-Null
            $siteReady = $true
        }
        catch {
            $siteReady = $false
        }
        if (-not ($companionReady -and $siteReady)) {
            Start-Sleep -Milliseconds 500
        }
    } until (($companionReady -and $siteReady) -or (Get-Date) -ge $deadline)

    if (-not $companionReady) {
        throw 'O companion de músicas não iniciou corretamente.'
    }
    if (-not $siteReady) {
        throw 'O site local não iniciou corretamente.'
    }

    if (-not $NoOpen) {
        Start-Process $siteUrl
    }
    Write-Host "Pool Petiscos aberto em $siteUrl" -ForegroundColor Green
    Write-Host 'Para encerrar os serviços, use scripts\stop-local.ps1.'
}
catch {
    foreach ($startedProcess in @($site, $companion)) {
        if ($startedProcess -and -not $startedProcess.HasExited) {
            Stop-Process -Id $startedProcess.Id -ErrorAction SilentlyContinue
        }
    }
    foreach ($pidFile in @($sitePidFile, $companionPidFile)) {
        if (Test-Path -LiteralPath $pidFile) {
            Remove-Item -LiteralPath $pidFile -Force
        }
    }
    throw
}
