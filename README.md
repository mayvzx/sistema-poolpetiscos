# Pool Petiscos & Lanches — sistema de caixa

Aplicação local e revisável para vendas, estoque, caixa, financeiro e música
ambiente da **Pool Petiscos & Lanches**.

Esta versão é um protótipo operacional para validação com os proprietários.
Ela já funciona sem um servidor separado, mas ainda não emite documento fiscal
nem confirma pagamentos diretamente com banco ou maquininha.

## O que funciona

- vendas em Pix, dinheiro ou cartão, com cálculo de troco;
- cadastro, edição, exclusão, baixa e reposição de produtos no estoque;
- despesas, sangria, suprimento, abertura e fechamento de caixa;
- conferência entre saldo esperado e dinheiro contado;
- indicadores financeiros calculados a partir dos registros;
- notificações de estoque baixo;
- SQLite como armazenamento principal, com histórico de 50 revisões;
- recuperação de uma alteração pendente após fechamento inesperado;
- backup SQLite diário no OneDrive, com retenção de 30 dias;
- exportação e restauração manual de backup JSON;
- busca de músicas no YouTube, biblioteca local e download de uma faixa por
  link;
- instalador Windows com Node.js, yt-dlp e FFmpeg incluídos;
- atalho, inicialização automática com o Windows e atualização sem apagar os
  dados.

## Arquitetura local

```text
Navegador do caixa
  └─ Interface React em http://127.0.0.1:4173
       └─ Serviço local em http://127.0.0.1:8765
            ├─ SQLite
            ├─ backups diários
            └─ biblioteca de músicas
```

As duas portas aceitam apenas conexões do próprio computador. A internet é
necessária para baixar faixas, sincronizar o OneDrive e, futuramente, processar
pagamentos integrados. Vendas manuais e dados locais continuam disponíveis
sem internet.

## Estrutura do código

```text
app/
  layout.tsx                      Metadados e estrutura HTML
  page.tsx                        Entrada da aplicação
  globals.css                     Tipografia e acessibilidade
features/pool-petiscos/
  pool-petiscos-app.tsx           Interface e coordenação das telas
  demo-data.ts                    Dados usados na apresentação inicial
  domain.ts                       Regras de dinheiro, caixa e relatórios
  persistence.ts                  Validação do estado e backup JSON
  local-storage-companion.ts      Cliente da persistência SQLite
  music-companion.ts              Cliente da biblioteca de músicas
  types.ts                        Tipos do negócio
local_service/
  server.py                       API restrita ao computador
  youtube_search.py               Pesquisa segura no YouTube via yt-dlp
  storage.py                      SQLite, revisões e backups diários
  launcher.py                     Inicializador e supervisor dos serviços
  test_server.py                  Testes do serviço e do banco
  test_launcher.py                Testes dos modos normal e auto-início
  test_youtube_search.py          Testes isolados da busca de músicas
installer/
  PoolPetiscos.iss                Definição do instalador Inno Setup
  assets/pool-petiscos.ico        Ícone multirresolução do Windows
  dependencies.lock.json          URLs e hashes das dependências incluídas
  THIRD_PARTY_NOTICES.txt         Avisos de componentes redistribuídos
scripts/
  build-windows-installer.ps1     Geração reproduzível do instalador
  generate-windows-icon.py        Regenera o ícone usando a marca existente
  build.mjs                       Build da interface e do Sites
  validate-artifact.mjs           Validação do pacote publicado
tests/
  domain.test.ts                  Regras de negócio e backup
  rendered-html.test.mjs          Verificação da página gerada
docs/
  INSTALADOR-WINDOWS.md           Instalação, assinatura e suporte
  INSTALACAO-E-PAGAMENTOS.md      Arquitetura e futura integração de pagamento
  DECISOES-E-ROADMAP.md           Decisões e próximos marcos
  GUIA-DE-REVISAO.md              Roteiro para revisar o código
```

## Desenvolvimento

Requisitos para revisar a interface:

- Node.js 22;
- npm;
- Python 3.10 ou superior para os testes do serviço.

```powershell
npm ci
npm run dev
```

O endereço padrão de desenvolvimento é exibido no terminal. Para executar toda
a validação:

```powershell
npm run check
```

## Instalação no computador do caixa

O usuário final deve executar somente `PoolPetiscos-Setup-1.1.0.exe`. O
instalador prepara o aplicativo e oferece atalhos; Node.js, Python, yt-dlp e
FFmpeg não precisam ser instalados separadamente.

Os dados ficam fora da pasta do programa e são preservados em atualizações:

```text
%LOCALAPPDATA%\PoolPetiscos\data\pool-petiscos.db
%LOCALAPPDATA%\PoolPetiscos\musicas
%LOCALAPPDATA%\PoolPetiscos\logs
```

Quando o OneDrive está configurado, o backup diário fica em:

```text
OneDrive\Pool Petiscos\Backups
```

Sem OneDrive, o sistema usa `%LOCALAPPDATA%\PoolPetiscos\backups`.

As instruções de geração, assinatura, instalação silenciosa e diagnóstico estão
em [docs/INSTALADOR-WINDOWS.md](docs/INSTALADOR-WINDOWS.md).

## Pagamentos integrados

As vendas atuais registram a forma escolhida pelo operador, sem controlar a
maquininha. A integração real depende da marca/modelo do terminal, instituição
do Pix, credenciais e processo de homologação. Nenhuma aprovação deve ser
simulada: a venda só poderá ser concluída depois da confirmação do provedor.

As decisões necessárias e os fluxos sugeridos estão em
[docs/INSTALACAO-E-PAGAMENTOS.md](docs/INSTALACAO-E-PAGAMENTOS.md).

## Publicação

`.openai/hosting.json` vincula este código ao projeto existente no Sites. A
versão hospedada serve para apresentação e revisão; sem o serviço instalado no
computador, ela usa uma cópia local do navegador e não disponibiliza SQLite nem
downloads.
