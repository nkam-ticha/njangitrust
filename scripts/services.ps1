# Local services without Docker (docs/DECISIONS.md D2).
#   PostgreSQL: the installed PostgreSQL 16 on localhost:5432 (checked, not managed here).
#   Redis:      redis-server inside the kali-linux WSL distro, reached at localhost:6379.
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$distro = 'kali-linux'
$pgIsReady = 'C:\Program Files\PostgreSQL\16\bin\pg_isready.exe'

function Test-Redis {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', 6379)
    $stream = $client.GetStream()
    $bytes = [Text.Encoding]::ASCII.GetBytes("PING`r`n")
    $stream.Write($bytes, 0, $bytes.Length)
    $buffer = New-Object byte[] 16
    $stream.ReadTimeout = 2000
    $read = $stream.Read($buffer, 0, 16)
    $client.Close()
    return ([Text.Encoding]::ASCII.GetString($buffer, 0, $read)).StartsWith('+PONG')
  } catch { return $false }
}

function Show-Status {
  & $pgIsReady -h localhost -p 5432 | Out-Null
  $pg = if ($LASTEXITCODE -eq 0) { 'up' } else { 'down (start the postgresql-x64-16 service)' }
  $redis = if (Test-Redis) { 'up' } else { 'down (run: pnpm services:start)' }
  Write-Host "PostgreSQL localhost:5432  $pg"
  Write-Host "Redis      localhost:6379  $redis"
}

switch ($Action) {
  'start' {
    if (Test-Redis) { Write-Host 'Redis already running.' }
    else {
      # A hidden wsl.exe keeps the distro alive while Redis runs in the foreground.
      Start-Process -WindowStyle Hidden -FilePath 'wsl.exe' -ArgumentList @(
        '-d', $distro, '-u', 'root', '--', 'redis-server',
        '--bind', '127.0.0.1', '--port', '6379', '--protected-mode', 'yes',
        '--appendonly', 'yes', '--dir', '/var/lib/redis')
      # WSL can take a while to forward the port to Windows the first time.
      $deadline = (Get-Date).AddSeconds(60)
      while (-not (Test-Redis) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    }
    Show-Status
  }
  'stop' {
    wsl.exe -d $distro -u root -- sh -c 'redis-cli -p 6379 shutdown 2>/dev/null || true' | Out-Null
    Show-Status
  }
  'status' { Show-Status }
}
