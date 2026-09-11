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
const TRAIT_CATEGORIES = new Set(["advantage", "disadvantage", "quirk", "perk"]);
const SKILL_ATTRIBUTES = new Set(["ST", "DX", "IQ", "HT", "Will", "Per"]);
const DIFFICULTIES = new Set(["E", "A", "H", "VH", "W"]);
const DAMAGE_TYPES = new Set([
  "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
]);
const EQUIPMENT_CATEGORIES = new Set(["weapon", "tool", "consumable", "misc"]);
const HIT_LOCATIONS = new Set([
  "torso", "skull", "eye", "face", "neck", "vitals", "groin", "arm", "leg", "hand", "foot",
]);

/**
 * Mirrors parseDiceAdds in the rules engine: `2d`, `1d-2`, `3d+1`, `6dx10`, or
 * a flat number.
 */
const DICE = /^(\d*)d([+-]\d+)?(x\d+)?$|^([+-]?\d+)$/;

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

  if (entry.type === "trait") {
    check(TRAIT_CATEGORIES.has(sys.category), file, name, `bad category "${sys.category}"`);
    check(Number.isInteger(sys.points), file, name, "points must be an integer");
    check(Number.isInteger(sys.pointsPerLevel), file, name, "pointsPerLevel must be an integer");
    check(
      Number.isInteger(sys.levels) && sys.levels >= 0,
      file, name, `levels must be a non-negative integer, got "${sys.levels}"`,
    );

    // The sign of the cost has to agree with the category. This is the one thing
    // a mis-parsed trait gets wrong that nothing downstream would catch: the
    // ledger would quietly credit a disadvantage as if it were bought. Perks are
    // added to the advantage total and quirks to a negative bucket of their own,
    // so both carry the same obligation as the category they are counted with.
    //
    // A trait may legitimately carry both fields: Magery is 5 points for Magery 0
    // plus 10 per level, and totalPoints adds them. So every populated field is
    // checked, not whichever one looks like the price -- otherwise an advantage
    // with points -5 and pointsPerLevel 10 passes while totalPoints is negative.
    // A field that already failed the integer check is skipped here, so a missing
    // cost reports "points must be an integer" once rather than following it with
    // "must not have points of undefined".
    const negative = sys.category === "disadvantage" || sys.category === "quirk";
    for (const [field, cost] of [
      ["points", sys.points],
      ["pointsPerLevel", sys.pointsPerLevel],
    ]) {
      if (cost === 0 || !Number.isInteger(cost)) continue;
      check(
        negative ? cost < 0 : cost > 0,
        file, name,
        `${sys.category} must not have ${field} of ${cost}`,
      );
    }

    // A tabled cost is what totalPoints reads when it is there, so every step
    // carries the same obligation to agree in sign with the category as the
    // flat and per-level figures above.
    const table = sys.costTable ?? [];
    check(Array.isArray(table), file, name, "costTable must be a list");
    for (const step of Array.isArray(table) ? table : []) {
      check(Number.isInteger(step), file, name, `costTable step "${step}" must be an integer`);
      if (!Number.isInteger(step) || step === 0) continue;
      check(
        negative ? step < 0 : step > 0,
        file, name, `${sys.category} must not have a costTable step of ${step}`,
      );
    }
    // The steps are totals, not increments, so they only ever move away from
    // zero: a later level of a trait always costs at least as much as an
    // earlier one. Wealth 10/20/30/50/75, Appearance 4/12/12/16/16/20.
    for (let i = 1; i < (Array.isArray(table) ? table.length : 0); i++) {
      check(
        Math.abs(table[i]) >= Math.abs(table[i - 1]),
        file, name,
        `costTable step ${i + 1} (${table[i]}) costs less than step ${i} (${table[i - 1]})`,
      );
    }

    check(
      Number.isInteger(sys.maxLevels) && sys.maxLevels >= 0,
      file, name, `maxLevels must be a non-negative integer, got "${sys.maxLevels}"`,
    );
    // A level cap below the number of steps priced would make steps that can
    // never be bought, and a table longer than the cap is the likelier error.
    if (Array.isArray(table) && table.length > 0 && sys.maxLevels > 0) {
      check(
        table.length <= sys.maxLevels,
        file, name,
        `costTable prices ${table.length} levels but maxLevels is ${sys.maxLevels}`,
      );
    }
    for (const levelName of sys.levelNames ?? []) {
      check(typeof levelName === "string", file, name, "levelNames must all be strings");
    }
  }

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
    // The ceiling is relative to the prerequisite skill and may sit above it --
    // Arm Lock reaches the skill +4 -- but a technique that started below its
    // own default could never be bought up to where the book says it begins.
    check(
      Number.isInteger(sys.maxRelativeToPrerequisite),
      file, name, `maxRelativeToPrerequisite must be an integer`,
    );
    check(
      (sys.maxRelativeToPrerequisite ?? 0) >= (sys.defaultModifier ?? 0),
      file, name,
      `ceiling ${sys.maxRelativeToPrerequisite} is below the default ${sys.defaultModifier}`,
    );
  }

  if (entry.type === "armor") {
    check(Number.isInteger(sys.dr) && sys.dr >= 0, file, name, `bad DR "${sys.dr}"`);
    for (const loc of sys.locations ?? []) {
      check(HIT_LOCATIONS.has(loc), file, name, `unknown hit location "${loc}"`);
    }

    // Split DR is only meaningful as a pair: a second figure with nothing saying
    // when it applies would silently never be used, and a list of damage types
    // with no second figure would promise protection that does not exist.
    const split = sys.drSplit ?? null;
    const against = sys.drSplitAppliesTo ?? [];
    check(
      (split === null) === (against.length === 0),
      file, name, "split DR needs both a second figure and the damage it applies to",
    );
    if (split !== null) {
      check(
        Number.isInteger(split) && split >= 0 && split <= sys.dr,
        file, name, `split DR ${split} must be a non-negative integer no greater than ${sys.dr}`,
      );
      // Both tables agree that crushing takes the lower figure, so a split that
      // omits it has been read from the wrong footnote.
      check(against.includes("cr"), file, name, "split DR must apply to crushing");
    }
    for (const t of against) {
      check(DAMAGE_TYPES.has(t), file, name, `unknown damage type "${t}" in split DR`);
    }
  }

  if (entry.type === "shield") {
    check(Number.isInteger(sys.db) && sys.db >= 0, file, name, `bad DB "${sys.db}"`);
  }

  if (entry.type === "equipment" && sys.category !== undefined) {
    check(EQUIPMENT_CATEGORIES.has(sys.category), file, name, `bad category "${sys.category}"`);
  }

  for (const mode of [...(sys.meleeModes ?? []), ...(sys.rangedModes ?? [])]) {
    // An affliction does no damage at all: the target rolls an attribute at a
    // penalty and something happens to them. Its damage fields are inert, so
    // checking them would demand a formula that is meant to be absent.
    if (mode.affliction) {
      check(
        ["ST", "DX", "IQ", "HT", "Will", "Per"].includes(mode.afflictionAttribute),
        file, name, `affliction resisted with "${mode.afflictionAttribute}", which is not an attribute`,
      );
      check(
        Number.isInteger(mode.afflictionModifier) && mode.afflictionModifier <= 0,
        file, name, `affliction modifier ${mode.afflictionModifier} must be a non-positive integer`,
      );
      check(Boolean(mode.skill), file, name, "attack mode names no skill");
      continue;
    }

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
    // The data model's own bound, restated here so a divisor outside it is
    // caught before the pack is built rather than when Foundry loads it. A
    // divisor below 1 is legitimate -- it multiplies the target's DR -- but zero
    // or negative is not.
    check(
      typeof mode.armorDivisor === "number" && mode.armorDivisor >= 0.1,
      file, name, `armor divisor ${mode.armorDivisor} is out of range`,
    );

    check(Boolean(mode.skill), file, name, "attack mode names no skill");
  }

  // The data model's bounds on a ranged mode, restated so a bad figure is
  // caught before the pack is built rather than when Foundry loads it.
  for (const mode of sys.rangedModes ?? []) {
    check(
      Number.isInteger(mode.bulk) && mode.bulk <= 0,
      file, name, `bulk ${mode.bulk} must be a non-positive integer`,
    );
    check(
      Number.isInteger(mode.recoil) && mode.recoil >= 0,
      file, name, `recoil ${mode.recoil} must be a non-negative integer`,
    );
    check(
      Number.isInteger(mode.rateOfFire) && mode.rateOfFire >= 1,
      file, name, `rate of fire ${mode.rateOfFire} must be a positive integer`,
    );
    check(
      typeof mode.maxRange === "number" && mode.maxRange >= 0,
      file, name, `maximum range ${mode.maxRange} must not be negative`,
    );
    check(
      typeof mode.halfDamageRange === "number" && mode.halfDamageRange >= 0,
      file, name, `half-damage range ${mode.halfDamageRange} must not be negative`,
    );
    // Half-damage range is where damage starts dropping off, so it sits at or
    // below the maximum; the two swapped is a column read in the wrong order.
    check(
      !(mode.halfDamageRange > 0 && mode.halfDamageRange > mode.maxRange),
      file, name,
      `half-damage range ${mode.halfDamageRange} exceeds maximum range ${mode.maxRange}`,
    );
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
