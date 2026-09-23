/**
 * Fragile (GURPS Basic Set: Characters pp. 136-137).
 *
 * "You are susceptible to wounding effects that do not apply to normal
 * humans. Attacks do not injure you any more than usual ... but enough
 * penetrating damage can trigger results more catastrophic than stunning,
 * unconsciousness, or bleeding." Five of them: Brittle, Combustible,
 * Explosive, Flammable and Unnatural.
 *
 * A character has them as a disadvantage. A vehicle has three of them as the
 * codes beside its HT -- "Fragile vehicles have an additional code: 'c' for
 * Combustible, 'f' for Flammable, or 'x' for Explosive" (Campaigns p. 463) --
 * and they mean the same thing on either.
 */

import type { DiceAdds } from "./types.js";

export type FragileKind = "brittle" | "combustible" | "explosive" | "flammable" | "unnatural";

export const FRAGILE_KINDS: readonly FragileKind[] = ["brittle", "combustible", "explosive", "flammable", "unnatural"];

/** The kinds a vehicle's HT codes stand for (Campaigns p. 463). */
const VEHICLE_CODES: Readonly<Record<string, FragileKind>> = { c: "combustible", f: "flammable", x: "explosive" };

/** The kinds of Fragile a vehicle's HT codes name: "fx" is Flammable and Explosive. */
export function fragileFromVehicleCodes(codes: string | readonly string[]): FragileKind[] {
  const letters = typeof codes === "string" ? [...codes] : codes;
  return FRAGILE_KINDS.filter((kind) => letters.some((code) => VEHICLE_CODES[code] === kind));
}

/**
 * The kinds of Fragile named in a trait's name, specialty or modifiers:
 * "Fragile (Combustible)", or "Fragile" with Combustible as its specialty.
 */
export function fragileKindsIn(texts: readonly string[]): FragileKind[] {
  const text = texts.join(" ").toLowerCase();
  return FRAGILE_KINDS.filter((kind) => new RegExp(`\\b${kind}\\b`).test(text));
}

/** Both lists' kinds, once each, in the book's order. */
export function unionOfFragile(a: readonly FragileKind[], b: readonly FragileKind[]): FragileKind[] {
  return FRAGILE_KINDS.filter((kind) => a.includes(kind) || b.includes(kind));
}

// ── catching fire (Combustible, Flammable) ──────────────────────────────

/** What a blow does to something that burns: nothing, a roll, or sets it alight. */
export type FragileIgnition =
  | { kind: "none" }
  | { kind: "roll"; modifier: number }
  | { kind: "alight" };

/** "You catch fire automatically if such an attack inflicts 10+ HP of injury." */
export const COMBUSTIBLE_ALIGHT_AT = 10;

/**
 * Whether a blow sets a Combustible or Flammable body alight (p. 136).
 *
 * Combustible: "Make a HT roll to avoid catching fire whenever you receive a
 * major wound from a burning or explosive attack. You catch fire
 * automatically if such an attack inflicts 10+ HP of injury."
 *
 * Flammable: "Make a HT roll to avoid catching fire ... after a major wound
 * from any kind of attack. Roll at -3 for a burning or explosive attack, -3
 * if the attack struck the vitals, and -6 if both." And for both: "any
 * burning or explosive attack that inflicts either a major wound or 10+ HP of
 * injury automatically sets you ablaze."
 */
export function fragileIgnition(options: {
  kinds: readonly FragileKind[];
  injury: number;
  majorWound: boolean;
  /** A burning attack, or an explosion. */
  burningOrExplosive: boolean;
  /** Struck the vitals (a vehicle's vital area counts). */
  vitals?: boolean;
}): FragileIgnition {
  const combustible = options.kinds.includes("combustible");
  const flammable = options.kinds.includes("flammable");
  const injury = Math.max(0, Math.floor(Number(options.injury) || 0));
  const fire = options.burningOrExplosive;

  if (fire && combustible) {
    if (injury >= COMBUSTIBLE_ALIGHT_AT) return { kind: "alight" };
    if (options.majorWound && flammable) return { kind: "alight" };
    if (options.majorWound) return { kind: "roll", modifier: 0 };
  }
  if (flammable && options.majorWound) {
    return { kind: "roll", modifier: (fire ? -3 : 0) + (options.vitals ? -3 : 0) };
  }
  return { kind: "none" };
}

/**
 * What being alight costs: "you suffer 1d-1 injury per second until you
 * extinguish the fire by immersion in water, rolling on the ground (takes 3
 * seconds), etc."
 */
export const FRAGILE_BURNING: DiceAdds = { dice: 1, adds: -1 };

/** Seconds spent rolling on the ground to put it out. */
export const FRAGILE_ROLLING_SECONDS = 3;

// ── exploding (Explosive, and Flammable once alight) ────────────────────

/**
 * "On any critical failure on the HT roll for a major wound, you explode!"
 */
export function explodesOnMajorWound(kinds: readonly FragileKind[], roll: { criticalFailure?: boolean }): boolean {
  return kinds.includes("explosive") && roll.criticalFailure === true;
}

/**
 * The blast: "Treat this as a 6d×(HP/10) crushing explosion. The blast
 * instantly reduces you to -10×HP, regardless of the damage it inflicts."
 */
export function fragileExplosion(hitPoints: number): { dice: number; multiplier: number; type: "cr"; hpAfter: number } {
  const hp = Math.max(0, Number(hitPoints) || 0);
  return { dice: 6, multiplier: hp / 10, type: "cr", hpAfter: -10 * hp };
}

// ── the roll against death (Brittle, Explosive, Flammable, Unnatural) ───

/** What Fragile makes of a HT roll to avoid death, beyond the ordinary result. */
export type FragileDeath = "destroyed" | "explodes" | null;

/**
 * Unnatural: "You automatically fail the HT roll to stay alive if reduced to
 * -HP or below, as that much damage severs your ties with the force that
 * animates you."
 */
export function failsDeathChecks(kinds: readonly FragileKind[]): boolean {
  return kinds.includes("unnatural");
}

/**
 * What a HT roll to avoid death does to a Fragile body (pp. 136-137).
 *
 * Brittle: "should you fail any HT roll to avoid death, you are instantly
 * destroyed ... and instantly go to -10×HP." Explosive: "You also explode if
 * you fail any HT roll to avoid death by 3+." Flammable: "Once you are
 * burning, a critical failure on any HT roll to avoid death means you explode
 * as described for Explosive."
 */
export function fragileDeathCheck(options: {
  kinds: readonly FragileKind[];
  roll: { success: boolean; margin: number; criticalFailure?: boolean };
  /** Alight now. */
  burning?: boolean;
}): FragileDeath {
  const { kinds, roll } = options;
  if (roll.success) return null;
  if (kinds.includes("explosive") && Math.abs(roll.margin) >= 3) return "explodes";
  if (kinds.includes("flammable") && options.burning === true && roll.criticalFailure === true) return "explodes";
  if (kinds.includes("brittle")) return "destroyed";
  return null;
}

// ── a crippled limb (Brittle) ───────────────────────────────────────────

/**
 * Brittle: "Whenever an injury cripples one of your limbs or extremities, it
 * breaks off. If you can make a HT roll, it falls off in one piece; otherwise,
 * it shatters or liquefies irrecoverably."
 */
export function brittleLimb(roll: { success: boolean }): "fallsOff" | "shatters" {
  return roll.success ? "fallsOff" : "shatters";
}
