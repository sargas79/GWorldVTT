/**
 * Builds the enhancements-and-limitations compendium from a GCA 5 data file.
 *
 * The Basic Set prices its general modifiers on pp. 101-117 of Characters,
 * and GCA carries them in its [MODIFIERS] section as
 *
 *     Name, +20%, group(_General), page(B106)
 *     Area Effect, +50%/+100%, group(_General), page(B102), upto(25)
 *
 * -- a flat percentage, or a percentage at each level with the level names
 * beside it. This reads the records that cite those pages, prices them as
 * the model does a trait (flat, or from a table), and keeps the group the
 * book files them under. `description(...)` is dropped by the reader, as
 * everywhere: names and numbers only.
 *
 * Usage: node tools/parse-gdf-modifiers.mjs <file.gdf> [--write] [--out <dir>]
 *        [--pack <name>] [--file <name.json>] [--prefix B] [--book <name>]
 *        [--from <page>] [--to <page>]
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fields, nameOf, records, splitTop } from "./gdf.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const id = (name) => createHash("sha1").update(`modifier:${name}`).digest("hex").slice(0, 16);

function existingIds(dir) {
  const byName = new Map();
  if (!existsSync(dir)) return byName;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8"))) byName.set(doc.name, doc._id);
  }
  return byName;
}

/** The first page cited in the book being read, or null. */
function firstPage(page, prefix) {
  const m = new RegExp(`\\b${prefix}(\\d+)\\b`).exec(page ?? "");
  return m ? Number(m[1]) : null;
}

function reference(page, prefix, book) {
  const re = new RegExp(`\\b${prefix}(\\d+)\\b`, "g");
  const pages = [...(page ?? "").matchAll(re)].map((m) => m[1]);
  return pages.length ? `${book} p. ${pages.join(", ")}` : book;
}

/**
 * The cost field as a percentage, or a table of them: "+20%" is flat, and
 * "+50%/+100%" is the percentage at each level. A trailing "/+" means the
 * table goes on at the same step, which the sheet's own levels handle. Null
 * for anything that is not a percentage -- multipliers and point costs are
 * other kinds of modifier and not this compendium's.
 */
export function parseCost(raw) {
  const text = (raw ?? "").trim();
  if (!text || !text.includes("%")) return null;
  const steps = text.split("/").map((s) => s.trim()).filter((s) => s !== "+" && s !== "");
  const values = [];
  for (const step of steps) {
    const m = /^([+-]?\d+)%$/.exec(step);
    if (!m) return null;
    values.push(Number(m[1]));
  }
  if (values.length === 0) return null;
  if (values.length === 1) return { value: values[0], costTable: [] };
  // A table that is a clean multiple of its first step is priced evenly.
  if (values.every((v, i) => v === values[0] * (i + 1))) return { value: values[0], costTable: [] };
  return { value: 0, costTable: values };
}

/** The book's name for each level, from `levelnames(...)`. */
function parseLevelNames(value) {
  if (value === undefined) return [];
  return splitTop(value).map((p) => p.trim().replace(/^"|"$/g, "").trim()).filter(Boolean);
}

/** The level cap from `upto()`, where it states a plain number. */
function parseUpTo(value) {
  const m = /^(\d+)/.exec((value ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/** The group, with GCA's leading underscore for its own groupings dropped. */
function groupName(raw) {
  return (raw ?? "").trim().replace(/^_/, "");
}

export function parseModifiers(recs, options) {
  const { reject, ids, prefix, book, from, to } = options;
  const out = [];
  const taken = new Map();

  for (const r of recs) {
    if (r.section !== "MODIFIERS") continue;
    const f = fields(r.text);
    const page = firstPage(f.get("page"), prefix);
    if (page === null || page < from || page > to) continue;

    const bare = nameOf(r);
    if (bare.startsWith("_") || /[%[\]]/.test(bare)) { reject(bare, "a GCA placeholder"); continue; }

    const cost = parseCost(splitTop(r.text)[1]);
    if (!cost) { reject(bare, `not a percentage: "${splitTop(r.text)[1] ?? ""}"`); continue; }

    const group = groupName(f.get("group"));
    // The same name may be an enhancement in one group and a limitation in
    // another -- Contact Agent is +150% on an Affliction and -30% elsewhere
    // -- so a second use of a name says which group it is from.
    let name = bare;
    if (taken.has(name)) {
      const other = taken.get(name);
      if (other.value === cost.value && JSON.stringify(other.costTable) === JSON.stringify(cost.costTable)) continue;
      name = `${bare} (${group})`;
      if (taken.has(name)) continue;
    }
    taken.set(name, cost);

    const first = cost.costTable.length > 0 ? cost.costTable[0] : cost.value;
    const kind = first > 0 ? "enhancement" : first < 0 ? "limitation" : "special";
    const levelNames = parseLevelNames(f.get("levelnames"));
    const cap = parseUpTo(f.get("upto"));
    const maxLevels = cost.costTable.length > 0 ? cost.costTable.length : cap || (levelNames.length || (cost.value ? 0 : 0));

    out.push({
      _id: ids.get(name) ?? id(name),
      name,
      type: "modifier",
      system: {
        kind,
        value: cost.value,
        costTable: cost.costTable,
        levelNames: maxLevels > 0 ? levelNames.slice(0, Math.max(maxLevels, levelNames.length)) : levelNames,
        maxLevels,
        group,
        description: "",
        reference: reference(f.get("page"), prefix, book),
      },
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function option(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

function main() {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    console.error("Usage: node tools/parse-gdf-modifiers.mjs <file.gdf> [--write] [--out <dir>] [--pack <name>] [--file <name.json>] [--prefix B] [--book <name>] [--from 101] [--to 117]");
    process.exit(1);
  }
  const outDir = resolve(option("--out", join(projectRoot, "packs-src")));
  const pack = option("--pack", "modifiers");
  const file = option("--file", "basic-set-modifiers.json");
  const prefix = option("--prefix", "B");
  const book = option("--book", "Basic Set: Characters");
  const from = Number(option("--from", "101"));
  const to = Number(option("--to", "117"));

  const recs = records(readFileSync(source, "utf8"));
  const rejects = [];
  const modifiers = parseModifiers(recs, {
    reject: (what, why) => rejects.push({ what, why }),
    ids: existingIds(join(outDir, pack)),
    prefix, book, from, to,
  });

  const kinds = new Map();
  for (const m of modifiers) kinds.set(m.system.kind, (kinds.get(m.system.kind) ?? 0) + 1);
  console.log(`modifiers: ${modifiers.length}${rejects.length ? `, rejected ${rejects.length}` : ""}`);
  console.log(`  kinds: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  for (const r of rejects.slice(0, 12)) console.log(`    ${r.why}: ${r.what}`);

  if (process.argv.includes("--write")) {
    mkdirSync(join(outDir, pack), { recursive: true });
    writeFileSync(join(outDir, pack, file), `${JSON.stringify(modifiers, null, 2)}\n`, "utf8");
    writeFileSync(join(outDir, pack, ".rejected-gdf.txt"), rejects.map((r) => `${r.why}\t${r.what}`).join("\n"), "utf8");
    console.log(`\nwrote ${join(pack, file)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
