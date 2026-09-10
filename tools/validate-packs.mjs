/**
 * Validates compendium source JSON before it is compiled.
 *
 * The Basic Set's tables extract from PDF with columns misaligned, so a
 * transcription error is easy to make and invisible once packed. This checks
 * the things that can be checked mechanically: unique ids, known types, valid
 * attribute/difficulty pairs, and damage strings that actually parse.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "packs-src");

const ITEM_TYPES = new Set([
  "trait", "skill", "technique", "equipment", "armor", "shield", "language",
]);
const SKILL_ATTRIBUTES = new Set(["ST", "DX", "IQ", "HT", "Will", "Per"]);
const DIFFICULTIES = new Set(["E", "A", "H", "VH"]);
const DAMAGE_TYPES = new Set([
  "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
]);
const HIT_LOCATIONS = new Set([
  "torso", "skull", "eye", "face", "neck", "vitals", "groin", "arm", "leg", "hand", "foot",
]);

/** Mirrors parseDiceAdds in the rules engine: `2d`, `1d-2`, `3d+1`, or a flat number. */
const DICE = /^(\d*)d([+-]\d+)?$|^([+-]?\d+)$/;

/**
 * parseDiceAdds lowercases and strips internal whitespace before matching, so
 * the validator must too — otherwise "2D + 1" passes the engine but fails here,
 * breaking the same-grammar guarantee this file exists to provide.
 */
function parsesAsDice(value) {
  return DICE.test(String(value ?? "").trim().toLowerCase().replace(/\s+/g, ""));
}

const problems = [];
const ids = new Map();

function check(condition, file, name, message) {
  if (!condition) problems.push(`${file} — ${name}: ${message}`);
}

function validateItem(entry, file) {
  const name = entry.name ?? "(unnamed)";
  check(Boolean(entry._id), file, name, "missing _id");
  check(Boolean(entry.name), file, name, "missing name");
  check(ITEM_TYPES.has(entry.type), file, name, `unknown type "${entry.type}"`);

  if (entry._id) {
    if (ids.has(entry._id)) {
      problems.push(`${file} — ${name}: duplicate _id, also used by ${ids.get(entry._id)}`);
    }
    ids.set(entry._id, name);
    check(/^[A-Za-z0-9]{16}$/.test(entry._id), file, name, `_id must be 16 alphanumerics`);
  }

  const sys = entry.system ?? {};

  if (entry.type === "skill") {
    check(SKILL_ATTRIBUTES.has(sys.attribute), file, name, `bad attribute "${sys.attribute}"`);
    check(DIFFICULTIES.has(sys.difficulty), file, name, `bad difficulty "${sys.difficulty}"`);
    for (const d of sys.defaults ?? []) {
      if (d.from === "skill") check(Boolean(d.skill), file, name, "skill default names no skill");
      else check(SKILL_ATTRIBUTES.has(d.attribute), file, name, `bad default attribute "${d.attribute}"`);
    }
  }

  if (entry.type === "technique") {
    check(["A", "H"].includes(sys.difficulty), file, name, `technique difficulty must be A or H`);
    check(Boolean(sys.prerequisite), file, name, "technique names no prerequisite skill");
    check((sys.defaultModifier ?? 0) <= 0, file, name, "technique default modifier must be <= 0");
  }

  if (entry.type === "armor") {
    check(Number.isInteger(sys.dr) && sys.dr >= 0, file, name, `bad DR "${sys.dr}"`);
    for (const loc of sys.locations ?? []) {
      check(HIT_LOCATIONS.has(loc), file, name, `unknown hit location "${loc}"`);
    }
  }

  if (entry.type === "shield") {
    check(Number.isInteger(sys.db) && sys.db >= 0, file, name, `bad DB "${sys.db}"`);
  }

  for (const mode of [...(sys.meleeModes ?? []), ...(sys.rangedModes ?? [])]) {
    check(DAMAGE_TYPES.has(mode.damageType), file, name, `unknown damage type "${mode.damageType}"`);
    check(
      ["thr", "sw", "fixed"].includes(mode.damageBase),
      file, name, `bad damageBase "${mode.damageBase}"`,
    );
    if (mode.damageBase === "fixed") {
      check(
        parsesAsDice(mode.damageFormula),
        file, name, `fixed damage "${mode.damageFormula}" does not parse`,
      );
    }
    check(Boolean(mode.skill), file, name, "attack mode names no skill");
  }
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.log("No packs-src/ to validate.");
    return;
  }

  const packs = (await readdir(SOURCE, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let count = 0;
  for (const pack of packs) {
    const dir = join(SOURCE, pack);
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8"));
      for (const entry of Array.isArray(raw) ? raw : [raw]) {
        validateItem(entry, `${pack}/${file}`);
        count++;
      }
    }
  }

  if (problems.length) {
    console.error(`${problems.length} problem(s) in ${count} entries:\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`packs-src: ${count} entries valid across ${packs.length} pack(s)`);
}

await main();
