import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const windowsRelativePath =
  "relativePath: path.relative(base, batch[j]),";
const urlRelativePath =
  'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),';

export async function patchVinextWindowsStaticCache(standaloneRoot) {
  const cachePath = path.resolve(
    standaloneRoot,
    "node_modules",
    "vinext",
    "dist",
    "server",
    "static-file-cache.js",
  );
  const source = await readFile(cachePath, "utf8");

  if (source.includes(urlRelativePath)) {
    return { cachePath, changed: false };
  }

  const occurrences = source.split(windowsRelativePath).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      "O runtime do vinext mudou e o ajuste de caminhos do Windows não " +
        `pôde ser aplicado com segurança (${occurrences} ocorrências).`,
    );
  }

  await writeFile(
    cachePath,
    source.replace(windowsRelativePath, urlRelativePath),
    "utf8",
  );
  return { cachePath, changed: true };
}

export async function prepareStandalone(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const outDir = path.resolve(root, "dist");
  const vinextPackageRoot = path.resolve(root, "node_modules", "vinext");
  const standaloneModuleUrl = pathToFileURL(
    path.resolve(vinextPackageRoot, "dist", "build", "standalone.js"),
  ).href;
  const { emitStandaloneOutput } = await import(standaloneModuleUrl);

  await emitStandaloneOutput({
    root,
    outDir,
    vinextPackageRoot,
  });

  const result = await patchVinextWindowsStaticCache(
    path.resolve(outDir, "standalone"),
  );
  console.log(
    result.changed
      ? "Standalone preparado com caminhos de assets compatíveis com Windows."
      : "Standalone já estava preparado para servir assets no Windows.",
  );
}

const executedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  await prepareStandalone();
}
