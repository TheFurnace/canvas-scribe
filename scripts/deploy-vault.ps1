param(
  [Parameter(Mandatory = $true)]
  [string]$VaultPath,
  [switch]$Watch,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$resolvedVault = (Resolve-Path -LiteralPath $VaultPath).Path
$obsidianDirectory = Join-Path $resolvedVault ".obsidian"
if (-not (Test-Path -LiteralPath $obsidianDirectory -PathType Container)) {
  throw "The selected folder is not an Obsidian vault: $resolvedVault"
}

$pluginDirectory = Join-Path $obsidianDirectory "plugins\canvas-scribe"
$pnpmCommand = Get-Command pnpm -ErrorAction Stop
$env:CANVAS_SCRIBE_DEPLOY_DIR = $pluginDirectory
$env:CANVAS_SCRIBE_BUILD_ID = "local-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

if (-not $SkipTests) {
  & $pnpmCommand.Source run test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Watch) {
  Write-Host "Watching source files and deploying successful builds to $pluginDirectory"
  Write-Host "After a rebuild, reload Canvas Scribe in Obsidian to load the new JavaScript."
  & $pnpmCommand.Source run dev
} else {
  & $pnpmCommand.Source run build
}

exit $LASTEXITCODE
