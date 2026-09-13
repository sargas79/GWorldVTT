/**
 * Ritual Path Magic: the skills, and the reserve (GURPS Monster Hunters 1:
 * Champions pp. 24-25, 32-33, 36).
 *
 * "All magical rituals are cast using one of the nine IQ/Very Hard Path
 * skills." Thaumatology is the prerequisite for every one, and a Path "can
 * never exceed either the caster's Thaumatology skill or (12 + Magery
 * level)". Every Path also "defaults to Thaumatology-6", but "a defaulted Path
 * skill cannot exceed 12, regardless of how high the caster's Thaumatology
 * skill is" -- so an untrained caster with Thaumatology 18 and one with 30
 * cast alike, and points in a Path are only worth buying past 12, which only
 * Magery allows.
 *
 * Magery here is a ceiling and a store, not a bonus: it "does not add to spell
 * use or Thaumatology" (p. 24). Its store is the mana reserve, "Magery level x
 * 3" points of energy a caster can draw on quickly, refilled by Path of Magic
 * and assumed full after any downtime (p. 36).
 */

/** The nine Paths, by their common names (pp. 32-33). */
export const PATHS = [
  "Body", "Chance", "Crossroads", "Energy", "Magic", "Matter", "Mind", "Spirit", "Undead",
] as const;
export type RitualPath = (typeof PATHS)[number];

/** The skill a Path is learned as: "Path of Body". */
export function pathSkillName(path: RitualPath): string {
  return `Path of ${path}`;
}

/** Which Path a skill is, or null. */
export function pathOfSkill(skillName: string): RitualPath | null {
  const match = /^path of (\w+)$/i.exec(skillName.trim());
  if (!match) return null;
  return PATHS.find((p) => p.toLowerCase() === match[1]!.toLowerCase()) ?? null;
}

/** The highest a defaulted Path may be (p. 33). */
export const DEFAULTED_PATH_CAP = 12;

/**
 * The most any Path may be for this caster: the lower of Thaumatology and
 * 12 + Magery. Null for somebody with no Thaumatology, who is no caster at
 * all. A caster without Magery is capped at 12 as if it were Magery 0; what
 * they lack is paid for at the roll instead (p. 36).
 */
export function pathCeiling(options: { thaumatology: number | null; magery: number | null }): number | null {
  if (options.thaumatology === null) return null;
  return Math.min(options.thaumatology, 12 + Math.max(0, options.magery ?? 0));
}

/** One Path as a caster has it. */
export interface PathLevel {
  /** What rolls for it are against, or null where the caster has no Thaumatology. */
  level: number | null;
  /** True where the level is the default rather than points in the Path. */
  atDefault: boolean;
  /** True where the ceiling held the level down. */
  capped: boolean;
}

/**
 * A Path's level: the better of points spent in it and Thaumatology-6
 * (itself no more than 12), then held to the ceiling.
 */
export function pathLevel(options: {
  /** The level the points in the Path buy, or null for none. */
  trained: number | null;
  thaumatology: number | null;
  magery: number | null;
}): PathLevel {
  const ceiling = pathCeiling(options);
  if (ceiling === null) return { level: null, atDefault: true, capped: false };
  const defaulted = Math.min(options.thaumatology! - 6, DEFAULTED_PATH_CAP);
  const best = options.trained === null ? defaulted : Math.max(options.trained, defaulted);
  return {
    level: Math.min(best, ceiling),
    atDefault: options.trained === null || defaulted > options.trained,
    capped: best > ceiling,
  };
}

/** "(Magery level x 3) points of energy" (p. 36); nothing without Magery. */
export function manaReserveMax(magery: number | null): number {
  return magery === null ? 0 : Math.max(0, magery) * 3;
}

/** Whether a trait is Ritual Adept (p. 25). */
export function isRitualAdept(traitName: string): boolean {
  return /^ritual adept\b/i.test(traitName.trim());
}
