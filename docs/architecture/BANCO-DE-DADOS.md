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
| `vw_vendas` | sessão, data, operador, subtotal, acréscimo, total, pagamento e itens |
| `vw_comandas` | sessão, cliente, operador, modo de atendimento, situação, horários e pagamento |
| `vw_itens_venda` | sessão, itens, observações e valores de cada venda |
| `vw_despesas` | sessão de caixa e despesas registradas |
| `vw_movimentos_caixa` | sessão de caixa, sangrias e suprimentos |
| `vw_fechamentos_caixa` | sessão, responsáveis, saldos, diferença, fundo e retirada |
| `vw_operadores` | perfis e situação de configuração do PIN, sem expor o verificador |

As tabelas internas `app_state` e `state_history` garantem gravação atômica e
recuperação de revisões. Para leitura comum, prefira as consultas `vw_*`.

Cada nova venda guarda o subtotal, a taxa aplicada, o valor do acréscimo e o
total final. Vendas antigas são migradas com acréscimo zero, sem recalcular nem
alterar os valores históricos. O estado também guarda se a fila de comandas
está ativa; vendas diretas ficam concluídas e não aparecem como pedidos em
andamento.

Os arquivos exportados e os backups automáticos mantêm o `app_state` completo,
mas removem os snapshots redundantes de `state_history` antes da verificação de
integridade. Cada arquivo continua restaurável e fica menor para guardar
localmente ou enviar ao Google Drive.

Os PINs nunca aparecem nessas consultas. O estado interno contém somente um
verificador derivado com PBKDF2-SHA-256 e um sal aleatório por perfil, não o PIN
em texto legível. Ainda assim, trate o banco e os backups como arquivos
confidenciais.

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

O sistema mantém 30 cópias diárias, 12 semanais e 12 mensais, todas verificadas
pelo SQLite. A interface também pode sincronizá-las com a pasta visível **Pool
Petiscos - Backups** no Google Drive.

Uma restauração aceita somente um banco íntegro que contenha as tabelas
`app_state` e `state_history` e um estado válido. Antes da substituição, o banco
atual recebe uma cópia `pool-petiscos-antes-restauracao-...db`. Atualizações
preservam os dados; na desinstalação, o usuário escolhe entre preservar ou
apagar os dados locais.

## Privacidade

O banco pode conter histórico de vendas e informações operacionais. Nunca envie
uma cópia real para o repositório público, Issues, Pull Requests ou mensagens de
suporte. Para diagnóstico, compartilhe apenas o relatório sem dados gerado por
`npm run database:inspect`.
