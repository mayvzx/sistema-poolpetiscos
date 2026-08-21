import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCashFlowEntries,
  buildCashFlowReport,
  cashFlowReportHeading,
  createCashFlowRange,
} from "../features/pool-petiscos/cash-flow";
import {
  createCashFlowPdf,
  createCashFlowWorkbook,
} from "../features/pool-petiscos/cash-flow-export";
import type {
  CashMovement,
  Expense,
  Sale,
} from "../features/pool-petiscos/types";

const now = Date.parse("2026-08-20T16:00:00-03:00");

function sale(
  id: string,
  timestamp: number,
  total: number,
  payment: Sale["payment"],
): Sale {
  return {
    id,
    timestamp,
    total,
    payment,
    operatorId: "elaine",
    operatorName: "Elaine",
    items: [],
    customerName: "Cliente",
    orderStatus: "entregue",
    statusUpdatedAt: timestamp,
  };
}

const sales: Sale[] = [
  sale("PV-PIX", Date.parse("2026-08-19T12:00:00-03:00"), 290, "Pix"),
  sale(
    "PV-DEBITO",
    Date.parse("2026-08-19T13:00:00-03:00"),
    54.6,
    "Débito",
  ),
  sale(
    "PV-ANTIGA",
    Date.parse("2026-07-31T20:00:00-03:00"),
    90,
    "Dinheiro",
  ),
];

const expenses: Expense[] = [
  {
    id: "DS-BEBIDA",
    timestamp: Date.parse("2026-08-20T10:00:00-03:00"),
    description: "Compra de bebidas",
    category: "Bebidas",
    amount: 159.5,
    payment: "Dinheiro",
  },
];

const cashMovements: CashMovement[] = [
  {
    id: "MC-SUPRIMENTO",
    timestamp: Date.parse("2026-08-20T11:00:00-03:00"),
    description: "Troco adicional",
    amount: 100,
    kind: "suprimento",
  },
  {
    id: "MC-SANGRIA",
    timestamp: Date.parse("2026-08-20T14:00:00-03:00"),
    description: "Retirada do caixa",
    amount: 50,
    kind: "sangria",
  },
];

test("monta o fluxo de caixa por data e preserva a forma de pagamento", () => {
  const entries = buildCashFlowEntries({ sales, expenses, cashMovements });
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["PV-ANTIGA", "PV-PIX", "PV-DEBITO", "DS-BEBIDA", "MC-SUPRIMENTO", "MC-SANGRIA"],
  );
  assert.match(
    entries.find((entry) => entry.id === "PV-DEBITO")!.observation,
    /Débito/,
  );
  assert.equal(
    entries.find((entry) => entry.id === "DS-BEBIDA")!.movement,
    "Saída",
  );
});

test("filtra o mês e calcula entradas, saídas e saldo", () => {
  const entries = buildCashFlowEntries({ sales, expenses, cashMovements });
  const range = createCashFlowRange("month", now);
  const report = buildCashFlowReport(entries, range);

  assert.equal(range.fromKey, "2026-08-01");
  assert.equal(range.toKey, "2026-08-20");
  assert.equal(report.entries.length, 5);
  assert.equal(report.incoming, 444.6);
  assert.equal(report.outgoing, 209.5);
  assert.equal(report.balance, 235.1);
  assert.equal(cashFlowReportHeading(report), "FLUXO DE CAIXA - AGOSTO DE 2026");
});

test("valida períodos personalizados antes de gerar o relatório", () => {
  assert.throws(
    () => createCashFlowRange("custom", now, "2026-08-20", "2026-08-01"),
    /data inicial/,
  );
  assert.throws(
    () => createCashFlowRange("custom", now, "", "2026-08-20"),
    /Escolha as datas/,
  );
});

test("gera arquivos Excel e PDF reais e legíveis", async () => {
  const entries = buildCashFlowEntries({ sales, expenses, cashMovements });
  const report = buildCashFlowReport(entries, createCashFlowRange("month", now));

  const workbookBytes = await createCashFlowWorkbook(report);
  assert.equal(String.fromCharCode(...workbookBytes.slice(0, 2)), "PK");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(workbookBytes) as never);
  const sheet = workbook.getWorksheet("Fluxo de Caixa");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A1").value, "FLUXO DE CAIXA - AGOSTO DE 2026");
  assert.equal(sheet.getCell("B8").value, "Entrada");
  assert.equal(sheet.getCell("D8").value, 290);

  const pdfBytes = await createCashFlowPdf(report);
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 5)), "%PDF-");
  assert.ok(pdfBytes.byteLength > 5_000);
});
