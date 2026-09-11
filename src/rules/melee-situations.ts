/**
 * Special melee rules (GURPS Basic Set: Campaigns pp. 400-402).
 *
 * Three things a fighter can do or suffer that are not covered by "roll against
 * your skill and hit them": going for the gaps in somebody's armour, going for
 * the weapon instead of the person, and fighting somebody standing on a table.
 */

import type { HitLocation } from "./hit-locations.js";
import type { DamageType } from "./types.js";

// ── chinks in armour (p. 400) ───────────────────────────────────────────────

/**
 * Whether this kind of damage can be aimed at a gap in armour (p. 400).
 *
 * "You may use a piercing, impaling, or tight-beam burning attack to target
 * joints or weak points" -- a sword swung at a mail hauberk is not going to
 * find the rings, however well aimed.
 */
export function canTargetChinks(type: DamageType, tightBeam = false): boolean {
  if (type === "burn") return tightBeam;
  return type === "imp" || type === "pi-" || type === "pi" || type === "pi+" || type === "pi++";
}

/**
 * The penalty for aiming at a chink (p. 400).
 *
 * "Roll at -8 to hit a chink in the foe's torso armor, or at -10 for any other
 * location... instead of using the usual hit location penalty." It replaces
 * that penalty rather than adding to it, which is the whole reason it is worth
 * doing against a well-protected head.
 */
export function chinkPenalty(location: HitLocation): number {
  return location === "torso" ? -8 : -10;
}

/**
 * DR after finding a chink (p. 400).
 *
 * "If you hit, halve DR. This is cumulative with any armor divisors." Halving
 * comes after the divisor, as it does for a critical hit.
 */
export function chinkDr(dr: number): number {
  return Math.floor(Math.max(0, dr) / 2);
}

// ── striking at a weapon (p. 401) ───────────────────────────────────────────

/**
 * The penalty for trying to knock a weapon away (p. 401).
 *
 * "You have an extra -2 to hit unless you use a fencing weapon (main-gauche,
 * rapier, saber, or smallsword)." This is on top of the penalty for hitting
 * the weapon itself, which is a hit location like any other.
 */
export function disarmPenalty(fencingWeapon: boolean): number {
  return fencingWeapon ? 0 : -2;
}

/** What each side brings to the contest that follows a successful strike. */
export function disarmContestModifier(options: {
  /** Jitte/Sai or Whip skill, which is worth +2 -- if you are using one. */
  jitteOrWhip?: boolean;
  /** The foe's two-handed grip, which is worth +2 to them. */
  foeTwoHanded?: boolean;
}): { attacker: number; defender: number } {
  return {
    attacker: options.jitteOrWhip ? 2 : 0,
    defender: options.foeTwoHanded ? 2 : 0,
  };
}

/** What a disarm attempt came to. */
export interface DisarmResult {
  /** True when the weapon left their hand and flew a yard. */
  disarmed: boolean;
  /** True when they kept it but it is no longer ready. */
  unready: boolean;
  /** True when the attacker dropped their own instead. */
  attackerDisarmed: boolean;
}

/**
 * Reads the Quick Contest that follows a strike at a weapon (p. 401).
 *
 * "If you win, you disarm your foe... If your foe wins or ties, he keeps his
 * weapon, but it will be unready unless he won by 3 or more. If you roll a
 * critical failure, you are the one disarmed!"
 */
export function disarmResult(options: {
  outcome: "first" | "second" | "tie";
  marginOfVictory: number;
  criticalFailure?: boolean;
}): DisarmResult {
  if (options.criticalFailure) {
    return { disarmed: false, unready: false, attackerDisarmed: true };
  }

  if (options.outcome === "first") {
    return { disarmed: true, unready: false, attackerDisarmed: false };
  }

  // A tie counts as the defender winning by nothing, so the weapon is unready.
  const heldWell = options.outcome === "second" && options.marginOfVictory >= 3;
  return { disarmed: false, unready: !heldWell, attackerDisarmed: false };
}

// ── fighting at different levels (p. 402) ───────────────────────────────────

/** What a vertical difference is worth to one of the two fighters. */
export interface LevelEffects {
  /** Modifier to hit the feet or legs, on top of the location penalty. */
  toHitLegs: number;
  /** Modifier to hit the head or neck, on top of the location penalty. */
  toHitHead: number;
  /** Modifier to every active defense. */
  defense: number;
  /** Locations this fighter cannot reach at all. */
  cannotReach: readonly string[];
}

export interface LevelDifference {
  /** True when the difference is too small to bother with. */
  negligible: boolean;
  higher: LevelEffects;
  lower: LevelEffects;
  /** True past six feet, where the book says combat is essentially impossible. */
  impossible: boolean;
}

const NOTHING: LevelEffects = { toHitLegs: 0, toHitHead: 0, defense: 0, cannotReach: [] };

/**
 * What a vertical difference does to a melee fight (p. 402).
 *
 * The bands are the book's, and they stack: each takes the one before it and
 * adds something. Above six feet "combat is impossible unless the fighters
 * adopt some strange position", which is the GM's to adjudicate.
 */
export function levelDifference(feet: number): LevelDifference {
  const gap = Math.max(0, feet);

  if (gap <= 1) {
    return { negligible: true, higher: NOTHING, lower: NOTHING, impossible: false };
  }

  // "the higher fighter has -2 to hit the feet or legs, and +1 to hit the head
  // ... The lower fighter has +2 to hit the feet or legs, and -2 to hit the head."
  const higher: LevelEffects = { toHitLegs: -2, toHitHead: 1, defense: 0, cannotReach: [] };
  const lower: LevelEffects = { toHitLegs: 2, toHitHead: -2, defense: 0, cannotReach: [] };

  if (gap <= 2) return { negligible: false, higher, lower, impossible: false };

  // From three feet the defenses start to move, a point per foot.
  const defence = gap <= 3 ? 1 : gap <= 4 ? 2 : 3;
  higher.defense = defence;
  lower.defense = -defence;

  if (gap <= 3) return { negligible: false, higher, lower, impossible: false };

  // "The upper fighter cannot strike at the lower fighter's feet or legs."
  higher.cannotReach = ["leg", "foot"];

  if (gap <= 4) return { negligible: false, higher, lower, impossible: false };

  // "The lower fighter cannot strike at the upper fighter's head."
  lower.cannotReach = ["skull", "face", "eye"];

  if (gap <= 5) return { negligible: false, higher, lower, impossible: false };

  // At six feet each can reach only one part of the other, and the aiming
  // bonuses stop applying: "Neither gets any special bonus or penalty to attack."
  return {
    negligible: false,
    higher: { toHitLegs: 0, toHitHead: 0, defense: 3, cannotReach: ["leg", "foot", "torso", "arm", "hand", "vitals", "groin"] },
    lower: { toHitLegs: 0, toHitHead: 0, defense: -3, cannotReach: ["skull", "face", "eye", "neck", "torso", "arm", "hand", "vitals"] },
    impossible: gap > 6,
  };
}
