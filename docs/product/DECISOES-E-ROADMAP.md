# Decisões do produto e roadmap

## Objetivo

Entregar para Elaine e Poolblay um sistema simples, confortável e confiável para
vendas, estoque e controle gerencial da Pool Petiscos & Lanches.

## O que já foi validado

- Cardápio e preços foram cadastrados a partir das fotos fornecidas.
- Funcionamento: quinta a domingo, das 16h às 23h.
- O caixa deve continuar operando quando a internet cair.
- O Google Drive conectado pela proprietária é o destino principal na nuvem;
  OneDrive permanece como destino local sincronizado opcional.
- O módulo musical deve usar arquivos próprios ou legalmente obtidos.

## Entregue no protótipo

- painel inicial;
- venda e carrinho;
- Pix, dinheiro, cartão e troco;
- baixa de estoque por produto;
- reposição com custo opcional;
- despesas e resumo financeiro;
- abertura e fechamento do caixa;
- sangria e suprimento;
- conferência entre saldo esperado e contado;
- separação do dinheiro físico de Pix e cartão;
- backup manual exportável e restaurável;
- reprodução de áudios locais;
- biblioteca musical persistente com download de uma faixa por vez;
- dados principais em SQLite, com revisão e histórico;
- backups automáticos diário, semanal e mensal, com conexão ao Google Drive;
- inicialização automática com o Windows;
- instalador reproduzível com Node.js, yt-dlp e FFmpeg incluídos;
- layout responsivo.
- PIN individual para Elaine e Poolblay, criado no primeiro acesso e alterável
  em Configurações;
- escala de fonte ajustável em tempo real entre 90% e 135%;
- temas automático, claro e escuro, com detecção do padrão do Windows;

### Revisão de requisitos de 14/08/2026

- acesso inicial com dois perfis: Elaine e Poolblay (Pool);
- cada venda guarda o operador conectado e o Financeiro mostra os totais
  separados por login;
- observações podem ser adicionadas a cada item da comanda e continuam visíveis
  durante o preparo e no histórico;
- a edição de produtos destaca a alteração de preço e preserva o preço original
  das vendas antigas;
- as consultas SQLite de vendas, comandas e itens mostram operador e
  observações;
- a maquininha atual foi identificada como Getnet tradicional, mas o modelo e a
  habilitação para TEF ainda precisam ser confirmados pela etiqueta/contrato;
- a troca para Mercado Pago está prevista para janeiro de 2027, com preferência
  por um terminal Point oficialmente integrável.
- cada perfil tem um PIN próprio; o banco recebe somente o verificador derivado
  com PBKDF2-SHA-256 e sal aleatório, sem PIN legível;
- Configurações concentra a troca do PIN, a escala de fonte e o tema da
  interface;
- preferências visuais são locais ao dispositivo e o modo Automático acompanha
  alterações no tema do Windows.

### Revisão de requisitos de 19/08/2026

- uma chave de recuperação redefine o PIN esquecido sem armazenar o PIN
  original;
- a chave aparece somente na criação, pode ser regenerada após confirmar o PIN
  atual e faz parte dos backups restauráveis apenas como verificador;
- backups locais têm retenção de 30 diários, 12 semanais e 12 mensais;
- o Google Drive usa OAuth de aplicativo desktop, escopo `drive.file` e token
  protegido pelo Windows;
- toda restauração SQLite valida integridade e esquema e cria uma cópia do banco
  atual antes de substituí-lo;
- o desinstalador oferece preservação padrão ou remoção completa dos dados
  locais para apresentações e testes.

### Revisão técnica de 25/07/2026

- regras de dinheiro e troco isoladas e testadas;
- bloqueio de saída em espécie sem caixa ou sem saldo;
- virada automática dos totais diários;
- gráfico alimentado somente por vendas registradas;
- validação integral do armazenamento e dos backups;
- cópia de segurança automática antes de restaurar;
- sincronização básica entre abas com aviso ao operador;
- navegação, modal e foco por teclado revisados;
- scripts de desenvolvimento compatíveis com Windows;
- código organizado por domínio, persistência, dados de demonstração e interface.

### Revisão técnica de 26/07/2026

- SQLite passou a ser a fonte principal dos dados no computador do caixa;
- gravações usam transação e detectam alterações concorrentes;
- as últimas 50 revisões ficam preservadas no banco;
- uma mudança ainda não sincronizada sobrevive ao fechamento inesperado da
  página e é reconciliada na próxima abertura;
- o backup diário é criado como uma cópia SQLite íntegra e atômica;
- o OneDrive corporativo ou pessoal é usado quando estiver configurado;
- o serviço local, a interface e as ferramentas de música passam a fazer parte
  do mesmo instalador;
- a interface deixou de exibir nomes de bibliotecas, comandos de instalação e
  avisos técnicos ao operador;
- textos operacionais foram ampliados para leitura confortável no balcão.

### Revisão técnica de 28/07/2026

- produtos podem ser criados, alterados e excluídos pela proprietária;
- a busca de músicas mostra até cinco resultados do YouTube;
- o launcher abre o navegador depois que os serviços ficam prontos no login;
- o instalador e os atalhos usam um ícone próprio;
- o banco completo pode ser baixado pela interface sem interromper o caixa;
- consultas SQLite em português permitem revisar os dados sem ler o JSON
  interno;
- a demonstração hospedada foi impedida de ler ou alterar o banco local;
- código, documentação e arquivos de distribuição foram separados por
  responsabilidade.

## Itens bloqueados pela visita presencial

Não implementar com dados inventados:

- estoque por ingrediente;
- fichas técnicas dos hambúrgueres e petiscos;
- taxas das maquininhas;
- fiado;
- mesas, entrega, retirada e regras de cancelamento;
- permissões para desconto e cancelamento;
- modelo de comprovante e impressora térmica;
- demais relatórios prioritários além das vendas por operador;
- estoque inicial real;
- valor habitual de abertura;
- especificações do computador;
- rotina real de sangria, despesas e fechamento.

## Operação local em desenvolvimento

- [x] Companion local restrito a `127.0.0.1`.
- [x] Integração inicial de biblioteca com `yt-dlp`.
- [x] Scripts de instalação, início e encerramento no Windows.
- [x] Empacotar interface, serviço, Node.js, `yt-dlp` e FFmpeg em um instalador.
- [x] Usar SQLite como armazenamento principal.
- [x] Automatizar backups diário, semanal e mensal e testar a restauração.
- [x] Implementar conexão OAuth e sincronização com Google Drive.
- [x] Persistir comandas e organizar a fila de preparo por etapa.
- [ ] Assinar executável, instalador e desinstalador com certificado
      Authenticode emitido para o responsável pela distribuição.

## Pagamentos integrados

- [x] Confirmar a marca atual: Getnet.
- [ ] Confirmar o modelo exato pela etiqueta traseira e a contratação de TEF.
- [ ] Decidir se vale integrar a Getnet atual ou aguardar a mudança prevista
      para Mercado Pago em janeiro de 2027.
- [ ] Na troca, escolher um terminal Mercado Pago Point Smart/Pro compatível
      com a API oficial.
- [ ] Implementar estados pendente, aprovado, recusado e cancelado.
- [ ] Baixar estoque apenas depois da confirmação do provedor.
- [ ] Homologar estorno, queda de internet e retorno ao modo independente.

## Próximos marcos

### 1. Validação presencial

- observar uma venda comum;
- simular pagamento em dinheiro;
- simular reposição e fechamento;
- registrar respostas e equipamentos;
- confirmar o fluxo que Elaine considera mais fácil.

### 2. Protótipo aprovado

- ajustar telas conforme a visita;
- validar a fila de comandas e implementar regras de cancelamento;
- cadastrar receitas e ingredientes confirmados;
- validar relatórios;
- congelar o escopo da primeira versão.

### 3. Aplicativo Windows

- instalar o protótipo no computador que será usado na apresentação;
- conectar o Google Drive e confirmar uma sincronização e restauração;
- assinar o pacote após a aquisição do certificado;
- testar instalação e restauração no computador da lanchonete.

Antes da operação oficial, evoluir o estado SQLite para sessões de caixa
explícitas. Cada venda, despesa e movimento deverá guardar o identificador da
sessão, sem depender apenas do relógio do computador.

### 4. Operação assistida

- cadastrar o estoque contado no dia;
- usar o sistema em paralelo por dois finais de semana;
- corrigir problemas observados;
- treinar Elaine e Poolblay;
- liberar a operação oficial.

## Fora do escopo inicial

- contabilidade fiscal completa;
- NFC-e sem alinhamento com contador e SEFAZ;
- vários caixas simultâneos;
- pedidos automáticos pelo WhatsApp;
- download de músicas sem autorização;
- notícias ou preços externos sem fonte confiável e política de atualização.
