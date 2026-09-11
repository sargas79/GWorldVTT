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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fields, isExpression, modes, nameOf, records, splitTop } from "./gdf.mjs";

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
function existingIds(...packs) {
  const byName = new Map();
  for (const pack of packs) {
    const dir = join(projectRoot, "packs-src", pack);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
        byName.set(doc.name, doc._id);
      }
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

function parseTraits(recs, reject, note) {
  // Advantages and disadvantages are separate compendia, but they are one
  // body of records in the source and share a name space: Wealth is both.
  const ids = existingIds("advantages", "disadvantages");
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

    // GCA prices a few tabled traits past the last step it prints, working the
    // rest out from a rule it holds elsewhere: Wealth is capped at 15 levels
    // but priced for 5, and Dread at 11 for 2. Carrying the higher cap would
    // let a Multimillionaire 5 be bought at Multimillionaire 1's price, which
    // is a wrong number at the table rather than a missing one. The cap comes
    // down to what the table can actually price, and a GM who wants the higher
    // levels can extend the table on the item sheet.
    const cap = parseUpTo(f.get("upto"));
    const priced = cost.costTable.length;
    const maxLevels = priced > 0 && cap > priced ? priced : cap;
    if (priced > 0 && cap > priced) {
      note(`${name}: priced for ${priced} levels, capped there rather than at ${cap}`);
    }

    const levelNames = parseLevelNames(f.get("levelnames"));

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
        // Names past the last priced level name levels that cannot be bought.
        levelNames: maxLevels > 0 ? levelNames.slice(0, maxLevels) : levelNames,
        maxLevels,
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

// ── equipment ────────────────────────────────────────────────────────────────

/** Damage types the model holds. */
const DAMAGE_TYPES = new Set([
  "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
]);

/**
 * The damage types the lower of a split DR applies to, by which footnote the
 * armour falls under. This must match SPLIT_AGAINST in `src/rules/armor.ts`,
 * which resolves DR at play time; a test compares the two.
 */
export const SPLIT_AGAINST = {
  /** Low-tech and barding: "use the lower DR against crushing attacks". */
  lowTech: ["cr"],
  /** High- and ultra-tech: the higher DR is for piercing and cutting only. */
  highTech: ["cr", "imp", "burn", "tox", "cor", "fat"],
};

/** The book's location words, in the vocabulary the hit-location rules use. */
const LOCATIONS = new Map([
  // The vitals sit behind the torso, so anything covering the torso covers
  // them; without this a breastplate gives no DR against a vitals hit, which
  // is the shot most worth aiming at.
  ["torso", ["torso", "vitals"]],
  ["vitals", ["vitals"]],
  ["skull", ["skull"]],
  ["face", ["face"]],
  ["eye", ["eye"]],
  ["eyes", ["eye"]],
  ["neck", ["neck"]],
  ["groin", ["groin"]],
  ["arm", ["arm"]],
  ["arms", ["arm"]],
  ["leg", ["leg"]],
  ["legs", ["leg"]],
  ["hand", ["hand"]],
  ["hands", ["hand"]],
  ["foot", ["foot"]],
  ["feet", ["foot"]],
  ["limbs", ["arm", "leg"]],
  ["body", ["torso", "vitals", "groin"]],
  ["head", ["skull", "face"]],
  ["full suit", []],
]);

const number = (value, fallback = 0) => {
  const m = /^-?\d+(?:\.\d+)?/.exec((value ?? "").trim().replace(/,/g, ""));
  return m ? Number(m[0]) : fallback;
};

/**
 * A damage expression. GCA writes it as the book does: "sw+1" scales off the
 * wielder's swing, "thr" off their thrust, and "2d-1" is a fixed roll that
 * ignores ST. Anything else -- an affliction, a special effect, one of GCA's
 * sheet formulas -- has no home in the model and is reported.
 */
/** Attributes an affliction can be resisted with. */
const RESISTANCE = ["ST", "DX", "IQ", "HT", "Will", "Per"];

function parseDamage(damage, damtype) {
  // An affliction is not damage: the target resists with an attribute roll at
  // a penalty, written damage(HT-4) damtype(aff), and what failing does is in
  // the weapon's notes rather than in any number here.
  if ((damtype ?? "").trim().toLowerCase() === "aff") {
    const resist = /^(ST|DX|IQ|HT|Will|Per)\s*(?:([+-])\s*(\d+))?$/i.exec((damage ?? "").trim());
    if (!resist) return null;
    const attribute = RESISTANCE.find((a) => a.toLowerCase() === resist[1].toLowerCase());
    const modifier = resist[3] ? Number(`${resist[2]}${resist[3]}`) : 0;
    if (!attribute || modifier > 0) return null;
    return {
      fields: {
        // An affliction rolls no damage, so these are inert. The type is left
        // at the schema's own default rather than invented.
        damageBase: "fixed",
        damageModifier: 0,
        damageFormula: "",
        damageType: "cr",
        explosive: false,
        fragmentation: "",
        affliction: true,
        afflictionAttribute: attribute,
        afflictionModifier: modifier,
      },
      usesWeaponSt: false,
    };
  }

  // "cr ex [2d]" is a crushing explosion throwing 2d of fragmentation
  // (GURPS Basic Set: Campaigns p. 414). The type, the blast and the
  // fragments are three facts written in one column.
  const blast = /^([a-z+-]+)\s+ex\s*(?:\[\s*(\d+d(?:[+-]\d+)?)\s*\])?$/i.exec(
    (damtype ?? "").trim(),
  );
  const type = blast ? blast[1].trim() : (damtype ?? "").trim();
  const explosive = Boolean(blast);
  const fragmentation = blast?.[2] ?? "";

  if (!DAMAGE_TYPES.has(type)) return null;

  const text = (damage ?? "").trim();
  const scaled = /^(sw|thr)\s*(?:([+-])\s*(\d+))?$/i.exec(text);
  if (scaled) {
    return {
      fields: {
        damageBase: scaled[1].toLowerCase(),
        damageModifier: scaled[3] ? Number(`${scaled[2]}${scaled[3]}`) : 0,
        damageFormula: "",
        damageType: type,
        explosive,
        fragmentation,
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      },
      usesWeaponSt: false,
    };
  }
  // A bow does not care how strong the archer is, only how strong the bow is,
  // so GCA takes its thrust damage from the weapon rather than the wielder.
  const ofWeapon = /^@(sw|thr)\(\s*me::weaponst\s*\)\s*(?:([+-])\s*(\d+))?$/i.exec(text);
  if (ofWeapon) {
    return {
      fields: {
        damageBase: ofWeapon[1].toLowerCase(),
        damageModifier: ofWeapon[3] ? Number(`${ofWeapon[2]}${ofWeapon[3]}`) : 0,
        damageFormula: "",
        damageType: type,
        explosive,
        fragmentation,
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      },
      usesWeaponSt: true,
    };
  }
  // "6dx10" is the notation the heaviest weapons come in: the roll is
  // multiplied, and the dice model carries the factor.
  if (/^\d+d\s*(?:[+-]\s*\d+)?(?:\s*x\s*\d+)?$/i.test(text)) {
    return {
      fields: {
        damageBase: "fixed",
        damageModifier: 0,
        damageFormula: text.replace(/\s+/g, ""),
        damageType: type,
        explosive,
        fragmentation,
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      },
      usesWeaponSt: false,
    };
  }
  return null;
}

/**
 * The skill a mode is used with. GCA lists the whole default chain --
 * `skillused(SK:Sword!, SK:Broadsword, ST:DX-5, SK:Rapier-4, ...)` -- of which
 * the first real skill is the one the weapon is actually used with; the rest
 * are what you fall back to. A leading wildcard group is skipped.
 */
function parseSkillUsed(value) {
  for (const entry of splitTop(value ?? "")) {
    const text = entry.trim();
    // An entry carrying a modifier is a default -- what you fall back to if you
    // lack the real skill -- not the skill the weapon is used with. A shield's
    // list reads "ST:DX-4, SK:Shield (Buckler)-2, SK:Shield (Force)-2,
    // SK:Shield (Shield)", and the unmodified one at the end is the answer.
    if (/[+-]\s*\d+$/.test(text)) continue;
    const m = /^"?SK:(.+?)"?$/.exec(text);
    if (m && !m[1].endsWith("!")) return m[1].trim();
  }
  return "";
}

/**
 * A minimum ST. The table marks a two-handed weapon with a dagger after the
 * figure, which is the same column saying two things at once.
 */
function parseMinSt(value) {
  const m = /^(\d+)\s*(†)?/.exec((value ?? "").trim());
  if (!m) return { minSt: null, twoHanded: false };
  return { minSt: Number(m[1]), twoHanded: Boolean(m[2]) };
}

/**
 * The Parry column, which carries four separate facts: the modifier, whether
 * the weapon can parry at all, whether it is unbalanced ("U"), and whether it
 * is a fencing weapon ("F").
 */
function parseParry(value) {
  const text = (value ?? "").trim();
  if (/^no$/i.test(text)) {
    return { parryModifier: 0, canParry: false, unbalanced: false, isFencing: false };
  }
  const m = /^([+-]?\d+)?\s*([UF])?$/i.exec(text);
  if (!m) return null;
  return {
    parryModifier: m[1] ? Number(m[1]) : 0,
    canParry: true,
    unbalanced: (m[2] ?? "").toUpperCase() === "U",
    isFencing: (m[2] ?? "").toUpperCase() === "F",
  };
}

/**
 * A weapon's Malf. from the data file, or null where it has none.
 *
 * GCA writes it as a bare number; anything unparseable is treated as a weapon
 * that does not jam, since a wrong number here would jam a bow.
 */
function malfunctionOf(raw) {
  const value = Number(String(raw ?? "").trim());
  return Number.isInteger(value) && value >= 3 && value <= 18 ? value : null;
}

/**
 * A range figure. It is either a distance in yards, or a multiple of ST --
 * which GCA writes `ST*15` for the wielder's ST and `me::weaponst*15` for a
 * bow's own. Anything else is one of GCA's sheet formulas, notably the one it
 * uses for thrown weapons, and cannot be reduced to a number here.
 */
function parseRange(value) {
  const text = (value ?? "").trim();
  if (text === "") return { distance: 0, stMultiple: false, ofWeapon: false };
  if (/^\d+(\.\d+)?$/.test(text)) {
    return { distance: Number(text), stMultiple: false, ofWeapon: false };
  }
  const st = /^(?:me::weaponst|ST(?::ST)?)\s*\*\s*(\d+(?:\.\d+)?)$/i.exec(text);
  if (st) {
    return {
      distance: Number(st[1]),
      stMultiple: true,
      ofWeapon: /weaponst/i.test(text),
    };
  }
  return null;
}

/** A melee mode, or null with a reason. */
function meleeMode(name, f) {
  const damage = parseDamage(f.get("damage"), f.get("damtype"));
  if (!damage) return { error: `damage "${f.get("damage") ?? ""}" ${f.get("damtype") ?? ""}` };

  const parry = parseParry(f.get("parry"));
  if (!parry) return { error: `parry "${f.get("parry") ?? ""}"` };

  const { minSt, twoHanded } = parseMinSt(f.get("minst"));
  const divisor = f.get("armordivisor");
  if (divisor !== undefined && !/^\d+(\.\d+)?$/.test(divisor.trim())) {
    return { error: `armour divisor "${divisor}"` };
  }

  return {
    mode: {
      name,
      skill: parseSkillUsed(f.get("skillused")),
      ...damage.fields,
      armorDivisor: divisor === undefined ? 1 : Number(divisor),
      reach: (f.get("reach") ?? "C").trim(),
      ...parry,
      // The flail rule is about the weapon, and the table marks it in the
      // notes rather than in a column, so it is left to the GM to set.
      isFlail: false,
      minSt,
      twoHanded,
      unreadyAfterAttack: false,
    },
  };
}

/** A ranged mode, or null with a reason. */
function rangedMode(name, f, thrown) {
  const damage = parseDamage(f.get("damage"), f.get("damtype"));
  if (!damage) return { error: `damage "${f.get("damage") ?? ""}" ${f.get("damtype") ?? ""}` };

  const acc = /^(\d+)(?:\s*\+\s*(\d+))?$/.exec((f.get("acc") ?? "0").trim() || "0");
  if (!acc) return { error: `accuracy "${f.get("acc") ?? ""}"` };

  const half = parseRange(f.get("rangehalfdam"));
  const max = parseRange(f.get("rangemax"));

  // How far a thrown weapon goes is a property of the thrower, not the
  // weapon: the book reads it off the Throwing Distance table from ST and
  // weight (p. 355), and GCA writes that as a formula over the character
  // sheet. So a grenade with no usable range is not a broken record -- it is
  // a weapon whose range this cannot know, and everything else about it is
  // still worth having.
  const unknownThrownRange = thrown && (!half || !max);
  if (!unknownThrownRange && (!half || !max)) {
    return { error: `range "${f.get("rangehalfdam") ?? ""}/${f.get("rangemax") ?? ""}"` };
  }
  // A weapon whose half-damage range is a distance and whose maximum is a
  // multiple of ST would need two units in one pair of fields.
  if (half && max && half.distance > 0 && half.stMultiple !== max.stMultiple) {
    return { error: "half and maximum range are in different units" };
  }

  const divisor = f.get("armordivisor");
  if (divisor !== undefined && !/^\d+(\.\d+)?$/.test(divisor.trim())) {
    return { error: `armour divisor "${divisor}"` };
  }

  const { minSt, twoHanded } = parseMinSt(f.get("minst"));

  // GCA omits skillused() on one grenade where its four siblings in the same
  // table all state Throwing. Losing the weapon over a field the source simply
  // forgot is worse than reading across from the entries beside it, and the
  // substitution is reported.
  let skill = parseSkillUsed(f.get("skillused"));
  let assumedSkill = false;
  if (!skill && thrown) {
    skill = "Throwing";
    assumedSkill = true;
  }

  return {
    ...(unknownThrownRange
      ? { warning: "range comes from the Throwing Distance table, not the weapon" }
      : {}),
    ...(assumedSkill ? { skillWarning: "no skill stated; read as Throwing" } : {}),
    mode: {
      name,
      skill,
      ...damage.fields,
      armorDivisor: divisor === undefined ? 1 : Number(divisor),
      accuracy: Number(acc[1]),
      scopeBonus: acc[2] ? Number(acc[2]) : 0,
      halfDamageRange: half?.distance ?? 0,
      maxRange: max?.distance ?? 0,
      rangeIsStMultiple: max?.stMultiple ?? false,
      rateOfFire: Math.max(1, number(f.get("rof"), 1)),
      shots: (f.get("shots") ?? "").trim(),
      minSt,
      twoHanded,
      // A bow's damage and range come off the bow's own ST rather than the
      // archer's, and the table states that ST in the same column as the
      // minimum needed to use it.
      weaponSt: max?.ofWeapon || damage.usesWeaponSt ? minSt : null,
      thrown,
      bulk: Math.min(0, number(f.get("bulk"), 0)),
      recoil: Math.max(0, number(f.get("rcl"), 0)),
      // Malf.: the roll at or above which the weapon jams (Campaigns p. 407).
      // A weapon with no malf() in the data cannot jam at all, which is not the
      // same as one that jams on an 18.
      malfunction: malfunctionOf(f.get("malf")),
    },
  };
}

/**
 * Damage Resistance, which GCA writes with the split and what it applies to in
 * one token: `dr(4/2cr*)` is DR 4, or 2 against crushing.
 *
 * The "cr" marks the low-tech footnote, whose lower DR is for crushing alone;
 * a split written without it falls under the high- and ultra-tech footnote,
 * whose higher DR is for piercing and cutting and whose lower is for
 * everything else. The two agree wherever they overlap.
 *
 * Two things that look like splits are not. `dr(2/5sole)` is a boot: DR 2
 * ordinarily and DR 5 where the sole is struck, which the book prints "5/2".
 * The model has no sole, so the ordinary figure is kept and the other is
 * reported rather than misread as protection against a kind of damage.
 * `dr(5/20)` on a shield is its DR and its HP run together, which is why
 * shields are read before this is reached.
 */
function parseDr(value) {
  const text = (value ?? "").trim();
  const plain = /^(\d+)([*F ]*)$/.exec(text);
  if (plain) {
    return { dr: Number(plain[1]), drSplit: null, drSplitAppliesTo: [], flags: plain[2].trim() };
  }
  const sole = /^(\d+)\/(\d+)sole([*F ]*)$/.exec(text);
  if (sole) {
    return {
      dr: Number(sole[1]),
      drSplit: null,
      drSplitAppliesTo: [],
      flags: (sole[3] ?? "").trim(),
      sole: Number(sole[2]),
    };
  }
  const split = /^(\d+)\/(\d+)(cr)?([*F ]*)$/.exec(text);
  if (!split) return null;
  return {
    dr: Number(split[1]),
    drSplit: Number(split[2]),
    drSplitAppliesTo: split[3] ? SPLIT_AGAINST.lowTech : SPLIT_AGAINST.highTech,
    flags: (split[4] ?? "").trim(),
    lowTech: Boolean(split[3]),
  };
}

/** The tech level, where the record states a plain number. */
function techLevel(value) {
  const text = (value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function physical(f) {
  return {
    quantity: 1,
    weight: Math.max(0, number(f.get("baseweight"), 0)),
    cost: Math.max(0, number(f.get("basecost"), 0)),
    carried: true,
    equipped: false,
    tl: techLevel(f.get("techlvl")),
  };
}

function parseEquipment(recs, reject, note) {
  const ids = existingIds("equipment");
  const armor = [];
  const gear = [];
  const shields = [];
  const taken = new Set();

  for (const r of recs) {
    if (r.section !== "EQUIPMENT") continue;

    const f = fields(r.text);
    if (!isBasicSet(f)) continue;

    // A bow is named for the ST it is built to, which GCA leaves for the
    // player to pick: "Longbow (ST%choice%)". The compendium carries the
    // weapon, and the ST it was built to is edited on the item, so the
    // placeholder comes off the name rather than the record being skipped.
    const name = nameOf(r).replace(/\s*\(ST%choice%\)$/, "");
    // A GCA directive body -- "#ReplaceTags in ... with { basecost(60), ... }"
    // -- parses as a record whose first field is a field rather than a name.
    if (/^[a-z]+\(/.test(name)) continue;
    if (PLACEHOLDER.test(name)) { reject(name, "name is a GCA placeholder"); continue; }
    if (/Vehicles/.test(f.get("cat") ?? "")) continue;
    if (taken.has(name)) { reject(name, "duplicate name"); continue; }

    const common = {
      ...physical(f),
      description: "",
      reference: reference(f.get("page")),
    };

    // Shields first: their dr() field runs DR and HP together on one entry, so
    // reading it as armour would invent a split.
    //
    // A defense bonus of at least 1 is what makes a shield a shield. GCA gives
    // a melee net db(0), which is true of it -- a net grants no defense bonus
    // -- but filing it as a shield would put a thrown weapon in the shield
    // slot. It falls through to the weapon branch instead, where its damage is
    // "spcl." and it is rejected with a reason.
    if (number(f.get("db"), 0) >= 1) {
      taken.add(name);

      // A shield is a weapon as well as a defense. Its bash is an ordinary
      // melee mode; its rush is a slam, whose damage comes from the rules for
      // running into someone rather than from the weapon, and is reported.
      const bashes = [];
      for (const raw of modes(r.text)) {
        const modeName = splitTop(raw)[0].trim();
        const result = meleeMode(modeName || "Bash", fields(raw));
        if (result.error) { note(`${name}: ${modeName}: ${result.error}`); continue; }
        bashes.push(result.mode);
      }

      // The skill the shield is used with, which is also the skill a block
      // rolls against. GCA names the specialty -- "Shield (Shield)" -- and the
      // skill compendium has no bare "Shield" for the default to fall back to.
      const skill = parseSkillUsed(fields(modes(r.text)[0] ?? "").get("skillused"))
        || parseSkillUsed(f.get("skillused"))
        || "Shield";

      shields.push({
        _id: ids.get(name) ?? id("shield", name),
        name,
        type: "shield",
        system: { ...common, db: number(f.get("db"), 1), skill, meleeModes: bashes },
      });
      continue;
    }

    if (f.has("dr")) {
      const dr = parseDr(f.get("dr"));
      if (!dr) { reject(name, `DR "${f.get("dr")}" not a plain figure or a split`); continue; }

      // The footnote a split falls under and the piece's tech level should
      // agree. Where they do not, one of the two readings is wrong and the
      // wrong one silently changes what stops a mace.
      const tl = Number(techLevel(f.get("techlvl")) || "0");
      if (dr.drSplit !== null && dr.lowTech === tl >= 7) {
        reject(name, `split DR footnote and TL${tl} disagree`);
        continue;
      }

      const parts = splitTop(f.get("location") ?? "")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      const unknown = parts.filter((p) => !LOCATIONS.has(p));
      if (unknown.length) { reject(name, `unknown location "${unknown.join(", ")}"`); continue; }
      if (parts.length === 0) { reject(name, "no location"); continue; }

      taken.add(name);
      if (dr.flags) note(`${name}: marked "${dr.flags}", which the model does not record`);
      if (dr.sole !== undefined) note(`${name}: DR ${dr.sole} on the sole, a location the model has no home for`);

      armor.push({
        _id: ids.get(name) ?? id("armor", name),
        name,
        type: "armor",
        system: {
          ...common,
          dr: dr.dr,
          drSplit: dr.drSplit,
          drSplitAppliesTo: dr.drSplitAppliesTo,
          locations: [...new Set(parts.flatMap((p) => LOCATIONS.get(p)))],
        },
      });
      continue;
    }

    // Everything else is equipment, which carries its attack modes if it has any.
    // A weapon states each way of using it as a newmode(); a firearm or a bow
    // has one way and states it on the record itself, naming it in mode() where
    // the book gives it a name -- a longbow's "Barbed-head".
    const declared = modes(r.text);
    const single = f.get("mode") ?? "";
    const scopes = declared.length > 0
      ? declared.map((m) => ({ name: splitTop(m)[0].trim(), f: fields(m) }))
      : [{ name: single.includes("|") ? "" : single.trim(), f }];

    const meleeModes = [];
    const rangedModes = [];
    let usable = declared.length === 0 && !f.has("damage");

    for (const scope of scopes) {
      const isMelee = scope.f.has("reach") || scope.f.has("parry");
      const isRanged = scope.f.has("acc") || scope.f.has("rof") || scope.f.has("rangemax");
      if (!isMelee && !isRanged) continue;

      // A thrown weapon is one you let go of: the table gives it a range in
      // multiples of ST and a shots entry of "T".
      const thrown = /^T/.test(scope.f.get("shots") ?? "");
      const result = isMelee
        ? meleeMode(scope.name || "attack", scope.f)
        : rangedMode(scope.name || "attack", scope.f, thrown);

      if (result.error) { reject(name, `${scope.name || "attack"}: ${result.error}`); continue; }
      if (result.warning) note(`${name}: ${result.warning}`);
      if (result.skillWarning) note(`${name}: ${result.skillWarning}`);
      usable = true;
      (isMelee ? meleeModes : rangedModes).push(result.mode);
    }

    if (!usable) continue;

    taken.add(name);
    gear.push({
      _id: ids.get(name) ?? id(meleeModes.length || rangedModes.length ? "weapon" : "gear", name),
      name,
      type: "equipment",
      system: { ...common, meleeModes, rangedModes },
    });
  }

  return { armor, gear, shields };
}

function report(label, count, rejected) {
  console.log(`${label}: ${count}`);
  const reasons = rejected.reduce((a, r) => ((a[r.why] = (a[r.why] ?? 0) + 1), a), {});
  if (rejected.length) console.log(`  rejected ${rejected.length}:`);
  for (const [why, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
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

  const notes = [];
  const traitRejects = [];
  const traits = parseTraits(recs, (what, why) => traitRejects.push({ what, why }), (n) => notes.push(n));

  const skillRejects = [];
  const { skills, techniques } = parseSkills(recs, (what, why) => skillRejects.push({ what, why }));

  const gearRejects = [];
  const { armor, gear, shields } = parseEquipment(
    recs,
    (what, why) => gearRejects.push({ what, why }),
    (n) => notes.push(n),
  );

  const positive = traits.filter((t) => ["advantage", "perk"].includes(t.system.category));
  report("traits", traits.length, traitRejects);
  console.log(`  advantages ${positive.length}, disadvantages ${traits.length - positive.length}`);
  console.log(`  tabled costs: ${traits.filter((t) => t.system.costTable.length > 0).length}`);
  report("skills", skills.length, skillRejects);
  report("techniques", techniques.length, []);

  // The three equipment kinds come out of one pass over one section, so their
  // rejections are reported together rather than split three ways.
  const armed = gear.filter((g) => g.system.meleeModes.length || g.system.rangedModes.length);
  console.log(`armour: ${armor.length}`);
  console.log(`equipment: ${gear.length} (${armed.length} carrying attack modes)`);
  report("shields", shields.length, gearRejects);
  if (notes.length) {
    console.log(`\nrecorded but not modelled: ${notes.length}`);
    for (const n of notes.slice(0, 6)) console.log(`    ${n}`);
  }

  if (write === "--write") {
    // Two packs rather than one. A list of 641 traits with advantages and
    // disadvantages interleaved is not a list anyone can choose from: you go
    // looking for something to spend points on and half of what you scroll
    // past charges you nothing.
    const negative = traits.filter((t) => !positive.includes(t));

    const files = [
      ["advantages", "basic-set-advantages.json", positive],
      ["disadvantages", "basic-set-disadvantages.json", negative],
      ["skills", "basic-set-skills.json", skills],
      ["skills", "basic-set-techniques.json", techniques],
      ["equipment", "armor.json", armor],
      ["equipment", "gear.json", gear],
      ["equipment", "shields.json", shields],
    ];
    for (const [pack, file, docs] of files) {
      mkdirSync(join(projectRoot, "packs-src", pack), { recursive: true });
      writeFileSync(
        join(projectRoot, "packs-src", pack, file),
        `${JSON.stringify(docs, null, 2)}\n`,
        "utf8",
      );
    }
    writeFileSync(
      join(projectRoot, "packs-src", "advantages", ".rejected-gdf.txt"),
      traitRejects.map((r) => `${r.why}\t${r.what}`).join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "packs-src", "skills", ".rejected-gdf.txt"),
      skillRejects.map((r) => `${r.why}\t${r.what}`).join("\n"),
      "utf8",
    );
    writeFileSync(
      join(projectRoot, "packs-src", "equipment", ".rejected-gdf.txt"),
      [
        ...gearRejects.map((r) => `${r.why}\t${r.what}`),
        ...notes.map((n) => `not modelled\t${n}`),
      ].join("\n"),
      "utf8",
    );
    console.log("\nwrote traits, skills, techniques, armour, equipment and shields");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
