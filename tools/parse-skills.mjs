/**
 * Parses skill entries out of the Basic Set skills chapter into compendium JSON.
 *
 * This is deliberately high-precision rather than high-recall. The source PDF
 * is multi-column, and even reflowed with `pdftotext -simple` some text is
 * prose that happens to contain an attribute/difficulty pair, or two skills
 * run together. Every rejection is reported so the trade is visible: a skill
 * that silently fails to parse is a gap, but a prose fragment accepted as a
 * skill is a wrong entry in play, which is worse.
 *
 * Usage: node tools/parse-skills.mjs <extracted-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DIFFICULTY = { Easy: "E", Average: "A", Hard: "H", "Very Hard": "VH" };

/**
 * Attribute spellings that may appear in a default clause.
 *
 * The book writes the secondary characteristics out in full ("Perception-5"),
 * so matching only the short form files them as skill defaults that can never
 * resolve to an item.
 */
const ATTRIBUTE_ALIASES = new Map([
  ["ST", "ST"], ["DX", "DX"], ["IQ", "IQ"], ["HT", "HT"],
  ["Will", "Will"], ["Per", "Per"], ["Perception", "Per"],
]);

const PAIR = String.raw`(?:ST|DX|IQ|HT|Will|Per)\/(?:Easy|Average|Hard|Very Hard)`;

/** Words that mark a fragment as running prose rather than a skill heading. */
const PROSE = /\b(of|the|and|a|an|to|for|with|by|that|this|any|all|apply|kind|penalty|equal|these|use|see)\b/i;

/** Sentence-starting verbs that precede a skill name in running text. */
const LEADING_PROSE = new Set([
  "Add", "See", "Use", "Roll", "Make", "Apply", "This", "The", "For", "Note",
  "Treat", "Each", "Both", "Your", "You", "If", "When", "It",
]);

/**
 * Qualifiers the book uses in place of a concrete skill name. They are
 * instructions to the reader, not references that can resolve to an item.
 */
const UNRESOLVABLE_QUALIFIER = /\((?:same|any|other|same [^)]*)\)/i;

/**
 * Names where an adjacent heading or an unterminated cross-reference is glued
 * to the front of the real skill, e.g. "...may assess a penalty - see
 * Physiology" running into the "Disguise/TL" heading.
 *
 * No punctuation or case rule separates these, because both halves are title
 * case with only a space between them. This map is the result of reviewing
 * every multi-word name the parser produces; the rest of that list is genuine
 * multi-word skills (Invisibility Art, Parry Missile Weapons, Sumo Wrestling),
 * so it cannot be replaced by "take the last word".
 */
const NAME_CORRECTIONS = new Map([
  ["Killjoy Camouflage", "Camouflage"],
  ["Physiology Disguise/TL", "Disguise/TL"],
  ["Cultural Familiarity Free Fall", "Free Fall"],
  ["Hypnotism Immovable Stance", "Immovable Stance"],
  // The reflow scrambles three columns here, running two headings together
  // and interleaving both their pairs: "Leatherworking  LinguisticsDX/Easy
  // Default: DX-4.Defaults: None....IQ/Hard". The pair this window matches
  // is DX/Easy, which belongs to Leatherworking; Linguistics is IQ/Hard and
  // is carried in corrected-skills.json because no window here can yield it.
  ["Leatherworking Linguistics", "Leatherworking"],
  ["SKILLS 205 Lockpicking/TL", "Lockpicking/TL"],
]);

function slugId(name) {
  return createHash("sha1").update(`skill:${name}`).digest("hex").slice(0, 16);
}

/** Normalized key for matching a default's reference to a stored skill name. */
function nameKey(name) {
  return name
    .toLowerCase()
    .replace(/\/tl\d*/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Trims what the column reflow drags in front of a skill name: running page
 * headers ("SKILLS 205 Lockpicking/TL") and sentence-starting verbs from the
 * preceding paragraph ("Add Biology/TL").
 */
function cleanName(raw) {
  let name = raw.trim().replace(/[-,:;]$/, "").trim();
  const words = name.split(/\s+/).filter(Boolean);

  // Skill names are title case, so anything before the last run of capitalised
  // words is dragged-in prose ("skill requires Animal Handling").
  let start = 0;
  for (let i = 0; i < words.length; i++) if (/^[a-z]/.test(words[i])) start = i + 1;
  words.splice(0, start);

  // Running-header tokens: an all-caps word or a bare page number.
  while (words.length > 1 && (/^[A-Z]{3,}$/.test(words[0]) || /^\d{1,3}$/.test(words[0]))) {
    words.shift();
  }
  while (words.length > 1 && LEADING_PROSE.has(words[0])) words.shift();

  const assembled = words.join(" ").trim();
  return NAME_CORRECTIONS.get(assembled) ?? assembled;
}

/** Parses "IQ-6, Finance-4, or Merchant-5" into structured defaults. */
function parseDefaults(text) {
  const body = text.replace(/^Defaults?:\s*/, "").replace(/\.$/, "").trim();
  if (/^none$/i.test(body)) return { defaults: [], dropped: [] };

  const defaults = [];
  const dropped = [];

  for (const raw of body.split(/,|\bor\b/)) {
    const token = raw.trim();
    if (!token) continue;

    const m = /^(?<src>[A-Z][A-Za-z0-9'/() -]*?)\s*-\s*(?<mod>\d+)$/.exec(token);
    if (!m) return null; // Anything unparseable rejects the whole entry.

    const src = m.groups.src.trim();
    const modifier = -Number(m.groups.mod);

    const attribute = ATTRIBUTE_ALIASES.get(src);
    if (attribute) {
      defaults.push({ from: "attribute", attribute, skill: "", modifier });
      continue;
    }

    // "Engineer (same)" is an instruction, not a skill that exists as an item.
    if (UNRESOLVABLE_QUALIFIER.test(src)) {
      dropped.push(src);
      continue;
    }

    defaults.push({ from: "skill", attribute: "DX", skill: src, modifier });
  }

  return { defaults, dropped };
}

function main() {
  const [, , source, write] = process.argv;
  if (!source) {
    console.error("Usage: node tools/parse-skills.mjs <extracted-text> [--write]");
    process.exit(1);
  }

  // The chapter is read as one normalized stream rather than line by line: a
  // skill's "Default:" clause frequently wraps onto the following line.
  const stream = readFileSync(source, "utf8").replace(/\s+/g, " ");

  const accepted = [];
  const rejected = [];
  const seen = new Set();
  const reject = (context, why) => rejected.push({ context, why });

  const SCAN = new RegExp(`(${PAIR})`, "g");
  const NAME_TAIL = /(?<name>[A-Z][A-Za-z0-9'/() -]{1,38})\s*$/;
  const DEFAULTS_HEAD = /^\s*(?<defs>Defaults?:\s*[^.]*\.)/;

  for (let m = SCAN.exec(stream); m; m = SCAN.exec(stream)) {
    const before = stream.slice(Math.max(0, m.index - 60), m.index);
    const after = stream.slice(m.index + m[0].length, m.index + m[0].length + 220);

    // The window must belong to THIS pair. If another pair sits in the text
    // just before the name, the name half is bleeding in from a neighbouring
    // entry and produces hybrids like "Stage Combat DX/Average Strategy".
    if (new RegExp(PAIR).test(before)) { reject(before + m[0], "adjacent entry in window"); continue; }

    // The defaults clause must begin immediately after the pair, not somewhere
    // further along where it may belong to a different skill.
    const dm = DEFAULTS_HEAD.exec(after);
    if (!dm) continue;

    // A skill heading follows the end of the previous paragraph, so anything up
    // to the last sentence terminator belongs to that paragraph, not the name.
    // Without this, a sentence ending "...a real killjoy." leaves "Killjoy"
    // glued to the heading and yields "Killjoy Camouflage".
    const headingStart = Math.max(
      before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"),
    );
    const nameSource = headingStart >= 0 ? before.slice(headingStart + 1) : before;

    const nm = NAME_TAIL.exec(nameSource);
    if (!nm) { reject(before + m[0], "no name before pair"); continue; }

    const name = cleanName(nm.groups.name);
    const context = `${name} ${m[0]} ${dm.groups.defs}`;

    if (name.length < 3) { reject(context, "name too short"); continue; }
    if (PROSE.test(name)) { reject(context, "name reads as prose"); continue; }
    if (name.split(" ").length > 4) { reject(context, "name too many words"); continue; }
    if (/[a-z][A-Z]/.test(name)) { reject(context, "looks like two entries merged"); continue; }
    if (seen.has(name)) { reject(context, "duplicate"); continue; }

    const parsed = parseDefaults(dm.groups.defs);
    if (!parsed) { reject(context, "defaults unparseable"); continue; }

    const [, attr, diff] = /^(\w+)\/(.+)$/.exec(m[0]) ?? [];
    seen.add(name);
    accepted.push({
      _id: slugId(name),
      name,
      type: "skill",
      system: {
        attribute: attr,
        difficulty: DIFFICULTY[diff],
        points: 0,
        bonus: 0,
        defaults: parsed.defaults,
        techLevel: "",
        description: "",
        reference: "Basic Set: Characters",
      },
    });
  }

  // ── resolve cross-skill defaults ────────────────────────────────────────
  // The resolver matches item names exactly, so a default naming "Biology"
  // when the stored skill is "Biology/TL", or "Fast Talk" against "Fast-Talk",
  // is inert. Rewrite each reference to the stored name, and drop the ones
  // that match nothing rather than shipping a default that cannot fire.
  const byKey = new Map(accepted.map((s) => [nameKey(s.name), s.name]));
  let rewritten = 0;
  let unresolved = 0;

  for (const skill of accepted) {
    skill.system.defaults = skill.system.defaults.filter((d) => {
      if (d.from !== "skill") return true;
      const canonical = byKey.get(nameKey(d.skill));
      if (!canonical) { unresolved++; return false; }
      if (canonical !== d.skill) { d.skill = canonical; rewritten++; }
      return true;
    });
  }

  console.log(`accepted: ${accepted.length}`);
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((acc, r) => ((acc[r.why] = (acc[r.why] ?? 0) + 1), acc), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`);
  }
  console.log(`skill defaults rewritten to stored names: ${rewritten}`);
  console.log(`skill defaults dropped as unresolvable:   ${unresolved}`);

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "skills", "basic-set-skills.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${accepted.length} skills`);

    writeFileSync(
      join(projectRoot, "packs-src", "skills", ".rejected.txt"),
      rejected.map((r) => `${r.why}\t${r.context}`).join("\n"),
      "utf8",
    );
  }
}

main();
