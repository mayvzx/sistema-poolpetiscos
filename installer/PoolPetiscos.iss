#ifndef AppStage
  #error AppStage não foi informado.
#endif
#ifndef AppOutput
  #error AppOutput não foi informado.
#endif
#ifndef AppVersion
  #define AppVersion "1.8.0"
#endif
#ifndef AppIcon
  #error AppIcon não foi informado.
#endif
#ifndef AppIdentifier
  #define AppIdentifier "{{A4C9659D-8819-4A24-8D02-F432F51C03D4}"
#endif
#ifndef AppInstallDirectory
  #define AppInstallDirectory "{localappdata}\Programs\Pool Petiscos"
#endif
#ifndef AppDataDirectory
  #define AppDataDirectory "{localappdata}\PoolPetiscos"
#endif
#ifndef AppMutexName
  #define AppMutexName "Local\PoolPetiscosLauncher"
#endif

[Setup]
AppId={#AppIdentifier}
AppName=Pool Petiscos
AppVersion={#AppVersion}
AppPublisher=Pool Petiscos & Lanches
DefaultDirName={#AppInstallDirectory}
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
AppMutex={#AppMutexName}
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
Name: "{group}\Desinstalar Pool Petiscos"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Pool Petiscos"; Filename: "{app}\PoolPetiscos.exe"; IconFilename: "{app}\PoolPetiscos-{#AppVersion}.ico"; IconIndex: 0; Tasks: desktopicon

[Registry]
; HKCU\Run é mais confiável que um atalho na pasta Startup. O modo --startup
; abre o navegador somente depois que o serviço e os dados locais estão prontos.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Pool Petiscos"; ValueData: """{app}\PoolPetiscos.exe"" --startup"; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\PoolPetiscos.exe"; Description: "Abrir Pool Petiscos"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\PoolPetiscos.exe"; Parameters: "--shutdown"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopPoolPetiscos"
Filename: "{app}\PoolPetiscos.exe"; Parameters: "--disconnect-google-drive"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "DisconnectPoolPetiscosDrive"; Check: ShouldRemoveUserData

[UninstallDelete]
Type: filesandordirs; Name: "{#AppDataDirectory}"; Check: ShouldRemoveUserData

[Code]
var
  RemoveUserData: Boolean;

function StopRunningApplication(): Boolean;
var
  ExecutablePath: String;
  ResultCode: Integer;
  Attempt: Integer;
begin
  Result := True;
  ExecutablePath := ExpandConstant('{app}\PoolPetiscos.exe');
  if FileExists(ExecutablePath) then
  begin
    Log('Solicitando o encerramento seguro da versão instalada.');
    if not Exec(
      ExecutablePath,
      '--shutdown',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    ) then
      Log('Não foi possível executar --shutdown; aguardando o mutex mesmo assim.');
  end;

  for Attempt := 1 to 60 do
  begin
    if not CheckForMutexes('{#AppMutexName}') then
      Exit;
    Sleep(500);
  end;

  Result := not CheckForMutexes('{#AppMutexName}');
end;

function CopyAndVerifyFile(
  const SourcePath: String;
  const BackupPath: String;
  var ErrorMessage: String
): Boolean;
var
  SourceHash: String;
  BackupHash: String;
begin
  Result := False;
  if not CopyFile(SourcePath, BackupPath, False) then
  begin
    ErrorMessage := 'Não foi possível copiar ' + ExtractFileName(SourcePath) + '.';
    Exit;
  end;

  SourceHash := GetSHA256OfFile(SourcePath);
  BackupHash := GetSHA256OfFile(BackupPath);
  if (SourceHash = '') or (CompareText(SourceHash, BackupHash) <> 0) then
  begin
    DeleteFile(BackupPath);
    ErrorMessage :=
      'A cópia de ' + ExtractFileName(SourcePath) +
      ' não passou na verificação.';
    Exit;
  end;
  Log('Arquivo pré-atualização verificado com SHA-256: ' + BackupHash);
  Result := True;
end;

function CreatePreUpdateBackup(var ErrorMessage: String): Boolean;
var
  SourcePath: String;
  BackupDirectory: String;
  BackupPath: String;
  Suffix: String;
  Index: Integer;
begin
  Result := False;
  SourcePath := ExpandConstant(
    '{#AppDataDirectory}\data\pool-petiscos.db'
  );
  if not FileExists(SourcePath) then
  begin
    Log('Nenhum banco anterior encontrado; instalação inicial sem backup prévio.');
    Result := True;
    Exit;
  end;

  BackupDirectory := ExpandConstant(
    '{#AppDataDirectory}\update-backups\pre-update-' +
    GetDateTimeString('yyyymmdd-hhnnss', '-', '-')
  );
  BackupPath := BackupDirectory + '\pool-petiscos.db';
  Log('Criando backup pré-atualização em ' + BackupPath);

  if not ForceDirectories(BackupDirectory) then
  begin
    ErrorMessage :=
      'Não foi possível criar a pasta do backup pré-atualização.';
    Exit;
  end;
  if not CopyAndVerifyFile(SourcePath, BackupPath, ErrorMessage) then
    Exit;

  { Preserva também um WAL remanescente caso o SQLite ainda não o tenha
    consolidado no arquivo principal durante o encerramento. }
  for Index := 1 to 2 do
  begin
    if Index = 1 then
      Suffix := '-wal'
    else
      Suffix := '-shm';
    if FileExists(SourcePath + Suffix) then
    begin
      if not CopyAndVerifyFile(
        SourcePath + Suffix,
        BackupPath + Suffix,
        ErrorMessage
      ) then
        Exit;
    end;
  end;

  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not StopRunningApplication() then
  begin
    Result :=
      'O Pool Petiscos ainda está em execução. Feche o sistema e tente a atualização novamente.';
    Exit;
  end;

  if not CreatePreUpdateBackup(Result) then
  begin
    Result := Result + #13#10 + #13#10 +
      'A atualização foi interrompida para preservar as vendas e configurações existentes.';
  end;
end;

function HasCommandLineParameter(const Expected: String): Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
  begin
    if CompareText(ParamStr(Index), Expected) = 0 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  if HasCommandLineParameter('/PURGEUSERDATA') then
  begin
    RemoveUserData := True;
  end
  else if UninstallSilent then
  begin
    RemoveUserData := False;
  end
  else
  begin
    RemoveUserData := MsgBox(
      'Deseja remover também todos os dados deste computador?' + #13#10 + #13#10 +
      'Isso apaga o banco local, músicas, configurações, PINs, logs e backups locais. ' +
      'Os arquivos já enviados ao Google Drive ou OneDrive serão preservados.',
      mbConfirmation,
      MB_YESNO or MB_DEFBUTTON2
    ) = IDYES;
  end;
end;

function ShouldRemoveUserData(): Boolean;
begin
  Result := RemoveUserData;
end;

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
