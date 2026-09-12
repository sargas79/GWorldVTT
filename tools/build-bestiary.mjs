/**
 * Expands the bestiary's stat lines into Actors for the creatures compendium.
 *
 * The Basic Set gives its animals and monsters in an abbreviated form
 * (Campaigns pp. 455-461): four attributes, the secondary characteristics as
 * racial averages, a Size Modifier and a weight, a line of traits and a line
 * of skills. `tools/bestiary/basic-set-animals.json` carries exactly that,
 * transcribed from the pages, and this turns each line into an NPC with its
 * traits and skills as embedded items, priced off the trait and skill
 * compendia so that the sheet's ledger adds up.
 *
 * What the pages say and this reads:
 *   - "Assume that HP equal ST and FP equal HT, unless noted otherwise."
 *   - Will, Per, Basic Speed and Move are "racial averages ... derived from
 *     attributes using the usual formulas -- but note that many animals have
 *     racial Will, Perception, and Move modifiers", so what the line shows
 *     beyond the formula is written as purchased levels.
 *   - "Dodge is based on Basic Speed, and includes the +1 for Combat
 *     Reflexes", which the sheet works out for itself.
 *
 * Usage: node tools/build-bestiary.mjs [--write]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(projectRoot, "tools", "bestiary", "basic-set-animals.json");
const OUT_DIR = join(projectRoot, "packs-src", "creatures");
const OUT_FILE = "basic-set-animals.json";

const id = (kind, name) => createHash("sha1").update(`${kind}:${name}`).digest("hex").slice(0, 16);

function loadPack(dir) {
  const byName = new Map();
  for (const file of readdirSync(join(projectRoot, "packs-src", dir)).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(projectRoot, "packs-src", dir, file), "utf8"))) {
      byName.set(doc.name, doc);
    }
  }
  return byName;
}

const advantages = loadPack("advantages");
const disadvantages = loadPack("disadvantages");
const skills = loadPack("skills");
const templates = loadPack("templates");

/** The compendium's name for a trait the pages write more briefly. */
const ALIASES = {
  "Sharp Teeth": "Teeth (Sharp Teeth)",
  "Sharp Beak": "Teeth (Sharp Beak)",
  Fangs: "Teeth (Fangs)",
  "Sharp Claws": "Claws (Sharp Claws)",
  "Blunt Claws": "Claws (Blunt Claws)",
  Hooves: "Claws (Hooves)",
};

/**
 * Natural attacks and meta-traits the compendia do not carry as records of
 * their own, at the book's price (Characters pp. 42, 88, 91, 263).
 */
const FLAT = {
  "Teeth (Sharp Teeth)": { category: "advantage", points: 1, reference: "Basic Set: Characters p. 91" },
  "Teeth (Sharp Beak)": { category: "advantage", points: 1, reference: "Basic Set: Characters p. 91" },
  "Teeth (Fangs)": { category: "advantage", points: 2, reference: "Basic Set: Characters p. 91" },
  "Claws (Sharp Claws)": { category: "advantage", points: 5, reference: "Basic Set: Characters p. 42" },
  "Claws (Blunt Claws)": { category: "advantage", points: 3, reference: "Basic Set: Characters p. 42" },
  "Claws (Hooves)": { category: "advantage", points: 3, reference: "Basic Set: Characters p. 42" },
  "Striker (Crushing)": { category: "advantage", points: 5, reference: "Basic Set: Characters p. 88" },
  "Striker (Cutting)": { category: "advantage", points: 7, reference: "Basic Set: Characters p. 88" },
  "Striker (Impaling)": { category: "advantage", points: 8, reference: "Basic Set: Characters p. 88" },
  "Striker (Piercing)": { category: "advantage", points: 5, reference: "Basic Set: Characters p. 88" },
  "Enhanced Move (Ground) 1/2": { category: "advantage", points: 5, reference: "Basic Set: Characters p. 52" },
};

/** Skill points for a level relative to the attribute (Characters p. 170). */
const RELATIVE_AT_ONE_POINT = { E: 0, A: -1, H: -2, VH: -3 };
function pointsForRelative(relative, difficulty) {
  const base = RELATIVE_AT_ONE_POINT[difficulty] ?? -1;
  const steps = relative - base;
  if (steps < 0) return 0;
  if (steps === 0) return 1;
  if (steps === 1) return 2;
  if (steps === 2) return 4;
  // 8 points at +3, then four a level.
  return 8 + (steps - 3) * 4;
}

/** A trait as the pages write it, made into an item. */
function traitItem(creature, written) {
  // "Bad Temper (9)": a self-control number.
  let text = written.trim();
  let selfControl = null;
  const cr = /^(.*)\s\((6|9|12|15)\)$/.exec(text);
  if (cr) { text = cr[1].trim(); selfControl = Number(cr[2]); }

  // Trailing notes in parentheses that are not the trait's own name.
  let modifiers = [];
  const striker = /^(Crushing|Cutting|Impaling|Piercing) Striker \((.+)\)$/.exec(text);
  if (striker) {
    text = `Striker (${striker[1]})`;
    modifiers = [];
    written = `${text}: ${striker[2]}`;
  }
  const trunk = /^Extra Arms \(Trunk; (.+)\)$/.exec(text);
  if (trunk) {
    text = "Extra Arms";
    // Extra-Flexible +50%, Long +100%, Weak (1/4 ST) -50% (Characters p. 53).
    modifiers = [{ name: "Extra-Flexible", value: 50 }, { name: "Long", value: 100 }, { name: "Weak", value: -50 }];
    written = "Extra Arms (Trunk)";
  }
  const flight = /^Flight \(Winged\)$/.exec(text);
  if (flight) { text = "Flight"; modifiers = [{ name: "Winged", value: -25 }]; }
  const gills = /^Doesn't Breathe \(Gills\)$/.exec(text);
  if (gills) { text = "Doesn't Breathe"; modifiers = [{ name: "Gills", value: -50 }]; }
  const toxic = /^Toxic Attack (\d+)d \((.+)\)$/.exec(text);
  const skullOnly = /^DR (\d+) \(Skull only\)$/.exec(text);
  const water = /^Reduced Consumption (\d+) \(Water Only\)$/.exec(text);

  // "Night Vision 5", "DR 2", "Arm ST 3": a level after the name.
  let levels = 0;
  let name = text;
  const levelled = /^(.*?)\s(\d+)$/.exec(text);
  if (toxic) {
    name = "Toxic Attack";
    levels = Number(toxic[1]);
    modifiers = toxic[2].split(";").map((m) => ({ name: m.trim(), value: 0 }));
  } else if (skullOnly) {
    name = "Damage Resistance";
    levels = Number(skullOnly[1]);
    modifiers = [{ name: "Skull only", value: -70 }];
  } else if (water) {
    name = "Reduced Consumption";
    levels = Number(water[1]);
    modifiers = [{ name: "Water Only", value: -50 }];
  } else if (levelled && !/Enhanced Move/.test(text)) {
    name = levelled[1];
    levels = Number(levelled[2]);
  } else if (/^Enhanced Move \((Ground|Air|Water)\) 1$/.test(text)) {
    name = text.replace(/ 1$/, "");
    levels = 1;
  }
  if (name === "DR") name = "Damage Resistance";
  name = ALIASES[name] ?? name;

  const meta = templates.get(name);
  const flat = FLAT[name];
  const doc = advantages.get(name) ?? disadvantages.get(name);

  let system;
  if (doc) {
    system = {
      ...doc.system,
      levels: doc.system.pointsPerLevel || doc.system.costTable?.length ? Math.max(1, levels) : 0,
      modifiers,
      selfControl,
    };
  } else if (meta) {
    // A meta-trait, at the cost its template states (Characters p. 263).
    system = {
      category: "disadvantage", points: meta.system.statedCost, levels: 0, pointsPerLevel: 0,
      costTable: [], levelNames: [], maxLevels: 0, reactionModifier: 0, modifiers: [], selfControl: null,
      description: "", reference: meta.system.reference ?? "Basic Set: Characters p. 263",
    };
  } else if (flat) {
    system = {
      category: flat.category, points: flat.points, levels: 0, pointsPerLevel: 0, costTable: [],
      levelNames: [], maxLevels: 0, reactionModifier: 0, modifiers, selfControl,
      description: "", reference: flat.reference,
    };
  } else {
    throw new Error(`${creature}: no trait called "${name}" (from "${written}")`);
  }

  const shown = striker || trunk ? written : doc || meta || flat ? (levelled && !doc?.system.pointsPerLevel && !doc?.system.costTable?.length && !flat ? text : name) : name;
  return {
    _id: id(`creature-trait:${creature}`, shown),
    name: shown,
    type: "trait",
    system,
  };
}

/** A skill at the level the page gives, priced from the creature's attribute. */
function skillItem(creature, name, level, attrs, secondary) {
  const doc = skills.get(name);
  if (!doc) throw new Error(`${creature}: no skill called "${name}"`);
  const attribute = doc.system.attribute;
  const score = attribute === "Per" ? secondary.per : attribute === "Will" ? secondary.will : attrs[attribute];
  const relative = level - score;
  const points = pointsForRelative(relative, doc.system.difficulty);
  if (points === 0) {
    console.warn(`  ${creature}: ${name}-${level} is below what one point buys (${attribute} ${score}); given 1 point`);
  }
  return {
    _id: id(`creature-skill:${creature}`, name),
    name,
    type: "skill",
    system: { ...doc.system, points: Math.max(1, points) },
  };
}

function build() {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const out = [];
  for (const c of source) {
    const attrs = { ST: c.ST, DX: c.DX, IQ: c.IQ, HT: c.HT };
    const speed = (c.DX + c.HT) / 4;
    const secondary = { will: c.will, per: c.per };
    const items = [
      ...c.traits.map((t) => traitItem(c.name, t)),
      ...Object.entries(c.skills ?? {}).map(([name, level]) => skillItem(c.name, name, level, attrs, secondary)),
    ];
    out.push({
      _id: id("creature", c.name),
      name: c.name,
      type: "npc",
      system: {
        attributes: attrs,
        purchased: {
          hp: 0, fp: 0,
          will: c.will - c.IQ,
          per: c.per - c.IQ,
          basicSpeed: Math.round((c.speed - speed) * 4) / 4,
          basicMove: c.move - Math.floor(c.speed),
        },
        hp: { value: c.ST, max: c.ST },
        fp: { value: c.HT, max: c.HT },
        sm: c.sm,
        points: { starting: 0, disadvantageLimit: 0, awards: [] },
        groupSize: 1,
        tactics: "",
        details: {
          weight: c.weight,
          notes: [
            c.group ? `${c.group}.` : "",
            c.hexes ? `${c.hexes} hexes.` : "",
            c.moveNote ? `Move: ${c.moveNote}.` : "",
            c.cost ? `Cost: $${c.cost.toLocaleString("en-US")}.` : "",
            c.reference ?? "",
          ].filter(Boolean).join(" "),
        },
      },
      items,
    });
  }
  return out;
}

function main() {
  const creatures = build();
  const traits = creatures.reduce((n, c) => n + c.items.filter((i) => i.type === "trait").length, 0);
  const skillCount = creatures.reduce((n, c) => n + c.items.filter((i) => i.type === "skill").length, 0);
  console.log(`creatures: ${creatures.length}, traits ${traits}, skills ${skillCount}`);
  if (process.argv.includes("--write")) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, OUT_FILE), `${JSON.stringify(creatures, null, 2)}\n`, "utf8");
    console.log(`wrote packs-src/creatures/${OUT_FILE}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
