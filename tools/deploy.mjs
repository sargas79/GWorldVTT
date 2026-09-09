/**
 * Copies (or links) the built system into a local Foundry data directory.
 *
 * Configure it by copying `foundry-config.example.json` to `foundry-config.json`
 * and setting `dataPath` to your Foundry Data folder. That file is gitignored so
 * everyone's local path stays out of the repository.
 */

import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM_ID = "gworld";

async function loadConfig() {
  const configPath = join(projectRoot, "foundry-config.json");
  if (!existsSync(configPath)) {
    console.error(
      "No foundry-config.json found.\n" +
        "Copy foundry-config.example.json to foundry-config.json and set dataPath to your\n" +
        "Foundry Data directory (the folder containing systems/, worlds/, and modules/).",
    );
    process.exit(1);
  }
  return JSON.parse(await readFile(configPath, "utf8"));
}

async function main() {
  const config = await loadConfig();
  const distPath = join(projectRoot, "dist");

  if (!existsSync(distPath)) {
    console.error("No dist/ directory. Run `npm run build` first.");
    process.exit(1);
  }

  const systemsDir = join(config.dataPath, "systems");
  if (!existsSync(systemsDir)) {
    console.error(`No systems/ directory under ${config.dataPath}. Is dataPath correct?`);
    process.exit(1);
  }

  const target = join(systemsDir, SYSTEM_ID);

  // Remove whatever is there now, whether it is a real directory or a stale link.
  if (existsSync(target)) {
    const stats = await lstat(target);
    if (stats.isSymbolicLink()) await rm(target);
    else await rm(target, { recursive: true, force: true });
  }

  if (config.symlink) {
    // A junction works on Windows without requiring elevated privileges.
    await symlink(distPath, target, process.platform === "win32" ? "junction" : "dir");
    console.log(`Linked ${target} -> ${distPath}`);
  } else {
    await mkdir(target, { recursive: true });
    await cp(distPath, target, { recursive: true });
    console.log(`Copied dist/ to ${target}`);
  }
}

await main();
