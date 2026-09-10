/**
 * What the tactical rules need to know about a character, read off the actor.
 *
 * `src/rules/tactical.ts` asks plain questions -- can this defender see behind
 * them, which hand holds the weapon -- and this is where the answers are found
 * among the actor's traits and fields.
 */

import { shieldSide, type BodySide, type Handedness, type Vision } from "../rules/tactical.js";

/** Traits that change what a defender can do about an attack they cannot see. */
const PERIPHERAL = "peripheral vision";
const ALL_ROUND = "360° vision";
/**
 * Double-Jointed, or an Extra-Flexible arm, is what lets a fighter bring a
 * shield or a one-handed weapon round to the wrong side of their body.
 */
const FLEXIBLE = "double-jointed";

function hasTrait(actor: any, name: string): boolean {
  return [...(actor?.items ?? [])].some(
    (item: any) => item.type === "trait" && String(item.name).trim().toLowerCase() === name,
  );
}

export function visionOf(actor: any): Vision {
  return {
    peripheral: hasTrait(actor, PERIPHERAL),
    allRound: hasTrait(actor, ALL_ROUND),
    flexible: hasTrait(actor, FLEXIBLE),
  };
}

export function handednessOf(actor: any): Handedness {
  return { weaponSide: actor?.system?.handedness === "left" ? "left" : "right" };
}

/** The side a character's shield is on, which is the hand that is not the weapon's. */
export function shieldSideOf(actor: any): BodySide {
  return shieldSide(handednessOf(actor));
}
