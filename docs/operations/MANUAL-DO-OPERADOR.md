# Manual do operador — Pool Petiscos

## Abrir o caixa

Use o atalho **Pool Petiscos** na área de trabalho ou no menu Iniciar. O
navegador abre quando o sistema estiver pronto. Não é necessário abrir terminal
ou executar scripts.

Se o Windows acabou de iniciar, aguarde alguns segundos. O Pool Petiscos inicia
automaticamente quando essa opção permanece marcada no instalador.

## Entrar no seu perfil

Ao abrir o sistema, escolha **Elaine** ou **Poolblay (Pool)**. No primeiro
acesso de cada perfil, crie e repita um PIN de 6 números. Nos acessos seguintes,
informe esse PIN para entrar. Todas as vendas feitas depois disso serão somadas
ao perfil escolhido. Para trocar, use o nome do operador no topo ou no final do
menu lateral.

Se houver uma comanda sendo montada, finalize-a antes de trocar de operador.
Em **Financeiro > Vendas por login**, Elaine e Pool podem conferir quantas
vendas e qual valor cada perfil registrou no dia.

### Escolher um bom PIN

- use 6 números que não sejam uma data de nascimento nem o final do telefone;
- evite sequências e repetições, como `123456`, `654321` ou `121212`;
- Elaine e Pool devem usar PINs diferentes;
- não compartilhe o PIN nem o deixe anotado perto do caixa.

Para trocar seu PIN, entre no próprio perfil e abra **Configurações > PIN**.
Informe o PIN atual, o novo PIN e a confirmação. O sistema guarda apenas um
verificador protegido, nunca o PIN em texto legível.

### Se esquecer o PIN

No primeiro acesso após esta atualização, o sistema mostra uma **chave de
recuperação** no formato `XXXX-XXXX-XXXX-XXXX`. Baixe o arquivo e guarde-o fora
do computador do caixa. A chave aparece somente nesse momento; o sistema salva
apenas um verificador protegido.

1. Na tela de entrada, escolha o perfil e selecione **Esqueci meu PIN**.
2. Digite a chave de recuperação.
3. Crie e confirme um novo PIN de 6 números.

Em **Configurações > Chave de recuperação**, um operador que conheça o próprio
PIN pode gerar uma nova chave. A chave anterior deixa de funcionar.

## Ajustar letras e aparência

Abra **Configurações** para adaptar a tela sem reiniciar o sistema:

- em **Tamanho das letras**, use o controle de 90% a 135% ou os botões de
  diminuir, restaurar 100% e aumentar;
- em **Aparência**, escolha **Automático**, **Claro** ou **Escuro**;
- **Automático** acompanha o tema claro/escuro configurado no Windows e muda em
  tempo real quando o tema do computador mudar.

Essas preferências ficam salvas neste computador e não alteram o tamanho das
letras em outros dispositivos.

## Registrar uma venda

1. Abra **Nova venda**.
2. Escolha os produtos e confira as quantidades.
3. Se necessário, escreva uma observação abaixo do item, como **sem cebola** ou
   **sem tomate**.
4. Informe o nome da pessoa que fez o pedido.
5. Selecione Pix, dinheiro, débito ou crédito.
6. Em dinheiro, informe o valor recebido e confira o **Troco**.
7. Selecione **Finalizar e criar comanda**.

Pix, débito e crédito são registrados como forma de pagamento, mas ainda precisam ser
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
registrado no financeiro. As observações aparecem destacadas logo abaixo do
respectivo item.

## Cuidar do estoque

Em **Estoque** é possível:

- cadastrar um produto;
- alterar nome, categoria, preço, estoque atual e estoque mínimo;
- repor unidades;
- excluir um produto que saiu do cardápio.

Use **Editar preço** na linha do produto quando o valor de venda mudar. Excluir
ou editar um produto não altera vendas antigas: o histórico preserva o nome e o
preço usados no momento da venda.

O alerta de estoque baixo só aparece depois que um estoque mínimo maior que
zero for configurado. Enquanto a quantidade real ainda não tiver sido
levantada, estoque e mínimo iguais a zero não geram notificações.

## Abrir, movimentar e fechar o caixa

Em **Financeiro**:

- abra o caixa com o fundo sugerido; o padrão inicial é R$ 130 e pode ser
  alterado em **Configurações > Fundo fixo para troco**;
- registre despesas, sangrias e suprimentos;
- confira entradas, saídas e saldo esperado;
- ao fechar, conte todo o dinheiro antes de fazer qualquer retirada;
- informe o total contado e confira a diferença real, a retirada calculada e o
  valor que ficará para troco;
- confirme o fechamento, retire fisicamente o valor indicado e deixe na gaveta
  o fundo mostrado pelo sistema.

Exemplo: se o saldo esperado e contado for R$ 152 e o fundo configurado for
R$ 130, o sistema registra uma retirada de R$ 22 e fecha sem diferença. Se forem
contados R$ 150, a diferença real será de -R$ 2, a retirada será de R$ 20 e
R$ 130 ficarão para a próxima abertura.

A retirada automática aparece no fluxo de caixa como **Sangria — Retirada
automática no fechamento**. Pix e cartão continuam no financeiro, mas não
entram no dinheiro físico contado na gaveta.

### Consultar e baixar o fluxo de caixa

Em **Financeiro > Fluxo de caixa**, escolha **Hoje**, **Este mês** ou
**Escolher período**. A tabela mostra data, tipo de movimentação, descrição,
valor e observação. Vendas e suprimentos aparecem como entradas; despesas e
sangrias aparecem como saídas.

Use **Baixar Excel** para obter uma planilha `.xlsx` com filtros, cores, fórmulas
e totais. Use **Baixar PDF** para salvar, imprimir ou enviar um relatório pronto.
Os dois arquivos incluem apenas o período escolhido e não alteram os dados do
sistema.

## Usar músicas

Em **Músicas**, pesquise pelo nome ou cole um link do YouTube. Escolha um dos
resultados e confirme o download apenas quando a lanchonete tiver autorização
para usar a faixa. O player mostra o tempo atual e a duração total; arraste a
linha de progresso para avançar ou voltar na música. yt-dlp e FFmpeg já
acompanham o instalador.

## Proteger os dados

Em **Financeiro > Proteção dos dados**:

- **Exportar backup** cria um arquivo para restauração;
- **Baixar banco completo** cria uma cópia para auditoria;
- **Restaurar backup** substitui o estado atual depois de validação e confirmação.

O menu Iniciar oferece **Pool Petiscos > Dados e backups** para abrir a pasta
local. Não altere o arquivo principal do banco manualmente.

Em **Configurações > Backups automáticos**, o aplicativo instalado:

- mantém até 30 cópias diárias, 12 semanais e 12 mensais;
- permite executar uma cópia imediatamente;
- conecta ou desconecta a conta do Google Drive;
- mostra cópias locais e da nuvem com a ação **Restaurar**;
- aceita um arquivo SQLite `.db` escolhido pelo usuário.

Antes de restaurar, o sistema verifica o arquivo e salva o banco atual com o
nome `pool-petiscos-antes-restauracao-...db`. A internet é necessária somente
para o Google Drive; os backups e o caixa local continuam funcionando offline.

## Encerrar e atualizar

Fechar a aba do navegador não encerra os serviços. Use **Encerrar Pool
Petiscos** no menu Iniciar antes de manutenção técnica.

Uma versão nova pode ser instalada por cima da anterior. Os dados ficam em uma
pasta separada e são preservados. Antes de trocar os arquivos, o instalador
encerra o sistema, copia o banco para `update-backups` e confere a cópia. Se não
conseguir proteger o banco, a atualização é interrompida.

Para remover o protótipo depois de um teste, abra **Pool Petiscos > Desinstalar
Pool Petiscos** no menu Iniciar. O desinstalador pergunta se também deve apagar
banco, músicas, PINs, configurações, logs e backups locais. Escolha **Sim** para
uma remoção completa da máquina de teste. Arquivos já enviados ao Google Drive
ou OneDrive não são apagados.

## Se algo não abrir

1. aguarde dez segundos e use novamente o atalho;
2. verifique se o navegador não abriu uma nova aba;
3. use **Encerrar Pool Petiscos** e abra o sistema outra vez;
4. anote o horário do problema para o suporte localizar o registro em
   `%LOCALAPPDATA%\PoolPetiscos\logs`.
