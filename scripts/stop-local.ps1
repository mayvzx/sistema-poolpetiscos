[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'PoolPetiscos\runtime'
$pidFiles = @(
    Join-Path $runtimeDirectory 'site.pid'
    Join-Path $runtimeDirectory 'companion.pid'
)

foreach ($pidFile in $pidFiles) {
    if (-not (Test-Path -LiteralPath $pidFile)) {
        continue
    }
    try {
        $metadata = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
        $serviceProcessId = [int]$metadata.id
        $expectedStartTicks = [long]$metadata.started_at_ticks
        $process = Get-Process -Id $serviceProcessId -ErrorAction SilentlyContinue
        $isExpectedProcess = $process `
            -and $process.Name -in @('node', 'python', 'pythonw') `
            -and $process.StartTime.ToUniversalTime().Ticks -eq $expectedStartTicks
        if ($isExpectedProcess) {
            Stop-Process -Id $serviceProcessId
        }
        elseif ($process) {
            Write-Warning "O PID $serviceProcessId foi reutilizado; o processo atual não foi encerrado."
        }
    }
    catch {
        Write-Warning "Metadados inválidos em $pidFile; nenhum processo foi encerrado por este arquivo."
    }
    finally {
        Remove-Item -LiteralPath $pidFile -Force
    }
}

Write-Host 'Serviços locais da Pool encerrados.' -ForegroundColor Green
