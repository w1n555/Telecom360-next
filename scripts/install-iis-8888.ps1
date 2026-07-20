#Requires -RunAsAdministrator
# Telecom360-next - IIS static site on port 8888 only -> C:\inetpub\wwwroot
# Prefer: scripts\setup_iis_8888_only.ps1 (also stops Default Web Site :80)
# No Node backend / no reverse proxy. Publish = copy ZIP contents to wwwroot.
$ErrorActionPreference = 'Stop'
$SiteName = 'Telecom360-next'
$Port = 8888
$PhysicalPath = 'C:\inetpub\wwwroot'
$AppPool = 'Telecom360-next-Pool'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StageScript = Join-Path $Repo 'scripts\stage_iis_root.ps1'

if (-not (Test-Path (Join-Path $Repo 'dist\index.html'))) {
  throw "dist missing. Run: npm run build in $Repo"
}

& $StageScript
if (-not (Test-Path (Join-Path $PhysicalPath 'index.html'))) {
  throw "Stage failed - index.html missing under $PhysicalPath"
}

Import-Module WebAdministration -ErrorAction Stop

# Stop old Default Web Site on :80 (do not use as Telecom local)
if (Get-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue) {
  Stop-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue
}

if (-not (Test-Path "IIS:\AppPools\$AppPool")) {
  New-WebAppPool -Name $AppPool | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$AppPool" -Name managedRuntimeVersion -Value ''

# Remove old product site names
foreach ($old in @($SiteName, 'Telecom360-Three.js', 'Telecom360-ThreeJS', 'Telecom360')) {
  if (Get-Website -Name $old -ErrorAction SilentlyContinue) {
    Stop-Website -Name $old -ErrorAction SilentlyContinue
    Remove-Website -Name $old
  }
}

New-Website -Name $SiteName -Port $Port -PhysicalPath $PhysicalPath -ApplicationPool $AppPool | Out-Null
Write-Host "Created IIS site $SiteName on port $Port -> $PhysicalPath"

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

$siteDir = Join-Path $PhysicalPath 'site'
if (-not (Test-Path $siteDir)) { New-Item -ItemType Directory -Force -Path $siteDir | Out-Null }

Start-Website -Name $SiteName
Write-Host "Site started: http://127.0.0.1:$Port/"
Write-Host "Editor: export ZIP -> unzip to $PhysicalPath"
Write-Host "Do not use http://localhost/ (:80) - Default Web Site is stopped."
