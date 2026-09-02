# Recomendações aplicadas — Pool Petiscos 2.1.0

## O que entrou nesta revisão

- alerta visual e sonoro para um novo pedido online, sem repetir pedidos que
  já estavam aguardando quando o sistema foi aberto;
- atualização automática continua ativa a cada 5 segundos, com indicação da
  última sincronização e do último erro conhecido;
- impressão de um pedido individual, com cliente, itens, quantidades,
  observações, forma de pagamento e total;
- relatório de fluxo de caixa com resumo por forma de pagamento na tela, na
  planilha Excel e no PDF;
- impressão compatível com impressoras comuns do Windows, usando o diálogo
  padrão do sistema;
- exportações pesadas permanecem carregadas sob demanda para não deixar o caixa
  lento durante o atendimento;
- atualizador do Windows executa o instalador separado do serviço local, sem
  exigir Gerenciador de Tarefas.

## Limites mantidos de propósito

- estoque por ingrediente e fichas técnicas só devem ser ativados depois que
  Elaine confirmar os ingredientes, unidades e receitas reais. Nenhuma receita
  foi inventada;
- permissões detalhadas (por exemplo, quem pode cancelar ou conceder desconto)
  dependem de uma decisão dos dois proprietários. Os dois perfis atuais
  continuam com o mesmo acesso para não bloquear o atendimento;
- impressão fiscal e integração com a maquininha permanecem fora do escopo até
  a escolha do novo equipamento e a documentação oficial do provedor.

## Operação do alerta sonoro

O navegador libera o som depois do primeiro clique ou tecla do operador. A
partir daí, um pedido novo toca um aviso curto e também aparece como notificação
na tela. Mesmo sem áudio, o contador e o aviso visual continuam funcionando.
