/**
 * Parses the Basic Set's armour tables into compendium JSON.
 *
 * Same `pdftotext -table` extraction as the two weapon parsers, and the same
 * per-shape column matching, because these tables are laid out the same way:
 *
 *     TL  Armor  Location  DR  Cost  Weight  LC  Notes
 *
 * Armour written "4/2" carries both numbers. Which damage the lower one applies
 * to depends on the table: the low-tech and barding footnote says "use the lower
 * DR against crushing attacks", while the high- and ultra-tech one says to use
 * the higher against piercing and cutting and the lower against everything else.
 * The two agree wherever they overlap and differ only on the types the low-tech
 * note does not name, so the applicable types are recorded with each piece
 * rather than inferred later from a flag.
 *
 * Usage: node tools/parse-armor.mjs <table-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DASH = "[-–—]";

/**
 * A row. DR carries suffixes the data model has no home for: "*" marks flexible
 * armour and "F" fine workmanship, both of which are captured and reported
 * rather than silently dropped.
 */
const ROW = new RegExp(
  String.raw`^\s*(?<tl>\^|\+|${DASH}|\d{1,2})\s+(?<name>\S.*?)\s{2,}` +
    String.raw`(?<location>[a-z][a-z, ]*?)\s{2,}` +
    String.raw`(?<dr>\d+(?:\/\d+)?)(?<flags>[*F]*)\s+` +
    String.raw`(?<cost>\+?\$[\d,]+|${DASH})\s+` +
    String.raw`(?<weight>[\d.,]+|neg\.|${DASH})\s+` +
    String.raw`(?<lc>\d|${DASH})\s*` +
    String.raw`(?<notes>.*)$`,
);

/** The barding table repeats names the human tables use, for a different wearer. */
const BARDING_TABLE = /^Horse Armor \(Barding\) Table$/;

/** Where the high- and ultra-tech table begins, which changes what a split means. */
const HIGH_TECH_TABLE = /^High- and Ultra-Tech Armor Table$/;

/**
 * The damage the lower DR applies to. This must match SPLIT_AGAINST in
 * `src/rules/armor.ts`, which is what resolves DR at play time; a comment saying
 * so would not have stopped the two drifting, so a test compares them.
 */
export const SPLIT_AGAINST = {
  lowTech: ["cr"],
  highTech: ["cr", "imp", "burn", "tox", "cor", "fat"],
};

/**
 * The book's location words, in the vocabulary the hit-location rules use.
 * The book writes them plural and the rules singular, and "full suit" is the
 * whole body, which the data model spells as an empty list.
 */
const LOCATIONS = new Map([
  // The vitals sit behind the torso, so anything covering the torso covers them:
  // the data model says so in as many words, and the starter suits already did.
  // Without this an extracted breastplate gives no DR against a deliberate
  // vitals hit, which is the shot most worth aiming at.
  ["torso", ["torso", "vitals"]],
  ["skull", ["skull"]],
  ["face", ["face"]],
  ["neck", ["neck"]],
  ["groin", ["groin"]],
  ["eyes", ["eye"]],
  ["arms", ["arm"]],
  ["legs", ["leg"]],
  ["hands", ["hand"]],
  ["feet", ["foot"]],
  ["limbs", ["arm", "leg"]],
  ["body", ["torso", "vitals", "groin"]],
  ["head", ["skull", "face"]],
  ["full suit", []],
]);

const id = (name) => createHash("sha1").update(`armor:${name}`).digest("hex").slice(0, 16);

function money(value) {
  const m = /\$([\d,]+)/.exec(value ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

/**
 * A weight. At least one digit is required: "[\d.]+" alone also matches the lone
 * dot in "neg.", and Number(".") is NaN, which serialises to null against a
 * field that forbids it. "neg." is the book's negligible weight, which is not
 * zero but is close enough that carrying it as zero misleads nobody.
 */
function weight(value) {
  const m = /(\d+(?:\.\d+)?|\.\d+)/.exec((value ?? "").replace(/,/g, ""));
  return m ? Number(m[1]) : 0;
}

function main() {
  const [, , source, write] = process.argv;
  if (!source) {
    console.error("Usage: node tools/parse-armor.mjs <table-text> [--write]");
    process.exit(1);
  }

  const lines = readFileSync(source, "utf8").split(/\r?\n/);

  const items = [];
  const seen = new Set();
  const rejected = [];
  const reject = (context, why) => rejected.push({ context, why });
  const flagged = [];
  let barding = false;
  let highTech = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const text = line.trim();
    if (!text) continue;
    if (HIGH_TECH_TABLE.test(text)) { highTech = true; continue; }
    if (BARDING_TABLE.test(text)) { barding = true; highTech = false; continue; }
    if (/^TL\s+Armor/.test(text)) continue;
    if (/^(\d+\s+)?EQUIPMENT(\s+\d+)?$/.test(text)) continue;

    const row = ROW.exec(line);
    if (!row) {
      if (/\$[\d,]+\s+[\d.]+\s+\d/.test(line)) reject(text, "row not parsed");
      continue;
    }

    const g = row.groups;

    const [drHigh, drLow] = g.dr.split("/").map(Number);

    const parts = g.location.split(",").map((p) => p.trim()).filter(Boolean);
    const unknown = parts.filter((p) => !LOCATIONS.has(p));
    if (unknown.length) { reject(text, `unknown location "${unknown.join(", ")}"`); continue; }

    const locations = [...new Set(parts.flatMap((p) => LOCATIONS.get(p)))];

    // A cost written as an increment belongs to the suit the piece is worn with,
    // not to the piece, exactly as a shield spike's does.
    if (g.cost.startsWith("+")) { reject(text, "cost is an increment on another item"); continue; }

    // The barding table names its pieces "Plate" and "Scale" too, for a horse,
    // and names them once per body part, so a barding piece needs both the
    // wearer and the part to be identifiable at all.
    const bare = g.name.replace(/\s+/g, " ").trim();
    const name = barding ? `Barding: ${bare} (${parts.join(", ")})` : bare;
    if (seen.has(name)) { reject(text, `duplicate armour "${name}"`); continue; }
    seen.add(name);

    // Recorded so the loss is visible rather than silent: "*" is flexible
    // armour and "F" is fine workmanship, and the model holds neither.
    if (g.flags) flagged.push(`${name} (${g.flags})`);

    items.push({
      _id: id(name),
      name,
      type: "armor",
      system: {
        quantity: 1,
        weight: weight(g.weight),
        cost: money(g.cost),
        carried: true,
        equipped: false,
        tl: g.tl && !new RegExp(`^${DASH}$`).test(g.tl) ? g.tl : "",
        dr: drHigh,
        drSplit: drLow ?? null,
        drSplitAppliesTo:
          drLow === undefined ? [] : highTech ? SPLIT_AGAINST.highTech : SPLIT_AGAINST.lowTech,
        locations,
        description: "",
        reference: "Basic Set: Characters",
      },
    });
  }

  console.log(`armour: ${items.length}`);
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((a, r) => ((a[r.why] = (a[r.why] ?? 0) + 1), a), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`);
  }
  if (flagged.length) {
    console.log(`\nflexible or fine, which the model does not record: ${flagged.join(", ")}`);
  }

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "equipment", "armor.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${items.length} armour pieces`);
    writeFileSync(
      join(projectRoot, "packs-src", "equipment", ".rejected-armor.txt"),
      rejected.map((r) => `${r.why}\t${r.context}`).join("\n"),
      "utf8",
    );
  }
}

// Only run when invoked directly. The split-DR mapping above is imported by a
// test that checks it against the rules engine, and a module that runs its main
// on import cannot be imported at all.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
