/**
 * Builds a spells compendium from a GCA 5 data file.
 *
 * The [SPELLS] section states each spell as a record: its colleges, class,
 * casting time, duration, energy cost, the Magery it needs, what must be known
 * before it, and for a Missile spell the damage, accuracy and ranges. All of
 * that is statistics. The `description(...)` field is dropped by `gdf.mjs`
 * before this ever sees it, as with every other pack.
 *
 * Kept apart from `parse-gdf.mjs` so that a module carrying another book's
 * spells -- GURPS Magic, Thaumatology -- can build its pack with the same
 * tool: point it at the GDF, name the page prefix that book uses, and say
 * where the JSON should go.
 *
 * Usage:
 *   node tools/parse-gdf-spells.mjs <file.gdf> [--write]
 *        [--out <packs-src dir>] [--pack spells] [--file basic-set-spells.json]
 *        [--prefix B] [--book "Basic Set: Characters"]
 *
 * With no options it reads the Basic Set's spells (page prefix "B") into this
 * repository's packs-src/spells/basic-set-spells.json.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fields, nameOf, records, splitTop } from "./gdf.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The classes the data model knows, from the abbreviations GCA writes. */
const CLASS_NAMES = new Map([
  ["regular", "regular"], ["reg.", "regular"], ["reg", "regular"],
  ["area", "area"],
  ["melee", "melee"],
  ["missile", "missile"],
  ["blocking", "blocking"],
  ["information", "information"], ["inform.", "information"], ["info", "information"],
  ["enchantment", "enchantment"],
  ["special", "special"], ["spec.", "special"], ["spec", "special"],
]);

/** Attribute spellings a prerequisite may use, as the grammar writes them. */
const ATTRIBUTES = new Map([
  ["ST", "ST"], ["DX", "DX"], ["IQ", "IQ"], ["HT", "HT"],
  ["Will", "Will"], ["Per", "Per"], ["Perception", "Per"],
]);

/** The damage types the model holds; anything else is "as described". */
const DAMAGE_TYPES = new Set([
  "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
]);

const id = (name) => createHash("sha1").update(`spell:${name}`).digest("hex").slice(0, 16);

/**
 * Ids already published in a pack directory, by name, so a regenerated spell
 * keeps the id every character sheet that dragged it in still refers to.
 */
export function existingIds(dir) {
  const byName = new Map();
  if (!existsSync(dir)) return byName;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      byName.set(doc.name, doc._id);
    }
  }
  return byName;
}

/**
 * The page citation for one book. GCA cites every book a spell appears in --
 * `page(M74, B247)` -- and each pack names the one it was built from.
 */
export function reference(page, prefix, book) {
  const re = new RegExp(`\\b${prefix}(\\d+)\\b`, "g");
  const pages = [...(page ?? "").matchAll(re)].map((m) => m[1]);
  return pages.length ? `${book} p. ${pages.join(", ")}` : book;
}

/** Whether a record cites a page in the book being read. */
function citesBook(f, prefix) {
  return new RegExp(`\\b${prefix}\\d`).test(f.get("page") ?? "");
}

/**
 * A spell's name as the book prints it. GCA leaves a blank for the player in
 * a couple -- "Planar Summons ([Plane])" -- and the blank is not part of the
 * name.
 */
export function spellName(raw) {
  return raw.replace(/\s*\(\[[^\]]*\]\)\s*$/, "").trim();
}

/**
 * Casting cost as GCA writes it: "3/1" is 3 to cast and 1 to maintain,
 * "1 to 3" a range, "2/H" half to maintain, "3/S" the same, "1 to Magery"
 * open-ended. A "#" is GCA's mark for "see notes" and is not part of the cost.
 */
export function parseEnergy(raw) {
  const text = (raw ?? "").replace(/#/g, "").replace(/\s+/g, " ").trim();
  const out = { cast: null, castMax: null, maintain: null, text };
  if (!text || /^(varies|none|special)$/i.test(text)) return out;

  const [castPart, maintainPart] = text.split("/").map((p) => p.trim());

  const range = /^(\d+) to (\d+)$/i.exec(castPart);
  const open = /^(\d+) to /i.exec(castPart);
  const fixed = /^(\d+)$/.exec(castPart);
  if (range) {
    out.cast = Number(range[1]);
    out.castMax = Number(range[2]);
  } else if (open) {
    out.cast = Number(open[1]);
  } else if (fixed) {
    out.cast = Number(fixed[1]);
    out.castMax = out.cast;
  } else {
    const leading = /^(\d+)\b/.exec(castPart);
    if (leading) out.cast = Number(leading[1]);
  }

  if (maintainPart !== undefined && out.cast !== null) {
    if (/^\d+$/.test(maintainPart)) out.maintain = Number(maintainPart);
    else if (/^S$/i.test(maintainPart) && out.castMax === out.cast) out.maintain = out.cast;
    else if (/^H$/i.test(maintainPart) && out.castMax === out.cast) out.maintain = Math.ceil(out.cast / 2);
  }
  return out;
}

/** Seconds in a written span: "1 sec.", "1 min.", "6 hrs.", "1 day". */
function seconds(amount, unit) {
  const n = Number(amount);
  if (/^s/i.test(unit)) return n;
  if (/^m/i.test(unit)) return n * 60;
  if (/^h/i.test(unit)) return n * 3600;
  if (/^d/i.test(unit)) return n * 86400;
  return null;
}

/**
 * Time to cast. The figure is the least the spell takes: "1 to 3 sec." is a
 * Missile spell built up over one to three seconds, and one second is what
 * the first roll waits for. "sec.=cost" and "Varies" have no figure.
 */
export function parseTime(raw) {
  const text = (raw ?? "").replace(/#/g, "").replace(/\s+/g, " ").trim();
  if (!text || text === "-") return { seconds: null, text: "" };
  const m = /^(\d+)(?: to \d+)? ?(sec|min|hr|hour|day)/i.exec(text);
  return { seconds: m ? seconds(m[1], m[2]) : null, text };
}

/** Duration, with the book's abbreviations spelled out. */
export function parseDuration(raw) {
  let text = (raw ?? "").replace(/#/g, "").replace(/\s+/g, " ").trim();
  if (/^perm\.?$/i.test(text)) text = "Permanent";
  const m = /^(\d+) ?(sec|min|hr|hour|day)/i.exec(text);
  return { seconds: m ? seconds(m[1], m[2]) : null, text };
}

/**
 * The class field: "Regular/R-HT" is a Regular spell resisted by HT, and
 * "Inform./Area" is both Information and Area, since "these classes are not
 * mutually exclusive" (p. 239).
 */
export function parseClass(raw) {
  const classes = [];
  let resistedBy = "";
  for (const part of (raw ?? "").split("/").map((p) => p.trim()).filter(Boolean)) {
    const resisted = /^R-(.+)$/i.exec(part);
    if (resisted) {
      resistedBy = resisted[1].trim();
      continue;
    }
    const known = CLASS_NAMES.get(part.toLowerCase());
    if (known && !classes.includes(known)) classes.push(known);
  }
  return { classes: classes.length ? classes : ["regular"], resistedBy };
}

/**
 * The skill a Missile spell is thrown with, from `skillused(...)`: the Innate
 * Attack specialty listed without a penalty. A Melee spell lists DX and the
 * unarmed skills instead, which the sheet already knows how to choose
 * between, so it gets no skill here.
 */
export function parseSkillUsed(raw) {
  for (const entry of splitTop((raw ?? "").replace(/\|/g, ","))) {
    const m = /^SK:(Innate Attack \([^)]*\))\s*$/.exec(entry.trim());
    if (m) return m[1];
  }
  return "";
}

/** Damage per point of energy, and its type. "spcl" is the spell's own business. */
export function parseDamage(damage, damtype) {
  const formula = (damage ?? "").replace(/^~/, "").trim();
  const words = (damtype ?? "").trim().toLowerCase().split(/\s+/);
  const type = words.find((w) => DAMAGE_TYPES.has(w)) ?? "";
  return { damage: formula, damageType: type, explosive: words.includes("ex") };
}

// ── prerequisites ────────────────────────────────────────────────────────────

/**
 * Splits a GCA `needs(...)` expression into a tree. Commas are "and", bars
 * are "or", and parentheses group; the two operators sit at the same level in
 * GCA's grammar, so "A, B | C" is read left to right as (A and B) or C, which
 * is how GCA itself reads it.
 */
function parseNeedsTree(text) {
  const items = [];
  const ops = [];
  let depth = 0;
  let start = 0;
  let quoted = false;
  const push = (end) => items.push(text.slice(start, end).trim());
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," || c === "|") && depth === 0) {
      push(i);
      ops.push(c);
      start = i + 1;
    }
  }
  push(text.length);

  const nodes = items.map((item) => {
    const inner = /^\((.*)\)$/s.exec(item);
    return inner ? parseNeedsTree(inner[1]) : { leaf: item };
  });
  if (nodes.length === 1) return nodes[0];

  // Left to right: each operator joins what came before with the next node.
  let tree = nodes[0];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] === "," ? "and" : "or";
    const next = nodes[i + 1];
    tree = tree.op === op ? { op, items: [...tree.items, next] } : { op, items: [tree, next] };
  }
  return tree;
}

/**
 * One GCA requirement as the rules engine's grammar writes it, or null for
 * one it does not carry.
 *
 * GCA spells Magery three ways -- "AD:Magery = 1", "ST:Magery = 1" and, for
 * the One College Only limitation, "ST:Magery Fire = 1" -- and all of them
 * mean Magery 1. Magery 0 is the ability to learn spells at all and is
 * dropped: every spell needs it, and the sheet says so on its own.
 */
function leafText(leaf, lookup) {
  const t = leaf.replace(/^"|"$/g, "").trim();
  if (!t) return null;
  if (/[%[\]]/.test(t)) return null;

  const magery = /^(?:AD|ST):Magery(?: [A-Za-z &-]+?)?\s*(?:=|>=)\s*(\d+)$/.exec(t) ?? /^AD:Magery (\d+)$/.exec(t);
  if (magery) return Number(magery[1]) > 0 ? `Magery ${magery[1]}` : null;
  if (/^(?:AD|ST):Magery 0/.test(t)) return null;

  const attribute = /^ST:(\w+)\s*(?:=|>=)\s*(\d+)$/.exec(t);
  if (attribute) {
    const name = ATTRIBUTES.get(attribute[1]);
    return name ? `${name} ${attribute[2]}` : null;
  }
  const colleges = /^(\d+) Colleges$/i.exec(t);
  if (colleges) return `spells from ${colleges[1]} colleges`;
  const anySpells = /^(\d+) Spells$/i.exec(t);
  if (anySpells) return `${anySpells[1]} spells`;
  const college = /^(\d+) (.+)$/.exec(t);
  if (college && lookup.isCollege(college[2])) return `${college[1]} ${college[2]} spells`;

  const tagged = /^(AD|SK|SP):(.+?)(?:\s*=\s*\d+(?:pts)?)?$/.exec(t);
  if (tagged) {
    const name = spellName(tagged[2].trim());
    if (tagged[1] === "AD") return `${name} (advantage)`;
    if (tagged[1] === "SK") return `${name} (skill)`;
    return name;
  }

  const name = spellName(t);
  if (lookup.isSpell(name)) return name;
  if (lookup.isSkill(name)) return `${name} (skill)`;
  if (lookup.isTrait(name)) return `${name} (advantage)`;
  return null;
}

/** Drops empty branches and flattens nested operators of one kind. */
function simplify(node) {
  if (!node) return null;
  if (node.leaf !== undefined) return node.text === null ? null : node;
  const items = node.items.map(simplify).filter(Boolean);
  const flat = items.flatMap((item) => (item.op === node.op ? item.items : [item]));
  if (flat.length === 0) return null;
  if (flat.length === 1) return flat[0];
  return { op: node.op, items: flat };
}

/** A tree as clauses of alternatives: the "and of ors" the grammar writes. */
function toClauses(node) {
  if (!node) return [];
  if (node.leaf !== undefined) return [[node.text]];
  if (node.op === "and") return node.items.flatMap(toClauses);
  // An "or" of trees: every combination of one clause from each side.
  return node.items
    .map(toClauses)
    .reduce((acc, clauses) => acc.flatMap((a) => clauses.map((b) => [...a, ...b])), [[]]);
}

/**
 * A `needs(...)` expression as the rules engine's prerequisite line.
 *
 * Alternatives that name something this cannot carry are dropped from their
 * clause rather than failing the spell: "Truthsayer or Borrow Language" on a
 * pack without Borrow Language is still met by Truthsayer.
 */
export function parseNeeds(raw, lookup) {
  if (!raw || !raw.trim()) return "";
  const tree = parseNeedsTree(raw.trim());
  const annotate = (node) => {
    if (node.leaf !== undefined) return { leaf: node.leaf, text: leafText(node.leaf, lookup) };
    return { op: node.op, items: node.items.map(annotate) };
  };
  const clauses = toClauses(simplify(annotate(tree)))
    .map((clause) => [...new Set(clause)])
    .filter((clause) => clause.length > 0);
  // The same clause twice says nothing more than once.
  const seen = new Set();
  return clauses
    .map((clause) => clause.join(" or "))
    .filter((clause) => (seen.has(clause) ? false : (seen.add(clause), true)))
    .join(", ");
}

// ── records ──────────────────────────────────────────────────────────────────

/**
 * Every spell in the records that cites the book being read.
 *
 * `lookup` says what else the file names, so a bare prerequisite can be told
 * apart: a spell, a skill or an advantage. Ritual variants -- the "(Ritual)"
 * techniques GCA generates for the p. 242 system -- are not spells and are
 * skipped: the same record serves both styles in this system.
 */
export function parseSpells(recs, options) {
  const { reject, ids, prefix, book } = options;
  const spellNames = new Set();
  const skillNames = new Set();
  const traitNames = new Set();
  for (const r of recs) {
    if (r.section === "SPELLS") spellNames.add(spellName(nameOf(r)));
    else if (r.section === "SKILLS") skillNames.add(nameOf(r));
    else if (["ADVANTAGES", "PERKS"].includes(r.section)) traitNames.add(nameOf(r));
  }
  const colleges = new Set();
  for (const r of recs) {
    if (r.section !== "SPELLS") continue;
    for (const c of splitTop(fields(r.text).get("cat") ?? "")) {
      const name = c.trim();
      if (name && !name.startsWith("~")) colleges.add(name.toLowerCase());
    }
  }
  const lookup = {
    isSpell: (n) => spellNames.has(n),
    isSkill: (n) => skillNames.has(n),
    isTrait: (n) => traitNames.has(n),
    isCollege: (n) => colleges.has(n.toLowerCase()),
  };

  const out = [];
  const taken = new Set();
  for (const r of recs) {
    if (r.section !== "SPELLS") continue;
    const f = fields(r.text);
    if (!citesBook(f, prefix)) continue;

    const bare = nameOf(r);
    const second = (splitTop(r.text)[1] ?? "").trim();
    const pair = /^type\(/.test(second) ? (f.get("type") ?? "") : second;
    const [attr, diff] = pair.split("/").map((p) => p.trim());
    // A "Tech/H" record is the ritual technique GCA makes of a spell; the
    // spell itself is the IQ record beside it.
    if (attr !== "IQ") continue;
    if (diff !== "H" && diff !== "VH") { reject(bare, `difficulty not H or VH: "${pair}"`); continue; }

    const name = spellName(bare);
    if (/[%[\]]/.test(name)) { reject(bare, "name is a GCA placeholder"); continue; }
    if (taken.has(name)) continue; // GCA lists each spell under more than one heading.
    taken.add(name);

    // GCA files a spell's Clerical and Ritual variants under "~" categories
    // rather than colleges. Those are the p. 242 alternative systems, which
    // this system reads off the standard record, so the variants are not
    // spells of their own.
    const collegesOf = splitTop(f.get("cat") ?? "")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith("~"));
    if (collegesOf.length === 0) { reject(name, "variant of a standard spell, not a spell"); continue; }

    const { classes, resistedBy } = parseClass(f.get("class"));
    const attack = parseDamage(f.get("damage"), f.get("damtype"));

    out.push({
      _id: ids.get(name) ?? id(name),
      name,
      type: "spell",
      system: {
        colleges: collegesOf,
        difficulty: diff,
        points: 0,
        bonus: 0,
        classes,
        resistedBy,
        castingTime: parseTime(f.get("time")),
        duration: parseDuration(f.get("duration")),
        energy: parseEnergy(f.get("castingcost")),
        // The Magery a spell takes is its own field, checked by the sheet
        // alongside the line below. GCA's figure includes what the spell's
        // prerequisites imply -- Fortify says Magery 2 because Enchant does
        // -- and the line keeps to what the book prints under the spell.
        mageryRequired: Number(f.get("magery") ?? 0) || 0,
        prerequisiteCount: Number(f.get("prereqcount") ?? 0) || 0,
        prerequisites: parseNeeds(f.get("needs"), lookup),
        attack: {
          skill: parseSkillUsed(f.get("skillused")),
          damage: attack.damage,
          damageType: attack.damageType,
          accuracy: Number(f.get("acc") ?? 0) || 0,
          halfDamageRange: Number(f.get("rangehalfdam") ?? 0) || 0,
          maxRange: Number(f.get("rangemax") ?? 0) || 0,
          explosive: attack.explosive,
        },
        description: "",
        reference: reference(f.get("page"), prefix, book),
      },
    });
  }
  return out;
}

/** Command-line options, with the Basic Set as the default. */
function option(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

function main() {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    console.error("Usage: node tools/parse-gdf-spells.mjs <file.gdf> [--write] [--out <dir>] [--pack <name>] [--file <name.json>] [--prefix B] [--book <name>]");
    process.exit(1);
  }
  const outDir = resolve(option("--out", join(projectRoot, "packs-src")));
  const pack = option("--pack", "spells");
  const file = option("--file", "basic-set-spells.json");
  const prefix = option("--prefix", "B");
  const book = option("--book", "Basic Set: Characters");

  const recs = records(readFileSync(source, "utf8"));
  const rejects = [];
  const spells = parseSpells(recs, {
    reject: (what, why) => rejects.push({ what, why }),
    ids: existingIds(join(outDir, pack)),
    prefix,
    book,
  });

  console.log(`spells: ${spells.length}${rejects.length ? `, rejected ${rejects.length}` : ""}`);
  for (const r of rejects.slice(0, 10)) console.log(`    ${r.why}: ${r.what}`);
  const byClass = new Map();
  for (const s of spells) for (const c of s.system.classes) byClass.set(c, (byClass.get(c) ?? 0) + 1);
  console.log(`  classes: ${[...byClass].map(([c, n]) => `${c} ${n}`).join(", ")}`);
  console.log(`  colleges: ${new Set(spells.flatMap((s) => s.system.colleges)).size}`);

  if (process.argv.includes("--write")) {
    mkdirSync(join(outDir, pack), { recursive: true });
    writeFileSync(join(outDir, pack, file), `${JSON.stringify(spells, null, 2)}\n`, "utf8");
    writeFileSync(
      join(outDir, pack, ".rejected-gdf.txt"),
      rejects.map((r) => `${r.why}\t${r.what}`).join("\n"),
      "utf8",
    );
    console.log(`\nwrote ${join(pack, file)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
