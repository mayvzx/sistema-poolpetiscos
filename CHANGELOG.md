# Histórico de versões

Todas as mudanças relevantes do Pool Petiscos são registradas neste arquivo.

## 2.0.0 — 2026-09-02

### Sincronização contínua

- mantém o catálogo, estoque disponível e fila online sincronizados
  automaticamente em ciclos de 5 segundos, sem depender do botão manual;
- recupera o serviço local após falhas inesperadas, registra o diagnóstico e
  evita que o recebimento de pedidos pare silenciosamente;
- atualiza o cardápio digital aberto no celular em até poucos segundos e evita
  cache antigo na rota pública do catálogo;
- impede requisições concorrentes desnecessárias no caixa e mantém as ações
  pendentes na fila local para nova tentativa segura.

### Clareza visual e operação

- corrige textos escuros em cartões de pedidos, abas, totais e observações no
  tema escuro;
- apresenta o estado do serviço e o intervalo da sincronização na tela
  **Pedidos online**;
- adiciona cabeçalhos de versão do catálogo e logs estruturados para facilitar
  diagnóstico da API.

## 1.9.0 — 2026-09-01

### Cardápio digital próprio

- adiciona página móvel por QR Code com categorias, busca, carrinho,
  observações, mesa ou retirada e acompanhamento do pedido;
- aplica e exibe os mesmos acréscimos presenciais de 3% no débito e 6% no
  crédito, com Pix e dinheiro sem taxa;
- permite copiar o link e baixar o QR Code do cardápio em PNG.

### API e fila online

- cria API HTTPS própria com catálogo publicado pelo caixa, pedidos, tracking,
  heartbeat e ações do operador;
- recalcula preços e totais no servidor, limita spam e usa idempotência para
  impedir pedidos ou ações duplicadas;
- adiciona a tela **Pedidos online**, separada das comandas internas, com
  aceite, preparo, pronto, entrega, recusa e histórico;
- registra caixa, venda e estoque somente na entrega, salvando primeiro no
  SQLite local;
- mantém inbox/outbox SQLite isolada para retomar eventos e confirmações após
  quedas de internet sem duplicar a venda;
- identifica na tela ações ainda em sincronização e evita confirmar ao operador
  uma conclusão que ficou apenas na fila local;
- protege o token da instalação com DPAPI e mantém o serviço local acessível
  somente pelo próprio computador.

### Banco e validação

- adiciona esquema D1 e migração com restrições de totais, pagamentos,
  quantidades e transições de estado;
- adiciona testes do domínio, API, migração, cliente HTTPS, inbox/outbox,
  orquestrador e rotas do serviço local.

### Atualização no Windows

- corrige a ordem de encerramento que podia bloquear o instalador antes de o
  Pool conseguir fechar o serviço executado em segundo plano;
- adiciona instalação guiada em um clique depois do download e da validação
  SHA-256, sem exigir que a proprietária use o Gerenciador de Tarefas;
- consulta um manifesto no site oficial e mantém a release do GitHub como rota
  alternativa, reduzindo falhas temporárias ao procurar novas versões;
- cria e verifica um backup do banco antes de substituir os arquivos e reabre o
  sistema ao terminar, preservando vendas, PIN, configurações e Google Drive.

## 1.8.0 — 2026-08-23

### Relatórios detalhados

- adiciona filtros rápidos para hoje, semana atual e mês atual, além do período
  personalizado já existente;
- inclui em cada venda os produtos, quantidades, observações dos itens e forma
  de pagamento tanto na tela quanto nos arquivos Excel e PDF;
- amplia a coluna de data da planilha e mostra data e hora, corrigindo o
  `########` exibido pelo Excel quando a coluna era estreita;
- reorganiza as colunas e fórmulas da planilha para manter totais e filtros
  corretos com o novo detalhamento.

### Acréscimos de cartão e atendimento

- calcula e mostra 3% de acréscimo no débito e 6% no crédito antes de finalizar
  a venda, preservando subtotal, taxa, acréscimo e total final no histórico;
- migra vendas antigas com taxa zero, sem alterar valores já registrados;
- permite escolher entre fila de comandas e venda direta nas Configurações;
- impede desativar a fila enquanto houver comandas em andamento e preserva todo
  o histórico ao mudar de modo;
- registra vendas diretas como concluídas, com baixa normal no estoque e sem
  poluir a fila de preparo.

### Atualização e confiabilidade

- repete a verificação automática enquanto o aplicativo permanece aberto,
  respeitando o intervalo de 24 horas do serviço local;
- consulta novamente ao voltar para uma janela que ficou em segundo plano,
  sem interromper o atendimento quando não houver internet;
- vincula o estado de download à versão exata, evitando mostrar um instalador
  antigo como pronto para uma publicação mais nova;
- remove arquivos incompletos ou inválidos e só mantém o instalador depois de
  conferir tamanho e SHA-256;
- amplia os testes do atualizador para cache diário, consulta forçada, download
  válido e rejeição de conteúdo corrompido.

## 1.7.0 — 2026-08-22

### Sessões de caixa e resumo de fechamento

- cria uma identificação única a cada abertura e liga a ela vendas, despesas,
  sangrias e suprimentos;
- registra quem abriu e quem fechou o caixa, preservando o histórico dos dois
  operadores;
- migra automaticamente registros anteriores para a sessão correspondente sem
  apagar vendas, estoque, PINs, backups ou conexão do Google Drive;
- substitui o recorte baseado apenas no horário por cálculos da sessão ativa,
  evitando que movimentos antigos entrem no saldo de uma nova abertura;
- adiciona no Financeiro o histórico de sessões, totais por pagamento,
  conferência, retirada, fundo deixado e responsáveis;
- gera um resumo de fechamento em PDF para guardar, imprimir ou enviar.
- limita o histórico interno a 12 estados completos, mantendo recuperação
  recente sem crescimento excessivo do SQLite ao longo dos anos;
- rejeita sessões de caixa sobrepostas, identificadores reutilizados e
  lançamentos vinculados fora do período correto.

### Aviso seguro de atualização

- consulta o release estável do repositório oficial uma vez por dia no
  aplicativo Windows;
- mostra um aviso discreto sem interromper o atendimento;
- aceita para download apenas o instalador com nome, tamanho e SHA-256
  publicados no release oficial;
- baixa o arquivo para uma pasta separada e deixa a execução manual, sem
  instalar versões silenciosamente durante um caixa aberto.

## 1.6.2 — 2026-08-21

### Fundo fixo e fechamento orientado

- configura R$ 130 como fundo de troco inicial, com valor editável nas
  Configurações;
- preenche a próxima abertura com o fundo configurado, mantendo a confirmação
  do valor físico pelo operador;
- pede a contagem total antes da retirada e separa claramente diferença real,
  retirada do movimento e dinheiro deixado na gaveta;
- registra automaticamente a retirada excedente como sangria no fluxo de caixa;
- guarda em cada fechamento o fundo usado, a retirada e o saldo remanescente;
- mostra, quando o caixa está fechado, o valor realmente deixado para a próxima
  abertura em vez do saldo esperado da sessão anterior;
- migra estados e fechamentos anteriores sem alterar vendas, PINs, backups ou
  histórico já registrado.

### Venda mais rápida e contraste revisado

- mantém o total e o botão de finalizar sempre visíveis, com rolagem apenas na
  parte variável do pedido quando a comanda tiver muitos itens;
- torna o nome da comanda opcional e identifica pedidos sem nome como
  **Balcão 01**, **Balcão 02** e assim por diante, reiniciando a sequência a
  cada dia;
- melhora a aparência e a legibilidade do botão de finalizar quando ele está
  desabilitado nos temas claro e escuro;
- corrige os hovers do tema escuro, inclusive no estoque, para que o fundo não
  fique branco nem esconda o nome dos produtos.

## 1.6.1 — 2026-08-20

### Revisão final de confiabilidade

- valida integralmente os registros antes de gravar ou restaurar o SQLite,
  incluindo totais, datas, credenciais e identificadores duplicados;
- verifica a integridade do banco antes de inicializar o esquema e executa a
  preparação das tabelas e consultas dentro de uma transação;
- mostra ao operador a causa real de uma falha do banco e mantém avisos de
  armazenamento e de backup independentes;
- registra falhas do agendador e da primeira sincronização com o Google Drive,
  incluindo erros ocorridos antes da criação da cópia local;
- estabiliza downloads de relatórios e da chave de recuperação e consolida os
  trechos repetidos de download, criptografia e estilo da planilha;
- adiciona testes de regressão para estados incompletos, IDs duplicados,
  corrupção externa, falha de backup e erros retornados pelo serviço local.

## 1.6.0 — 2026-08-20

### Fluxo de caixa e relatórios

- adiciona uma tabela de fluxo de caixa no Financeiro com data, movimentação,
  descrição, valor e observação, seguindo o modelo já usado pela proprietária;
- permite consultar hoje, o mês atual ou um período personalizado;
- separa entradas e saídas, calcula o saldo e identifica vendas, despesas,
  suprimentos e sangrias;
- gera planilha Excel `.xlsx` com filtros, fórmulas, cores e totais e relatório
  PDF pronto para salvar, imprimir ou enviar;
- distingue débito e crédito nos novos registros sem perder vendas antigas
  gravadas como cartão.

### Atualização sem perda de dados

- mantém o mesmo identificador e diretório do instalador para atualizar por cima
  da versão 1.5.2;
- encerra a versão instalada antes da troca de arquivos;
- cria e confere por SHA-256 uma cópia do SQLite em `update-backups` antes de
  iniciar a atualização;
- interrompe a instalação se não for possível proteger o banco existente;
- preserva vendas, caixa, estoque, PINs, chave de recuperação, músicas,
  backups e conexão do Google Drive.

### Músicas e equipamento Getnet

- atualiza o yt-dlp e inclui o componente JavaScript necessário às mudanças
  recentes do YouTube, usando o Node.js já empacotado;
- melhora os erros mostrados ao operador e mantém o detalhe técnico nos logs;
- identifica pelas fotos o terminal Getnet como Newland SP630 Pro, um POS
  clássico; a integração automática depende de contratação/habilitação de TEF
  com a Getnet e um integrador homologado.

## 1.5.2 — 2026-08-20

### Caixa e estoque limpos

- deixa de considerar produtos com estoque e mínimo iguais a zero como itens
  em falta; o alerta só começa depois que um estoque mínimo real é configurado;
- mantém novas instalações com caixa fechado, saldo zero e sem movimentações;
- impede que o fallback antigo do navegador repovoe um banco novo com o estado
  demonstrativo removido;
- documenta a substituição segura do banco demonstrativo em máquinas usadas
  durante o desenvolvimento, sempre preservando uma cópia recuperável.

### Player de música

- adiciona uma linha do tempo com o tempo atual e a duração total da faixa;
- permite avançar ou voltar na música arrastando o controle de progresso;
- atualiza a posição durante a reprodução e reinicia os indicadores ao trocar
  ou recarregar a faixa;
- mantém o controle acessível por teclado e informa quando os metadados ainda
  estão sendo carregados.

## 1.5.1 — 2026-08-20

### Entrega limpa

- novas instalações deixam de criar vendas, despesas, comandas, movimentos e
  fechamentos fictícios;
- mantém o cardápio e os preços cadastrados, mas inicia estoque e estoque mínimo
  em zero para que a proprietária informe as quantidades reais;
- inicia o caixa fechado, sem saldo presumido, e exige que o operador informe o
  dinheiro real disponível para troco ao abrir uma nova sessão;
- remove nomes de clientes e movimentações demonstrativas do estado inicial;
- preserva normalmente os dados de instalações anteriores durante a atualização,
  evitando apagar qualquer registro real sem confirmação do usuário.

## 1.5.0 — 2026-08-19

### Recuperação e segurança

- adiciona chave única para redefinir o PIN de Elaine ou Pool em caso de
  esquecimento;
- exibe a chave apenas na criação, permite baixá-la e mantém somente seu
  verificador PBKDF2-SHA-256;
- permite regenerar a chave mediante confirmação do PIN atual e invalida a
  chave anterior;
- protege o token de atualização do Google Drive com DPAPI do usuário Windows.

### Backups e restauração

- cria cópias SQLite diárias, semanais e mensais com retenções independentes;
- integra Google Drive por OAuth com o escopo limitado `drive.file`;
- permite consultar e restaurar cópias locais ou do Google Drive;
- aceita restauração de arquivo `.db`, valida a integridade e o esquema e cria
  uma cópia automática antes da substituição;
- mantém o caixa disponível quando a internet ou a sincronização falham.

### Instalador

- adiciona atalho de desinstalação e pergunta se os dados do usuário devem ser
  preservados ou removidos;
- remove banco, músicas, PINs, configurações, logs e tokens locais quando a
  remoção completa é escolhida, preservando arquivos já enviados à nuvem;
- aceita uma credencial OAuth de aplicativo desktop durante o build e registra
  no manifesto apenas se ela foi incluída, sem registrar seu conteúdo.

### Preparação da entrega

- publica a tela de autorização do Google para uso externo, permitindo que a
  proprietária escolha a própria conta na tela oficial do Google;
- mantém a credencial do aplicativo fora do GitHub e inclui sua configuração
  somente no instalador gerado para entrega;
- atualiza dependências transitivas do aplicativo e deixa a auditoria das
  dependências de produção sem vulnerabilidades conhecidas;
- documenta a instalação assistida, o teste de restauração, a desinstalação
  limpa e as limitações da versão entregue para avaliação.

## 1.4.0 — 2026-08-14

### Segurança e identificação

- cada perfil cria um PIN individual de 6 números no primeiro acesso;
- adiciona troca do PIN atual pela nova aba **Configurações**;
- rejeita PINs comuns, sequenciais e repetitivos e mostra orientações claras;
- armazena somente verificadores PBKDF2-SHA-256 com sal aleatório, nunca o PIN
  legível;
- adiciona a consulta SQLite `vw_operadores`, que mostra apenas se o PIN está
  configurado e quando foi alterado.

### Acessibilidade e aparência

- permite ajustar as letras de 90% a 135%, com resultado imediato em toda a
  interface;
- adiciona os temas **Automático**, **Claro** e **Escuro**;
- detecta o tema padrão do Windows e acompanha mudanças enquanto o sistema está
  aberto;
- salva as preferências visuais somente no computador em uso.

## 1.3.0 — 2026-08-14

### Operadores e comandas

- adiciona a etapa inicial para escolher Elaine ou Poolblay (Pool);
- atribui cada venda ao perfil conectado e mostra quantidade e total por
  operador no Financeiro;
- permite registrar observações em cada item do pedido e as destaca nas
  comandas em andamento e concluídas;
- migra vendas anteriores sem inventar autoria, classificando-as como **Não
  identificado**.

### Estoque, banco e pagamentos

- deixa a ação de alteração de preço explícita no Estoque e preserva o valor
  registrado nas vendas antigas;
- inclui operador e observação nas consultas legíveis do SQLite;
- documenta a maquininha Getnet atual, o provável caminho por TEF e a mudança
  planejada para Mercado Pago Point em janeiro de 2027;
- mantém Pix e cartão em confirmação manual até existir integração real e
  homologada, sem QR Code ou aprovação simulados.

## 1.2.1 — 2026-07-29

### Alterado

- o instalador usa as portas locais dedicadas `14173` e `18765`, separadas das
  portas normalmente usadas pelo ambiente de desenvolvimento;
- um novo clique no atalho aguarda a interface e o serviço de dados ficarem
  prontos antes de abrir o navegador.

### Corrigido

- uma porta ocupada por outro programa agora é detectada imediatamente;
- processos Node e Python iniciados pelo launcher são vinculados ao processo
  principal e não permanecem órfãos após um encerramento inesperado;
- falhas de inicialização deixam de acontecer silenciosamente no atalho.

## 1.2.0 — 2026-07-29

### Adicionado

- aba **Comandas** como fila digital de pedidos;
- etapas **Aguardando**, **Em preparo**, **Pronto** e **Entregue**;
- nome do cliente obrigatório ao finalizar a nova venda;
- histórico de comandas concluídas com opção de reabertura;
- consulta SQLite `vw_comandas` para auditoria.

### Alterado

- finalizar uma venda cria uma comanda em **Aguardando** e abre a fila;
- comandas antigas são preservadas como concluídas durante a atualização;
- o atalho do Windows aponta para um arquivo de ícone versionado.

### Corrigido

- ícone personalizado da Área de Trabalho deixa de depender do cache visual do
  executável.

## 1.1.1 — 2026-07-28

### Adicionado

- download de uma cópia íntegra do banco pela tela Financeiro;
- consultas SQLite legíveis para produtos, vendas, itens, despesas e caixa;
- atalho **Dados e backups** no menu Iniciar;
- ferramenta de inspeção somente leitura do banco;
- manual do operador incluído no instalador;
- documentação separada por produto, arquitetura, operação e desenvolvimento;
- validação automática do projeto no GitHub.

### Alterado

- tarefa de inicialização automática volta marcada em cada atualização;
- dados locais só podem ser lidos ou gravados pela interface executada no
  próprio computador;
- apresentação e metadados do repositório foram preparados para distribuição.

## 1.1.0 — 2026-07-28

### Adicionado

- cadastro, edição e exclusão de produtos;
- busca de músicas no YouTube com cinco resultados;
- ícone próprio do aplicativo e do instalador;
- animações suaves e tipografia ampliada.

### Corrigido

- auto-início passa a abrir o navegador depois que os serviços ficam prontos;
- sino abre a central de notificações em vez de navegar imediatamente ao
  estoque;
- exclusão de produtos preserva o histórico das vendas.
