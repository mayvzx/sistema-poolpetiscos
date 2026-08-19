# Histórico de versões

Todas as mudanças relevantes do Pool Petiscos são registradas neste arquivo.

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
