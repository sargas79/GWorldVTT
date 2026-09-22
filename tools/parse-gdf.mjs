/**
 * Builds the trait, skill, technique and equipment compendia from a GCA 5
 * data file.
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
 * Usage:
 *   node tools/parse-gdf.mjs <file.gdf> [--write]
 *        [--out <packs-src dir>] [--prefix B] [--book "Basic Set: Characters"]
 *        [--overlap <file>] [--power-category <pattern>]
 *
 * With no options it reads the Basic Set (page prefix "B") into this
 * repository's packs-src. Pointed at another book's GDF with that book's
 * prefix, it writes only the records citing that book, under a module's
 * own packs-src. A supplement restates some of the Basic Set's records with
 * its own page beside the original; those the Basic Set pack already
 * carries, so they are skipped, and `--overlap` writes the list of them.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertCitesBook,
  bookPrefix,
  citesBook,
  fields,
  groupsOf,
  isExpression,
  modes,
  nameOf,
  records,
  reference,
  splitTop,
} from "./gdf.mjs";
import { existingIds as existingSpellIds, parseSpells } from "./parse-gdf-spells.mjs";
import { needsSpecialty } from "./specified-traits.mjs";

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

const DIFFICULTIES = new Set(["E", "A", "H", "VH", "W"]);

/**
 * A name GCA fills in from the character sheet rather than the book:
 * `%skilllist%` is a menu, `[sense]` is a blank for the player. Neither is a
 * trait anyone can look up, so they are not compendium entries.
 */
const PLACEHOLDER = /[%[\]]/;

/** A parenthesis holding nothing but a blank: "(%WeaponList%)", "([skill])". */
const BLANK_SPECIALTY = /^(.*\S)\s+\((?:%[^%()]*%|\[[^\][()]*\])\)$/;

/**
 * The names a section of the file gives its records, without GCA's leading
 * underscore and without any name that is itself a placeholder.
 */
function namesIn(recs, section) {
  const names = new Set();
  for (const r of recs) {
    if (r.section !== section) continue;
    const name = nameOf(r).replace(/^_/, "");
    if (!PLACEHOLDER.test(name)) names.add(name);
  }
  return names;
}

/**
 * The name a record is filed under.
 *
 * GCA hides a record from its own lists with a leading underscore
 * (`_Basic Gear`); the compendium has no such lists, so the underscore comes
 * off. And a trait the player specialises is sometimes written with nothing
 * but a blank for the specialty -- `Weapon Bond (%WeaponList%)` -- which is
 * the trait itself, and is kept under its bare name, provided the file has
 * no specialised records of it already (`Riding (Horse)` would make
 * `Riding (%beast%)` a menu over those, not a trait of its own) and nothing
 * else by that name. That second rule is for traits and gear only: a skill or
 * technique written with a blank -- `Feint (%Melee Combat Skill%)` -- is
 * nothing without the skill it is bought for, and its defaults name the blank
 * too, so it stays rejected.
 *
 * The Basic Set takes the blank-specialty rule but not the underscore one.
 * Its underscored records are GCA's bookkeeping -- an empty parent for new
 * Alternative Attacks, five "unused quirk" slots -- and `isBookkeeping` drops
 * them instead of renaming them into traits nobody can buy.
 */
export function entryName(raw, siblings, { supplement = true, blankSpecialty = true } = {}) {
  const name = supplement ? raw.replace(/^_/, "") : raw;
  const blank = blankSpecialty ? BLANK_SPECIALTY.exec(name) : null;
  if (!blank || PLACEHOLDER.test(blank[1])) return name;
  const base = blank[1];
  const specialised = [...siblings].some((n) => n.startsWith(`${base} (`));
  return specialised || siblings.has(base) ? name : base;
}

/**
 * Whether a record is GCA's own bookkeeping rather than something the book
 * sells. In the Basic Set a leading underscore marks one: `_Unused Quirk 1`
 * holds a place on GCA's sheet, and `_New Alternative Attacks` is an empty
 * parent to hang attacks under. A supplement uses the underscore to hide a
 * real entry from GCA's lists (`_Basic Gear`), so it keeps them.
 */
export function isBookkeeping(raw, { supplement = true } = {}) {
  return !supplement && raw.startsWith("_");
}

/**
 * The base item a quality variant repeats: "Camera, Digital (Good)" is the
 * camera at good quality. Quality is a field on the item, whose price follows
 * from it, so a record that only restates the base at another grade is not
 * an item of its own. Null for anything else, including a variant whose base
 * the file does not carry.
 */
export function qualityVariantOf(name, siblings) {
  const m = /^(.*\S)\s+\((?:Cheap|Good|Fine|Very Fine)\)$/.exec(name);
  return m && siblings.has(m[1]) ? m[1] : null;
}

/**
 * The skills a Talent gives its level to, from the file's group of that name.
 *
 * GCA wires a Talent to its skills with `gives(+1 To GR:Healer)` and lists
 * the group under `[GROUPS]`. It uses groups for other things as well --
 * Voice, Absolute Direction, Flexibility -- so only a record filed as a Talent
 * and giving to a group of its own name counts. Members other than skills
 * (`ST:`, another group) are left out; so is any member GCA fills in from the
 * sheet. Empty for everything else.
 */
export function talentSkillsOf(name, f, groups) {
  if (!/\bTalents\b/.test(f.get("cat") ?? "")) return [];
  const own = name.trim().toLowerCase();
  const gives = [...(f.get("gives") ?? "").matchAll(/GR:\s*"?([^,")]+)"?/gi)].map((m) => m[1].trim().toLowerCase());
  if (!gives.includes(own)) return [];
  const group = [...groups.entries()].find(([group]) => group.trim().toLowerCase() === own)?.[1] ?? [];
  return group
    .map((member) => /^SK:\s*"?(.+?)"?$/.exec(member)?.[1]?.trim())
    .filter((skill) => skill && !PLACEHOLDER.test(skill));
}

/**
 * The power a trait belongs to, and whether it is the power's Talent.
 *
 * GCA files a power's abilities and its Talent under a category of their own,
 * and each book names those categories its own way: a book may write
 * "_MH Bioenhancement" and "_MH Psionics - ESP". So the book says how, with a
 * pattern whose first group is the power's name -- "^_MH (?:Psionics - )?(.+)$"
 * -- and a Talent is the record GCA also files under "Talents - Powers". With
 * no pattern, or no category matching it, the trait belongs to no power by its
 * entry, and the Basic Set's psionics are still found the way the sheet finds
 * them, by their power modifier.
 */
export function powerOfRecord(f, pattern) {
  const categories = (f.get("cat") ?? "").split(",").map((c) => c.trim());
  const named = pattern ? categories.map((c) => pattern.exec(c)?.[1]?.trim()).find(Boolean) : null;
  if (!named) return { power: "", powerTalent: false };
  return { power: named, powerTalent: categories.some((c) => /^Talents - Powers$/i.test(c)) };
}

/**
 * The attack an advantage is, as a ranged mode (Characters pp. 61, 106).
 *
 * GCA writes an Innate Attack's damage per level -- `damage($solver(%level)d)`,
 * or `$solver(%level)d-$solver(%level)` for an attack of "1d-1 per level"
 * -- with the weapon columns beside it. A range of "Speed/Range"
 * is a Malediction taking the Size and Speed/Range Table, which is Malediction
 * 2 (p. 106), and it has no range statistics of its own. Where the skill is a
 * blank the player picks (`%examplealiaslist%`), Innate Attack (Projectile) is
 * the one written, and the sheet changes it.
 *
 * What is worked out on the sheet -- an Affliction's HT penalty per level, a
 * Vampiric Bite's HP a second, a type the player chooses -- is not guessed at:
 * no mode, and a note saying why.
 */
export function traitAttackModes(f) {
  const none = { rangedModes: [], meleeModes: [] };
  const rawDamage = (f.get("damage") ?? "").trim();
  const rawType = (f.get("damtype") ?? "").trim();
  if (!rawDamage && !rawType) return none;
  if (PLACEHOLDER.test(rawType) || isExpression(rawType)) {
    return { ...none, note: `damage type chosen on the sheet: "${rawType}"` };
  }

  let damage = null;
  let perLevel = false;
  const levelled = /^\$solver\(%level\)d(?:\s*([+-])\s*\$solver\(%level\))?$/i.exec(rawDamage);
  if (levelled) {
    damage = parseDamage(levelled[1] ? `1d${levelled[1]}1` : "1d", rawType);
    perLevel = true;
  } else if (/^(stun|aff)$/i.test(rawType)) {
    // Mental Blow: damage(Will) damtype(stun), resisted with Will.
    damage = parseDamage(rawDamage, "aff");
  } else if (!isExpression(rawDamage)) {
    damage = parseDamage(rawDamage, rawType);
  }
  if (!damage) return { ...none, note: `attack damage "${rawDamage}" ${rawType} is worked out on the sheet` };

  const malediction = /^speed\/range$/i.test((f.get("rangemax") ?? "").trim()) ? 2 : 0;
  const rawSkill = (f.get("skillused") ?? "").trim();
  const attribute = /^"?(?:ST:)?(Will|Per|Perception|IQ|HT|DX|ST)"?$/i.exec(rawSkill)?.[1].toLowerCase();
  const ATTRIBUTE_NAMES = { will: "Will", per: "Per", perception: "Per", iq: "IQ", ht: "HT", dx: "DX", st: "ST" };
  const skill = attribute
    ? ATTRIBUTE_NAMES[attribute]
    : parseSkillUsed(rawSkill) || "Innate Attack (Projectile)";
  const half = malediction ? null : parseRange(f.get("rangehalfdam"));
  const max = malediction ? null : parseRange(f.get("rangemax"));
  // Spines state damage and no range: they hurt whoever grapples or slams you
  // (Characters p. 88), which is not an attack anyone makes.
  if (!malediction && !max?.distance) {
    return { ...none, note: "damage with no range, so not an attack the trait makes" };
  }

  return {
    ...none,
    rangedModes: [{
      name: "",
      skill,
      ...damage.fields,
      armorDivisor: 1,
      accuracy: malediction ? 0 : Math.max(0, number(f.get("acc"), 0)),
      scopeBonus: 0,
      halfDamageRange: half?.distance ?? 0,
      maxRange: max?.distance ?? 0,
      rangeIsStMultiple: false,
      rateOfFire: malediction ? 1 : Math.max(1, number(f.get("rof"), 1)),
      projectiles: 1,
      shots: "",
      loaded: 0,
      reloadWeight: 0,
      ammunition: "",
      minSt: null,
      twoHanded: false,
      weaponSt: null,
      thrown: false,
      mount: "",
      bulk: 0,
      recoil: malediction ? 0 : Math.max(0, number(f.get("rcl"), 0)),
      malfunction: null,
      perLevel,
      malediction,
    }],
  };
}

/** The book everything else is a supplement to. */
const BASIC_SET = { prefix: "B", book: "Basic Set: Characters" };

export { assertCitesBook, bookPrefix, groupsOf, reference };

/**
 * Where a record belongs, for the pack being built.
 *
 * "own" is a record of this book; "elsewhere" one that does not cite it at
 * all. "overlap" is a supplement's record that also cites the Basic Set: a
 * supplement restating Karate with its own page beside B203, which the Basic
 * Set pack already has. Nothing overlaps when the Basic Set itself is
 * being read, whatever else a record cites.
 */
export function classifyCitation(page, prefix, base = BASIC_SET.prefix) {
  if (!citesBook(page, prefix)) return "elsewhere";
  if (bookPrefix(prefix) !== bookPrefix(base) && citesBook(page, base)) return "overlap";
  return "own";
}

/** Whether the book being read is a supplement rather than the Basic Set. */
function isSupplement(source) {
  return bookPrefix(source.prefix) !== BASIC_SET.prefix;
}

/**
 * Whether a record is this book's to keep. One that cites another book, or
 * one the Basic Set already carries, is not; the latter is reported to the
 * overlap list so the module's author can see what was left out.
 */
function keeps(r, f, source) {
  const where = classifyCitation(f.get("page"), source.prefix);
  if (where === "overlap") source.overlap(r.section, nameOf(r), f.get("page") ?? "");
  return where === "own";
}

const id = (kind, name) =>
  createHash("sha1").update(`${kind}:${name}`).digest("hex").slice(0, 16);

/**
 * A new entry's id. A supplement often restates a Basic Set entry under the
 * same name with its own figures -- a firearms table, a gear list -- and a
 * name-based id would then be the Basic Set entry's. Where
 * it would be, the book's prefix goes into the seed, so the two are distinct
 * and every other id is what it always was.
 */
function newId(kind, name, source) {
  const plain = id(kind, name);
  return source.basicIds?.has(plain) ? id(kind, `${bookPrefix(source.prefix)}:${name}`) : plain;
}

/** Every id in the Basic Set's own packs, for a supplement to stay clear of. */
function basicSetIds() {
  const found = new Set();
  const root = join(projectRoot, "packs-src");
  if (!existsSync(root)) return found;
  for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(join(root, dir.name)).filter((f) => f.endsWith(".json"))) {
      const docs = JSON.parse(readFileSync(join(root, dir.name, file), "utf8"));
      if (Array.isArray(docs)) for (const doc of docs) if (doc?._id) found.add(doc._id);
    }
  }
  return found;
}

/**
 * Ids from the files of a pack that this parser does not write.
 *
 * The equipment pack holds three files the parser generates and two written
 * by hand -- an atlatl's darts as modes of the atlatl, a punch as a weapon --
 * and a name in a hand-written file is the one to keep. So those names are
 * read separately from the generated ones and taken off the table.
 */
function handWrittenIds(outDir, pack, generated) {
  const byName = new Map();
  const dir = join(outDir, pack);
  if (!existsSync(dir)) return byName;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !generated.includes(f))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      byName.set(doc.name, doc._id);
    }
  }
  return byName;
}

/**
 * The traits a book keeps by hand, by name.
 *
 * A record the data file gets wrong is corrected by keeping it in a file of
 * its own beside the parser's -- anything in the advantages or disadvantages
 * pack that is not `<stem>-advantages.json` or `<stem>-disadvantages.json`.
 * The parser then leaves that name to the hand-kept record, as it does for
 * equipment, rather than writing a second record under the same id.
 */
export function handKeptTraitNames(outDir, basic, book) {
  const written = fileNames(basic, book);
  return new Set([
    ...handWrittenIds(outDir, "advantages", [written.advantages]).keys(),
    ...handWrittenIds(outDir, "disadvantages", [written.disadvantages]).keys(),
  ]);
}

/** What a run reads when nobody says otherwise: the Basic Set, in place. */
const BASIC_SET_SOURCE = {
  ...BASIC_SET,
  outDir: join(projectRoot, "packs-src"),
  overlap: () => {},
};

/**
 * Ids already published for a pack, by name.
 *
 * A compendium entry's id is part of its UUID, and a character sheet that
 * dragged a skill in stores that UUID. Regenerating an id because the source
 * changed would break every such reference, so a name that already exists keeps
 * the id it already had.
 */
function existingIds(outDir, ...packs) {
  const byName = new Map();
  for (const pack of packs) {
    const dir = join(outDir, pack);
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

/** Whether a cost is paid or earned: 1 for points spent, -1 for points gained. */
function costSign(cost) {
  for (const figure of [cost.points, cost.pointsPerLevel, cost.costTable[0] ?? 0]) {
    if (figure) return figure < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * What a trait is, once its cost has been read.
 *
 * A data file files a record by where its author put it, and that is not always
 * where GURPS puts it: a book whose cybernetic implants all sit under
 * Advantages will have some that cost negative points, and a trait that costs
 * negative points is a disadvantage wherever the file keeps it. So the sign of
 * the cost has the last word, and the section's four categories pair off:
 * an advantage that is paid for becomes a disadvantage, and a perk a quirk.
 *
 * A trait that costs nothing flat is priced per level or from a table, and the
 * same rule reads that instead. One that costs nothing at all keeps the
 * section's word, there being nothing to disagree with.
 */
const OPPOSITE = new Map([
  ["advantage", "disadvantage"],
  ["perk", "quirk"],
  ["disadvantage", "advantage"],
  ["quirk", "perk"],
]);

export function traitCategoryOf(section, cost) {
  const said = TRAIT_SECTIONS.get(section);
  if (!said) return undefined;
  const sign = costSign(cost);
  if (sign === 0) return said;
  const earned = said === "disadvantage" || said === "quirk";
  return (sign < 0) === earned ? said : OPPOSITE.get(said);
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

function parseTraits(recs, reject, note, source) {
  // Advantages and disadvantages are separate compendia, but they are one
  // body of records in the source and share a name space: Wealth is both.
  const ids = existingIds(source.outDir, "advantages", "disadvantages");
  const out = [];
  const taken = new Map();
  const siblings = new Map([...TRAIT_SECTIONS.keys()].map((s) => [s, namesIn(recs, s)]));
  const keptByHand = handKeptTraitNames(source.outDir, bookPrefix(source.prefix) === bookPrefix(BASIC_SET.prefix), source.book);

  for (const r of recs) {
    if (!TRAIT_SECTIONS.has(r.section)) continue;

    const f = fields(r.text);
    if (!keeps(r, f, source)) continue;

    if (isBookkeeping(nameOf(r), { supplement: isSupplement(source) })) { reject(nameOf(r), "GCA bookkeeping record"); continue; }

    // GCA asks which core skill Ritual Magery boosts and writes the answer
    // into the name; the trait the book prices is Ritual Magery (p. 242).
    const bare = entryName(nameOf(r), siblings.get(r.section), { supplement: isSupplement(source) })
      .replace(/^Ritual Magery \(\[skill\]\)$/, "Ritual Magery");
    if (PLACEHOLDER.test(bare)) { reject(bare, "name is a GCA placeholder"); continue; }
    // Checked before the advantage/disadvantage clash below, which would
    // otherwise keep the record under a qualified name.
    if (keptByHand.has(bare)) { reject(bare, "kept by hand"); continue; }

    const cost = parseCost(splitTop(r.text)[1], f);
    if (!cost) { reject(bare, `cost not a number: "${splitTop(r.text)[1] ?? ""}"`); continue; }

    // What it is, which the sign of the cost settles rather than the section.
    const category = traitCategoryOf(r.section, cost);
    if (!category) continue;
    if (category !== TRAIT_SECTIONS.get(r.section)) {
      note(`${bare}: ${TRAIT_SECTIONS.get(r.section)} in the file, read as a ${category} at ${costSign(cost) < 0 ? "" : "+"}${cost.points || cost.pointsPerLevel || cost.costTable[0]} points`);
    }

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

    // An advantage that is an attack carries its attack, as a weapon does.
    const attack = traitAttackModes(f);
    if (attack.note) note(`${name}: ${attack.note}`);

    out.push({
      _id: ids.get(name) ?? newId("trait", name, source),
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
        // What the trait is of is the player's to say; the flag says the
        // book makes them say it.
        specialty: "",
        needsSpecialty: needsSpecialty(bare, r.text),
        // A disadvantage the book prices with a self-control roll comes with
        // the standard number; the sheet's dropdown reprices it for another.
        selfControl: takesSelfControlRoll(f.get("mods")) ? STANDARD_SELF_CONTROL : null,
        reactionModifier: 0,
        talentSkills: talentSkillsOf(bare, f, source.groups ?? new Map()),
        ...powerOfRecord(f, source.powerCategory ?? null),
        meleeModes: [],
        rangedModes: attack.rangedModes,
        description: "",
        reference: reference(f.get("page"), source.prefix, source.book),
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

function parseSkills(recs, reject, note, source) {
  const ids = existingIds(source.outDir, "skills");
  const skills = [];
  const techniques = [];
  const taken = new Set();

  const siblings = namesIn(recs, "SKILLS");
  // How many blank-specialty records each skill has: one is the skill itself,
  // several are told apart by what their blanks say.
  const blanksOf = new Map();
  for (const r of recs) {
    if (r.section !== "SKILLS") continue;
    const m = BLANK_SPECIALTY.exec(nameOf(r));
    if (m) blanksOf.set(m[1], (blanksOf.get(m[1]) ?? 0) + 1);
  }

  // Open techniques are named for the technique alone -- "Disarming" -- unless
  // two of them in one book share that name for different kinds of skill, when
  // each keeps its kind: "Retain Weapon (Melee Weapon Skill)".
  const openTaken = new Set();
  const openNames = new Map();
  // Which record each open technique is read from: the one that carries its own
  // choice list, rather than one that only guesses (sargas79/GWorldVTT#368).
  const openBest = new Map();
  {
    const byBase = new Map();
    for (const r of recs) {
      if (r.section !== "SKILLS") continue;
      const m = OPEN_TECHNIQUE_NAME.exec(nameOf(r));
      const open = m ? openTechnique(r, fields(r.text), recs, source) : null;
      if (!open) continue;
      const key = nameOf(r);
      const label = (m[2] ?? m[3]).trim();
      // "[Melee Weapon]" and "%Melee Weapon Skill%" are the same technique
      // written twice: the free-text blank and the one with the choice list.
      byBase.set(m[1], [...(byBase.get(m[1]) ?? []), { key, label, kind: openKind(label), guessed: open.guessed }]);
    }
    for (const [base, list] of byBase) {
      const kinds = new Set(list.map((x) => x.kind));
      for (const entry of list) {
        // The plainer of the two spellings names it, without GCA's "Skill".
        const label = list.filter((x) => x.kind === entry.kind)
          .map((x) => x.label.replace(/\s+Skill$/i, ""))
          .sort((a, b) => a.length - b.length)[0];
        openNames.set(entry.key, kinds.size > 1 ? `${base} (${label})` : base);
      }
      for (const entry of list) {
        const name = openNames.get(entry.key);
        const best = openBest.get(name);
        if (!best || (best.guessed && !entry.guessed)) openBest.set(name, entry);
      }
    }
  }

  for (const r of recs) {
    if (r.section !== "SKILLS") continue;

    const f = fields(r.text);
    if (!keeps(r, f, source)) continue;

    if (isBookkeeping(nameOf(r), { supplement: isSupplement(source) })) { reject(nameOf(r), "GCA bookkeeping record"); continue; }
    // The pair usually sits in the second field, but a few records state it as
    // type(IQ/VH) instead.
    const second = (splitTop(r.text)[1] ?? "").trim();
    const pair = /^type\(/.test(second) ? (f.get("type") ?? "") : second;
    const parts = pair.split("/");
    // A skill of the Basic Set written with only a blank for its specialty is
    // the skill itself -- Area Knowledge ([Area]) is Area Knowledge (p. 176).
    // A technique keeps its blank, since it is nothing without its skill, and
    // so does every supplement's skill, which #138 left to the traits and gear.
    const skillBlank = !isSupplement(source) && parts[0]?.trim() !== "Tech";
    let bare = entryName(nameOf(r), siblings, { supplement: isSupplement(source), blankSpecialty: skillBlank });
    // Two blank records of one skill differ in what the blank says: Hobby
    // Skill ([DX-based]) and ([IQ-based]) are the DX and IQ hobbies (p. 200).
    const blankText = skillBlank ? /\((?:%([^%()]*)%|\[([^\][()]*)\])\)$/.exec(nameOf(r)) : null;
    if (blankText && bare !== nameOf(r) && (blanksOf.get(bare) ?? 0) > 1) bare = `${bare} (${blankText[1] ?? blankText[2]})`;
    // A technique for any skill of a kind -- Disarming (%Melee Combat Skill%),
    // Jam ([Skill]) -- is one open record, its skill chosen when it is taken.
    if (parts[0]?.trim() === "Tech" && PLACEHOLDER.test(bare)) {
      const open = openTechnique(r, f, recs, source);
      if (open) {
        const name = openNames.get(open.key) ?? open.base;
        const technique = parseTechnique(name, parts[1]?.trim(), open.f, ids, reject, note, source);
        if (technique) {
          technique.system.prerequisite = "";
          const at = Object.keys(technique.system).indexOf("prerequisite") + 1;
          const entries = Object.entries(technique.system);
          entries.splice(at, 0,
            ...(open.families.length ? [["skillFamilies", open.families]] : []),
            ...(open.choices.length ? [["skillChoices", open.choices]] : []));
          technique.system = Object.fromEntries(entries);
          if (!openTaken.has(name) && openBest.get(name)?.key === open.key) { openTaken.add(name); techniques.push(technique); }
          else reject(name, "duplicate open technique");
        }
        continue;
      }
    }
    if (PLACEHOLDER.test(bare)) { reject(bare, "name is a GCA placeholder"); continue; }
    if (parts.length !== 2) { reject(bare, `no attribute/difficulty pair: "${pair}"`); continue; }

    // GCA writes a wildcard skill's difficulty as "WC" -- Gun!, DX/WC. The
    // model spells it "W": Very Hard, at three times the cost (p. 175).
    const [attr, diff] = parts.map((p) => p.trim()).map((p) => (p === "WC" ? "W" : p));

    if (attr === "Tech") {
      const technique = parseTechnique(bare, diff, f, ids, reject, note, source);
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
      // "SK:Geography ([Area])" names a skill only the player can fill in.
      if (parsed && !(parsed.skill && PLACEHOLDER.test(parsed.skill))) defaults.push(parsed);
    }
    // A college skill "defaults to the core skill at -6" (p. 242), and GCA
    // leaves which core skill as a blank for the player. The book names the
    // two usual ones, so both are offered and the GM can trim.
    if (/^Path of /.test(name) && /SK:\[skill\]/.test(f.get("default") ?? "")) {
      for (const core of ["Ritual Magic", "Thaumatology"]) {
        defaults.push({ from: "skill", attribute: "IQ", skill: core, modifier: -6 });
      }
    }

    skills.push({
      _id: ids.get(name) ?? newId("skill", name, source),
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
        reference: reference(f.get("page"), source.prefix, source.book),
      },
    });
  }
  return { skills, techniques };
}

/**
 * The skill a technique defaults from, and the penalty, from GCA's `default()`.
 *
 * GCA writes it two ways: bare, `SK:Karate::level - 4`, and quoted, with the
 * quote closing after `::level` -- `"SK:Karate::level" - 4`. Reading only the
 * first lost the penalty from every quoted default, so Dual-Weapon Attack came
 * out at no penalty (sargas79/GWorldVTT#193). Null when the first default is
 * not a skill's level.
 */
export function techniqueDefault(raw) {
  const def = /"?SK:([^"]+?)::level"?\s*(?:([+-])\s*(\d+))?/.exec(raw ?? "");
  if (!def) return null;
  return { prerequisite: def[1].trim(), modifier: def[3] ? Number(`${def[2]}${def[3]}`) : 0 };
}

const TECHNIQUE_ATTRIBUTES = new Set(["ST", "DX", "IQ", "HT", "Will", "Per"]);

/** A technique named for a blank skill: "Disarming (%Melee Combat Skill%)", "Jam ([Skill])". */
const OPEN_TECHNIQUE_NAME = /^(.*\S)\s+\((?:%([^%()]+)%|\[([^\][()]+)\])\)$/;

/**
 * GCA's skill groups, as the kinds of skill the system knows (Characters
 * pp. 182-209): the unarmed combat skills, the Melee Weapon skills and the
 * one-handed ones, the Shield skills, the ranged weapon skills.
 */
const SKILL_GROUP_FAMILIES = {
  "Unarmed Combat Skill": "unarmed",
  "Melee Weapon Skill": "melee",
  "One-Handed Melee Weapon Skill": "oneHandedMelee",
  "ShieldSkill": "shield",
  "Ranged Weapon Skill": "ranged",
};

/** The kind of skill an open technique's blank names, however it is spelled. */
function openKind(label) {
  return String(label ?? "").trim().replace(/\s+skill$/i, "").toLowerCase();
}

/** A bracketed blank that names its kind outright: "[Melee Weapon]". */
const BLANK_FAMILIES = { "melee weapon": "melee", "ranged weapon": "ranged" };

/** A record's lines as the file writes them, directives included. */
function rawRecordText(r, source) {
  const lines = source.lines ?? [];
  const out = [];
  for (let i = r.line - 1; i >= 0 && i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    if (!/[_,]\s*$/.test(line) && !line.trim().startsWith("#")) break;
  }
  return out.join("\n");
}

/**
 * A technique GCA writes for any skill of a kind, as one open record
 * (sargas79/GWorldVTT#194), or null for a blank that is not a skill.
 *
 * - `Disarming (%Melee Combat Skill%)` carries a choice list of GCA's groups,
 *   which become the kinds of skill it may be bought for; a group the system
 *   has no kind for is listed out by its members.
 * - `Jam ([Skill])` is free text in GCA. Where the file also writes the
 *   technique for named skills -- Jam (Brawling), Jam (Karate) -- those are
 *   the ones it may be bought for, which is what the book's prerequisite says;
 *   a blank that names its kind ("[Melee Weapon]") is that kind; otherwise it
 *   is open to any skill.
 *
 * Only a blank the default is taken off is a skill: Wrench [Limb] (ST) is not
 * open, and neither is a record whose default does not name the blank.
 *
 * `guessed` is true where the record said nothing about its skills and the
 * ones named in the file for the same technique had to stand in. GCA usually
 * writes both forms of an open technique -- the free-text `[Skill]` one and the
 * `%Skill%` one carrying the choice list -- and only the second knows its own
 * skills, so where both are present the guess is thrown away
 * (sargas79/GWorldVTT#368).
 */
function openTechnique(r, f, recs, source) {
  const m = OPEN_TECHNIQUE_NAME.exec(nameOf(r));
  if (!m) return null;
  const base = m[1];
  const blank = m[2] !== undefined ? `%${m[2]}%` : `[${m[3]}]`;
  const def = f.get("default") ?? "";
  const listForm = m[2] !== undefined ? `SK:%${m[2]}List%` : null;
  const named = listForm && def.includes(listForm) ? listForm : def.includes(`SK:${blank}`) ? `SK:${blank}` : null;
  if (!named) return null;

  const families = new Set();
  const choices = new Set();
  // The choice list's groups sit on "#grouplist" lines, which the record
  // reader skips as directives, so they are read off the file's own lines.
  const raw = rawRecordText(r, source);
  const groups = [...raw.matchAll(/#grouplist\(\s*GR:([^,)]+)/gi)].map((g) => g[1].trim());
  for (const group of groups) {
    const kind = SKILL_GROUP_FAMILIES[group];
    if (kind) families.add(kind);
    else for (const member of source.groups?.get(group) ?? []) choices.add(member.replace(/^SK:/, "").trim());
  }
  // A list of the skills themselves, one quoted a line: No-Landing
  // Extraction's Piloting specialties (Characters p. 233).
  for (const listed of raw.matchAll(/^\s*"([^"]+)"\s*,?\s*_?\s*$/gm)) choices.add(listed[1].trim());
  let guessed = false;
  if (groups.length === 0 && choices.size === 0) {
    guessed = true;
    const prefix = `${base} (`;
    for (const other of recs) {
      if (other.section !== "SKILLS" || other === r) continue;
      const name = nameOf(other);
      if (!name.startsWith(prefix) || PLACEHOLDER.test(name)) continue;
      const skill = name.slice(prefix.length, -1).trim();
      if (!TECHNIQUE_ATTRIBUTES.has(skill)) choices.add(skill);
    }
    if (choices.size === 0) families.add(BLANK_FAMILIES[String(m[3] ?? "").toLowerCase()] ?? "any");
  }

  // The blank reads as a skill the parser can resolve, and is cleared after.
  const opened = new Map(f);
  const token = "SK:__OPEN__";
  for (const key of ["default", "upto", "needs"]) {
    if (opened.has(key)) opened.set(key, opened.get(key).split(named).join(token).split(`"${named}::`).join(`"${token}::`));
  }
  return { key: nameOf(r), base, families: [...families], choices: [...choices], guessed, f: opened };
}

/**
 * An attribute term a default adds after its first: `+ ST:ST`, `- ST:DX::score`.
 */
const REBASE_TERM = /\s*([+-])\s*ST:([A-Za-z]+)(?:::score)?\s*(?=[+-]|$)/gi;

/**
 * The attribute terms a skill's default adds to rebase the technique.
 *
 * GCA writes Snap Weapon as `"SK:Jitte/Sai::level" - 4 + ST:ST - ST:DX`, which
 * is the book's "this technique is ST-based rather than DX-based" written as
 * arithmetic. The data model has no rebasing, so the terms are read out here
 * and reported; the default keeps the skill and its penalty.
 *
 * Returns the terms as "+ST-DX", or "" for a default that rebases nothing.
 */
export function techniqueRebasing(raw) {
  const first = splitTop(raw ?? "")[0] ?? "";
  return withoutRebasing(first.trim()).rebase;
}

/** A default's body without its rebasing terms, and the terms themselves. */
function withoutRebasing(text) {
  // Only a default off a skill rebases: "ST:ST - 4" is an attribute default.
  if (!/^"?SK:/i.test(text)) return { body: text, rebase: "" };
  const terms = [];
  const body = text.replace(REBASE_TERM, (_whole, sign, attribute) => {
    terms.push(`${sign}${attribute.toUpperCase()}`);
    return "";
  });
  return { body: body.trim(), rebase: terms.join("") };
}

/**
 * Every default a technique lists, in the forms GCA writes them:
 *
 * - a skill's level, bare or quoted: `SK:Karate::level - 4`
 * - the Parry or Block that skill gives: `"SK:Judo::parrylevel" - 1`,
 *   `"SK:Shield (Buckler)::blocklevel" - 1`
 * - Dodge: `"ST:Dodge::score" - 2`
 * - an attribute: `"ST:ST::score" - 4`, or bare `ST:ST - 4` as the Basic Set
 *   writes Neck Snap
 *
 * A wildcard skill's entry (`SK:Gun! - 4`) is passed over, as elsewhere. An
 * entry of any other form makes the list unreadable: null.
 */
export function techniqueDefaults(raw) {
  const out = [];
  for (const entry of splitTop(raw ?? "")) {
    const text = entry.trim();
    if (!text) continue;
    // The arithmetic that rebases a technique on an attribute is read out
    // first: the model has no such thing, and it isn't part of the skill's name.
    const rebased = withoutRebasing(text).body;
    const penalty = /\s*([+-])\s*(\d+)\s*$/.exec(rebased);
    const modifier = penalty ? Number(`${penalty[1]}${penalty[2]}`) : 0;
    const body = (penalty ? rebased.slice(0, penalty.index) : rebased).replace(/"/g, "").trim();
    // A skill's name holds no colon, so anything left of an unread term -- more
    // arithmetic, another record's reference -- fails here rather than becoming
    // part of the prerequisite.
    const skill = /^SK:([^:]+?)(?:::(level|parrylevel|blocklevel))?$/i.exec(body);
    if (skill) {
      if (skill[1].trim().endsWith("!")) continue;
      const kind = (skill[2] ?? "level").toLowerCase();
      out.push({ from: kind === "parrylevel" ? "parry" : kind === "blocklevel" ? "block" : "skill", skill: skill[1].trim(), modifier });
      continue;
    }
    const stat = /^ST:([A-Za-z]+)(?:::score)?$/i.exec(body);
    if (stat && /^dodge$/i.test(stat[1])) { out.push({ from: "dodge", skill: "", modifier }); continue; }
    const attribute = stat ? [...TECHNIQUE_ATTRIBUTES].find((a) => a.toLowerCase() === stat[1].toLowerCase()) : null;
    if (attribute) { out.push({ from: attribute, skill: "", modifier }); continue; }
    return null;
  }
  return out.length ? out : null;
}

/**
 * Ceilings the data file gets wrong, by technique name.
 *
 * Whirlwind Attack (Two-Handed Sword) is written `upto(Prereq + 5)`, the
 * figure of Disarming above it on the page; the book caps every Whirlwind
 * Attack at its prerequisite skill (Characters p. 232, sargas79/GWorldVTT#193).
 */
const TECHNIQUE_CEILINGS = {
  "Whirlwind Attack (Two-Handed Sword)": 0,
};

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
function parseTechnique(name, difficulty, f, ids, reject, note, source) {
  if (difficulty !== "A" && difficulty !== "H") {
    reject(name, `technique difficulty not in the model: "${difficulty}"`);
    return null;
  }

  const rebasing = techniqueRebasing(f.get("default"));
  if (rebasing) note(`${name}: the default rebases it on ${rebasing.replace(/([+-])/g, " $1 ").trim()}, which the model has no field for; the skill and its penalty are kept`);
  const defaults = techniqueDefaults(f.get("default"));
  if (!defaults) {
    reject(name, `default is not a skill, defense or attribute: "${f.get("default") ?? ""}"`);
    return null;
  }
  const [first, ...alternates] = defaults;
  const prerequisite = first.skill;
  const defaultModifier = first.modifier;
  if (defaults.some((d) => d.modifier > 0)) { reject(name, "default is a bonus, not a penalty"); return null; }

  // The ceiling names what the default comes off -- `prereq`, the skill,
  // `"SK:Judo::parrylevel"`, `ST:ST + 3`, `ST:DX::score + 5` -- and is read
  // relative to it.
  const upto = f.get("upto") ?? "";
  const relative = upto
    .replace(/"?SK:([^",]+?)(?:::(?:level|parrylevel|blocklevel))?"?(?=\s*(?:[+-]|,|$))/gi, (whole, skill) =>
      skill.trim() === prerequisite ? "prereq" : whole)
    .replace(/"?ST:([A-Za-z]+)(?:::score)?"?/gi, (whole, stat) =>
      (first.from === "dodge" && /^dodge$/i.test(stat)) || stat.toLowerCase() === first.from.toLowerCase() ? "prereq" : whole);
  if (!/prereq/i.test(relative)) {
    reject(name, `ceiling is not relative to the prerequisite: "${upto}"`);
    return null;
  }
  const cap = /prereq\s*(?:([+-])\s*(\d+))?/i.exec(relative);
  const ceiling = TECHNIQUE_CEILINGS[name] ?? (cap[2] ? Number(`${cap[1]}${cap[2]}`) : 0);

  return {
    _id: ids.get(name) ?? newId("technique", name, source),
    name,
    type: "technique",
    system: {
      difficulty,
      prerequisite,
      // Only where it is not a skill's level, so every other technique reads
      // as it always has.
      ...(first.from !== "skill" ? { defaultFrom: first.from } : {}),
      ...(alternates.length ? { alternateDefaults: alternates } : {}),
      defaultModifier,
      points: 0,
      maxRelativeToPrerequisite: ceiling,
      description: "",
      reference: reference(f.get("page"), source.prefix, source.book),
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
  // "all" is what a data file writes for a suit covering the wearer from head
  // to foot: the same idea as "full suit", spelled out rather than left to the
  // pack's own reading. Ultra-tech suits, battlesuits and exoskeletons use it.
  ["all", ["torso", "vitals", "skull", "face", "eye", "neck", "groin", "arm", "leg", "hand", "foot"]],
  // A powered sleeve is worn on one arm and grips with the hand on it.
  ["one arm and hand", ["arm", "hand"]],
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

/** The facts a damage column can carry beside the damage itself. */
const DAMAGE_EXTRAS = {
  damageExtraDice: 0,
  damageSpecial: false,
  surge: false,
};

/**
 * The damage modifiers of Characters pp. 104-105 that a mode may carry, each
 * written only where it is set. The model gives them all a default of false,
 * and nothing in the Basic Set's own file sets any of them -- so writing them
 * out on every mode would add five lines to every weapon in its packs and say
 * nothing. `surge` above predates them and is written either way, which is
 * why it is not in here.
 */
function setModifiers(extras) {
  return Object.fromEntries(Object.entries(extras).filter(([, on]) => on));
}

/**
 * The weapons of the Basic Set's unarmed table whose damage the unarmed skills
 * raise (Characters p. 271, note 3) but whose GCA record does not say so.
 * Brass knuckles are kept by hand with the flag set.
 */
const UNARMED_TABLE_WEAPONS = new Set(["Blackjack", "Sap"]);

/**
 * How far an area attack reaches from where it lands, in yards, where a GCA
 * record says so in its own column: "radius(10yd)".
 */
export function parseRadius(value) {
  const m = /^(\d+(?:\.\d+)?)\s*(?:yd\.?|yards?)?$/i.exec((value ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/**
 * The figure a book prints beside a damage type, which a data file writes as a
 * parenthetical: "aff (10 yd.)".
 *
 * It is not one fact. The Basic Set's stun grenade "affects a 10-yard radius"
 * (Characters p. 277, note [5]); a dazzle weapon in a later book "projects a
 * cone with the specified width at maximum range". Same syntax, two shapes,
 * and the damage column alone does not say which. So it is read only where
 * something else says: a `radius()` column, or the table below.
 */
export function areaNote(damtype) {
  const m = /\((\d+(?:\.\d+)?)\s*(?:yd\.?|yards?)\s*\)/i.exec(damtype ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * The Basic Set's own weapons whose area the book states in a note the record
 * does not carry, with the radius each covers. Every one is a circle, and the
 * page saying so is beside it.
 */
const BASIC_SET_RADIUS = new Map([
  // "A Vision and Hearing-Based affliction that affects a 10-yard radius."
  ["Stun Grenade", 10],
  // "Fills a 2-yard radius with smoke, teargas, etc." (note [4]).
  ["Chemical Grenade", 2],
  // "the Molotov cocktail sets fire to a one-yard radius" (Campaigns p. 411).
  ["Molotov Cocktail", 1],
]);

/**
 * The Basic Set's own weapons with a minimum range, in yards, which the book
 * gives in one note shared by the table (Characters p. 281, note 1) and the
 * records carry only as that shared note. Their first Range figure is a true
 * 1/2D, so it stays.
 */
const BASIC_SET_MIN_RANGE = new Map([
  ["Under-Barrel Grenade Launcher, 40mm", 10],
  ["ATGM, 115mm", 30],
  ["SAM, 70mm", 200],
]);

/**
 * A ranged mode's minimum range, where the record's own notes say plainly
 * what it is. Two forms are read, and only these:
 *
 *   - a note that the first Range figure is the minimum range rather than
 *     1/2D: that figure becomes the minimum, and the mode has no 1/2D;
 *   - a note that the minimum range is a stated percentage of the maximum.
 *
 * A note naming several weapons, each with its own minimum, does not say
 * which applies to this record, and is not read. Returns the fields to set on
 * the mode, or null.
 */
export function minimumRangeOf(itemnotes, mode) {
  const notes = itemnotes ?? "";
  if (!notes || mode.rangeIsStMultiple) return null;
  if (/first range figure is (?:the )?minimum range/i.test(notes) && mode.halfDamageRange > 0) {
    return { minRange: mode.halfDamageRange, halfDamageRange: 0 };
  }
  const share = /minimum range is (\d+(?:\.\d+)?)\s*% of (?:the )?maximum range/i.exec(notes);
  if (share && mode.maxRange > 0) {
    return { minRange: Math.round(mode.maxRange * Number(share[1])) / 100 };
  }
  return null;
}


/**
 * The fragments an explosion throws, in the brackets a table prints beside the
 * damage type (Campaigns p. 414). A data file writes them after the type --
 * "cr ex [2d]" -- or before it -- "[2d] cr ex" -- and inside them it may say
 * more than the dice: an armour divisor, "[1d(0.2)]", or a damage type other
 * than the cutting the Basic Set gives fragments, "[1d-1 cr]". A bracket left
 * unclosed ends with the dice and any divisor: "[1d(0.2) burn ex" is 1d of
 * fragments from a burning explosion.
 *
 * The dice go in `fragmentation`, and since API 1.72.0 a type other than
 * cutting in `fragmentationType` and a divisor in `fragmentationDivisor`,
 * each written only where the bracket gives one. A type the model doesn't know
 * is kept out and reported in the note.
 */
const FRAGMENTS = /\[\s*(\d+d(?:\s*[+-]\s*\d+)?)\s*(?:\(\s*(\d+(?:\.\d+)?)\s*\))?(?:\s*([a-z][a-z+-]*)\s*\]|\s*\]|(?=\s|$))/i;

export function fragmentsOf(damtype) {
  const text = damtype ?? "";
  const m = FRAGMENTS.exec(text);
  if (!m) return { rest: text, dice: "", type: "", divisor: 1, note: "" };
  const written = (m[3] ?? "").toLowerCase();
  const type = written && written !== "cut" && DAMAGE_TYPES.has(written) ? written : "";
  const divisor = m[2] ? Number(m[2]) : 1;
  return {
    rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim(),
    dice: m[1].replace(/\s+/g, ""),
    type,
    divisor: divisor > 0 ? divisor : 1,
    note: written && written !== "cut" && !type ? `fragments carry damage type ${m[3]}, which the mode does not hold` : "",
  };
}

export function parseDamage(damage, damtype) {
  // The fragments come out first: their brackets may hold a parenthesised
  // armour divisor, which the range-note rule below would otherwise eat.
  const fragments = fragmentsOf(damtype);
  // A range note after the type -- "aff (10 yd.)" on a stun grenade -- is a
  // note, not part of the type.
  const rawType = fragments.rest.replace(/\([^)]*\)/g, "").trim();

  // "spec." on the table: a net entangles, a lasso catches, a garrote
  // strangles (Characters pp. 272, 276). The mode rolls to hit; what a hit
  // does is the weapon's own rules, which no damage formula can carry.
  if (/^spcl\.?$/i.test((damage ?? "").trim()) || /^spcl\.?$/i.test(rawType)) {
    return {
      fields: {
        damageBase: "fixed",
        damageModifier: 0,
        damageFormula: "",
        damageType: "cr",
        explosive: false,
        fragmentation: "",
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
        ...DAMAGE_EXTRAS,
        damageSpecial: true,
      },
      usesWeaponSt: false,
    };
  }

  // An affliction is not damage: the target resists with an attribute roll at
  // a penalty, written damage(HT-4) damtype(aff), and what failing does is in
  // the weapon's notes rather than in any number here.
  if (rawType.toLowerCase() === "aff") {
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
        ...DAMAGE_EXTRAS,
      },
      usesWeaponSt: false,
    };
  }

  // The modifiers a table prints after the damage type, none of which changes
  // how much is rolled (Characters pp. 104-105). They come in any order and
  // any combination -- "cr ex inc", "tox rad ex", "burn ex rad sur" -- and a
  // supplement may hang a footnote dagger off one, so each is lifted out of
  // the column wherever it sits and the type is what remains.
  //
  //   sur  Surge: doubled against anything electrical (p. 105).
  //   inc  Incendiary: "may set fires" where it lands (p. 104).
  //   rad  Radiation: rads as well as damage (p. 105).
  //   dkb  Double knockback (p. 104).
  //   nkb  No knockback at all (p. 105).
  let typeText = rawType.replace(/[†*‡]/g, " ").trim();
  const modifier = (word) => {
    const found = new RegExp(`(?:^|\\s)${word}(?=\\s|$)`, "i").test(typeText);
    if (found) typeText = typeText.replace(new RegExp(`(?:^|\\s)${word}(?=\\s|$)`, "i"), " ").replace(/\s+/g, " ").trim();
    return found;
  };
  const surge = modifier("sur");
  const incendiary = modifier("inc");
  const radiation = modifier("rad");
  const doubleKnockback = modifier("dkb");
  const noKnockback = modifier("nkb");

  // "cr ex [2d]" is a crushing explosion throwing 2d of fragmentation
  // (GURPS Basic Set: Campaigns p. 414). The type, the blast and the
  // fragments are three facts written in one column; the fragments were
  // lifted out above, and only an explosion throws them.
  const blast = /^([a-z+-]+)\s+ex$/i.exec(typeText);
  const type = blast ? blast[1].trim() : typeText;
  const explosive = Boolean(blast);
  if (fragments.dice && !explosive) return null;
  const fragmentation = fragments.dice;
  const extras = {
    surge,
    ...setModifiers({ incendiary, radiation, doubleKnockback, noKnockback }),
    // The fragments' own type and divisor, only where the bracket gives them,
    // so a plain "[2d]" reads as it always has.
    ...(fragmentation && fragments.type ? { fragmentationType: fragments.type } : {}),
    ...(fragmentation && fragments.divisor !== 1 ? { fragmentationDivisor: fragments.divisor } : {}),
  };

  if (!DAMAGE_TYPES.has(type)) return null;
  const fragmentNote = fragments.note ? { fragmentNote: fragments.note } : {};

  let text = (damage ?? "").trim();
  // The unarmed skills' damage bonus, which GCA works into the formula itself:
  // `thr + @max(@if("SK:Brawling::level" > ST:DX+1 then @basethdice(ST:Punch)
  // ELSE 0), ...)`. It is the same bonus a punch gets (Characters p. 271,
  // note 3), which the sheet works out from the skill, so the base damage is
  // kept and the mode is marked for it.
  const bonusForm = /^((?:sw|thr)(?:\s*[+-]\s*\d+)*)\s*\+\s*@max\s*\((.*)\)\s*$/is.exec(text);
  const unarmedBonus = Boolean(bonusForm)
    && /SK:(?:Brawling|Boxing|Karate)::level/i.test(bonusForm[2])
    && /@basethdice/i.test(bonusForm[2]);
  if (unarmedBonus) text = bonusForm[1].trim();
  // "sw+4", "sw-2+1d": a base, then any number of point and whole-die terms.
  // A chainsaw adds a die to the swing (Characters p. 274), and the die and
  // the points are two separate facts.
  const scaled = /^(sw|thr)((?:\s*[+-]\s*\d+d?)*)$/i.exec(text);
  if (scaled) {
    let modifier = 0;
    let extraDice = 0;
    for (const term of scaled[2].matchAll(/([+-])\s*(\d+)(d?)/gi)) {
      const value = Number(`${term[1]}${term[2]}`);
      if (term[3]) extraDice += value;
      else modifier += value;
    }
    // A weapon that takes dice off the swing is not on any table.
    if (extraDice < 0) return null;
    return {
      fields: {
        damageBase: scaled[1].toLowerCase(),
        damageModifier: modifier,
        damageFormula: "",
        damageType: type,
        explosive,
        fragmentation,
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
        ...DAMAGE_EXTRAS,
        damageExtraDice: extraDice,
        ...extras,
        // Only where it applies, so every other mode reads as it always has.
        ...(unarmedBonus ? { unarmedBonus: true } : {}),
      },
      usesWeaponSt: false,
      ...fragmentNote,
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
        ...DAMAGE_EXTRAS,
        ...extras,
      },
      usesWeaponSt: true,
      ...fragmentNote,
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
        ...DAMAGE_EXTRAS,
        ...extras,
      },
      usesWeaponSt: false,
      ...fragmentNote,
    };
  }
  return null;
}

/**
 * The skill a mode is used with. GCA lists the whole default chain --
 * `skillused(SK:Sword!, SK:Broadsword, ST:DX-5, SK:Rapier-4, ...)` -- of which
 * the first real skill is the one the weapon is actually used with; the rest
 * are what you fall back to. A leading wildcard group is skipped.
 *
 * Not every file writes the `SK:` prefix. Some list the bare
 * names -- `skillused(Gun!, Guns (Submachine Gun), DX-4, ...)` -- so a name
 * with no prefix counts as a skill too, unless it is an attribute or carries
 * another of GCA's prefixes (`ST:DX`).
 */
export function parseSkillUsed(value) {
  return firstSkill(splitTop(value ?? ""));
}

/**
 * The skill a mode is used with, and any penalty to hit it is used at.
 *
 * A weapon used at a penalty with its own skill has GCA write the penalty
 * into every entry of the list, the skill included --
 * `skillused(SK:Spear-2, ST:DX-5-2, SK:Polearm-4-2, SK:Staff-2-2)` for a
 * weapon a table lists at "-2 to hit". Where every entry ends in the
 * same modifier, that shared modifier is the mode's to-hit modifier and the
 * list is read again without it. Any other list reads as parseSkillUsed always
 * has, with no modifier: a shield's, where only the defaults carry one.
 */
export function parseSkillUsedWithModifier(value) {
  const entries = splitTop(value ?? "").map((entry) => entry.trim().replace(/^"|"$/g, "").trim()).filter(Boolean);
  const trailing = entries.map((entry) => /([+-]\s*\d+)$/.exec(entry)?.[1]?.replace(/\s+/g, "") ?? null);
  const shared = trailing.length > 0 && trailing.every((m) => m !== null && m === trailing[0]) ? trailing[0] : null;
  if (shared !== null) {
    const stripped = entries.map((entry) => entry.replace(/[+-]\s*\d+$/, "").trim());
    const skill = firstSkill(stripped);
    if (skill) return { skill, modifier: Number(shared) };
  }
  return { skill: firstSkill(entries), modifier: 0 };
}

function firstSkill(entries) {
  for (const entry of entries) {
    const text = entry.trim().replace(/^"|"$/g, "").trim();
    // An entry carrying a modifier is a default -- what you fall back to if you
    // lack the real skill -- not the skill the weapon is used with. A shield's
    // list reads "ST:DX-4, SK:Shield (Buckler)-2, SK:Shield (Force)-2,
    // SK:Shield (Shield)", and the unmodified one at the end is the answer.
    if (/[+-]\s*\d+$/.test(text)) continue;
    const prefixed = /^SK:(.+)$/i.exec(text);
    if (!prefixed && /^[A-Z]{2}:/.test(text)) continue;
    const name = (prefixed ? prefixed[1] : text).replace(/^"|"$/g, "").trim();
    // A blank the player fills in -- %examplealiaslist% -- names no skill yet.
    if (!name || name.endsWith("!") || ATTRIBUTES.has(name) || PLACEHOLDER.test(name)) continue;
    return name;
  }
  return "";
}

/**
 * A minimum ST, and everything else the ST column says (Characters p. 270).
 *
 * "†" is a weapon that needs two hands; "‡" one that needs two hands and
 * becomes unready after each attack unless the wielder has 1.5 times the
 * listed ST. Before the dagger a firearm may carry "R" for a musket rest,
 * "B" for a bipod or "M" for a weapon usually fired from a mount.
 */
const MOUNTS = { R: "rest", B: "bipod", M: "mounted" };

export function parseMinSt(value) {
  const m = /^(\d+)\s*([RBM])?\s*(†|‡)?/.exec((value ?? "").trim());
  if (!m) return { minSt: null, twoHanded: false, unreadyAfterAttack: false, mount: "" };
  return {
    minSt: Number(m[1]),
    twoHanded: Boolean(m[3]),
    unreadyAfterAttack: m[3] === "‡",
    mount: MOUNTS[m[2] ?? ""] ?? "",
  };
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

/** Yards in a mile, for the ranges a book prints in miles (Characters p. 270). */
const YARDS_PER_MILE = 1760;

/**
 * A range figure. It is either a distance in yards, or a multiple of ST --
 * which GCA writes `ST*15` for the wielder's ST and `me::weaponst*15` for a
 * bow's own. Anything else is one of GCA's sheet formulas, notably the one it
 * uses for thrown weapons, and cannot be reduced to a number here.
 */
function parseRange(value) {
  const text = (value ?? "").trim().replace(/(\d),(?=\d)/g, "$1");
  if (text === "") return { distance: 0, stMultiple: false, ofWeapon: false };
  if (/^\d+(\.\d+)?$/.test(text)) {
    return { distance: Number(text), stMultiple: false, ofWeapon: false };
  }
  // A range the book prints in miles, where the tables otherwise give yards.
  // The unit is marked on the maximum alone -- "17/50 mi." arrives as
  // rangehalfdam(17), rangemax(50 mi.) -- so the half is converted beside it
  // where the pair is read, not here.
  const miles = /^(\d+(?:\.\d+)?)\s*mi\.?$/i.exec(text);
  if (miles) {
    return { distance: Number(miles[1]) * YARDS_PER_MILE, stMultiple: false, ofWeapon: false, miles: true };
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

  const { minSt, twoHanded, unreadyAfterAttack } = parseMinSt(f.get("minst"));
  // A data file writes a cosmic armour divisor "!". It is not one of the
  // divisors the Basic Set lists, and it is not a number: it means DR has no
  // effect on the blow at all, which the model already carries as its own
  // fact for a Malediction (Characters p. 106). So it is read as that, and
  // the divisor stays at one.
  const rawDivisor = f.get("armordivisor");
  const cosmic = rawDivisor !== undefined && rawDivisor.trim() === "!";
  const divisor = cosmic ? undefined : rawDivisor;
  if (divisor !== undefined && !/^\d+(\.\d+)?$/.test(divisor.trim())) {
    return { error: `armour divisor "${divisor}"` };
  }
  const used = parseSkillUsedWithModifier(f.get("skillused"));

  return {
    ...(damage.fragmentNote ? { fragmentNote: damage.fragmentNote } : {}),
    mode: {
      name,
      skill: used.skill,
      // Only where there is one, so a weapon with none reads as it always has.
      ...(used.modifier ? { skillModifier: used.modifier } : {}),
      ...damage.fields,
      armorDivisor: divisor === undefined ? 1 : Number(divisor),
      ...(cosmic ? { ignoresDr: true } : {}),
      reach: (f.get("reach") ?? "C").trim(),
      ...parry,
      // The flail rule is about the weapon, and the table marks it in the
      // notes rather than in a column, so it is left to the GM to set.
      isFlail: false,
      minSt,
      twoHanded,
      // "‡": two hands, and unready after the swing (Characters p. 270).
      unreadyAfterAttack,
    },
  };
}

/**
 * Mode names a data file gives to a second attack that lands with the first
 * rather than instead of it (Characters p. 106).
 */
export const LINKED_MODE = /^linked\b/i;
export const FOLLOW_UP_MODE = /^follow[ -]?up\b/i;

/**
 * The second line of an attack, taken from the mode the file wrote it as.
 *
 * A linked attack "is rolled separately against DR" and lands on the same
 * attack roll as the one it is linked to; a follow-up only lands if that
 * attack hits, and ignores DR once it penetrates. Either way it is not a way
 * of attacking on its own, so it is folded into the mode before it rather
 * than offered beside it.
 */
export function linkedLine(mode, followUp, label) {
  const damage = mode.affliction
    ? `${mode.afflictionAttribute}${mode.afflictionModifier || ""}`
    : mode.damageFormula || `${mode.damageBase}${mode.damageModifier >= 0 ? "+" : ""}${mode.damageModifier || ""}`;
  return {
    damage,
    damageType: mode.damageType ?? "cr",
    armorDivisor: Number(mode.armorDivisor ?? 1) || 1,
    ...(mode.affliction
      ? {
          affliction: true,
          afflictionAttribute: mode.afflictionAttribute ?? "",
          afflictionModifier: Number(mode.afflictionModifier ?? 0) || 0,
        }
      : {}),
    ...(mode.explosive ? { explosive: true } : {}),
    ...(mode.fragmentation ? { fragmentation: mode.fragmentation } : {}),
    ...(mode.fragmentation && mode.fragmentationType ? { fragmentationType: mode.fragmentationType } : {}),
    ...(mode.fragmentation && mode.fragmentationDivisor ? { fragmentationDivisor: mode.fragmentationDivisor } : {}),
    ...(followUp ? { followUp: true } : {}),
    ...(label ? { label } : {}),
  };
}

/** The unarmed skills a skillused() list names outright, in its order. */
export function unarmedSkillsIn(value) {
  const found = [];
  for (const entry of splitTop(value ?? "")) {
    const m = /^\s*"?(?:SK:)?(Brawling|Boxing|Karate)"?\s*$/i.exec(entry);
    if (!m) continue;
    const skill = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    if (!found.includes(skill)) found.push(skill);
  }
  return found;
}

/**
 * A blow with the unarmed bonus, once for each unarmed skill it may be struck
 * with.
 *
 * A mode names one skill, and the bonus is the one for the skill the blow is
 * rolled with (Characters p. 271, note 3) -- so a combat fan listed for
 * "Brawling, Karate" as a single mode would give a Karate fighter neither the
 * roll nor the bonus. The Basic Set's brass knuckles are kept by hand the same
 * way, one mode a skill: "Crush (Brawling)", "Crush (Karate)".
 */
function byUnarmedSkill(mode, skillused) {
  if (!mode.unarmedBonus) return [mode];
  const skills = unarmedSkillsIn(skillused);
  if (skills.length < 2) return [mode];
  return skills.map((skill) => ({ ...mode, name: `${mode.name} (${skill})`, skill }));
}

/**
 * The RoF column (Characters p. 270), which carries more than the number.
 *
 * "3x9" is three shots of nine projectiles each. A mark after the number is
 * kept as written: "!" is a weapon that fires only on full auto, whose least
 * RoF is a quarter of the listed one, and a book may define marks of its own
 * ("#"), which the mode keeps for that book to read. A second rate after a
 * slash -- "9#/7", "33!/66!" -- is a second setting of the same weapon, kept
 * beside the first with its own mark. Each extra is written only where it is
 * set, so a weapon with a plain RoF reads as it always has.
 */
export function parseRateOfFire(value) {
  const text = (value ?? "").trim();
  const first = /^(\d+)\s*([!#])?/.exec(text);
  const second = /\/\s*(\d+)\s*([!#])?/.exec(text);
  return {
    rateOfFire: Math.max(1, number(text, 1)),
    projectiles: Math.max(1, number((/x(\d+)/i.exec(text) ?? [])[1], 1)),
    ...(first?.[2] ? { rateOfFireMark: first[2] } : {}),
    ...(second ? { rateOfFireSecond: Number(second[1]) } : {}),
    ...(second?.[2] ? { rateOfFireSecondMark: second[2] } : {}),
  };
}

/**
 * Why a mode's damage column states no damage at all, or "" where it does.
 *
 * A data file fills the column with a word where the table prints an effect
 * -- "Special", "Smoke (7 yd.)" -- or leaves it empty beside a type that
 * names what a hit does instead -- "drug effect", "paint splat". Neither is
 * damage the model could hold, and neither is a broken record: the weapon's
 * own rules say what happens.
 */
export function placeholderDamage(damage, damtype) {
  // Whatever the damage reader takes is not a placeholder: an empty column
  // beside "spcl." is the table's own "spec." (Characters p. 272).
  if (parseDamage(damage, damtype)) return "";
  const text = (damage ?? "").trim();
  const type = (damtype ?? "").trim();
  if (!text) return type ? `no damage beside "${type}"` : "";
  const words = text.replace(/\([^)]*\)/g, "").trim();
  if (!/^[a-z][a-z .]*$/i.test(words)) return "";
  if (/^(?:sw|thr|spcl\.?)$/i.test(words)) return "";
  if (RESISTANCE.some((a) => a.toLowerCase() === words.toLowerCase())) return "";
  return `damage "${text}" names an effect, not damage`;
}

/** Mode names that describe a state of the weapon: a folded stock, a bipod up or down. */
export const STATE_MODE = /folded stock|\bw\/o?\s*bipod\b/i;

/**
 * The modes at the end of a list that fire the same round as the last one:
 * the same damage, type, divisor and fragments, and no second line of their
 * own yet. A second line written after them all belongs to each.
 */
function sameRound(modes) {
  const last = modes[modes.length - 1];
  const key = (m) => JSON.stringify([
    m.damageBase, m.damageModifier, m.damageFormula, m.damageExtraDice, m.damageType,
    m.armorDivisor, m.explosive, m.fragmentation, m.fragmentationType ?? "", m.fragmentationDivisor ?? 1,
    m.affliction, m.afflictionAttribute, m.afflictionModifier,
  ]);
  const out = [];
  for (let i = modes.length - 1; i >= 0; i--) {
    const mode = modes[i];
    if (mode.linked || key(mode) !== key(last)) break;
    out.unshift(mode);
  }
  return out.length ? out : [last];
}

/** A ranged mode, or null with a reason. */
function rangedMode(name, f, thrown) {
  const damage = parseDamage(f.get("damage"), f.get("damtype"));
  if (!damage) return { error: `damage "${f.get("damage") ?? ""}" ${f.get("damtype") ?? ""}` };

  // A jet is sprayed rather than fired, and the tables print "Jet" in the
  // Accuracy column (Characters p. 106; the flamethrower, p. 281). There is no
  // Accuracy to add and no half-damage range: the column beside it gives how
  // far the jet reaches, in yards, which is the maximum range read below.
  const rawAcc = (f.get("acc") ?? "0").trim() || "0";
  const jet = /^jet$/i.test(rawAcc);
  const acc = jet ? ["jet", "0", undefined] : /^(\d+)(?:\s*\+\s*(\d+))?$/.exec(rawAcc);
  if (!acc) return { error: `accuracy "${f.get("acc") ?? ""}"` };

  let half = parseRange(f.get("rangehalfdam"));
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
  // The unit is marked on the maximum alone, so a bare half-damage range
  // beside a maximum in miles is in miles too: "17/50 mi." is seventeen miles
  // and fifty, not seventeen yards and fifty miles.
  if (max?.miles && half && !half.miles && !half.stMultiple && half.distance > 0) {
    half = { ...half, distance: half.distance * YARDS_PER_MILE, miles: true };
  }

  // A data file writes a cosmic armour divisor "!". It is not one of the
  // divisors the Basic Set lists, and it is not a number: it means DR has no
  // effect on the blow at all, which the model already carries as its own
  // fact for a Malediction (Characters p. 106). So it is read as that, and
  // the divisor stays at one.
  const rawDivisor = f.get("armordivisor");
  const cosmic = rawDivisor !== undefined && rawDivisor.trim() === "!";
  const divisor = cosmic ? undefined : rawDivisor;
  if (divisor !== undefined && !/^\d+(\.\d+)?$/.test(divisor.trim())) {
    return { error: `armour divisor "${divisor}"` };
  }

  const { minSt, twoHanded, mount } = parseMinSt(f.get("minst"));

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
    ...(damage.fragmentNote ? { fragmentNote: damage.fragmentNote } : {}),
    mode: {
      name,
      skill,
      ...damage.fields,
      armorDivisor: divisor === undefined ? 1 : Number(divisor),
      ...(cosmic ? { ignoresDr: true } : {}),
      accuracy: Number(acc[1]),
      scopeBonus: acc[2] ? Number(acc[2]) : 0,
      halfDamageRange: half?.distance ?? 0,
      maxRange: max?.distance ?? 0,
      rangeIsStMultiple: max?.stMultiple ?? false,
      // "3x9" is three shells of nine pellets (Campaigns p. 409).
      ...parseRateOfFire(f.get("rof")),
      shots: (f.get("shots") ?? "").trim(),
      // Full when it arrives: the magazine and the chambered round.
      loaded: fullLoad((f.get("shots") ?? "").trim()),
      reloadWeight: 0,
      ammunition: "",
      minSt,
      twoHanded,
      // A bow's damage and range come off the bow's own ST rather than the
      // archer's, and the table states that ST in the same column as the
      // minimum needed to use it.
      weaponSt: max?.ofWeapon || damage.usesWeaponSt ? minSt : null,
      thrown,
      // "R", "B" or "M" after the ST: a rest, a bipod, a mount (p. 270).
      mount,
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
export function parseDr(value) {
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
/**
 * The tech level a record is written at.
 *
 * A figure, or a superscience one: "the rules give the TL of superscience
 * developments as '^' instead of a number" (Campaigns p. 513), so a data file
 * writes "11^" for something superscientific at TL11 and "^" for something
 * with no fixed TL at all. Both are kept as they are written, because the
 * item's tech level is text and the caret is what the book prints.
 *
 * Anything else -- "Var.", a GCA formula -- is not a tech level and is dropped.
 */
export function techLevel(value) {
  const text = (value ?? "").trim();
  return /^\d*\^$|^\d+$/.test(text) ? text : "";
}

function physical(f) {
  return {
    quantity: 1,
    weight: Math.max(0, number(f.get("baseweight"), 0)),
    cost: Math.max(0, number(f.get("basecost"), 0)),
    carried: true,
    equipped: false,
    tl: techLevel(f.get("techlvl")),
    lc: legalityClass(f.get("lc")),
    costOfLivingPercent: 0,
  };
}

/**
 * The share of a month's cost of living an article of clothing costs
 * (Characters p. 266). GCA prices these by asking the player, and states the
 * figure in the question: "Average cost is 20% of the characters cost of
 * living". The percentage is the book's statistic, so it is kept; the
 * question is not.
 */
export function costOfLivingPercent(text) {
  const m = /(\d+)% of cost of living/i.exec(text ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * A weight GCA states only for display, because the record's own is a
 * placeholder the player fills in: a complete wardrobe is "20+" pounds
 * (Characters p. 266).
 */
export function displayWeight(text) {
  const m = /displayweight\((\d+(?:\.\d+)?)\+?\)/i.exec(text ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * What a Shots column holds when full (Characters p. 270): "30+1(3)" is a
 * magazine of thirty and one in the chamber; "T(1)" is a thrown weapon, one
 * shot; a blank column holds nothing to count. The rules engine reads the
 * same column in full; this is only what a fresh weapon starts with.
 */
export function fullLoad(shots) {
  // GCA writes a large magazine the way the book prints it, with a thousands
  // separator: "9,000(3)". Left in, the number stops at the comma and a
  // 9,000-shot power cell arrives holding nine.
  const m = /^(T|\d+)(\+1)?/i.exec((shots ?? "").trim().replace(/(\d),(?=\d)/g, "$1"));
  if (!m) return 0;
  if (m[1].toUpperCase() === "T") return 1;
  return Number(m[1]) + (m[2] ? 1 : 0);
}

/**
 * A Legality Class, 0 to 4 (Characters p. 267). GCA leaves the field blank
 * where the book prints "-", and both mean the item has no class rather than
 * a class of nothing.
 */
export function legalityClass(value) {
  const text = (value ?? "").trim();
  return /^[0-4]$/.test(text) ? Number(text) : null;
}

/**
 * A shield's DR and HP (Characters p. 287), which GCA writes as one token --
 * dr(5/20) -- on the shields and as two fields on the cloaks; a force shield
 * has DR 100 and no HP to lose, written hp(--).
 */
export function parseShieldStats(dr, hp) {
  const both = /^(\d+)\/(\d+|-+)$/.exec((dr ?? "").trim());
  if (both) {
    return { dr: Number(both[1]), hp: /^\d+$/.test(both[2]) ? Number(both[2]) : null };
  }
  const plain = /^(\d+)$/.exec((dr ?? "").trim());
  const points = /^(\d+)$/.exec((hp ?? "").trim());
  return { dr: plain ? Number(plain[1]) : 0, hp: points ? Number(points[1]) : null };
}

/**
 * Splits on "|" at paren depth zero. A skill list carries its own commas --
 * "SK:Gun!, SK:Guns (Rifle) | SK:Gun!, SK:Guns (Rifle)" -- so the comma
 * splitter cannot stand in for this.
 */
function splitPipes(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "|" && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/**
 * GCA writes a weapon with two readings of a column as alternatives split by
 * "|" -- a sniper rifle's acc(6+3 | 7+3) with mode(w/o Bipod | w/ Bipod), or
 * an omni-blaster's damage(3d | HT-3) with mode(blaster | stun) -- one
 * record standing for as many modes as there are alternatives.
 *
 * Two kinds are told apart by what the alternatives are. A second setting of
 * the same shot -- with the bipod down -- is the bipod rule applied (p. 270),
 * which the sheet applies itself from the mount mark, so only the first
 * reading is kept. Anything else is a different attack, and each becomes a
 * mode of its own named as GCA names it.
 */
export function alternatives(name, f) {
  const split = new Map();
  let count = 1;
  for (const [key, value] of f) {
    if (!value.includes("|")) continue;
    const parts = splitPipes(value);
    if (parts.length < 2) continue;
    split.set(key, parts);
    count = Math.max(count, parts.length);
  }
  if (count === 1) return [{ name, f }];

  const names = split.get("mode") ?? [];
  if (names.some((n) => /bipod/i.test(n))) {
    const first = new Map(f);
    for (const [key, parts] of split) first.set(key, parts[0]);
    first.delete("mode");
    return [{ name, f: first }];
  }

  const out = [];
  for (let i = 0; i < count; i++) {
    const alt = new Map(f);
    for (const [key, parts] of split) alt.set(key, parts[Math.min(i, parts.length - 1)]);
    alt.delete("mode");
    out.push({ name: names[i] ?? name, f: alt });
  }
  return out;
}

/**
 * What kind of thing a piece of gear is, for the Gear tab to sort by.
 *
 * GCA categorises weapons, armour and vehicles and nothing else, so the rest
 * is read off the name. A weapon is anything with an attack mode; of what is
 * left, a kit or an instrument is a tool, something used up -- fuel, light,
 * food, ammunition, medicine -- is a consumable, and everything else is
 * miscellaneous gear. The sheet lets a GM refile any of them.
 */
const TOOL_NAMES = /\b(kit|tools?|lockpicks|crowbar|pickaxe|saw|shovel|whetstone|cutting torch|plow|spinning wheel|knitting needles|balance|wheelbarrow|lab|instruments|compass|gps|binoculars|telescope|camera|camcorder|recorder|radio|computer|phone|flashlight|lantern|climbing gear|grapnel|fishhooks|metal detector|goggles|handcuffs|bug|microphone|mike|beacon|nanobug|typewriter|wax tablet|lighter|stove|wristwatch|tv set|silencer|laser sight)\b/i;
const CONSUMABLE_NAMES = /\b(water|gasoline|kerosene|oil|candle|torch|matches|rations|tablets|batteries|film|antibiotic|antitoxin|bandages|arrow|bolt|dart|pellet|gas bottle)\b/i;

/**
 * The class a weapon is priced in (Characters p. 274), which GCA names in
 * the modifier groups it offers the weapon: "Sword Class Quality", "Cutting
 * Class Quality", "Crushing/Imp Class Quality", "Guns", "Beams", "Bow
 * Quality". Blank where it offers none, and the sheet reads the modes.
 */
/**
 * The self-control number a disadvantage comes with (Characters p. 120).
 *
 * The book prices Bad Temper, Greed, Phobia and the rest "for a self-control
 * number of 12"; the other numbers are the same trait at another price. The
 * data file marks each such disadvantage with the Self-Control modifier group
 * rather than a number, so the standard one is stamped here and the sheet's
 * dropdown reprices it for any other.
 */
export const STANDARD_SELF_CONTROL = 12;

/** Whether a record's `mods(...)` names the Self-Control group. */
export function takesSelfControlRoll(mods) {
  return String(mods ?? "")
    .split(",")
    .some((group) => group.trim().toLowerCase() === "self-control");
}

export function weaponClassOf(mods) {
  const text = mods ?? "";
  if (/Sword Class/i.test(text)) return "sword";
  if (/Cutting Class/i.test(text)) return "cutting";
  if (/Crushing\/Imp Class/i.test(text)) return "crushing";
  if (/\b(Guns|Beams)\b/.test(text)) return "firearm";
  if (/Bow Quality/i.test(text)) return "bow";
  return "";
}

/**
 * What a record of rounds fits, where it is one: arrows fit bows and bolts
 * crossbows (Characters pp. 275-276). Blank for everything else.
 */
function ammunitionFitOf(name) {
  // The name must end or go on with a space, a comma or a parenthesis: a
  // Bolt-Action Rifle is not a bolt.
  if (/^arrows?(?=[\s,(]|$)/i.test(name)) return "arrow";
  if (/^(?:crossbow )?bolts?(?=[\s,(]|$)/i.test(name)) return "bolt";
  return "";
}

function categoryOf(name, armed) {
  if (armed) return "weapon";
  // Rounds are carried to be loaded, not merely used up.
  if (ammunitionFitOf(name)) return "ammunition";
  // A cutting torch's gas bottle is used up; the torch itself is not.
  if (/gas bottle/i.test(name)) return "consumable";
  if (TOOL_NAMES.test(name)) return "tool";
  if (CONSUMABLE_NAMES.test(name)) return "consumable";
  return "misc";
}

export function parseEquipment(recs, reject, note, source = BASIC_SET_SOURCE) {
  const ids = existingIds(source.outDir, "equipment");
  const armor = [];
  const gear = [];
  const shields = [];
  // The hand-written files carry what the tables give and GCA does not --
  // an atlatl's darts as modes of the atlatl -- and an entry there is the
  // one to keep. The parser writes only its own three files, named for the
  // book being read: a supplement's carry its stem, and taking them for
  // hand-written ones would reject every entry on a second run.
  const written = fileNames(bookPrefix(source.prefix) === bookPrefix(BASIC_SET.prefix), source.book);
  const handMade = handWrittenIds(source.outDir, "equipment", [written.armor, written.gear, written.shields]);
  const taken = new Set(handMade.keys());
  const siblings = namesIn(recs, "EQUIPMENT");

  for (const r of recs) {
    if (r.section !== "EQUIPMENT") continue;

    const f = fields(r.text);
    if (!keeps(r, f, source)) continue;

    // A bow is named for the ST it is built to, which GCA leaves for the
    // player to pick: "Longbow (ST%choice%)". The compendium carries the
    // weapon, and the ST it was built to is edited on the item, so the
    // placeholder comes off the name rather than the record being skipped.
    if (isBookkeeping(nameOf(r), { supplement: isSupplement(source) })) { reject(nameOf(r), "GCA bookkeeping record"); continue; }
    const hidden = nameOf(r).startsWith("_");
    const name = entryName(nameOf(r), siblings, { supplement: isSupplement(source) }).replace(/\s*\(ST%choice%\)$/, "");
    // A GCA directive body -- "#ReplaceTags in ... with { basecost(60), ... }"
    // -- parses as a record whose first field is a field rather than a name.
    if (/^[a-z]+\(/.test(name)) continue;
    if (PLACEHOLDER.test(name)) { reject(name, "name is a GCA placeholder"); continue; }
    // A hidden record that spells out another one's contents --
    // "_Basic Gear: Bandages, Cigarette Lighter, ..." beside "_Basic Gear" --
    // is GCA's longer label for the character sheet, not a second item.
    const spelledOut = hidden && /^([^:]+):\s/.exec(name);
    if (spelledOut && siblings.has(spelledOut[1])) { reject(name, `longer label for ${spelledOut[1]}`); continue; }
    const variantOf = qualityVariantOf(name, siblings);
    if (variantOf) { reject(name, `quality variant of ${variantOf}, whose quality is a field`); continue; }
    if (/Vehicles/.test(f.get("cat") ?? "")) continue;
    if (taken.has(name)) { reject(name, "duplicate name"); continue; }

    const common = {
      ...physical(f),
      description: "",
      reference: reference(f.get("page"), source.prefix, source.book),
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
        _id: ids.get(name) ?? newId("shield", name, source),
        name,
        type: "shield",
        system: {
          ...common,
          db: number(f.get("db"), 1),
          ...parseShieldStats(f.get("dr"), f.get("hp")),
          // The table's shield is the wooden one; iron and plastic are
          // worked out from it (Characters p. 287, note 4).
          composition: "wood",
          listCost: common.cost,
          listWeight: common.weight,
          skill,
          meleeModes: bashes,
        },
      });
      continue;
    }

    // A melee net carries db(0) and dr(0): a weapon written with a shield's
    // columns, both of them nothing. Only a piece with DR to give is armour.
    if (f.has("dr") && !(f.has("db") && number(f.get("dr"), 0) === 0)) {
      const dr = parseDr(f.get("dr"));
      if (!dr) { reject(name, `DR "${f.get("dr")}" not a plain figure or a split`); continue; }

      // The footnote a split falls under and the piece's tech level should
      // agree. Where they do not, one of the two readings is wrong and the
      // wrong one silently changes what stops a mace.
      // The figure in the tech level, with a superscience caret left off:
      // "11^" is TL11, and a bare "^" has no figure to compare at all.
      const tl = Number(/\d+/.exec(techLevel(f.get("techlvl")))?.[0] ?? "0");
      // The reason names the record and both readings, so a book whose file
      // has it wrong can patch the one that is.
      if (dr.drSplit !== null && dr.lowTech === tl >= 7) {
        const footnote = dr.lowTech
          ? "the low-tech footnote (lower DR against crushing only), which is for TL6 and below"
          : "the high-tech footnote (higher DR against piercing and cutting only), which is for TL7 and up";
        reject(name, `split DR footnote and TL${tl} disagree: ${name} has dr(${f.get("dr")}), ${footnote}, but techlvl(${f.get("techlvl") ?? ""}); patch whichever is wrong`);
        continue;
      }

      const parts = splitTop(f.get("location") ?? "")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      const unknown = parts.filter((p) => !LOCATIONS.has(p));
      if (unknown.length) { reject(name, `unknown location "${unknown.join(", ")}"`); continue; }
      if (parts.length === 0) { reject(name, "no location"); continue; }

      taken.add(name);

      armor.push({
        _id: ids.get(name) ?? newId("armor", name, source),
        name,
        type: "armor",
        system: {
          ...common,
          dr: dr.dr,
          drSplit: dr.drSplit,
          drSplitAppliesTo: dr.drSplitAppliesTo,
          locations: [...new Set(parts.flatMap((p) => LOCATIONS.get(p)))],
          // The marks on the tables (Characters p. 282): "*" flexible, "F"
          // front only, and a boot's sole.
          flexible: dr.flags.includes("*"),
          frontOnly: dr.flags.includes("F"),
          // The footnote is prose the reader drops; only whether the piece
          // carries it comes through, as one fact about the piece.
          concealable: /concealable as or under clothing/i.test(r.text),
          blocksPeripheralVision: /no peripheral vision/i.test(r.text),
          soleDr: dr.sole ?? null,
          // The Environment Suit skill a sealed suit is operated with (Characters p. 192).
          environmentSuit: environmentSuitFor(name),
        },
      });
      continue;
    }

    // Everything else is equipment, which carries its attack modes if it has any.
    // A weapon states each way of using it as a newmode(); a firearm or a bow
    // has one way and states it on the record itself, naming it in mode() where
    // the book gives it a name -- a longbow's "Barbed-head".
    const declared = modes(r.text);
    const single = (f.get("mode") ?? "").includes("|") ? "" : (f.get("mode") ?? "").trim();
    const scopes = declared.length > 0
      ? declared.flatMap((m) => alternatives(splitTop(m)[0].trim(), fields(m)))
      : alternatives(single, f);

    const meleeModes = [];
    const rangedModes = [];
    let usable = declared.length === 0 && !f.has("damage");

    for (const scope of scopes) {
      const isMelee = scope.f.has("reach") || scope.f.has("parry");
      const isRanged = scope.f.has("acc") || scope.f.has("rof") || scope.f.has("rangemax");
      if (!isMelee && !isRanged) continue;

      // A goat's foot is filed with the crossbows and given every column of
      // one, all of them blank: it is a tool for cocking a bow, not a way of
      // attacking, and it is kept as gear rather than lost as a weapon that
      // does no damage.
      const blank = (key) => !(scope.f.get(key) ?? "").trim();
      if (blank("damage") && blank("damtype")) { usable = true; continue; }

      // A mode whose damage column names an effect rather than stating any
      // damage -- "Special", "Smoke (7 yd.)", or nothing beside a type that
      // says what the hit does -- has nothing for a damage roll to use. The
      // mode is skipped and the record kept: the weapon is still a thing to
      // carry, and its other modes still work.
      const placeholder = placeholderDamage(scope.f.get("damage"), scope.f.get("damtype"));
      if (placeholder) {
        note(`${name}: ${scope.name || "attack"}: ${placeholder}; the mode is skipped`);
        usable = true;
        continue;
      }

      // A thrown weapon is one you let go of: the table gives it a range in
      // multiples of ST and a shots entry of "T".
      const thrown = /^T/.test(scope.f.get("shots") ?? "");
      const result = isMelee
        ? meleeMode(scope.name || "attack", scope.f)
        : rangedMode(scope.name || "attack", scope.f, thrown);

      if (result.error) { reject(name, `${scope.name || "attack"}: ${result.error}`); continue; }
      if (result.warning) note(`${name}: ${result.warning}`);
      if (result.skillWarning) note(`${name}: ${result.skillWarning}`);
      if (result.fragmentNote) note(`${name}: ${scope.name || "attack"}: ${result.fragmentNote}`);
      usable = true;

      // A second line that lands with the attack before it rather than
      // instead of it is folded into that attack, not offered beside it
      // (Characters p. 106). With nothing before it there is nothing to link
      // to, so it stands as a mode of its own.
      //
      // A weapon may fire the same round two ways -- indirect and direct
      // fire, say -- and write the second line once after both. Every mode
      // just before it that fires the same round gets it.
      const followUp = FOLLOW_UP_MODE.test(scope.name ?? "");
      const into = isMelee ? meleeModes : rangedModes;
      if ((LINKED_MODE.test(scope.name ?? "") || followUp) && into.length > 0) {
        const line = linkedLine(result.mode, followUp, scope.name.trim());
        for (const mode of sameRound(into)) mode.linked = { ...line };
        continue;
      }

      // How far an area attack reaches from where it lands (Campaigns p. 413).
      // The record's own column is taken where it has one; otherwise the Basic
      // Set's three, whose radius is in a note the record does not carry. The
      // figure a book prints beside the damage type says nothing on its own --
      // a radius on one weapon, a cone's width on another -- so it is reported
      // rather than read.
      if (!isMelee) {
        const stated = parseRadius(scope.f.get("radius") ?? f.get("radius"));
        const known = isSupplement(source) ? 0 : (BASIC_SET_RADIUS.get(name) ?? 0);
        const radius = stated || known;
        if (radius > 0) {
          result.mode.radius = radius;
          result.mode.areaAttack = true;
        } else if (areaNote(scope.f.get("damtype"))) {
          note(`${name}: damage type says "${(scope.f.get("damtype") ?? "").trim()}"; a radius or a cone's width, and the record does not say which`);
        }

        // The least distance it can hit at, where the record's notes say so
        // plainly, or the Basic Set's table does in a note the record shares.
        const minimum = minimumRangeOf(f.get("itemnotes"), result.mode);
        const knownMinimum = isSupplement(source) ? 0 : (BASIC_SET_MIN_RANGE.get(name) ?? 0);
        if (minimum) Object.assign(result.mode, minimum);
        else if (knownMinimum > 0) result.mode.minRange = knownMinimum;
        else if (/minimum range/i.test(f.get("itemnotes") ?? "")) {
          note(`${name}: its notes give a minimum range this reader cannot tie to the record; none is set`);
        }
      }

      if (isMelee) meleeModes.push(...byUnarmedSkill(result.mode, scope.f.get("skillused")));
      else rangedModes.push(result.mode);
    }

    // A stock folded or a bipod down is the same weapon in another state, and
    // a data file may write it as a mode of its own. Whether that is a mode or
    // a state is the book's call, so the modes are kept and the pair reported.
    const states = scopes.map((s) => (s.name ?? "").trim()).filter((n) => STATE_MODE.test(n));
    if (states.length) {
      note(`${name}: modes ${states.map((n) => `"${n}"`).join(", ")} may be states of one weapon rather than modes; kept as modes`);
    }

    if (!usable) continue;

    // The Basic Set's blackjack and sap are on the unarmed table under note 3,
    // "Brawling ... increases all unarmed damage" (Characters p. 271), but GCA
    // gives them a plain thr with no bonus in the formula.
    if (!isSupplement(source) && UNARMED_TABLE_WEAPONS.has(name)) {
      for (const mode of meleeModes) mode.unarmedBonus = true;
    }

    taken.add(name);
    const armed = meleeModes.length > 0 || rangedModes.length > 0;
    gear.push({
      _id: ids.get(name) ?? newId(armed ? "weapon" : "gear", name, source),
      name,
      type: "equipment",
      system: {
        ...common,
        // Clothing is priced off the wearer's Status rather than sold at a
        // figure (Characters p. 266).
        costOfLivingPercent: costOfLivingPercent(r.text),
        // A record whose weight is a placeholder states it for display
        // instead, and that figure is the book's.
        weight: common.weight || displayWeight(r.text),
        category: categoryOf(name, armed),
        // Only rounds say what they fit; the field's default covers the rest.
        ...(ammunitionFitOf(name) ? { ammunition: { kind: "", fits: ammunitionFitOf(name) } } : {}),
        equipmentQuality: "basic",
        forSkills: [],
        // The table's price buys good quality (Characters p. 274), and the
        // class GCA prices the weapon in is the book's own.
        quality: "good",
        material: "",
        weaponClass: weaponClassOf(f.get("mods")),
        listCost: common.cost,
        hpLost: 0,
        meleeModes,
        rangedModes,
      },
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

/** Command-line options, with the Basic Set as the default. */
function option(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

/** A book's name as a file stem: "My Book" becomes "my-book". */
function slug(book) {
  return book.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * The files a run writes, by pack.
 *
 * The Basic Set keeps the names it has always had, since the packs are
 * checked in under them. Another book's files carry its name, so a module
 * holding two books can keep both in one packs-src.
 */
function fileNames(basic, book) {
  const stem = basic ? "basic-set" : slug(book);
  const gear = (name) => (basic ? `${name}.json` : `${stem}-${name}.json`);
  return {
    advantages: `${stem}-advantages.json`,
    disadvantages: `${stem}-disadvantages.json`,
    skills: `${stem}-skills.json`,
    techniques: `${stem}-techniques.json`,
    armor: gear("armor"),
    gear: gear("gear"),
    shields: gear("shields"),
    spells: `${stem}-spells.json`,
  };
}

function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error(
      "Usage: node tools/parse-gdf.mjs <file.gdf> [--write] [--out <dir>] [--prefix B] [--book <name>] [--overlap <file>] [--power-category <pattern>]",
    );
    process.exit(1);
  }
  const write = process.argv.includes("--write");
  const outDir = resolve(option("--out", join(projectRoot, "packs-src")));
  const prefix = bookPrefix(option("--prefix", BASIC_SET.prefix));
  const book = option("--book", BASIC_SET.book);
  const overlapFile = option("--overlap", null);
  const powerCategory = option("--power-category", null);
  const basic = prefix === BASIC_SET.prefix;

  // What was left to the Basic Set pack: section, name and the citation
  // that put it there, so the list can be checked against the book.
  const overlaps = [];
  const source = {
    prefix,
    book,
    outDir,
    overlap: (section, name, page) => overlaps.push({ section, name, page }),
    // A supplement's new ids stay clear of the Basic Set's.
    basicIds: basic ? null : basicSetIds(),
  };

  const text = readFileSync(file, "utf8");
  const recs = records(text);
  // A Talent's skills are listed apart from the Talent, in the file's groups.
  source.groups = groupsOf(text);
  // The file's own lines, for what the record reader leaves out.
  source.lines = text.split(/\r?\n/);
  // Which category names a power, which each book's file does its own way.
  source.powerCategory = powerCategory ? new RegExp(powerCategory) : null;
  try {
    assertCitesBook(recs, prefix);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const notes = [];
  const traitRejects = [];
  const traits = parseTraits(
    recs,
    (what, why) => traitRejects.push({ what, why }),
    (n) => notes.push(n),
    source,
  );

  const skillRejects = [];
  const { skills, techniques } = parseSkills(
    recs,
    (what, why) => skillRejects.push({ what, why }),
    (n) => notes.push(n),
    source,
  );

  const gearRejects = [];
  const { armor, gear, shields } = parseEquipment(
    recs,
    (what, why) => gearRejects.push({ what, why }),
    (n) => notes.push(n),
    source,
  );

  // The spells, through the tool a module would use for another book's.
  const spellRejects = [];
  const spells = parseSpells(recs, {
    reject: (what, why) => spellRejects.push({ what, why }),
    ids: existingSpellIds(join(outDir, "spells")),
    prefix,
    book,
    overlap: source.overlap,
  });

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
  report("spells", spells.length, spellRejects);
  if (notes.length) {
    console.log(`\nrecorded but not modelled: ${notes.length}`);
    for (const n of notes.slice(0, 6)) console.log(`    ${n}`);
  }
  if (overlaps.length) {
    console.log(`\nleft to the Basic Set pack: ${overlaps.length}`);
    for (const o of overlaps.slice(0, 6)) console.log(`    ${o.name} (${o.page})`);
  }

  if (write) {
    // Two packs rather than one. A list of 641 traits with advantages and
    // disadvantages interleaved is not a list anyone can choose from: you go
    // looking for something to spend points on and half of what you scroll
    // past charges you nothing.
    const negative = traits.filter((t) => !positive.includes(t));
    const names = fileNames(basic, book);

    // A supplement with no armour, say, gets no armour file: an empty pack
    // file would be a pack with nothing in it, which validates but says
    // nothing. The Basic Set writes every file, as it always has.
    const files = [
      ["advantages", names.advantages, positive],
      ["disadvantages", names.disadvantages, negative],
      ["skills", names.skills, skills],
      ["skills", names.techniques, techniques],
      ["equipment", names.armor, armor],
      ["equipment", names.gear, gear],
      ["equipment", names.shields, shields],
      ["spells", names.spells, spells],
    ].filter(([, , docs]) => basic || docs.length > 0);
    for (const [pack, name, docs] of files) {
      mkdirSync(join(outDir, pack), { recursive: true });
      writeFileSync(join(outDir, pack, name), `${JSON.stringify(docs, null, 2)}\n`, "utf8");
    }

    const rejected = [
      ["advantages", traitRejects.map((r) => `${r.why}\t${r.what}`)],
      ["skills", skillRejects.map((r) => `${r.why}\t${r.what}`)],
      ["equipment", [
        ...gearRejects.map((r) => `${r.why}\t${r.what}`),
        ...notes.map((n) => `not modelled\t${n}`),
      ]],
      ["spells", spellRejects.map((r) => `${r.why}\t${r.what}`)],
    ];
    for (const [pack, lines] of rejected) {
      if (!existsSync(join(outDir, pack))) continue;
      writeFileSync(join(outDir, pack, ".rejected-gdf.txt"), lines.join("\n"), "utf8");
    }

    if (overlapFile) {
      writeFileSync(
        resolve(overlapFile),
        overlaps.map((o) => `${o.section}\t${o.name}\t${o.page}`).join("\n") + (overlaps.length ? "\n" : ""),
        "utf8",
      );
    }
    console.log(`\nwrote ${files.map(([pack, name]) => join(pack, name)).join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

/** The Environment Suit skill a suit on the armour tables calls for (Characters pp. 192, 285), or blank. */
function environmentSuitFor(name) {
  if (/^NBC Suit$/i.test(name)) return "NBC Suit";
  if (/^(Space Suit|Vacc Suit \(TL ?\d+\)|Space Armor \(TL ?\d+\))$/i.test(name)) return "Vacc Suit";
  if (/^Battlesuit \(TL ?\d+\)$/i.test(name)) return "Battlesuit";
  return "";
}
