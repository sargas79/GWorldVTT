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
import { setCondition, syncHealthConditions } from "./conditions.js";
import { resolveDamageAgainst, type IncomingDamage } from "./damage.js";
import { applyFatigue } from "./fatigue.js";
import { loseAim } from "./aim.js";
import { collisionDamage, collisionVelocity, overrunDamage, type CollisionAngle } from "../rules/collisions.js";
import { formatDiceAdds, parseDiceAdds, toRollFormula } from "../rules/dice.js";
import {
  lethalShock, lethalShockModifier, localizedShock, nonlethalShock, METAL_ARMOR_DR,
} from "../rules/electricity.js";
import {
  catchingFire, FIRE_DAMAGE, ignites, prolongedContactTarget, type FireExposure, type Flammability,
} from "../rules/fire.js";
import { dailyMiles, marchingFatiguePerHour, type Terrain, type TravelWeather } from "../rules/hiking.js";
import { randomHitLocation, type HitLocation } from "../rules/hit-locations.js";
import { randomLocationWithHooks } from "./combat-extensions.js";
import { applyInjury } from "../rules/injury.js";
import {
  protectedDose, radiationEffect, radiationRow, remainingDose,
} from "../rules/radiation.js";
import { normalizeSkillName } from "../rules/skills.js";
import { dozingOff, sleepRecovery, stayingUpFatigue, wakingDayHours } from "../rules/sleep.js";
import { resolveSuccess } from "../rules/success.js";
import type { DamageType } from "../rules/types.js";
import { controlRoll, type Locomotion } from "../rules/vehicles.js";
import {
  crippleThreshold, hitsAPerson, locationsOf, lossOfControl, mediumOf, occupantDamage,
  occupantHitTarget, OCCUPANT_RISK_DAMAGE, vehicleHitLocation, windowDr,
  vehicleInjury, vehicleMovement, vehicleWoundingModifier,
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

/** The level of a skill by name, or null when the character lacks it. */
function skillLevelOf(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    if (normalizeSkillName(String(item.name)) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" ? level : null;
  }
  return null;
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
  const pools = await applyFatigue(actor, lost);

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
  hot: boolean;
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
  const perHour = marchingFatiguePerHour({
    encumbranceLevel: Number(derived.encumbrance?.level) || 0,
    hot: options.hot,
  });
  const hours = Math.max(0, Math.floor(options.hours));
  const pools = await applyFatigue(actor, perHour * hours);

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

/** A shock, of whichever kind, and the HT roll it calls for. */
export async function shock(options: {
  actor: any;
  kind: ShockKind;
  /** The GM's modifier: "+2 for a short circuit in a battery-powered gadget down to -3 or -4 for a stun weapon". */
  modifier: number;
  continuous: boolean;
  /** Burning damage for a lethal or localized shock, as a dice formula. */
  formula: string;
  /** Wearing metal armour, which "provides only DR 1". */
  metalArmor: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const ht = attributeOf(actor, "HT");
  const rolls: any[] = [];
  const lines: string[] = [];
  let injuryModifier = 0;
  let injury = 0;

  // "1d-3" as the book writes it, made into a formula the dice can roll.
  const dice = options.kind !== "nonlethal" ? parseDiceAdds(options.formula) : null;
  if (options.kind !== "nonlethal" && options.formula.trim() && !dice) {
    ui.notifications?.warn(F("BadFormula", { formula: options.formula }));
    return;
  }
  if (dice) {
    const hit = await takeDamage(actor, toRollFormula(dice), "burn", {
      drOverride: options.metalArmor ? METAL_ARMOR_DR : null,
    });
    rolls.push(hit.roll, hit.locationRoll);
    injury = hit.injury;
    injuryModifier = lethalShockModifier(injury);
    lines.push(F("ShockDamage", { formula: options.formula, rolled: hit.roll.total, dr: hit.dr, injury, previous: hit.previous, now: hit.current }));
  }

  // Nothing got through: a lethal shock that did no injury asks for no roll.
  if (options.kind !== "nonlethal" && injury === 0) {
    await post(actor, { kind: H("Shock"), detail: H(`ShockKind.${options.kind}`), lines: [...lines, H("ShockHarmless")], rolls });
    return;
  }

  const target = healthRollScore(actor) + options.modifier + injuryModifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  rolls.push(roll);
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  let bad = false;
  if (options.kind === "lethal") {
    const result = lethalShock({ success: outcome.success, criticalFailure: outcome.criticalFailure, margin: outcome.margin, ht });
    if (result.unconscious) {
      await setCondition(actor, "unconscious", true);
      lines.push(F("ShockOut", { minutes: result.unconsciousMinutes, dazed: result.dazedMinutes }));
      bad = true;
    } else {
      lines.push(H("ShockHeld"));
    }
    if (result.heartAttack) lines.push(H("HeartAttack"));
  } else {
    const result = options.kind === "localized"
      ? localizedShock({ success: outcome.success })
      : nonlethalShock({ success: outcome.success, ht, continuous: options.continuous });
    if (result.stunned) {
      await actor.update({ "system.conditions.stunned": true });
      await setCondition(actor, "stunned", true);
      lines.push(F("ShockStunned", { seconds: result.stunSeconds }));
      bad = true;
    } else {
      lines.push(H("ShockHeld"));
    }
  }

  await post(actor, {
    kind: H("Shock"),
    detail: H(`ShockKind.${options.kind}`),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: !bad,
    bad,
    rolls,
  });
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

// ── radiation (pp. 435-436) ─────────────────────────────────────────────

/** A dose of radiation, added to what is already carried, and the HT roll it asks for. */
export async function irradiate(options: {
  actor: any;
  rads: number;
  /** The shielding's Protection Factor, 1 for none. */
  protectionFactor: number;
  modifier: number;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const stored = actor.system?.radiation ?? { dose: 0, at: 0 };
  const now = Date.now();
  const daysSince = stored.at ? (now - Number(stored.at)) / 86400000 : 0;
  // What is left of the old dose, then the new one after shielding and
  // Radiation Tolerance.
  const healed = remainingDose(Number(stored.dose) || 0, daysSince);
  const tolerance = Number(actor.system?.derived?.radiationTolerance) || 1;
  const received = protectedDose(options.rads, Math.max(1, options.protectionFactor) * tolerance);
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
  const flying = mediumOf(String(vehicle.locomotion ?? "wheels") as Locomotion) === "air";
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
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const item = options.vehicle;
  const vehicle = item?.system?.vehicle;
  if (!item || !vehicle) return;

  const skillName = String(vehicle.skill ?? "");
  const own = skillLevelOf(actor, skillName);
  // Control skills default to DX-5 at worst; someone who never learned
  // Driving still grabs the wheel.
  const skill = own ?? attributeOf(actor, "DX") - 5;
  const handling = Number(vehicle.handling) || 0;
  const target = skill + handling + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const stabilityRating = Number(vehicle.stability) || 0;
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
  const lines: string[] = [];
  if (isRuleOn("vehicleManeuvers")) {
    const movement = vehicleMovement({
      maneuver: String(actor.system?.maneuver ?? ""),
      incapacitated: actor.system?.conditions?.stunned === true,
    });
    lines.push(H(`Movement.${movement}`));
  }
  lines.push(H(`ControlResult.${result}`));
  if (result !== "ok") {
    // What losing control actually does depends on what the thing moves
    // through (Campaigns p. 469).
    const medium = mediumOf(String(vehicle.locomotion ?? "wheels") as Locomotion);
    const lost = lossOfControl({
      medium,
      stabilityRating,
      margin: Math.abs(outcome.margin),
      criticalFailure: outcome.criticalFailure,
      velocity: Number(vehicle.topSpeed) || 0,
    });
    lines.push(H(`LostControl.${lost.result}`));
    if (lost.altitudeLost > 0) lines.push(F("AltitudeLost", { yards: lost.altitudeLost }));
    if (lost.decelerated > 0) lines.push(F("Decelerated", { yards: lost.decelerated }));
    if (lost.skidYards > 0) lines.push(F("SkidYards", { yards: lost.skidYards }));
    // "A failed control roll always erases any accumulated bonuses for Aim
    // maneuvers, and gives a penalty equal to the margin of failure to any
    // attack from the vehicle until the operator's next turn."
    lines.push(F("AttacksFrom", { penalty: -Math.abs(outcome.margin) }));
    await loseAim(actor, "moved");
  }

  await post(actor, {
    kind: H("Control"),
    detail: F("Controlled", { vehicle: String(item.name), skill: skillName || "DX-5", handling: handling >= 0 ? `+${handling}` : String(handling) }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: result === "ok",
    bad: result === "major" || result === "disaster",
    rolls: [roll],
  });
}

/**
 * Where a shot at a vehicle landed, and who inside it caught something
 * (Campaigns pp. 554-555).
 *
 * The location is rolled on the vehicle's own table, and only the locations
 * the vehicle actually has are on it -- "if a random location doesn't exist
 * ... treat it as body hit". What it takes to cripple that location is its
 * own share of the vehicle's HP. Then, "whenever five or more points of
 * damage penetrate an occupied location ... roll 3d on the Occupant Hit
 * Table", and whoever was hit takes "1d cutting damage per five full points".
 */
export async function shootAtVehicle(options: {
  /** Whose card this is: the shooter, or the vehicle itself. */
  actor: any;
  /** The vehicle: an item on the Gear tab, or a vehicle actor on the map. */
  vehicle: any;
  penetrating: number;
  occupants: number;
  /** What got through: a bullet and a flamethrower do very different things to a car. */
  damageType: DamageType;
  /** True for a tight-beam burn, which a vital area doubles and a torch does not. */
  tightBeam: boolean;
}): Promise<void> {
  const { actor } = options;
  const item = options.vehicle;
  const vehicle = item?.system?.vehicle;
  if (!item || !vehicle) return;

  const hitPoints = Number(vehicle.stHp) || 0;
  const sm = Number(vehicle.sm) || 0;
  const rolls: any[] = [];
  // "A powered vehicle (anything with a ST attribute) has vital areas", and is
  // Unliving where an unpowered one is Homogenous (p. 555). The same test the
  // vehicle's own sheet uses, so the two cannot disagree about one car.
  const powered = hitPoints > 0 && Number(vehicle.acceleration) > 0;

  const locationRoll = new Roll("3d6");
  await locationRoll.evaluate();
  rolls.push(locationRoll);
  const hit = vehicleHitLocation({
    roll: locationRoll.total,
    has: locationsOf(String(vehicle.locations ?? "")),
    powered,
  });

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

  const penetrating = Math.max(0, options.penetrating);
  // The wound, not the raw damage, is what comes off: a bullet into a car's
  // body is a third of itself, and into its fuel tank three times (pp. 380, 555).
  const wound = {
    damageType: options.damageType,
    tightBeam: options.tightBeam,
    location: hit.location,
    powered,
  };
  const injury = vehicleInjury({ penetrating, ...wound });
  const threshold = crippleThreshold(hit.location, hitPoints, {
    wheels: countOf(String(vehicle.locations ?? ""), "W"),
    masts: countOf(String(vehicle.locations ?? ""), "M"),
  });
  if (threshold !== null) {
    lines.push(
      injury > threshold
        ? F("Crippled", { location: name, threshold: Math.floor(threshold) })
        : F("NotCrippled", { location: name, threshold: Math.floor(threshold) }),
    );
  }
  if (penetrating > 0) {
    lines.push(F("Wound", {
      penetrating,
      modifier: Math.round(vehicleWoundingModifier(wound) * 100) / 100,
      injury,
    }));
  }
  if (hit.location === "vitalArea") lines.push(H("VitalArea"));
  if (hit.location === "largeWindow" || hit.location === "smallWindow") {
    lines.push(F("WindowDr", { dr: windowDr(Number(vehicle.dr) || 0) }));
  }
  if (hitsAPerson(hit.location)) lines.push(F("HitsAPerson", { location: name }));

  // The people inside, when enough got through to matter and there is anybody
  // in there to matter to. An empty car has no occupant to roll for.
  if (penetrating >= OCCUPANT_RISK_DAMAGE && !hitsAPerson(hit.location) && options.occupants > 0) {
    const target = occupantHitTarget(options.occupants, sm);
    const occupantRoll = new Roll("3d6");
    await occupantRoll.evaluate();
    rolls.push(occupantRoll);
    if (occupantRoll.total <= target) {
      const damage = occupantDamage(penetrating);
      lines.push(F("OccupantHit", { roll: occupantRoll.total, target, dice: damage.dice }));
    } else {
      lines.push(F("OccupantMissed", { roll: occupantRoll.total, target }));
    }
  }

  // A vehicle on the map keeps hit points, and this is what takes them off.
  // A catalogue entry on somebody's Gear tab has none to take: the card says
  // what the shot did, and the GM decides what became of the car.
  if (item.documentName === "Actor" && item.isOwner && injury > 0) {
    const before = Number(item.system?.hp?.value) || 0;
    await item.update({ "system.hp.value": before - injury });
    lines.push(F("VehicleHp", { previous: before, now: before - injury, max: hitPoints }));
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Vehicle.ShotAt"),
    detail: F("ShotAtDetail", { vehicle: String(item.name), damage: penetrating }),
    dice: dieResults(locationRoll),
    roll: locationRoll.total,
    lines,
    bad: penetrating > 0,
    rolls,
  });
}

/** How many of a location a vehicle's entry lists: "4W" is four wheels. */
function countOf(entry: string, code: string): number {
  const m = new RegExp(`(\\d*)${code}(?![a-z])`).exec(entry);
  if (!m) return 1;
  return Number(m[1]) || 1;
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
