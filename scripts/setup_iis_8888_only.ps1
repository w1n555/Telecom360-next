#Requires -RunAsAdministrator
# Telecom360-next local IIS: ONLY port 8888.
# - Stages dist -> C:\inetpub\wwwroot
# - Removes old site names (Telecom360-Three.js, etc.)
# - Stops Default Web Site on :80 so old local is not used
# - Creates/starts Telecom360-next on :8888
$ErrorActionPreference = 'Stop'

$SiteName = 'Telecom360-next'
$Port = 8888
$PhysicalPath = 'C:\inetpub\wwwroot'
$AppPool = 'Telecom360-next-Pool'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StageScript = Join-Path $Repo 'scripts\stage_iis_root.ps1'
$log = Join-Path $Repo 'logs\setup_iis_8888_only.log'

function L([string]$m) {
  $line = "$(Get-Date -Format o) $m"
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
'' | Set-Content $log -Encoding UTF8
L 'START setup_iis_8888_only'

if (-not (Test-Path (Join-Path $Repo 'dist\index.html'))) {
  throw "dist missing. Run: npm run build in $Repo"
}

L 'Staging dist -> wwwroot'
& $StageScript 2>&1 | ForEach-Object { L "$_" }
if (-not (Test-Path (Join-Path $PhysicalPath 'index.html'))) {
  throw "Stage failed - index.html missing under $PhysicalPath"
}
if (-not (Test-Path (Join-Path $PhysicalPath 'viewer-shell\manifest.json'))) {
  throw "viewer-shell missing under $PhysicalPath - export will fail"
}

Import-Module WebAdministration -ErrorAction Stop

# --- Stop / remove old locals that served same content ---
# 1) Default Web Site on :80 (old local)
$default = Get-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue
if ($default) {
  try {
    Stop-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue
    L 'Stopped Default Web Site (:80)'
  } catch {
    L "Stop Default Web Site: $($_.Exception.Message)"
  }
}

# 2) Legacy product site names
$oldSites = @(
  'Telecom360-Three.js',
  'Telecom360-ThreeJS',
  'Telecom360',
  $SiteName
)
foreach ($name in $oldSites) {
  $s = Get-Website -Name $name -ErrorAction SilentlyContinue
  if ($s) {
    try {
      Stop-Website -Name $name -ErrorAction SilentlyContinue
      Remove-Website -Name $name
      L "Removed site: $name"
    } catch {
      L "Remove site $name : $($_.Exception.Message)"
    }
  }
}

# 3) Old app pools
$oldPools = @('Telecom360-Three.js-Pool', 'Telecom360-ThreeJS-Pool', 'Telecom360-Pool', $AppPool)
foreach ($pool in $oldPools) {
  if (Test-Path "IIS:\AppPools\$pool") {
    try {
      if ((Get-WebAppPoolState -Name $pool).Value -eq 'Started') {
        Stop-WebAppPool -Name $pool -ErrorAction SilentlyContinue
      }
      # keep DefaultAppPool; only remove product pools we recreated
      if ($pool -ne 'DefaultAppPool') {
        Remove-WebAppPool -Name $pool -ErrorAction SilentlyContinue
        L "Removed app pool: $pool"
      }
    } catch {
      L "Pool $pool : $($_.Exception.Message)"
    }
  }
}

# Ensure physical path + site folder
if (-not (Test-Path $PhysicalPath)) {
  New-Item -ItemType Directory -Force -Path $PhysicalPath | Out-Null
}
$siteDir = Join-Path $PhysicalPath 'site'
if (-not (Test-Path $siteDir)) {
  New-Item -ItemType Directory -Force -Path $siteDir | Out-Null
}

# ACL for IIS read
$acl = Get-Acl $PhysicalPath
foreach ($id in @('IIS_IUSRS', 'IUSR', 'BUILTIN\IIS_IUSRS', 'BUILTIN\Users', $env:USERNAME)) {
  try {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $id, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
    )
    $acl.SetAccessRule($rule)
  } catch {}
}
Set-Acl $PhysicalPath $acl

# App pool (no managed runtime = static)
New-WebAppPool -Name $AppPool | Out-Null
Set-ItemProperty "IIS:\AppPools\$AppPool" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$AppPool" -Name startMode -Value 'AlwaysRunning' -ErrorAction SilentlyContinue
L "Created app pool: $AppPool"

# Site on 8888 only
New-Website -Name $SiteName -Port $Port -PhysicalPath $PhysicalPath -ApplicationPool $AppPool | Out-Null
Start-Website -Name $SiteName
Start-WebAppPool -Name $AppPool -ErrorAction SilentlyContinue
L "Created site $SiteName on port $Port -> $PhysicalPath"

# Verify
L '=== Sites after ==='
Get-Website | ForEach-Object {
  $b = ($_.bindings.Collection | ForEach-Object { $_.bindingInformation }) -join '; '
  L ("SITE name={0} state={1} path={2} bind={3}" -f $_.Name, $_.State, $_.physicalPath, $b)
}

# HTTP smoke
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
  L "HTTP :$Port/ -> $($r.StatusCode)"
} catch {
  L "HTTP :$Port/ FAIL: $($_.Exception.Message)"
}
try {
  $r80 = Invoke-WebRequest -Uri 'http://127.0.0.1/' -UseBasicParsing -TimeoutSec 3
  L "HTTP :80/ still responds $($r80.StatusCode) (Default Web Site may still be up)"
} catch {
  L 'HTTP :80/ not serving (expected if Default Web Site stopped)'
}

L "DONE. Open http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "Telecom360-next local URL: http://127.0.0.1:$Port/"
Write-Host "Export ZIP -> unzip into $PhysicalPath"
