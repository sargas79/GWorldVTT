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

import { SYSTEM_ID } from "./constants.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { setCondition, syncHealthConditions } from "./conditions.js";
import { resolveDamageAgainst, type IncomingDamage } from "./damage.js";
import { applyFatigue } from "./fatigue.js";
import { collisionDamage, collisionVelocity, overrunDamage, type CollisionAngle } from "../rules/collisions.js";
import { formatDiceAdds, toRollFormula } from "../rules/dice.js";
import {
  lethalShock, lethalShockModifier, localizedShock, nonlethalShock, METAL_ARMOR_DR,
} from "../rules/electricity.js";
import { catchingFire, FIRE_DAMAGE, type FireExposure } from "../rules/fire.js";
import { dailyMiles, marchingFatiguePerHour, type Terrain, type TravelWeather } from "../rules/hiking.js";
import { randomHitLocation, type HitLocation } from "../rules/hit-locations.js";
import { applyInjury } from "../rules/injury.js";
import {
  protectedDose, radiationEffect, radiationRow, remainingDose,
} from "../rules/radiation.js";
import { normalizeSkillName } from "../rules/skills.js";
import { dozingOff, sleepRecovery, stayingUpFatigue, wakingDayHours } from "../rules/sleep.js";
import { resolveSuccess } from "../rules/success.js";
import type { DamageType } from "../rules/types.js";
import { controlRoll } from "../rules/vehicles.js";

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
  const location = randomHitLocation(locationRoll.total).location;

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

  if (options.kind !== "nonlethal" && options.formula.trim()) {
    const hit = await takeDamage(actor, options.formula, "burn", {
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

/** A control roll, against the skill the vehicle names, at its Handling. */
export async function controlVehicle(options: { actor: any; itemId: string; modifier: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const item = actor.items?.get(options.itemId);
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
  const result = controlRoll({
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    margin: outcome.margin,
    stabilityRating: Number(vehicle.stability) || 0,
  });

  await post(actor, {
    kind: H("Control"),
    detail: F("Controlled", { vehicle: String(item.name), skill: skillName || "DX-5", handling: handling >= 0 ? `+${handling}` : String(handling) }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [H(`ControlResult.${result}`)],
    good: result === "ok",
    bad: result === "major" || result === "disaster",
    rolls: [roll],
  });
}
