# Pool Petiscos & Lanches — sistema de caixa

Protótipo funcional do sistema de caixa, estoque e controle financeiro da
**Pool Petiscos & Lanches**, preparado para evolução no Codex.

## Estado atual

O projeto já permite:

- consultar o painel inicial com data, hora e status de funcionamento;
- registrar vendas em Pix, dinheiro ou cartão;
- calcular troco;
- baixar o estoque dos produtos vendidos;
- registrar reposições e despesas;
- abrir, movimentar e fechar o caixa com conferência;
- separar dinheiro físico de recebimentos em Pix e cartão;
- exportar e restaurar um backup em JSON;
- importar e reproduzir músicas locais em uma fila temporária;
- manter os dados da demonstração no navegador.

O site publicado é uma demonstração. Ele ainda não é o sistema definitivo da
lanchonete e não substitui escrituração contábil ou emissão fiscal.

## Decisões confirmadas

- Funcionamento: quinta, sexta, sábado e domingo, das 16h às 23h.
- O sistema definitivo deverá funcionar sem internet.
- A cópia em nuvem será feita no Google Drive.
- “Sundae”, “Coca-Cola LS 1L” e
  “Guaraçaí / Guaraná do Amazonas 500 ml” são os nomes confirmados.
- O computador da lanchonete será o ponto principal de uso.

## Arquitetura atual

- Next.js/React com Vinext;
- armazenamento local no navegador para a demonstração;
- hospedagem pelo Sites;
- interface concentrada em `app/page.tsx`;
- identidade visual em `public/pool-logo-banner.jpg` e
  `public/pool-logo-round.jpg`.

## Direção para a versão instalada

A versão de produção deverá ser local-first:

1. aplicação instalada no Windows;
2. banco SQLite no próprio computador;
3. vendas e estoque disponíveis sem internet;
4. backup local automático;
5. cópia sincronizada com o Google Drive quando houver conexão;
6. restauração testada antes da entrada em operação.

O protótipo web deve continuar servindo para validar fluxo e interface antes da
migração para o aplicativo instalado.

## Desenvolvimento

Requisitos:

- Node.js 22.13 ou superior;
- npm.

Comandos principais:

```bash
npm run dev
npm run lint
npm test
```

As decisões, bloqueios e próximas etapas estão em
[`docs/DECISOES-E-ROADMAP.md`](docs/DECISOES-E-ROADMAP.md).
