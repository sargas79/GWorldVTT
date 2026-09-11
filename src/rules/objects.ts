/**
 * Hitting things that were never alive (GURPS Basic Set: Campaigns pp. 483-485).
 *
 * "Handle attacks on artifacts just like attacks on living beings", with a
 * handful of exceptions -- which is why this is a short module rather than a
 * second damage pipeline. What an object needs is a DR, a HT and a number of
 * hit points, and the book gives all three from its weight and what it is made
 * of.
 *
 * Reached today by striking at a weapon to break it, and by anything a GM
 * decides to let the players hit.
 */

/** What an artifact is made of, which decides how damage treats it. */
export type ObjectKind =
  /** Complex machines: electronics, firearms, vehicles. */
  | "unliving"
  /** Solid things: furniture, swords, doors. */
  | "homogenous"
  /** Nets, mattresses, things with nothing solid in them. */
  | "diffuse";

/** Typical DR by what a thing is made of (p. 483). */
export const TYPICAL_DR: Readonly<Record<string, number>> = {
  /** "Wooden or plastic tools, gadgets, furniture, etc. usually have DR 2." */
  wood: 2,
  plastic: 2,
  /** "Small metal, metal-wood, or composite objects, like guns and axes." */
  composite: 4,
  /** "Solid-metal melee weapons have DR 6." */
  solidMetal: 6,
  /** "a quarter-inch of mild steel is DR 14" */
  steelPlate: 14,
};

/** Typical HT: machines 10, solid things 12 (p. 483). */
export function objectHealth(kind: ObjectKind, quality = 0): number {
  const base = kind === "homogenous" ? 12 : 10;
  return base + Math.round(quality);
}

/**
 * An object's hit points from its weight (p. 483).
 *
 * "HP are equal to 4 x (cube root of weight in lbs.) for complex, Unliving
 * objects, and 8 x (cube root of weight in lbs.) for solid, Homogenous ones
 * (round up)."
 */
export function objectHitPoints(weightLbs: number, kind: ObjectKind): number {
  const weight = Math.max(0, weightLbs);
  if (weight === 0) return 0;

  const multiplier = kind === "unliving" ? 4 : 8;
  return Math.ceil(multiplier * Math.cbrt(weight));
}

/** What state an object is in, given the damage it has taken. */
export type ObjectState =
  | "sound"
  /** Below a third: "may suffer halved (or otherwise reduced) effectiveness". */
  | "damaged"
  /** At or below zero: a HT roll each second it is used, or it breaks. */
  | "failing"
  /** At -1xHP: a HT roll to avoid being destroyed outright. */
  | "breaking"
  /** At -5xHP: destroyed, no roll. */
  | "destroyed";

/**
 * What has become of an object (p. 484).
 *
 * The thresholds are the ones living things use -- a third, zero, -1xHP,
 * -5xHP -- which is the point of "just like attacks on living beings". What
 * differs is what happens at each: an object does not bleed or fall
 * unconscious, it stops working.
 */
export function objectState(currentHp: number, maxHp: number): ObjectState {
  if (maxHp <= 0) return "sound";

  if (currentHp <= -5 * maxHp) return "destroyed";
  if (currentHp <= -maxHp) return "breaking";
  if (currentHp <= 0) return "failing";
  if (currentHp < maxHp / 3) return "damaged";
  return "sound";
}

/**
 * Whether an object at this state must roll HT to keep working (p. 484).
 *
 * "Roll vs. the artifact's HT each second while it is under stress (but not if
 * it isn't being used)" -- so a sword in a scabbard rolls nothing.
 */
export function rollsToKeepWorking(state: ObjectState): boolean {
  return state === "failing" || state === "breaking";
}
