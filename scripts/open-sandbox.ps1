param(
  [ValidatePattern("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")]
  [string]$Name = $(if ($env:CANVAS_SCRIBE_SANDBOX_ID) { $env:CANVAS_SCRIBE_SANDBOX_ID } else { "default" }),
  [ValidateRange(0, 65535)]
  [int]$Port = 0,
  [string]$ObsidianPath,
  [switch]$Reset,
  [switch]$NoBuild,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$generatedRoot = Join-Path $repositoryRoot ".canvas-scribe-sandbox"
$vaultPath = Join-Path $generatedRoot "vaults\$Name"
$profilePath = Join-Path $generatedRoot "profiles\$Name"
$artifactPath = Join-Path $generatedRoot "artifacts\$Name"
$pnpmCommand = Get-Command pnpm -ErrorAction Stop

Push-Location $repositoryRoot
try {
  if (-not $NoBuild) {
    & $pnpmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  $prepareArguments = @("exec", "node", "scripts/sandbox-vault.mjs", "prepare", "--name", $Name)
  if ($Reset) { $prepareArguments += "--reset" }
  & $pnpmCommand.Source @prepareArguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $profilePath, $artifactPath | Out-Null
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $vaultBytes = [Text.Encoding]::UTF8.GetBytes($vaultPath.ToLowerInvariant())
  $vaultHash = ([BitConverter]::ToString($sha256.ComputeHash($vaultBytes))).Replace("-", "").ToLowerInvariant()
  $portBytes = [Text.Encoding]::UTF8.GetBytes("$repositoryRoot|$Name")
  $portHash = $sha256.ComputeHash($portBytes)
} finally {
  $sha256.Dispose()
}

if ($Port -eq 0) {
  $Port = 9300 + ([BitConverter]::ToUInt16($portHash, 0) % 500)
}

$obsidianConfig = @{
  vaults = @{
    ($vaultHash.Substring(0, 16)) = @{
      path = $vaultPath
      ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      open = $true
    }
  }
}
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
$obsidianConfigJson = $obsidianConfig | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $profilePath "obsidian.json"), $obsidianConfigJson, $utf8WithoutBom)

if ($NoLaunch) {
  Write-Host "Sandbox prepared without launching Obsidian."
  Write-Host "Vault: $vaultPath"
  Write-Host "Profile: $profilePath"
  exit 0
}

$candidatePaths = @(
  $ObsidianPath,
  $env:CANVAS_SCRIBE_OBSIDIAN_EXE,
  $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Obsidian\Obsidian.exe" }),
  $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Obsidian\Obsidian.exe" })
) | Where-Object { $_ }
$resolvedObsidian = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $resolvedObsidian) {
  $obsidianCommand = Get-Command Obsidian.exe -ErrorAction SilentlyContinue
  if ($obsidianCommand) { $resolvedObsidian = $obsidianCommand.Source }
}
if (-not $resolvedObsidian) {
  throw "Obsidian.exe was not found. Pass -ObsidianPath or set CANVAS_SCRIBE_OBSIDIAN_EXE."
}

$arguments = @(
  "`"--user-data-dir=$profilePath`"",
  "--remote-debugging-port=$Port",
  "--remote-debugging-address=127.0.0.1",
  "`"obsidian://open?path=$([Uri]::EscapeDataString((Join-Path $vaultPath 'Canvas Scribe Smoke Test.canvas')))`""
)
$process = Start-Process -FilePath $resolvedObsidian -ArgumentList $arguments -PassThru
$connection = @{
  schemaVersion = 1
  name = $Name
  pid = $process.Id
  port = $Port
  debugUrl = "http://127.0.0.1:$Port"
  vaultPath = $vaultPath
  profilePath = $profilePath
  artifactPath = $artifactPath
  startedAt = [DateTimeOffset]::UtcNow.ToString("o")
}
$connectionJson = $connection | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $artifactPath "connection.json"), $connectionJson, $utf8WithoutBom)

Write-Host "Canvas Scribe sandbox is starting in an isolated Obsidian profile."
Write-Host "Vault: $vaultPath"
Write-Host "Agent debugging endpoint: http://127.0.0.1:$Port"
Write-Host "Connection record: $(Join-Path $artifactPath 'connection.json')"
