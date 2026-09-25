/**
 * The hazards of the road and the world (GURPS Basic Set: Campaigns pp. 351,
 * 426-427, 430-436, 466).
 *
 * Seven things that happen to a character between and around fights, each
 * a card: a night without sleep and the sleep that mends it, a day's march,
 * being struck by something moving, a shock, a fire, a dose of radiation,
 * and a vehicle kept on the road. The arithmetic is in the rules modules of
 * the same names; this is the part that rolls and writes.
 */

import { holdBreathSeconds, type Exertion } from "../rules/suffocation.js";
import { SYSTEM_ID } from "./constants.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { conditionLabel, setCondition, syncHealthConditions } from "./conditions.js";
import { resolveDamageAgainst, traitsOf, type IncomingDamage } from "./damage.js";
import { applyFatigue } from "./fatigue.js";
import { dayWeather } from "./weather.js";
import { loseAim } from "./aim.js";
import { collisionDamage, collisionVelocity, overrunDamage, type CollisionAngle } from "../rules/collisions.js";
import { formatDiceAdds, parseDiceAdds, toRollFormula } from "../rules/dice.js";
import {
  HEART_ATTACK_MARGIN, lethalShock, lethalShockModifier, localizedShock, nonlethalShock, METAL_ARMOR_DR,
  SHOCK_INJURY_STEP, shockHeartAttack,
} from "../rules/electricity.js";
import {
  catchingFire, FIRE_DAMAGE, ignites, prolongedContactTarget, type FireExposure, type Flammability,
} from "../rules/fire.js";
import { dailyMiles, marchingFatiguePerHour, type Terrain, type TravelWeather } from "../rules/hiking.js";
import { HOT_DAY_FATIGUE } from "../rules/fatigue.js";
import { randomHitLocation, type HitLocation } from "../rules/hit-locations.js";
import { callCombatHook, COMBAT_HOOKS, randomLocationWithHooks, type VehicleDrLine } from "./combat-extensions.js";
import { PROCEDURE_HOOKS, applyCondition, procedureRoll, type FatigueCostPart } from "./procedure-extensions.js";
import { postRefusal } from "./roll.js";
import { equipmentUseLines } from "./tech-level.js";
import { applyInjury } from "../rules/injury.js";
import {
  protectedDose, radiationEffect, radiationRow, remainingDose,
} from "../rules/radiation.js";
import { skillLevelOf } from "./skill-level.js";
import { dozingOff, sleepRecovery, stayingUpFatigue, wakingDayHours } from "../rules/sleep.js";
import { resolveSuccess } from "../rules/success.js";
import type { DamageType } from "../rules/types.js";
import { activeMove, controlRoll, fragilityCodes, vehicleMoves } from "../rules/vehicles.js";
import { vehicleStats } from "./vehicle-stats.js";
import {
  brittleLimb, explodesOnMajorWound, fragileExplosion, fragileFromVehicleCodes, fragileIgnition,
  FRAGILE_BURNING, FRAGILE_ROLLING_SECONDS, type FragileKind,
} from "../rules/fragile.js";
import {
  crippleThreshold, hitsAPerson, locationCount, locationsOf, lossOfControl, MOVE_CRIPPLING_LOCATIONS, mediumOf, occupantDamage,
  occupantHitTarget, OCCUPANT_RISK_DAMAGE, passesThrough, vehicleDrAt, vehicleHitLocation,
  vehicleInjury, vehicleLocationPenalty, vehicleMovement, vehiclePenetration, vehicleWoundingModifier,
  VEHICLE_HIT_LOCATIONS, type VehicleArc, type VehicleLocation,
} from "../rules/vehicle-combat.js";
import { jumpFromVehicle } from "../rules/collisions.js";
import { isRuleOn } from "./optional-rules.js";
import {
  buildingHealth, buildingHitPoints, collapseDamage, collapseShelter, mustRollToStand, structureState,
  trappedInRubble, type BuildingFrame, type CollapseShelter, type Construction,
} from "../rules/structures.js";
import {
  ACID_DAMAGE_TYPE, acidHarm, eyeOutcome, eyeRisk,
  type AcidContact, type AcidLanding,
} from "../rules/acid.js";
import {
  ALTITUDE_SICKNESS_BONUS,
  EXPLOSIVE_DECOMPRESSION,
  airDensity,
  airEffect,
  altitudeOutcome,
  atmosphereHarm,
  type AtmosphereHazard,
  type HazardStrength,
  corrosiveToll,
  vacuumBreathSeconds,
  HELD_BREATH_LUNG_DAMAGE,
} from "../rules/atmosphere.js";
import {
  RECOMPRESSION_BONUS, bendsOutcome, crushingInjury, crushingTarget, crushingThreshold, type PressureSupport, risksBends,
} from "../rules/pressure.js";
import {
  SPACE_SICKNESS_RECOVERY_HOURS, accelerationHarm, accelerationNeedsRoll, accelerationTarget,
  canAdaptToFreeFall, seasicknessOutcome, seasicknessTarget, spaceSicknessTarget, thrownVelocity,
} from "../rules/motion.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/life.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

function mayChange(actor: any): boolean {
  if (actor?.isOwner) return true;
  ui.notifications?.warn(
    game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
  );
  return false;
}

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...context,
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: (context.rolls as any[]) ?? [],
  });
}

const H = (key: string) => game.i18n.localize(`GWORLD.Hazard.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Hazard.${key}`, data);

/** Levels of a trait by name, 0 where the character lacks it. */
function traitLevels(actor: any, name: string): number {
  const wanted = name.trim().toLowerCase();
  for (const item of actor?.items ?? []) {
    if (item.type !== "trait") continue;
    if (String(item.name ?? "").trim().toLowerCase() !== wanted) continue;
    return Math.max(1, Math.floor(Number(item.system?.levels ?? 1)) || 1);
  }
  return 0;
}

/** Injury from a roll of damage, through the worn armour at a random location. */
async function takeDamage(
  actor: any,
  formula: string,
  type: DamageType,
  options: { drOverride?: number | null } = {},
): Promise<{ roll: any; locationRoll: any; injury: number; location: HitLocation; dr: number; previous: number; current: number }> {
  const roll = new Roll(formula);
  await roll.evaluate();
  const locationRoll = new Roll("3d6");
  await locationRoll.evaluate();
  // A module may refine where a random blow lands; this hazard reads only the
  // Basic Set location its armour covers.
  const location = randomLocationWithHooks(locationRoll.total, randomHitLocation(locationRoll.total).location, actor).hitLocation;

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const previous = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const basic = Math.max(0, roll.total);

  let injury: number;
  let dr: number;
  if (options.drOverride !== undefined && options.drOverride !== null) {
    // The armour counts for a stated figure whatever it is made of.
    dr = options.drOverride;
    injury = Math.max(0, basic - dr);
  } else {
    const damage: IncomingDamage = { basicDamage: basic, type, armorDivisor: 1, hitLocation: location };
    const resolved = resolveDamageAgainst(actor, damage);
    injury = resolved.injury;
    dr = resolved.effectiveDr;
  }

  const applied = applyInjury(injury, previous, max);
  if (injury > 0) {
    await actor.update({ "system.hp.value": applied.currentHp });
    await syncHealthConditions(actor);
  }
  return { roll, locationRoll, injury, location, dr, previous, current: applied.currentHp };
}

// ── sleep (pp. 426-427) ─────────────────────────────────────────────────

/** Stays up past the day, and pays for it. */
export async function stayAwake(options: { actor: any; hoursAwake: number; missedSleepHours: number }): Promise<number> {
  const { actor } = options;
  if (!mayChange(actor)) return 0;
  const period = actor.system?.derived?.sleepPeriod;
  if (period === null) {
    ui.notifications?.info(H("DoesntSleep"));
    return 0;
  }
  const dayHours = wakingDayHours(Number(period) || 8, options.missedSleepHours);
  const lost = stayingUpFatigue({ hoursAwake: options.hoursAwake, dayHours });
  const pools = await applyFatigue(actor, lost, { reason: "missedSleep" });

  const lines: string[] = [];
  lines.push(lost > 0 ? F("StayedUpCost", { fp: pools.fpLost, day: dayHours }) : F("StayedUpFree", { day: dayHours }));
  const nodding = dozingOff({ lostToSleep: lost, maxFp: pools.fp.max, currentFp: pools.fp.now });
  if (nodding.rolls) {
    lines.push(
      nodding.activeMinutes === null
        ? F("Dozing", { minutes: nodding.inactiveMinutes })
        : F("DozingBadly", { minutes: nodding.inactiveMinutes, active: nodding.activeMinutes }),
    );
  }
  if (pools.hpLost > 0) lines.push(F("FatigueInjury", { hp: pools.hpLost }));

  await post(actor, {
    kind: H("Sleep"),
    detail: F("Awake", { hours: options.hoursAwake, missed: options.missedSleepHours }),
    lines,
    bad: lost > 0,
  });
  return lost;
}

/** Sleeps, and gets fatigue back only for a full period and the hours beyond it. */
export async function sleepFor(options: { actor: any; hours: number }): Promise<number> {
  const { actor } = options;
  if (!mayChange(actor)) return 0;
  const period = actor.system?.derived?.sleepPeriod;
  const sleepPeriod = period === null ? 0 : Number(period) || 8;
  const wanted = sleepRecovery({ hoursSlept: options.hours, sleepPeriod });
  const fp = actor.system?.fp ?? { value: 0, max: 0 };
  const current = Number(fp.value) || 0;
  const max = Number(fp.max) || 0;
  const gained = Math.max(0, Math.min(wanted, max - current));
  if (gained > 0) await actor.update({ "system.fp.value": current + gained });

  await post(actor, {
    kind: H("Sleep"),
    detail: F("Slept", { hours: options.hours, period: sleepPeriod }),
    lines: [
      wanted === 0
        ? F("SleptShort", { period: sleepPeriod })
        : F("SleptRecovered", { fp: gained, previous: current, now: current + gained, max }),
    ],
    good: gained > 0,
  });
  return gained;
}

// ── hiking (pp. 351, 426) ───────────────────────────────────────────────

/** A day on the road: the miles it covers and the fatigue it costs. */
export async function hike(options: {
  actor: any;
  hours: number;
  terrain: Terrain;
  weather: TravelWeather;
  /**
   * Whether it is a hot day. Left out, the day's temperature as the GM set it
   * says, for this marcher (since API 1.138.0).
   */
  hot?: boolean;
  modifier: number;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const derived = actor.system?.derived ?? {};
  // "Hiking defaults to HT-5 for those who have not studied it."
  const hiking = skillLevelOf(actor, "Hiking") ?? attributeOf(actor, "HT") - 5;
  const target = hiking + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  const miles = dailyMiles({
    move: Number(derived.move) || 0,
    terrain: options.terrain,
    weather: options.weather,
    enhancedMove: Number(derived.traitEffects?.enhancedMove) || 1,
    hikingSuccess: outcome.success,
  });
  const day = dayWeather(actor);
  const hot = options.hot ?? day.hot;
  const perHour = marchingFatiguePerHour({
    encumbranceLevel: Number(derived.encumbrance?.level) || 0,
    hot,
  });
  const hours = Math.max(0, Math.floor(options.hours));
  // The hot day's point an hour is its own part, keyed as a battle's is, for
  // the `gworld.fatigueCost` listeners to change (since API 1.147.0).
  const heat = hot ? HOT_DAY_FATIGUE * hours : 0;
  const parts: FatigueCostPart[] = [{ key: "hiking", label: H("MarchPart"), fp: perHour * hours - heat }];
  if (heat > 0) parts.push({ key: "hotDay", label: game.i18n.localize("GWORLD.BattleFatigue.PartHotDay"), fp: heat });
  const pools = await applyFatigue(actor, perHour * hours, { reason: "hiking", details: { hours, hot, temperatureF: day.temperatureF }, parts });

  const lines = [
    F("Miles", { miles, terrain: H(`Terrain.${options.terrain}`), weather: H(`Weather.${options.weather}`) }),
    F("MarchCost", { hours, perHour, fp: pools.fpLost }),
  ];
  if (pools.hpLost > 0) lines.push(F("FatigueInjury", { hp: pools.hpLost }));

  await post(actor, {
    kind: H("Hike"),
    detail: outcome.success ? H("HikingMade") : H("HikingMissed"),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: outcome.success,
    bad: pools.hpLost > 0,
    rolls: [roll],
  });
}

// ── collisions (pp. 430-432) ────────────────────────────────────────────

/** Something moving strikes the character, and the damage is theirs to take. */
export async function struckBy(options: {
  actor: any;
  /** Hit Points of what struck them. */
  objectHp: number;
  objectVelocity: number;
  /** The character's own velocity, for the angle. */
  ownVelocity: number;
  angle: CollisionAngle;
  sharp: DamageType | null;
  /** Size Modifier of what struck them, for an overrun; null when unknown. */
  objectSm: number | null;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const velocity = collisionVelocity({
    angle: options.angle,
    velocity: options.objectVelocity,
    otherVelocity: options.ownVelocity,
  });
  const damage = collisionDamage({ hitPoints: options.objectHp, velocity, sharp: options.sharp });
  const formula = toRollFormula({ dice: damage.dice, adds: damage.modifier });
  const hit = await takeDamage(actor, formula, damage.type);
  const rolls: any[] = [hit.roll, hit.locationRoll];

  const lines = [
    F("CollisionDamage", { formula, rolled: hit.roll.total, location: game.i18n.localize(`GWORLD.HitLocation.${hit.location}`), dr: hit.dr }),
    F("Injury", { injury: hit.injury, previous: hit.previous, now: hit.current }),
  ];

  // "The striking object 'overruns' the struck object."
  const overrun = options.objectSm === null
    ? null
    : overrunDamage({ strikerSm: options.objectSm, struckSm: Number(actor.system?.sm) || 0, strikerHp: options.objectHp });
  if (overrun) {
    const extra = await takeDamage(actor, toRollFormula(overrun), "cr");
    rolls.push(extra.roll, extra.locationRoll);
    lines.push(F("Overrun", { formula: formatDiceAdds(overrun), rolled: extra.roll.total, injury: extra.injury }));
  }

  await post(actor, {
    kind: H("Collision"),
    detail: F("StruckAt", { hp: options.objectHp, velocity, angle: H(`Angle.${options.angle}`) }),
    lines,
    bad: hit.injury > 0,
    rolls,
  });
}

// ── electricity (pp. 432-433) ───────────────────────────────────────────

export type ShockKind = "nonlethal" | "lethal" | "localized";

/**
 * A victim who touches the source (since API 1.119.0): set by a
 * `gworld.afterShock` listener, for a module's rule that a victim can't let go.
 */
export interface ShockContact {
  /** True while the victim can't let go of the source. */
  held: boolean;
  /** What the card says about it; blank for the system's own line. */
  label: string;
}

/** What a shock came to (since API 1.119.0): what `shock` resolves to, and the `gworld.afterShock` context without `actor`. */
export interface ShockOutcome {
  kind: ShockKind;
  /** The caller's name for what gave the shock (since API 1.127.0), or null. */
  source: string | null;
  /** The caller's tags for the shock (since API 1.127.0), for a listener to know its own. */
  tags: string[];
  /** A `gworld.shockModifiers` listener made the victim unaffected: nothing else happened. */
  immune: boolean;
  /** HP of injury the burning damage did; 0 for a nonlethal shock. */
  injury: number;
  /** The burning damage as rolled, before DR (since API 1.127.0); null where there was no damage roll. */
  damageRoll: number | null;
  /** The DR the burning damage met, or null where there was no damage roll. */
  dr: number | null;
  /** Whether the HT roll was made. */
  rolled: boolean;
  /** The HT roll's target and roll, null where there was none. */
  target: number | null;
  roll: number | null;
  success: boolean;
  criticalFailure: boolean;
  /** The roll's margin of success or failure, never negative (see `success`); 0 where there was no roll. */
  margin: number;
  /** The HT modifier the injury gave. */
  injuryModifier: number;
  stunned: boolean;
  /** Seconds the stun is held before the rolls to recover. */
  stunSeconds: number;
  unconscious: boolean;
  unconsciousMinutes: number;
  heartAttack: boolean;
  /** Seconds the caller said the victim stays in contact. */
  contactSeconds: number;
  /** A listener's say on the victim's hold on the source, or null. */
  contact: ShockContact | null;
  /** The card's lines. */
  lines: string[];
}

/** The part of a shock a `gworld.shockModifiers` listener may change (since API 1.119.0). */
export interface ShockModifiers {
  actor: any;
  kind: ShockKind;
  /** The caller's name for what gave the shock (since API 1.127.0), or null. */
  source: string | null;
  /** The caller's tags for the shock (since API 1.127.0). */
  tags: string[];
  formula: string;
  continuous: boolean;
  contactSeconds: number;
  /** The HT modifier for the source's strength. */
  modifier: number;
  /** Points of injury per -1 to the HT roll: 2. 0 or less for none. */
  injuryStep: number;
  /** The failure that stops the heart: 5 for a lethal shock, null (never) otherwise. */
  heartAttackMargin: number | null;
  /**
   * Whether any critical failure stops the heart too (since API 1.127.0):
   * true for a lethal shock, false otherwise. Needs a `heartAttackMargin`.
   */
  heartAttackOnCritical: boolean;
  /** A DR that counts only against this shock, in place of the armour's: 1 in metal armour, otherwise null. */
  dr: number | null;
  /** Roll against a shock whose burning damage did no injury. */
  rollOnZeroInjury: boolean;
  /** The victim is unaffected (since API 1.119.0): no damage, no roll, no stun. */
  immune: boolean;
  lines: string[];
}

/**
 * The part of a shock a `gworld.shockDamage` listener may change (since API
 * 1.127.0): once the burning damage is rolled and taken, before the HT roll.
 */
export interface ShockDamage {
  actor: any;
  kind: ShockKind;
  source: string | null;
  tags: string[];
  formula: string;
  /** The burning damage as rolled, before DR; it may be 0 or less. */
  damageRoll: number;
  /** The DR the damage met. */
  dr: number;
  /** HP of injury it did. */
  injury: number;
  /** The HT modifier the injury gives. */
  injuryModifier: number;
  /** The HT modifier for the source's strength, as `gworld.shockModifiers` left it. */
  modifier: number;
  /** Roll against a shock whose burning damage did no injury. */
  rollOnZeroInjury: boolean;
  lines: string[];
}

/** What a listener left in a field that must be a number, or the fallback. */
function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return value !== null && value !== "" && Number.isFinite(n) ? n : fallback;
}

/** The same for a field a listener may clear with null. */
function numberOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
}

/** A listener's contact, made safe to show and return. */
function contactOf(value: unknown): ShockContact | null {
  if (!value || typeof value !== "object") return null;
  const given = value as { held?: unknown; label?: unknown };
  return { held: given.held === true, label: String(given.label ?? "").trim() };
}

/** Only the strings in a listener's lines. */
function stringLines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === "string" && line.trim() !== "") : [];
}

/** What `shock` is called with (named since API 1.149.0). */
export interface ShockOptions {
  actor: any;
  kind: ShockKind;
  /** The GM's modifier: "+2 for a short circuit in a battery-powered gadget down to -3 or -4 for a stun weapon". */
  modifier: number;
  continuous: boolean;
  /** Burning damage for a lethal or localized shock, as a dice formula. */
  formula: string;
  /** Wearing metal armour, which "provides only DR 1". */
  metalArmor: boolean;
  /**
   * Seconds the victim stays in contact after this roll (since 1.89.0): a
   * continuous or lethal shock holds its stun or unconsciousness that much
   * longer before the rolls to recover. Left out or 0: the current has stopped.
   */
  contactSeconds?: number;
  /** What gave the shock, for the hooks (since API 1.127.0): a module's own name for it. */
  source?: string | null;
  /** Tags for the hooks (since API 1.127.0), so a listener can tell its own shock from another's. */
  tags?: string[];
}

/**
 * A shock, of whichever kind, and the HT roll it calls for. Resolves to what
 * it came to (since API 1.119.0), or null where nothing was done.
 */
export async function shock(options: ShockOptions): Promise<ShockOutcome | null> {
  const { actor } = options;
  if (!mayChange(actor)) return null;

  // Two listeners, or two features of one module, can only tell their own
  // shock from another by what the caller called it.
  const source = typeof options.source === "string" && options.source.trim() ? options.source.trim() : null;
  const tags = Array.isArray(options.tags)
    ? [...new Set(options.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim()))]
    : [];

  const ht = attributeOf(actor, "HT");
  const contact = Math.max(0, Math.floor(Number(options.contactSeconds) || 0));
  const formula = String(options.formula ?? "");
  // No recovery roll while the condition is held (since 1.89.0).
  const hold = (key: string, seconds: number) =>
    applyCondition(actor, { key, holdRecovery: { seconds } }, { setSystemCondition: setCondition, systemConditionLabel: conditionLabel });
  const rolls: any[] = [];
  const lines: string[] = [];
  let injuryModifier = 0;
  let injury = 0;
  let metDr: number | null = null;
  let damageRoll: number | null = null;

  // "1d-3" as the book writes it, made into a formula the dice can roll.
  const dice = options.kind !== "nonlethal" ? parseDiceAdds(formula) : null;
  if (options.kind !== "nonlethal" && formula.trim() && !dice) {
    ui.notifications?.warn(F("BadFormula", { formula }));
    return null;
  }

  // A module's say on the shock before anything is rolled (since API 1.119.0):
  // the GM leaves the HT modifier to the source (p. 432), and metal armour's
  // DR 1 is already a DR that counts only against a shock.
  const asked = callCombatHook<ShockModifiers>(PROCEDURE_HOOKS.shockModifiers, {
    actor,
    kind: options.kind,
    source,
    tags: [...tags],
    formula,
    continuous: options.continuous,
    contactSeconds: contact,
    modifier: Number(options.modifier) || 0,
    injuryStep: SHOCK_INJURY_STEP,
    heartAttackMargin: options.kind === "lethal" ? HEART_ATTACK_MARGIN : null,
    heartAttackOnCritical: options.kind === "lethal",
    dr: options.metalArmor ? METAL_ARMOR_DR : null,
    rollOnZeroInjury: false,
    immune: false,
    lines: [],
  });
  let modifier = numberOr(asked.modifier, Number(options.modifier) || 0);
  const injuryStep = numberOr(asked.injuryStep, SHOCK_INJURY_STEP);
  const heartAttackMargin = numberOrNull(asked.heartAttackMargin, options.kind === "lethal" ? HEART_ATTACK_MARGIN : null);
  const heartAttackOnCritical = typeof asked.heartAttackOnCritical === "boolean" ? asked.heartAttackOnCritical : options.kind === "lethal";
  let rollOnZeroInjury = asked.rollOnZeroInjury === true;
  const shockDr = numberOrNull(asked.dr, options.metalArmor ? METAL_ARMOR_DR : null);
  lines.push(...stringLines(asked.lines));
  // Unaffected: no damage, no roll, no stun -- the listener's lines, or ours.
  const immune = asked.immune === true;
  if (immune && lines.length === 0) lines.push(H("ShockImmune"));

  if (dice && !immune) {
    const hit = await takeDamage(actor, toRollFormula(dice), "burn", {
      drOverride: shockDr === null ? null : Math.max(0, shockDr),
    });
    rolls.push(hit.roll, hit.locationRoll);
    injury = hit.injury;
    metDr = hit.dr;
    damageRoll = Number(hit.roll.total);
    injuryModifier = lethalShockModifier(injury, injuryStep);
    lines.push(F("ShockDamage", { formula, rolled: hit.roll.total, dr: hit.dr, injury, previous: hit.previous, now: hit.current }));

    // The damage as rolled, before the HT roll (since API 1.127.0): a
    // module's rule may make the roll easier or harder for how the dice fell,
    // such as a weak shock whose damage came to nothing.
    const rolled = callCombatHook<ShockDamage>(PROCEDURE_HOOKS.shockDamage, {
      actor,
      kind: options.kind,
      source,
      tags: [...tags],
      formula,
      damageRoll,
      dr: hit.dr,
      injury,
      injuryModifier,
      modifier,
      rollOnZeroInjury,
      lines: [],
    });
    modifier = numberOr(rolled.modifier, modifier);
    if (typeof rolled.rollOnZeroInjury === "boolean") rollOnZeroInjury = rolled.rollOnZeroInjury;
    lines.push(...stringLines(rolled.lines));
  }

  const outcome: ShockOutcome = {
    kind: options.kind,
    source,
    tags: [...tags],
    immune,
    injury,
    damageRoll,
    dr: metDr,
    rolled: false,
    target: null,
    roll: null,
    success: true,
    criticalFailure: false,
    margin: 0,
    injuryModifier,
    stunned: false,
    stunSeconds: 0,
    unconscious: false,
    unconsciousMinutes: 0,
    heartAttack: false,
    contactSeconds: contact,
    contact: null,
    lines,
  };

  // What the modules make of it, once it is applied and before the card
  // (since API 1.119.0): a victim who can't let go, say.
  const heard = (): ShockOutcome => {
    const context = callCombatHook(PROCEDURE_HOOKS.afterShock, { actor, ...outcome, lines: [...lines] });
    outcome.contact = contactOf(context.contact);
    outcome.lines = stringLines(context.lines);
    if (outcome.contact?.held) outcome.lines.push(outcome.contact.label || H("ShockCantLetGo"));
    return outcome;
  };

  if (immune) {
    const result = heard();
    await post(actor, { kind: H("Shock"), detail: H(`ShockKind.${options.kind}`), lines: result.lines, rolls });
    return result;
  }

  // Nothing got through: a lethal shock that did no injury asks for no roll,
  // unless a module says it does.
  if (options.kind !== "nonlethal" && injury === 0 && !rollOnZeroInjury) {
    lines.push(H("ShockHarmless"));
    const result = heard();
    await post(actor, { kind: H("Shock"), detail: H(`ShockKind.${options.kind}`), lines: result.lines, rolls });
    return result;
  }

  const target = healthRollScore(actor) + modifier + injuryModifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  rolls.push(roll);
  const resolved = resolveSuccess(roll.total, target, dieResults(roll));
  Object.assign(outcome, {
    rolled: true,
    target,
    roll: roll.total,
    success: resolved.success,
    criticalFailure: resolved.criticalFailure,
    margin: resolved.margin,
  });

  let bad = false;
  if (options.kind === "lethal") {
    const result = lethalShock({
      success: resolved.success, criticalFailure: resolved.criticalFailure, margin: resolved.margin, ht, heartAttackMargin,
      heartAttackOnCritical,
    });
    if (result.unconscious) {
      // Out while the current flows, and (20 - HT) minutes after.
      await hold("unconscious", contact + result.unconsciousMinutes * 60);
      lines.push(F("ShockOut", { minutes: result.unconsciousMinutes, dazed: result.dazedMinutes }));
      bad = true;
    } else {
      lines.push(H("ShockHeld"));
    }
    outcome.unconscious = result.unconscious;
    outcome.unconsciousMinutes = result.unconsciousMinutes;
    outcome.heartAttack = result.heartAttack;
  } else {
    const result = options.kind === "localized"
      ? localizedShock({ success: resolved.success })
      : nonlethalShock({ success: resolved.success, ht, continuous: options.continuous });
    if (result.stunned) {
      // Stunned while the current flows, and its seconds after (p. 432).
      const seconds = result.stunSeconds + (options.kind === "nonlethal" && options.continuous ? contact : 0);
      await actor.update({ "system.conditions.stunned": true });
      await hold("stunned", seconds);
      lines.push(F("ShockStunned", { seconds }));
      outcome.stunned = true;
      outcome.stunSeconds = seconds;
      bad = true;
    } else {
      lines.push(H("ShockHeld"));
    }
    // The Basic Set stops no heart here; a module's margin may, and its say
    // on whether a critical failure counts too (since API 1.127.0).
    outcome.heartAttack = shockHeartAttack({
      success: resolved.success, criticalFailure: resolved.criticalFailure, margin: resolved.margin, heartAttackMargin,
      criticalFailureCounts: heartAttackOnCritical,
    });
  }
  if (outcome.heartAttack) {
    lines.push(F("HeartAttack", { margin: heartAttackMargin ?? HEART_ATTACK_MARGIN }));
    bad = true;
  }

  const result = heard();
  await post(actor, {
    kind: H("Shock"),
    detail: H(`ShockKind.${options.kind}`),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: result.lines,
    good: !bad,
    bad,
    rolls,
  });
  return result;
}

// ── fire (pp. 433-434) ──────────────────────────────────────────────────

/** Seconds in the flames, a roll of burning damage for each. */
export async function burn(options: { actor: any; exposure: FireExposure; seconds: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const dice = FIRE_DAMAGE[options.exposure];
  const seconds = Math.max(1, Math.min(60, Math.floor(options.seconds)));
  const rolls: any[] = [];
  let injury = 0;
  const previous = Number(actor.system?.hp?.value) || 0;
  let current = previous;
  let rolledTotal = 0;
  for (let i = 0; i < seconds; i++) {
    const hit = await takeDamage(actor, toRollFormula(dice), "burn");
    rolls.push(hit.roll);
    injury += hit.injury;
    rolledTotal += hit.roll.total;
    current = hit.current;
  }

  await post(actor, {
    kind: H("Fire"),
    detail: F("Burned", { seconds, exposure: H(`Exposure.${options.exposure}`), formula: formatDiceAdds(dice) }),
    lines: [
      F("FireRolled", { total: rolledTotal }),
      F("Injury", { injury, previous, now: current }),
    ],
    bad: injury > 0,
    rolls,
  });
}

/**
 * Whether a flame sets a material alight (Campaigns p. 433).
 *
 * A flame strong enough lights it outright. One a category or two short can
 * still do it given time: "for every 10 seconds of contact", materials one
 * category up "catch fire on a 16 or less; those two categories up ... on a 6
 * or less" -- so the contact is rolled out in ten-second spells until it
 * catches or the time runs out.
 */
export async function setAlight(options: {
  actor: any;
  material: Flammability;
  flameDamagePerSecond: number;
  seconds: number;
}): Promise<void> {
  const { actor } = options;
  const lines: string[] = [];
  const rolls: any[] = [];

  if (ignites(options.material, options.flameDamagePerSecond)) {
    lines.push(H("AlightAtOnce"));
    await post(actor, { kind: H("Fire"), lines, bad: true });
    return;
  }

  const target = prolongedContactTarget(options.material, options.flameDamagePerSecond);
  if (target === null) {
    lines.push(H("NeverAlight"));
    await post(actor, { kind: H("Fire"), lines, good: true });
    return;
  }

  const spells = Math.max(1, Math.floor(Math.max(0, options.seconds) / 10));
  let caughtAfter: number | null = null;
  for (let spell = 1; spell <= spells; spell += 1) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    if (roll.total <= target) {
      caughtAfter = spell * 10;
      break;
    }
  }
  lines.push(F("ProlongedContact", { target, spells }));
  lines.push(caughtAfter === null ? H("DidNotCatch") : F("CaughtAfter", { seconds: caughtAfter }));
  await post(actor, { kind: H("Fire"), lines, bad: caughtAfter !== null, rolls });
}

/** A single blow of burning damage, and whether it set the clothes alight. */
export async function catchFire(options: { actor: any; basicBurningDamage: number; tightBeam: boolean }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  // "Remember to divide damage from tight-beam burning attacks by 10".
  const basic = options.tightBeam ? options.basicBurningDamage / 10 : options.basicBurningDamage;
  const burning = catchingFire(basic);
  // On fire is on fire, whatever caught (p. 433).
  if (burning) await setCondition(actor, "burning", true);
  await post(actor, {
    kind: H("Fire"),
    detail: F("BlowOfBurning", { damage: options.basicBurningDamage }),
    lines: burning
      ? [
          F(`Alight.${burning.alight}`, { formula: formatDiceAdds(burning.damage), dx: burning.dxPenalty }),
          F("PutOut", { readies: burning.readiesToPutOut }),
        ]
      : [H("NotAlight")],
    bad: burning !== null,
  });
}

// ── Fragile (Characters pp. 136-137) ────────────────────────────────────

/**
 * The kinds of Fragile a thing has: a character's from their traits, a
 * vehicle's -- the actor or the Gear-tab item -- from the codes beside its HT
 * (Campaigns p. 463).
 */
export function fragileKindsOf(subject: any): FragileKind[] {
  const vehicle = subject?.system?.vehicle;
  if (vehicle) return fragileFromVehicleCodes(fragilityCodes(vehicle.fragility));
  return traitsOf(subject).fragile ?? [];
}

/** The lines a body set alight gets: what it costs a second, and how it goes out. */
function alightLines(): string[] {
  return [
    F("FragileBurning", { formula: formatDiceAdds(FRAGILE_BURNING) }),
    F("FragilePutOut", { seconds: FRAGILE_ROLLING_SECONDS }),
  ];
}

/**
 * A Combustible or Flammable body caught by a blow (p. 136): alight outright,
 * or a HT roll at the modifier `fragileIgnition` gave to avoid it.
 */
export async function fragileCatchesFire(options: { actor: any; automatic: boolean; modifier: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  if (options.automatic) {
    await setCondition(actor, "burning", true);
    await post(actor, { kind: H("Fragile"), detail: H("FragileAlight"), lines: alightLines(), bad: true });
    return;
  }
  const target = healthRollScore(actor) + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  if (!outcome.success) await setCondition(actor, "burning", true);
  await post(actor, {
    kind: H("Fragile"),
    detail: F("FragileIgnitionRoll", { modifier: options.modifier >= 0 ? `+${options.modifier}` : String(options.modifier) }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: outcome.success ? [H("FragileNotAlight")] : [H("FragileAlight"), ...alightLines()],
    good: outcome.success,
    bad: !outcome.success,
    rolls: [roll],
  });
}

/**
 * An Explosive body going up (p. 137): "a 6d×(HP/10) crushing explosion. The
 * blast instantly reduces you to -10×HP, regardless of the damage it
 * inflicts." The blast is for whoever stands near to take; the body is gone.
 */
export async function fragileExplodes(options: { actor: any; cause: string }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const vehicle = actor.system?.vehicle;
  const hitPoints = vehicle ? Number(vehicle.stHp) || 0 : Number(actor.system?.hp?.max) || 0;
  const blast = fragileExplosion(hitPoints);
  const multiplier = Math.round(blast.multiplier * 10) / 10;
  if (actor.documentName === "Actor") {
    await actor.update({ "system.hp.value": blast.hpAfter });
    await syncHealthConditions(actor);
    await setCondition(actor, "dead", true);
  }
  await post(actor, {
    kind: H("Fragile"),
    detail: options.cause,
    lines: [
      F("FragileExplodes", { dice: blast.dice, multiplier }),
      F("FragileDestroyed", { hp: blast.hpAfter }),
    ],
    bad: true,
  });
}

/**
 * A Brittle limb crippled (p. 136): "it breaks off. If you can make a HT
 * roll, it falls off in one piece; otherwise, it shatters or liquefies
 * irrecoverably."
 */
export async function rollBrittleLimb(options: { actor: any; location: string }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const target = healthRollScore(actor);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const location = game.i18n.localize(`GWORLD.HitLocation.${options.location}`);
  await post(actor, {
    kind: H("Fragile"),
    detail: F("BrittleBreaksOff", { location }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [F(`Brittle.${brittleLimb(outcome)}`, { location })],
    good: outcome.success,
    bad: !outcome.success,
    rolls: [roll],
  });
}

/**
 * What Fragile adds to a hit on a vehicle (pp. 136-137; Campaigns p. 463),
 * as lines for the card: whether it caught fire, and whether an Explosive one
 * went up on the HT roll its major wound calls for. The vehicle's HT is what
 * it rolls against; a vehicle actor is set alight, or wrecked outright.
 */
async function vehicleFragileLines(options: {
  item: any;
  vehicle: any;
  injury: number;
  hitPoints: number;
  location: VehicleLocation;
  damageType: DamageType;
  /** An explosion, which sets things alight as a burning attack does. */
  explosive: boolean;
  rolls: any[];
}): Promise<string[]> {
  const kinds = fragileKindsOf(options.item);
  if (kinds.length === 0 || options.injury <= 0) return [];
  const lines: string[] = [];
  const ht = Number(options.vehicle.ht) || 10;
  const majorWound = options.injury > options.hitPoints / 2;
  const isActor = options.item?.documentName === "Actor";
  const htRoll = async (target: number) => {
    const roll = new Roll("3d6");
    await roll.evaluate();
    options.rolls.push(roll);
    return { roll, outcome: resolveSuccess(roll.total, target, dieResults(roll)) };
  };

  const ignition = fragileIgnition({
    kinds,
    injury: options.injury,
    majorWound,
    burningOrExplosive: options.damageType === "burn" || options.explosive,
    vitals: options.location === "vitalArea",
  });
  let alight = ignition.kind === "alight";
  if (ignition.kind === "roll") {
    const { roll, outcome } = await htRoll(ht + ignition.modifier);
    alight = !outcome.success;
    lines.push(F("VehicleIgnitionRoll", { target: ht + ignition.modifier, roll: roll.total }));
  }
  if (alight) {
    lines.push(H("FragileAlight"), ...alightLines());
    if (isActor && options.item.isOwner) await setCondition(options.item, "burning", true);
  } else if (ignition.kind === "roll") {
    lines.push(H("FragileNotAlight"));
  }

  // "On any critical failure on the HT roll for a major wound, you explode!"
  if (majorWound && kinds.includes("explosive")) {
    const { roll, outcome } = await htRoll(ht);
    lines.push(F("VehicleMajorWoundRoll", { target: ht, roll: roll.total }));
    if (explodesOnMajorWound(kinds, outcome)) {
      const blast = fragileExplosion(options.hitPoints);
      lines.push(
        F("FragileExplodes", { dice: blast.dice, multiplier: Math.round(blast.multiplier * 10) / 10 }),
        F("FragileDestroyed", { hp: blast.hpAfter }),
      );
      if (isActor && options.item.isOwner) {
        await options.item.update({ "system.hp.value": blast.hpAfter });
        await setCondition(options.item, "dead", true);
      }
    }
  }
  return lines;
}

// ── radiation (pp. 435-436) ─────────────────────────────────────────────

/** What `irradiate` is called with (named since API 1.155.0). */
export interface IrradiateOptions {
  actor: any;
  rads: number;
  /** The shielding's Protection Factor, 1 for none. */
  protectionFactor: number;
  modifier: number;
}

/** A dose of radiation, added to what is already carried, and the HT roll it asks for. */
export async function irradiate(options: IrradiateOptions): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const stored = actor.system?.radiation ?? { dose: 0, at: 0 };
  const now = Date.now();
  const daysSince = stored.at ? (now - Number(stored.at)) / 86400000 : 0;
  // What is left of the old dose, then the new one after shielding and
  // Radiation Tolerance.
  const healed = remainingDose(Number(stored.dose) || 0, daysSince);
  const tolerance = Number(actor.system?.derived?.radiationTolerance) || 1;
  // A module may change the dose before shielding: a drug that halves it, say (since API 1.63.0).
  const dosed = callCombatHook(PROCEDURE_HOOKS.radiationDose, {
    actor, rads: options.rads, protectionFactor: options.protectionFactor, sources: [] as string[],
  });
  const rads = Math.max(0, Number(dosed.rads) || 0);
  const received = protectedDose(rads, Math.max(1, options.protectionFactor) * tolerance);
  const accumulated = healed + received;
  await actor.update({ "system.radiation.dose": accumulated, "system.radiation.at": now });

  const row = radiationRow(accumulated);
  if (!row) {
    await post(actor, {
      kind: H("Radiation"),
      detail: F("Dosed", { rads: Math.round(received * 10) / 10, total: Math.round(accumulated * 10) / 10 }),
      lines: [H("NoDose")],
    });
    return;
  }

  const target = healthRollScore(actor) + row.htModifier + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const effect = radiationEffect(row, outcome);

  await post(actor, {
    kind: H("Radiation"),
    detail: F("Dosed", { rads: Math.round(received * 10) / 10, total: Math.round(accumulated * 10) / 10 }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [H(`Effect.${effect === "-" ? "none" : effect}`)],
    good: effect === "-",
    bad: effect !== "-",
    rolls: [roll],
  });
}

// ── vehicles (p. 466) ───────────────────────────────────────────────────

/**
 * Leaving a moving vehicle (Campaigns p. 467): "Anyone who jumps or falls
 * from a moving vehicle and hits the ground takes a collision with an
 * immovable object at the vehicle's speed. If the vehicle is flying, add
 * falling damage."
 *
 * The fall is the existing falling card's business, so this rolls the
 * collision and says when a fall is owed on top of it.
 */
export async function jumpOutOfVehicle(options: {
  actor: any;
  /** The vehicle: an item on the Gear tab, or a vehicle actor on the map. */
  vehicle: any;
  speed: number;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const item = options.vehicle;
  const vehicle = item?.system?.vehicle;
  if (!item || !vehicle) return;

  const hitPoints = Number(actor.system?.hp?.max) || 10;
  const speed = Math.max(0, options.speed);
  const damage = jumpFromVehicle({ hitPoints, vehicleSpeed: speed });
  const formula = toRollFormula({ dice: damage.dice, adds: damage.modifier });
  const hit = await takeDamage(actor, formula, damage.type);

  // "If the vehicle is flying, add falling damage" -- which is the falling
  // card's own business, and how far it fell is the table's to say.
  const flying = mediumOf(activeMove(vehicle).locomotion) === "air";
  await post(actor, {
    kind: H("JumpOut"),
    detail: F("JumpedFrom", { vehicle: String(item.name), speed }),
    lines: [
      F("JumpDamage", {
        formula,
        rolled: hit.roll.total,
        location: game.i18n.localize(`GWORLD.HitLocation.${hit.location}`),
        dr: hit.dr,
      }),
      F("Injury", { injury: hit.injury, previous: hit.previous, now: hit.current }),
      ...(flying ? [H("JumpFalling")] : []),
    ],
    rolls: [hit.roll, hit.locationRoll],
  });
}

/** A control roll, against the skill the vehicle names, at its Handling. */
export async function controlVehicle(options: {
  /** The operator: the one whose skill this is rolled against. */
  actor: any;
  /** The vehicle: an item on the Gear tab, or a vehicle actor on the map. */
  vehicle: any;
  modifier: number;
  /**
   * Why the roll is made (Campaigns p. 466; since API 1.115.0): hard braking,
   * a hazard, a maneuver -- a tag of the caller's, such as `hardBraking`. It
   * joins the roll's tags, so a listener can tell one control roll from another.
   */
  reason?: string;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const item = options.vehicle;
  const reason = String(options.reason ?? "").trim();
  const vehicle = item?.system?.vehicle;
  if (!item || !vehicle) return;

  const skillName = String(vehicle.skill ?? "");
  const own = skillLevelOf(actor, skillName);
  // Control skills default to DX-5 at worst; someone who never learned
  // Driving still grabs the wheel.
  const skill = own ?? attributeOf(actor, "DX") - 5;
  // The figures as a state that lasts leaves them (API 1.115.0).
  const stats = vehicleStats(item);
  const handling = stats.handling;
  // A vehicle of another TL than the operator's skill, or a make they don't
  // know (Characters pp. 168-169; since API 1.95.0): the lines any roll with
  // the vehicle as its item takes, keyed and tagged `techLevel` and
  // `unfamiliar`.
  const use = equipmentUseLines(actor, item, skillName);
  if (use.impossible) {
    ui.notifications?.warn(use.impossible);
    return;
  }
  const given = use.lines.map((line) => ({ key: line.key, label: line.label, value: line.value }));
  // What the operator's conditions and the modules add: a stabilizer, a
  // driver's aid (API 1.76.0, tagged "vehicleControl").
  // A bonus held for the roll counts on it, and a listener may refuse it
  // (since API 1.144.0): no dice, and a card that says why.
  const hooked = procedureRoll({
    actor, label: H("Control"), kind: "skill", skill: skillName, base: skill,
    tags: ["vehicleControl", ...use.tags, ...(reason ? [reason] : [])], modifiers: [...given], vehicle: item, item,
    ...(reason ? { reason } : {}),
  }, { refusable: true });
  // The TL lines as the listeners left them, and what they added.
  const lines = [...given, ...hooked.added].filter((line) => line.value !== 0);
  const target = skill + handling + options.modifier + lines.reduce((sum, line) => sum + line.value, 0);
  if (hooked.refusal !== null) {
    ui.notifications?.warn(hooked.refusal);
    const shown = [
      { label: game.i18n.localize("GWORLD.Vehicle.Handling"), value: handling },
      { label: game.i18n.localize("GWORLD.Chat.Situational"), value: options.modifier },
      ...lines,
    ];
    await postRefusal({ actor, base: skill, label: `${H("Control")}: ${String(item.name ?? "")}`, kind: "skill" }, {
      reason: hooked.refusal, modifiers: shown, totalModifier: target - skill, effective: target,
    });
    return;
  }
  const roll = new Roll("3d6");
  await roll.evaluate();
  await hooked.spend();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const stabilityRating = stats.stability;
  const result = controlRoll({
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    margin: outcome.margin,
    stabilityRating,
  });

  // "To control his vehicle, the operator must take a Move or Move and
  // Attack maneuver on his turn... If the operator takes any other
  // maneuver, or is stunned or otherwise incapacitated, his vehicle plows
  // ahead with the same speed and course it had on the previous turn"
  // (Campaigns p. 467).
  const notes: string[] = lines.map((line) => `${line.label} ${line.value >= 0 ? "+" : "−"}${Math.abs(line.value)}`);
  if (isRuleOn("vehicleManeuvers")) {
    const movement = vehicleMovement({
      maneuver: String(actor.system?.maneuver ?? ""),
      incapacitated: actor.system?.conditions?.stunned === true,
    });
    notes.push(H(`Movement.${movement}`));
  }
  notes.push(H(`ControlResult.${result}`));
  if (result !== "ok") {
    // What losing control actually does depends on what the thing moves
    // through (Campaigns p. 469) -- the way it is moving now, for one that
    // moves two ways.
    const move = stats.move;
    const medium = mediumOf(move.locomotion);
    const lost = lossOfControl({
      medium,
      stabilityRating,
      margin: Math.abs(outcome.margin),
      criticalFailure: outcome.criticalFailure,
      velocity: move.topSpeed,
    });
    notes.push(H(`LostControl.${lost.result}`));
    if (lost.altitudeLost > 0) notes.push(F("AltitudeLost", { yards: lost.altitudeLost }));
    if (lost.decelerated > 0) notes.push(F("Decelerated", { yards: lost.decelerated }));
    if (lost.skidYards > 0) notes.push(F("SkidYards", { yards: lost.skidYards }));
    // "A failed control roll always erases any accumulated bonuses for Aim
    // maneuvers, and gives a penalty equal to the margin of failure to any
    // attack from the vehicle until the operator's next turn."
    notes.push(F("AttacksFrom", { penalty: -Math.abs(outcome.margin) }));
    await loseAim(actor, "moved");
  }

  await post(actor, {
    kind: H("Control"),
    detail: F("Controlled", { vehicle: String(item.name), skill: skillName || "DX-5", handling: handling >= 0 ? `+${handling}` : String(handling) }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: notes,
    good: result === "ok",
    bad: result === "major" || result === "disaster",
    rolls: [roll],
  });
}

/** Every location the Vehicle Hit Location Table names. */
const TABLE_LOCATIONS: ReadonlySet<string> = new Set(Object.values(VEHICLE_HIT_LOCATIONS).flatMap((row) => row.locations));

/**
 * Where a shot at a vehicle landed, what its DR stopped, and who inside it
 * caught something (Campaigns pp. 462, 554-555).
 *
 * The location is rolled on the vehicle's own table, and only the locations
 * the vehicle actually has are on it -- "if a random location doesn't exist
 * ... treat it as body hit" -- unless the shooter aimed at one. The DR there
 * is the face the shot came in on, a location's own figure, or half the face
 * for a window, offered to `gworld.vehicleDr` listeners before it counts
 * (since 1.79.0). What it takes to cripple that location is its own share of
 * the vehicle's HP. Then, "whenever five or more points of damage penetrate
 * an occupied location ... roll 3d on the Occupant Hit Table", and whoever
 * was hit takes "1d cutting damage per five full points".
 */
export async function shootAtVehicle(options: {
  /** Whose card this is: the shooter, or the vehicle itself. */
  actor: any;
  /** The vehicle: an item on the Gear tab, or a vehicle actor on the map. */
  vehicle: any;
  /**
   * The shot's basic damage, before DR (since 1.79.0). The vehicle's DR at
   * the spot is worked out and taken off it.
   */
  damage?: number;
  /** The attack's armour divisor, 1 for none (since 1.79.0). */
  armorDivisor?: number;
  /** True for an attack that ignores DR (since 1.79.0). */
  ignoresDr?: boolean;
  /**
   * Damage already through the DR, as the table worked it out: read when
   * `damage` is not given, and then no DR is read at all.
   */
  penetrating?: number;
  /** The location aimed at, or null to roll for it (since 1.79.0). */
  location?: VehicleLocation | null;
  /** The face the shot came in on, or null for the table's figure (since 1.79.0). */
  arc?: VehicleArc | null;
  occupants: number;
  /** What got through: a bullet and a flamethrower do very different things to a car. */
  damageType: DamageType;
  /** True for a tight-beam burn, which a vital area doubles and a torch does not. */
  tightBeam: boolean;
  /** True for an explosion, which sets a Combustible or Flammable vehicle alight as fire does (since 1.93.0). */
  explosive?: boolean;
  /** The weapon and its attack mode, when known, for `gworld.vehicleDr` (since 1.79.0). */
  item?: any;
  mode?: any;
}): Promise<VehicleHit | null> {
  const { actor } = options;
  const item = options.vehicle;
  const vehicle = item?.system?.vehicle;
  if (!item || !vehicle) return null;

  const hitPoints = Number(vehicle.stHp) || 0;
  const sm = Number(vehicle.sm) || 0;
  const rolls: any[] = [];
  // "A powered vehicle (anything with a ST attribute) has vital areas", and is
  // Unliving where an unpowered one is Homogenous (p. 555). The same test the
  // vehicle's own sheet uses, so the two cannot disagree about one car.
  const powered = hitPoints > 0 && vehicleMoves(vehicle).some((move) => move.acceleration > 0);

  // A shot aimed at a location lands there; anything else is rolled for.
  const aimed = options.location && TABLE_LOCATIONS.has(options.location) ? options.location : null;
  let locationRoll: any = null;
  let hit: { location: VehicleLocation; choices: VehicleLocation[]; penalty: number; fellToBody: boolean };
  if (aimed) {
    hit = { location: aimed, choices: [aimed], penalty: vehicleLocationPenalty(aimed), fellToBody: false };
  } else {
    locationRoll = new Roll("3d6");
    await locationRoll.evaluate();
    rolls.push(locationRoll);
    hit = vehicleHitLocation({
      roll: locationRoll.total,
      has: locationsOf(String(vehicle.locations ?? "")),
      powered,
    });
  }

  const lines: string[] = [];
  const name = game.i18n.localize(`GWORLD.Vehicle.Location.${hit.location}`);
  const toAim = hit.penalty + sm;
  lines.push(
    F("HitLocation", {
      location: name,
      penalty: toAim >= 0 ? `+${toAim}` : String(toAim),
      ...(hit.fellToBody ? { note: H("FellToBody") } : { note: "" }),
    }),
  );
  if (hit.choices.length > 1) {
    lines.push(F("AttackerPicks", {
      choices: hit.choices.map((c) => game.i18n.localize(`GWORLD.Vehicle.Location.${c}`)).join(", "),
    }));
  }

  const arc = options.arc ?? null;
  let penetrating: number;
  if (options.damage !== undefined && options.damage !== null) {
    // The vehicle's DR where the shot landed, as one line a listener may
    // double against one kind of attack, refuse, or add to (since 1.79.0).
    const at = vehicleDrAt(vehicle, hit.location, arc);
    const drLines: VehicleDrLine[] = at.source === "none"
      ? []
      : [{
          label: game.i18n.localize(`GWORLD.Hazard.VehicleDrSource.${at.source}`),
          dr: at.dr,
          applies: true,
          hardened: 0,
        }];
    const armorDivisor = Number(options.armorDivisor) > 0 ? Number(options.armorDivisor) : 1;
    const basicDamage = Math.max(0, Math.floor(Number(options.damage) || 0));
    callCombatHook(COMBAT_HOOKS.vehicleDr, {
      vehicle: item,
      actor,
      item: options.item ?? null,
      mode: options.mode ?? null,
      location: hit.location,
      arc,
      damageType: options.damageType,
      basicDamage,
      armorDivisor,
      ignoresDr: options.ignoresDr === true,
      tightBeam: options.tightBeam,
      lines: drLines,
    });
    const through = vehiclePenetration({
      basicDamage,
      lines: drLines,
      armorDivisor,
      ignoresDr: options.ignoresDr === true,
    });
    penetrating = through.penetrating;
    const counted = drLines
      .filter((line) => line.applies !== false)
      .map((line) => `${line.label} ${Math.max(0, Math.floor(Number(line.dr) || 0))}${line.reason ? ` (${line.reason})` : ""}`);
    lines.push(F("VehicleDr", {
      arc: arc ? game.i18n.localize(`GWORLD.Vehicle.Arc.${arc}`) : game.i18n.localize("GWORLD.Vehicle.Arc.none"),
      dr: counted.length > 0 ? counted.join(", ") : "0",
      divisor: options.ignoresDr === true ? H("IgnoresDr") : armorDivisor === 1 ? "" : F("AtDivisor", { divisor: armorDivisor }),
      effective: through.effectiveDr,
      damage: basicDamage,
      penetrating,
    }));
  } else {
    penetrating = Math.max(0, Math.floor(Number(options.penetrating) || 0));
    // Worked out at the table already; the window's figure is still worth saying.
    if (hit.location === "largeWindow" || hit.location === "smallWindow") {
      lines.push(F("WindowDr", { dr: vehicleDrAt(vehicle, hit.location, arc).dr }));
    }
  }

  // The wound, not the raw damage, is what comes off: a bullet into a car's
  // body is a third of itself, and into its fuel tank three times (pp. 380, 555).
  // Where the hit passes to a person or an animal, "the vehicle takes no
  // damage" (p. 555).
  const wound = {
    damageType: options.damageType,
    tightBeam: options.tightBeam,
    location: hit.location,
    powered,
  };
  const struck = passesThrough(hit.location);
  const injury = struck ? 0 : vehicleInjury({ penetrating, ...wound });
  const threshold = crippleThreshold(hit.location, hitPoints, {
    wheels: locationCount(String(vehicle.locations ?? ""), "wheel"),
    masts: locationCount(String(vehicle.locations ?? ""), "mast"),
  });
  if (threshold !== null) {
    lines.push(
      injury > threshold
        ? F("Crippled", { location: name, threshold: Math.floor(threshold) })
        : F("NotCrippled", { location: name, threshold: Math.floor(threshold) }),
    );
  }
  if (penetrating > 0 && !struck) {
    lines.push(F("Wound", {
      penetrating,
      modifier: Math.round(vehicleWoundingModifier(wound) * 100) / 100,
      injury,
    }));
  }
  if (hit.location === "vitalArea") lines.push(H("VitalArea"));
  if (hitsAPerson(hit.location)) lines.push(F("HitsAPerson", { location: name }));
  if (hit.location === "draftAnimal") lines.push(F("HitsAnAnimal", { location: name, damage: penetrating }));

  // The people inside, when enough got through to matter and there is anybody
  // in there to matter to. An empty car has no occupant to roll for.
  let occupantHit: { dice: number } | null = null;
  if (penetrating >= OCCUPANT_RISK_DAMAGE && !struck && options.occupants > 0) {
    const target = occupantHitTarget(options.occupants, sm);
    const occupantRoll = new Roll("3d6");
    await occupantRoll.evaluate();
    rolls.push(occupantRoll);
    if (occupantRoll.total <= target) {
      const damage = occupantDamage(penetrating);
      occupantHit = { dice: damage.dice };
      lines.push(F("OccupantHit", { roll: occupantRoll.total, target, dice: damage.dice }));
    } else {
      lines.push(F("OccupantMissed", { roll: occupantRoll.total, target }));
    }
  }

  // A vehicle on the map keeps hit points, and this is what takes them off.
  // A catalogue entry on somebody's Gear tab has none to take: the card says
  // what the shot did, and the GM decides what became of the car.
  //
  // A crippled wheel, track, runner, rotor, wing or mast is counted on it
  // too, in the same update, and the Move it has reads that from then on
  // (p. 555; since API 1.134.0). The count stops at what the Locations
  // entry lists: four wheels can't be crippled five times over.
  const crippled = threshold !== null && injury > threshold;
  if (item.documentName === "Actor" && item.isOwner && injury > 0) {
    const before = Number(item.system?.hp?.value) || 0;
    const changes: Record<string, number> = { "system.hp.value": before - injury };
    if (crippled && (MOVE_CRIPPLING_LOCATIONS as readonly string[]).includes(hit.location)) {
      const had = Math.max(0, Math.floor(Number(item.system?.crippled?.[hit.location]) || 0));
      const listed = locationCount(String(vehicle.locations ?? ""), hit.location);
      const now = listed > 0 ? Math.min(listed, had + 1) : had + 1;
      if (now !== had) changes[`system.crippled.${hit.location}`] = now;
    }
    await item.update(changes);
    lines.push(F("VehicleHp", { previous: before, now: before - injury, max: hitPoints }));
  }

  // A Combustible, Flammable or Explosive vehicle may catch fire or go up
  // (Campaigns p. 463; Characters pp. 136-137) -- after its hit points are
  // taken, since blowing up sets them to -10×HP whatever the shot did.
  if (!struck) {
    lines.push(...(await vehicleFragileLines({
      item, vehicle, injury, hitPoints, location: hit.location, damageType: options.damageType,
      explosive: options.explosive === true, rolls,
    })));
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Vehicle.ShotAt"),
    detail: F("ShotAtDetail", { vehicle: String(item.name), damage: penetrating }),
    ...(locationRoll ? { dice: dieResults(locationRoll), roll: locationRoll.total } : {}),
    lines,
    bad: penetrating > 0,
    rolls,
  });

  // And the modules hear what it did, once it is done (since API 1.115.0),
  // for what follows from a hit rather than what the hit meets.
  const result: VehicleHit = {
    location: hit.location,
    arc,
    damageType: options.damageType,
    penetrating,
    injury,
    crippled,
    passedThrough: struck,
    occupantHit,
  };
  callCombatHook(COMBAT_HOOKS.afterVehicleHit, {
    vehicle: item, actor, item: options.item ?? null, mode: options.mode ?? null, ...result,
  });
  return result;
}

/** What a shot at a vehicle did (since API 1.115.0). */
export interface VehicleHit {
  location: VehicleLocation;
  arc: VehicleArc | null;
  damageType: DamageType;
  /** Damage through the DR. */
  penetrating: number;
  /** HP the vehicle lost, after the location's wounding modifier; 0 where the hit passed to a person or animal. */
  injury: number;
  /** Whether the location was crippled. */
  crippled: boolean;
  /** True where the hit passed to a person or an animal and the vehicle took none of it (p. 555). */
  passedThrough: boolean;
  /** An occupant struck, with the dice of cutting damage they take, or null. */
  occupantHit: { dice: number } | null;
}

// ── acid, air, pressure and motion (pp. 428-437) ────────────────────────────

/**
 * A splash, a bath or a mouthful of acid (Campaigns p. 428).
 *
 * "Most laboratory acids are dangerous only to the eyes, but strong or highly
 * concentrated acids can 'burn' through equipment and flesh." What is rolled
 * depends entirely on how it was met, so the contact is the only thing asked
 * for; where the eyes are at risk, they get their own roll.
 */
export async function splashAcid(options: {
  actor: any;
  contact: AcidContact;
  landing: AcidLanding;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const harm = acidHarm(options.contact);
  const formula = toRollFormula(harm.damage);
  // Armour is between the acid and the skin for a splash or a bath. It is not
  // between the acid and the stomach: "if the victim swallows acid, he takes
  // 3d damage at the rate of 1 HP per 15 minutes", and a breastplate has
  // nothing to say about that.
  const hit = await takeDamage(actor, formula, ACID_DAMAGE_TYPE as DamageType, {
    ...(options.contact === "swallowed" ? { drOverride: 0 } : {}),
  });
  const rolls: any[] = [hit.roll, hit.locationRoll];

  const lines = [
    F("AcidDamage", {
      formula,
      rolled: hit.roll.total,
      location: game.i18n.localize(`GWORLD.HitLocation.${hit.location}`),
      dr: hit.dr,
    }),
    F("Injury", { injury: hit.injury, previous: hit.previous, now: hit.current }),
  ];
  if (harm.everySeconds > 0) {
    lines.push(harm.overTime ? H("AcidOverTime") : F("AcidAgain", { seconds: harm.everySeconds }));
  }

  // "If the acid splashes on his face, he must make a HT roll to avoid eye
  // damage. On a failure, or on a direct hit to the eyes, the damage is to his
  // eyes." Swallowing it never reaches them.
  const risk = harm.risksEyes ? eyeRisk(options.landing) : { rolls: false, automatic: false };
  if (risk.automatic) {
    lines.push(H("AcidEyes.damaged"));
  } else if (risk.rolls) {
    const target = attributeOf(actor, "HT");
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const outcome = resolveSuccess(roll.total, target, dieResults(roll));
    lines.push(F("AcidEyeRoll", { roll: roll.total, target }));
    lines.push(H(`AcidEyes.${eyeOutcome(outcome)}`));
  }

  await post(actor, {
    kind: H("Acid"),
    detail: H(`AcidContact.${options.contact}`),
    lines,
    bad: hit.injury > 0,
    rolls,
  });
}

/**
 * Air that is too thin, or made of the wrong thing (Campaigns p. 429).
 *
 * Thin air is tiring and, after an hour, risks altitude sickness; air that is
 * corrosive or toxic eats at whoever breathes it; air that is none of those
 * and still unbreathable simply suffocates. All three are one control, because
 * a GM describing an atmosphere is describing one thing.
 */
export async function breatheBadAir(options: {
  actor: any;
  atmospheres: number;
  hazard: AtmosphereHazard | "none";
  strength: HazardStrength;
  /** HP a corrosive atmosphere has already taken, which is what its symptoms are keyed to. */
  hpLostToAir: number;
  /** How hard they are working, which is what a held breath lasts on. */
  exertion: Exertion;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const density = airDensity(options.atmospheres);
  const air = airEffect(density);
  const lines = [F("AirDensity", { band: H(`AirBand.${density}`), atm: options.atmospheres })];
  if (air.vision !== 0) lines.push(F("AirVision", { penalty: air.vision }));
  if (air.extraFatigue > 0) lines.push(F("AirFatigue", { fp: air.extraFatigue }));
  if (air.vacuum) {
    lines.push(H("AirVacuum"));
    // "If you exhale and leave your mouth open, you can operate on the oxygen
    // in your blood for half the time listed under Holding Your Breath" --
    // holding it instead ruptures the lungs (p. 437).
    const held = holdBreathSeconds({
      health: attributeOf(actor, "HT"),
      exertion: options.exertion,
      breathHoldingLevels: traitLevels(actor, "Breath-Holding"),
    });
    lines.push(F("VacuumClock", {
      seconds: vacuumBreathSeconds({ heldBreathSeconds: held, mouthOpen: true }),
      held,
      formula: formatDiceAdds(HELD_BREATH_LUNG_DAMAGE),
    }));
  } else if (air.suffocates) {
    lines.push(H("AirSuffocates"));
  }

  const rolls: any[] = [];

  // "anyone who breathes thin air for an hour or more must check for altitude
  // sickness. Make a daily HT roll at +4."
  if (air.altitudeSickness) {
    const target = attributeOf(actor, "HT") + ALTITUDE_SICKNESS_BONUS;
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const outcome = resolveSuccess(roll.total, target, dieResults(roll));
    lines.push(F("AltitudeRoll", { roll: roll.total, target }));
    lines.push(H(`Altitude.${altitudeOutcome(outcome)}`));
  }

  // What the air is made of, on top of how much of it there is.
  if (options.hazard !== "none") {
    const harm = atmosphereHarm({ hazard: options.hazard, strength: options.strength });
    if (harm.suffocates && !air.suffocates) lines.push(H("AirSuffocates"));
    // "Victims suffer coughing after losing 1/3 their HP, blindness after
    // losing 2/3 their HP" to a corrosive atmosphere (p. 429).
    if (options.hazard === "corrosive") {
      const toll = corrosiveToll({
        hpLost: options.hpLostToAir,
        maxHp: Number(actor.system?.hp?.max ?? 0) || 0,
      });
      if (toll.blinded) {
        lines.push(H("CorrosiveBlinded"));
        await setCondition(actor, "coughing", true);
      } else if (toll.coughing) {
        lines.push(H("CorrosiveCoughing"));
        await setCondition(actor, "coughing", true);
      }
    }
    if (options.hazard !== "suffocating") {
      lines.push(
        harm.unresistable
          ? F("AirNoResistance", {
              formula: toRollFormula(harm.damage),
              seconds: harm.everySeconds,
              type: game.i18n.localize(`GWORLD.DamageType.${harm.damageType}`),
            })
          : F("AirResistance", {
              modifier: harm.modifier,
              seconds: harm.everySeconds,
              type: game.i18n.localize(`GWORLD.DamageType.${harm.damageType}`),
            }),
      );
    }
  }

  await post(actor, { kind: H("BadAir"), lines, bad: air.suffocates, rolls });
}

/**
 * Being crushed at depth (Campaigns p. 435).
 *
 * "On initial exposure and every minute thereafter, roll vs. HT at a basic +3,
 * but -1 per 10 x native pressure. If you fail, you suffer HP of injury equal
 * to your margin of failure."
 */
export async function crushingPressure(options: {
  actor: any;
  atmospheres: number;
  support: PressureSupport;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const threshold = crushingThreshold(options.support);
  if (threshold === null || options.atmospheres <= threshold) {
    await post(actor, {
      kind: H("Pressure"),
      lines: [F("PressureSafe", { atm: options.atmospheres })],
      good: true,
    });
    return;
  }

  const target = crushingTarget({
    health: attributeOf(actor, "HT"),
    multiple: options.atmospheres,
    support: options.support,
  });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const lines = [F("PressureRoll", { atm: options.atmospheres, roll: roll.total, target })];

  let hurt = 0;
  if (!outcome.success) {
    hurt = crushingInjury({
      margin: outcome.margin,
      sizeModifier: Number(actor.system?.sm) || 0,
    });
    const hp = actor.system?.hp ?? { value: 0 };
    const previous = Number(hp.value) || 0;
    await actor.update({ "system.hp.value": previous - hurt });
    lines.push(F("Injury", { injury: hurt, previous, now: previous - hurt }));
  } else {
    lines.push(H("PressureHeld"));
  }
  lines.push(H("PressureAgain"));

  await post(actor, { kind: H("Pressure"), lines, bad: hurt > 0, rolls: [roll] });
}

/**
 * Coming up too fast, or a blowout (Campaigns pp. 435, 437).
 *
 * The bends roll is the one whose shape is easy to get backwards: a plain
 * success still leaves the diver in agony, and only a critical success is
 * clean.
 */
export async function decompress(options: {
  actor: any;
  /** The pressure they are coming up from. */
  atmospheres: number;
  /** True for a blowout rather than a slow ascent. */
  explosive: boolean;
  /** Levels of Pressure Support, which raise or remove the risk. */
  support: PressureSupport;
  /** Minutes spent at that pressure, which is what the safe time is measured in. */
  minutes: number;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  // "You risk the bends if you return to normal pressure after experiencing
  // pressure greater than twice your native pressure", and even then "at up
  // to 2.5 atm ... a human can safely operate for up to 80 minutes" (p. 435).
  // A diver who never went deep, or not for long, has nothing to roll for.
  // A blowout is different: the air goes all at once and the roll is always
  // made (p. 437).
  if (
    !options.explosive &&
    !risksBends({ atmospheres: options.atmospheres, minutes: options.minutes, support: options.support })
  ) {
    await post(actor, {
      kind: H("Bends"),
      lines: [F("BendsNoRisk", { atm: options.atmospheres, minutes: options.minutes })],
      good: true,
    });
    return;
  }

  const rolls: any[] = [];
  const lines: string[] = [];

  // "Take 1d of injury immediately" when the air goes all at once.
  if (options.explosive) {
    const formula = toRollFormula(EXPLOSIVE_DECOMPRESSION.injury);
    // "body fluids boil, blood vessels rupture, and eardrums pop" -- all of
    // which happen inside, where a suit of armour is no help at all.
    const hit = await takeDamage(actor, formula, "cr", { drOverride: 0 });
    rolls.push(hit.roll, hit.locationRoll);
    lines.push(F("BlowoutDamage", { formula, rolled: hit.roll.total }));
    lines.push(F("Injury", { injury: hit.injury, previous: hit.previous, now: hit.current }));
    lines.push(
      F("BlowoutRolls", {
        eye: EXPLOSIVE_DECOMPRESSION.eyeModifier,
        hearing: EXPLOSIVE_DECOMPRESSION.hearingModifier,
      }),
    );
  }

  const target = attributeOf(actor, "HT");
  const roll = new Roll("3d6");
  await roll.evaluate();
  rolls.push(roll);
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = bendsOutcome(outcome);
  lines.push(F("BendsRoll", { atm: options.atmospheres, roll: roll.total, target }));
  lines.push(H(`BendsResult.${result}`));
  if (result !== "clear") lines.push(F("BendsRecovery", { bonus: RECOMPRESSION_BONUS }));

  // "Success means severe joint pain, causing agony", and worse below that.
  if (result === "agony") await setCondition(actor, "agony", true);
  if (result === "collapse") await setCondition(actor, "paralysis", true);

  await post(actor, {
    kind: options.explosive ? H("Blowout") : H("Bends"),
    lines,
    bad: result === "collapse" || result === "death",
    good: result === "clear",
    rolls,
  });
}

/**
 * A sudden acceleration (Campaigns p. 434).
 *
 * "Make a HT roll whenever you experience a sudden acceleration of at least
 * 2.5 times your home gravity... On a failure, you lose FP equal to your
 * margin of failure."
 */
export async function accelerate(options: {
  actor: any;
  gForce: number;
  homeGravity: number;
  braced: boolean;
  inverted: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  if (!accelerationNeedsRoll({ gForce: options.gForce, homeGravity: options.homeGravity })) {
    await post(actor, {
      kind: H("Acceleration"),
      lines: [F("AccelerationGentle", { g: options.gForce })],
      good: true,
    });
    return;
  }

  const target = accelerationTarget({
    health: attributeOf(actor, "HT"),
    gForce: options.gForce,
    homeGravity: options.homeGravity,
    braced: options.braced,
    inverted: options.inverted,
  });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const lines = [F("AccelerationRoll", { g: options.gForce, roll: roll.total, target })];

  let lost = 0;
  if (!outcome.success) {
    const harm = accelerationHarm({
      margin: outcome.margin,
      criticalFailure: outcome.criticalFailure,
    });
    lost = harm.fatigue;
    const fp = actor.system?.fp ?? { value: 0 };
    const previous = Number(fp.value) || 0;
    await actor.update({ "system.fp.value": previous - lost });
    lines.push(F("AccelerationFatigue", { fp: lost, previous, now: previous - lost }));
    if (harm.blackoutSeconds > 0) {
      lines.push(F("AccelerationBlackout", { seconds: harm.blackoutSeconds }));
      await setCondition(actor, "unconscious", true);
    }
  } else {
    lines.push(H("AccelerationHeld"));
  }
  // "A sudden acceleration may throw you against a solid object."
  lines.push(F("AccelerationThrown", { speed: thrownVelocity(options.gForce) }));

  await post(actor, { kind: H("Acceleration"), lines, bad: lost > 0, rolls: [roll] });
}

/**
 * A day at sea, or the first hour of free fall (Campaigns pp. 434, 436).
 *
 * Two rules with the same shape and the same ending: a roll, and somebody
 * nauseated if it fails. The sea gives five to anybody without Motion
 * Sickness; free fall takes the better of HT and Free Fall.
 */
export async function motionSickness(options: {
  actor: any;
  kind: "sea" | "freeFall";
  motionSickness: boolean;
  spaceSickness: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const health = attributeOf(actor, "HT");
  const target =
    options.kind === "sea"
      ? seasicknessTarget({ health, motionSickness: options.motionSickness })
      : spaceSicknessTarget({
          health,
          freeFall: skillLevelOf(actor, "Free Fall"),
          prone: options.spaceSickness,
        });

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const lines = [F("MotionRoll", { roll: roll.total, target })];

  const result =
    options.kind === "sea"
      ? seasicknessOutcome({
          success: outcome.success,
          margin: outcome.margin,
          criticalSuccess: outcome.criticalSuccess,
        })
      : outcome.success
        ? "unaffected"
        : "nauseated";

  lines.push(H(`Motion.${result}`));
  if (result === "nauseated") {
    await setCondition(actor, "nauseated", true);
    lines.push(H("MotionNauseated"));
    if (options.kind === "freeFall") {
      lines.push(
        canAdaptToFreeFall(options.spaceSickness)
          ? F("MotionRecover", { hours: SPACE_SICKNESS_RECOVERY_HOURS })
          : H("MotionNeverAdapts"),
      );
    }
  }

  await post(actor, {
    kind: H(options.kind === "sea" ? "Seasickness" : "SpaceSickness"),
    lines,
    bad: result === "nauseated",
    good: result === "immune",
    rolls: [roll],
  });
}

/**
 * What damage has done to a building, and whether it is still standing
 * (Campaigns pp. 484, 558).
 *
 * A building is not a token here, so its figures are worked out from what the
 * GM knows: "HP = 100 x (cube root of building's empty weight in tons)", with
 * the weight read off its area and frame; "a structurally sound building in
 * good repair has HT 12", shoddy less and quake-resistant more. At zero HP a
 * failed HT roll breaches it, and "at -1xHP or less, it must make HT rolls to
 * avoid collapse ... It collapses automatically at -5xHP."
 */
export async function damageBuilding(options: {
  actor: any;
  squareFeet: number;
  frame: BuildingFrame;
  construction: Construction;
  damageTaken: number;
  /** True once it has failed the roll that zero hit points called for. */
  failedDisabling: boolean;
}): Promise<void> {
  const { actor } = options;
  const maxHp = buildingHitPoints({ squareFeet: options.squareFeet, frame: options.frame });
  const ht = buildingHealth(options.construction);
  const hp = maxHp - Math.max(0, options.damageTaken);
  const before = structureState({ hp, maxHp, failedDisabling: options.failedDisabling });
  const lines = [
    F("BuildingFigures", { hp: maxHp, ht, now: hp }),
    H(`BuildingState.${before}`),
  ];

  const rolls: any[] = [];
  let collapsed = before === "collapsed";
  if (mustRollToStand({ hp, maxHp })) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const stands = resolveSuccess(roll.total, ht, dieResults(roll)).success;
    collapsed = !stands;
    lines.push(F("BuildingRoll", { roll: roll.total, ht }));
    lines.push(H(stands ? "BuildingStands" : "BuildingFalls"));
  } else if (hp <= 0 && !options.failedDisabling && before !== "collapsed") {
    // At zero it rolls once to keep from being disabled.
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const holds = resolveSuccess(roll.total, ht, dieResults(roll)).success;
    lines.push(F("BuildingRoll", { roll: roll.total, ht }));
    lines.push(H(holds ? "BuildingHolds" : "BuildingState.breached"));
  }

  await post(actor, { kind: H("Building"), lines, bad: collapsed, rolls });
}

/**
 * A building coming down on somebody (Campaigns p. 484).
 *
 * "Anyone in a collapsing building takes 3d crushing damage, plus 1d per story
 * overhead. A victim can attempt to dive for cover behind a structural member.
 * On a success, he receives DR equal to the building's exterior wall DR
 * against this damage, but is still trapped in the rubble. On a critical
 * success, he is totally unharmed!"
 *
 * The wall DR replaces their armour rather than adding to it: what is over
 * them is the beam they dived behind, not the coat they are wearing.
 */
export async function buildingCollapse(options: {
  actor: any;
  storiesOverhead: number;
  wallDr: number;
  /** True where they are trying to get behind something. */
  diving: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const rolls: any[] = [];
  const lines: string[] = [];
  let shelter: CollapseShelter = "crushed";

  if (options.diving) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const target = attributeOf(actor, "DX");
    const outcome = resolveSuccess(roll.total, target, dieResults(roll));
    shelter = collapseShelter(outcome);
    lines.push(F("CollapseDive", { roll: roll.total, target }));
  }

  lines.push(H(`CollapseResult.${shelter}`));

  if (shelter !== "unharmed") {
    const damage = collapseDamage(options.storiesOverhead);
    const formula = toRollFormula(damage);
    const hit = await takeDamage(actor, formula, "cr", {
      // Behind a beam they have the wall's DR; out in the open, their own.
      ...(shelter === "sheltered" ? { drOverride: Math.max(0, options.wallDr) } : {}),
    });
    rolls.push(hit.roll, hit.locationRoll);
    lines.push(F("CollapseDamage", { formula, rolled: hit.roll.total, dr: hit.dr }));
    lines.push(F("Injury", { injury: hit.injury, previous: hit.previous, now: hit.current }));
    if (trappedInRubble(shelter)) lines.push(H("CollapseTrapped"));
  }

  await post(actor, {
    kind: H("Collapse"),
    detail: F("CollapseStories", { stories: options.storiesOverhead }),
    lines,
    bad: shelter === "crushed",
    good: shelter === "unharmed",
    rolls,
  });
}
