# Desenvolvimento e manutenção

## Ambiente

- Node.js 22.13 ou superior;
- npm;
- Python 3.10 ou superior;
- Inno Setup 6 somente para gerar o instalador Windows.

```powershell
npm ci
npm run dev
```

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | interface local com recarregamento |
| `npm run check` | tipos, lint, testes, build e artefato |
| `npm run test:companion` | serviço Python, SQLite, launcher e YouTube |
| `npm run database:inspect` | relatório somente leitura do banco instalado |
| `npm run build:windows:unsigned` | instalador de protótipo sem assinatura |

## Convenções

- dinheiro é armazenado como número e arredondado nas regras de domínio;
- datas persistidas pela interface usam timestamp Unix em milissegundos;
- o serviço responde mensagens seguras e grava detalhes apenas nos logs;
- toda operação de estado usa controle de revisão;
- recursos locais nunca devem aceitar escrita da demonstração pública;
- arquivos gerados ficam em diretórios ignorados pelo Git.

## Organização de uma alteração

1. atualize tipos e regras de domínio;
2. implemente a interface e o serviço necessário;
3. acrescente testes próximos à fronteira alterada;
4. atualize a documentação operacional ou arquitetural;
5. execute `npm run check`;
6. faça um commit com uma mudança completa;
7. publique a branch e revise o Pull Request;
8. depois do merge, gere o instalador e publique a versão no GitHub e no Sites.

## Versões

`package.json`, `package-lock.json` e `SERVICE_VERSION` precisam usar a mesma
versão. O build do instalador recusa fonte sem commit e registra o commit exato
em `BUILD-MANIFEST.json`.

## Arquivos gerados

Estes diretórios podem ser apagados e recriados:

```text
dist/
output/
build/
.sites-runtime/
.wrangler/
node_modules/
.venv/
```

O cache pesado do instalador fica fora do OneDrive em
`%LOCALAPPDATA%\PoolPetiscos\installer-build`.
