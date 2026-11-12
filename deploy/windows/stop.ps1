# stop.ps1 - "Hentikan Nishikigoi" shortcut: stops the web server and the private database of this installation.
param([switch]$Quiet)
$ErrorActionPreference = 'SilentlyContinue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# php was started with 'ROOT/bin/router.php' (mixed slashes): compare with every slash made the same
$sep = [IO.Path]::DirectorySeparatorChar
$needle = [IO.Path]::Combine($Root, 'bin', 'router.php').ToLower()
Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Replace([char]47, $sep).ToLower().Contains($needle) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
& (Join-Path $Root 'nishikigoi.ps1') stop | Out-Null
if ($Quiet) { exit 0 }
Add-Type -AssemblyName System.Windows.Forms
[void][System.Windows.Forms.MessageBox]::Show('Nishikigoi dihentikan.', 'Nishikigoi', 'OK', 'Information')
