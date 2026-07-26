# Decisões e roadmap

## Objetivo

Entregar para Elaine e Poolblay um sistema simples, confortável e confiável para
vendas, estoque e controle gerencial da Pool Petiscos & Lanches.

## O que já foi validado

- Cardápio e preços foram cadastrados a partir das fotos fornecidas.
- Funcionamento: quinta a domingo, das 16h às 23h.
- O caixa deve continuar operando quando a internet cair.
- O Google Drive é a preferência inicial para cópias em nuvem.
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
- layout responsivo.

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

## Itens bloqueados pela visita presencial

Não implementar com dados inventados:

- estoque por ingrediente;
- fichas técnicas dos hambúrgueres e petiscos;
- taxas das maquininhas;
- fiado;
- comandas, mesas, entrega e retirada;
- permissões para desconto e cancelamento;
- modelo de comprovante e impressora térmica;
- relatórios prioritários;
- estoque inicial real;
- valor habitual de abertura;
- especificações do computador;
- rotina real de sangria, despesas e fechamento.

## Operação local em desenvolvimento

- [x] Companion local restrito a `127.0.0.1`.
- [x] Integração inicial de biblioteca com `yt-dlp`.
- [x] Scripts de instalação, início e encerramento no Windows.
- [ ] Empacotar a interface e o companion em um instalador Windows assinado.
- [ ] Substituir `localStorage` por SQLite antes do uso financeiro real.
- [ ] Automatizar backup diário e testar restauração completa.

## Pagamentos integrados

- [ ] Confirmar a marca e o modelo da maquininha da lanchonete.
- [ ] Escolher um primeiro provedor: Mercado Pago Point, PagBank PlugPag ou API
      Pix da instituição recebedora.
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
- implementar comandas e cancelamentos;
- cadastrar receitas e ingredientes confirmados;
- validar relatórios;
- congelar o escopo da primeira versão.

### 3. Aplicativo Windows

- empacotar a interface como aplicativo;
- substituir armazenamento do navegador por SQLite;
- criar migrações e cópias automáticas;
- configurar pasta sincronizada com Google Drive;
- testar instalação e restauração no computador da lanchonete.

Antes da operação oficial, substituir o armazenamento do navegador por sessões
de caixa explícitas no SQLite. Cada venda, despesa e movimento deverá guardar o
identificador da sessão, sem depender apenas do relógio do computador.

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

