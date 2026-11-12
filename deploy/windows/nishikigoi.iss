; nishikigoi.iss - Inno Setup script of the Windows installer. Built by build-installer.ps1 (which fills in the three defines below).
; Installs for the current user only (no administrator rights), so the in-program update can write its own files later.
#ifndef AppVersion
  #define AppVersion "0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\build\out"
#endif

[Setup]
AppId={{6B0B2B5E-5C0F-4E35-9B53-4B2D8E6D1F10}
AppName=Nishikigoi
AppVersion={#AppVersion}
AppPublisher=Nishikigoi
DefaultDirName={localappdata}\Programs\Nishikigoi
DefaultGroupName=Nishikigoi
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=Nishikigoi-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Nishikigoi
CloseApplications=no

[Tasks]
Name: "desktopicon"; Description: "Buat ikon di desktop"; GroupDescription: "Tambahan:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Nishikigoi\Nishikigoi"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\deploy\windows\Nishikigoi.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\app\public\Nishikigoi-beta\preview\dist\favicon.ico"
Name: "{autoprograms}\Nishikigoi\Nishikigoi (bisa dibuka dari HP)"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\deploy\windows\Nishikigoi.vbs"" -Lan"; WorkingDir: "{app}"; IconFilename: "{app}\app\public\Nishikigoi-beta\preview\dist\favicon.ico"
Name: "{autoprograms}\Nishikigoi\Hentikan Nishikigoi"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\deploy\windows\Nishikigoi-Stop.vbs"""; WorkingDir: "{app}"
Name: "{autodesktop}\Nishikigoi"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\deploy\windows\Nishikigoi.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\app\public\Nishikigoi-beta\preview\dist\favicon.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\deploy\windows\Nishikigoi.vbs"""; WorkingDir: "{app}"; Description: "Jalankan Nishikigoi sekarang"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\deploy\windows\stop.ps1"" -Quiet"; Flags: runhidden; RunOnceId: "StopNishikigoi"

[Code]
// Removing the program keeps the farm data unless the user says otherwise (default answer: No).
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    if MsgBox('Hapus juga semua data (database ikan, foto, dan backup) di folder program?' + #13#10 + 'Pilih Tidak bila data masih diperlukan. Data yang dihapus tidak bisa dikembalikan.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{app}'), True, True, True);
end;
