/**
 * Parses the Basic Set's Muscle-Powered Ranged Weapon Table into compendium JSON.
 *
 * Built on the melee parser: same `pdftotext -table` extraction, same skill-group
 * structure, same per-shape column matching because the columns are re-laid-out
 * for every group. The columns themselves differ -- Acc, Range, RoF, Shots and
 * Bulk in place of Reach and Parry -- so this is its own file rather than a mode
 * bolted onto the other.
 *
 * Scope is the muscle-powered table only. Firearms follow it with a different
 * column order again, and the hand grenades between them have no Acc, Range or
 * ST at all; neither is read here.
 *
 * Usage: node tools/parse-ranged-weapons.mjs <table-text> <skills-chapter-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = "cr|cut|imp|pi\\+\\+|pi\\+|pi-|pi|burn|tox|cor|fat";
const DASH = "[-–—]";

/**
 * The glyph the book uses for "times the wielder's ST" in the Range column. The
 * symbol font renders it as a currency sign, so every plausible extraction of it
 * is accepted rather than relying on one.
 */
const MULTIPLIER = "[¥×x*]";

/** A weapon row, matched by column shape rather than by offset. */
const ROW = new RegExp(
  String.raw`^(?<tl>\^|${DASH}|\d{1,2})?\s+(?<name>\S.*?)\s+` +
    String.raw`(?<dmg>(?:sw|thr)(?:[+-]\d+)?|\d+d(?:[+-]\d+)?|spec\.|var\.|${DASH})(?:\((?<div>[\d.]+)\))?\s*` +
    String.raw`(?<type>${TYPES})?\s+` +
    String.raw`(?<acc>\d+(?:\+\d+)?|${DASH})\s+` +
    String.raw`(?<range>${MULTIPLIER}?[\d.,]+(?:\/${MULTIPLIER}?[\d.,]+)?|${DASH})\s+` +
    String.raw`(?<weight>[\d.]+(?:\/[\d.]+)?|${DASH})\s+` +
    String.raw`(?<rof>\d+(?:[x×]\d+)?|${DASH})\s+` +
    String.raw`(?<shots>\S+)\s+` +
    String.raw`(?<cost>\$[\d,]+|${DASH})\s+` +
    String.raw`(?<st>\d{1,2}[†*]?|${DASH})\s+` +
    String.raw`(?<bulk>${DASH}?\d+|${DASH})\s*` +
    String.raw`(?<notes>.*)$`,
);

/**
 * A skill-group heading, which here may carry two parenthesised parts:
 * "THROWN WEAPON (SPEAR) (DX-4, Spear Thrower-4)". The first is part of the
 * skill's name and the second is its defaults, so they cannot both be treated
 * the same way -- reading the specialty as defaults leaves the skill named
 * "Thrown Weapon (Spear) (Dx-4)".
 */
const GROUP = /^(?<skills>[A-Z][A-Z0-9/ ,'’()-]*(?:\s+(?:or|and)\s+[A-Z][A-Z0-9/ ,'’()-]*)*)$/;

/** A trailing parenthesis, split off so it can be judged on its contents. */
const TRAILING_PARENS = /^(?<head>.*?)\s*\((?<tail>[^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/;

/**
 * What marks a trailing parenthesis as a defaults clause rather than part of the
 * name: it prices a default ("DX-4", "Spear Thrower-4") or says there is none.
 */
const LOOKS_LIKE_DEFAULTS = /[A-Za-z)]\s*-\s*\d|no default/i;

/**
 * The skills chapter states a skill either as a heading with the pair on the
 * next line -- "Bow" then "DX/Average" -- or inline as "Kusari (DX/Hard):".
 * Both are read, the first line-anchored at both ends so it cannot drift the way
 * a scan over collapsed text does.
 */
const SKILL_HEADING = /^([A-Z][A-Za-z0-9'’/ ()-]{1,34}?)†?$/;
const PAIR_LINE = /^(ST|DX|IQ|HT|Will|Per)\/(Easy|Average|Hard|Very Hard)$/;
const SKILL_INLINE =
  /([A-Z][A-Za-z0-9'/ ()-]{2,34}?) \((ST|DX|IQ|HT|Will|Per)\/(Easy|Average|Hard|Very Hard)\):/g;

const DIFFICULTY = { Easy: "E", Average: "A", Hard: "H", "Very Hard": "VH" };

/**
 * Rows whose name column opens with this describe the weapon above used with
 * different ammunition -- a spear thrower "with Dart" or "with Javelin" -- and
 * become further modes of it rather than items of their own.
 */
const CONTINUATION = /^with\s+/i;

/**
 * The skills whose weapons carry their own ST, which replaces the wielder's for
 * range and damage (Basic Set: Characters p. 270). Prodds are listed under
 * Crossbow.
 */
const OWN_ST_SKILLS = new Set(["Bow", "Crossbow"]);

function skillsFromGroup(heading, hasDefaults) {
  const names = heading
    .replace(/\s+/g, " ")
    .split(/,|\bor\b/)
    .map((n) => n.trim())
    .filter(Boolean);

  const listed = hasDefaults ? names.slice(0, 1) : names;

  return listed
    .filter((n) => n && n !== "DX")
    .map((n) =>
      n
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        // The book writes the parenthesised specialty in capitals in a heading
        // ("THROWN WEAPON (SPEAR)") but in title case everywhere else.
        .replace(/\(\s*([a-z/]+)\s*\)/i, (_, s) => `(${s.replace(/\b[a-z]/g, (c) => c.toUpperCase())})`)
        .replace(/Axe\/mace/i, "Axe/Mace"),
    );
}

function parseSkillDefaults(clause) {
  const defaults = [];
  if (!clause) return defaults;

  for (const raw of clause.replace(/\s+/g, " ").split(/,|\bor\b/)) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^([A-Z][A-Za-z0-9'/ ()-]*?)\s*-\s*(\d+)$/.exec(token);
    if (!m) continue;

    const from = m[1].trim();
    const modifier = -Number(m[2]);
    if (["ST", "DX", "IQ", "HT", "Will", "Per"].includes(from)) {
      defaults.push({ from: "attribute", attribute: from, skill: "", modifier });
    } else {
      defaults.push({ from: "skill", attribute: "DX", skill: from, modifier });
    }
  }
  return defaults;
}

const skillId = (n) => createHash("sha1").update(`skill:${n}`).digest("hex").slice(0, 16);
const itemId = (n) => createHash("sha1").update(`ranged:${n}`).digest("hex").slice(0, 16);

function money(value) {
  const m = /\$([\d,]+)/.exec(value ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

function number(value) {
  const m = /(\d+(?:\.\d+)?|\.\d+)/.exec(value ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * The Range column is either one figure or a half-damage/maximum pair, and either
 * may be a multiple of the wielder's ST rather than a distance in yards.
 */
function parseRange(text) {
  const stMultiple = new RegExp(MULTIPLIER).test(text);
  const parts = text.split("/").map((p) => number(p.replace(new RegExp(MULTIPLIER, "g"), "")));
  const [first, second] = parts;
  return {
    halfDamageRange: second === undefined ? 0 : (first ?? 0),
    maxRange: second === undefined ? (first ?? 0) : second,
    rangeIsStMultiple: stMultiple,
  };
}

function main() {
  const [, , source, chapter, write] = process.argv;
  if (!source || !chapter) {
    console.error(
      "Usage: node tools/parse-ranged-weapons.mjs <table-text> <skills-chapter-text> [--write]",
    );
    process.exit(1);
  }

  const pairs = new Map();
  const chapterLines = readFileSync(chapter, "utf8").split(/\r?\n/);
  for (let i = 0; i + 1 < chapterLines.length; i++) {
    const head = SKILL_HEADING.exec(chapterLines[i].trim());
    const pair = PAIR_LINE.exec(chapterLines[i + 1].trim());
    if (head && pair) pairs.set(head[1].trim(), { attribute: pair[1], difficulty: DIFFICULTY[pair[2]] });
  }
  const prose = chapterLines.join(" ").replace(/\s+/g, " ");
  SKILL_INLINE.lastIndex = 0;
  for (let m = SKILL_INLINE.exec(prose); m; m = SKILL_INLINE.exec(prose)) {
    if (!pairs.has(m[1].trim())) {
      pairs.set(m[1].trim(), { attribute: m[2], difficulty: DIFFICULTY[m[3]] });
    }
  }

  // "Thrown Weapon (Spear)" is the Thrown Weapon skill with a specialty; the
  // chapter states the pair once, against the base name.
  const pairFor = (name) => pairs.get(name) ?? pairs.get(name.replace(/\s*\([^)]*\)\s*$/, ""));

  const alreadyPacked = new Set(
    ["basic-set-skills.json", "melee-weapon-skills.json", "weapon-table-skills.json"].flatMap((f) => {
      try {
        return JSON.parse(readFileSync(join(projectRoot, "packs-src", "skills", f), "utf8")).map(
          (x) => x.name,
        );
      } catch {
        return [];
      }
    }),
  );

  const lines = readFileSync(source, "utf8").split(/\r?\n/);

  const items = [];
  const byName = new Map();
  const skills = new Map();
  const rejected = [];
  const reject = (context, why) => rejected.push({ context, why });

  let groupSkills = [];
  let last = null;
  let pending = "";

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.replace(/\s+$/, "");
    let text = line.trim();
    if (!text && !pending) continue;

    // A heading whose defaults clause runs past the line wraps, as in the melee
    // table; without joining it the weapons below are filed under the group above.
    if (pending) {
      pending = `${pending} ${text}`;
      if (!pending.includes(")")) continue;
      text = pending.replace(/\s+/g, " ").trim();
      pending = "";
    } else if (/^[A-Z][A-Z0-9/ ,'’()-]{2,}\(/.test(text.replace(/\s+/g, " ")) && !text.includes(")")) {
      pending = text;
      continue;
    }

    if (!text) continue;
    if (/^TL\s+Weapon/.test(text)) continue;
    if (/^(\d+\s+)?EQUIPMENT(\s+\d+)?$/.test(text)) continue;
    if (/Ranged Weapon Table/.test(text)) continue;

    const row = ROW.exec(line);
    if (row) {
      const g = row.groups;
      const continues = CONTINUATION.test(g.name);
      if (continues && !last) { reject(text, "continuation with no weapon above it"); continue; }

      // A launcher has a dash for damage because it has none of its own: an
      // atlatl's damage belongs to the dart or javelin it throws, which the rows
      // below it give. It becomes an item with no modes so those rows have
      // something to attach to.
      //
      // Requiring those rows to actually follow is what separates it from a
      // "goat's foot", which also has a dash for damage but is a device for
      // cocking a crossbow and takes the rejection path instead.
      const followedByModes = lines
        .slice(index + 1)
        .find((l) => l.trim())
        ?.trim();
      const isLauncher =
        !continues &&
        new RegExp(`^${DASH}$`).test(g.dmg) &&
        Boolean(followedByModes && CONTINUATION.test(followedByModes));

      // "spec." damage is described in prose; there is nothing here to roll.
      if (!isLauncher && (!/^(?:sw|thr|\d+d)/.test(g.dmg) || !g.type)) {
        reject(text, "damage not expressible");
        continue;
      }

      const cost = money(g.cost);
      const range = parseRange(g.range);
      const st = /^\d/.test(g.st) ? Number(/\d+/.exec(g.st)[0]) : null;

      // "T" in the Shots column marks a thrown weapon: it is the wielder who
      // throws it, so the ST column is the minimum ST to use it. A launcher's ST
      // is the weapon's own, and drives its damage.
      const thrown = /^T/i.test(g.shots);

      const [accuracy, scopeBonus] = g.acc.split("+").map(Number);

      const mode = {
        // A hatchet is thrown, a bow is shot; the label should say which.
        name: continues ? g.name.replace(CONTINUATION, "").trim() : thrown ? "thrown" : "shot",
        skill: groupSkills[0] ?? "",
        damageBase: g.dmg.startsWith("sw") ? "sw" : g.dmg.startsWith("thr") ? "thr" : "fixed",
        damageModifier: /^\d+d/.test(g.dmg) ? 0 : Number(/[+-]\d+/.exec(g.dmg)?.[0] ?? 0),
        damageFormula: /^\d+d/.test(g.dmg) ? g.dmg.replace(/\(.*\)/, "") : "",
        damageType: g.type,
        armorDivisor: Number(g.div ?? 1),
        accuracy: accuracy ?? 0,
        scopeBonus: scopeBonus ?? 0,
        ...range,
        rateOfFire: /^\d/.test(g.rof) ? Number(/\d+/.exec(g.rof)[0]) : 1,
        shots: g.shots,
        minSt: st,
        // The dagger after ST marks a two-handed weapon, as in the melee table.
        twoHanded: /†/.test(g.st),
        // "Bows, crossbows, and prodds have their own ST value. Use this instead
        // of your ST to determine range and damage." (Basic Set: Characters
        // p. 270.) Nothing else does: a sling or an atlatl amplifies the
        // wielder's own throw, and the ST column there is only the minimum
        // needed to use the weapon. Prodds sit in the Crossbow group.
        weaponSt: OWN_ST_SKILLS.has(groupSkills[0] ?? "") ? st : null,
        thrown,
        bulk: g.bulk && !new RegExp(`^${DASH}$`).test(g.bulk) ? Number(g.bulk.replace(/[–—]/, "-")) : 0,
      };

      if (continues) {
        last.system.rangedModes.push(mode);
        continue;
      }

      const name = g.name.replace(/\s+/g, " ").trim();
      if (!/^[A-Z0-9]/.test(name)) { reject(text, "name is not a weapon"); continue; }

      const existing = byName.get(name);
      if (existing) {
        existing.system.rangedModes.push(mode);
        last = existing;
        continue;
      }

      const item = {
        _id: itemId(name),
        name,
        type: "equipment",
        system: {
          quantity: 1,
          // The Weight column gives the weapon and then its ammunition per shot,
          // as "3/0.1". Only the weapon's own weight belongs to this item.
          weight: number(g.weight.split("/")[0]),
          cost,
          carried: true,
          equipped: false,
          tl: g.tl && !new RegExp(`^${DASH}$`).test(g.tl) ? g.tl : "",
          description: g.notes.trim() ? `<p>Table notes: ${g.notes.trim()}</p>` : "",
          reference: "Basic Set: Characters",
          meleeModes: [],
          rangedModes: isLauncher ? [] : [mode],
        },
      };
      byName.set(name, item);
      items.push(item);
      last = item;
      continue;
    }

    // Peel a trailing parenthesis off only when it reads as a defaults clause,
    // so "THROWN WEAPON (SPEAR)" keeps its specialty and "BOW (DX-5)" does not
    // keep its defaults.
    const parens = TRAILING_PARENS.exec(text);
    const hasDefaults = Boolean(parens && LOOKS_LIKE_DEFAULTS.test(parens.groups.tail));
    const headingText = hasDefaults ? parens.groups.head : text;
    const defaultsText = hasDefaults ? parens.groups.tail : "";

    const g = GROUP.exec(headingText);
    const headingBody = g?.groups.skills.replace(/\b(?:or|and)\b/g, " ").trim();
    if (g && /[A-Z]{3}/.test(headingBody) && headingBody === headingBody.toUpperCase()) {
      groupSkills = skillsFromGroup(g.groups.skills, hasDefaults);
      last = null;

      for (const name of groupSkills) {
        if (skills.has(name) || alreadyPacked.has(name)) continue;
        const pair = pairFor(name);
        if (!pair) {
          reject(name, "skill has no attribute/difficulty in the skills chapter");
          continue;
        }
        skills.set(name, {
          _id: skillId(name),
          name,
          type: "skill",
          system: {
            attribute: pair.attribute,
            difficulty: pair.difficulty,
            points: 0,
            bonus: 0,
            defaults: parseSkillDefaults(defaultsText),
            techLevel: "",
            description: "",
            reference: "Basic Set: Characters",
          },
        });
      }
      continue;
    }

    if (/\$\d/.test(line) && /\d\s+\d/.test(line)) reject(text, "row not parsed");
  }

  // A weapon that shoots several ammunitions gets one mode per ammunition, so the
  // labels have to say which; "shot" alone would repeat.
  for (const item of items) {
    const counts = new Map();
    for (const m of item.system.rangedModes) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    for (const m of item.system.rangedModes) {
      if (counts.get(m.name) > 1) m.name = `${m.name} (${m.skill})`;
    }
  }

  const modes = items.reduce((n, i) => n + i.system.rangedModes.length, 0);
  console.log(`weapons: ${items.length} (${modes} attack modes)`);
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((a, r) => ((a[r.why] = (a[r.why] ?? 0) + 1), a), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`);
  }

  // A hatchet is one weapon you can either swing or throw, and the book lists it
  // in both tables. Those are two ways to use one item, exactly as a sword's
  // swing and thrust are, so the throwing modes join the item the melee table
  // already produced rather than making a second item of the same name.
  //
  // Replacing rangedModes wholesale rather than appending keeps this re-runnable:
  // this parser is the only source of them.
  const meleePath = join(projectRoot, "packs-src", "equipment", "melee-weapons.json");
  let melee = [];
  try {
    melee = JSON.parse(readFileSync(meleePath, "utf8"));
  } catch {
    console.log("no melee-weapons.json to merge into; run the melee parser first");
  }

  const meleeByName = new Map(melee.map((m) => [m.name, m]));
  const merged = [];
  const standalone = items.filter((item) => {
    const existing = meleeByName.get(item.name);
    if (!existing) return true;
    existing.system.rangedModes = item.system.rangedModes;
    merged.push(item.name);
    return false;
  });

  if (merged.length) {
    console.log(`merged into melee weapons of the same name: ${merged.join(", ")}`);
  }

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "equipment", "ranged-weapons.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(standalone, null, 2)}\n`, "utf8");
    if (melee.length) writeFileSync(meleePath, `${JSON.stringify(melee, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${standalone.length} ranged-only weapons`);

    const skillOut = join(projectRoot, "packs-src", "skills", "ranged-table-skills.json");
    writeFileSync(skillOut, `${JSON.stringify([...skills.values()], null, 2)}\n`, "utf8");
    console.log(`wrote ${skills.size} ranged weapon skills`);

    writeFileSync(
      join(projectRoot, "packs-src", "equipment", ".rejected-ranged.txt"),
      rejected.map((r) => `${r.why}\t${r.context}`).join("\n"),
      "utf8",
    );
  }
}

main();
