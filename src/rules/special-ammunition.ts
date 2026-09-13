/**
 * Special ammunition (GURPS Monster Hunters 1: Champions p. 63).
 *
 * "Each type of ammo below has a 'cost factor' (CF) ... The final CF
 * multiplier is applied to the reload cost, but does not modify the magazine
 * or speedloader cost." A load takes "one powder option and one payload
 * option, but no more", and "All effects stack; e.g., an extra-powerful
 * (x1.1 Range) chemical (x0.4 Range) round would have 0.44 times Range."
 */

import { formatDiceAdds, parseDiceAdds } from "./dice.js";
import type { DamageType } from "./types.js";
import { stepPiercing } from "./ammunition.js";

export const POWDER_OPTIONS = ["", "extraPowerful", "handMatched", "matchGrade", "silent"] as const;
export type PowderOption = (typeof POWDER_OPTIONS)[number];

export const PAYLOAD_OPTIONS = [
  "", "armorPiercing", "chemicalSmoke", "chemicalTearGas", "dragonsBreath", "explosive", "flare",
  "hollowPoint", "holyWater", "rockSalt", "silver", "thermate", "wooden",
] as const;
export type PayloadOption = (typeof PAYLOAD_OPTIONS)[number];

/** Each option's cost factor. */
const CF: Readonly<Record<Exclude<PowderOption | PayloadOption, "">, number>> = {
  extraPowerful: 1, handMatched: 9, matchGrade: 1, silent: 9,
  armorPiercing: 1, chemicalSmoke: 2, chemicalTearGas: 4, dragonsBreath: 2, explosive: 19, flare: 4,
  hollowPoint: 0, holyWater: 2, rockSalt: 0, silver: 49, thermate: 3, wooden: 2,
};

/**
 * The options whose price "includes hand-loading labor" (the asterisked
 * ones): a champion with a reloading press can make them with an Armoury
 * (Small Arms) roll, and "Success reduces the CF of this option by 2 ...
 * failure increases it by 2 due to wastage."
 */
export const HAND_LOADED: ReadonlySet<string> = new Set(["handMatched", "holyWater", "silver", "thermate", "wooden"]);

/** "Any shotgun" options. */
const SHOTGUN_ONLY: ReadonlySet<string> = new Set(["chemicalSmoke", "chemicalTearGas", "dragonsBreath", "explosive", "flare", "rockSalt"]);
/** "Any pistol, rifle, or SMG" options. */
const NOT_SHOTGUN: ReadonlySet<string> = new Set(["armorPiercing", "hollowPoint"]);

/** A firearm's load: one powder and one payload, and what hand-loading did to each's CF. */
export interface AmmunitionLoad {
  powder: PowderOption;
  payload: PayloadOption;
  /** -2 for a crafted batch that came out well, +2 for wastage, 0 for bought. */
  powderAdjust?: number;
  payloadAdjust?: number;
}

export type AmmunitionProblem = "shotgunOnly" | "notShotgun" | "dragonsBreathPowder";

/** What is wrong with a load for this gun (p. 63). */
export function ammunitionProblems(load: AmmunitionLoad, gun: { shotgun: boolean }): AmmunitionProblem[] {
  const out: AmmunitionProblem[] = [];
  if (SHOTGUN_ONLY.has(load.payload) && !gun.shotgun) out.push("shotgunOnly");
  if (NOT_SHOTGUN.has(load.payload) && gun.shotgun) out.push("notShotgun");
  // "Cannot be combined with any powder options."
  if (load.payload === "dragonsBreath" && load.powder) out.push("dragonsBreathPowder");
  return out;
}

/** A load's total cost factor, with any hand-loading adjustment to an asterisked option. */
export function ammunitionCostFactor(load: AmmunitionLoad): number {
  const part = (option: string, adjust = 0) =>
    option ? Math.max(0, CF[option as keyof typeof CF] + (HAND_LOADED.has(option) ? Math.sign(adjust) * 2 : 0)) : 0;
  return part(load.powder, load.powderAdjust) + part(load.payload, load.payloadAdjust);
}

/**
 * A full reload with this load (p. 63): the rounds times (1 + CF), plus the
 * magazine or speedloader at its own price -- "($4 x 10) + $32 = $72, not
 * ($4 + $32) x 10 = $360!"
 */
export function specialReloadCost(options: { ammunition: number; magazine: number; load: AmmunitionLoad }): number {
  const cf = ammunitionCostFactor(options.load);
  return Math.round((Math.max(0, options.ammunition) * (1 + cf) + Math.max(0, options.magazine)) * 100) / 100;
}

/** "Halves Range and damage, rounding up (e.g., 3d becomes 1d+2)" for wooden rounds. */
export function halveDamage(damage: string): string {
  const parsed = parseDiceAdds(damage);
  if (!parsed) return damage;
  // A die is worth 3.5, so half a die is +2, rounding up.
  const dice = Math.floor(parsed.dice / 2);
  const adds = (parsed.dice % 2 === 1 ? 2 : 0) + Math.ceil(parsed.adds / 2);
  return formatDiceAdds({ ...parsed, dice: Math.max(0, dice), adds });
}

/** Thermate's burning follow-up by the gun's base damage type: "1d-4 for pi-, 1d-2 for pi, 1d for pi+, or 1d+2 for pi++". */
const THERMATE_FOLLOW_UP: Readonly<Record<string, string>> = { "pi-": "1d-4", pi: "1d-2", "pi+": "1d", "pi++": "1d+2" };

/** A note on an effect that needs the GM, by key. */
export type AmmunitionNote =
  | "silent" | "smoke" | "tearGas" | "dragonsBreath" | "explosive" | "flare" | "holyWater"
  | "rockSalt" | "silver" | "wooden";

/** What a load does to the shot. */
export interface SpecialAmmunitionEffect {
  damage: string;
  damageType: DamageType;
  armorDivisor: number;
  /** Nothing to roll: rock salt "does no damage". */
  noDamage: boolean;
  rangeMultiplier: number;
  /** A fixed range where the load replaces it: rock salt's 10. */
  fixedRange: number | null;
  accuracy: number;
  /** Null where the gun's own stands. */
  rateOfFire: number | null;
  /** "Multiply ... ST by 1.1 (minimum +1 ST)." */
  st: number | null;
  /** A slug in place of shot: one projectile. */
  projectiles: number | null;
  followUp: { damage: string; damageType: DamageType; explosive: boolean } | null;
  material: "silver" | "";
  holy: boolean;
  /** Seconds before the gun can fire again: Dragon's Breath's three. */
  refireSeconds: number;
  notes: AmmunitionNote[];
}

/**
 * The effect of a load on a shot (p. 63). The gun's figures come in as they
 * are, and the load's changes go on in the order the book lists them, so
 * that its multipliers stack.
 */
export function specialAmmunitionEffect(
  load: AmmunitionLoad,
  gun: { damage: string; damageType: DamageType; armorDivisor: number; accuracy: number; st: number | null; shotgun: boolean; projectiles: number },
): SpecialAmmunitionEffect {
  const out: SpecialAmmunitionEffect = {
    damage: gun.damage,
    damageType: gun.damageType,
    armorDivisor: gun.armorDivisor,
    noDamage: false,
    rangeMultiplier: 1,
    fixedRange: null,
    accuracy: 0,
    rateOfFire: null,
    st: null,
    projectiles: null,
    followUp: null,
    material: "",
    holy: false,
    refireSeconds: 0,
    notes: [],
  };
  const addDamage = (bonus: (dice: number) => number) => {
    const parsed = parseDiceAdds(out.damage);
    if (parsed) out.damage = formatDiceAdds({ ...parsed, adds: parsed.adds + bonus(parsed.dice) });
  };

  switch (load.powder) {
    case "extraPowerful":
      // "+1 damage per three dice or fraction thereof. Multiply Range and ST by 1.1 (minimum +1 ST)."
      addDamage((dice) => Math.ceil(dice / 3));
      out.rangeMultiplier *= 1.1;
      if (gun.st !== null) out.st = Math.max(gun.st + 1, Math.round(gun.st * 1.1));
      break;
    case "handMatched":
      out.accuracy += gun.accuracy >= 4 ? 2 : gun.accuracy >= 2 ? 1 : 0;
      break;
    case "matchGrade":
      out.accuracy += gun.accuracy >= 4 ? 1 : 0;
      break;
    case "silent":
      out.notes.push("silent");
      break;
  }

  // "With the sole exception of silver, none of the upgrades below may be
  // applied to shot shells; shotguns firing any of these custom bullets do
  // so using slugs, not shot."
  if (gun.shotgun && load.payload && load.payload !== "silver" && gun.projectiles > 1) out.projectiles = 1;

  switch (load.payload) {
    case "armorPiercing":
      out.armorDivisor = out.armorDivisor * 2;
      out.damageType = stepPiercing(out.damageType, -1);
      break;
    case "chemicalSmoke":
    case "chemicalTearGas":
      out.damage = "2d-1";
      out.armorDivisor = 0.5;
      out.damageType = "cr";
      out.rangeMultiplier *= 0.4;
      out.notes.push(load.payload === "chemicalSmoke" ? "smoke" : "tearGas");
      break;
    case "dragonsBreath":
      out.damage = "1d-2";
      out.damageType = "burn";
      out.armorDivisor = 1;
      out.rateOfFire = 1;
      out.refireSeconds = 3;
      out.notes.push("dragonsBreath");
      break;
    case "explosive":
      out.damage = "4d";
      out.armorDivisor = 0.5;
      out.damageType = "pi++";
      out.followUp = { damage: "1d-1", damageType: "cr", explosive: true };
      out.notes.push("explosive");
      break;
    case "flare":
      out.damage = "2d-1";
      out.armorDivisor = 0.5;
      out.damageType = "cr";
      out.rangeMultiplier *= 0.4;
      out.notes.push("flare");
      break;
    case "hollowPoint":
    case "holyWater":
      if (out.damageType !== "pi++") out.damageType = stepPiercing(out.damageType, 1);
      out.armorDivisor = out.armorDivisor * 0.5;
      if (load.payload === "holyWater") {
        out.holy = true;
        out.notes.push("holyWater");
      }
      break;
    case "rockSalt":
      out.noDamage = true;
      out.fixedRange = 10;
      out.notes.push("rockSalt");
      break;
    case "silver":
      out.material = "silver";
      out.notes.push("silver");
      break;
    case "thermate": {
      out.followUp = { damage: THERMATE_FOLLOW_UP[gun.damageType] ?? "1d-2", damageType: "burn", explosive: false };
      addDamage((dice) => -dice);
      break;
    }
    case "wooden":
      out.damage = halveDamage(out.damage);
      out.rangeMultiplier *= 0.5;
      out.notes.push("wooden");
      break;
  }
  return out;
}

/** A shotgun, for the options only a shotgun takes: by its skill, or by firing shot. */
export function isShotgun(options: { skill: string; name: string; projectiles: number }): boolean {
  return /shotgun/i.test(options.skill) || /shotgun/i.test(options.name) || options.projectiles > 1;
}
