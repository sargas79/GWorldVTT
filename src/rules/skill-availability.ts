/**
 * Tech Level and Skill Availability (Basic Set Revised p. 341).
 *
 * A list, grounded in history, of the tech level at which each natural-science
 * and equipment design or repair skill first becomes available. It is advice
 * ("the answer is up to the GM"), so a skill taken before its first TL is
 * warned about, never refused. Skills for vehicles and weapons are not in it:
 * an item's own TL implies its skills.
 */

import { normalizeSkillName } from "./skills.js";

/** TL^ (the "beyond" mark) is recorded as TL12, the first level of the Ultra-Tech range. */
export const TL_CARET = 12;

/**
 * The list as printed: [first TL, "Skill (Specialty, Specialty)"]. A skill
 * without a bracket applies to every specialty of it; "A/B" names two skills
 * that share the row (Electronics Operation/Repair).
 */
const ROWS: ReadonlyArray<readonly [number, string]> = [
  [0, "Astronomy (Observational)"],
  [0, "Surgery (Trauma Surgery)"],
  [1, "Accounting"],
  [1, "Architecture"],
  [1, "Armoury (Body Armor)"],
  [1, "Astronomy"],
  [1, "Cartography"],
  [1, "Diagnosis"],
  [1, "Engineer (Civil, Combat, Mining)"],
  [1, "Mathematics (Applied, Surveying)"],
  [1, "Metallurgy"],
  [1, "Navigation (Land, Sea)"],
  [1, "Research"],
  [1, "Smith"],
  [1, "Surgery"],
  [1, "Traps"],
  [1, "Veterinary"],
  [2, "Alchemy"],
  [2, "Armoury (Heavy Weapons)"],
  [2, "Engineer (Artillery, Clockwork)"],
  [2, "Expert Skill (Natural Philosophy)"],
  [2, "Lockpicking"],
  [2, "Mathematics (Pure)"],
  [3, "Armoury (Small Arms)"],
  [3, "Cryptography"],
  [3, "Explosives (Demolition, Fireworks)"],
  [4, "Engineer (Small Arms)"],
  [4, "Hazardous Materials (Chemical)"],
  [4, "Mathematics (Cryptology, Statistics)"],
  [4, "Physiology"],
  [5, "Armoury (Vehicular Armor)"],
  [5, "Biology"],
  [5, "Chemistry"],
  [5, "Electronics Operation/Repair (Communications, Electronic Warfare, Scientific)"],
  [5, "Expert Skill (Epidemiology, Hydrology)"],
  [5, "Explosives (Explosive Ordnance Disposal)"],
  [5, "Forensics"],
  [5, "Geography (Earthlike, Gas Giants, Hostile Terrestrial, Ice Dwarfs, Ice Worlds, Rock Worlds, Physical)"],
  [5, "Geology"],
  [5, "Meteorology"],
  [5, "Paleontology"],
  [5, "Pharmacy (Synthetic)"],
  [5, "Photography"],
  [5, "Physics"],
  [6, "Electrician"],
  [6, "Electronics Operation/Repair (Media, Medical, Security, Surveillance)"],
  [6, "Engineer (Electrical, Electronics, Materials)"],
  [6, "Hazardous Materials (Biological)"],
  [6, "Navigation (Air)"],
  [6, "Psychology (Experimental)"],
  [7, "Computer Operation"],
  [7, "Computer Programming"],
  [7, "Electronics Operation/Repair (Sensors, Sonar)"],
  [7, "Electronics Repair (Computers)"],
  [7, "Engineer (Microtechnology, Nuclear)"],
  [7, "Explosives (Nuclear Ordnance Disposal, Underwater Demolition)"],
  [7, "Hazardous Materials (Radioactive)"],
  [7, "Mathematics (Computer Science)"],
  [7, "Navigation (Space)"],
  [8, "Bioengineering"],
  [8, "Computer Hacking"],
  [8, "Engineer (Robotics)"],
  [8, "Expert Skill (Computer Security)"],
  [9, "Armoury (Battlesuits)"],
  [9, "Engineer (Nanotechnology)"],
  [9, "Hazardous Materials (Nanotech)"],
  [TL_CARET, "Armoury (Force Shields)"],
  [TL_CARET, "Electronics Operation/Repair (Force Shields, Matter Transmitters, Parachronic, Psychotronics, Temporal)"],
  [TL_CARET, "Engineer (Parachronic, Psychotronics, Temporal)"],
  [TL_CARET, "Expert Skill (Psionics, Xenology)"],
  [TL_CARET, "Hazardous Materials (Exotic Matter)"],
  [TL_CARET, "Navigation (Hyperspace)"],
];

/** The first TL of each skill, keyed by the normalised name ("engineer (civil)", "biology"). */
export const FIRST_TL: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [tl, row] of ROWS) {
    const match = /^([^(]+?)\s*(?:\((.*)\))?$/.exec(row);
    if (!match) continue;
    const names = (match[1] ?? "").split("/").map((part) => part.trim());
    // "Electronics Operation/Repair": the second word completes the skill's name.
    const stem = (names[0] ?? "").split(" ").slice(0, -1).join(" ");
    const bases = names.map((part, i) => (i === 0 ? part : `${stem} ${part}`.trim()));
    const specialties = match[2] ? match[2].split(",").map((s) => s.trim()) : [null];
    for (const base of bases) {
      for (const specialty of specialties) {
        map.set(normalizeSkillName(specialty ? `${base} (${specialty})` : base), tl);
      }
    }
  }
  return map;
})();

/**
 * The tech level at which a skill first exists: the one the record carries if
 * it has one, else the book's list by name (the specialty, then the skill as a
 * whole). Null for a skill the list does not cover.
 */
export function firstTechLevel(name: string, recorded?: unknown): number | null {
  if (recorded !== null && recorded !== undefined && recorded !== "" && Number.isFinite(Number(recorded))) {
    return Math.max(0, Math.floor(Number(recorded)));
  }
  const key = normalizeSkillName(name);
  const exact = FIRST_TL.get(key);
  if (exact !== undefined) return exact;
  const base = /^(.*?)\s*\(/.exec(key);
  if (base) {
    const whole = FIRST_TL.get(base[1] ?? "");
    if (whole !== undefined) return whole;
  }
  return null;
}

/**
 * Whether a skill exists at a tech level. True when the list says nothing about
 * it or no TL is known: availability is advice, and silence is never a warning.
 */
export function skillAvailableAt(name: string, techLevel: unknown, recorded?: unknown): boolean {
  const tl = Number(techLevel);
  if (techLevel === null || techLevel === undefined || techLevel === "" || !Number.isFinite(tl)) return true;
  const first = firstTechLevel(name, recorded);
  return first === null || tl >= first;
}

/** "TL7", or "TL^" for the beyond mark. */
export function firstTlLabel(tl: number): string {
  return tl >= TL_CARET ? "TL^" : `TL${tl}`;
}
