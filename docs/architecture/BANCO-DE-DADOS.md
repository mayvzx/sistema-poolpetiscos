# Banco de dados

## Onde fica

Na instalação Windows, o banco principal fica em:

```text
%LOCALAPPDATA%\PoolPetiscos\data\pool-petiscos.db
```

O menu Iniciar contém o atalho **Pool Petiscos > Dados e backups**, que abre a
pasta sem iniciar o caixa.

Não mova nem edite o arquivo principal enquanto o sistema estiver aberto. Para
auditoria, use a cópia preparada pelo próprio sistema.

## Como obter uma cópia segura

1. Abra **Financeiro**.
2. Localize **Proteção dos dados**.
3. Selecione **Baixar banco completo**.
4. Guarde o arquivo `pool-petiscos.db` em uma pasta de revisão.

Essa ação usa o mecanismo de backup do SQLite e verifica a integridade antes do
download. Ela não interrompe o caixa e não altera os dados.

O botão **Exportar backup** gera um JSON voltado à restauração pelo sistema. O
botão **Baixar banco completo** gera o SQLite voltado à auditoria técnica.

## O que pode ser consultado

| Consulta | Conteúdo |
| --- | --- |
| `vw_produtos` | nome, categoria, preço e estoque |
| `vw_vendas` | data, total, forma de pagamento e quantidade de itens |
| `vw_comandas` | cliente, situação do preparo, horários e pagamento |
| `vw_itens_venda` | itens e valores de cada venda |
| `vw_despesas` | despesas registradas |
| `vw_movimentos_caixa` | sangrias e suprimentos |
| `vw_fechamentos_caixa` | saldos esperado, contado e diferença |

As tabelas internas `app_state` e `state_history` garantem gravação atômica e
recuperação de revisões. Para leitura comum, prefira as consultas `vw_*`.

## Inspeção pelo código

Na raiz do projeto:

```powershell
npm run database:inspect
npm run database:inspect -- --view produtos
npm run database:inspect -- --view vendas --limit 50
npm run database:inspect -- --view comandas --limit 50
```

O script abre o arquivo em modo somente leitura. Para inspecionar uma cópia em
outro caminho:

```powershell
npm run database:inspect -- --database "C:\Caminho\pool-petiscos.db"
```

Também é possível abrir a cópia no
[DB Browser for SQLite](https://sqlitebrowser.org/), selecionar a aba de dados
e escolher uma das consultas `vw_*`.

## Backups

Com OneDrive configurado:

```text
OneDrive\Pool Petiscos\Backups
```

Sem OneDrive:

```text
%LOCALAPPDATA%\PoolPetiscos\backups
```

O sistema mantém 30 cópias diárias verificadas. Atualizar ou desinstalar o
programa não apaga o banco, músicas ou backups.

## Privacidade

O banco pode conter histórico de vendas e informações operacionais. Nunca envie
uma cópia real para o repositório público, Issues, Pull Requests ou mensagens de
suporte. Para diagnóstico, compartilhe apenas o relatório sem dados gerado por
`npm run database:inspect`.
