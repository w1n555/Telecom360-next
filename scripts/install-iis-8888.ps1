#Requires -RunAsAdministrator
# Telecom360-Three.js - IIS static site on port 8888 -> C:\inetpub\wwwroot
# No Node backend / no reverse proxy. Publish = copy ZIP contents to wwwroot.
$ErrorActionPreference = 'Stop'
$SiteName = 'Telecom360-Three.js'
$Port = 8888
$PhysicalPath = 'C:\inetpub\wwwroot'
$AppPool = 'Telecom360-Three.js-Pool'
$Repo = 'C:\Users\W1NGGG\Documents\Telecom360-Three.js'
$StageScript = Join-Path $Repo 'scripts\stage_iis_root.ps1'

if (-not (Test-Path (Join-Path $Repo 'dist\index.html'))) {
  throw "dist missing. Run: npm run build in $Repo"
}

& $StageScript
if (-not (Test-Path (Join-Path $PhysicalPath 'index.html'))) {
  throw "Stage failed - index.html missing under $PhysicalPath"
}

Import-Module WebAdministration -ErrorAction Stop

if (-not (Test-Path "IIS:\AppPools\$AppPool")) {
  New-WebAppPool -Name $AppPool | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$AppPool" -Name managedRuntimeVersion -Value ''

if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
  Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
  Remove-Website -Name $SiteName
}

New-Website -Name $SiteName -Port $Port -PhysicalPath $PhysicalPath -ApplicationPool $AppPool | Out-Null
Write-Host "Created IIS site $SiteName on port $Port -> $PhysicalPath"

# Read for static; optional write if you unzip packages as current user
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
Write-Host "Editor: export ZIP -> unzip to $PhysicalPath (or copy to server wwwroot)"
