/**
 * Injury Tolerance (GURPS Basic Set: Characters pp. 60-61).
 *
 * A body that is not built like a person's is hurt differently. The
 * advantage comes in kinds, and each kind says which parts a blow can find
 * and what piercing and impaling weapons are worth against what it finds:
 *
 * - **No Blood**: no bleeding.
 * - **No Brain**: a blow to the skull or eye is a blow to the face.
 * - **No Eyes**: there are none to hit; an eye hit is a skull hit.
 * - **No Head**: no head to hit; a blow there is a blow to the torso.
 * - **No Neck**: likewise the neck.
 * - **No Vitals**: likewise the vitals.
 * - **Unliving**: a machine or a golem. Impaling and piercing do less:
 *   imp and pi++ x1, pi+ x1/2, pi x1/3, pi- x1/5.
 * - **Homogenous**: solid all through, with no vitals, brain, eyes or blood.
 *   imp and pi++ x1/2, pi+ x1/3, pi x1/5, pi- x1/10.
 * - **Diffuse**: a swarm or a cloud, with none of those either. Impaling and
 *   piercing do at most 1 point a hit, and anything else at most 2.
 * - **Damage Reduction** (Basic Set Revised p. 325): after DR and wounding,
 *   the injury is divided by 2 to 100 and more, rounded up, with a least
 *   injury of 1 HP -- unless the trait is Cosmic, Rounds down.
 */

import type { HitLocation } from "./hit-locations.js";
import { largeTargetWounding } from "./revised-ranged.js";
import type { DamageType } from "./types.js";

export interface InjuryTolerance {
  unliving: boolean;
  homogenous: boolean;
  diffuse: boolean;
  noBlood: boolean;
  noBrain: boolean;
  noEyes: boolean;
  noHead: boolean;
  noNeck: boolean;
  noVitals: boolean;
  /** Invertebrate (Characters p. 66): no spine or pelvis to hit (Basic Set Revised p. 566). */
  invertebrate: boolean;
  /** No Legs: no joints or veins and arteries in the legs (p. 566). */
  noLegs: boolean;
  /** No Manipulators: none in any limb (p. 566). */
  noManipulators: boolean;
  /** The divisor of Damage Reduction, or 0 for a body without it. */
  damageDivisor: number;
  /** Cosmic, Rounds down: the divided injury rounds down and may reach 0. */
  roundsDown: boolean;
  /**
   * The target's SM, set only while the large-target wounding table is in
   * play (Basic Set Revised p. 577): Unliving and Homogenous bodies then take
   * piercing and impaling by size, not by the fixed figures.
   */
  largeTargetSm?: number;
}

export function noInjuryTolerance(): InjuryTolerance {
  return {
    unliving: false,
    homogenous: false,
    diffuse: false,
    noBlood: false,
    noBrain: false,
    noEyes: false,
    noHead: false,
    noNeck: false,
    noVitals: false,
    invertebrate: false,
    noLegs: false,
    noManipulators: false,
    damageDivisor: 0,
    roundsDown: false,
  };
}

/** The kinds, by the word the book and GCA use for each. */
const KINDS: ReadonlyArray<[RegExp, Exclude<keyof InjuryTolerance, "damageDivisor" | "roundsDown" | "largeTargetSm">]> = [
  [/\bunliving\b/i, "unliving"],
  [/\bhomogen(?:e)?ous\b/i, "homogenous"],
  [/\bdiffuse\b/i, "diffuse"],
  [/\bno blood\b/i, "noBlood"],
  [/\bno brain\b/i, "noBrain"],
  [/\bno eyes?\b/i, "noEyes"],
  [/\bno head\b/i, "noHead"],
  [/\bno neck\b/i, "noNeck"],
  [/\bno vitals\b/i, "noVitals"],
];

const DAMAGE_REDUCTION = /damage reduction[^\d]{0,8}(\d+)/i;
const COSMIC_ROUNDS_DOWN = /cosmic.*rounds? down/i;

/**
 * The injury a blow does to a body with Damage Reduction, once DR and the
 * wounding modifier have been applied (p. 325). Rounded up with a least
 * injury of 1 HP, or rounded down and possibly none for Cosmic, Rounds down.
 * A body without it, or an injury of 0, is left alone.
 */
export function reducedInjury(injury: number, tolerance: InjuryTolerance): number {
  const divisor = tolerance.damageDivisor;
  if (divisor <= 1 || injury <= 0) return injury;
  return tolerance.roundsDown ? Math.floor(injury / divisor) : Math.max(1, Math.ceil(injury / divisor));
}

/**
 * Reads the kinds named in a trait's name and its modifiers.
 *
 * The compendium carries one "Injury Tolerance" and leaves the kind to a
 * modifier, so "Injury Tolerance" with a modifier called "Homogenous" and a
 * trait named "Injury Tolerance (Homogenous)" mean the same thing.
 *
 * Homogenous and Diffuse bodies have no vitals, brain, eyes or blood, so
 * those kinds imply the four.
 */
export function injuryToleranceFrom(
  names: readonly string[],
  into: InjuryTolerance = noInjuryTolerance(),
): InjuryTolerance {
  const found = { ...into };
  for (const name of names) {
    for (const [pattern, kind] of KINDS) if (pattern.test(name)) found[kind] = true;
    // "Damage Reduction 4", "Damage Reduction /4" or "Damage Reduction (DR /4)":
    // the divisor is the number after the words; the largest of several holds.
    const reduction = DAMAGE_REDUCTION.exec(name);
    if (reduction) found.damageDivisor = Math.max(found.damageDivisor, Number(reduction[1]));
    if (COSMIC_ROUNDS_DOWN.test(name)) found.roundsDown = true;
  }
  if (found.homogenous || found.diffuse) {
    found.noBlood = true;
    found.noBrain = true;
    found.noEyes = true;
    found.noVitals = true;
  }
  return found;
}

/** Whether anything about this tolerance changes how a blow lands. */
export function hasInjuryTolerance(tolerance: InjuryTolerance): boolean {
  return Object.entries(tolerance).some(([key, value]) => key !== "largeTargetSm" && Boolean(value));
}

/**
 * Where a blow actually lands on such a body.
 *
 * A head that is not there is a torso; a skull with no brain in it is a face;
 * an eye that is not there is the skull behind it. Applied in that order, so
 * No Head takes the eye all the way to the torso.
 */
export function toleratedLocation(location: HitLocation, tolerance: InjuryTolerance): HitLocation {
  let where = location;
  if (tolerance.noHead && (where === "skull" || where === "eye" || where === "face")) return "torso";
  if (tolerance.noEyes && where === "eye") where = "skull";
  if (tolerance.noBrain && (where === "skull" || where === "eye")) where = "face";
  if (tolerance.noNeck && where === "neck") where = "torso";
  if (tolerance.noVitals && where === "vitals") where = "torso";
  return where;
}

/** Wounding modifiers for a body that is not flesh, where they differ (p. 61). */
const UNLIVING: Partial<Record<DamageType, number>> = {
  imp: 1, "pi++": 1, "pi+": 0.5, pi: 1 / 3, "pi-": 0.2,
};
const HOMOGENOUS: Partial<Record<DamageType, number>> = {
  imp: 0.5, "pi++": 0.5, "pi+": 1 / 3, pi: 0.2, "pi-": 0.1,
};

/**
 * The wounding modifier a damage type gets against this body, or null where
 * the tolerance says nothing and the ordinary figure stands.
 *
 * Diffuse is not a modifier but a cap, handled by {@link diffuseInjuryCap}.
 */
export function toleratedWoundingModifier(
  type: DamageType,
  tolerance: InjuryTolerance,
): number | null {
  if (typeof tolerance.largeTargetSm === "number" && (tolerance.homogenous || tolerance.unliving)) {
    return largeTargetWounding(type, tolerance.largeTargetSm, tolerance.homogenous);
  }
  if (tolerance.homogenous) return HOMOGENOUS[type] ?? null;
  if (tolerance.unliving) return UNLIVING[type] ?? null;
  return null;
}

/**
 * The most injury one hit can do to a Diffuse body: "impaling and piercing
 * attacks of any size do 1 point of injury; other attacks do no more than 2".
 * Null for a body that is not Diffuse.
 */
export function diffuseInjuryCap(type: DamageType, tolerance: InjuryTolerance): number | null {
  if (!tolerance.diffuse) return null;
  return type === "imp" || type.startsWith("pi") ? 1 : 2;
}
