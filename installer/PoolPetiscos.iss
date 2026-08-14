#ifndef AppStage
  #error AppStage não foi informado.
#endif
#ifndef AppOutput
  #error AppOutput não foi informado.
#endif
#ifndef AppVersion
  #define AppVersion "1.4.0"
#endif
#ifndef AppIcon
  #error AppIcon não foi informado.
#endif

[Setup]
AppId={{A4C9659D-8819-4A24-8D02-F432F51C03D4}
AppName=Pool Petiscos
AppVersion={#AppVersion}
AppPublisher=Pool Petiscos & Lanches
DefaultDirName={localappdata}\Programs\Pool Petiscos
DefaultGroupName=Pool Petiscos
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#AppOutput}
OutputBaseFilename=PoolPetiscos-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=force
RestartApplications=no
AppMutex=Local\PoolPetiscosLauncher
UninstallDisplayIcon={app}\PoolPetiscos-{#AppVersion}.ico
SetupIconFile={#AppIcon}
VersionInfoVersion={#AppVersion}
VersionInfoCompany=Pool Petiscos & Lanches
VersionInfoDescription=Instalador do sistema de caixa Pool Petiscos
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#ifdef UnsignedBuild
SignedUninstaller=no
#else
SignTool=poolpetiscos
SignedUninstaller=yes
#endif

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos adicionais:"; Flags: checkedonce
Name: "startup"; Description: "Iniciar o Pool Petiscos automaticamente com o Windows"; GroupDescription: "Inicialização:"

[Files]
Source: "{#AppStage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#AppIcon}"; DestDir: "{app}"; DestName: "PoolPetiscos-{#AppVersion}.ico"; Flags: ignoreversion

[Icons]
Name: "{group}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; IconFilename: "{app}\PoolPetiscos-{#AppVersion}.ico"; IconIndex: 0
Name: "{group}\Dados e backups"; Filename: "{app}\PoolPetiscos.exe"; Parameters: "--open-data-folder"; IconFilename: "{app}\PoolPetiscos-{#AppVersion}.ico"; IconIndex: 0
Name: "{group}\Manual do sistema"; Filename: "{app}\manual\MANUAL-DO-OPERADOR.txt"
Name: "{group}\Encerrar Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; Parameters: "--shutdown"; IconFilename: "{app}\PoolPetiscos-{#AppVersion}.ico"; IconIndex: 0
Name: "{autodesktop}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; IconFilename: "{app}\PoolPetiscos-{#AppVersion}.ico"; IconIndex: 0; Tasks: desktopicon

[Registry]
; HKCU\Run é mais confiável que um atalho na pasta Startup. O modo --startup
; abre o navegador somente depois que o serviço e os dados locais estão prontos.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Pool Petiscos"; ValueData: """{app}\PoolPetiscos.exe"" --startup"; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\PoolPetiscos.exe"; Description: "Abrir Pool Petiscos"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\PoolPetiscos.exe"; Parameters: "--shutdown"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopPoolPetiscos"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Remove o atalho legado apenas depois que a atualização terminou. }
    DeleteFile(ExpandConstant('{userstartup}\Pool Petiscos.lnk'));

    { Em uma atualização, também respeita a opção desmarcada pelo usuário. }
    if not WizardIsTaskSelected('startup') then
    begin
      RegDeleteValue(
        HKEY_CURRENT_USER,
        'Software\Microsoft\Windows\CurrentVersion\Run',
        'Pool Petiscos'
      );
    end;
  end;
end;
