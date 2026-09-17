/**
 * Shots, reloading and ammunition (GURPS Basic Set: Characters pp. 270,
 * 275-276, 278-279; Campaigns pp. 373, 382).
 *
 * The Shots column says three things at once: how many shots the weapon
 * holds, how long reloading takes, and whether that time is for all of them
 * or for each. What goes into the weapon can change what comes out of it:
 * hollow-point, armour-piercing, a bodkin head, silver.
 */

import type { DamageType } from "./types.js";

// ── the Shots column (Characters p. 270) ───────────────────────────────────

/** What a Shots entry says. */
export interface ShotsEntry {
  /** Shots the weapon holds, or null where the column does not say. */
  capacity: number | null;
  /** "30+1": one more in the chamber beyond the magazine. */
  chambered: boolean;
  /**
   * "The parenthetical number following the number of shots is the number
   * of one-second Ready maneuvers needed to reload." Null where it gives
   * none, as "1(-)" on a weapon that is not reloaded.
   */
  reloadSeconds: number | null;
  /** "An 'i' next to this means you must load shots individually: the time listed is per shot." */
  perShot: boolean;
  /** "T" means the weapon is thrown: "to 'reload,' pick it up or ready a new weapon!" */
  thrown: boolean;
  text: string;
}

/** Reads a Shots entry: "30+1(3)", "6(3i)", "1(20)", "T(1)", "1(-)", "10". */
export function parseShots(text: string | undefined): ShotsEntry {
  const raw = (text ?? "").trim();
  const none: ShotsEntry = { capacity: null, chambered: false, reloadSeconds: null, perShot: false, thrown: false, text: raw };
  if (!raw) return none;
  const m = /^(T|\d+)(\+1)?\s*(?:\((\d+|-)?\s*(i)?\s*\))?$/i.exec(raw.replace(/spcl\.?/i, "-"));
  if (!m) return none;
  const thrown = m[1]!.toUpperCase() === "T";
  return {
    capacity: thrown ? 1 : Number(m[1]),
    chambered: Boolean(m[2]),
    reloadSeconds: m[3] && m[3] !== "-" ? Number(m[3]) : null,
    perShot: Boolean(m[4]),
    thrown,
    text: raw,
  };
}

/** Everything the weapon holds when full: the magazine and the chambered round. */
export function fullLoad(entry: ShotsEntry): number {
  if (entry.capacity === null) return 0;
  return entry.capacity + (entry.chambered ? 1 : 0);
}

/**
 * How long a reload takes (Campaigns p. 373): the parenthetical figure, for
 * all the shots at once or -- with an "i" -- for each shot loaded.
 */
export function reloadTime(entry: ShotsEntry, shotsToLoad: number): number | null {
  if (entry.reloadSeconds === null) return null;
  if (!entry.perShot) return entry.reloadSeconds;
  return entry.reloadSeconds * Math.max(0, Math.floor(shotsToLoad));
}

/**
 * Cocking a crossbow or prodd stronger than its user (Characters p. 270):
 * "A crossbow or prodd takes the indicated time to ready (4 turns) only if
 * its ST is no greater than yours. Double this if the bow's ST is 1 or 2
 * greater. If its ST is 3 or 4 greater, you need a 'goat's foot' device to
 * cock it; this takes 20 turns, and requires you to stand. If its ST is 5
 * or more above yours, you cannot reload it at all."
 */
export const GOATS_FOOT_SECONDS = 20;

export function crossbowReloadTime(options: {
  bowSt: number | null;
  userSt: number;
  baseSeconds: number | null;
  goatsFoot: boolean;
}): { seconds: number | null; needsGoatsFoot: boolean; mustStand: boolean; tooStrong: boolean } {
  const { bowSt, userSt, baseSeconds, goatsFoot } = options;
  const over = bowSt === null ? 0 : bowSt - userSt;
  if (over <= 0) return { seconds: baseSeconds, needsGoatsFoot: false, mustStand: false, tooStrong: false };
  if (over <= 2) return { seconds: baseSeconds === null ? null : baseSeconds * 2, needsGoatsFoot: false, mustStand: false, tooStrong: false };
  if (over <= 4) {
    return goatsFoot
      ? { seconds: GOATS_FOOT_SECONDS, needsGoatsFoot: true, mustStand: true, tooStrong: false }
      : { seconds: null, needsGoatsFoot: true, mustStand: true, tooStrong: false };
  }
  return { seconds: null, needsGoatsFoot: false, mustStand: false, tooStrong: true };
}

// ── what ammunition costs (Characters p. 278) ──────────────────────────────

/** "Assume that ammo cost is $20 times this weight." */
export const AMMO_COST_PER_LB = 20;

export function ammunitionCost(reloadWeightLbs: number): number {
  return Math.round(Math.max(0, reloadWeightLbs) * AMMO_COST_PER_LB * 100) / 100;
}

// ── kinds of ammunition (Characters pp. 275, 276, 279) ─────────────────────

export const AMMUNITION_TYPES = ["", "hp", "aphc", "apds", "bodkin", "silver"] as const;
export type AmmunitionType = (typeof AMMUNITION_TYPES)[number];

const PIERCING: readonly DamageType[] = ["pi-", "pi", "pi+", "pi++"];

/** A piercing type one or more steps up or down the ladder, held at the ends. */
export function stepPiercing(type: DamageType, steps: number): DamageType {
  const at = PIERCING.indexOf(type);
  if (at < 0) return type;
  return PIERCING[Math.min(PIERCING.length - 1, Math.max(0, at + steps))]!;
}

/** The calibre a firearm's name states, in millimetres, or null where it does not. */
export function calibreOf(name: string): number | null {
  const mm = /(\d+(?:\.\d+)?)\s*mm/i.exec(name);
  if (mm) return Number(mm[1]);
  // ".338", ".45", "9mm": a bare decimal is inches.
  const inch = /(?:^|[\s,])\.(\d{2,3})\b/.exec(name);
  if (inch) return Math.round(Number(`0.${inch[1]}`) * 25.4 * 100) / 100;
  return null;
}

/** The threshold below which armour-piercing rounds lose a piercing step: "below 20mm (.80)". */
export const SMALL_CALIBRE_MM = 20;

/** What a kind of ammunition does to the weapon it is fired from. */
export interface AmmunitionEffect {
  available: boolean;
  damageType: DamageType;
  armorDivisor: number;
  rangeMultiplier: number;
  /** "+1 damage per die" for APDS. */
  perDieBonus: number;
  costMultiplier: number;
  /** The round's own Legality Class where the book gives one, else null. */
  lc: number | null;
}

/**
 * The effect of a kind of ammunition (pp. 275, 276, 279), or the weapon as
 * it is where that kind is not made for it.
 *
 * Hollow-Point: "pi- becomes pi, pi becomes pi+, and pi+ becomes pi++"; not
 * for guns already doing pi++; "add an armor divisor of (0.5)"; TL6+;
 * normal cost and LC. Armor-Piercing Hard Core: "Add a (2) armor divisor,
 * but if the gun caliber is below 20mm (.80), damage type degrades: pi++
 * drops to pi+, pi+ to pi, and pi to pi-. (There is no effect on pi-.)";
 * TL7+; double cost; LC2. APDS: "works like APHC, but also adds 50% to
 * range and +1 damage per die"; TL9 for small arms; five times cost; LC1.
 * Bodkin points on arrows and bolts, TL3+: impaling becomes piercing at a
 * (2) divisor, no change in cost. Silver: bullets are solid and cost 50
 * times list, arrowheads 20 times (p. 275).
 */
export function ammunitionEffect(
  kind: AmmunitionType,
  weapon: { damageType: DamageType; armorDivisor: number; calibreMm: number | null; tl: number; bow: boolean },
): AmmunitionEffect {
  const same: AmmunitionEffect = {
    available: true,
    damageType: weapon.damageType,
    armorDivisor: weapon.armorDivisor,
    rangeMultiplier: 1,
    perDieBonus: 0,
    costMultiplier: 1,
    lc: null,
  };
  const piercing = PIERCING.includes(weapon.damageType);
  const small = weapon.calibreMm === null || weapon.calibreMm < SMALL_CALIBRE_MM;

  switch (kind) {
    case "":
      return same;
    case "hp":
      if (weapon.bow || !piercing || weapon.damageType === "pi++" || weapon.tl < 6) return { ...same, available: false };
      return { ...same, damageType: stepPiercing(weapon.damageType, 1), armorDivisor: weapon.armorDivisor * 0.5 };
    case "aphc":
    case "apds": {
      const minTl = kind === "apds" ? 9 : 7;
      if (weapon.bow || !piercing || weapon.tl < minTl) return { ...same, available: false };
      const degraded = small ? stepPiercing(weapon.damageType, -1) : weapon.damageType;
      return {
        ...same,
        damageType: degraded,
        armorDivisor: weapon.armorDivisor * 2,
        rangeMultiplier: kind === "apds" ? 1.5 : 1,
        perDieBonus: kind === "apds" ? 1 : 0,
        costMultiplier: kind === "apds" ? 5 : 2,
        lc: kind === "apds" ? 1 : 2,
      };
    }
    case "bodkin":
      if (!weapon.bow || weapon.damageType !== "imp" || weapon.tl < 3) return { ...same, available: false };
      return { ...same, damageType: "pi", armorDivisor: weapon.armorDivisor * 2 };
    case "silver":
      if (weapon.bow) return { ...same, costMultiplier: 20 };
      if (weapon.tl < 4) return { ...same, available: false };
      return { ...same, costMultiplier: 50 };
  }
}

// ── ammunition as something carried (Characters p. 278) ─────────────────

/** What a box of rounds says it fits, and what the weapon is: name and priced class. */
export interface AmmunitionFit {
  name: string;
  weaponClass?: string;
}

/**
 * Whether rounds that say what they fit go in this weapon.
 *
 * A fit is written the way the weapon's name states its calibre -- "9mm",
 * ".40", "12G" -- and matches that token in the name, not a longer one:
 * 7.62mm rounds do not fit a 7.62mmS rifle. "arrow" fits a bow and "bolt" a
 * crossbow or prodd. A weapon's own name fits it. Blank fits anything.
 */
export function ammunitionFits(weapon: AmmunitionFit, fits: string): boolean {
  const wanted = String(fits ?? "").trim().toLowerCase();
  if (!wanted) return true;
  const name = String(weapon.name ?? "").toLowerCase();
  const crossbow = /crossbow|prodd/.test(name);
  const bow = !crossbow && (weapon.weaponClass === "bow" || /\bbow\b/.test(name));
  if (wanted === "arrow" || wanted === "arrows") return bow;
  if (wanted === "bolt" || wanted === "bolts") return crossbow;
  const token = wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${token}(?![a-z0-9])`).test(name);
}

/**
 * What loading a weapon from a box takes and puts back.
 *
 * From the same box the rounds came from, the weapon tops up. From another,
 * what was in it goes back to its own box first -- a magazine of ball is not
 * lost by loading hollow-point -- and the weapon fills from the new one, as
 * far as the box goes.
 */
export function loadPlan(options: { capacity: number; loaded: number; available: number; sameSource: boolean }): {
  take: number;
  returned: number;
  loaded: number;
} {
  const capacity = Math.max(0, Math.floor(options.capacity) || 0);
  const held = Math.max(0, Math.min(capacity, Math.floor(options.loaded) || 0));
  const keep = options.sameSource ? held : 0;
  const returned = options.sameSource ? 0 : held;
  const take = Math.max(0, Math.min(capacity - keep, Math.floor(options.available) || 0));
  return { take, returned, loaded: keep + take };
}

/** The kinds a weapon can be loaded with, the plain round first. */
export function availableAmmunition(
  weapon: { damageType: DamageType; armorDivisor: number; calibreMm: number | null; tl: number; bow: boolean },
): AmmunitionType[] {
  return AMMUNITION_TYPES.filter((kind) => ammunitionEffect(kind, weapon).available);
}
