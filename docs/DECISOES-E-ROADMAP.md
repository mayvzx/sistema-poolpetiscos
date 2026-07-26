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

