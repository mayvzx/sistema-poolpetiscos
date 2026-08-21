import {
  cashFlowReportHeading,
  formatCashFlowDate,
  type CashFlowReport,
} from "./cash-flow";
import { downloadBytes } from "./browser-download";
import { currency } from "./domain";

const BRAND_ORANGE = "FFE66E22";
const BRAND_DARK = "FF302B29";
const ENTRY_GREEN = "FFDDF4E8";
const ENTRY_GREEN_TEXT = "FF23734F";
const EXIT_PINK = "FFFDE7EC";
const EXIT_PINK_TEXT = "FFB41622";
const LIGHT_BORDER = "FFE0D9D5";

function safeObservation(value: string) {
  return value.replaceAll("•", "-");
}

function thinBorder() {
  const side = { style: "thin" as const, color: { argb: LIGHT_BORDER } };
  return {
    top: { ...side },
    left: { ...side },
    bottom: { ...side },
    right: { ...side },
  };
}

export async function createCashFlowWorkbook(report: CashFlowReport) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pool Petiscos & Lanches";
  workbook.company = "Pool Petiscos & Lanches";
  workbook.subject = `Fluxo de caixa - ${report.range.label}`;
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet("Fluxo de Caixa", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2,
      },
    },
    views: [{ state: "frozen", ySplit: 7 }],
    properties: { defaultRowHeight: 21 },
  });
  sheet.columns = [
    { key: "date", width: 15 },
    { key: "movement", width: 17 },
    { key: "description", width: 38 },
    { key: "amount", width: 18 },
    { key: "observation", width: 36 },
  ];

  sheet.mergeCells("A1:E1");
  const title = sheet.getCell("A1");
  title.value = cashFlowReportHeading(report);
  title.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_ORANGE } };
  sheet.getRow(1).height = 40;

  sheet.mergeCells("A3:A4");
  const business = sheet.getCell("A3");
  business.value = "POOL PETISCOS & LANCHES";
  business.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  business.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  business.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };

  sheet.mergeCells("D3:E3");
  sheet.mergeCells("D4:E4");
  const summaryLabels = [
    { cell: "B3", text: "ENTRADAS", fill: ENTRY_GREEN, color: ENTRY_GREEN_TEXT },
    { cell: "C3", text: "SAÍDAS", fill: EXIT_PINK, color: EXIT_PINK_TEXT },
    { cell: "D3", text: "SALDO DO PERÍODO", fill: "FFF1EEEB", color: BRAND_DARK },
  ];
  summaryLabels.forEach(({ cell, text, fill, color }) => {
    const target = sheet.getCell(cell);
    target.value = text;
    target.font = { name: "Aptos", size: 10, bold: true, color: { argb: color } };
    target.alignment = { horizontal: "center", vertical: "middle" };
    target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  });

  const firstDataRow = 8;
  const lastDataRow = firstDataRow + Math.max(report.entries.length - 1, 0);
  const amountRange = `$D$${firstDataRow}:$D$${lastDataRow}`;
  const movementRange = `$B$${firstDataRow}:$B$${lastDataRow}`;
  const incomingCell = sheet.getCell("B4");
  const outgoingCell = sheet.getCell("C4");
  const balanceCell = sheet.getCell("D4");
  if (report.entries.length) {
    incomingCell.value = {
      formula: `SUMIF(${movementRange},"Entrada",${amountRange})`,
      result: report.incoming,
    };
    outgoingCell.value = {
      formula: `SUMIF(${movementRange},"Saída",${amountRange})`,
      result: report.outgoing,
    };
    balanceCell.value = { formula: "B4-C4", result: report.balance };
  } else {
    incomingCell.value = 0;
    outgoingCell.value = 0;
    balanceCell.value = 0;
  }
  [incomingCell, outgoingCell, balanceCell].forEach((cell, index) => {
    cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    cell.font = {
      name: "Aptos Display",
      size: 15,
      bold: true,
      color: { argb: index === 0 ? ENTRY_GREEN_TEXT : index === 1 ? EXIT_PINK_TEXT : BRAND_DARK },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index === 0 ? ENTRY_GREEN : index === 1 ? EXIT_PINK : "FFF1EEEB" },
    };
  });
  sheet.getRow(3).height = 23;
  sheet.getRow(4).height = 30;

  sheet.mergeCells("A6:E6");
  const period = sheet.getCell("A6");
  period.value = `Período: ${report.range.label} - ${report.entries.length} movimentação(ões)`;
  period.font = { name: "Aptos", size: 10, italic: true, color: { argb: "FF6D6561" } };
  period.alignment = { horizontal: "left", vertical: "middle" };

  const header = sheet.getRow(7);
  header.values = ["DATA", "MOVIMENTAÇÃO", "DESCRIÇÃO", "VALOR", "OBSERVAÇÃO"];
  header.height = 25;
  header.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_ORANGE } };
    cell.border = thinBorder();
  });

  report.entries.forEach((entry, index) => {
    const row = sheet.getRow(firstDataRow + index);
    row.values = [
      new Date(entry.timestamp),
      entry.movement,
      entry.description,
      entry.amount,
      safeObservation(entry.observation),
    ];
    row.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(4).numFmt = '"R$" #,##0.00';
    row.getCell(2).font = {
      name: "Aptos",
      size: 10,
      bold: true,
      color: { argb: entry.movement === "Entrada" ? ENTRY_GREEN_TEXT : EXIT_PINK_TEXT },
    };
    row.eachCell((cell) => {
      const columnNumber = Number(cell.col);
      cell.alignment = {
        horizontal:
          columnNumber === 4 ? "right" : columnNumber <= 2 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: entry.movement === "Entrada" ? ENTRY_GREEN : EXIT_PINK },
      };
      cell.border = thinBorder();
    });
    row.height = 24;
  });

  if (!report.entries.length) {
    sheet.mergeCells("A8:E8");
    const empty = sheet.getCell("A8");
    empty.value = "Nenhuma movimentação encontrada neste período.";
    empty.font = { name: "Aptos", size: 11, italic: true, color: { argb: "FF776F6B" } };
    empty.alignment = { horizontal: "center", vertical: "middle" };
    empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF8F6" } };
    sheet.getRow(8).height = 36;
  }

  sheet.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: Math.max(7, lastDataRow), column: 5 },
  };
  sheet.pageSetup.printArea = `A1:E${Math.max(8, lastDataRow)}`;
  sheet.headerFooter.oddFooter = "Pool Petiscos & Lanches - Página &P de &N";

  const output = await workbook.xlsx.writeBuffer();
  return output instanceof Uint8Array
    ? output
    : new Uint8Array(output as ArrayBuffer);
}

export async function createCashFlowPdf(report: CashFlowReport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();

  document.setFillColor(230, 110, 34);
  document.rect(0, 0, pageWidth, 23, "F");
  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(19);
  document.text(cashFlowReportHeading(report), pageWidth / 2, 14.5, { align: "center" });

  const cards = [
    { x: 12, width: 82, label: "ENTRADAS", value: report.incoming, fill: [221, 244, 232], text: [35, 115, 79] },
    { x: 101, width: 82, label: "SAÍDAS", value: report.outgoing, fill: [253, 231, 236], text: [180, 22, 34] },
    { x: 190, width: 95, label: "SALDO DO PERÍODO", value: report.balance, fill: [241, 238, 235], text: [48, 43, 41] },
  ] as const;
  cards.forEach((card) => {
    document.setFillColor(card.fill[0], card.fill[1], card.fill[2]);
    document.roundedRect(card.x, 28, card.width, 17, 2.5, 2.5, "F");
    document.setTextColor(card.text[0], card.text[1], card.text[2]);
    document.setFontSize(8);
    document.setFont("helvetica", "bold");
    document.text(card.label, card.x + 5, 34);
    document.setFontSize(14);
    document.text(currency.format(card.value), card.x + 5, 41);
  });

  document.setTextColor(85, 76, 72);
  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  document.text(`Período: ${report.range.label}`, 12, 51);
  document.text(`${report.entries.length} movimentação(ões)`, pageWidth - 12, 51, { align: "right" });

  autoTable(document, {
    startY: 55,
    margin: { left: 12, right: 12, bottom: 14 },
    head: [["DATA", "MOVIMENTAÇÃO", "DESCRIÇÃO", "VALOR", "OBSERVAÇÃO"]],
    body: report.entries.length
      ? report.entries.map((entry) => [
          formatCashFlowDate(entry.timestamp),
          entry.movement,
          entry.description,
          currency.format(entry.amount),
          safeObservation(entry.observation),
        ])
      : [["", "", "Nenhuma movimentação encontrada neste período.", "", ""]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.6,
      textColor: [48, 43, 41],
      lineColor: [224, 217, 213],
      lineWidth: 0.2,
      valign: "middle",
    },
    headStyles: {
      fillColor: [230, 110, 34],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 28, halign: "center" },
      1: { cellWidth: 34, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 75 },
      3: { cellWidth: 34, halign: "right", fontStyle: "bold" },
      4: { cellWidth: 102 },
    },
    didParseCell: (hook) => {
      if (hook.section !== "body" || !report.entries.length) return;
      const entry = report.entries[hook.row.index];
      hook.cell.styles.fillColor =
        entry.movement === "Entrada" ? [221, 244, 232] : [253, 231, 236];
      if (hook.column.index === 1) {
        hook.cell.styles.textColor =
          entry.movement === "Entrada" ? [35, 115, 79] : [180, 22, 34];
      }
    },
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setTextColor(119, 111, 107);
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    document.text("Pool Petiscos & Lanches", 12, 202);
    document.text(`Página ${page} de ${pageCount}`, pageWidth - 12, 202, { align: "right" });
  }

  return new Uint8Array(document.output("arraybuffer"));
}

export async function downloadCashFlowWorkbook(report: CashFlowReport) {
  const bytes = await createCashFlowWorkbook(report);
  downloadBytes(
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `fluxo-de-caixa-${report.range.slug}.xlsx`,
  );
}

export async function downloadCashFlowPdf(report: CashFlowReport) {
  const bytes = await createCashFlowPdf(report);
  downloadBytes(bytes, "application/pdf", `fluxo-de-caixa-${report.range.slug}.pdf`);
}
