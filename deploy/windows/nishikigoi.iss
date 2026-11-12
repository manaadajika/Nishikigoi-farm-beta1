; nishikigoi.iss - Inno Setup script of the Windows installer. Built by build-installer.ps1 (which fills in the three defines below).
; Installs for the current user only (no administrator rights), so the in-program update can write its own files later.
; Layout in the install folder: Nishikigoi.exe, uploads\, data\, backups\ and program\ (see build-installer.ps1).
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
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename=Nishikigoi-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Nishikigoi
UninstallDisplayIcon={app}\Nishikigoi.exe
CloseApplications=no

[Tasks]
Name: "desktopicon"; Description: "Buat ikon di desktop"; GroupDescription: "Tambahan:"

[Dirs]
Name: "{app}\uploads"
Name: "{app}\data"
Name: "{app}\backups"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Nishikigoi\Nishikigoi"; Filename: "{app}\Nishikigoi.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\Nishikigoi\Nishikigoi (bisa dibuka dari HP)"; Filename: "{app}\Nishikigoi.exe"; Parameters: "--lan"; WorkingDir: "{app}"
Name: "{autoprograms}\Nishikigoi\Hentikan Nishikigoi"; Filename: "{app}\Nishikigoi.exe"; Parameters: "--stop"; WorkingDir: "{app}"
Name: "{autoprograms}\Nishikigoi\Folder data (uploads, data, backups)"; Filename: "{app}"
Name: "{autodesktop}\Nishikigoi"; Filename: "{app}\Nishikigoi.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Nishikigoi.exe"; WorkingDir: "{app}"; Description: "Jalankan Nishikigoi sekarang"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\Nishikigoi.exe"; Parameters: "--stop --quiet"; Flags: runhidden; RunOnceId: "StopNishikigoi"

[Code]
// Removing the program keeps the farm data (uploads, data, backups) unless the user says otherwise (default answer: No).
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    if MsgBox('Hapus juga semua data (database ikan, foto, dan backup) di folder program?' + #13#10 + 'Pilih Tidak bila data masih diperlukan. Data yang dihapus tidak bisa dikembalikan.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{app}'), True, True, True);
end;
