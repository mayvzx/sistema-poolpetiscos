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

## Proteção dos dados

A atualização não pode apagar nem alterar nenhum dado. O que garante isso:

- o instalador substitui só os arquivos do programa, em
  `%LOCALAPPDATA%\Programs\Pool Petiscos`; os dados ficam em outra pasta,
  `%LOCALAPPDATA%\PoolPetiscos`, que ele não apaga;
- antes de trocar qualquer arquivo, ele copia o banco para `update-backups` e
  compara o SHA-256 da cópia com o original; se não bater, para sem instalar;
- ao abrir uma base antiga, a 2.5.0 não muda nenhum valor gravado: só
  acrescenta campos novos quando algo for registrado (testado sobre uma base da
  1.5.2; abrir o sistema até a tela de PIN não grava nada);
- se a 2.5.0 encontrar dados que não consegue ler, ela mostra **Os dados não
  foram abertos** e não grava nada: não usa a cópia do navegador nem cria um
  caixa vazio. Nesse caso, feche o sistema e chame o suporte;
- **nunca desinstale antes**: o desinstalador é o único caminho que pode apagar
  dados (e só se alguém confirmar). Instale a 2.5.0 direto por cima.

## Antes de instalar na lanchonete

1. Instale com o atendimento encerrado e o caixa **fechado**.
2. Confira a versão instalada hoje em **Configurações do Windows >
   Aplicativos > Aplicativos instalados > Pool Petiscos** (a partir da 2.1.0
   ela também aparece em **Configurações > Atualizações do aplicativo**). O
   último registro é a 1.5.2, mas precisa ser confirmado nessa tela.
3. Em **Financeiro > Proteção dos dados**, use **Exportar backup** e guarde o
   arquivo num pendrive.
4. Feche o sistema em **Menu Iniciar > Pool Petiscos > Encerrar Pool Petiscos**
   e copie a pasta `%LOCALAPPDATA%\PoolPetiscos` inteira para o pendrive. Essa
   cópia não depende de nenhum programa e é a garantia final.

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
- Se aparecer **Os dados não foram abertos**, não tente de novo nem
  desinstale: os dados não foram tocados. Chame o suporte.
- Para voltar à versão anterior, feche o sistema, devolva a pasta
  `%LOCALAPPDATA%\PoolPetiscos` copiada no passo 4 e reinstale o instalador
  antigo. Vendas feitas na 2.5.0 depois da instalação não existem nessa cópia,
  e uma venda dividida ou com débito/crédito não é lida pela 1.5.2.
- Os registros de diagnóstico ficam em `%LOCALAPPDATA%\PoolPetiscos\logs`.

## Validação realizada

- proteção contra dado ilegível: com uma base que a 2.5.0 não reconhece, o
  sistema mostra o aviso e o banco fica idêntico (mesma revisão e mesmo
  SHA-256), sem cópia do navegador nem caixa vazio;
- atualização sobre base antiga: uma base gravada pelo código da 1.5.2 foi
  aberta pela 2.5.0, recebeu uma venda dividida e um cancelamento, foi
  exportada e restaurada numa base nova com o estado idêntico; um backup
  `.json` exportado pela 1.5.2 também é aceito;
- 72 testes de regras de negócio da tela (vendas, pagamento dividido,
  cancelamento, fechamento, fluxo de caixa, pedidos online) e 30 testes do
  serviço local e do banco SQLite;
- typecheck, lint e build de produção;
- pagamento dividido testado pelo responsável técnico em uma cópia local com
  dados de teste;
- CI no Windows a cada envio ao GitHub.

O que não muda: o sistema continua funcionando sem internet, não emite
documento fiscal e não confirma Pix ou cartão automaticamente.
