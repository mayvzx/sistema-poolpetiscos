# Documentação do Pool Petiscos

Este diretório separa documentação de produto, arquitetura, operação e
desenvolvimento. Nenhum banco de dados, backup ou dado real da lanchonete deve
ser colocado aqui ou enviado ao GitHub.

## Comece por aqui

- [Manual do operador](operations/MANUAL-DO-OPERADOR.md): uso diário no caixa.
- [Banco de dados](architecture/BANCO-DE-DADOS.md): localização, cópia segura e
  consultas disponíveis.
- [Arquitetura](architecture/ARQUITETURA.md): componentes e fluxo dos dados.
- [Desenvolvimento](development/DESENVOLVIMENTO.md): ambiente, comandos e
  convenções.
- [Guia de revisão](development/GUIA-DE-REVISAO.md): ordem sugerida para ler o
  código.

## Produto

- [Decisões e roadmap](product/DECISOES-E-ROADMAP.md): escopo confirmado,
  pendências e próximos marcos.

## Operação e implantação

- [Entrega da versão 1.5.0](operations/ENTREGA-1.5.0.md): escopo, instalação,
  validação presencial, limitações e suporte da versão para teste.
- [Mensagem para a proprietária](operations/MENSAGEM-PARA-PROPRIETARIA.md):
  texto em linguagem simples, pronto para envio.
- [Instalador Windows](operations/INSTALADOR-WINDOWS.md): geração, assinatura,
  instalação, atualização e diagnóstico.
- [Instalação e pagamentos](operations/INSTALACAO-E-PAGAMENTOS.md): arquitetura
  local e requisitos para uma futura integração de maquininha.

## Regra para documentação

Uma alteração que muda operação, armazenamento, instalação ou segurança deve
atualizar o documento correspondente no mesmo commit. O histórico de versões
fica no [CHANGELOG](../CHANGELOG.md).
