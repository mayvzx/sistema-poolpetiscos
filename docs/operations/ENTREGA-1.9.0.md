# Entrega da versão 1.9.0

A versão 1.9.0 adiciona um cardápio digital próprio da Pool Petiscos. Ela não
depende do Anota Aí: a página do cliente, a API e a fila do caixa fazem parte do
próprio sistema.

## Fluxo para o cliente

1. O cliente lê o QR Code ou abre o link da Pool.
2. Escolhe produtos, quantidades e observações no celular.
3. Informa mesa ou retirada e a forma de pagamento no local.
4. Confirma o pedido e acompanha: enviado, confirmado, em preparo, pronto e
   concluído.

Débito mostra acréscimo de 3% e crédito de 6%. Pix e dinheiro não têm
acréscimo. O servidor recalcula todos os preços e nunca confia no total enviado
pelo navegador.

## Fluxo no caixa

O menu **Pedidos online** mostra pedidos novos sem interromper a venda atual.
Cada pedido pode ser aceito, colocado em preparo, marcado como pronto e
entregue. Recusar exige confirmação.

Pedido pendente não é venda: não entra no caixa, não aparece no relatório e não
baixa estoque. Na entrega, o sistema salva primeiro a venda no SQLite e só
depois confirma a conclusão na internet. Se a internet cair nessa etapa, a
venda local permanece e a confirmação entra numa fila de nova tentativa.

O modo **Comandas** continua opcional e independente. Ele controla a fila das
vendas digitadas diretamente no caixa; não desativa a fila do QR Code.

## QR Code e configuração

Depois da implantação, **Pedidos online** permite abrir o cardápio, copiar o
link e baixar o QR Code em PNG. Em **Configurações > Cardápio e pedidos
online**, os proprietários podem pausar ou reativar novos pedidos.

A configuração técnica é feita uma única vez por quem instala:

- endereço HTTPS da API;
- endereço público do cardápio;
- token aleatório da instalação com pelo menos 32 caracteres.

O token é protegido pela DPAPI do usuário Windows. Ele não fica no código, no
QR Code, no navegador do cliente nem no repositório.

## Implantação da API

O ambiente publicado precisa de um banco D1 com a migração em `drizzle/` e dos
segredos abaixo:

```text
POOL_INSTALLATION_TOKEN
POOL_TRACKING_SECRET
POOL_RATE_LIMIT_SALT
POOL_STORE_SLUG=pool-petiscos
```

Use segredos aleatórios diferentes para os três primeiros campos. A API aceita
pedidos somente quando recebe heartbeat recente do caixa e o caixa local está
aberto. A ausência de internet nunca bloqueia as funções locais existentes.
Ao conectar o aplicativo em **Configurações**, use no campo de token exatamente
o mesmo valor publicado como `POOL_INSTALLATION_TOKEN`.

## Limites desta primeira versão

- pagamento continua presencial; não existe cobrança online;
- integração com a maquininha Getnet continua fora do escopo;
- o QR Code geral trabalha com retirada; QR Codes individuais por mesa já têm
  suporte na API, mas precisam ser configurados antes da impressão;
- o cardápio online requer hospedagem e banco configurados para receber pedidos
  reais. A tela de prévia isolada não comprova uma implantação externa.
