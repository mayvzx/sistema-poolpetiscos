import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { validateArtifact } from "./validate-artifact.mjs";

const executable = resolve("node_modules", "vinext", "dist", "cli.js");

const child = spawn(process.execPath, [executable, "build"], {
  stdio: "inherit",
});

const timeout = setTimeout(() => {
  child.kill();
}, 3 * 60 * 1000);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code ?? 1));
});
clearTimeout(timeout);

if (exitCode !== 0) {
  process.exitCode = exitCode;
} else {
  await validateArtifact();
}
