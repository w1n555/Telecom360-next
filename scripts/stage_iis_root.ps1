# Stage built Editor into C:\inetpub\wwwroot (static only — no reverse proxy / Node).
# Manual publish: export ZIP from Editor, unzip into this web root (or copy to server).
$ErrorActionPreference = 'Stop'
$Repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$IIS_ROOT = 'C:\inetpub\wwwroot'
$dist = Join-Path $Repo 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "dist missing - run npm run build first"
}
if (-not (Test-Path $IIS_ROOT)) {
  New-Item -ItemType Directory -Force -Path $IIS_ROOT | Out-Null
}

$rc = (Start-Process -FilePath robocopy.exe -ArgumentList @(
  $dist, $IIS_ROOT, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'
) -Wait -PassThru -NoNewWindow).ExitCode
if ($rc -ge 8) { throw "robocopy dist failed exit $rc" }

# Remove legacy OCR vendor from older stages (no longer shipped)
$legacyOcr = Join-Path $IIS_ROOT 'vendor\tesseract'
if (Test-Path $legacyOcr) {
  Remove-Item $legacyOcr -Recurse -Force
  Write-Host "Removed legacy OCR: $legacyOcr"
}

# Static MIME only (no ARR /api proxy)
$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".json" />
      <remove fileExtension=".mjs" />
      <remove fileExtension=".wasm" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
      <mimeMap fileExtension=".wasm" mimeType="application/wasm" />
      <mimeMap fileExtension=".ply" mimeType="application/octet-stream" />
    </staticContent>
  </system.webServer>
</configuration>
'@
Set-Content -Path (Join-Path $IIS_ROOT 'web.config') -Value $webConfig -Encoding UTF8
Write-Host "Staged static Editor: $IIS_ROOT"
if (-not (Test-Path (Join-Path $IIS_ROOT 'viewer-shell\manifest.json'))) {
  Write-Warning "viewer-shell missing under $IIS_ROOT — ZIP export from Editor will fail. Rebuild with npm run build."
} else {
  Write-Host "viewer-shell OK (required for Export ZIP)"
}
Write-Host "Publish tours: Editor Export ZIP -> unzip here (or copy folder to server wwwroot)"
