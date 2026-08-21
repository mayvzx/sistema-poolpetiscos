<p align="center">
  <img src="public/pool-logo-banner.jpg" alt="Pool Petiscos & Lanches" width="520">
</p>

<h1 align="center">Pool Petiscos — Caixa local</h1>

<p align="center">
  Vendas, estoque, financeiro e música em um sistema Windows pensado para a
  rotina real da lanchonete.
</p>

<p align="center">
  <img alt="Versão" src="https://img.shields.io/badge/vers%C3%A3o-1.6.2-d9202c">
  <img alt="Plataforma Windows" src="https://img.shields.io/badge/plataforma-Windows-302b29">
  <img alt="Banco SQLite" src="https://img.shields.io/badge/dados-SQLite-7458b4">
  <img alt="Status protótipo operacional" src="https://img.shields.io/badge/status-prot%C3%B3tipo%20operacional-dc9b19">
</p>

![Visão do produto](public/og.png)

## Sobre

O Pool Petiscos funciona no próprio computador do caixa, sem exigir a compra de
um servidor. O instalador inclui a interface React, o serviço local, SQLite,
Node.js, yt-dlp e FFmpeg. As vendas continuam disponíveis sem internet; a rede
é usada para músicas, sincronização do Google Drive e futuras integrações de
pagamento.

Esta versão é um protótipo operacional para validação com os proprietários. Ela
não emite documento fiscal e ainda não confirma Pix ou cartão diretamente com
banco ou maquininha.

## Funcionalidades

- vendas em Pix, dinheiro, débito ou crédito, com troco em destaque;
- acesso de Elaine e Poolblay, com totais de vendas separados por operador;
- PIN individual protegido, chave de recuperação e redefinição segura;
- tamanho das letras ajustável e temas automático, claro e escuro;
- abertura, movimentação, conferência e fechamento de caixa;
- cadastro, alteração, exclusão, reposição e alerta de estoque;
- comandas em **Aguardando**, **Em preparo**, **Pronto** e histórico;
- observações por item, como **sem cebola** ou **sem tomate**;
- histórico de vendas preservado quando um produto muda;
- despesas e indicadores financeiros calculados dos registros;
- fluxo de caixa visível por dia, mês ou período, exportável em Excel e PDF;
- SQLite com controle de revisão e consultas legíveis para auditoria;
- cópia completa do banco e backup de restauração pela interface;
- backups SQLite diários, semanais e mensais, com restauração validada;
- conexão opcional com Google Drive usando acesso somente aos arquivos criados
  pelo Pool Petiscos;
- busca de músicas no YouTube com até cinco resultados;
- downloads locais com yt-dlp e conversão/reprodução com FFmpeg;
- inicialização automática, ícone próprio e atualização com backup obrigatório
  do banco antes da troca de arquivos;
- tipografia ampliada, alvos de toque e animações suaves.

## Instalar no Windows

Baixe o instalador mais recente em
[Releases](https://github.com/mayvzx/sistema-poolpetiscos/releases/latest). O
usuário final executa apenas `PoolPetiscos-Setup-1.6.2.exe`; as dependências já
estão incluídas.

> O protótipo atual ainda não possui assinatura Authenticode. O Windows pode
> exibir um aviso de origem desconhecida. A assinatura será adicionada antes da
> implantação definitiva.

Os dados ficam separados do programa e são preservados nas atualizações:

```text
%LOCALAPPDATA%\PoolPetiscos\data\pool-petiscos.db
%LOCALAPPDATA%\PoolPetiscos\musicas
%LOCALAPPDATA%\PoolPetiscos\logs
%LOCALAPPDATA%\PoolPetiscos\update-backups
```

Na desinstalação, o assistente pergunta se esses dados também devem ser
apagados. A opção padrão os preserva; para uma máquina usada somente em teste,
selecione a remoção completa.

O manual completo está em
[docs/operations/MANUAL-DO-OPERADOR.md](docs/operations/MANUAL-DO-OPERADOR.md).

## Acessar o banco de dados

No aplicativo, abra **Financeiro > Proteção dos dados > Baixar banco completo**.
O menu Iniciar também oferece **Pool Petiscos > Dados e backups**.

Para uma inspeção somente leitura pelo projeto:

```powershell
npm run database:inspect
npm run database:inspect -- --view produtos
```

Localização, consultas disponíveis e cuidados estão documentados em
[docs/architecture/BANCO-DE-DADOS.md](docs/architecture/BANCO-DE-DADOS.md).

## Arquitetura

```text
PoolPetiscos.exe
  ├─ Interface React          http://127.0.0.1:14173
  └─ Serviço local Python     http://127.0.0.1:18765
       ├─ SQLite e revisões
       ├─ backups verificados
       └─ yt-dlp + FFmpeg + biblioteca local
```

As portas aceitam apenas conexões da interface executada no próprio computador.
A demonstração pública não acessa o serviço, o banco ou as músicas instaladas.

Leia [docs/architecture/ARQUITETURA.md](docs/architecture/ARQUITETURA.md) para o
fluxo completo e [docs/README.md](docs/README.md) para o índice da documentação.

## Desenvolvimento

Requisitos: Node.js 22, npm e Python 3.10 ou superior.

```powershell
npm ci
npm run dev
npm run check
```

O código está organizado por fronteira:

```text
app/                        entrada web e estilos
features/pool-petiscos/     interface e regras do negócio
local_service/              API, SQLite, músicas e launcher
installer/                  instalador e ativos do Windows
scripts/                    build e ferramentas de manutenção
tests/                      validações da aplicação
docs/                       produto, arquitetura e operação
```

Consulte o
[guia de desenvolvimento](docs/development/DESENVOLVIMENTO.md), o
[guia de revisão](docs/development/GUIA-DE-REVISAO.md) e o
[histórico de versões](CHANGELOG.md).

## Demonstração

A versão web para apresentação está em
[pool-petiscos-caixa.mayrom.chatgpt.site](https://pool-petiscos-caixa.mayrom.chatgpt.site).
Sem o aplicativo local, ela usa somente o armazenamento do navegador e não
oferece SQLite ou download de músicas.

## Segurança e dados reais

Banco, backups, logs e credenciais nunca devem ser enviados ao repositório
público. Consulte [SECURITY.md](SECURITY.md) antes de compartilhar um
diagnóstico.

## Licenciamento

O código está publicamente visível para avaliação, mas não possui licença de
uso, cópia ou redistribuição. Consulte [LICENSE.md](LICENSE.md).
