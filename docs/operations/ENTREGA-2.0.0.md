# Entrega da versão 2.0.0

## O que mudou

A versão 2.0.0 transforma a conexão do cardápio digital em uma sincronização
contínua. O serviço local publica alterações de preço, estoque e produtos em
um ciclo curto, enquanto o cardápio aberto pelo cliente consulta a API sem
usar cópias antigas.

## Como funciona no dia a dia

- a proprietária não precisa clicar em **Sincronizar agora**;
- o serviço local verifica a API aproximadamente a cada 5 segundos;
- o cardápio digital atualiza a disponibilidade e os preços em poucos segundos;
- se a internet cair, o caixa mantém os dados locais e retoma a fila quando a
  conexão voltar;
- se o serviço encontrar um erro inesperado, ele registra o diagnóstico e
  continua tentando no próximo ciclo.

O botão manual continua disponível apenas como uma ação imediata de conferência
ou diagnóstico.

## Validação realizada

- testes de unidade do serviço local e do banco SQLite;
- testes da API D1, idempotência, preços, transições e cabeçalhos de cache;
- typecheck, lint e build de produção;
- verificação visual da tela **Pedidos online** no tema escuro.

## Observação para atualização

Esta alteração precisa ser entregue no próximo instalador Windows para atualizar
o serviço local instalado. A atualização preserva o banco, PIN, configurações,
Google Drive e histórico da proprietária.
