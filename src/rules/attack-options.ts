/**
 * Ways of attacking that trade one thing for another
 * (GURPS Basic Set: Campaigns pp. 365, 368-371).
 *
 * Each of these is a choice made before the attack roll: accept a penalty to
 * hit in exchange for something else. They are separate from the maneuver, and
 * several can be combined with it.
 */

import { penalty } from "./modifiers.js";

/** Rapid Strike: two attacks in the time of one, both at -6 (p. 370). */
export const RAPID_STRIKE_PENALTY = -6;

/** The floor a Deceptive Attack may not take your effective skill below. */
export const DECEPTIVE_SKILL_FLOOR = 10;

export interface DeceptiveAttack {
  /** Penalty to the attacker's own skill, zero or negative. */
  attackPenalty: number;
  /** Penalty to the defender's active defenses, zero or negative. */
  defensePenalty: number;
  /** The attacker's skill after the trade. */
  effectiveSkill: number;
}

/**
 * The most deception a given skill can buy (p. 369).
 *
 * "For every -2 you accept to your own skill, your foe suffers a -1 penalty on
 * his active defenses. You may not reduce your final effective skill below 10."
 * So the trade is limited by how far above 10 the attacker is, which is what
 * makes it a skilled fighter's option.
 */
export function maxDeception(effectiveSkill: number): number {
  return Math.max(0, Math.floor((effectiveSkill - DECEPTIVE_SKILL_FLOOR) / 2));
}

/**
 * A Deceptive Attack at a chosen level, clamped to what the skill can afford.
 *
 * `levels` is how many points of defense penalty are wanted; each costs two
 * points of skill.
 */
export function deceptiveAttack(effectiveSkill: number, levels: number): DeceptiveAttack {
  const taken = Math.max(0, Math.min(Math.floor(levels), maxDeception(effectiveSkill)));
  return {
    attackPenalty: penalty(2 * taken),
    defensePenalty: penalty(taken),
    effectiveSkill: effectiveSkill - 2 * taken,
  };
}

/** Dice of damage, as the damage model spells them. */
export interface SlamDamage {
  dice: number;
  modifier: number;
}

/**
 * The damage a slam inflicts, on both parties (p. 371).
 *
 * "you and your foe each inflict dice of crushing damage on the other equal to
 * (HP x velocity)/100." Velocity is normally the yards moved this turn; in a
 * head-on collision it is the relative velocity, which is the caller's to work
 * out.
 *
 * Below a full die the book gives three explicit steps rather than rounding,
 * because a fraction of a die still hurts: up to 0.25 is 1d-3, up to 0.5 is
 * 1d-2, anything more is 1d-1. At a die or more, halves round up.
 */
export function slamDamage(hitPoints: number, velocityYards: number): SlamDamage {
  const raw = (Math.max(0, hitPoints) * Math.max(0, velocityYards)) / 100;

  if (raw < 1) {
    if (raw <= 0.25) return { dice: 1, modifier: -3 };
    if (raw <= 0.5) return { dice: 1, modifier: -2 };
    return { dice: 1, modifier: -1 };
  }

  const whole = Math.floor(raw);
  return { dice: raw - whole >= 0.5 ? whole + 1 : whole, modifier: 0 };
}

/** Who ends up on the ground after a slam. */
export type SlamOutcome =
  | "attackerKnocksDown"
  | "attackerFellInstead"
  | "defenderRollsToStay"
  | "nothing";

/**
 * What a slam's two damage rolls mean (p. 371).
 *
 * "If your damage roll equals or exceeds that of your foe, he must make a DX
 * roll or fall down. You knock him down automatically if you roll twice his
 * damage or more. If he rolls twice your damage or more, though, you fall down
 * instead!"
 *
 * The two automatic cases can both be true only when both rolls are zero, and
 * zero damage knocks nobody over, so that is `nothing`.
 */
export function slamOutcome(attackerDamage: number, defenderDamage: number): SlamOutcome {
  if (attackerDamage <= 0 && defenderDamage <= 0) return "nothing";
  if (defenderDamage >= attackerDamage * 2 && defenderDamage > 0) return "attackerFellInstead";
  if (attackerDamage >= defenderDamage * 2 && attackerDamage > 0) return "attackerKnocksDown";
  if (attackerDamage >= defenderDamage) return "defenderRollsToStay";
  return "nothing";
}

/**
 * The modifier to your DX in the Quick Contest to evade a foe (p. 368).
 *
 * Only the situations the book lists are modified. A crouching or sitting foe
 * is not among them, and inventing a figure for those would be guessing at a
 * rule rather than applying one.
 */
export function evadeModifier(options: {
  /** The posture of the foe being evaded. */
  foePosture?: string;
  /** Which way you come at them: their front, side, or back. */
  approach?: "front" | "side" | "back";
}): number {
  let modifier = 0;

  switch (options.foePosture) {
    case "standing":
      modifier -= 5;
      break;
    case "kneeling":
      modifier -= 2;
      break;
    case "lying":
      modifier += 5;
      break;
    default:
      break;
  }

  if (options.approach === "side") modifier += 2;
  else if (options.approach === "back") modifier += 5;

  return modifier;
}

/**
 * The penalty a ranged weapon's Bulk imposes, which depends on why it applies.
 *
 * On a Move and Attack it is "-2 or -Bulk of weapon, whichever is worse"
 * (p. 365). In close combat it is the Bulk itself, and the speed/range penalty
 * is dropped instead (p. 391).
 *
 * Bulk is recorded as a negative number, which is the penalty; "whichever is
 * worse" is therefore the smaller of the two.
 */
export function bulkPenalty(bulk: number, situation: "moveAndAttack" | "closeCombat"): number {
  const rating = Math.min(0, bulk);
  return situation === "closeCombat" ? rating : Math.min(-2, rating);
}

/**
 * The penalty for watching an area with a ready ranged weapon
 * (GURPS Basic Set: Campaigns p. 390).
 *
 * "The larger the area you have to watch, the greater the penalty when you
 * attack." Watching one hex costs nothing; watching eleven or more costs -5.
 */
const OPPORTUNITY_FIRE: ReadonlyArray<{ upTo: number; penalty: number }> = [
  { upTo: 1, penalty: 0 },
  { upTo: 2, penalty: -1 },
  { upTo: 4, penalty: -2 },
  { upTo: 6, penalty: -3 },
  { upTo: 10, penalty: -4 },
];

/** Watching a single straight line rather than an area is a flat -2. */
export const OPPORTUNITY_LINE_PENALTY = -2;

export function opportunityFirePenalty(hexesWatched: number): number {
  const hexes = Math.max(1, Math.floor(hexesWatched));
  for (const row of OPPORTUNITY_FIRE) {
    if (hexes <= row.upTo) return row.penalty;
  }
  return -5;
}

/**
 * Whether someone on opportunity fire may also be aiming.
 *
 * "You cannot claim any of the bonuses listed for the Aim maneuver. Exception:
 * If you watch a single hex (only), you can Aim and Wait." Watching anything
 * wider than one hex means your attention is moving, and Accuracy is what
 * having it still buys.
 */
export function canAimWhileWatching(hexesWatched: number): boolean {
  return Math.floor(hexesWatched) === 1;
}

/** What a two-handed flurry costs each hand (Campaigns p. 417). */
export interface DualWeaponAttack {
  /** The modifier to the roll with the better hand. */
  primary: number;
  /** The modifier to the roll with the other one. */
  offHand: number;
  /** What the target's defenses suffer if both attacks come at them. */
  defensePenalty: number;
}

/**
 * Striking with both hands at once (Campaigns p. 417).
 *
 * "Each attack is at -4 to hit, but you can learn the Dual-Weapon Attack
 * technique to reduce this penalty. You have an extra -4 (total -8) with your
 * 'off' hand, unless you have Ambidexterity or learn Off-Hand Weapon Training."
 *
 * The technique and the training buy the two penalties back separately, which
 * is why they are separate arguments rather than one bonus.
 */
export function dualWeaponAttack(options: {
  /** Levels bought in the Dual-Weapon Attack technique, up to 4. */
  technique?: number;
  /** True for Ambidexterity or full Off-Hand Weapon Training. */
  ambidextrous?: boolean;
  /** Levels of Off-Hand Weapon Training, up to 4, for somebody who is not. */
  offHandTraining?: number;
  /** True when both attacks are aimed at the same foe. */
  sameTarget?: boolean;
}): DualWeaponAttack {
  const bought = Math.max(0, Math.min(4, Math.floor(options.technique ?? 0)));
  const primary = penalty(4 - bought);

  const offHandTax = options.ambidextrous
    ? 0
    : Math.max(0, 4 - Math.max(0, Math.min(4, Math.floor(options.offHandTraining ?? 0))));

  return {
    primary,
    offHand: penalty(4 - bought + offHandTax),
    // "If you aim both attacks at a single opponent, he defends at -1 against
    // them, as his attention is divided!"
    defensePenalty: options.sameTarget ? penalty(1) : 0,
  };
}
