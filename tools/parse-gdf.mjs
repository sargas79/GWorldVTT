/**
 * Builds the trait, skill and technique compendia from a GCA 5 data file.
 *
 * The books' own tables were extracted with `pdftotext` first, and that work is
 * still in `tools/parse-*.mjs`. This reads the same books through GCA's data
 * file instead, which is structured rather than typeset, and so gets right what
 * a column reflow could not:
 *
 *   - Traits the book prices from a table -- Wealth, Appearance, Duty -- whose
 *     costs appear in a sidebar the trait's own entry never repeats.
 *   - Individual traits rather than the headings above them. The PDF pass read
 *     "Acute Senses" off a heading; the real traits are Acute Hearing, Acute
 *     Taste and Smell, Acute Touch and Acute Vision, priced separately.
 *   - Skill defaults from other skills, spelled out per skill.
 *   - Techniques, which the PDF pass did not attempt at all.
 *
 * What it deliberately does not read is `description(...)`. The compendia carry
 * names and statistics; the books' prose stays in the books. `tools/gdf.mjs`
 * drops those fields when it parses a record, so nothing downstream has to
 * remember to.
 *
 * Usage: node tools/parse-gdf.mjs <file.gdf> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fields, isExpression, nameOf, records, splitTop } from "./gdf.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The sections holding traits, and the category each becomes. */
const TRAIT_SECTIONS = new Map([
  ["ADVANTAGES", "advantage"],
  ["PERKS", "perk"],
  ["DISADVANTAGES", "disadvantage"],
  ["QUIRKS", "quirk"],
]);

/** Attribute names the data model accepts, from the spellings GCA uses. */
const ATTRIBUTES = new Map([
  ["ST", "ST"], ["DX", "DX"], ["IQ", "IQ"], ["HT", "HT"],
  ["Will", "Will"], ["Per", "Per"], ["Perception", "Per"],
]);

const DIFFICULTIES = new Set(["E", "A", "H", "VH"]);

/**
 * A name GCA fills in from the character sheet rather than the book:
 * `%skilllist%` is a menu, `[sense]` is a blank for the player. Neither is a
 * trait anyone can look up, so they are not compendium entries.
 */
const PLACEHOLDER = /[%[\]]/;

/** The page citation, e.g. "B271" or "B271, B276". */
function reference(page) {
  const pages = [...(page ?? "").matchAll(/\bB(\d+)\b/g)].map((m) => m[1]);
  if (pages.length === 0) return "Basic Set: Characters";
  return `Basic Set: Characters p. ${pages.join(", ")}`;
}

/** Whether a record cites a page in the Basic Set, which is all this reads. */
function isBasicSet(f) {
  return /\bB\d/.test(f.get("page") ?? "");
}

const id = (kind, name) =>
  createHash("sha1").update(`${kind}:${name}`).digest("hex").slice(0, 16);

/**
 * Ids already published for a pack, by name.
 *
 * A compendium entry's id is part of its UUID, and a character sheet that
 * dragged a skill in stores that UUID. Regenerating an id because the source
 * changed would break every such reference, so a name that already exists keeps
 * the id it already had.
 */
function existingIds(pack) {
  const dir = join(projectRoot, "packs-src", pack);
  const byName = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      byName.set(doc.name, doc._id);
    }
  }
  return byName;
}

/**
 * A trait's cost, which GCA writes as the total at each level: "2/4" is 2
 * points for one level and 4 for two, and "10/20/30/50/75" is Wealth.
 *
 * Where every step is a whole multiple of the first, the trait is priced evenly
 * and a per-level figure says everything. Where it is not, the table is what
 * the book prints and the table is what is kept.
 *
 * `displaycost` overrides all of this when it names a single figure. GCA folds
 * some separate traits in as extra levels of another -- Enhanced Time Sense as
 * Combat Reflexes 2, Very Fit as Fit 2 -- and sets displaycost to the cost of
 * the trait proper. Reading the table there would price Combat Reflexes at 45.
 */
function parseCost(raw, f) {
  const display = f.get("displaycost");
  if (display !== undefined && /^-?\d+$/.test(display.trim())) {
    return { points: Number(display.trim()), levels: 0, pointsPerLevel: 0, costTable: [] };
  }

  const text = (raw ?? "").trim();
  if (!/^-?\d+(\/-?\d+)*$/.test(text)) return null;

  const steps = text.split("/").map(Number);
  if (steps.length === 1) {
    return { points: steps[0], levels: 0, pointsPerLevel: 0, costTable: [] };
  }
  if (steps.every((v, i) => v === steps[0] * (i + 1))) {
    return { points: 0, levels: 1, pointsPerLevel: steps[0], costTable: [] };
  }
  return { points: 0, levels: 1, pointsPerLevel: 0, costTable: steps };
}

/** The level cap from `upto()`, where it states a plain number. */
function parseUpTo(value) {
  const m = /^(\d+)/.exec((value ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/**
 * The book's name for each level, level 1 first.
 *
 * A leading entry in square brackets is GCA's name for level 0 -- "[Average]"
 * for someone of ordinary Wealth -- which is the absence of the trait, so it is
 * dropped and the rest slide down to match the cost table. The list is cut at
 * the first GCA directive, since `#buildlist(...)` generates names from the
 * sheet rather than naming them.
 */
function parseLevelNames(value) {
  if (value === undefined) return [];
  const parts = splitTop(value).map((p) => p.trim().replace(/^"|"$/g, "").trim());
  const stop = parts.findIndex((p) => /[#%]/.test(p));
  const named = stop === -1 ? parts : parts.slice(0, stop);
  const levels = named.length > 0 && /^\[.*\]$/.test(named[0]) ? named.slice(1) : named;
  return levels.some((n) => n !== "") ? levels : [];
}

function parseTraits(recs, reject) {
  const ids = existingIds("traits");
  const out = [];
  const taken = new Map();

  for (const r of recs) {
    const category = TRAIT_SECTIONS.get(r.section);
    if (!category) continue;

    const f = fields(r.text);
    if (!isBasicSet(f)) continue;

    const bare = nameOf(r);
    if (PLACEHOLDER.test(bare)) { reject(bare, "name is a GCA placeholder"); continue; }

    const cost = parseCost(splitTop(r.text)[1], f);
    if (!cost) { reject(bare, `cost not a number: "${splitTop(r.text)[1] ?? ""}"`); continue; }

    // A handful of names are both an advantage and a disadvantage -- Wealth
    // runs from Dead Broke to Multimillionaire, and the book prices the halves
    // separately. Two entries called "Wealth" would be indistinguishable in a
    // compendium list, so the later one says which half it is.
    const clash = taken.get(bare);
    const name = clash && clash !== category
      ? `${bare} (${category[0].toUpperCase()}${category.slice(1)})`
      : bare;
    if (taken.has(name)) { reject(name, "duplicate name"); continue; }
    taken.set(bare, category);
    taken.set(name, category);

    out.push({
      _id: ids.get(name) ?? id("trait", name),
      name,
      type: "trait",
      system: {
        category,
        points: cost.points,
        levels: cost.levels,
        pointsPerLevel: cost.pointsPerLevel,
        costTable: cost.costTable,
        levelNames: parseLevelNames(f.get("levelnames")),
        maxLevels: parseUpTo(f.get("upto")),
        reactionModifier: 0,
        description: "",
        reference: reference(f.get("page")),
      },
    });
  }
  return out;
}

/**
 * One entry of a `default(...)` list, as the data model spells defaults.
 * Returns null for the entries this cannot use: GCA wildcards such as
 * `SK:Sword!`, which stand for a group rather than a skill, and anything
 * computed from the sheet.
 */
function parseDefault(entry) {
  const text = entry.trim();
  if (!text || isExpression(text) || text.endsWith("!")) return null;
  // `SK:[skill] - 6` is a blank GCA fills from the sheet, not a skill name.
  if (PLACEHOLDER.test(text)) return null;

  const m = /^"?(?:(ST|SK):)?(.+?)"?\s*(?:([+-])\s*(\d+))?$/.exec(text);
  if (!m) return null;

  const modifier = m[4] ? Number(`${m[3]}${m[4]}`) : 0;
  const target = m[2].trim().replace(/"$/, "");

  if (m[1] === "SK") {
    return { from: "skill", attribute: "DX", skill: target, modifier };
  }
  const attribute = ATTRIBUTES.get(target);
  if (!attribute) return null;
  return { from: "attribute", attribute, skill: "", modifier };
}

/**
 * A skill name marked for tech level. The marker belongs to the skill itself,
 * so it precedes a specialty: Armoury/TL (Body Armor), Guns/TL (Pistol).
 */
function withTechLevel(name) {
  const specialty = /^(.*?)(\s*\([^()]*\))$/.exec(name);
  return specialty ? `${specialty[1]}/TL${specialty[2]}` : `${name}/TL`;
}

function parseSkills(recs, reject) {
  const ids = existingIds("skills");
  const skills = [];
  const techniques = [];
  const taken = new Set();

  for (const r of recs) {
    if (r.section !== "SKILLS") continue;

    const f = fields(r.text);
    if (!isBasicSet(f)) continue;

    const bare = nameOf(r);
    if (PLACEHOLDER.test(bare)) { reject(bare, "name is a GCA placeholder"); continue; }
    // A wildcard skill such as Gun! stands in for a whole group at once
    // (p. 175). It has no difficulty the model can hold and is not a skill you
    // roll against, so it is reported rather than invented.
    if (bare.endsWith("!")) { reject(bare, "wildcard skill"); continue; }

    // The pair usually sits in the second field, but a few records state it as
    // type(IQ/VH) instead.
    const second = (splitTop(r.text)[1] ?? "").trim();
    const pair = /^type\(/.test(second) ? (f.get("type") ?? "") : second;
    const parts = pair.split("/");
    if (parts.length !== 2) { reject(bare, `no attribute/difficulty pair: "${pair}"`); continue; }

    const [attr, diff] = parts.map((p) => p.trim());

    if (attr === "Tech") {
      const technique = parseTechnique(bare, diff, f, ids, reject);
      if (technique) techniques.push(technique);
      continue;
    }

    const attribute = ATTRIBUTES.get(attr);
    if (!attribute) { reject(bare, `attribute not in the model: "${attr}"`); continue; }
    if (!DIFFICULTIES.has(diff)) { reject(bare, `difficulty not in the model: "${diff}"`); continue; }

    // GCA marks a skill that varies by tech level with tl(), where the book
    // prints "/TL" in the name. It goes on the skill, before any specialty:
    // the book prints "Guns/TL (Pistol)", not "Guns (Pistol)/TL".
    const name = f.has("tl") ? withTechLevel(bare) : bare;
    if (taken.has(name)) { reject(name, "duplicate name"); continue; }
    taken.add(name);

    const defaults = [];
    for (const entry of splitTop(f.get("default") ?? "")) {
      const parsed = parseDefault(entry);
      if (parsed) defaults.push(parsed);
    }

    skills.push({
      _id: ids.get(name) ?? id("skill", name),
      name,
      type: "skill",
      system: {
        attribute,
        difficulty: diff,
        points: 0,
        bonus: 0,
        defaults,
        techLevel: "",
        description: "",
        reference: reference(f.get("page")),
      },
    });
  }
  return { skills, techniques };
}

/**
 * A technique. GCA writes its default as the prerequisite skill's own level
 * with a penalty -- `default(SK:Karate::level - 4)` -- and its ceiling relative
 * to that skill, as `upto(prereq)` or `upto(prereq + 4)`.
 *
 * The skill the technique is bought off is the one in the default, not
 * whatever `needs()` lists: Horse Archery needs both Bow and Riding but is
 * bought off Bow, and only Bow is the prerequisite in the sense the data model
 * means. Its ceiling is written `upto(SK:Bow)` rather than `upto(prereq)`,
 * naming the same skill the long way round.
 */
function parseTechnique(name, difficulty, f, ids, reject) {
  if (difficulty !== "A" && difficulty !== "H") {
    reject(name, `technique difficulty not in the model: "${difficulty}"`);
    return null;
  }

  const def = /"?SK:([^"]+?)"?::level\s*(?:([+-])\s*(\d+))?/.exec(f.get("default") ?? "");
  if (!def) {
    reject(name, `default does not come off a skill: "${f.get("default") ?? ""}"`);
    return null;
  }
  const prerequisite = def[1].trim();
  const defaultModifier = def[3] ? Number(`${def[2]}${def[3]}`) : 0;
  if (defaultModifier > 0) { reject(name, "default is a bonus, not a penalty"); return null; }

  const upto = f.get("upto") ?? "";
  const relative = upto.replace(/"?SK:([^",]+)"?/g, (_, skill) =>
    skill.trim() === prerequisite ? "prereq" : skill,
  );
  if (!/prereq/i.test(relative)) {
    reject(name, `ceiling is not relative to the prerequisite: "${upto}"`);
    return null;
  }
  const cap = /prereq\s*(?:([+-])\s*(\d+))?/i.exec(relative);

  return {
    _id: ids.get(name) ?? id("technique", name),
    name,
    type: "technique",
    system: {
      difficulty,
      prerequisite,
      defaultModifier,
      points: 0,
      maxRelativeToPrerequisite: cap[2] ? Number(`${cap[1]}${cap[2]}`) : 0,
      description: "",
      reference: reference(f.get("page")),
    },
  };
}

function report(label, items, rejected) {
  console.log(`${label}: ${items.length}`);
  const reasons = rejected.reduce((a, r) => ((a[r.why] = (a[r.why] ?? 0) + 1), a), {});
  if (rejected.length) console.log(`  rejected: ${rejected.length}`);
  for (const [why, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(4)}  ${why}`);
  }
}

function main() {
  const [, , source, write] = process.argv;
  if (!source) {
    console.error("Usage: node tools/parse-gdf.mjs <file.gdf> [--write]");
    process.exit(1);
  }

  const recs = records(readFileSync(source, "utf8"));

  const traitRejects = [];
  const traits = parseTraits(recs, (what, why) => traitRejects.push({ what, why }));

  const skillRejects = [];
  const { skills, techniques } = parseSkills(recs, (what, why) => skillRejects.push({ what, why }));

  report("traits", traits, traitRejects);
  console.log(`  tabled costs: ${traits.filter((t) => t.system.costTable.length > 0).length}`);
  report("skills", skills, skillRejects);
  report("techniques", techniques, []);

  if (write === "--write") {
    const files = [
      ["traits", "basic-set-traits.json", traits],
      ["skills", "basic-set-skills.json", skills],
      ["skills", "basic-set-techniques.json", techniques],
    ];
    for (const [pack, file, docs] of files) {
      writeFileSync(
        join(projectRoot, "packs-src", pack, file),
        `${JSON.stringify(docs, null, 2)}\n`,
        "utf8",
      );
    }
    writeFileSync(
      join(projectRoot, "packs-src", "traits", ".rejected-gdf.txt"),
      traitRejects.map((r) => `${r.why}\t${r.what}`).join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "packs-src", "skills", ".rejected-gdf.txt"),
      skillRejects.map((r) => `${r.why}\t${r.what}`).join("\n"),
      "utf8",
    );
    console.log("\nwrote traits, skills and techniques");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
