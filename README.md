# Pool Petiscos & Lanches — sistema de caixa

Protótipo funcional e revisável do caixa da **Pool Petiscos & Lanches**. O site
reúne vendas, estoque, fluxo de dinheiro, backup local e música ambiente para
validar o uso antes da futura versão instalada no Windows.

> O projeto continua em modo demonstração. Ele não substitui emissão fiscal,
> contabilidade nem um banco de dados transacional.

## O que já funciona

- registro de vendas em Pix, dinheiro ou cartão;
- cálculo de troco e baixa automática do estoque;
- reposição de produtos com custo opcional;
- despesas, sangria, suprimento, abertura e fechamento de caixa;
- conferência entre saldo esperado e dinheiro contado;
- resumo financeiro calculado apenas com registros reais;
- backup JSON validado antes da restauração;
- sincronização básica quando outra aba altera os dados;
- central de notificações com detalhes de estoque baixo;
- importação temporária de áudios locais;
- biblioteca persistente por companion local com `yt-dlp` e FFmpeg;
- navegação responsiva, por teclado e com histórico no endereço.

## Estrutura do código

```text
app/
  layout.tsx                 Metadados e estrutura HTML
  page.tsx                   Entrada enxuta da página
  globals.css                Estilos globais e acessibilidade
config/
  sites-vite-plugin.ts       Empacotamento para o Sites
features/pool-petiscos/
  pool-petiscos-app.tsx      Interface e coordenação das telas
  demo-data.ts               Catálogo e registros da demonstração
  domain.ts                  Dinheiro, horário, caixa e gráficos
  music-companion.ts         Cliente do serviço local de músicas
  persistence.ts             Validação do estado e dos backups
  types.ts                   Tipos do negócio
local_service/
  server.py                  API local, biblioteca e integração yt-dlp
  test_server.py             Regras de segurança do companion
  requirements.txt           Versão validada do yt-dlp
public/
  pool-logo-banner.jpg       Marca horizontal
  pool-logo-round.jpg        Marca redonda e ícone
scripts/
  build.mjs                  Build multiplataforma
  install-local.ps1          Prepara o computador do caixa
  start-local.ps1            Inicia site e companion local
  stop-local.ps1             Encerra os serviços locais
  validate-artifact.mjs      Validação do pacote publicado
tests/
  domain.test.ts             Regras de negócio e backup
  rendered-html.test.mjs     Teste da página gerada
docs/
  DECISOES-E-ROADMAP.md      Decisões e próximos marcos
  GUIA-DE-REVISAO.md         Roteiro para revisar o código
  INSTALACAO-E-PAGAMENTOS.md Instalação, Pix e maquininhas
```

## Rodar no Windows

Requisitos:

- Node.js 22.13 ou superior;
- npm.

No PowerShell, dentro desta pasta:

```powershell
npm ci
npm run dev
```

O terminal mostrará o endereço local. Para validar tudo:

```powershell
npm run check
```

Também é possível executar separadamente:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Onde os dados ficam

Nesta demonstração, os dados ficam no armazenamento local do navegador. O
backup exportado contém vendas, produtos, despesas e sessões de caixa; antes de
restaurá-lo, o sistema valida toda a estrutura e baixa uma cópia de segurança
dos dados atuais.

Para testes que imitam a operação da lanchonete, mantenha apenas uma aba aberta.
A sincronização entre abas reduz sobrescritas acidentais, mas o armazenamento do
navegador não oferece as garantias transacionais da futura versão com SQLite.

Os áudios importados manualmente não entram no backup e são removidos ao fechar
a página. As faixas obtidas pelo companion ficam na biblioteca do perfil do
Windows.

## Instalação no computador do caixa

Para preparar a versão piloto local:

```powershell
.\scripts\install-local.ps1
.\scripts\start-local.ps1
```

O serviço de músicas depende de FFmpeg instalado no Windows. A arquitetura
recomendada para a versão definitiva, incluindo SQLite, backups e integração
com maquininha/Pix, está em
[docs/INSTALACAO-E-PAGAMENTOS.md](docs/INSTALACAO-E-PAGAMENTOS.md).

## Publicação e acesso

O arquivo `.openai/hosting.json` mantém o vínculo com o projeto existente no
Sites. O controle de acesso da versão publicada é gerenciado pelo próprio Sites;
não há senhas ou tokens gravados neste repositório.

As decisões confirmadas e as limitações que ainda precisam de validação
presencial estão em [docs/DECISOES-E-ROADMAP.md](docs/DECISOES-E-ROADMAP.md).
