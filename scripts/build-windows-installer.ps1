[CmdletBinding()]
param(
    [ValidatePattern('^\d+\.\d+\.\d+(?:\.\d+)?$')]
    [string]$Version = '1.0.0',
    [string]$OutputDirectory = '',
    [string]$WorkDirectory = '',
    [string]$CertificateThumbprint = '',
    [ValidateSet('CurrentUser', 'LocalMachine')]
    [string]$CertificateStoreLocation = 'CurrentUser',
    [string]$TimestampServer = 'http://timestamp.digicert.com',
    [switch]$UnsignedPrototype,
    [switch]$RefreshDependencyLock,
    [switch]$SkipNpmInstall,
    [switch]$KeepStage
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $projectRoot 'build\windows'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
if ([string]::IsNullOrWhiteSpace($WorkDirectory)) {
    $localBuildRoot = if ($env:LOCALAPPDATA) {
        $env:LOCALAPPDATA
    }
    else {
        [System.IO.Path]::GetTempPath()
    }
    $WorkDirectory = Join-Path $localBuildRoot 'PoolPetiscos\installer-build'
}
$WorkDirectory = [System.IO.Path]::GetFullPath($WorkDirectory)
$cacheDirectory = Join-Path $WorkDirectory 'cache'
$stageDirectory = Join-Path $WorkDirectory 'stage'
$installerOutputDirectory = Join-Path $OutputDirectory 'installer'
$lockPath = Join-Path $projectRoot 'installer\dependencies.lock.json'
$requirementsPath = Join-Path $projectRoot 'installer\requirements-build.txt'
$issPath = Join-Path $projectRoot 'installer\PoolPetiscos.iss'

function Assert-ChildPath {
    param(
        [Parameter(Mandatory)]
        [string]$Candidate,
        [Parameter(Mandatory)]
        [string]$Parent
    )
    $candidateFull = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\', '/')
    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
    $prefix = $parentFull + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidateFull.StartsWith(
        $prefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "O caminho '$candidateFull' precisa permanecer dentro de '$parentFull'."
    }
}

function Reset-ChildDirectory {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Parent
    )
    Assert-ChildPath -Candidate $Path -Parent $Parent
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$FilePath' falhou com o código $LASTEXITCODE."
    }
}

function Get-CommandPath {
    param([Parameter(Mandatory)][string[]]$Names)
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }
    throw "Nenhum destes comandos foi encontrado: $($Names -join ', ')."
}

function Get-VerifiedDownload {
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [Parameter(Mandatory)]
        [string]$Destination,
        [Parameter(Mandatory)]
        [ValidatePattern('^[a-fA-F0-9]{64}$')]
        [string]$Sha256
    )
    if (Test-Path -LiteralPath $Destination) {
        $existingHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
        if ($existingHash -ieq $Sha256) {
            Write-Host "Usando download verificado em cache: $Destination"
            return
        }
        Remove-Item -LiteralPath $Destination -Force
    }
    Write-Host "Baixando $Uri"
    Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $Uri `
        -OutFile $Destination `
        -Headers @{ 'User-Agent' = 'Pool-Petiscos-Installer/1.0' }
    $downloadHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
    if ($downloadHash -ine $Sha256) {
        Remove-Item -LiteralPath $Destination -Force
        throw "SHA256 inválido para '$Uri'. Esperado: $Sha256; recebido: $downloadHash."
    }
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory)]
        [string]$Source,
        [Parameter(Mandatory)]
        [string]$Destination
    )
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        Copy-Item `
            -LiteralPath $item.FullName `
            -Destination $Destination `
            -Recurse `
            -Force
    }
}

function Refresh-DependencyLock {
    Write-Host 'Consultando versões oficiais mais recentes...' -ForegroundColor Cyan
    $nodeChannelUrl = 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt'
    $nodeChecksums = (Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $nodeChannelUrl `
        -Headers @{ 'User-Agent' = 'Pool-Petiscos-Installer/1.0' }).Content
    $nodeMatch = [regex]::Match(
        $nodeChecksums,
        '(?m)^([a-fA-F0-9]{64})\s+(node-v(22\.\d+\.\d+)-win-x64\.zip)$'
    )
    if (-not $nodeMatch.Success) {
        throw 'Não foi possível localizar o Node 22 x64 no índice oficial.'
    }
    $nodeHash = $nodeMatch.Groups[1].Value.ToLowerInvariant()
    $nodeArchive = $nodeMatch.Groups[2].Value
    $nodeVersion = $nodeMatch.Groups[3].Value
    $exactNodeIndex = "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt"
    $exactChecksums = (Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $exactNodeIndex `
        -Headers @{ 'User-Agent' = 'Pool-Petiscos-Installer/1.0' }).Content
    if ($exactChecksums -notmatch "(?m)^$nodeHash\s+$([regex]::Escape($nodeArchive))$") {
        throw 'O checksum do canal Node 22 mudou durante a consulta; tente novamente.'
    }

    $release = Invoke-RestMethod `
        -Uri 'https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/latest' `
        -Headers @{
            'Accept' = 'application/vnd.github+json'
            'User-Agent' = 'Pool-Petiscos-Installer/1.0'
            'X-GitHub-Api-Version' = '2022-11-28'
        }
    $ffmpegArchive = 'ffmpeg-master-latest-win64-gpl-shared.zip'
    $ffmpegAsset = @($release.assets | Where-Object { $_.name -eq $ffmpegArchive })
    if ($ffmpegAsset.Count -ne 1) {
        throw "O release mais recente não contém exatamente um '$ffmpegArchive'."
    }
    $assetDigest = [string]$ffmpegAsset[0].digest
    if ($assetDigest -notmatch '^sha256:([a-fA-F0-9]{64})$') {
        throw 'O GitHub não forneceu um digest SHA256 confiável para o FFmpeg.'
    }
    $ffmpegHash = $Matches[1].ToLowerInvariant()
    $releaseDate = ([datetime]$release.published_at).ToUniversalTime().ToString('yyyy-MM-dd')

    $newLock = [ordered]@{
        schema = 1
        node = [ordered]@{
            version = $nodeVersion
            archive = $nodeArchive
            url = "https://nodejs.org/dist/v$nodeVersion/$nodeArchive"
            sha256 = $nodeHash
        }
        ffmpeg = [ordered]@{
            repository = 'yt-dlp/FFmpeg-Builds'
            release_tag = [string]$release.tag_name
            release_date = $releaseDate
            asset_id = [long]$ffmpegAsset[0].id
            archive = $ffmpegArchive
            url = [string]$ffmpegAsset[0].browser_download_url
            sha256 = $ffmpegHash
        }
    }
    $newLock |
        ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath $lockPath -Encoding UTF8
    Write-Host "Lock atualizado em $lockPath" -ForegroundColor Green
}

function Find-InnoCompiler {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $command = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
    if ($command) {
        $candidates.Add($command.Source)
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates.Add(
            (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
        )
    }
    if ($env:ProgramFiles) {
        $candidates.Add((Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'))
    }
    if ($env:LOCALAPPDATA) {
        $candidates.Add(
            (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
        )
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    throw 'Inno Setup 6 não encontrado. Instale-o em https://jrsoftware.org/isinfo.php.'
}

function Find-SignTool {
    $command = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    $kitRoots = @()
    if (${env:ProgramFiles(x86)}) {
        $kitRoots += Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    }
    if ($env:ProgramFiles) {
        $kitRoots += Join-Path $env:ProgramFiles 'Windows Kits\10\bin'
    }
    foreach ($kitRoot in $kitRoots) {
        if (-not (Test-Path -LiteralPath $kitRoot -PathType Container)) {
            continue
        }
        $candidate = Get-ChildItem `
            -LiteralPath $kitRoot `
            -Filter 'signtool.exe' `
            -File `
            -Recurse |
            Where-Object { $_.Directory.Name -eq 'x64' } |
            Sort-Object -Property FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }
    throw 'SignTool não encontrado. Instale o Windows SDK.'
}

function Get-SigningContext {
    if ($UnsignedPrototype) {
        if (-not [string]::IsNullOrWhiteSpace($CertificateThumbprint)) {
            throw 'Não combine -UnsignedPrototype com -CertificateThumbprint.'
        }
        return $null
    }
    if ([string]::IsNullOrWhiteSpace($CertificateThumbprint)) {
        throw @'
Informe -CertificateThumbprint para um instalador assinado. Para um protótipo
deliberadamente sem assinatura, use -UnsignedPrototype.
'@
    }
    $normalizedThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    if ($normalizedThumbprint -notmatch '^[A-F0-9]{40}$') {
        throw 'O thumbprint Authenticode precisa conter 40 caracteres hexadecimais.'
    }
    $certificatePath = "Cert:\$CertificateStoreLocation\My\$normalizedThumbprint"
    $certificate = Get-Item -LiteralPath $certificatePath -ErrorAction SilentlyContinue
    if (-not $certificate) {
        throw "Certificado não encontrado em $certificatePath."
    }
    if (-not $certificate.HasPrivateKey) {
        throw 'O certificado selecionado não possui chave privada.'
    }
    if ($certificate.NotAfter -le (Get-Date)) {
        throw 'O certificado selecionado está expirado.'
    }
    [pscustomobject]@{
        Thumbprint = $normalizedThumbprint
        StoreLocation = $CertificateStoreLocation
        SignTool = Find-SignTool
    }
}

function Invoke-CodeSigning {
    param(
        [Parameter(Mandatory)]
        [pscustomobject]$Context,
        [Parameter(Mandatory)]
        [string]$FilePath
    )
    $arguments = @(
        'sign',
        '/sha1', $Context.Thumbprint,
        '/s', 'My',
        '/fd', 'SHA256',
        '/tr', $TimestampServer,
        '/td', 'SHA256'
    )
    if ($Context.StoreLocation -eq 'LocalMachine') {
        $arguments += '/sm'
    }
    $arguments += $FilePath
    Invoke-NativeCommand -FilePath $Context.SignTool -Arguments $arguments
    Invoke-NativeCommand `
        -FilePath $Context.SignTool `
        -Arguments @('verify', '/pa', '/all', $FilePath)
}

function Test-StandaloneSite {
    param(
        [Parameter(Mandatory)]
        [string]$NodePath,
        [Parameter(Mandatory)]
        [string]$SiteEntry
    )
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        0
    )
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()

    $stdoutPath = Join-Path $cacheDirectory 'standalone-smoke.stdout.log'
    $stderrPath = Join-Path $cacheDirectory 'standalone-smoke.stderr.log'
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = '"' + $SiteEntry + '"'
    $startInfo.WorkingDirectory = Split-Path -Parent $SiteEntry
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['PORT'] = [string]$port
    $startInfo.EnvironmentVariables['HOST'] = '127.0.0.1'
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Não foi possível iniciar o smoke test do site standalone.'
    }
    try {
        $deadline = (Get-Date).AddSeconds(30)
        $ready = $false
        do {
            if ($process.HasExited) {
                break
            }
            try {
                Invoke-WebRequest `
                    -UseBasicParsing `
                    -Uri "http://127.0.0.1:$port/" `
                    -TimeoutSec 2 | Out-Null
                $ready = $true
            }
            catch {
                Start-Sleep -Milliseconds 400
            }
        } until ($ready -or (Get-Date) -ge $deadline)
        if (-not $ready) {
            throw 'O site standalone não respondeu no smoke test.'
        }
    }
    finally {
        if (-not $process.HasExited) {
            $process.Kill()
            $process.WaitForExit(5000) | Out-Null
        }
        $process.StandardOutput.ReadToEnd() |
            Set-Content -LiteralPath $stdoutPath -Encoding UTF8
        $process.StandardError.ReadToEnd() |
            Set-Content -LiteralPath $stderrPath -Encoding UTF8
        $process.Dispose()
    }
}

function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        0
    )
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Test-PackagedLauncher {
    param([Parameter(Mandatory)][string]$LauncherPath)

    $sitePort = Get-FreeLoopbackPort
    do {
        $companionPort = Get-FreeLoopbackPort
    } while ($companionPort -eq $sitePort)
    $smokeDataDirectory = Join-Path $cacheDirectory 'launcher-smoke-data'
    Reset-ChildDirectory -Path $smokeDataDirectory -Parent $cacheDirectory
    $instanceSuffix = 'BuildSmoke' + [guid]::NewGuid().ToString('N')

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $LauncherPath
    $startInfo.Arguments = (
        "--no-browser --site-port $sitePort --companion-port $companionPort"
    )
    $startInfo.WorkingDirectory = Split-Path -Parent $LauncherPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.EnvironmentVariables['POOL_PETISCOS_HOME_DIR'] = $smokeDataDirectory
    $startInfo.EnvironmentVariables['POOL_PETISCOS_INSTANCE_SUFFIX'] = $instanceSuffix
    $launcherProcess = [System.Diagnostics.Process]::new()
    $launcherProcess.StartInfo = $startInfo
    if (-not $launcherProcess.Start()) {
        throw 'Não foi possível iniciar o smoke test do launcher.'
    }
    try {
        $deadline = (Get-Date).AddSeconds(60)
        $ready = $false
        do {
            if ($launcherProcess.HasExited) {
                break
            }
            try {
                $health = Invoke-RestMethod `
                    -Uri "http://127.0.0.1:$companionPort/api/health" `
                    -TimeoutSec 2
                Invoke-WebRequest `
                    -UseBasicParsing `
                    -Uri "http://127.0.0.1:$sitePort/" `
                    -TimeoutSec 2 | Out-Null
                $ready = $health.service -eq 'Pool Petiscos Companion'
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        } until ($ready -or (Get-Date) -ge $deadline)
        if (-not $ready) {
            throw 'O launcher empacotado não iniciou os dois serviços no smoke test.'
        }
    }
    finally {
        if (-not $launcherProcess.HasExited) {
            $stopInfo = [System.Diagnostics.ProcessStartInfo]::new()
            $stopInfo.FileName = $LauncherPath
            $stopInfo.Arguments = '--shutdown'
            $stopInfo.WorkingDirectory = Split-Path -Parent $LauncherPath
            $stopInfo.UseShellExecute = $false
            $stopInfo.CreateNoWindow = $true
            $stopInfo.EnvironmentVariables['POOL_PETISCOS_HOME_DIR'] = $smokeDataDirectory
            $stopInfo.EnvironmentVariables['POOL_PETISCOS_INSTANCE_SUFFIX'] = $instanceSuffix
            $stopProcess = [System.Diagnostics.Process]::Start($stopInfo)
            $stopProcess.WaitForExit(10000) | Out-Null
            $stopProcess.Dispose()
            if (-not $launcherProcess.WaitForExit(15000)) {
                $launcherProcess.Kill()
                $launcherProcess.WaitForExit(5000) | Out-Null
            }
        }
        $launcherProcess.Dispose()
    }
}

if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'O instalador é destinado ao Windows x64.'
}
$signingContext = Get-SigningContext
if ($RefreshDependencyLock) {
    Refresh-DependencyLock
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $WorkDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
Reset-ChildDirectory -Path $stageDirectory -Parent $WorkDirectory
Reset-ChildDirectory -Path $installerOutputDirectory -Parent $OutputDirectory

$dependencyLock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
if ($dependencyLock.schema -ne 1) {
    throw 'Versão desconhecida de installer/dependencies.lock.json.'
}

$npmPath = Get-CommandPath -Names @('npm.cmd', 'npm')
$pythonPath = Get-CommandPath -Names @('python.exe', 'python')
Push-Location $projectRoot
try {
    if (-not $SkipNpmInstall) {
        Invoke-NativeCommand -FilePath $npmPath -Arguments @('ci')
    }
    Invoke-NativeCommand -FilePath $npmPath -Arguments @('run', 'check')

    $standaloneCode = @'
(async () => {
  const path = (await import("node:path")).default;
  const { pathToFileURL } = await import("node:url");
  const moduleUrl = pathToFileURL(path.resolve("node_modules/vinext/dist/build/standalone.js")).href;
  const { emitStandaloneOutput } = await import(moduleUrl);
  emitStandaloneOutput({
    root: process.cwd(),
    outDir: path.resolve("dist"),
    vinextPackageRoot: path.resolve("node_modules/vinext")
  });
})().catch((error) => { console.error(error); process.exit(1); });
'@
    $env:POOL_PETISCOS_STANDALONE_CODE = $standaloneCode
    try {
        Invoke-NativeCommand `
            -FilePath (Get-CommandPath -Names @('node.exe', 'node')) `
            -Arguments @('--eval', 'eval(process.env.POOL_PETISCOS_STANDALONE_CODE)')
    }
    finally {
        Remove-Item Env:POOL_PETISCOS_STANDALONE_CODE -ErrorAction SilentlyContinue
    }
}
finally {
    Pop-Location
}

$buildVenv = Join-Path $cacheDirectory 'build-venv'
Reset-ChildDirectory -Path $buildVenv -Parent $cacheDirectory
Invoke-NativeCommand -FilePath $pythonPath -Arguments @('-m', 'venv', $buildVenv)
$buildPython = Join-Path $buildVenv 'Scripts\python.exe'
Invoke-NativeCommand `
    -FilePath $buildPython `
    -Arguments @('-m', 'pip', 'install', '--disable-pip-version-check', '--requirement', $requirementsPath)

$pyinstallerDist = Join-Path $cacheDirectory 'pyinstaller-dist'
$pyinstallerWork = Join-Path $cacheDirectory 'pyinstaller-work'
$pyinstallerSpec = Join-Path $cacheDirectory 'pyinstaller-spec'
Reset-ChildDirectory -Path $pyinstallerDist -Parent $cacheDirectory
Reset-ChildDirectory -Path $pyinstallerWork -Parent $cacheDirectory
Reset-ChildDirectory -Path $pyinstallerSpec -Parent $cacheDirectory
Invoke-NativeCommand `
    -FilePath $buildPython `
    -Arguments @(
        '-m', 'PyInstaller',
        '--noconfirm',
        '--clean',
        '--onedir',
        '--windowed',
        '--noupx',
        '--name', 'PoolPetiscos',
        '--distpath', $pyinstallerDist,
        '--workpath', $pyinstallerWork,
        '--specpath', $pyinstallerSpec,
        '--paths', $projectRoot,
        '--collect-all', 'yt_dlp',
        '--hidden-import', 'local_service.server',
        (Join-Path $projectRoot 'local_service\launcher.py')
    )

$launcherDirectory = Join-Path $pyinstallerDist 'PoolPetiscos'
$launcherExecutable = Join-Path $launcherDirectory 'PoolPetiscos.exe'
if (-not (Test-Path -LiteralPath $launcherExecutable -PathType Leaf)) {
    throw 'O PyInstaller não produziu PoolPetiscos.exe.'
}
if ($signingContext) {
    Invoke-CodeSigning -Context $signingContext -FilePath $launcherExecutable
}
Copy-DirectoryContents -Source $launcherDirectory -Destination $stageDirectory

$standaloneDirectory = Join-Path $projectRoot 'dist\standalone'
$stagedAppDirectory = Join-Path $stageDirectory 'app'
Copy-DirectoryContents -Source $standaloneDirectory -Destination $stagedAppDirectory

$nodeArchivePath = Join-Path $cacheDirectory $dependencyLock.node.archive
Get-VerifiedDownload `
    -Uri $dependencyLock.node.url `
    -Destination $nodeArchivePath `
    -Sha256 $dependencyLock.node.sha256
$nodeExtractDirectory = Join-Path $cacheDirectory 'node-extracted'
Reset-ChildDirectory -Path $nodeExtractDirectory -Parent $cacheDirectory
Expand-Archive -LiteralPath $nodeArchivePath -DestinationPath $nodeExtractDirectory
$nodeRoot = Get-ChildItem -LiteralPath $nodeExtractDirectory -Directory |
    Where-Object { $_.Name -eq [System.IO.Path]::GetFileNameWithoutExtension($dependencyLock.node.archive) }
if (@($nodeRoot).Count -ne 1) {
    throw 'Estrutura inesperada no arquivo portátil do Node.js.'
}
$stagedNodeDirectory = Join-Path $stageDirectory 'runtime\node'
Copy-DirectoryContents -Source $nodeRoot.FullName -Destination $stagedNodeDirectory

$ffmpegArchivePath = Join-Path $cacheDirectory $dependencyLock.ffmpeg.archive
Get-VerifiedDownload `
    -Uri $dependencyLock.ffmpeg.url `
    -Destination $ffmpegArchivePath `
    -Sha256 $dependencyLock.ffmpeg.sha256
$ffmpegExtractDirectory = Join-Path $cacheDirectory 'ffmpeg-extracted'
Reset-ChildDirectory -Path $ffmpegExtractDirectory -Parent $cacheDirectory
Expand-Archive -LiteralPath $ffmpegArchivePath -DestinationPath $ffmpegExtractDirectory
$ffmpegExecutables = @(Get-ChildItem `
    -LiteralPath $ffmpegExtractDirectory `
    -Filter 'ffmpeg.exe' `
    -File `
    -Recurse)
if ($ffmpegExecutables.Count -ne 1) {
    throw 'Estrutura inesperada no arquivo do FFmpeg.'
}
$ffmpegRoot = $ffmpegExecutables[0].Directory.Parent
if (-not (Test-Path -LiteralPath (Join-Path $ffmpegExecutables[0].Directory.FullName 'ffprobe.exe'))) {
    throw 'O pacote do FFmpeg não contém ffprobe.exe.'
}
$stagedFfmpegDirectory = Join-Path $stageDirectory 'runtime\ffmpeg'
Copy-DirectoryContents -Source $ffmpegRoot.FullName -Destination $stagedFfmpegDirectory

$licensesDirectory = Join-Path $stageDirectory 'licenses'
New-Item -ItemType Directory -Path $licensesDirectory -Force | Out-Null
Copy-Item `
    -LiteralPath (Join-Path $projectRoot 'installer\THIRD_PARTY_NOTICES.txt') `
    -Destination $licensesDirectory
$nodeLicense = Join-Path $stagedNodeDirectory 'LICENSE'
if (-not (Test-Path -LiteralPath $nodeLicense -PathType Leaf)) {
    throw 'A licença do Node.js não foi encontrada no pacote oficial.'
}
Copy-Item `
    -LiteralPath $nodeLicense `
    -Destination (Join-Path $licensesDirectory 'NODE-LICENSE.txt')
$ytDlpLicense = Get-ChildItem `
    -LiteralPath (Join-Path $buildVenv 'Lib\site-packages') `
    -File `
    -Recurse |
    Where-Object {
        $_.FullName -match 'yt_dlp' -and
        $_.Name -in @('LICENSE', 'UNLICENSE')
    } |
    Select-Object -First 1
if (-not $ytDlpLicense) {
    throw 'A licença do yt-dlp não foi encontrada no pacote instalado.'
}
Copy-Item `
    -LiteralPath $ytDlpLicense.FullName `
    -Destination (Join-Path $licensesDirectory 'YT-DLP-LICENSE.txt')
$ffmpegLicenseFiles = @(Get-ChildItem `
    -LiteralPath $stagedFfmpegDirectory `
    -File `
    -Recurse |
    Where-Object { $_.Name -match '^(COPYING|LICENSE)' })
if ($ffmpegLicenseFiles.Count -eq 0) {
    throw 'Nenhum texto de licença foi encontrado no pacote do FFmpeg.'
}
foreach ($licenseFile in $ffmpegLicenseFiles) {
    $relativeName = $licenseFile.FullName.Substring($stagedFfmpegDirectory.Length + 1)
    $safeName = 'FFMPEG-' + ($relativeName -replace '[\\/:*?"<>|]', '-')
    Copy-Item `
        -LiteralPath $licenseFile.FullName `
        -Destination (Join-Path $licensesDirectory $safeName)
}

$gitCommit = 'unknown'
$gitCommand = Get-Command 'git.exe' -ErrorAction SilentlyContinue
if ($gitCommand) {
    $gitCommit = (& $gitCommand.Source -C $projectRoot rev-parse HEAD).Trim()
}
$ytDlpVersion = (
    Get-Content -LiteralPath (Join-Path $projectRoot 'local_service\requirements.txt') |
    Where-Object { $_ -match '^yt-dlp==' } |
    Select-Object -First 1
) -replace '^yt-dlp==', ''
$buildManifest = [ordered]@{
    application_version = $Version
    source_commit = $gitCommit
    built_at_utc = [datetime]::UtcNow.ToString('o')
    signed = [bool]$signingContext
    node = $dependencyLock.node
    ffmpeg = $dependencyLock.ffmpeg
    yt_dlp_version = $ytDlpVersion
}
$buildManifest |
    ConvertTo-Json -Depth 6 |
    Set-Content -LiteralPath (Join-Path $stageDirectory 'BUILD-MANIFEST.json') -Encoding UTF8

Test-StandaloneSite `
    -NodePath (Join-Path $stagedNodeDirectory 'node.exe') `
    -SiteEntry (Join-Path $stagedAppDirectory 'server.js')
$stagedLauncher = Join-Path $stageDirectory 'PoolPetiscos.exe'
$selfTest = Start-Process `
    -FilePath $stagedLauncher `
    -ArgumentList '--self-test' `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
if ($selfTest.ExitCode -ne 0) {
    throw "O self-test do launcher falhou com o código $($selfTest.ExitCode)."
}
Test-PackagedLauncher -LauncherPath $stagedLauncher

$innoCompiler = Find-InnoCompiler
$innoArguments = @(
    "/DAppStage=$stageDirectory",
    "/DAppOutput=$installerOutputDirectory",
    "/DAppVersion=$Version"
)
if ($signingContext) {
    $storeFlag = ''
    if ($signingContext.StoreLocation -eq 'LocalMachine') {
        $storeFlag = ' /sm'
    }
    $innoSignCommand = (
        '"{0}" sign /sha1 {1} /s My{2} /fd SHA256 /tr "{3}" /td SHA256 $f' -f
        $signingContext.SignTool,
        $signingContext.Thumbprint,
        $storeFlag,
        $TimestampServer
    )
    $innoArguments += "/Spoolpetiscos=$innoSignCommand"
}
else {
    $innoArguments += '/DUnsignedBuild=1'
}
$innoArguments += $issPath
Invoke-NativeCommand -FilePath $innoCompiler -Arguments $innoArguments

$setupPath = Join-Path $installerOutputDirectory "PoolPetiscos-Setup-$Version.exe"
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    throw 'O Inno Setup não produziu o instalador esperado.'
}
if ($signingContext) {
    Invoke-NativeCommand `
        -FilePath $signingContext.SignTool `
        -Arguments @('verify', '/pa', '/all', $setupPath)
}
$setupHash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash

if (-not $KeepStage) {
    Reset-ChildDirectory -Path $stageDirectory -Parent $WorkDirectory
    Remove-Item -LiteralPath $stageDirectory -Force
}

Write-Host ''
Write-Host 'Instalador Windows concluído.' -ForegroundColor Green
Write-Host "Arquivo: $setupPath"
Write-Host "SHA256: $setupHash"
if (-not $signingContext) {
    Write-Warning 'BUILD DE PROTÓTIPO SEM ASSINATURA AUTHENTICODE.'
}
