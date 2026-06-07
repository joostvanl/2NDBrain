param(
  [switch]$NoPortCleanup,
  [switch]$NoBrowser,
  [int]$ApiPort = 8787,
  [int]$UiPort = 5173,
  [string]$LanHost = "192.168.1.241",
  [string]$UiUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RootDir "markdown-viewer"

function Stop-PortListeners {
  param([int[]]$Ports)

  foreach ($Port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      $processId = $connection.OwningProcess
      if (-not $processId) {
        continue
      }

      try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        Write-Host "Stopping process on port ${Port}: $($process.ProcessName) ($processId)"
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch {
        Write-Warning "Could not stop process on port ${Port} ($processId): $($_.Exception.Message)"
      }
    }
  }
}

function Get-DotEnvValue {
  param(
    [string]$FilePath,
    [string]$Key
  )

  if (-not (Test-Path $FilePath)) {
    return $null
  }

  foreach ($line in Get-Content -Path $FilePath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }
    $envKey = $trimmed.Substring(0, $separatorIndex).Trim()
    if ($envKey -ne $Key) {
      continue
    }
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }

  return $null
}

function Read-PlainTextSecret {
  param([string]$Prompt)

  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

if (-not (Test-Path $AppDir)) {
  throw "Folder not found: $AppDir"
}

Write-Host ""
Write-Host "Starting iOMS development environment..." -ForegroundColor Cyan
Write-Host "Root: $RootDir"
Write-Host "App:  $AppDir"
Write-Host ""

if (-not $NoPortCleanup) {
  Stop-PortListeners -Ports @($ApiPort, $UiPort, 5174, 5175)
}

Set-Location $AppDir

$nodeVersion = (& node --version) 2>$null
if (-not $nodeVersion) {
  throw "Node.js was not found. Install Node.js or make sure it is available on PATH."
}

$npmVersion = (& npm --version) 2>$null
if (-not $npmVersion) {
  throw "npm was not found. Install Node.js/npm or make sure it is available on PATH."
}

if (-not (Test-Path (Join-Path $AppDir "node_modules"))) {
  Write-Host "node_modules not found; running npm install..." -ForegroundColor Yellow
  npm install
}

$env:API_PORT = "$ApiPort"
$env:UI_HOST = "0.0.0.0"
$env:UI_PORT = "$UiPort"

if (-not $env:IOMS_AUTH_USER) {
  $configuredUser = Get-DotEnvValue -FilePath (Join-Path $AppDir ".env.local") -Key "IOMS_AUTH_USER"
  if (-not $configuredUser) {
    $configuredUser = Get-DotEnvValue -FilePath (Join-Path $AppDir ".env") -Key "IOMS_AUTH_USER"
  }
  if ($configuredUser) {
    $env:IOMS_AUTH_USER = $configuredUser
  } else {
    $env:IOMS_AUTH_USER = "joost"
  }
}

if (-not $env:IOMS_AUTH_PASSWORD) {
  $configuredPassword = Get-DotEnvValue -FilePath (Join-Path $AppDir ".env.local") -Key "IOMS_AUTH_PASSWORD"
  if (-not $configuredPassword) {
    $configuredPassword = Get-DotEnvValue -FilePath (Join-Path $AppDir ".env") -Key "IOMS_AUTH_PASSWORD"
  }
  if ($configuredPassword) {
    $env:IOMS_AUTH_PASSWORD = $configuredPassword
  } else {
    Write-Host ""
    Write-Host "Kies een tijdelijk iOMS-wachtwoord voor deze sessie." -ForegroundColor Yellow
    $env:IOMS_AUTH_PASSWORD = Read-PlainTextSecret -Prompt "iOMS wachtwoord"
  }
}

if (-not $env:IOMS_AUTH_PASSWORD) {
  throw "IOMS_AUTH_PASSWORD is verplicht om iOMS op het lokale netwerk te beveiligen."
}

$LanUrl = "http://${LanHost}:${UiPort}"

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param([string]$Url)
    Start-Sleep -Seconds 5
    Start-Process $Url
  } -ArgumentList $UiUrl | Out-Null
}

Write-Host ""
Write-Host "UI local:  $UiUrl" -ForegroundColor Green
Write-Host "UI phone:  $LanUrl" -ForegroundColor Green
Write-Host "API:       http://127.0.0.1:$ApiPort (proxied via UI /api)" -ForegroundColor Green
Write-Host "Login:     user '$env:IOMS_AUTH_USER' met je iOMS-wachtwoord" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C in this window to stop iOMS."
Write-Host ""

npm run dev
