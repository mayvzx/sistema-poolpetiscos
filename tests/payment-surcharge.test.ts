import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSalePricing,
  surchargeRateForPayment,
} from "../features/pool-petiscos/payment-surcharge";

test("aplica 3% no débito e 6% no crédito", () => {
  assert.deepEqual(calculateSalePricing(100, "Débito"), {
    subtotal: 100,
    surchargeRate: 0.03,
    surchargeAmount: 3,
    total: 103,
  });
  assert.deepEqual(calculateSalePricing(100, "Crédito"), {
    subtotal: 100,
    surchargeRate: 0.06,
    surchargeAmount: 6,
    total: 106,
  });
});

test("não altera Pix ou Dinheiro e arredonda em centavos", () => {
  assert.equal(surchargeRateForPayment("Pix"), 0);
  assert.equal(calculateSalePricing(9.99, "Dinheiro").total, 9.99);
  assert.deepEqual(calculateSalePricing(9.99, "Crédito"), {
    subtotal: 9.99,
    surchargeRate: 0.06,
    surchargeAmount: 0.6,
    total: 10.59,
  });
});
