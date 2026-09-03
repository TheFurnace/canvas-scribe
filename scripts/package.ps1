param([switch]$SkipTests)

$ErrorActionPreference = "Stop"
$pnpmCommand = Get-Command pnpm -ErrorAction Stop
$manifest = Get-Content -LiteralPath "manifest.json" -Raw | ConvertFrom-Json
$env:CANVAS_SCRIBE_BUILD_ID = "release-$($manifest.version)-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

& $pnpmCommand.Source run check:versions
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $pnpmCommand.Source run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not $SkipTests) {
  & $pnpmCommand.Source run test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$distributionDirectory = Join-Path (Get-Location) "dist"
New-Item -ItemType Directory -Path $distributionDirectory -Force | Out-Null
$archivePath = Join-Path $distributionDirectory "canvas-scribe-$($manifest.version).zip"
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
Compress-Archive -LiteralPath "main.js", "manifest.json", "styles.css" -DestinationPath $archivePath
Write-Host "Created $archivePath"
