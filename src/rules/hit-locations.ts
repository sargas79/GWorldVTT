/**
 * Hit locations (GURPS Basic Set: Campaigns pp. 398-400, table p. 552).
 *
 * GURPS Lite has no hit locations at all — every blow strikes the torso and
 * armor is a single whole-body DR. The Basic Set makes where you were hit the
 * main lever on how much a wound matters, so this module owns the to-hit
 * penalties, the per-location wounding overrides, and the crippling thresholds.
 */

import { WOUNDING_MODIFIERS } from "./damage.js";
import type { DamageType } from "./types.js";

export type HitLocation =
  | "torso"
  | "skull"
  | "eye"
  | "face"
  | "neck"
  | "vitals"
  | "groin"
  | "arm"
  | "leg"
  | "hand"
  | "foot";

/** How a location behaves when a limb or extremity takes a major wound. */
export type CripplingKind = "none" | "limb" | "extremity";

/**
 * Extra DR a location grants against a given damage type.
 *
 * The skull's DR 2 is part of the same package as its x4 multiplier, and toxic
 * damage is exempt from both (GURPS Basic Set: Campaigns p. 399) — exempting
 * only the multiplier would armor the skull against poison.
 */
export function locationDrAgainst(location: HitLocation, type: DamageType): number {
  // Toxic slips past natural armour, as it slips past the skull multiplier.
  // Fatigue ignores the location entirely -- computeInjury drops the location
  // before it ever asks for this -- so the answer is stated here as well, or
  // anything else reading DR per location would credit a skull with stopping it.
  if (type === "tox" || type === "fat") return 0;
  return HIT_LOCATIONS[location].extraDr;
}

export interface HitLocationInfo {
  key: HitLocation;
  label: string;
  /** Penalty to the attack roll for deliberately targeting this location. */
  toHit: number;
  /** DR this location adds on top of worn armor; only the skull has any. */
  extraDr: number;
  /** Modifier to the HT roll to avoid knockdown and stunning. */
  knockdown: number;
  /**
   * Fraction of maximum HP that, exceeded by one blow, cripples the location.
   * Limbs cripple above 1/2 HP, extremities above 1/3.
   */
  cripplingKind: CripplingKind;
  /**
   * Damage types that may deliberately target this location. An empty list
   * means any type may.
   */
  /**
   * Damage types that may deliberately target this location, ignoring the
   * tight-beam burning case which {@link canTarget} handles separately.
   */
  targetableBy: readonly DamageType[];
  /** True when this location can only be struck deliberately, never at random. */
  deliberateOnly: boolean;
}

/**
 * Whether a burning attack is "tight-beam" — a laser rather than a torch or
 * flamethrower (GURPS Basic Set: Campaigns p. 399).
 *
 * Only tight-beam burns may target the eye or vitals, and only they get the
 * vitals multiplier, so `burn` alone cannot carry the restriction.
 */
export interface AttackQualifiers {
  tightBeam?: boolean;
}

/** Damage types that can target the eye and vitals, burning aside. */
const PRECISE_TYPES: readonly DamageType[] = ["imp", "pi-", "pi", "pi+", "pi++"];

export const HIT_LOCATIONS: Record<HitLocation, HitLocationInfo> = {
  torso: { key: "torso", label: "Torso", toHit: 0, extraDr: 0, knockdown: 0, cripplingKind: "none", targetableBy: [], deliberateOnly: false },
  skull: { key: "skull", label: "Skull", toHit: -7, extraDr: 2, knockdown: -10, cripplingKind: "none", targetableBy: [], deliberateOnly: false },
  eye: { key: "eye", label: "Eye", toHit: -9, extraDr: 0, knockdown: -10, cripplingKind: "none", targetableBy: PRECISE_TYPES, deliberateOnly: true },
  face: { key: "face", label: "Face", toHit: -5, extraDr: 0, knockdown: -5, cripplingKind: "none", targetableBy: [], deliberateOnly: false },
  neck: { key: "neck", label: "Neck", toHit: -5, extraDr: 0, knockdown: 0, cripplingKind: "none", targetableBy: [], deliberateOnly: false },
  vitals: { key: "vitals", label: "Vitals", toHit: -3, extraDr: 0, knockdown: 0, cripplingKind: "none", targetableBy: PRECISE_TYPES, deliberateOnly: true },
  groin: { key: "groin", label: "Groin", toHit: -3, extraDr: 0, knockdown: -5, cripplingKind: "none", targetableBy: [], deliberateOnly: false },
  arm: { key: "arm", label: "Arm", toHit: -2, extraDr: 0, knockdown: 0, cripplingKind: "limb", targetableBy: [], deliberateOnly: false },
  leg: { key: "leg", label: "Leg", toHit: -2, extraDr: 0, knockdown: 0, cripplingKind: "limb", targetableBy: [], deliberateOnly: false },
  hand: { key: "hand", label: "Hand", toHit: -4, extraDr: 0, knockdown: 0, cripplingKind: "extremity", targetableBy: [], deliberateOnly: false },
  foot: { key: "foot", label: "Foot", toHit: -4, extraDr: 0, knockdown: 0, cripplingKind: "extremity", targetableBy: [], deliberateOnly: false },
};

/**
 * The random hit location table, rolled on 3d6 (GURPS Basic Set: Campaigns
 * p. 552). Eye and Vitals are absent — they can only be struck deliberately.
 */
const RANDOM_TABLE: ReadonlyArray<{ min: number; max: number; location: HitLocation; side?: "right" | "left" }> = [
  { min: 3, max: 4, location: "skull" },
  { min: 5, max: 5, location: "face" },
  { min: 6, max: 7, location: "leg", side: "right" },
  { min: 8, max: 8, location: "arm", side: "right" },
  { min: 9, max: 10, location: "torso" },
  { min: 11, max: 11, location: "groin" },
  { min: 12, max: 12, location: "arm", side: "left" },
  { min: 13, max: 14, location: "leg", side: "left" },
  // Hand and foot have no side in the table; footnote: roll 1d, 1-3 right, 4-6 left.
  { min: 15, max: 15, location: "hand" },
  { min: 16, max: 16, location: "foot" },
  { min: 17, max: 18, location: "neck" },
];

/** Resolves a 3d6 roll to a hit location. Rolls outside 3-18 clamp to the table. */
export function randomHitLocation(
  roll: number,
  sideRoll?: number,
): { location: HitLocation; side?: "right" | "left" } {
  const clamped = Math.max(3, Math.min(18, Math.round(roll)));
  const row = RANDOM_TABLE.find((r) => clamped >= r.min && clamped <= r.max)!;
  if (row.side) return { location: row.location, side: row.side };

  // Hands and feet are paired but unsided in the table: a 1d roll picks one,
  // 1-3 right and 4-6 left.
  if ((row.location === "hand" || row.location === "foot") && sideRoll !== undefined) {
    return { location: row.location, side: sideRoll <= 3 ? "right" : "left" };
  }
  return { location: row.location };
}

/**
 * Whether a damage type may deliberately target a location.
 *
 * Only the eye and vitals restrict this: you cannot, for instance, target the
 * vitals with a swung axe.
 */
export function canTarget(
  location: HitLocation,
  type: DamageType,
  qualifiers: AttackQualifiers = {},
): boolean {
  const info = HIT_LOCATIONS[location];
  if (info.targetableBy.length === 0) return true;
  // A torch cannot be aimed at an eye; a laser can.
  if (type === "burn") return qualifiers.tightBeam === true;
  return info.targetableBy.includes(type);
}

/**
 * The wounding modifier for a damage type at a location, which overrides the
 * type's default (GURPS Basic Set: Campaigns pp. 398-399).
 *
 * Toxic damage is exempt from the skull and eye multipliers, and limbs *cap*
 * the big piercing and impaling multipliers rather than raising them — a spear
 * through the arm does far less than one through the chest.
 */
export function woundingModifierAt(
  type: DamageType,
  location: HitLocation,
  qualifiers: AttackQualifiers = {},
): number {
  const base = WOUNDING_MODIFIERS[type];

  switch (location) {
    case "skull":
    case "eye":
      // Toxic ignores the skull's special effects entirely.
      return type === "tox" ? base : 4;

    case "vitals":
      if (type === "imp" || type === "pi-" || type === "pi" || type === "pi+" || type === "pi++") return 3;
      // Only a tight-beam burn gets the vitals bonus; a flamethrower does not.
      if (type === "burn") return qualifiers.tightBeam ? 2 : base;
      return base;

    case "neck":
      if (type === "cr" || type === "cor") return 1.5;
      if (type === "cut") return 2;
      return base;

    case "face":
      return type === "cor" ? 1.5 : base;

    case "arm":
    case "leg":
    case "hand":
    case "foot":
      // Limbs cannot be over-penetrated: the big multipliers drop to x1.
      if (type === "pi+" || type === "pi++" || type === "imp") return 1;
      return base;

    default:
      return base;
  }
}

/**
 * Injury beyond what is needed to cripple a limb is lost, so a hand cannot
 * absorb a killing blow (GURPS Basic Set: Campaigns p. 399).
 *
 * Returns the threshold above which the location is crippled, or null when the
 * location cannot be crippled.
 */
export function cripplingThreshold(location: HitLocation, maxHp: number): number | null {
  const kind = HIT_LOCATIONS[location].cripplingKind;
  if (kind === "limb") return maxHp / 2;
  if (kind === "extremity") return maxHp / 3;
  return null;
}

export interface LocationInjuryResult {
  /** Injury actually applied, after any crippling cap. */
  injury: number;
  /** Injury discarded because it exceeded the crippling threshold. */
  excessLost: number;
  crippled: boolean;
}

/**
 * Caps injury to a limb or extremity at its crippling threshold, discarding the
 * excess. Locations that cannot be crippled pass injury through unchanged.
 */
export function applyCrippling(
  injury: number,
  location: HitLocation,
  maxHp: number,
): LocationInjuryResult {
  const threshold = cripplingThreshold(location, maxHp);
  if (threshold === null || injury <= threshold) {
    return { injury, excessLost: 0, crippled: false };
  }
  const capped = Math.floor(threshold);
  return { injury: capped, excessLost: injury - capped, crippled: true };
}

/** Every location, in a sensible order for a targeting menu. */
export const HIT_LOCATION_ORDER: readonly HitLocation[] = [
  "torso", "skull", "eye", "face", "neck", "vitals", "groin", "arm", "leg", "hand", "foot",
];
