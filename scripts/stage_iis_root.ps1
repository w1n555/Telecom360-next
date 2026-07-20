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

# Ensure OCR vendor is on site root (public/vendor is in dist after vite build)
$ocrSrc = Join-Path $Repo 'public\vendor\tesseract'
$ocrDst = Join-Path $IIS_ROOT 'vendor\tesseract'
if (Test-Path $ocrSrc) {
  New-Item -ItemType Directory -Force -Path $ocrDst | Out-Null
  # Exclude local *.bak language-pack backups; only ship eng + chi_tra full tessdata
  robocopy $ocrSrc $ocrDst /E /NFL /NDL /NJH /NJS /nc /ns /np /XF *.bak | Out-Null
  # Drop obsolete chi_sim if present from older stages
  $legacySim = Join-Path $ocrDst 'chi_sim.traineddata'
  if (Test-Path $legacySim) { Remove-Item $legacySim -Force }
  Write-Host "OCR vendor staged: $ocrDst"
}

# Static MIME only (no ARR /api proxy). .traineddata required for OCR export fetch.
$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".json" />
      <remove fileExtension=".mjs" />
      <remove fileExtension=".wasm" />
      <remove fileExtension=".traineddata" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
      <mimeMap fileExtension=".wasm" mimeType="application/wasm" />
      <mimeMap fileExtension=".ply" mimeType="application/octet-stream" />
      <mimeMap fileExtension=".traineddata" mimeType="application/octet-stream" />
    </staticContent>
    <security>
      <requestFiltering>
        <fileExtensions>
          <remove fileExtension=".traineddata" />
          <add fileExtension=".traineddata" allowed="true" />
        </fileExtensions>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
'@
Set-Content -Path (Join-Path $IIS_ROOT 'web.config') -Value $webConfig -Encoding UTF8
Write-Host "Staged static Editor: $IIS_ROOT"
Write-Host "Publish viewers: export ZIP -> unzip here (or copy whole folder to server wwwroot)"
