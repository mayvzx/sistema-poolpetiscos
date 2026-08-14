# Histórico de versões

Todas as mudanças relevantes do Pool Petiscos são registradas neste arquivo.

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
