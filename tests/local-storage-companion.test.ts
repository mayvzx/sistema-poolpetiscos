import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { loadLocalPoolState } from "../features/pool-petiscos/local-storage-companion";

function mockFetch(t: TestContext, factory: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
  globalThis.fetch = factory;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
}

test("preserva a mensagem do serviço quando o banco local falha", async (t) => {
  const message = "O banco local não passou na verificação de integridade.";
  mockFetch(
    t,
    async () =>
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
  );

  await assert.rejects(loadLocalPoolState(), new RegExp(message));
});

test("identifica resposta de erro que não seja JSON", async (t) => {
  mockFetch(
    t,
    async () =>
      new Response("falha interna", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
  );

  await assert.rejects(
    loadLocalPoolState(),
    /O serviço local retornou uma resposta inválida/,
  );
});
