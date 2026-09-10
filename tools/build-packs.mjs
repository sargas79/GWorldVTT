/**
 * Compiles the reviewable JSON in `packs-src/` into the LevelDB packs Foundry
 * loads from `dist/packs/`.
 *
 * Compendium content lives in git as plain JSON so it can be diffed and
 * reviewed; the binary packs are a build artifact, never committed.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compilePack } from "@foundryvtt/foundryvtt-cli";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "packs-src");
const OUT = join(projectRoot, "dist", "packs");

/** Every value a Foundry document needs that the source JSON should not repeat. */
function normalise(entry, type) {
  return {
    _id: entry._id,
    name: entry.name,
    type: entry.type ?? type,
    img: entry.img ?? undefined,
    system: entry.system ?? {},
  };
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`No packs-src/ directory at ${SOURCE}.`);
    process.exit(1);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const packs = (await readdir(SOURCE, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (!packs.length) {
    console.log("No packs to build.");
    return;
  }

  for (const pack of packs) {
    const dir = join(SOURCE, pack);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));

    const documents = [];
    for (const file of files) {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8"));
      const entries = Array.isArray(raw) ? raw : [raw];
      for (const entry of entries) documents.push(normalise(entry, pack));
    }

    await compilePack(dir, join(OUT, pack), { yaml: false, recursive: false, log: false });
    console.log(`  ${pack}: ${documents.length} documents`);
  }

  console.log(`Built ${packs.length} pack(s) into dist/packs/`);
}

await main();
