/**
 * Parses the Basic Set's Melee Weapon Table into compendium JSON.
 *
 * The weapon tables need `pdftotext -table`, not the `-raw` mode the traits
 * parser uses or the `-simple` reflow the skills parser uses: this is genuinely
 * tabular data, and only `-table` keeps the columns apart.
 *
 * The table is organised as skill groups ("AXE/MACE (DX-5, Flail-4, ...)") each
 * followed by a header row and then the weapons that skill wields. A weapon with
 * more than one attack -- a sword that both swings and thrusts -- is written as
 * a first row carrying the name, cost, weight, and TL, followed by rows whose
 * name column holds only "or". Those become extra melee modes on the same item
 * rather than separate items.
 *
 * Column positions are NOT fixed: each group's header is laid out to fit its own
 * widest name, so the fields are matched by shape instead of by offset.
 *
 * The table names the skill each weapon uses but never states that skill's
 * difficulty, so the skills chapter is read alongside it: it writes each melee
 * weapon skill as "Kusari (DX/Hard): ...". Assuming a difficulty instead gets
 * Knife and Flail wrong, which are Easy and Hard respectively.
 *
 * Usage: node tools/parse-melee-weapons.mjs <table-text> <skills-chapter-text> [--write]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Damage types, longest first so "pi++" is not matched as "pi". */
const TYPES = "cr|cut|imp|pi\\+\\+|pi\\+|pi-|pi|burn|tox|cor|fat";

/**
 * A weapon row. Every column is matched by its own shape because the table is
 * re-laid-out per group, so a fixed-offset slice would mis-cut most of it.
 */
const ROW = new RegExp(
  String.raw`^(?<tl>\^|[-–—]|\d{1,2})?\s+(?<name>\S.*?)\s+` +
    String.raw`(?<dmg>(?:sw|thr)(?:[+-]\d+)?|\d+d(?:[+-]\d+)?(?:\((?<div>[\d.]+)\))?|var\.)\s*` +
    String.raw`(?<type>${TYPES})?\s+` +
    String.raw`(?<reach>(?:C|\d)(?:\s*[-,]\s*\d)*\*?|var\.)\s+` +
    String.raw`(?<parry>[+–—-]?\d+[UF]?|No|var\.|[-–—])\s+` +
    String.raw`(?<cost>\$[\d,]+|\+\$[\d,]+|var\.|[-–—])\s+` +
    String.raw`(?<weight>\+?[\d.]+|var\.|[-–—])\s+` +
    String.raw`(?<st>\d{1,2}[†*]?|[-–—])\s*` +
    String.raw`(?<notes>.*)$`,
);

/**
 * A skill-group heading. The skills are always capitals; the defaults clause
 * that follows is mixed case, so only the leading run is tested for case.
 */
const GROUP =
  /^(?<skills>[A-Z][A-Z0-9/ ,'’-]*(?:\s+(?:or|and)\s+[A-Z][A-Z0-9/ ,'’-]*)*)\s*(?:\((?<defaults>.+)\))?\s*$/;

/**
 * A heading whose skills carry a penalty: "BRAWLING-2, KARATE-2, or DX-2" heads
 * the kicking attacks. The melee mode has no field for a modifier to the skill
 * roll, so these rows are reported rather than written -- attacking at full
 * Brawling when the book says Brawling-2 overstates the chance to hit.
 */
const PENALISED_GROUP = /[A-Z]-\d/;

/**
 * How the skills chapter states a skill's attribute and difficulty:
 * "Force Sword (DX/Average): Any sword with a blade made of energy...".
 */
const SKILL_PAIR =
  /([A-Z][A-Za-z0-9'/ -]{2,28}?) \((ST|DX|IQ|HT|Will|Per)\/(Easy|Average|Hard|Very Hard)\):/g;

const DIFFICULTY = { Easy: "E", Average: "A", Hard: "H", "Very Hard": "VH" };

/** Rows whose name column holds only this are further modes of the row above. */
const CONTINUATION = /^or$/i;

/**
 * Skill names as the skills compendium stores them, keyed by the table's
 * capitalised group heading. A group naming several skills ("BOXING, BRAWLING,
 * KARATE, or DX") is an unarmed attack any of them can make; the first is used,
 * because the attack has to name one skill and that is the one the book lists
 * first.
 */
function skillFromGroup(heading) {
  // Headings are padded to the column width, so "TWO-HANDED     AXE/MACE"
  // arrives with the padding still in it.
  const first = heading.replace(/\s+/g, " ").split(/,| or /)[0].trim();
  if (!first || first === "DX") return "";
  return first
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/Two-handed/i, "Two-Handed")
    .replace(/Jitte\/sai/i, "Jitte/Sai")
    .replace(/Axe\/mace/i, "Axe/Mace");
}

/**
 * Parses a group heading's defaults clause -- "DX-5, Force Sword-4, Rapier-4" --
 * into the shape the skill data model stores.
 *
 * The weapon table is the only place the book states these defaults in a
 * machine-readable form, so the skills a weapon needs can be built from the same
 * heading that names them. Anything that is an instruction rather than a
 * reference ("any sword skill at -3") is dropped: it cannot resolve to an item.
 */
function parseSkillDefaults(clause) {
  const defaults = [];
  if (!clause) return defaults;

  for (const raw of clause.replace(/\s+/g, " ").split(/,|\bor\b/)) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^([A-Z][A-Za-z0-9'/ -]*?)\s*-\s*(\d+)$/.exec(token);
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

function skillId(name) {
  return createHash("sha1").update(`skill:${name}`).digest("hex").slice(0, 16);
}

function slugId(name) {
  return createHash("sha1").update(`melee:${name}`).digest("hex").slice(0, 16);
}

/** "$1,250" -> 1250; "-" and "var." -> 0. */
function money(value) {
  const m = /\$([\d,]+)/.exec(value ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

/**
 * A weight or similar figure. At least one digit is required: matching "[\d.]+"
 * alone also matches the dot in "var.", and Number(".") is NaN, which serialises
 * to null and breaks the non-nullable weight field on the data model.
 */
function number(value) {
  const m = /(\d+(?:\.\d+)?|\.\d+)/.exec(value ?? "");
  return m ? Number(m[1]) : 0;
}

function main() {
  const [, , source, chapter, write] = process.argv;
  if (!source || !chapter) {
    console.error(
      "Usage: node tools/parse-melee-weapons.mjs <table-text> <skills-chapter-text> [--write]",
    );
    process.exit(1);
  }

  // The book's own statement of each skill's attribute and difficulty. Anything
  // absent from it is not invented here: the skill is reported instead.
  const pairs = new Map();
  const prose = readFileSync(chapter, "utf8").replace(/\s+/g, " ");
  SKILL_PAIR.lastIndex = 0;
  for (let m = SKILL_PAIR.exec(prose); m; m = SKILL_PAIR.exec(prose)) {
    pairs.set(m[1].trim(), { attribute: m[2], difficulty: DIFFICULTY[m[3]] });
  }

  const lines = readFileSync(source, "utf8").split(/\r?\n/);

  const items = [];
  const byName = new Map();
  const rejected = [];
  const reject = (context, why) => rejected.push({ context, why });

  const skills = new Map();
  let skill = "";
  let last = null;
  let pending = "";
  let penalised = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    let text = line.trim();
    if (!text && !pending) continue;

    // A heading whose defaults clause is too long for one line wraps, leaving an
    // unclosed parenthesis. SHORTSWORD is the one that does, and leaving it
    // unmatched silently files its weapons under the previous skill -- which put
    // the shortsword, cutlass, baton and cattle prod under Shield.
    if (pending) {
      pending = `${pending} ${text}`;
      if (!pending.includes(")")) continue;
      text = pending.replace(/\s+/g, " ").trim();
      pending = "";
    } else if (/^[A-Z][A-Z0-9/ ,'’-]{2,}\(/.test(text.replace(/\s+/g, " ")) && !text.includes(")")) {
      pending = text;
      continue;
    }

    if (!text) continue;

    // Header rows and the running page header carry no weapons.
    if (/^TL\s+Weapon/.test(text)) continue;
    if (/^(\d+\s+)?EQUIPMENT(\s+\d+)?$/.test(text)) continue;
    if (/^Melee Weapon Table$/.test(text)) continue;

    const row = ROW.exec(line);
    if (row) {
      const g = row.groups;

      // A weapon with several attacks repeats with "or" in the name column.
      const continues = CONTINUATION.test(g.name);
      if (continues && !last) { reject(text, "continuation with no weapon above it"); continue; }

      // "var." damage is defined in prose elsewhere (Striker, force weapons),
      // and there is nothing here to roll.
      if (g.dmg === "var." || !g.type) { reject(text, "damage not expressible"); continue; }

      if (penalised) { reject(text, "skill penalty not expressible on a melee mode"); continue; }

      const mode = {
        // A weapon whose damage is a flat dice roll neither swings nor thrusts.
        name: g.dmg.startsWith("sw") ? "swing" : g.dmg.startsWith("thr") ? "thrust" : "attack",
        skill,
        damageBase: g.dmg.startsWith("sw") ? "sw" : g.dmg.startsWith("thr") ? "thr" : "fixed",
        damageModifier: Number(/[+-]\d+/.exec(g.dmg)?.[0] ?? 0),
        damageFormula: /^\d+d/.test(g.dmg) ? g.dmg.replace(/\(.*\)/, "") : "",
        damageType: g.type,
        armorDivisor: Number(g.div ?? 1),
        reach: g.reach.replace(/\s+/g, " ").trim(),
        // "U" marks an unbalanced weapon and "F" a fencing weapon. Neither is a
        // parry bonus, so only the leading number is read here.
        parryModifier: Number(/^[+-]?\d+/.exec(g.parry)?.[0] ?? 0),
        canParry: !/^No$/i.test(g.parry),
        isFlail: /FLAIL|KUSARI/.test(skill.toUpperCase()),
        minSt: /^[-–—]$/.test(g.st) ? null : Number(/\d+/.exec(g.st)?.[0] ?? 0),
        // The table marks a two-handed weapon with a dagger after its ST, and
        // gives the same weapon a separate one-handed line where that applies
        // (a katana is ST 11 in one hand, ST 10† in two). The marker is the
        // book's own statement; the skill group only implies it.
        twoHanded: /†/.test(g.st),
        // The book defines "U" as unbalanced -- cannot parry in a turn it has
        // attacked in -- which is a different rule from needing to be readied
        // again, and belongs in its own field.
        unbalanced: /U$/.test(g.parry),
        unreadyAfterAttack: false,
      };

      if (continues) {
        last.system.meleeModes.push(mode);
        continue;
      }


      const name = g.name.replace(/\s+/g, " ").trim();

      // Weapon names are capitalised in the table; a lowercase one is a fragment
      // of the surrounding prose that happens to sit in the column ("two hands").
      if (!/^[A-Z0-9]/.test(name)) { reject(text, "name is not a weapon"); continue; }

      // The same weapon appears under each skill that can wield it, with its own
      // statistics: a bastard sword swings for sw+1 in one hand and sw+2 in two.
      // Those are further ways to use one item, not a second item.
      const existing = byName.get(name);
      if (existing) {
        existing.system.meleeModes.push(mode);
        last = existing;
        continue;
      }

      const item = {
        _id: slugId(name),
        name,
        type: "equipment",
        system: {
          quantity: 1,
          weight: number(g.weight),
          cost: money(g.cost),
          carried: true,
          equipped: false,
          tl: g.tl && !/^[-–—]$/.test(g.tl) ? g.tl : "",
          description: g.notes.trim() ? `<p>Table notes: ${g.notes.trim()}</p>` : "",
          reference: "Basic Set: Characters",
          meleeModes: [mode],
          rangedModes: [],
        },
      };
      byName.set(name, item);
      items.push(item);
      last = item;
      continue;
    }

    const g = GROUP.exec(text);
    const headingBody = g?.groups.skills.replace(/\b(?:or|and)\b/g, " ").trim();
    if (g && /[A-Z]{3}/.test(headingBody) && headingBody === headingBody.toUpperCase()) {
      penalised = PENALISED_GROUP.test(g.groups.skills);
      skill = skillFromGroup(g.groups.skills);
      last = null;
      if (skill && !penalised && !skills.has(skill)) {
        const pair = pairs.get(skill);
        if (!pair) {
          reject(skill, "skill has no attribute/difficulty in the skills chapter");
          continue;
        }
        skills.set(skill, {
          _id: skillId(skill),
          name: skill,
          type: "skill",
          system: {
            attribute: pair.attribute,
            difficulty: pair.difficulty,
            points: 0,
            bonus: 0,
            defaults: parseSkillDefaults(g.groups.defaults),
            techLevel: "",
            description: "",
            reference: "Basic Set: Characters",
          },
        });
      }
      continue;
    }

    if (/\b(?:sw|thr)(?:[+-]\d+)?\s+(?:cr|cut|imp|pi)/.test(line)) reject(text, "row not parsed");
  }

  // The combat tab labels an attack with the weapon's name and the mode's, so a
  // weapon wielded by two skills would show "Katana swing" twice with different
  // damage. Where a name repeats on one item, say which skill it belongs to --
  // the grip does not always separate them, since a naginata is two-handed under
  // all three of Polearm, Staff and Two-Handed Sword.
  for (const item of items) {
    const counts = new Map();
    for (const m of item.system.meleeModes) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    for (const m of item.system.meleeModes) {
      if (counts.get(m.name) > 1) m.name = `${m.name} (${m.skill})`;
    }

    // A weapon can swing two ways with one skill -- a halberd cuts for sw+5 and
    // impales for sw+4 -- so the skill alone still leaves two rows reading the
    // same. Fall back to the damage type, which is what actually differs.
    const after = new Map();
    for (const m of item.system.meleeModes) after.set(m.name, (after.get(m.name) ?? 0) + 1);
    for (const m of item.system.meleeModes) {
      if (after.get(m.name) > 1) m.name = `${m.name} ${m.damageType}`;
    }
  }

  // A default naming a skill that no pack carries can never fire: the resolver
  // matches by name and finds nothing. Drop those rather than ship a default
  // that does nothing, and report them, as the skills parser does.
  const known = new Set([
    ...skills.keys(),
    ...JSON.parse(readFileSync(join(projectRoot, "packs-src", "skills", "basic-set-skills.json"), "utf8")).map((x) => x.name),
    ...JSON.parse(readFileSync(join(projectRoot, "packs-src", "skills", "melee-weapon-skills.json"), "utf8")).map((x) => x.name),
  ]);
  const unresolved = new Set();
  for (const s of skills.values()) {
    s.system.defaults = s.system.defaults.filter((d) => {
      if (d.from !== "skill" || known.has(d.skill)) return true;
      unresolved.add(d.skill);
      return false;
    });
  }
  if (unresolved.size) {
    console.log(`skill defaults dropped as unresolvable: ${[...unresolved].join(", ")}`);
  }

  const modes = items.reduce((n, i) => n + i.system.meleeModes.length, 0);
  console.log(`weapons: ${items.length} (${modes} attack modes)`);
  console.log(`rejected: ${rejected.length}`);
  const byReason = rejected.reduce((a, r) => ((a[r.why] = (a[r.why] ?? 0) + 1), a), {});
  for (const [why, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${why}`);
  }

  if (write === "--write") {
    const out = join(projectRoot, "packs-src", "equipment", "melee-weapons.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${items.length} weapons`);
    // The skills the weapons name, built from the same headings. Without these
    // an attack made with a saber or a lance resolves to no skill at all.
    const skillOut = join(projectRoot, "packs-src", "skills", "weapon-table-skills.json");
    writeFileSync(skillOut, `${JSON.stringify([...skills.values()], null, 2)}
`, "utf8");
    console.log(`wrote ${skills.size} weapon skills`);

    writeFileSync(
      join(projectRoot, "packs-src", "equipment", ".rejected.txt"),
      rejected.map((r) => `${r.why}\t${r.context}`).join("\n"),
      "utf8",
    );
  }
}

main();
