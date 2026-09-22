/**
 * Tech-Level Modifiers and Familiarity (Characters pp. 168-169).
 *
 * A technological skill -- one the book marks "/TL" -- is learned at a
 * particular tech level, and works best with the equipment of that TL. Using
 * gear of another TL costs skill: an IQ-based skill by the table on p. 168,
 * steeply for gear more advanced than the skill and gently for older gear;
 * any other attribute's skill a flat -1 per TL of difference either way.
 *
 * Separately, a skill used to operate equipment takes -2 with an unfamiliar
 * type of item until the user has had eight hours of practice with it. Gear
 * from another TL is usually unfamiliar too, so both penalties apply to it.
 */

/** What an unfamiliar piece of equipment costs, where a skill says nothing else (p. 169). */
export const UNFAMILIAR_PENALTY = -2;

/** Hours of practice that make a new make or model familiar (p. 169). */
export const FAMILIARIZATION_HOURS = 8;

/** Familiarities at or past which the GM may roll to find a new item already familiar (p. 169). */
export const FAMILIARITIES_FOR_SIMILARITY_ROLL = 6;

/**
 * A tech level read from how the data writes one: "8", "TL8", "11^", 8.
 * Null for nothing usable -- blank, "^" alone, or text without a number --
 * so that gear without a stated TL is never penalised.
 */
export function parseTechLevel(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  const match = /^\s*(?:TL\s*)?(\d+)/i.exec(String(value ?? ""));
  return match ? Number(match[1]) : null;
}

/**
 * Whether a skill is technological: its name carries the "/TL" marker, or a
 * tech level has been written down for it.
 */
export function isTechnologicalSkill(name: string, techLevel?: unknown): boolean {
  if (/\/TL/i.test(String(name ?? ""))) return true;
  return parseTechLevel(techLevel) !== null;
}

/**
 * The tech level a technological skill was learned at: the one recorded for
 * it, else the one written into its name ("Guns/TL7 (Pistol)"), else the
 * character's own -- "You learn technological skills at your personal TL".
 */
export function skillTechLevel(name: string, techLevel: unknown, personalTechLevel: number): number {
  const recorded = parseTechLevel(techLevel);
  if (recorded !== null) return recorded;
  const inName = /\/TL(\d+)/i.exec(String(name ?? ""));
  if (inName) return Number(inName[1]);
  return Math.max(0, Math.floor(Number(personalTechLevel) || 0));
}

/**
 * The Tech-Level Modifiers table (p. 168): what using equipment of
 * `equipmentTechLevel` costs a skill learned at `skillTechLevel`.
 *
 * IQ-based skills: -5 per TL the gear is ahead (-5, -10, -15), impossible at
 * four or more; -1 for gear one TL behind, then -2 more for every further TL
 * (-3, -5, -7, ...). Skills on any other attribute: -1 per TL either way.
 * Returns null where the use is impossible.
 */
export function techLevelModifier(options: { skillTechLevel: number; equipmentTechLevel: number; iqBased: boolean }): number | null {
  const difference = Math.floor(options.equipmentTechLevel) - Math.floor(options.skillTechLevel);
  if (!Number.isFinite(difference) || difference === 0) return 0;
  if (!options.iqBased) return -Math.abs(difference);
  if (difference >= 4) return null;
  if (difference > 0) return -5 * difference;
  // One TL behind is -1, and each TL further back costs 2 more.
  return -(2 * Math.abs(difference) - 1);
}

/**
 * How a familiarity is written down, so that the same item matches however
 * it was typed: trimmed, spaces collapsed, lower case.
 */
export function familiarityKey(name: string): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether a list of familiarities includes `name`, compared as `familiarityKey` writes them. */
export function isFamiliar(familiarities: ReadonlyArray<string>, name: string): boolean {
  const key = familiarityKey(name);
  if (!key) return true;
  return familiarities.some((entry) => familiarityKey(entry) === key);
}

/** A list of familiarities with `name` added or taken out, as it was typed. */
export function toggleFamiliarity(familiarities: ReadonlyArray<string>, name: string): string[] {
  const key = familiarityKey(name);
  if (!key) return [...familiarities];
  const kept = familiarities.filter((entry) => familiarityKey(entry) !== key);
  return kept.length < familiarities.length ? kept : [...familiarities, String(name).trim()];
}

/** The unfamiliarity penalty for an item, or 0 for one the user is familiar with. */
export function familiarityModifier(familiarities: ReadonlyArray<string>, name: string): number {
  return isFamiliar(familiarities, name) ? 0 : UNFAMILIAR_PENALTY;
}

/** Familiarities a starting character may pick for a skill: two per point in it (p. 169). */
export function startingFamiliarities(points: number): number {
  return 2 * Math.max(0, Math.floor(Number(points) || 0));
}

/** Whether a character has enough familiarities with a skill for the GM's roll to find a new item familiar (p. 169). */
export function mayRollForFamiliarity(familiaritiesWithSkill: number): boolean {
  return familiaritiesWithSkill >= FAMILIARITIES_FOR_SIMILARITY_ROLL;
}

/** A tool carried for a skill: what its grade is worth, and its TL where it states one. */
export interface CarriedTool {
  quality: number;
  techLevel: number | null;
}

/**
 * The tool a skill is used with, of several carried for it: the one worth
 * most once its TL is weighed against the skill's, a tool the skill cannot
 * use at all being passed over. `skillTechLevel` null (a skill not marked
 * /TL) weighs no TL. Returns the grade's modifier and the TL line, or null
 * for no usable tool.
 */
export function bestTool(tools: ReadonlyArray<CarriedTool>, options: { skillTechLevel: number | null; iqBased: boolean }): { quality: number; techLevel: number } | null {
  let best: { quality: number; techLevel: number } | null = null;
  for (const tool of tools) {
    const techLevel = options.skillTechLevel === null || tool.techLevel === null
      ? 0
      : techLevelModifier({ skillTechLevel: options.skillTechLevel, equipmentTechLevel: tool.techLevel, iqBased: options.iqBased });
    if (techLevel === null) continue;
    if (best === null || tool.quality + techLevel > best.quality + best.techLevel) best = { quality: tool.quality, techLevel };
  }
  return best;
}
