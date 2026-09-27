#ifndef MyAppVersion
  #define MyAppVersion "3.0.202"
#endif
#ifndef PublishDir
  #define PublishDir "..\\artifacts\\publish"
#endif

[Setup]
AppId={{7F89006A-96B6-4B55-9151-46CB7D5953E1}
AppName=Michel's Life
AppVersion={#MyAppVersion}
AppPublisher=Michel's Lab
DefaultDirName={autopf}\MichelsLife
DefaultGroupName=Michel's Life
DisableProgramGroupPage=yes
OutputDir=..\artifacts
OutputBaseFilename=MichelsLife-Setup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\MichelsLife.exe
SetupIconFile=..\src\MichelsLife\Assets\michels_life_icon.ico
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[CustomMessages]
english.CreateDesktopShortcut=Create a desktop shortcut
spanish.CreateDesktopShortcut=Crear un acceso directo en el escritorio
english.AdditionalIcons=Additional icons:
spanish.AdditionalIcons=Iconos adicionales:
english.LaunchApp=Launch Michel's Life
spanish.LaunchApp=Abrir Michel's Life

[Files]
Source: "{#PublishDir}\MichelsLife.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Michel's Life"; Filename: "{app}\MichelsLife.exe"
Name: "{autodesktop}\Michel's Life"; Filename: "{app}\MichelsLife.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopShortcut}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\MichelsLife.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent

[Code]
procedure SaveInitialAppLanguage();
var
  LanguageDir: String;
  LanguageCode: String;
begin
  LanguageDir := ExpandConstant('{localappdata}\MichelsLife');
  ForceDirectories(LanguageDir);
  if ActiveLanguage = 'spanish' then
    LanguageCode := 'es'
  else
    LanguageCode := 'en';
  SaveStringToFile(LanguageDir + '\install-language.txt', LanguageCode, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    SaveInitialAppLanguage();
end;
