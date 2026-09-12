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
 */

import type { HitLocation } from "./hit-locations.js";
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
  };
}

/** The kinds, by the word the book and GCA use for each. */
const KINDS: ReadonlyArray<[RegExp, keyof InjuryTolerance]> = [
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
  return Object.values(tolerance).some(Boolean);
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
