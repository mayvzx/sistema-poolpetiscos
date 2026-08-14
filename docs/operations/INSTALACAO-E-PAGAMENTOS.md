# Instalação local e integração de pagamentos

## Arquitetura escolhida para a lanchonete

O computador do caixa pode executar todo o sistema sem um servidor separado.
A versão local tem três camadas no mesmo Windows:

1. interface do caixa em `http://127.0.0.1:14173`;
2. serviço local em `http://127.0.0.1:18765`;
3. SQLite e biblioteca de músicas no perfil do usuário.

Os serviços escutam apenas no próprio computador. Outros equipamentos da rede
não conseguem acessar essas portas.

O instalador inclui a interface, Node.js, o serviço local, `yt-dlp` e FFmpeg.
O computador da lanchonete não precisa ter ferramentas de desenvolvimento.
Banco, faixas e logs permanecem fora da instalação:

```text
%LOCALAPPDATA%\PoolPetiscos\data\pool-petiscos.db
%LOCALAPPDATA%\PoolPetiscos\musicas
%LOCALAPPDATA%\PoolPetiscos\logs
```

Cada gravação no SQLite é transacional e as últimas 50 revisões são mantidas.
Uma cópia íntegra do banco é criada todos os dias no OneDrive; sem OneDrive, o
sistema usa uma pasta de backup local. Atualizações do programa não removem os
dados.

Para a instalação física, também é recomendado:

- nobreak para computador, roteador e equipamento de pagamento;
- OneDrive configurado e sincronizando antes do primeiro uso;
- restauração de teste antes da operação oficial;
- uso assistido em paralelo ao processo atual nos primeiros dias.

A internet é necessária para baixar faixas, sincronizar o backup em nuvem e
processar futuros pagamentos integrados. O registro local continua disponível
sem conexão. Consulte `docs/operations/INSTALADOR-WINDOWS.md` para build, assinatura,
instalação e diagnóstico.

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

### Situação atual — maquininha Getnet

A foto recebida mostra um terminal Getnet tradicional, com teclado físico e
bobina. Ela não mostra a etiqueta traseira, então ainda não permite confirmar o
modelo nem se o contrato possui TEF. Para esse tipo de equipamento, o caminho
mais provável é a **Solução TEF Getnet**, contratada para integrar a automação
comercial ao sistema de frente de caixa.

Isso é diferente do Get Smart: nos terminais Android Get Smart, a Getnet exige
aplicativo compatível com seus SDKs, submissão na Get Store e certificação. Não
devemos escolher esse caminho sem confirmar que o terminal é realmente um Get
Smart.

Documentação oficial:

- https://site.getnet.com.br/tef/solucao-tef/
- https://getstore.getnet.com.br/docs/
- https://getstore.getnet.com.br/docs/iniciando-integracao/requisitos-desenvolvimento/

Enquanto o modelo e o contrato não forem confirmados, Pix e cartão continuam
com confirmação manual na maquininha. O sistema não exibirá QR Code fictício
nem marcará uma venda como aprovada por uma integração inexistente.

### Mudança prevista para janeiro de 2027 — Mercado Pago Point

A API Point permite enviar uma `order` do caixa para um terminal Point, receber
cartão, QR Code ou Pix e consultar o resultado para conciliação automática. A
documentação atual lista terminais Point Smart e Point Pro compatíveis.

É a opção recomendada para a troca planejada para janeiro de 2027, desde que a
Pool escolha um modelo Point Smart ou Point Pro listado como compatível. Exige
conta Mercado Pago, aplicação cadastrada, credenciais de produção e internet. O
token deve ficar no serviço local, nunca no navegador.

Documentação oficial:

- https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview
- https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/overview
- https://www.mercadopago.com.br/developers/pt/docs/qr-code/overview

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

Registrar antes da integração Getnet:

- foto legível da etiqueta traseira com o modelo exato;
- confirmação com a Getnet de que o contrato possui ou aceita TEF;
- instituição onde a Pool recebe o Pix;
- CNPJ/MEI titular da conta;
- necessidade de débito, crédito, parcelamento e vale-alimentação;
- comportamento desejado quando a internet cair;
- impressora e formato do comprovante.

Com esses dados, deve ser implementado apenas um adaptador de pagamento por
vez. Para a mudança de 2027, a recomendação é validar antecipadamente um
terminal Mercado Pago Point compatível, Pix dinâmico, notificações de status e
uma conta de teste antes de liberar transações reais.
