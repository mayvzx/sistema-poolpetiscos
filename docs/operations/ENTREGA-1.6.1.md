# Entrega da versão 1.6.1

A versão 1.6.1 é uma manutenção de confiabilidade sobre a 1.6.0. Ela preserva
o fluxo de caixa, os relatórios, as melhorias de música e todas as funções já
entregues, acrescentando validações e diagnósticos para reduzir falhas
silenciosas.

## Atualização segura da máquina da lanchonete

Execute `PoolPetiscos-Setup-1.6.1.exe` diretamente por cima da versão instalada.
Não desinstale a versão anterior e não selecione remoção de dados. O instalador
mantém o mesmo identificador e diretório e preserva banco, vendas, caixa,
estoque, comandas, PINs, chave de recuperação, músicas, backups e credenciais
protegidas do Google Drive.

Antes de substituir os arquivos, o instalador encerra o Pool Petiscos e cria
uma cópia do SQLite em `update-backups`, conferida por SHA-256. A atualização é
interrompida se essa proteção não puder ser concluída.

## Melhorias desta manutenção

- o banco recusa registros incompletos, valores inválidos, totais incoerentes
  e IDs duplicados antes de gravar ou restaurar;
- a inicialização confere a integridade do SQLite e prepara o esquema de forma
  transacional;
- falhas reais do banco, do backup automático e da sincronização aparecem com
  mensagens distintas, sem serem substituídas por um aviso genérico;
- falhas em ciclos automáticos ficam registradas nos logs para diagnóstico;
- downloads de Excel, PDF e chave de recuperação aguardam tempo suficiente
  antes de liberar o arquivo temporário do navegador;
- código repetido de download, verificação criptográfica e bordas da planilha
  foi centralizado.

## Conferência após atualizar

1. confirme que vendas, caixa, estoque, PIN e conta do Google Drive permanecem;
2. abra o Financeiro e gere um relatório Excel e um PDF;
3. execute um backup manual e confirme que ele aparece como concluído;
4. feche e reabra o sistema para confirmar que os novos registros permanecem;
5. teste uma música autorizada e a barra de progresso.

A integração com a Getnet permanece manual. O terminal fotografado é um
Newland SP630 Pro; a automação exige contratação e habilitação de TEF pela
Getnet, além de um integrador homologado.
