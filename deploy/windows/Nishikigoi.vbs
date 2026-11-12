' Runs launch.ps1 without showing a console window. Arguments (for example -Lan) are handed on.
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
extra = ""
For Each a In WScript.Arguments
  extra = extra & " " & a
Next
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & here & "launch.ps1""" & extra, 0, False
