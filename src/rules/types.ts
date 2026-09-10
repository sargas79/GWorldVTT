/**
 * Shared types for the GURPS Lite rules engine.
 *
 * Everything in `src/rules` is pure and Foundry-free so it can be unit tested
 * headlessly. Nothing here may import a Foundry global.
 */

/** The four basic attributes (GURPS Lite p. 4). */
export type Attribute = "ST" | "DX" | "IQ" | "HT";

/** Skill difficulty levels (GURPS Lite p. 12). */
export type Difficulty = "E" | "A" | "H";

/**
 * Damage type abbreviations (GURPS Basic Set: Campaigns p. 379).
 * Wounding modifiers are applied per {@link WOUNDING_MODIFIERS}.
 */
export type DamageType =
  | "burn"
  | "cor"
  | "cr"
  | "cut"
  | "fat"
  | "imp"
  | "pi-"
  | "pi"
  | "pi+"
  | "pi++"
  | "tox";

/** Body postures (GURPS Lite p. 25, Posture Table). */
export type Posture = "standing" | "crouching" | "kneeling" | "crawling" | "sitting" | "lying";

/** Combat maneuvers (GURPS Lite pp. 25-26). */
export type Maneuver =
  | "doNothing"
  | "move"
  | "changePosture"
  | "aim"
  | "attack"
  | "allOutAttack"
  | "moveAndAttack"
  | "allOutDefense"
  | "concentrate"
  | "ready";

/** All-Out Attack options (GURPS Lite p. 26). */
export type AllOutAttackOption = "determined" | "double" | "strong" | "ranged";

/** All-Out Defense options (GURPS Lite p. 26). */
export type AllOutDefenseOption = "increased" | "double";

/** The three active defenses (GURPS Lite p. 28). */
export type DefenseKind = "dodge" | "parry" | "block";

/** Encumbrance levels 0-4 (GURPS Lite p. 22). */
export type EncumbranceLevel = 0 | 1 | 2 | 3 | 4;

/** A "dice+adds" damage expression, e.g. `2d+1` is `{ dice: 2, adds: 1 }`. */
export interface DiceAdds {
  dice: number;
  adds: number;
}

/** The four basic attributes as recorded on a character sheet. */
export interface Attributes {
  ST: number;
  DX: number;
  IQ: number;
  HT: number;
}
