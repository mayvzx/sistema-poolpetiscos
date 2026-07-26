[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localAppDirectory = Join-Path $env:LOCALAPPDATA 'PoolPetiscos'
$venvDirectory = Join-Path $localAppDirectory 'venv'
$venvPython = Join-Path $venvDirectory 'Scripts\python.exe'
$requirements = Join-Path $projectRoot 'local_service\requirements.txt'

Write-Host 'Preparando o Pool Petiscos para uso local...' -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 22 ou superior não foi encontrado.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm não foi encontrado.'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3.10 ou superior não foi encontrado.'
}

$nodeVersion = node -p "process.versions.node"
if ([version]$nodeVersion -lt [version]'22.13.0') {
    throw "Node.js 22.13 ou superior é necessário. Versão encontrada: $nodeVersion"
}

$pythonVersion = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$pythonParts = $pythonVersion.Split('.')
if ([int]$pythonParts[0] -lt 3 -or ([int]$pythonParts[0] -eq 3 -and [int]$pythonParts[1] -lt 10)) {
    throw "Python 3.10 ou superior é necessário. Versão encontrada: $pythonVersion"
}

Push-Location $projectRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci falhou com o código $LASTEXITCODE."
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "O build falhou com o código $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath $venvPython)) {
        New-Item -ItemType Directory -Force -Path $localAppDirectory | Out-Null
        python -m venv $venvDirectory
        if ($LASTEXITCODE -ne 0) {
            throw "A criação do ambiente Python falhou com o código $LASTEXITCODE."
        }
    }
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "A atualização do pip falhou com o código $LASTEXITCODE."
    }
    & $venvPython -m pip install --requirement $requirements
    if ($LASTEXITCODE -ne 0) {
        throw "A instalação do yt-dlp falhou com o código $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Warning @'
FFmpeg ainda não está disponível. Ele é necessário para converter as faixas
para MP3. Instale uma distribuição oficial/recomendada pelo yt-dlp, adicione-a
ao PATH do Windows e execute este instalador novamente.
'@
}
else {
    Write-Host 'FFmpeg encontrado.' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Instalação local concluída.' -ForegroundColor Green
Write-Host 'Use scripts\start-local.ps1 para abrir o caixa.'
