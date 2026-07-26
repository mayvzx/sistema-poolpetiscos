#ifndef AppStage
  #error AppStage não foi informado.
#endif
#ifndef AppOutput
  #error AppOutput não foi informado.
#endif
#ifndef AppVersion
  #define AppVersion "1.0.1"
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
UninstallDisplayIcon={app}\PoolPetiscos.exe
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
Name: "startup"; Description: "Iniciar o Pool Petiscos automaticamente com o Windows"; GroupDescription: "Inicialização:"; Flags: checkedonce

[Files]
Source: "{#AppStage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"
Name: "{group}\Encerrar Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; Parameters: "--shutdown"
Name: "{autodesktop}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; Tasks: desktopicon
Name: "{userstartup}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; Parameters: "--background"; Tasks: startup

[Run]
Filename: "{app}\PoolPetiscos.exe"; Description: "Abrir Pool Petiscos"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\PoolPetiscos.exe"; Parameters: "--shutdown"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopPoolPetiscos"
