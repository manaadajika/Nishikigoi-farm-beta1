@echo off
rem Nishikigoi - klik dua kali untuk memasang (sekali saja) dan menjalankan. Lihat README.md.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nishikigoi.ps1" %*
if errorlevel 1 pause
