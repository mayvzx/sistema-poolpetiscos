# Contribuindo

Este repositório é o código de um produto em validação. Mudanças devem ser
pequenas, revisáveis e acompanhadas de teste proporcional ao risco.

## Fluxo

1. crie uma branch com prefixo `codex/` ou `feature/`;
2. mantenha banco, backups, logs, certificados e credenciais fora do Git;
3. atualize a documentação quando a operação mudar;
4. execute `npm run check`;
5. abra um Pull Request explicando impacto para a operadora e validação feita.

Não use dados reais da lanchonete em testes, screenshots, Issues ou Pull
Requests. Os testes devem criar dados temporários e descartáveis.

Leia [docs/development/DESENVOLVIMENTO.md](docs/development/DESENVOLVIMENTO.md)
antes de alterar persistência, instalador ou integrações.
