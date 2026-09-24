$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "..\exerealease\SolaxRD-Setup.exe"
$destDir = Join-Path $root "download"
$dest = Join-Path $destDir "SolaxRD-Setup.exe"
if (-not (Test-Path -LiteralPath $src)) { throw "Manca SolaxRD-Setup.exe in exerealease." }
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -LiteralPath $src -Destination $dest -Force
$item = Get-Item -LiteralPath $dest
Write-Host ("Aggiornato download/SolaxRD-Setup.exe (" + [math]::Round($item.Length / 1MB, 1) + " MB).")
