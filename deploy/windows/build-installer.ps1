# build-installer.ps1 - builds Nishikigoi-Setup.exe (the Windows installer). Runs on a Windows computer with Git and Inno Setup 6
# (iscc.exe); GitHub Actions does exactly this on every release (.github/workflows/windows-installer.yml).
#
#   .\deploy\windows\build-installer.ps1                       takes the program from GitHub (branch main)
#   .\deploy\windows\build-installer.ps1 -Branch some-branch   another branch or tag
#
# Steps: shallow clone of the program (so the installed copy can update itself from GitHub with the portable Git) -> download the
# portable PHP, MariaDB and MinGit into runtime\ (nishikigoi.ps1 fetch-runtime) -> leave out what is not needed -> Inno Setup.
# Result: build\out\Nishikigoi-Setup.exe. Farm data is never part of it (the folders storage\ and api-php\uploads stay empty).
param(
    [string]$Repo = 'https://github.com/manaadajika/Nishikigoi-farm-beta1.git',
    [string]$Branch = 'main',
    [string]$Work = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'build')
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$stage = Join-Path $Work 'stage'
$out = Join-Path $Work 'out'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Work, $out | Out-Null

Write-Host '1/4 Mengambil program dari GitHub...'
& git -c core.autocrlf=false clone --depth 1 --branch $Branch $Repo $stage
if ($LASTEXITCODE -ne 0) { throw 'git clone gagal.' }
# the installed copy must not see its own files as "changed" (line endings, file modes), or the in-program update refuses to run
& git -C $stage config core.autocrlf false
& git -C $stage config core.filemode false

Write-Host '2/4 Mengunduh PHP, MariaDB dan Git portabel...'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stage 'nishikigoi.ps1') fetch-runtime
if ($LASTEXITCODE -ne 0) { throw 'Mengunduh runtime gagal.' }

Write-Host '3/4 Merapikan isi paket...'
$maria = Join-Path $stage 'runtime\mariadb'
foreach ($drop in @('mysql-test', 'sql-bench', 'include', 'data')) {
    $path = Join-Path $maria $drop
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}
Get-ChildItem -Path $maria -Recurse -Include *.pdb, *.lib -File -ErrorAction SilentlyContinue | Remove-Item -Force
# nothing of the builder's own computer may travel inside
foreach ($path in @('storage\mysql', 'storage\run', 'storage\logs', 'storage\backups', 'api-php\config.local.php')) {
    $full = Join-Path $stage $path
    if (Test-Path $full) { Remove-Item $full -Recurse -Force }
}
$version = 'unknown'
$versionFile = Join-Path $stage 'api-php\lib\version.php'
if ((Get-Content $versionFile -Raw) -match "APP_VERSION_LABEL\s*=\s*'([^']+)'") { $version = $Matches[1] }
$commit = (& git -C $stage rev-parse --short=7 HEAD).Trim()
Write-Host "    versi $version-$commit"

Write-Host '4/4 Membuat Setup.exe (Inno Setup)...'
$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
    foreach ($p in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")) { if (Test-Path $p) { $iscc = $p; break } }
}
if (-not $iscc) { throw 'Inno Setup 6 belum terpasang (https://jrsoftware.org/isdl.php).' }
& $iscc "/DAppVersion=$version-$commit" "/DSourceDir=$stage" "/DOutputDir=$out" (Join-Path $PSScriptRoot 'nishikigoi.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup gagal.' }
$exe = Join-Path $out 'Nishikigoi-Setup.exe'
$hash = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToLower()
"$hash  Nishikigoi-Setup.exe" | Set-Content -Path (Join-Path $out 'Nishikigoi-Setup.exe.sha256') -Encoding ASCII
Write-Host ('Selesai: ' + $exe + ' (' + [math]::Round((Get-Item $exe).Length / 1MB) + ' MB)')
