# Downloads a pinned Android platform-tools release, verifies its SHA-256 and
# places adb/fastboot (as Tauri sidecars) and their DLLs in src-tauri/binaries.
# To upgrade: change $Version and $Sha256 together.
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Version = '37.0.3'
$Sha256 = '89d108360a3bf2924d3bea837239edaccc22fd6ff5befd3787c4348a9fe4f09d'
$Url = "https://dl.google.com/android/repository/platform-tools_r$Version-win.zip"
$Triple = 'x86_64-pc-windows-msvc'

$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root 'src-tauri\binaries'
$Stamp = Join-Path $Dest 'VERSION'

if (-not $Force -and (Test-Path $Stamp) -and ((Get-Content $Stamp -Raw).Trim() -eq $Version)) {
    Write-Host "platform-tools $Version already present"
    exit 0
}

$Tmp = Join-Path ([IO.Path]::GetTempPath()) "easyadb-platform-tools-$Version"
if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
New-Item -ItemType Directory -Force $Tmp | Out-Null

$Zip = Join-Path $Tmp 'platform-tools.zip'
Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing

$Actual = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Sha256) {
    throw "SHA-256 mismatch for $Url. Expected $Sha256, got $Actual"
}

$Extract = Join-Path $Tmp 'extract'
Expand-Archive -Path $Zip -DestinationPath $Extract
$Src = Join-Path $Extract 'platform-tools'

New-Item -ItemType Directory -Force $Dest | Out-Null
Copy-Item (Join-Path $Src 'adb.exe') (Join-Path $Dest "adb-$Triple.exe") -Force
Copy-Item (Join-Path $Src 'fastboot.exe') (Join-Path $Dest "fastboot-$Triple.exe") -Force
foreach ($File in 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt') {
    Copy-Item (Join-Path $Src $File) (Join-Path $Dest $File) -Force
}
Set-Content -Path $Stamp -Value $Version -Encoding ascii

Remove-Item $Tmp -Recurse -Force
Write-Host "platform-tools $Version installed to $Dest"
