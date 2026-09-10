/**
 * Parses skill entries out of the Basic Set skills chapter into compendium JSON.
 *
 * This is deliberately high-precision rather than high-recall. The source PDF
 * is multi-column, and even reflowed with `pdftotext -simple` some lines are
 * prose that happens to contain an attribute/difficulty pair, or two skills
 * run together. Every rejected line is reported so the trade is visible: a
 * skill that silently fails to parse is a gap, but a prose fragment accepted
 * as a skill is a wrong entry in play, which is worse.
 *
 * Usage: node tools/parse-skills.mjs <extracted-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DIFFICULTY = { Easy: "E", Average: "A", Hard: "H", "Very Hard": "VH" };
const ATTRIBUTES = new Set(["ST", "DX", "IQ", "HT", "Will", "Per"]);

/** One skill entry: `Name Attr/Difficulty Default(s): ...` */
const ENTRY =
  /(?<name>[A-Z][A-Za-z0-9'/() -]{1,38}?)\s*(?<attr>ST|DX|IQ|HT|Will|Per)\/(?<diff>Easy|Average|Hard|Very Hard)\s*(?<defs>Defaults?:\s*[^.]*\.)/;

/** Words that mark a line as running prose rather than a skill heading. */
const PROSE = /\b(of|the|and|a|an|to|for|with|by|that|this|any|all|apply|kind|penalty|equal|these|use|see)\b/i;

function slugId(name) {
  return createHash("sha1").update(`skill:${name}`).digest("hex").slice(0, 16);
}

/** Sentence-starting verbs that precede a skill name in running text. */
const LEADING_PROSE = new Set([
  "Add", "See", "Use", "Roll", "Make", "Apply", "This", "The", "For", "Note",
  "Treat", "Each", "Both", "Your", "You", "If", "When", "It",
]);

/**
 * Trims what the column reflow drags in front of a skill name: the running page
 * header ("SKILLS 177 Armoury/TL") and a sentence-starting verb from the
 * preceding paragraph ("Add Biology/TL").
 */
function cleanName(raw) {
  let name = raw.trim().replace(/[-,]$/, "").trim();

  // Running header in either order, e.g. "SKILLS 177 " or "180 SKILLS ".
  name = name
    .replace(/^[A-Z]{3,}\s+\d{1,3}\s+/, "")
    .replace(/^\d{1,3}\s+[A-Z]{3,}\s+/, "")
    .replace(/^[A-Z]{3,}\s+(?=[A-Z][a-z])/, "")
    .trim();

  const words = name.split(" ").filter(Boolean);

  // Skill names are title case, so anything before the last run of capitalised
  // words is dragged-in prose ("skill requires Animal Handling").
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    if (/^[a-z]/.test(words[i])) start = i + 1;
  }
  words.splice(0, start);

  // Any surviving running-header token: an all-caps word or a bare page number.
  while (words.length > 1 && (/^[A-Z]{3,}$/.test(words[0]) || /^\d{1,3}$/.test(words[0]))) {
    words.shift();
  }

  // A capitalised sentence-starter can still lead, e.g. "Add Biology/TL".
  while (words.length > 1 && LEADING_PROSE.has(words[0])) words.shift();

  return words
    .join(" ")
    .replace(/^(?:[A-Z]{3,}|\d{1,3})\s+/g, "")
    .replace(/^(?:[A-Z]{3,}|\d{1,3})\s+/g, "")
    .trim();
}

/** Parses "IQ-6, Finance-4, or Merchant-5" into structured defaults. */
function parseDefaults(text) {
  const body = text.replace(/^Defaults?:\s*/, "").replace(/\.$/, "").trim();
  if (/^none$/i.test(body)) return { defaults: [], explicitNone: true };

  const defaults = [];
  for (const raw of body.split(/,|\bor\b/)) {
    const token = raw.trim();
    if (!token) continue;

    // `Mathematics (Statistics)-5` or `IQ-6`
    const m = /^(?<src>[A-Z][A-Za-z0-9'/() -]*?)\s*-\s*(?<mod>\d+)$/.exec(token);
    if (!m) return null; // Anything unparseable rejects the whole entry.

    const src = m.groups.src.trim();
    const modifier = -Number(m.groups.mod);
    if (ATTRIBUTES.has(src)) {
      defaults.push({ from: "attribute", attribute: src, skill: "", modifier });
    } else {
      defaults.push({ from: "skill", attribute: "DX", skill: src, modifier });
    }
  }
  return defaults.length ? { defaults, explicitNone: false } : null;
}

function main() {
  const [, , source, write] = process.argv;
  if (!source) {
    console.error("Usage: node tools/parse-skills.mjs <extracted-text> [--write]");
    process.exit(1);
  }

  // The chapter is read as one normalized stream rather than line by line: a
  // skill's "Default:" clause frequently wraps onto the following line, and
  // matching per-line drops most of the chapter.
  const stream = readFileSync(source, "utf8").replace(/\s+/g, " ");

  const lines = [];
  const SCAN = /(?:ST|DX|IQ|HT|Will|Per)\/(?:Easy|Average|Hard|Very Hard)/g;
  for (let m = SCAN.exec(stream); m; m = SCAN.exec(stream)) {
    // 60 characters before the pair is enough for a skill name; 220 after is
    // enough for the longest Defaults clause in the chapter.
    lines.push(stream.slice(Math.max(0, m.index - 60), m.index + 220));
  }

  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const line of lines) {
    const m = ENTRY.exec(line);
    if (!m) continue;

    const name = cleanName(m.groups.name);
    const reject = (why) => rejected.push({ line, why });

    if (name.length < 3) { reject("name too short"); continue; }
    if (PROSE.test(name)) { reject("name reads as prose"); continue; }
    if (name.split(" ").length > 4) { reject("name too many words"); continue; }
    // Two skills run together, e.g. "ActingAlchemy/TL".
    if (/[a-z][A-Z]/.test(name)) { reject("looks like two entries merged"); continue; }
    if (seen.has(name)) { reject("duplicate"); continue; }

    const parsed = parseDefaults(m.groups.defs);
    if (!parsed) { reject("defaults unparseable"); continue; }

    seen.add(name);
    accepted.push({
      _id: slugId(name),
      name,
      type: "skill",
      system: {
        attribute: m.groups.attr,
        difficulty: DIFFICULTY[m.groups.diff],
        points: 0,
        bonus: 0,
        defaults: parsed.defaults,
        techLevel: "",
        description: "",
        reference: "Basic Set: Characters",
      },
    });
  }

  console.log(`accepted: ${accepted.length}`);
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((acc, r) => ((acc[r.why] = (acc[r.why] ?? 0) + 1), acc), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${why}`);
  }

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "skills", "basic-set-skills.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${accepted.length} skills to packs-src/skills/basic-set-skills.json`);

    const log = join(projectRoot, "packs-src", "skills", ".rejected.txt");
    writeFileSync(log, rejected.map((r) => `${r.why}\t${r.line}`).join("\n"), "utf8");
    console.log(`rejected lines logged to packs-src/skills/.rejected.txt`);
  }
}

main();
