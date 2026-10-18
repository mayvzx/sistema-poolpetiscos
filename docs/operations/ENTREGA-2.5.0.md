# Entrega da versão 2.5.0

## O que mudou

- **Pagamento dividido:** uma venda pode ser paga em até quatro formas (por
  exemplo, parte em dinheiro e parte no Pix). A última forma recebe o restante
  sozinha, o acréscimo do cartão vale só para a parte do cartão e o troco é
  calculado só sobre a parte em dinheiro. Exemplo: pedido de R$ 30 com R$ 20 em
  dinheiro e o restante no crédito cobra R$ 10,60 na maquininha, total
  R$ 30,60.
- **Cancelamento de venda:** só vendas do caixa aberto, com motivo, operador e
  horário gravados. A venda fica no histórico como cancelada, sai de todos os
  totais e não pode ser cancelada duas vezes. Os itens só voltam ao estoque se
  o operador marcar essa opção. O sistema não devolve dinheiro: Pix e cartão
  são estornados manualmente.
- **Conferência de Pix e cartão:** no fechamento, é possível informar o total
  do extrato do Pix e da maquininha e ver a diferença de cada forma. É uma
  conferência manual; o sistema não consulta banco nem maquininha.
- **Limpeza interna:** formas de pagamento e regras de totais passaram a ter
  uma única definição, usada pela tela, relatórios e serviço local.

Nada do histórico é reescrito. Vendas e fechamentos anteriores continuam
válidos e aparecem como antes.

## Antes de instalar na lanchonete

1. Instale com o atendimento encerrado e o caixa **fechado**.
2. Confira a versão instalada hoje em **Configurações do Windows >
   Aplicativos > Aplicativos instalados > Pool Petiscos** (a partir da 2.1.0
   ela também aparece em **Configurações > Atualizações do aplicativo**). O
   último registro é a 1.5.2, mas precisa ser confirmado nessa tela.
3. Em **Financeiro > Proteção dos dados**, use **Exportar backup** e guarde o
   arquivo num pendrive ou no Google Drive. O instalador também copia o banco para
   `%LOCALAPPDATA%\PoolPetiscos\update-backups`, mas a cópia externa é a sua
   garantia.

## Instalação

1. Execute `PoolPetiscos-Setup-2.5.0.exe` por cima da versão atual.
2. Se o Windows mostrar o aviso do SmartScreen (instalador sem assinatura
   digital), escolha **Mais informações > Executar assim mesmo**.
3. Abra o Pool Petiscos pelo atalho e entre com o PIN de sempre.

O banco, PINs, músicas, configurações, Google Drive e backups ficam em
`%LOCALAPPDATA%\PoolPetiscos` e não são tocados pela atualização.

## Conferência rápida depois de instalar

Faça com um produto barato e cancele no final, para não deixar venda de teste
no caixa do dia:

1. Abra o caixa normalmente.
2. Registre uma venda de teste com **Dividir pagamento**: parte em dinheiro,
   restante no Pix. Confira o troco e o valor de cada parte.
3. Em **Comandas**, toque em **Cancelar** nessa venda, escolha
   **Lançado errado** e marque **Os itens voltaram ao estoque**. Confira que o
   estoque voltou, que o painel não somou a venda e que o botão **Cancelar**
   não aparece mais nela.
4. Confira em **Financeiro** que as vendas antigas do dia anterior continuam
   aparecendo.
5. Em **Configurações > Backups automáticos**, execute uma cópia agora e
   confira se ela aparece em **Backups do Google Drive**. O instalador mantém a
   configuração do Drive, mas só esse teste prova que a autorização da
   lanchonete continua válida.
6. No primeiro fechamento real, preencha o bloco **Conferir Pix e cartão** com
   o extrato e a maquininha, se quiser testar a conferência.

## Se algo der errado

- O instalador interrompe a atualização se não conseguir copiar o banco.
- Para voltar ao estado de antes, use **Restaurar backup** com o arquivo
  exportado no passo 3 de "Antes de instalar", ou reinstale a versão anterior: os dados continuam na
  mesma pasta.
- Os registros de diagnóstico ficam em `%LOCALAPPDATA%\PoolPetiscos\logs`.

## Validação realizada

- atualização sobre base antiga: uma base gravada pelo código da 1.5.2 foi
  aberta pela 2.5.0, recebeu uma venda dividida e um cancelamento, foi
  exportada e restaurada numa base nova com o estado idêntico; um backup
  `.json` exportado pela 1.5.2 também é aceito;
- 71 testes de regras de negócio da tela (vendas, pagamento dividido,
  cancelamento, fechamento, fluxo de caixa, pedidos online) e 29 testes do
  serviço local e do banco SQLite;
- typecheck, lint e build de produção;
- pagamento dividido testado pelo responsável técnico em uma cópia local com
  dados de teste;
- CI no Windows a cada envio ao GitHub.

O que não muda: o sistema continua funcionando sem internet, não emite
documento fiscal e não confirma Pix ou cartão automaticamente.
