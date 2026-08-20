# Entrega da versão 1.5.2

A versão 1.5.2 substitui a 1.5.1 como pacote recomendado. Todo o escopo de
caixa, comandas, estoque, PIN, backups, Google Drive e desinstalação descrito na
[entrega 1.5.1](ENTREGA-1.5.1.md) continua disponível.

## Correções desta entrega

- uma instalação nova começa com o caixa fechado e saldo de R$ 0,00;
- vendas, comandas, despesas e movimentos demonstrativos não fazem parte do
  estado inicial;
- a cópia antiga do navegador não é reaproveitada ao iniciar um banco novo;
- estoque e estoque mínimo começam em zero, sem alerta de reposição até que um
  mínimo maior que zero seja configurado;
- o player de músicas mostra tempo atual e duração e permite avançar ou voltar
  arrastando a linha de progresso.

Uma atualização preserva bancos existentes por segurança. Em uma máquina que
foi usada durante o desenvolvimento, faça uma cópia do banco antigo e inicie um
banco novo antes da entrega. Não aplique essa limpeza em uma máquina com dados
reais sem conferir o backup.

## Instalação

Execute `PoolPetiscos-Setup-1.5.2.exe`. O instalador ainda não possui assinatura
Authenticode, portanto o Windows pode mostrar um aviso de origem desconhecida.
Confira a origem e o SHA-256 informado na publicação antes de continuar.
