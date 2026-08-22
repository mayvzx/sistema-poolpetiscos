import { downloadBytes } from "./browser-download";
import { type CashSessionSummary, shortCashSessionId } from "./cash-session-summary";
import { currency, formatDateKey } from "./domain";
import { formatCashFlowDateTime } from "./cash-flow";

export async function createCashSessionSummaryPdf(
  summary: CashSessionSummary,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const { closure } = summary;

  document.setFillColor(48, 43, 41);
  document.rect(0, 0, pageWidth, 30, "F");
  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(18);
  document.text("RESUMO DE FECHAMENTO", 14, 14);
  document.setFontSize(9);
  document.setFont("helvetica", "normal");
  document.text(
    `Sessão ${shortCashSessionId(closure.sessionId)}`,
    14,
    22,
  );
  document.text(
    formatCashFlowDateTime(closure.closedAt),
    pageWidth - 14,
    22,
    { align: "right" },
  );

  const cards = [
    ["VENDAS", currency.format(summary.salesTotal)],
    ["SAÍDAS", currency.format(summary.expenseTotal)],
    ["RESULTADO", currency.format(summary.result)],
  ];
  cards.forEach(([label, value], index) => {
    const x = 14 + index * 61;
    document.setFillColor(index === 1 ? 255 : 247, index === 1 ? 240 : 245, index === 1 ? 241 : 242);
    document.roundedRect(x, 36, 55, 22, 2.5, 2.5, "F");
    document.setTextColor(95, 87, 83);
    document.setFont("helvetica", "bold");
    document.setFontSize(7.5);
    document.text(label, x + 4, 43);
    document.setTextColor(index === 1 ? 180 : 48, index === 1 ? 22 : 43, index === 1 ? 34 : 41);
    document.setFontSize(12);
    document.text(value, x + 4, 52);
  });

  autoTable(document, {
    startY: 65,
    margin: { left: 14, right: 14 },
    theme: "grid",
    head: [["SESSÃO DE CAIXA", "VALOR / RESPONSÁVEL"]],
    body: [
      ["Abertura", formatCashFlowDateTime(closure.openedAt)],
      ["Aberto por", closure.openedByOperatorName],
      ["Fechamento", formatCashFlowDateTime(closure.closedAt)],
      ["Fechado por", closure.closedByOperatorName],
      ["Valor de abertura", currency.format(closure.openingBalance)],
      ["Saldo esperado em dinheiro", currency.format(closure.expectedBalance)],
      ["Valor contado", currency.format(closure.countedBalance)],
      ["Diferença", currency.format(closure.difference)],
      ["Retirada no fechamento", currency.format(closure.withdrawalAmount)],
      ["Fundo deixado no caixa", currency.format(closure.remainingBalance)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.4 },
    headStyles: { fillColor: [230, 110, 34], textColor: 255 },
  });

  const tableEnd = (document as typeof document & {
    lastAutoTable?: { finalY: number };
  }).lastAutoTable?.finalY ?? 130;
  autoTable(document, {
    startY: tableEnd + 8,
    margin: { left: 14, right: 14 },
    theme: "striped",
    head: [["FORMA DE PAGAMENTO", "TOTAL"]],
    body: [
      ["Dinheiro", currency.format(summary.paymentTotals.Dinheiro)],
      ["Pix", currency.format(summary.paymentTotals.Pix)],
      ["Débito", currency.format(summary.paymentTotals.Débito)],
      ["Crédito", currency.format(summary.paymentTotals.Crédito)],
      ["Cartão (registro legado)", currency.format(summary.paymentTotals.Cartão)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [48, 43, 41], textColor: 255 },
  });

  document.setDrawColor(224, 217, 213);
  document.line(14, 284, pageWidth - 14, 284);
  document.setTextColor(119, 111, 107);
  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.text(
    "Pool Petiscos & Lanches - resumo gerado pelo caixa local",
    14,
    289,
  );
  document.text("Página 1 de 1", pageWidth - 14, 289, { align: "right" });

  const output = document.output("arraybuffer");
  return new Uint8Array(output);
}

export async function downloadCashSessionSummaryPdf(
  summary: CashSessionSummary,
) {
  const output = await createCashSessionSummaryPdf(summary);
  const { closure } = summary;
  const filename = `fechamento-${formatDateKey(closure.closedAt)}-${shortCashSessionId(closure.sessionId)}.pdf`;
  downloadBytes(output, "application/pdf", filename);
}
