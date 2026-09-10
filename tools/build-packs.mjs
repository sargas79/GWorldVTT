/**
 * Compiles the reviewable JSON in `packs-src/` into the LevelDB packs Foundry
 * loads from `dist/packs/`.
 *
 * Compendium content lives in git as plain JSON so it can be diffed and
 * reviewed; the binary packs are a build artifact, never committed.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "packs-src");
const OUT = join(projectRoot, "dist", "packs");

/**
 * Every value a Foundry document needs that the source JSON should not repeat.
 *
 * `_key` is required and easy to miss: compilePack silently skips any document
 * without one (`if (!doc._key) continue`), so omitting it produces an empty
 * pack that compiles without error.
 */
function normalise(entry, type) {
  return {
    _key: `!items!${entry._id}`,
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

    // compilePack reads one document per file, so the arrays that make the
    // source reviewable have to be exploded into a staging directory first.
    // Passing it packs-src directly would hand it the raw arrays.
    const staging = join(OUT, `.staging-${pack}`);
    await mkdir(staging, { recursive: true });
    for (const doc of documents) {
      await writeFile(
        join(staging, `${doc._id}.json`),
        JSON.stringify(doc, null, 2),
        "utf8",
      );
    }

    const target = join(OUT, pack);
    await compilePack(staging, target, { yaml: false, recursive: false, log: false });
    await rm(staging, { recursive: true, force: true });

    // compilePack skips malformed documents silently, so an empty pack compiles
    // without error. Confirm the data actually landed rather than trusting it.
    const written = await extractPack(target, join(OUT, `.check-${pack}`), {
      yaml: false, log: false,
    }).then(async () => {
      const found = (await readdir(join(OUT, `.check-${pack}`))).length;
      await rm(join(OUT, `.check-${pack}`), { recursive: true, force: true });
      return found;
    });

    if (written !== documents.length) {
      throw new Error(
        `${pack}: compiled ${written} documents but expected ${documents.length}. ` +
          `Every document needs a _key of the form !items!<id>.`,
      );
    }
    console.log(`  ${pack}: ${documents.length} documents`);
  }

  console.log(`Built ${packs.length} pack(s) into dist/packs/`);
}

await main();
