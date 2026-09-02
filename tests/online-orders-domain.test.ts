import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePublicOrderInput,
  priceOnlineOrder,
  transitionForAction,
} from "../features/online-orders/domain";

const now = 1_800_000_000_000;

function validOrder() {
  return {
    fulfillmentMode: "pickup",
    customerName: "Maria",
    customerNote: "",
    paymentMethod: "Débito",
    catalogVersion: 4,
    deviceToken: "device-token-1234567890",
    formStartedAt: now - 2_000,
    website: "",
    items: [{ productId: "x-bacon", quantity: 2, note: "Sem cebola" }],
  };
}

test("valida pedido público e limpa os textos", () => {
  const parsed = parsePublicOrderInput(
    { ...validOrder(), customerName: "  Maria  " },
    now,
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.customerName, "Maria");
});

test("exige token de mesa e nome para retirada", () => {
  assert.equal(
    parsePublicOrderInput(
      { ...validOrder(), fulfillmentMode: "table", tableToken: "" },
      now,
    ).ok,
    false,
  );
  assert.equal(
    parsePublicOrderInput({ ...validOrder(), customerName: "" }, now).ok,
    false,
  );
});

test("rejeita honeypot, envio instantâneo e itens repetidos", () => {
  assert.equal(
    parsePublicOrderInput({ ...validOrder(), website: "bot" }, now).ok,
    false,
  );
  assert.equal(
    parsePublicOrderInput({ ...validOrder(), formStartedAt: now - 50 }, now).ok,
    false,
  );
  assert.equal(
    parsePublicOrderInput(
      {
        ...validOrder(),
        items: [
          { productId: "x-bacon", quantity: 1 },
          { productId: "x-bacon", quantity: 1 },
        ],
      },
      now,
    ).ok,
    false,
  );
});

test("recalcula preço no servidor e aplica taxas existentes", () => {
  const catalog = new Map([
    ["x-bacon", { productId: "x-bacon", priceCents: 1499, available: true }],
  ]);
  assert.deepEqual(
    priceOnlineOrder(
      [{ productId: "x-bacon", quantity: 2, note: "" }],
      catalog,
      "Débito",
    ),
    {
      subtotalCents: 2998,
      surchargeRate: 0.03,
      surchargeCents: 90,
      totalCents: 3088,
    },
  );
  assert.equal(
    priceOnlineOrder(
      [{ productId: "indisponivel", quantity: 1, note: "" }],
      catalog,
      "Pix",
    ),
    null,
  );
});

test("bloqueia saltos e retrocessos na máquina de estados", () => {
  assert.equal(transitionForAction("pending", "accept"), "accepted");
  assert.equal(transitionForAction("accepted", "start"), "preparing");
  assert.equal(transitionForAction("preparing", "ready"), "ready");
  assert.equal(transitionForAction("ready", "complete"), "completed");
  assert.equal(transitionForAction("pending", "complete"), null);
  assert.equal(transitionForAction("completed", "cancel"), null);
});
