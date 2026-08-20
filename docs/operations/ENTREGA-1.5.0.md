# Entrega da versão 1.5.0

## Finalidade desta versão

A versão 1.5.0 está preparada para ser instalada no computador da Pool
Petiscos e avaliada por Elaine e Poolblay em uso assistido. Ela reúne o caixa,
as comandas, o estoque, o financeiro, os perfis protegidos por PIN e os backups
em um único aplicativo Windows.

Esta é uma versão real para teste, não uma demonstração com dados fictícios.
Mesmo assim, durante a avaliação ela deve funcionar em paralelo ao processo
atual da lanchonete. A liberação para operação oficial depende da validação
presencial dos fluxos e equipamentos descritos neste documento.

## O que está pronto para testar

- instalação local sem exigir Node.js, Python ou ferramentas de
  desenvolvimento no computador;
- escolha entre os perfis Elaine e Poolblay, com PIN individual de 6 números;
- recuperação de PIN por uma chave única que deve ser guardada fora do caixa;
- vendas em dinheiro, Pix ou cartão, troco e baixa de estoque por produto;
- criação e acompanhamento das comandas por etapa;
- cadastro, edição, reposição e exclusão de produtos sem alterar vendas antigas;
- abertura, movimentos, despesas, sangrias, suprimentos e fechamento do caixa;
- totais e vendas separados por operador;
- backups locais automáticos diários, semanais e mensais;
- conexão da conta Google escolhida pela proprietária e cópias no Google Drive;
- restauração de uma cópia local, da nuvem ou de um arquivo SQLite selecionado;
- desinstalação com escolha entre preservar os dados ou fazer uma remoção
  completa da máquina de teste.

## Instalação e primeiro teste

1. Feche programas desnecessários e execute `PoolPetiscos-Setup-1.5.0.exe`.
2. Como o instalador ainda não possui certificado Authenticode, o Windows pode
   exibir um aviso do SmartScreen. Confirme que o arquivo veio do pacote de
   entrega e confira seu SHA-256 antes de continuar.
3. Mantenha marcada a inicialização automática se este for o computador do
   caixa.
4. Abra o atalho **Pool Petiscos**, escolha cada perfil e crie PINs diferentes.
5. Baixe as duas chaves de recuperação e guarde-as em local seguro fora do
   computador.
6. Faça uma venda fictícia, mova a comanda até **Entregue** e confira o
   Financeiro e o Estoque.
7. Em **Configurações > Backups automáticos**, execute um backup local.
8. Selecione **Conectar Google Drive**. O navegador abrirá a tela oficial do
   Google para escolher e autorizar a conta da proprietária.
9. Confirme que uma cópia aparece na lista da nuvem e faça uma restauração de
   teste antes de usar dados reais.

O Pool Petiscos usa o escopo `drive.file`: ele acessa somente os arquivos que o
próprio aplicativo criar ou que forem abertos por ele. O token de acesso fica
protegido pelo Windows no perfil do usuário. O Google Drive não gera cobrança
do aplicativo para este uso normal; o limite prático é o espaço disponível na
conta Google conectada.

## Situação da maquininha GETNET

A integração automática com a GETNET ainda não está ativa. Nesta entrega, o
operador seleciona Pix ou cartão no sistema, realiza e confere o pagamento na
maquininha e somente então finaliza a venda. O sistema não simula uma aprovação
da GETNET.

O caminho mais provável para a maquininha tradicional é TEF, mas faltam dois
dados antes do desenvolvimento e da homologação: uma foto legível da etiqueta
traseira para confirmar o modelo exato e a confirmação, junto à GETNET, de que
o contrato atual possui ou aceita TEF. Se o equipamento for Get Smart, o fluxo
técnico e de certificação é outro. Por isso, nenhuma dessas opções foi
presumida nesta versão.

## Limites conhecidos da entrega

- o instalador e o executável ainda não têm assinatura digital Authenticode;
- cartão e Pix dependem de conferência manual na maquininha;
- o sistema não emite NFC-e e não substitui orientação contábil ou fiscal;
- estoque por ingredientes, receitas, impressão térmica e regras de desconto,
  cancelamento, entrega e fiado dependem da validação presencial;
- a primeira conexão e a primeira restauração do Google Drive precisam ser
  confirmadas na conta e no computador reais da proprietária;
- a operação oficial deve aguardar um período assistido em paralelo ao método
  atual.

## Desinstalação depois do teste

Abra **Pool Petiscos > Desinstalar Pool Petiscos** no menu Iniciar. O
desinstalador perguntará se deve apagar também banco, músicas, PINs,
configurações, logs e backups locais:

- escolha **Não** para remover o aplicativo e preservar os dados para uma
  futura reinstalação;
- escolha **Sim** para uma remoção completa da máquina usada no teste.

Arquivos enviados ao Google Drive ou armazenados em uma pasta do OneDrive não
são apagados pelo desinstalador.

## Informações úteis para suporte

Se ocorrer algum problema, anote o horário, a tela e o que estava sendo feito.
Os registros técnicos ficam em:

```text
%LOCALAPPDATA%\PoolPetiscos\logs
```

Os dados e backups locais ficam em:

```text
%LOCALAPPDATA%\PoolPetiscos
```

Não envie o banco real ao GitHub. Quando for necessário compartilhar dados para
suporte, use uma cópia autorizada e um canal privado.
