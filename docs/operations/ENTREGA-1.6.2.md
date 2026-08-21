# Entrega da versão 1.6.2

A versão 1.6.2 adapta o fechamento à rotina confirmada pela proprietária: o
caixa começa com R$ 130, o movimento do dia é retirado e o mesmo fundo fica na
gaveta para a próxima abertura.

## Novo fechamento

1. abra o caixa com o fundo sugerido de R$ 130;
2. no encerramento, conte todo o dinheiro antes de retirar qualquer valor;
3. informe o total contado;
4. confira separadamente a diferença real, a retirada e o fundo que ficará;
5. confirme, retire fisicamente o valor indicado e deixe o fundo na gaveta.

Se forem esperados e contados R$ 152, o sistema registra R$ 22 como sangria e
deixa R$ 130, sem apontar uma diferença inexistente. A retirada passa a aparecer
no fluxo de caixa com a descrição **Retirada automática no fechamento**.

O fundo pode ser alterado em **Configurações > Fundo fixo para troco**. O valor
configurado é sugerido na próxima abertura, mas continua editável para que o
operador confirme o dinheiro físico disponível.

## Compatibilidade e atualização

Execute `PoolPetiscos-Setup-1.6.2.exe` diretamente por cima da instalação
existente. Não desinstale a versão anterior. Banco, vendas, estoque, PINs,
músicas, backups e conexão do Google Drive são preservados. Fechamentos antigos
continuam válidos e não recebem retiradas inventadas durante a migração.
