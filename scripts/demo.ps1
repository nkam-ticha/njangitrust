# One command to run NjangiTrust on this PC for the browser, iPhone and Android (D1, D2, D21).
#   pnpm demo                                  start (API 3000, Expo 8081), one window each
#   pnpm demo -ApiPort 3100 -WebPort 8091      other ports
#   pnpm demo:stop                             stop what pnpm demo started (Redis and PostgreSQL keep running)
# Options: -LanIp 192.168.1.20 (if the detected address is wrong), -ClearCache (Expo cache),
#          -Background (no windows; logs in %LOCALAPPDATA%\NjangiTrust\demo).
# Starts only what is missing, never resets the database, never stops processes it did not start.
param(
  [ValidateSet('start', 'stop')][string]$Action = 'start',
  [ValidateRange(1, 65535)][int]$ApiPort = 3000,
  [ValidateRange(1, 65535)][int]$WebPort = 8081,
  [string]$LanIp = '',
  [switch]$ClearCache,
  [switch]$Background
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root 'apps\api'
$mobileDir = Join-Path $root 'apps\mobile'
$stateDir = Join-Path $env:LOCALAPPDATA 'NjangiTrust\demo'
$stateFile = Join-Path $stateDir "demo-$ApiPort-$WebPort.json"
$firewallRule = 'NjangiTrust dev'

function Fail([string]$message) {
  Write-Host ''
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}
function Step([string]$message) { Write-Host "-> $message" -ForegroundColor Cyan }

# A process we started, still alive with the same start time (PIDs get reused).
function Get-OwnProcess($entry) {
  if (-not $entry) { return $null }
  $p = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
  if ($p -and $p.StartTime.ToUniversalTime().Ticks -eq [long]$entry.started) { return $p }
  return $null
}

function Stop-Demo([string]$file) {
  $state = Get-Content $file -Raw | ConvertFrom-Json
  foreach ($name in 'api', 'expo') {
    $entry = $state.$name
    if (Get-OwnProcess $entry) {
      & taskkill.exe /PID $entry.pid /T /F 2>&1 | Out-Null
      Write-Host "Stopped $name (port $($entry.port))."
    }
  }
  Remove-Item $file -Force
}

if ($Action -eq 'stop') {
  if (-not (Test-Path $stateDir)) { Write-Host 'Nothing to stop.'; exit 0 }
  $explicit = $PSBoundParameters.ContainsKey('ApiPort') -or $PSBoundParameters.ContainsKey('WebPort')
  $files = if ($explicit) { @(Get-Item $stateFile -ErrorAction SilentlyContinue) }
           else { @(Get-ChildItem $stateDir -Filter 'demo-*.json') }
  $files = @($files | Where-Object { $_ })
  if ($files.Count -eq 0) { Write-Host 'Nothing to stop.'; exit 0 }
  foreach ($f in $files) { Stop-Demo $f.FullName }
  Write-Host 'Done. Redis and PostgreSQL keep running (pnpm services:stop stops Redis).'
  exit 0
}

# ---------- start ----------
if ($ApiPort -eq $WebPort) { Fail 'ApiPort and WebPort must differ.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is not installed (node >= 22).' }
foreach ($bin in 'tsx\dist\cli.mjs', 'expo\bin\cli', 'prisma\build\index.js') {
  if (-not (Test-Path (Join-Path $root "node_modules\$bin"))) { Fail 'Dependencies are missing: run pnpm install first.' }
}
if (-not (Test-Path (Join-Path $apiDir '.env'))) {
  Fail 'apps/api/.env is missing. Run apps/api/scripts/setup-db.ps1 once (see docs/RUN_THE_APP.md).'
}

function Get-LanIp {
  $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric)
  foreach ($route in $routes) {
    $address = Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '127.*' } |
      Select-Object -First 1
    if ($address) { return $address.IPAddress }
  }
  return ''
}
if (-not $LanIp) { $LanIp = Get-LanIp }
if (-not $LanIp) { Fail 'No Wi-Fi/LAN address found. Connect to Wi-Fi, or pass -LanIp 192.168.x.x.' }
if ($LanIp -notmatch '^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(\.\d{1,3})?$') {
  Write-Host "Warning: $LanIp is not a private network address; phones may not reach it." -ForegroundColor Yellow
}
$apiLocal = "http://localhost:$ApiPort"
$apiLan = "http://${LanIp}:$ApiPort"
$webLocal = "http://localhost:$WebPort"
$webLan = "http://${LanIp}:$WebPort"
$expoUrl = "exp://${LanIp}:$WebPort"

function Test-Http([string]$url) {
  try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true }
  catch { return [bool]$_.Exception.Response }  # 503 (degraded) still means it answers
}
function Wait-Http([string]$url, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Http $url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
function Test-PortInUse([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Show-NextSteps {
  Write-Host ''
  Write-Host '=== NjangiTrust is running ===' -ForegroundColor Green
  Write-Host "API          $apiLocal   (phones: $apiLan)"
  Write-Host ''
  Write-Host 'iPhone (Expo Go from the App Store, same Wi-Fi or laptop hotspot):'
  Write-Host '  open the Camera app, scan this QR code, tap "Open in Expo Go"'
  Write-Host "  or in Expo Go enter the URL: $expoUrl"
  & node (Join-Path $PSScriptRoot 'demo-qr.cjs') $expoUrl
  Write-Host 'Android: in Expo Go tap "Scan QR code" and scan the same code.'
  Write-Host ''
  Write-Host "Browser on this PC:   $webLocal"
  Write-Host "Browser on the LAN:   $webLan   (sign-in is not kept after a reload over http)"
  Write-Host ''
  $seed = if ($ApiPort -eq 3000) { 'pnpm demo:seed' } else { "`$env:DEMO_API_URL='$apiLocal'; pnpm demo:seed" }
  Write-Host "Demo people and groups (logins and PINs are printed): $seed"
  $stop = if ($ApiPort -eq 3000 -and $WebPort -eq 8081) { 'pnpm demo:stop' } else { "pnpm demo:stop -ApiPort $ApiPort -WebPort $WebPort" }
  Write-Host "Stop: $stop"
  if ($Background) { Write-Host "Logs: $stateDir" }
}

function Test-Firewall {
  $rule = Get-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' }
  $ports = @()
  if ($rule) { $ports = @($rule | Get-NetFirewallPortFilter | ForEach-Object { $_.LocalPort }) }
  if (-not ($ports -contains "$ApiPort" -and $ports -contains "$WebPort")) {
    Write-Host ''
    Write-Host 'Phones need a Windows Firewall rule for these ports. Once, in PowerShell as administrator:' -ForegroundColor Yellow
    Write-Host "  New-NetFirewallRule -DisplayName '$firewallRule' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ApiPort,$WebPort -Profile Private" -ForegroundColor Yellow
  }
  $netProfile = Get-NetIPAddress -IPAddress $LanIp -ErrorAction SilentlyContinue |
    ForEach-Object { Get-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue }
  if ($netProfile -and $netProfile.NetworkCategory -eq 'Public') {
    Write-Host "Your Wi-Fi '$($netProfile.Name)' is a Public network: phones are blocked. Make it Private (Settings > Network > Wi-Fi > Private network)." -ForegroundColor Yellow
  }
}

# Already running? (idempotent)
if (Test-Path $stateFile) {
  $state = Get-Content $stateFile -Raw | ConvertFrom-Json
  if ((Get-OwnProcess $state.api) -and (Get-OwnProcess $state.expo) -and $state.lanIp -eq $LanIp) {
    Write-Host 'Already running.'
    Test-Firewall
    Show-NextSteps
    exit 0
  }
  Step 'A previous demo is incomplete or the address changed: restarting it.'
  Stop-Demo $stateFile
}
foreach ($port in $ApiPort, $WebPort) {
  if (Test-PortInUse $port) {
    Fail "Port $port is already used by another program (pnpm dev:api or dev:mobile?). Stop it, or choose other ports: pnpm demo -ApiPort 3100 -WebPort 8091"
  }
}

# 1. Services
Step 'Checking PostgreSQL and Redis'
$pgIsReady = 'C:\Program Files\PostgreSQL\16\bin\pg_isready.exe'
& $pgIsReady -h localhost -p 5432 | Out-Null
if ($LASTEXITCODE -ne 0) {
  try { Start-Service 'postgresql-x64-16'; Start-Sleep -Seconds 3 } catch { }
  & $pgIsReady -h localhost -p 5432 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail 'PostgreSQL is not running. In PowerShell as administrator: Start-Service postgresql-x64-16'
  }
}
& (Join-Path $PSScriptRoot 'services.ps1') start
$redisUp = $false
try {
  $client = New-Object Net.Sockets.TcpClient
  $client.Connect('127.0.0.1', 6379); $client.Close(); $redisUp = $true
} catch { }
if (-not $redisUp) { Fail 'Redis did not start. See "Redis does not answer" in docs/RUN_THE_APP.md.' }

# 2. Migrations (deploy only: applies pending ones, never resets data)
Step 'Applying pending database migrations'
$env:CHECKPOINT_DISABLE = '1'
$env:PRISMA_HIDE_UPDATE_MESSAGE = '1'
$env:NODE_OPTIONS = '--dns-result-order=ipv4first --use-system-ca'
Push-Location $apiDir
try {
  & node (Join-Path $root 'node_modules\prisma\build\index.js') migrate deploy
  if ($LASTEXITCODE -ne 0) { Fail 'prisma migrate deploy failed (see above). The database was not changed.' }
} finally { Pop-Location }

# 3. API and Expo. Children inherit these variables; .env never overrides them.
New-Item -ItemType Directory -Force $stateDir | Out-Null
$origins = @("http://localhost:$WebPort", "http://127.0.0.1:$WebPort", $webLan) -join ','
$env:PORT = "$ApiPort"
$env:WEB_ORIGINS = $origins
$env:PUBLIC_BASE_URL = $apiLan
$env:PUBLIC_APP_URL = $webLan
$env:EXPO_PUBLIC_API_URL = $apiLan
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanIp
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
Remove-Item Env:HOST -ErrorAction SilentlyContinue   # development: every interface

function Start-Part([string]$name, [string]$dir, [string[]]$nodeArgs, [string]$title) {
  if ($Background) {
    $env:CI = '1'
    $log = Join-Path $stateDir "$name-$ApiPort-$WebPort.log"
    $quoted = ($nodeArgs | ForEach-Object { "`"$_`"" }) -join ' '
    $p = Start-Process -FilePath 'node' -ArgumentList $quoted -WorkingDirectory $dir -WindowStyle Hidden `
      -RedirectStandardOutput $log -RedirectStandardError "$log.err" -PassThru
  } else {
    $argList = ($nodeArgs | ForEach-Object { "'$_'" }) -join ' '
    $command = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; & node $argList"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoExit -NoProfile -EncodedCommand $encoded" -PassThru
  }
  return @{ pid = $p.Id; started = $p.StartTime.ToUniversalTime().Ticks; port = 0 }
}

Step "Starting the API on port $ApiPort"
$api = Start-Part 'api' $apiDir @((Join-Path $root 'node_modules\tsx\dist\cli.mjs'), '--env-file=.env', 'src/server.ts') "NjangiTrust API :$ApiPort"
$api.port = $ApiPort
$expoArgs = @((Join-Path $root 'node_modules\expo\bin\cli'), 'start', '--port', "$WebPort", '--offline')
if ($ClearCache) { $expoArgs += '--clear' }
Step "Starting Expo on port $WebPort (web + Expo Go)"
$expo = Start-Part 'expo' $mobileDir $expoArgs "NjangiTrust Expo :$WebPort"
$expo.port = $WebPort
@{ api = $api; expo = $expo; lanIp = $LanIp } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Step 'Waiting for the API'
if (-not (Wait-Http "$apiLocal/health" 300)) { Fail "The API did not answer on $apiLocal/health. Read its window (or log) for the reason, then run pnpm demo:stop." }
if (-not (Test-Http "$apiLan/health")) { Fail "The API answers on localhost but not on $apiLan." }
Step 'Waiting for Expo (the first start can take a minute)'
if (-not (Wait-Http "http://127.0.0.1:$WebPort/status" 300)) { Fail "Expo did not answer on port $WebPort. Read its window (or log) for the reason, then run pnpm demo:stop." }

Test-Firewall
Show-NextSteps
