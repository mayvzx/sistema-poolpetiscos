# Guia de revisão do código

Este guia ajuda a revisar o projeto sem precisar começar pelo componente visual
inteiro.

## Ordem recomendada

1. `features/pool-petiscos/types.ts`
   - mostra quais registros existem e quais campos cada um guarda;
2. `features/pool-petiscos/domain.ts`
   - contém as regras puras de valores, horário, saldo e gráfico;
3. `features/pool-petiscos/persistence.ts`
   - valida dados locais e arquivos de backup;
4. `features/pool-petiscos/demo-data.ts`
   - reúne somente os dados fictícios da demonstração;
5. `features/pool-petiscos/pool-petiscos-app.tsx`
   - conecta as regras aos botões, formulários e telas;
6. `features/pool-petiscos/music-companion.ts`
   - faz somente a comunicação da tela com o serviço local de músicas;
7. `local_service/server.py`
   - limita a API ao próprio computador, gerencia a biblioteca e chama o
     `yt-dlp`;
8. `scripts/`
   - prepara, inicia e encerra a instalação piloto no Windows;
9. `tests/` e `local_service/test_server.py`
   - registra os comportamentos que não podem voltar a quebrar.

## Correções desta revisão

- valores como `10.50` deixam de virar `1050`;
- texto inválido não conclui venda em dinheiro;
- estoque aceita somente quantidade inteira positiva;
- despesas em dinheiro exigem caixa aberto e saldo suficiente;
- fechar o caixa avisa antes de descartar uma comanda;
- o valor contado começa vazio, para não induzir uma conferência falsa;
- IDs de vendas e lançamentos não repetem a cada poucos segundos;
- totais de “hoje” mudam corretamente na virada do dia;
- o gráfico não mistura mais valores inventados com receita real;
- armazenamento cheio ou indisponível gera aviso explícito;
- outra aba atualiza o estado e limpa a comanda potencialmente desatualizada;
- backups passam por validação completa e geram cópia de segurança antes da
  restauração;
- URLs temporárias de áudio são liberadas ao fechar a página;
- o sino abre uma central de alertas antes de oferecer o atalho para Estoque;
- downloads assistidos ficam limitados a uma faixa e exigem confirmação de uso;
- falha ao iniciar o site local encerra os processos já abertos;
- modal fecha com Escape, prende o foco e volta ao controle anterior;
- atalhos de navegação ficam preservados no endereço (`#venda`, `#estoque` etc.);
- os comandos de desenvolvimento funcionam no Windows.

## Limites conhecidos

- é um protótipo com dados locais, não um caixa de produção;
- operações ainda são associadas à abertura do caixa pelo horário, não por uma
  entidade imutável de sessão;
- duas abas não devem registrar vendas ao mesmo tempo;
- não há cancelamento, desconto, comandas por mesa, impressão fiscal ou níveis
  de permissão;
- o nome “Elaine” representa a operadora validada para o protótipo; a versão
  instalada deverá ter operador/PIN se isso for confirmado presencialmente;
- o componente visual principal ainda pode ser dividido em componentes menores
  por tela numa próxima refatoração.

## Critério para aprovar uma mudança

Antes de publicar:

```powershell
npm run check
```

O comando precisa concluir o typecheck, lint, testes do companion, testes de
domínio, build e teste do HTML gerado. Depois disso, os fluxos essenciais devem
ser conferidos no navegador: venda em Pix, venda em dinheiro, limite de estoque,
saída financeira, fechamento de caixa e restauração de backup inválido.
