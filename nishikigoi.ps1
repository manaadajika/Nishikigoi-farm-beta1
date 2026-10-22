# nishikigoi.ps1 - menjalankan Nishikigoi di Windows. Biasanya lewat nishikigoi.bat (klik dua kali).
#
#   .\nishikigoi.ps1                 pasang bila perlu, lalu jalankan  (http://localhost:2000)
#   .\nishikigoi.ps1 setup           pemasangan pertama (database pribadi + akun admin / admin)
#   .\nishikigoi.ps1 start --local   jalankan hanya untuk perangkat ini (bawaan: perangkat lain boleh setelah kata sandi admin diganti)
#   .\nishikigoi.ps1 stop | status | passwd USER PASS
#
# Bila PHP atau server database (MariaDB) belum ada di komputer ini, skrip ini mengunduh versi portabelnya dari situs resmi
# (windows.php.net dan downloads.mariadb.org) ke folder runtime\ di dalam proyek: tanpa installer, tanpa hak administrator,
# dan tidak mengubah apa pun di luar folder proyek. Butuh internet hanya untuk unduhan pertama itu.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
Set-Location -LiteralPath $PSScriptRoot
$Root = $PSScriptRoot
$Runtime = Join-Path $Root 'runtime'
$Command = if ($Rest -and $Rest.Count -gt 0 -and -not $Rest[0].StartsWith('--')) { $Rest[0] } else { 'run' }

function Get-Download([string]$Url, [string]$Target) {
    Write-Host "  mengunduh $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing
}
function Test-Hash([string]$File, [string]$Expected) {
    if (-not $Expected) { return }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $File).Hash.ToLower()
    if ($actual -ne $Expected.ToLower()) { Remove-Item $File -Force; throw "Berkas unduhan rusak (checksum tidak cocok): $File" }
}

function Find-Php {
    $local = Join-Path $Runtime 'php\php.exe'
    if (Test-Path $local) { return $local }
    $cmd = Get-Command php -ErrorAction SilentlyContinue
    if ($cmd) {
        $ok = & $cmd.Source -r 'echo version_compare(PHP_VERSION,"8.1.0",">=") ? "1" : "0";' 2>$null
        if ($ok -eq '1') { return $cmd.Source }
    }
    foreach ($base in @('C:\laragon\bin\php', "$env:USERPROFILE\laragon\bin\php", 'C:\xampp\php')) {
        if (Test-Path $base) {
            $found = Get-ChildItem -Path $base -Recurse -Filter php.exe -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
            if ($found) { return $found.FullName }
        }
    }
    return $null
}
function Install-Php {
    Write-Host 'PHP belum ada: mengunduh PHP portabel (sekitar 33 MB)...'
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    $releases = Invoke-RestMethod -Uri 'https://windows.php.net/downloads/releases/releases.json' -UseBasicParsing
    $choice = $null
    foreach ($series in @('8.3', '8.4', '8.2')) {
        $entry = $releases.$series
        if (-not $entry) { continue }
        foreach ($build in @('nts-vs16-x64', 'nts-vs17-x64')) {
            if ($entry.$build) { $choice = $entry.$build; break }
        }
        if ($choice) { break }
    }
    if (-not $choice) { throw 'Tidak menemukan PHP 8.x untuk Windows di windows.php.net.' }
    $zip = Join-Path $Runtime 'php.zip'
    Get-Download ('https://windows.php.net/downloads/releases/' + $choice.zip.path) $zip
    Test-Hash $zip $choice.zip.sha256
    $dest = Join-Path $Runtime 'php'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    Remove-Item $zip -Force
    @(
        'extension_dir = "ext"', 'extension=curl', 'extension=exif', 'extension=fileinfo', 'extension=gd', 'extension=mbstring',
        'extension=mysqli', 'extension=openssl', 'extension=pdo_mysql', 'extension=zip',
        'zend_extension=opcache', 'opcache.enable=1', 'date.timezone=Asia/Jakarta', 'memory_limit=512M', 'display_errors=Off'
    ) | Set-Content -Path (Join-Path $dest 'php.ini') -Encoding ASCII
    return (Join-Path $dest 'php.exe')
}

function Test-Db {
    foreach ($pattern in @("$Runtime\mariadb\bin\mariadbd.exe", 'C:\laragon\bin\mysql\*\bin\mysqld.exe', "$env:USERPROFILE\laragon\bin\mysql\*\bin\mysqld.exe",
                           'C:\Program Files\MariaDB *\bin\mariadbd.exe', 'C:\Program Files\MySQL\MySQL Server *\bin\mysqld.exe', 'C:\xampp\mysql\bin\mysqld.exe')) {
        if (Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue) { return $true }
    }
    return [bool](Get-Command mariadbd, mysqld -ErrorAction SilentlyContinue)
}
function Install-MariaDb {
    Write-Host 'Server database belum ada: mengunduh MariaDB portabel (sekitar 100 MB)...'
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    $api = Invoke-RestMethod -Uri 'https://downloads.mariadb.org/rest-api/mariadb/10.11/' -UseBasicParsing
    $release = ($api.releases.PSObject.Properties | Select-Object -First 1).Value
    $file = $release.files | Where-Object { $_.file_name -like '*winx64.zip' } | Select-Object -First 1
    if (-not $file) { throw 'Tidak menemukan paket MariaDB untuk Windows di downloads.mariadb.org.' }
    $zip = Join-Path $Runtime 'mariadb.zip'
    Get-Download ($file.file_download_url -replace '^http:', 'https:') $zip
    Test-Hash $zip $file.checksum.sha256sum
    $tmp = Join-Path $Runtime 'mariadb-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $dest = Join-Path $Runtime 'mariadb'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Move-Item -Path (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName -Destination $dest
    Remove-Item $tmp -Recurse -Force
    Remove-Item $zip -Force
}

$php = Find-Php
if (-not $php -and ($Command -in @('run', 'setup', 'start'))) { $php = Install-Php }
if (-not $php) { Write-Host 'PHP tidak ditemukan. Jalankan .\nishikigoi.ps1 setup dulu.' -ForegroundColor Yellow; exit 1 }

# the database server is only needed for the private database (setup / first run); an existing one counts
if ($Command -in @('run', 'setup') -and -not (Test-Db)) { Install-MariaDb }

& $php (Join-Path $Root 'bin\nishikigoi.php') @Rest
exit $LASTEXITCODE
