param(
  [string]$ScannerHost = 'patient-scanner',
  [string]$ScannerUser = 'scanner',
  [string]$DeviceId = 'reader-pi-uno',
  [string]$ParamedicActorId = 'portal-paramedic'
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$apiOrigin = 'http://127.0.0.1:4100'
$webOrigin = 'http://localhost:5173'
$publicOrigin = 'https://pranrekha.rabidahal.com.np'
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
$scp = (Get-Command scp.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$cloudflared = Join-Path $workspace 'node_modules\cloudflared\bin\cloudflared.exe'
$cloudflareTokenStore = Join-Path $env:LOCALAPPDATA 'PranRekha\cloudflare-tunnel-token.dpapi'
$pythonBridge = Join-Path $workspace 'firmware\pi_bridge\scanner.py'
$serviceUnit = Join-Path $workspace 'firmware\pi_bridge\patient-scanner.service'
$startupDir = Join-Path $workspace '.data\scanner-startup'
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('pran-scanner-' + [guid]::NewGuid().ToString('N'))
$appProcess = $null
$cloudflareProcess = $null
$runtimeTokenDir = $null

function Test-ApiReady {
  try {
    Invoke-WebRequest -Uri "$apiOrigin/api/session" -Method Get -UseBasicParsing | Out-Null
    return $true
  } catch {
    $response = $_.Exception.Response
    if ($response -and [int]$response.StatusCode -eq 401) { return $true }
    return $false
  }
}

function Test-PublicOriginAllowed {
  try {
    Invoke-WebRequest -Uri "$apiOrigin/api/session" -Method Post -UseBasicParsing `
      -Headers @{ Origin = $publicOrigin } -ContentType 'application/json' -Body '{}' | Out-Null
    return $true
  } catch {
    $response = $_.Exception.Response
    if ($response -and [int]$response.StatusCode -eq 403) { return $false }
    return [bool]$response
  }
}

function Wait-ForApi {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if (Test-ApiReady) { return }
    Start-Sleep -Seconds 1
  }
  throw "The local API did not start. Check $startupDir\api.err.log"
}

if (-not (Test-Path -LiteralPath (Join-Path $workspace 'node_modules'))) {
  throw 'Dependencies are missing. From the workspace, run: npm.cmd install'
}
if (-not (Test-Path -LiteralPath $pythonBridge) -or -not (Test-Path -LiteralPath $serviceUnit)) {
  throw 'The scanner bridge or its systemd service file is missing from this checkout.'
}
if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw 'cloudflared is missing. From the workspace, run: npm.cmd install'
}

New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
if (-not (Test-ApiReady)) {
  $oldPublicOrigin = $env:PUBLIC_ORIGIN
  $env:PUBLIC_ORIGIN = "$webOrigin,$publicOrigin"
  try {
    $appProcess = Start-Process -FilePath $npm `
      -ArgumentList @('run', 'dev') `
      -WorkingDirectory $workspace `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $startupDir 'app.log') `
      -RedirectStandardError (Join-Path $startupDir 'app.err.log') `
      -PassThru
  } finally {
    if ($null -eq $oldPublicOrigin) { Remove-Item Env:\PUBLIC_ORIGIN -ErrorAction SilentlyContinue }
    else { $env:PUBLIC_ORIGIN = $oldPublicOrigin }
  }
  Wait-ForApi
}
Write-Host "Local app is ready at $webOrigin"
if (-not (Test-PublicOriginAllowed)) {
  throw "The API already running on port 4100 does not allow $publicOrigin. Stop that app process, then rerun this script so it can start the API with the correct public origin."
}

$remote = "$ScannerUser@$ScannerHost"
Write-Host "Checking SSH access to $remote before provisioning a new reader credential."
& $ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=10 $remote 'true'
if ($LASTEXITCODE -ne 0) { throw 'SSH login failed. Confirm the Pi password or restore an authorized SSH key, then rerun this script.' }

if (Test-Path -LiteralPath $cloudflareTokenStore) {
  $cloudflareTokenSecure = (Get-Content -LiteralPath $cloudflareTokenStore -Raw).Trim() | ConvertTo-SecureString
} else {
  $cloudflareTokenSecure = Read-Host -AsSecureString -Prompt 'Cloudflare named tunnel token (Dashboard > Networking > Tunnels > Add a replica)'
  if (-not $cloudflareTokenSecure -or $cloudflareTokenSecure.Length -eq 0) {
    throw 'A Cloudflare tunnel token is required to restore the public hostname.'
  }
  $tokenParent = Split-Path -Parent $cloudflareTokenStore
  New-Item -ItemType Directory -Path $tokenParent -Force | Out-Null
  $cloudflareTokenSecure | ConvertFrom-SecureString | Set-Content -LiteralPath $cloudflareTokenStore -NoNewline
}
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cloudflareTokenSecure)
try { $cloudflareToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }

$adminCredential = Get-Credential -UserName 'admin' -Message 'Local Pran Rekha demo admin account (default password: pran-demo-admin)'
$adminPassword = $adminCredential.GetNetworkCredential().Password
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$temporaryToken = $null

try {
  $loginBody = @{ username = $adminCredential.UserName; password = $adminPassword } | ConvertTo-Json
  Invoke-RestMethod -Uri "$apiOrigin/api/session" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $webSession | Out-Null
  $adminPassword = $null

  $provisionBody = @{ id = $DeviceId; actorId = $ParamedicActorId } | ConvertTo-Json
  $reader = Invoke-RestMethod -Uri "$apiOrigin/api/platform/readers/provision" -Method Post `
    -ContentType 'application/json' -Body $provisionBody -WebSession $webSession
  if (-not $reader.token) { throw 'The API did not return a reader credential.' }
  $temporaryToken = $reader.token
  Write-Host "Provisioned reader '$DeviceId' and paired it to '$ParamedicActorId'."

  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  $scannerEnv = @(
    'API_ORIGIN=http://127.0.0.1:14100',
    "RFID_DEVICE_ID=$DeviceId",
    "RFID_DEVICE_TOKEN=$temporaryToken",
    'RFID_SERIAL_PORT=/dev/ttyACM0'
  ) -join "`n"
  [System.IO.File]::WriteAllText((Join-Path $tempDir 'scanner.env'), $scannerEnv + "`n", [System.Text.Encoding]::ASCII)
  Copy-Item -LiteralPath $pythonBridge -Destination (Join-Path $tempDir 'scanner.py')
  Copy-Item -LiteralPath $serviceUnit -Destination (Join-Path $tempDir 'patient-scanner.service')

  $bootstrap = @'
#!/bin/sh
set -eu
install -m 755 "$HOME/.bootstrap/scanner.py" "$HOME/patient-scanner/scanner.py"
install -m 600 "$HOME/.bootstrap/scanner.env" "$HOME/patient-scanner/scanner.env"
install -m 644 "$HOME/.bootstrap/patient-scanner.service" "$HOME/.config/systemd/user/patient-scanner.service"
if ! python3 -c 'import serial' >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3-serial
fi
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now patient-scanner.service
sleep 2
systemctl --user status patient-scanner.service --no-pager -l
journalctl --user -u patient-scanner.service -n 20 --no-pager
rm -rf "$HOME/.bootstrap" "$HOME/scanner-bootstrap.zip"
'@
  [System.IO.File]::WriteAllText((Join-Path $tempDir 'bootstrap.sh'), $bootstrap, [System.Text.Encoding]::ASCII)

  # Keep the short-lived credential bundle readable only by the current Windows user.
  $acl = Get-Acl -LiteralPath $tempDir
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $tempDir -AclObject $acl
  $archive = Join-Path $tempDir 'scanner-bootstrap.zip'
  Compress-Archive -Path (Join-Path $tempDir 'scanner.py'), (Join-Path $tempDir 'patient-scanner.service'), (Join-Path $tempDir 'scanner.env'), (Join-Path $tempDir 'bootstrap.sh') -DestinationPath $archive

  Write-Host "Copying the bridge to $remote. SSH may ask for the Pi's login password."
  & $scp -o StrictHostKeyChecking=yes $archive "${remote}:scanner-bootstrap.zip"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy the bridge. Check the Pi SSH password and host-key confirmation.' }

  $remoteCommand = 'mkdir -p ~/patient-scanner ~/.config/systemd/user ~/.bootstrap && python3 -m zipfile -e ~/scanner-bootstrap.zip ~/.bootstrap && sh ~/.bootstrap/bootstrap.sh'
  Write-Host 'Installing the bridge and enabling it at boot. sudo may ask for the Pi password.'
  & $ssh -tt -o StrictHostKeyChecking=yes $remote $remoteCommand
  if ($LASTEXITCODE -ne 0) { throw 'Pi setup did not finish. Review the SSH output above, then rerun this script.' }
} finally {
  $adminPassword = $null
  $temporaryToken = $null
  if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
}

$runtimeTokenDir = Join-Path $env:TEMP ('pran-cloudflare-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runtimeTokenDir -Force | Out-Null
$tokenAcl = Get-Acl -LiteralPath $runtimeTokenDir
$tokenAcl.SetAccessRuleProtection($true, $false)
$tokenRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
  'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$tokenAcl.SetAccessRule($tokenRule)
Set-Acl -LiteralPath $runtimeTokenDir -AclObject $tokenAcl
$runtimeTokenFile = Join-Path $runtimeTokenDir 'token'
[System.IO.File]::WriteAllText($runtimeTokenFile, $cloudflareToken, [System.Text.Encoding]::ASCII)
$cloudflareToken = $null

try {
  Write-Host "Starting the named Cloudflare tunnel for $publicOrigin..."
  $cloudflareProcess = Start-Process -FilePath $cloudflared `
    -ArgumentList @('tunnel', '--no-autoupdate', 'run', '--token-file', $runtimeTokenFile) `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $startupDir 'cloudflared.log') `
    -RedirectStandardError (Join-Path $startupDir 'cloudflared.err.log') `
    -PassThru

  $siteReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($cloudflareProcess.HasExited) { throw "cloudflared exited. Check $startupDir\cloudflared.err.log and the saved dashboard token." }
    try {
      $response = Invoke-WebRequest -Uri $publicOrigin -Method Get -UseBasicParsing -TimeoutSec 5
      if ([int]$response.StatusCode -eq 200) { $siteReady = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
  }
  if (-not $siteReady) {
    throw "The tunnel process is running, but $publicOrigin did not return HTTP 200. Check the Cloudflare public-hostname origin points to http://localhost:5173 and review the tunnel logs."
  }

  Write-Host "`nWebsite is serving at $publicOrigin. Scanner bridge is installed."
  Write-Host "Open $webOrigin (or the public URL) and sign in to the paramedic portal."
  Write-Host 'The reader should show "Tap RFID card"; bridge logs should report Arduino STATUS with RFID=OK and the LCD address.'
  Write-Host 'Keep this window open. Ctrl+C stops the site tunnel and app API tunnel.'
  Write-Host 'Starting the reverse SSH tunnel from the Pi to the local API on port 4100...'
  & $ssh -N -T -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 `
    -R 127.0.0.1:14100:127.0.0.1:4100 "$ScannerUser@$ScannerHost"
  if ($LASTEXITCODE -ne 0) { throw 'The SSH API tunnel exited. Check the Pi SSH connection and whether port 14100 is in use.' }
} finally {
  if ($cloudflareProcess -and -not $cloudflareProcess.HasExited) { Stop-Process -Id $cloudflareProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($runtimeTokenDir -and (Test-Path -LiteralPath $runtimeTokenDir)) { Remove-Item -LiteralPath $runtimeTokenDir -Recurse -Force }
  if ($appProcess -and -not $appProcess.HasExited) { & taskkill.exe /PID $appProcess.Id /T /F 2>$null | Out-Null }
}
