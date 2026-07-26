import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { patchVinextWindowsStaticCache } from "../scripts/prepare-standalone.mjs";

async function createRuntime(source) {
  const root = await mkdtemp(path.join(tmpdir(), "pool-standalone-test-"));
  const runtimeDirectory = path.join(
    root,
    "node_modules",
    "vinext",
    "dist",
    "server",
  );
  await mkdir(runtimeDirectory, { recursive: true });
  const cachePath = path.join(runtimeDirectory, "static-file-cache.js");
  await writeFile(cachePath, source, "utf8");
  return { root, cachePath };
}

test("normaliza os caminhos do cache standalone para URLs", async (t) => {
  const runtime = await createRuntime(
    "const item = { relativePath: path.relative(base, batch[j]), };",
  );
  t.after(() => rm(runtime.root, { recursive: true, force: true }));

  const first = await patchVinextWindowsStaticCache(runtime.root);
  assert.equal(first.changed, true);
  assert.match(
    await readFile(runtime.cachePath, "utf8"),
    /\.split\(path\.sep\)\.join\("\/"\)/,
  );

  const second = await patchVinextWindowsStaticCache(runtime.root);
  assert.equal(second.changed, false);
});

test("interrompe o build quando o runtime mudou inesperadamente", async (t) => {
  const runtime = await createRuntime("const relativePath = unknownApi();");
  t.after(() => rm(runtime.root, { recursive: true, force: true }));

  await assert.rejects(
    patchVinextWindowsStaticCache(runtime.root),
    /não pôde ser aplicado com segurança/,
  );
});
