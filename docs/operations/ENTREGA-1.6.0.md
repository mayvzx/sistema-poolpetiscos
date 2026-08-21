# Entrega da versão 1.6.0

A versão 1.6.0 foi preparada após a aprovação presencial da proprietária. Ela
deve ser instalada por cima da 1.5.2 que permanece em uso no computador da
lanchonete. Não desinstale a versão anterior e não selecione remoção de dados.

## Atualização preservando os registros

Execute `PoolPetiscos-Setup-1.6.0.exe` com o Pool Petiscos fechado. O instalador
usa o mesmo identificador e o mesmo diretório da versão anterior, preservando o
banco, vendas, caixa, estoque, comandas, PINs, chave de recuperação, músicas,
backups e conexão do Google Drive.

Antes de substituir os arquivos, ele encerra a versão instalada e cria uma
cópia verificada do banco em:

```text
%LOCALAPPDATA%\PoolPetiscos\update-backups\pre-update-AAAAMMDD-HHMMSS
```

Se o banco não puder ser copiado ou a cópia não tiver o mesmo SHA-256, a
instalação para sem alterar o aplicativo existente.

## Novidades para a proprietária

- tabela de fluxo de caixa no Financeiro, seguindo o modelo da planilha usada
  anteriormente;
- filtros de hoje, mês atual e período escolhido;
- totais de entradas, saídas e saldo;
- download em Excel com filtros, cores e fórmulas;
- download em PDF pronto para imprimir ou enviar;
- débito e crédito separados nos novos registros, com compatibilidade para o
  histórico antigo gravado como cartão;
- componentes de download de música atualizados e mensagens de erro mais
  simples, mantendo o diagnóstico completo nos logs.

## Maquininha Getnet

As fotos confirmam um Newland SP630 Pro, um POS clássico. O caixa continua com
confirmação manual: o operador realiza o pagamento na maquininha, confere a
aprovação e seleciona a forma correspondente no sistema.

A automação depende de a Getnet confirmar a contratação/habilitação de POS TEF
para o estabelecimento e indicar um integrador homologado. O fluxo do Get Smart
Android não é compatível com o SP630 Pro. Nenhuma aprovação automática será
simulada enquanto essa contratação e a homologação não existirem.

## Conferência recomendada no dia da atualização

1. confirme no Financeiro que as vendas feitas até o dia continuam visíveis;
2. confira o perfil, o PIN e o status conectado do Google Drive;
3. gere uma planilha Excel e um PDF do mês;
4. execute um backup manual e confirme que aparece como concluído;
5. baixe uma faixa autorizada e teste a reprodução;
6. registre uma venda pequena, confira a comanda e o relatório e somente depois
   prossiga com o uso normal.

O instalador ainda não possui assinatura Authenticode, portanto o Windows pode
mostrar um aviso de origem desconhecida. Confira a origem e o SHA-256 informado
na entrega antes de executar.
