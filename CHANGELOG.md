# Histórico de versões

Todas as mudanças relevantes do Pool Petiscos são registradas neste arquivo.

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
