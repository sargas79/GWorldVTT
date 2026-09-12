/**
 * Shared types for the GURPS Lite rules engine.
 *
 * Everything in `src/rules` is pure and Foundry-free so it can be unit tested
 * headlessly. Nothing here may import a Foundry global.
 */

/** The four basic attributes (GURPS Lite p. 4). */
export type Attribute = "ST" | "DX" | "IQ" | "HT";

/**
 * Skill difficulty levels (GURPS Basic Set: Characters p. 168).
 *
 * "W" is a wildcard skill (p. 175): Very Hard, at three times the cost, and
 * standing in for a whole group of skills at once -- Gun! for every Guns
 * specialty, Sword! for every blade.
 */
export type Difficulty = "E" | "A" | "H" | "VH" | "W";

/**
 * Attributes a skill can be based on.
 *
 * GURPS Lite uses only the four basic attributes; the Basic Set adds skills
 * based on the secondary characteristics Will and Perception.
 */
export type SkillAttribute = Attribute | "Will" | "Per";

/**
 * Damage type abbreviations (GURPS Basic Set: Campaigns p. 379).
 * Wounding modifiers are applied per {@link WOUNDING_MODIFIERS}.
 */
export const DAMAGE_TYPES = [
  "burn",
  "cor",
  "cr",
  "cut",
  "fat",
  "imp",
  "pi-",
  "pi",
  "pi+",
  "pi++",
  "tox",
] as const;

export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Body postures (GURPS Lite p. 25, Posture Table). */
export type Posture = "standing" | "crouching" | "kneeling" | "crawling" | "sitting" | "lying";

// Maneuvers and their options live in `maneuvers.ts`, which carries the full
// Basic Set set (Evaluate, Feint, Wait) plus what each one permits.

/** The three active defenses (GURPS Lite p. 28). */
export type DefenseKind = "dodge" | "parry" | "block";

/** Encumbrance levels 0-4 (GURPS Lite p. 22). */
export type EncumbranceLevel = 0 | 1 | 2 | 3 | 4;

/** A "dice+adds" damage expression, e.g. `2d+1` is `{ dice: 2, adds: 1 }`. */
export interface DiceAdds {
  dice: number;
  adds: number;
  /**
   * A multiplier on the rolled total, as in "6dx10" -- the notation heavy
   * weapons and large explosives are written in. Absent or 1 for the great
   * majority, which are not multiplied at all.
   */
  multiplier?: number;
}

/** The four basic attributes as recorded on a character sheet. */
export interface Attributes {
  ST: number;
  DX: number;
  IQ: number;
  HT: number;
}
