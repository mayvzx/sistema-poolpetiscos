# Instalação local e integração de pagamentos

## Recomendação para a lanchonete

O computador do caixa pode executar todo o sistema sem um servidor separado.
O desenho recomendado tem três camadas no mesmo Windows:

1. interface do caixa em `http://127.0.0.1:4173`;
2. companion local em `http://127.0.0.1:8765`;
3. armazenamento local durável.

Os serviços escutam apenas no próprio computador. Outros equipamentos da rede
não conseguem acessar essas portas.

### Piloto atual

A versão atual já pode ser usada para treinamento e validação operacional:

```powershell
.\scripts\install-local.ps1
.\scripts\start-local.ps1
```

Para encerrar:

```powershell
.\scripts\stop-local.ps1
```

O instalador prepara o site, cria um ambiente Python isolado e instala o
`yt-dlp`. O FFmpeg também precisa estar instalado e disponível no `PATH` do
Windows.

O ambiente Python e as faixas ficam fora da pasta sincronizada pelo OneDrive:

```text
%LOCALAPPDATA%\PoolPetiscos\venv
%LOCALAPPDATA%\PoolPetiscos\musicas
```

O projeto usa uma faixa por solicitação e não importa playlists inteiras
automaticamente. Só devem ser baixados materiais próprios, licenciados ou cuja
fonte autorize expressamente o download e a reprodução comercial.

### Versão recomendada para operação real

Antes de depender do sistema para o caixa diário, o próximo marco deve trocar o
`localStorage` por SQLite. A melhor entrega final é um instalador Windows
assinado, com:

- aplicativo desktop usando a interface React existente;
- SQLite com transações e histórico de sessões de caixa;
- companion de músicas e pagamentos executado em segundo plano;
- backup diário automático para uma pasta sincronizada pelo OneDrive;
- restauração testada e registro de auditoria;
- atualização controlada, sem apagar a base local;
- atalho no menu Iniciar e abertura automática com o Windows;
- nobreak para computador, roteador e maquininha.

Essa arquitetura não exige servidor físico. O próprio computador é o host
local. Internet continua necessária para publicar atualizações, usar `yt-dlp`
em fontes online e processar pagamentos integrados.

## É possível integrar uma maquininha?

Sim. O sistema não deve simular aprovação: ele precisa criar uma solicitação de
pagamento no provedor, aguardar o retorno aprovado e só então finalizar a venda
e baixar o estoque.

Fluxo recomendado:

```text
Comanda → aguardando pagamento → ordem enviada
        → aprovada  → registra venda e baixa estoque
        → recusada  → mantém comanda aberta
        → cancelada → permite escolher outra forma
```

O número do cartão, senha e demais dados sensíveis devem permanecer sempre na
maquininha. O sistema armazena somente identificadores, bandeira, forma, valor,
status e comprovante retornados pelo provedor.

### Opção 1 — Mercado Pago Point

A API Point permite enviar uma `order` do caixa para um terminal Point, receber
cartão, QR Code ou Pix e consultar o resultado para conciliação automática. A
documentação atual lista terminais Point Smart e Point Pro compatíveis.

É uma boa escolha quando a lanchonete ainda pode escolher ou trocar a
maquininha. Exige conta Mercado Pago, aplicação cadastrada, credenciais de
produção e internet. O token deve ficar no serviço local, nunca no navegador.

Documentação oficial:

- https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview
- https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/overview

### Opção 2 — PagBank PlugPag

O PlugPag integra automação Windows ao terminal PagBank por Bluetooth. O caixa
envia valor, crédito/débito, parcelamento e código da venda; a maquininha
processa a transação usando sua própria conexão com o PagBank.

É uma opção direta quando o estabelecimento já usa uma Moderninha compatível.
A documentação informa que não existe ambiente simulado para PlugPag: a
homologação depende do terminal e do relacionamento comercial.

Documentação oficial:

- https://developer.pagbank.com.br/docs/plugpag
- https://developer.pagbank.com.br/docs/estrutura-da-aplicacao

### Pix sem depender da maquininha

Também é possível gerar uma cobrança Pix dinâmica pela API Pix do banco ou de
um provedor de pagamento:

1. o serviço local cria a cobrança com valor e `txid` exclusivos;
2. o caixa mostra o QR Code e o código Pix Copia e Cola;
3. o serviço consulta o status ou recebe uma notificação;
4. a venda só é confirmada quando a cobrança estiver liquidada.

O Banco Central esclarece que a API Pix permite gerar QR Code e automatizar a
conciliação, mas a disponibilidade dos recursos dinâmicos depende da
instituição escolhida.

Documentação oficial:

- https://www.bcb.gov.br/estabilidadefinanceira/pix-cobranca
- https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf

## Decisão necessária antes da integração

Registrar:

- marca e modelo exatos da maquininha;
- instituição onde a Pool recebe o Pix;
- CNPJ/MEI titular da conta;
- necessidade de débito, crédito, parcelamento e vale-alimentação;
- comportamento desejado quando a internet cair;
- impressora e formato do comprovante.

Com esses dados, deve ser implementado apenas um adaptador de pagamento
inicial. A recomendação é começar com Pix dinâmico e uma maquininha em modo de
teste/homologação, antes de liberar transações reais.
