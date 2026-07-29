# Manual do operador — Pool Petiscos

## Abrir o caixa

Use o atalho **Pool Petiscos** na área de trabalho ou no menu Iniciar. O
navegador abre quando o sistema estiver pronto. Não é necessário abrir terminal
ou executar scripts.

Se o Windows acabou de iniciar, aguarde alguns segundos. O Pool Petiscos inicia
automaticamente quando essa opção permanece marcada no instalador.

## Registrar uma venda

1. Abra **Nova venda**.
2. Escolha os produtos e confira as quantidades.
3. Informe o nome da pessoa que fez o pedido.
4. Selecione Pix, dinheiro ou cartão.
5. Em dinheiro, informe o valor recebido e confira o **Troco**.
6. Selecione **Finalizar e criar comanda**.

Pix e cartão são registrados como forma de pagamento, mas ainda precisam ser
confirmados na maquininha. O sistema não deve considerar uma transação aprovada
automaticamente até a integração com o provedor ser contratada e homologada.

## Acompanhar as comandas

1. Abra **Comandas** no menu principal.
2. As novas vendas aparecem em **Aguardando**, na ordem em que chegaram.
3. Ao começar o lanche, selecione **Iniciar preparo**.
4. Ao terminar, selecione **Marcar como pronto**.
5. Depois de entregar ao cliente, selecione **Marcar como entregue**.

As comandas entregues saem da fila principal, mas continuam disponíveis na aba
**Concluídas**. Se uma etapa for marcada por engano, use **Voltar** ou
**Reabrir**. A situação da comanda não altera novamente o estoque nem o valor
registrado no financeiro.

## Cuidar do estoque

Em **Estoque** é possível:

- cadastrar um produto;
- alterar nome, categoria, preço, estoque atual e estoque mínimo;
- repor unidades;
- excluir um produto que saiu do cardápio.

Excluir um produto não altera vendas antigas. O histórico preserva o nome e o
preço usados no momento da venda.

## Abrir, movimentar e fechar o caixa

Em **Financeiro**:

- abra o caixa com o fundo inicial;
- registre despesas, sangrias e suprimentos;
- confira entradas, saídas e saldo esperado;
- ao fechar, informe o dinheiro contado e confira a diferença.

## Usar músicas

Em **Músicas**, pesquise pelo nome ou cole um link do YouTube. Escolha um dos
resultados e confirme o download apenas quando a lanchonete tiver autorização
para usar a faixa. yt-dlp e FFmpeg já acompanham o instalador.

## Proteger os dados

Em **Financeiro > Proteção dos dados**:

- **Exportar backup** cria um arquivo para restauração;
- **Baixar banco completo** cria uma cópia para auditoria;
- **Restaurar backup** substitui o estado atual depois de validação e confirmação.

O menu Iniciar oferece **Pool Petiscos > Dados e backups** para abrir a pasta
local. Não altere o arquivo principal do banco manualmente.

## Encerrar e atualizar

Fechar a aba do navegador não encerra os serviços. Use **Encerrar Pool
Petiscos** no menu Iniciar antes de manutenção técnica.

Uma versão nova pode ser instalada por cima da anterior. Os dados ficam em uma
pasta separada e são preservados.

## Se algo não abrir

1. aguarde dez segundos e use novamente o atalho;
2. verifique se o navegador não abriu uma nova aba;
3. use **Encerrar Pool Petiscos** e abra o sistema outra vez;
4. anote o horário do problema para o suporte localizar o registro em
   `%LOCALAPPDATA%\PoolPetiscos\logs`.
