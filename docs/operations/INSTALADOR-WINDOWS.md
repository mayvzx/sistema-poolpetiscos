# Instalador Windows do Pool Petiscos

## Resultado

O pipeline gera um instalador por usuário para Windows x64. O computador do
caixa não precisa ter Node.js, Python, `yt-dlp` ou FFmpeg instalados: as versões
necessárias são incluídas no pacote.

O aplicativo é instalado em:

```text
%LOCALAPPDATA%\Programs\Pool Petiscos
```

Os dados operacionais ficam separados da instalação:

```text
%LOCALAPPDATA%\PoolPetiscos\data
%LOCALAPPDATA%\PoolPetiscos\musicas
%LOCALAPPDATA%\PoolPetiscos\logs
```

Atualizar ou desinstalar o programa não remove esses diretórios. Essa separação
é intencional para preservar banco, backups, músicas e diagnóstico. Para apagar
os dados é necessária uma ação manual e consciente.

## O que é empacotado

- interface React em saída standalone de produção;
- Node.js 22 LTS portátil para servir a interface somente em
  `127.0.0.1:4173`;
- launcher Python criado com PyInstaller;
- serviço local de dados e músicas em `127.0.0.1:8765`;
- `yt-dlp` fixado pelo arquivo `local_service/requirements.txt`;
- FFmpeg e ffprobe do projeto recomendado pelo `yt-dlp`;
- manual do operador e guia de acesso ao banco;
- textos de licença e manifesto das versões efetivamente incluídas.

O launcher mantém uma única instância, grava logs rotativos, supervisiona os
dois processos e reinicia um componente que encerre inesperadamente. O atalho
normal abre o navegador. A inicialização automática aguarda os serviços locais
e abre o caixa no navegador após o login do Windows.

O grupo **Pool Petiscos** no menu Iniciar também oferece **Dados e backups**,
**Manual do sistema** e **Encerrar Pool Petiscos**.

O serviço iniciado em segundo plano também executa a política de backup do
armazenamento. Quando o OneDrive está configurado no Windows, o serviço detecta
automaticamente a pasta corporativa ou pessoal e usa `Pool Petiscos\Backups`.
Sem OneDrive, ele mantém uma cópia local. O instalador não solicita nem
armazena credenciais do OneDrive.

## Dependências para construir o instalador

Esses requisitos são apenas para o computador de desenvolvimento:

1. Windows x64;
2. Node.js compatível com o projeto e npm;
3. Python 3.10 ou superior;
4. Inno Setup 6;
5. para builds assinados, Windows SDK com SignTool e um certificado de
   assinatura de código com chave privada.

O computador da lanchonete não precisa desses itens separadamente.

## Ícone do aplicativo

O executável, o instalador e os atalhos usam
`installer/assets/pool-petiscos.ico`, gerado a partir da marca já existente em
`public/pool-logo-round.jpg`. O arquivo contém resoluções de 16 a 256 pixels e
transparência para a barra de tarefas do Windows.

Somente quando a marca de origem mudar, instale o Pillow no ambiente de
desenvolvimento e regenere o arquivo:

```powershell
python -m pip install Pillow
python .\scripts\generate-windows-icon.py
```

## Build de protótipo, explicitamente sem assinatura

Use somente para validação interna:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version 1.1.1 `
  -UnsignedPrototype
```

O script exige a opção `-UnsignedPrototype`; ele não produz silenciosamente um
executável que pareça assinado. A saída mostra um aviso claro e fica em:

```text
build\windows\installer\PoolPetiscos-Setup-1.1.1.exe
```

Cache e stage são mantidos fora de pastas sincronizadas para evitar bloqueios
do OneDrive durante o empacotamento:

```text
%LOCALAPPDATA%\PoolPetiscos\installer-build
```

Outro local pode ser informado com `-WorkDirectory`.

Para manter a árvore usada pelo Inno Setup e poder revisá-la:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version 1.1.1 `
  -UnsignedPrototype `
  -KeepStage
```

## Build final com assinatura Authenticode

O certificado deve estar em `Cert:\CurrentUser\My` ou
`Cert:\LocalMachine\My`, possuir chave privada e estar dentro da validade.

Exemplo com o repositório do usuário atual:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version 1.1.1 `
  -CertificateThumbprint '0123456789ABCDEF0123456789ABCDEF01234567' `
  -CertificateStoreLocation CurrentUser
```

Para um certificado instalado no repositório da máquina:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version 1.1.1 `
  -CertificateThumbprint '0123456789ABCDEF0123456789ABCDEF01234567' `
  -CertificateStoreLocation LocalMachine
```

O SignTool assina o launcher antes do staging. O Inno Setup usa o mesmo
certificado para assinar o desinstalador e o instalador final, com SHA-256 e
carimbo de tempo RFC 3161. Ao final, o pipeline executa `signtool verify`.
Thumbprints dos exemplos são fictícios e não funcionam; deve ser usado o
certificado real adquirido pela empresa responsável.

Um certificado de assinatura de código comum já reduz alertas, mas a reputação
do SmartScreen é construída ao longo do tempo. Certificados e chaves privadas
nunca devem ser adicionados ao Git.

## Verificação das dependências baixadas

As versões de Node e FFmpeg e seus SHA-256 ficam fixadas em
`installer/dependencies.lock.json`. O build baixa URLs oficiais e recusa
qualquer arquivo cujo hash não corresponda ao lock.

Uma atualização é sempre explícita:

```powershell
.\scripts\build-windows-installer.ps1 `
  -Version 1.1.1 `
  -UnsignedPrototype `
  -RefreshDependencyLock
```

O build também confere se a versão coincide com `package.json` e, por padrão,
recusa código-fonte com alterações ainda não registradas no Git. Assim, o
manifesto dentro do instalador identifica exatamente o commit distribuído.
Se a atualização do lock alterar hashes ou versões, revise e faça o commit do
arquivo; depois execute novamente o build normal, sem `-RefreshDependencyLock`.

Essa opção consulta:

- `latest-v22.x/SHASUMS256.txt` no domínio oficial do Node.js e confirma o
  checksum também no diretório versionado;
- o release mais recente de `yt-dlp/FFmpeg-Builds` pela API do GitHub e exige o
  digest SHA-256 publicado para o asset
  `ffmpeg-master-latest-win64-gpl-shared.zip`.

O lock alterado deve ser revisado e commitado junto com a atualização. Em builds
normais não existe atualização silenciosa de binários.

## Etapas automáticas do pipeline

1. valida as opções de assinatura antes de baixar ou compilar;
2. executa `npm ci`, salvo quando `-SkipNpmInstall` for informado;
3. executa `npm run check`, incluindo testes, lint, typecheck e build;
4. gera a saída standalone do vinext, sem copiar os 660 MB de dependências de
   desenvolvimento;
5. cria um ambiente Python isolado e empacota launcher e `yt-dlp`;
6. baixa e verifica Node e FFmpeg;
7. monta o stage com aplicativo, runtime necessário, manual, licenças e
   `BUILD-MANIFEST.json`;
8. testa o servidor standalone em uma porta loopback temporária;
9. executa o self-test e um smoke test completo do launcher, com banco e portas
   temporários isolados;
10. encerra os dois serviços do smoke test pelo mesmo evento usado pelo atalho
    de encerramento;
11. compila com Inno Setup e calcula o SHA-256 do instalador final.

## Instalação e operação na lanchonete

1. assinar o instalador final com o certificado da empresa responsável;
2. copiar o instalador para o computador do caixa;
3. executar com o usuário Windows que operará o sistema;
4. manter marcadas as opções de atalho e inicialização automática;
5. abrir o sistema pelo atalho “Pool Petiscos”;
6. confirmar que o navegador mostra `http://127.0.0.1:4173`;
7. configurar e testar o destino de backup no OneDrive;
8. usar um nobreak para computador, roteador e equipamentos de pagamento;
9. realizar uma restauração de teste antes de colocar o caixa em produção.

O item “Encerrar Pool Petiscos” no menu Iniciar envia um sinal ao launcher e
encerra os processos supervisionados. Durante uma atualização, feche o sistema
antes de executar o novo instalador.

## Licenças do FFmpeg e demais componentes

O build selecionado do FFmpeg é GPLv3. O stage inclui os textos de licença e
`THIRD_PARTY_NOTICES.txt`, mas a pessoa ou empresa que redistribuir o instalador
continua responsável por cumprir a GPL, incluindo disponibilizar o
código-fonte correspondente e os scripts utilizados pelo build quando isso for
exigido.

Antes de entregar o instalador fora do ambiente de protótipo, recomenda-se uma
revisão jurídica de redistribuição. Links de origem:

- https://github.com/yt-dlp/FFmpeg-Builds
- https://ffmpeg.org/download.html
- https://github.com/yt-dlp/yt-dlp
- https://nodejs.org/

O download de conteúdo pelo `yt-dlp` só deve ser usado para materiais próprios,
licenciados ou cuja origem permita download e reprodução comercial.

## Diagnóstico

Os principais arquivos são:

```text
%LOCALAPPDATA%\PoolPetiscos\logs\launcher.log
%LOCALAPPDATA%\PoolPetiscos\logs\site.log
%LOCALAPPDATA%\PoolPetiscos\logs\companion.log
```

Para um smoke test isolado, defina uma pasta temporária e portas alternativas:

```powershell
$env:POOL_PETISCOS_HOME_DIR = "$env:TEMP\PoolPetiscos-Smoke"
$env:POOL_PETISCOS_SITE_PORT = '14173'
$env:POOL_PETISCOS_COMPANION_PORT = '18765'
& "$env:LOCALAPPDATA\Programs\Pool Petiscos\PoolPetiscos.exe" --no-browser
```

`POOL_PETISCOS_HOME_DIR` representa a raiz isolada do aplicativo. O launcher
deriva `POOL_PETISCOS_DATA_DIR` como a subpasta `data` somente para o SQLite;
logs e músicas continuam nas subpastas irmãs `logs` e `musicas`.

Depois, encerre pelo atalho do menu Iniciar. Não use uma pasta real de produção
em testes automatizados.
