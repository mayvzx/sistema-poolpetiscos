# Guia de revisão do código

Este guia ajuda a revisar o projeto sem precisar começar pelo componente visual
inteiro.

## Ordem recomendada

1. `features/pool-petiscos/types.ts`
   - mostra quais registros existem e quais campos cada um guarda;
2. `features/pool-petiscos/pool-app-config.ts`
   - reúne navegação, categorias, formulários e parsers usados pela tela;
3. `features/pool-petiscos/domain.ts`
   - contém as regras puras de valores, horário, saldo e gráfico;
4. `features/pool-petiscos/persistence.ts`
   - valida dados locais e arquivos de backup;
5. `features/pool-petiscos/demo-data.ts`
   - reúne somente os dados fictícios da demonstração;
6. `features/pool-petiscos/operator-security.ts` e `operator-login.tsx`
   - validam os PINs, derivam os verificadores e controlam a entrada nos perfis;
7. `features/pool-petiscos/display-preferences.ts` e `settings-panel.tsx`
   - isolam tema, escala de fonte e a tela de Configurações;
8. `features/pool-petiscos/pool-petiscos-app.tsx`
   - conecta as regras aos botões, formulários e telas;
9. `features/pool-petiscos/music-companion.ts`
   - faz somente a comunicação da tela com o serviço local de músicas;
10. `features/pool-petiscos/local-storage-companion.ts`
   - faz a leitura e a gravação do estado principal pela API local;
11. `local_service/storage.py`
   - contém SQLite, consultas legíveis, histórico, revisões e backups;
12. `local_service/server.py`
   - limita a API ao próprio computador, gerencia a biblioteca e chama o
     `yt-dlp`;
13. `local_service/launcher.py` e `installer/`
    - iniciam os serviços e definem o pacote instalado no Windows;
14. `scripts/inspect_database.py`
    - mostra como o banco é acessado em modo somente leitura;
15. `scripts/build-windows-installer.ps1`
    - baixa dependências verificadas, monta e compila o instalador;
16. `tests/` e `local_service/test_server.py`
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
- downloads assistidos ficam limitados a uma faixa;
- falha ao iniciar o site local encerra os processos já abertos;
- modal fecha com Escape, prende o foco e volta ao controle anterior;
- atalhos de navegação ficam preservados no endereço (`#venda`, `#estoque` etc.);
- dados são gravados em SQLite e mantêm as últimas 12 revisões recentes;
- alterações pendentes são recuperadas depois de um fechamento inesperado;
- backups SQLite diários passam por verificação de integridade;
- uma cópia íntegra do SQLite pode ser baixada sem interromper o caixa;
- consultas `vw_*` tornam produtos, vendas e caixa legíveis fora do sistema;
- a demonstração pública não pode acessar dados da instalação local;
- o instalador inclui as dependências de execução e preserva os dados ao
  atualizar;
- os comandos de desenvolvimento funcionam no Windows.
- comandas ficam persistidas em Aguardando, Em preparo, Pronto e Entregue;
- vendas antigas entram no histórico sem reaparecer na fila de preparo;
- atalhos do Windows apontam diretamente para o ícone versionado.
- perfis exigem PIN de 6 números, sem armazenar o segredo em texto legível;
- PINs comuns, sequenciais e repetitivos são rejeitados;
- fonte muda em tempo real e permanece entre acessos neste computador;
- modo Automático acompanha `prefers-color-scheme` e reage à mudança do Windows;
- tema escuro cobre superfícies, formulários, tabelas e janelas do sistema.

## Limites conhecidos

- é um protótipo operacional, ainda sem emissão fiscal ou homologação de
  pagamento;
- operações ainda são associadas à abertura do caixa pelo horário, não por uma
  entidade imutável de sessão;
- não há cancelamento, desconto, comandas por mesa, impressão fiscal ou níveis
  de permissão;
- o PIN local melhora a identificação de quem operou o caixa, mas não substitui
  controle de acesso do Windows, criptografia do disco ou autenticação online;
- o componente visual principal ainda pode ser dividido em componentes menores
  por tela numa próxima refatoração.

## Critério para aprovar uma mudança

Antes de publicar:

```powershell
npm run check
```

O comando precisa concluir o typecheck, lint, testes do serviço local, testes
de domínio, build e teste do HTML gerado. Depois disso, os fluxos essenciais
devem ser conferidos no navegador: venda em Pix, venda em dinheiro, limite de
estoque, saída financeira, fechamento de caixa, restauração de backup inválido
e recuperação dos dados depois de reiniciar os serviços.
