import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function validateArtifact(projectRoot = process.cwd()) {
  const workerPath = resolve(projectRoot, "dist", "server", "index.js");
  const hostingPath = resolve(projectRoot, "dist", ".openai", "hosting.json");

  await Promise.all([access(workerPath), access(hostingPath)]);
  JSON.parse(await readFile(hostingPath, "utf8"));

  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set(
    "sites-validation",
    `${process.pid}-${Date.now()}`,
  );
  const worker = await import(workerUrl.href);
  if (!worker.default || typeof worker.default.fetch !== "function") {
    throw new Error(
      "dist/server/index.js precisa exportar um Worker ESM com default.fetch.",
    );
  }
  console.log("Artefato Sites validado.");
}

const executedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (executedDirectly) {
  await validateArtifact();
}
