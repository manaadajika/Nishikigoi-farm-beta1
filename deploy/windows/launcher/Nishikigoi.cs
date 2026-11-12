// Nishikigoi.cs - the small Nishikigoi.exe that sits beside the folders uploads\, data\ and backups\ (see deploy/windows/build-installer.ps1).
//   Nishikigoi.exe          starts the program (database + web server, hidden) and opens the browser
//   Nishikigoi.exe --lan    same, but other devices on the network (a phone) may open it too
//   Nishikigoi.exe --stop   stops the web server and the database (--quiet: without the message)
// It only tells the program where the data lives (NISHIKIGOI_HOME = the folder of this exe) and runs program\deploy\windows\launch.ps1 or
// stop.ps1 without a console window. Built with the csc.exe that comes with Windows (.NET Framework 4), no extra tools.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Nishikigoi
{
    [STAThread]
    static int Main(string[] args)
    {
        string home = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string program = Path.Combine(home, "program");
        string scripts = Path.Combine(program, "deploy", "windows");
        if (!Directory.Exists(scripts))
        {
            MessageBox.Show("Folder program tidak ditemukan:\n" + program + "\n\nJangan memindahkan Nishikigoi.exe keluar dari foldernya.", "Nishikigoi", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        foreach (string name in new[] { "uploads", "data", "backups" })
        {
            try { Directory.CreateDirectory(Path.Combine(home, name)); } catch { }
        }

        bool stop = Array.IndexOf(args, "--stop") >= 0;
        string script = Path.Combine(scripts, stop ? "stop.ps1" : "launch.ps1");
        string extra = "";
        if (stop && Array.IndexOf(args, "--quiet") >= 0) extra = " -Quiet";
        if (!stop && Array.IndexOf(args, "--lan") >= 0) extra = " -Lan";

        var psi = new ProcessStartInfo("powershell.exe",
            "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"" + extra);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WorkingDirectory = program;
        psi.EnvironmentVariables["NISHIKIGOI_HOME"] = home;
        try { Process.Start(psi); }
        catch (Exception e)
        {
            MessageBox.Show("PowerShell tidak bisa dijalankan:\n" + e.Message, "Nishikigoi", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        return 0;
    }
}
