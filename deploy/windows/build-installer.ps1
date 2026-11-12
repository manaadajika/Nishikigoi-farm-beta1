# build-installer.ps1 - builds the Windows packages of Nishikigoi. Runs on a Windows computer with Git and Inno Setup 6 (iscc.exe);
# GitHub Actions does exactly this on every release (.github/workflows/windows-installer.yml).
#
#   .\deploy\windows\build-installer.ps1                       takes the program from GitHub (branch main)
#   .\deploy\windows\build-installer.ps1 -Branch some-branch   another branch
#
# Result (in build\out): Nishikigoi-Setup.exe (installer) and Nishikigoi-Portable.zip (extract anywhere), both with this layout:
#
#   Nishikigoi\
#     Nishikigoi.exe     <- double-click; --lan lets a phone on the same network open it, --stop stops everything
#     uploads\           <- photos and videos (grows by itself)
#     data\              <- the database
#     backups\           <- backup files
#     program\           <- PHP, MariaDB, Git and the program files; the in-program update only touches this folder
#
# Steps: shallow clone of the program into program\ (so it can update itself from GitHub with the portable Git) -> download the portable
# PHP, MariaDB and MinGit into program\runtime (nishikigoi.ps1 fetch-runtime) -> leave out what is not needed -> compile Nishikigoi.exe with
# the csc.exe that ships with Windows -> Inno Setup and zip. Farm data is never part of it.
param(
    [string]$Repo = 'https://github.com/manaadajika/Nishikigoi-farm-beta1.git',
    [string]$Branch = 'main',
    [string]$Work = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'build')
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$stage = Join-Path $Work 'stage'
$program = Join-Path $stage 'program'
$out = Join-Path $Work 'out'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage, $out | Out-Null

Write-Host '1/5 Mengambil program dari GitHub...'
& git -c core.autocrlf=false clone --depth 1 --branch $Branch $Repo $program
if ($LASTEXITCODE -ne 0) { throw 'git clone gagal.' }
# the installed copy must not see its own files as "changed" (line endings, file modes), or the in-program update refuses to run
& git -C $program config core.autocrlf false
& git -C $program config core.filemode false

Write-Host '2/5 Mengunduh PHP, MariaDB dan Git portabel...'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $program 'nishikigoi.ps1') fetch-runtime
if ($LASTEXITCODE -ne 0) { throw 'Mengunduh runtime gagal.' }

Write-Host '3/5 Merapikan isi paket...'
$maria = Join-Path $program 'runtime\mariadb'
foreach ($drop in @('mysql-test', 'sql-bench', 'include', 'data')) {
    $path = Join-Path $maria $drop
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}
Get-ChildItem -Path $maria -Recurse -Include *.pdb, *.lib -File -ErrorAction SilentlyContinue | Remove-Item -Force
# nothing of the builder's own computer may travel inside
foreach ($path in @('storage\mysql', 'storage\run', 'storage\logs', 'storage\backups', 'api-php\config.local.php', 'api-php\uploads')) {
    $full = Join-Path $program $path
    if (Test-Path $full) { Remove-Item $full -Recurse -Force }
}
foreach ($name in @('uploads', 'data', 'backups')) { New-Item -ItemType Directory -Force -Path (Join-Path $stage $name) | Out-Null }
$version = 'unknown'
$versionFile = Join-Path $program 'api-php\lib\version.php'
if ((Get-Content $versionFile -Raw) -match "APP_VERSION_LABEL\s*=\s*'([^']+)'") { $version = $Matches[1] }
$commit = (& git -C $program rev-parse --short=7 HEAD).Trim()
Write-Host "    versi $version-$commit"

Write-Host '4/5 Membuat Nishikigoi.exe...'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4) tidak ditemukan.' }
$icon = Join-Path $program 'app\public\Nishikigoi-beta\preview\dist\favicon.ico'
$cscArgs = @('/nologo', '/target:winexe', ('/out:' + (Join-Path $stage 'Nishikigoi.exe')), '/reference:System.Windows.Forms.dll')
if (Test-Path $icon) { $cscArgs += ('/win32icon:' + $icon) }
$cscArgs += (Join-Path $program 'deploy\windows\launcher\Nishikigoi.cs')
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) { throw 'Nishikigoi.exe gagal dibuat.' }

Write-Host '5/5 Membuat Setup.exe (Inno Setup) dan zip portabel...'
$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
    foreach ($p in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")) { if (Test-Path $p) { $iscc = $p; break } }
}
if (-not $iscc) { throw 'Inno Setup 6 belum terpasang (https://jrsoftware.org/isdl.php).' }
& $iscc "/DAppVersion=$version-$commit" "/DSourceDir=$stage" "/DOutputDir=$out" (Join-Path $PSScriptRoot 'nishikigoi.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup gagal.' }
# the portable zip keeps the folder name Nishikigoi\ so it extracts into one tidy folder
$zipRoot = Join-Path $Work 'zip'
if (Test-Path $zipRoot) { Remove-Item $zipRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $zipRoot | Out-Null
Move-Item -Path $stage -Destination (Join-Path $zipRoot 'Nishikigoi')
Compress-Archive -Path (Join-Path $zipRoot 'Nishikigoi') -DestinationPath (Join-Path $out 'Nishikigoi-Portable.zip') -CompressionLevel Optimal
foreach ($name in @('Nishikigoi-Setup.exe', 'Nishikigoi-Portable.zip')) {
    $file = Join-Path $out $name
    $hash = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower()
    "$hash  $name" | Set-Content -Path ($file + '.sha256') -Encoding ASCII
    Write-Host ('Selesai: ' + $file + ' (' + [math]::Round((Get-Item $file).Length / 1MB) + ' MB)')
}
