import assert from "node:assert/strict";
import test from "node:test";
import {
  findNewPendingOrderCount,
  pendingOrderIds,
} from "../features/pool-petiscos/online-order-alert";

test("detecta somente pedidos pendentes que chegaram desde a última consulta", () => {
  const previous = pendingOrderIds([
    { id: "one", status: "pending" },
    { id: "done", status: "completed" },
  ]);
  const next = pendingOrderIds([
    { id: "one", status: "pending" },
    { id: "two", status: "pending" },
    { id: "done", status: "completed" },
  ]);
  assert.equal(findNewPendingOrderCount(previous, next), 1);
});

test("não alerta na primeira leitura para não repetir pedidos antigos", () => {
  const next = pendingOrderIds([{ id: "one", status: "pending" }]);
  assert.equal(findNewPendingOrderCount(null, next), 0);
});
