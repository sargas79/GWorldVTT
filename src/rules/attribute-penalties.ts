/**
 * Attributes knocked down for a while (GURPS Basic Set: Campaigns p. 421).
 *
 * "Shock, afflictions, and many other things can temporarily lower your
 * attributes." What makes this worth its own module is how carefully the rule
 * fences off what a lowered attribute does *not* touch: a temporary penalty is
 * not the same thing as a lower attribute, and treating it as one would quietly
 * change hit points, Basic Speed and every active defense.
 */

import type { Attribute, SkillAttribute } from "./types.js";

/** A set of temporary penalties, as negative numbers or zero. */
export type AttributePenalties = Partial<Record<Attribute, number>>;

/** What a set of penalties actually changes. */
export interface PenaltyEffects {
  /** Applied to the damage of muscle-powered attacks. */
  strength: number;
  /** Applied to DX-based skills, but never to active defenses. */
  dexterity: number;
  /** Applied to IQ-based skills, and to Will and Per with them. */
  intelligence: number;
  /** Applied to HT-based skills, but never to resistance rolls. */
  health: number;
  /** Applied to Will, which follows IQ down. */
  will: number;
  /** Applied to Per, which follows IQ down too. */
  perception: number;
}

/** A penalty as a number at or below zero, whichever way it was written. */
function asPenalty(value: number | undefined): number {
  if (!value) return 0;
  return -Math.abs(value);
}

/**
 * What a set of temporary attribute penalties comes to (p. 421).
 *
 * "IQ penalties apply equally to Will and Per. However, there are no other
 * effects on secondary characteristics; for instance, ST, DX, and HT reductions
 * do not affect HP, Basic Speed, Basic Move, or FP."
 */
export function penaltyEffects(penalties: AttributePenalties): PenaltyEffects {
  const iq = asPenalty(penalties.IQ);

  return {
    strength: asPenalty(penalties.ST),
    dexterity: asPenalty(penalties.DX),
    intelligence: iq,
    health: asPenalty(penalties.HT),
    will: iq,
    perception: iq,
  };
}

/** What kind of roll is being made, which decides whether a penalty applies. */
export type RollAgainst =
  /** An ordinary skill roll, or a roll against the attribute itself. */
  | "skill"
  /** Block, Dodge or Parry. */
  | "activeDefense"
  /** A HT or Will roll to resist something. */
  | "resistance"
  /** A Fright Check. */
  | "frightCheck";

/**
 * Whether an attribute penalty touches this roll (p. 421).
 *
 * "Defensive reactions that don't require a maneuver to perform -- active
 * defenses, resistance rolls, Fright Checks, etc. -- never suffer penalties for
 * attribute reductions. For instance, -2 to DX would not affect Block, Dodge,
 * or Parry."
 *
 * This is the exception that makes the whole rule survivable: a character at
 * -5 DX can still defend himself.
 */
export function appliesTo(kind: RollAgainst): boolean {
  return kind === "skill";
}

/**
 * The penalty to one roll, given what it is based on and what kind it is
 * (p. 421).
 *
 * "An attribute penalty always reduces skills governed by the lowered attribute
 * by a like amount. For example, -2 to IQ would give -2 to all IQ-based skills
 * (and to all Per- and Will-based skills, since IQ reductions lower Per and
 * Will)."
 */
export function penaltyForRoll(options: {
  penalties: AttributePenalties;
  /** What the roll is based on: an attribute, or Will or Per. */
  basedOn: SkillAttribute;
  kind: RollAgainst;
}): number {
  if (!appliesTo(options.kind)) return 0;

  const effects = penaltyEffects(options.penalties);
  switch (options.basedOn) {
    case "ST":
      return effects.strength;
    case "DX":
      return effects.dexterity;
    case "IQ":
      return effects.intelligence;
    case "HT":
      return effects.health;
    case "Will":
      return effects.will;
    case "Per":
      return effects.perception;
  }
}

/**
 * Whether a temporary penalty changes a secondary characteristic (p. 421).
 *
 * It does not, with the single exception of IQ dragging Will and Per with it.
 * Written out as a function because the tempting thing to do -- recompute the
 * secondaries from the lowered attributes -- is exactly what the rule forbids.
 */
export function affectsSecondary(characteristic: string): boolean {
  return characteristic === "will" || characteristic === "per";
}

/**
 * The damage a character does with a lowered ST (p. 421).
 *
 * "ST reductions affect the damage you inflict with muscle-powered weapons" --
 * and nothing else, so this returns the ST to look up on the Damage Table
 * rather than a new ST score.
 */
export function strengthForDamage(options: {
  strength: number;
  penalties: AttributePenalties;
}): number {
  return Math.max(0, options.strength + asPenalty(options.penalties.ST));
}
