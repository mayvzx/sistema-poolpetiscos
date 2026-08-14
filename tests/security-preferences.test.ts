import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  parseDisplayPreferences,
  resolveTheme,
} from "../features/pool-petiscos/display-preferences";
import {
  createOperatorCredential,
  sanitizePin,
  validateOperatorPin,
  verifyOperatorPin,
} from "../features/pool-petiscos/operator-security";

test("aceita um PIN de seis dígitos e bloqueia padrões previsíveis", () => {
  assert.equal(validateOperatorPin("482907"), null);
  assert.match(validateOperatorPin("123456") ?? "", /menos comum|sequência/);
  assert.match(validateOperatorPin("121212") ?? "", /repetidos/);
  assert.match(validateOperatorPin("111111") ?? "", /menos comum|repita/);
  assert.match(validateOperatorPin("12345") ?? "", /6 números/);
  assert.equal(sanitizePin("48a29-076"), "482907");
});

test("guarda somente um verificador com sal e confirma o PIN correto", async () => {
  const first = await createOperatorCredential("482907");
  const second = await createOperatorCredential("482907");
  assert.equal(first.algorithm, "PBKDF2-SHA-256");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyOperatorPin("482907", first), true);
  assert.equal(await verifyOperatorPin("482908", first), false);
  assert.equal(JSON.stringify(first).includes("482907"), false);
});

test("valida preferências visuais locais e resolve o tema automático", () => {
  assert.deepEqual(
    parseDisplayPreferences({ fontScale: 120, themeMode: "dark" }),
    { fontScale: 120, themeMode: "dark" },
  );
  assert.equal(
    parseDisplayPreferences({ fontScale: 123, themeMode: "light" }),
    null,
  );
  assert.equal(
    parseDisplayPreferences({ fontScale: 140, themeMode: "system" }),
    null,
  );
  assert.deepEqual(DEFAULT_DISPLAY_PREFERENCES, {
    fontScale: 100,
    themeMode: "system",
  });
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
});

