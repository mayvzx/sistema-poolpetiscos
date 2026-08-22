# Entrega da versão 1.7.0

A versão 1.7.0 torna cada abertura um caixa separado, cria um resumo permanente
para cada fechamento e avisa quando houver uma nova versão do aplicativo.

## Sessões de caixa

Ao abrir, o sistema cria uma identificação única e registra o operador
responsável. Vendas, despesas, sangrias e suprimentos ficam ligados a essa
sessão até o fechamento. O saldo esperado deixa de depender apenas do horário,
evitando que registros de outro dia entrem em uma nova abertura.

Ao fechar, o sistema também registra o operador responsável. Em **Financeiro >
Sessões de caixa**, é possível consultar qualquer fechamento, incluindo:

- vendas totais e valores por dinheiro, Pix, débito e crédito;
- despesas, saldo esperado, valor contado e diferença;
- retirada do movimento e fundo deixado para a próxima abertura;
- quem abriu, quem fechou e quanto cada operador vendeu;
- download de um resumo em PDF.

Os dados anteriores são migrados automaticamente. A atualização não apaga
vendas, estoque, PINs, chave de recuperação, músicas, backups nem a conta do
Google Drive conectada.

## Validação de uso prolongado

A revisão final simulou cinco anos de operação em um único caixa: 41.600 vendas
distribuídas em 1.040 sessões. O estado foi validado e ordenado em cerca de
69 ms; a gravação SQLite junto dos três backups automáticos terminou em cerca
de 2,7 s na máquina de desenvolvimento. Cada backup compacto ficou com cerca
de 12 MB.

Esse ensaio não transforma o aplicativo em um sistema multi-caixa. A estrutura
1.7.0 é adequada para um computador principal e dezenas de milhares de vendas;
uma futura operação simultânea em várias máquinas exigirá tabelas SQL próprias
e sincronização entre caixas.

## Aviso de atualização

O aplicativo Windows consulta uma vez por dia se existe um release estável mais
novo no repositório oficial. Quando existir, um aviso aparece na interface e a
tela **Configurações > Atualizações do aplicativo** mostra as novidades.

O download só é liberado quando o instalador publicado possui nome, tamanho e
hash SHA-256 válidos. Depois da verificação, o sistema abre a pasta do arquivo;
a instalação continua manual. Assim, nenhuma atualização começa sozinha no
meio do atendimento.

## Atualizar na lanchonete

Execute `PoolPetiscos-Setup-1.7.0.exe` por cima da instalação existente. Não
desinstale a versão anterior. O instalador encerra o aplicativo, cria uma cópia
verificada do SQLite e só então troca os arquivos do programa.
