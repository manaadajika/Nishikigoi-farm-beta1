# launch.ps1 - what the "Nishikigoi" shortcut of the Windows installer runs (through Nishikigoi.vbs, so no console window shows).
# Starts the private database and the web server when they are not running yet, waits until the page answers, then opens the browser.
# The very first start also installs the tables and the account admin / admin, which takes a minute.
#   launch.ps1            only this computer can open the program
#   launch.ps1 -Lan       other devices on the same network (a phone) may open it too
param([switch]$Lan, [int]$Port = 2000)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Log = Join-Path $Root 'storage\logs'
New-Item -ItemType Directory -Force -Path $Log | Out-Null
$Url = "http://localhost:$Port"

function Test-Port([int]$P) {
    try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect('127.0.0.1', $P, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(400); $c.Close(); return $ok } catch { return $false }
}
function Show-Error([string]$Text) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($Text, 'Nishikigoi', 'OK', 'Error')
}

if (-not (Test-Port $Port)) {
    $script = Join-Path $Root 'nishikigoi.ps1'
    $mode = if ($Lan) { '--lan' } else { '--local' }
    $serverArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $script, 'start', $mode, "--port=$Port")
    # first start: the tables and the admin account are made before the server starts
    if (-not (Test-Path (Join-Path $Root 'api-php\config.local.php'))) {
        $setup = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $script, 'setup') -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Log 'setup.log') -RedirectStandardError (Join-Path $Log 'setup-error.log')
        if ($setup.ExitCode -ne 0) { Show-Error "Pemasangan pertama gagal. Lihat $Log\setup.log"; exit 1 }
    }
    Start-Process -FilePath 'powershell.exe' -ArgumentList $serverArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Log 'server.log') -RedirectStandardError (Join-Path $Log 'server-error.log') | Out-Null
    $deadline = (Get-Date).AddSeconds(90)
    while (-not (Test-Port $Port) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-Port $Port)) { Show-Error "Server tidak mau menyala. Lihat $Log\server.log"; exit 1 }
}
Start-Process $Url
