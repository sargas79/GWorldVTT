/**
 * Rolling and chat output.
 *
 * The dice go through Foundry's Roll class so that dice-animation modules and
 * the roll log behave normally; the *interpretation* — success, margin, and
 * critical status — comes from the pure rules engine, which is the only place
 * those rules are defined.
 */

import { outcomeStep } from "../rules/bonus-points.js";
import { skillEncumbrancePenalty } from "../rules/physical.js";
import { isCombatRoll, spendingInPlay } from "./bonus-points.js";
import { SYSTEM_ID } from "./constants.js";
import { consumeMightyBlows, recordMightyBlows, spendFatigue } from "./extra-effort.js";
import { consumeFeint } from "./feint.js";
import {
  UNAIMED,
  consumeCalledShot,
  parseShot,
  recordCalledShot,
  shotOptions,
  type CalledShot,
} from "./called-shot.js";
import { consumeTurnedBlade, recordTurnedBlade } from "./turned-blade.js";
import { consumePulledBlow, pulledFormula, recordPulledBlow } from "./pulled-blow.js";
import { isRuleOn } from "./optional-rules.js";
import { normalizeDamage, rolledDice } from "./modifying-dice.js";
import { rollBreakdown, signed, type RollBreakdown } from "./roll-breakdown.js";
import { damageDice, damageDiceRow } from "./damage-dice.js";
import { maySpray, promptForSpray, type SprayShot } from "./spraying-fire.js";
import { fireSuppression, suppressing } from "./suppression-fire.js";
import { targetedTokens, withTargets } from "./targets.js";
import {
  afterSuccessRoll,
  attackSequenceFor,
  attackTargetCandidates,
  maneuverOptionAttackEffect,
  recordAttackMade,
  refusableSuccessRoll,
  successRollLines,
  type ResistedAttack,
  successRollTags,
} from "./procedure-extensions.js";
import { equipmentUseLines, toolFor } from "./tech-level.js";
import { aimStateOf, aimTargetLines, aimTurnsOf, loseAim } from "./aim.js";
import { clearZenShot, zenLine, zenShotFor, type ZenShot } from "./zen.js";
import { evaluateBonusFor } from "./evaluate.js";
import { aimBonus } from "../rules/aim.js";
import {
  scopeBonus,
  laserSight,
} from "../rules/accessories.js";
import { multipleProjectiles, projectileLine } from "../rules/shotguns.js";
import {
  canAttempt, isCriticalFailure, isCriticalSuccess, resolveDefense, resolveSuccess, type SuccessRollResult,
} from "../rules/success.js";
import {
  COMBAT_HOOKS,
  skillCapLine,
  applyAttackOptions,
  attackOptionFields,
  attackOptionsFor,
  requiredAttackOptions,
  callCombatHook,
  mergeAttackEffects,
  missFallbackFor,
  readAttackOptionValues,
  registeredHitLocation,
  registeredLocationAllowsArc,
  type AttackContext,
  type DefenseKey as AddonDefenseKey,
  type ModifierLine,
} from "./combat-extensions.js";
import {
  criticalEntry,
  criticalMissTableFor,
  type CriticalTable,
} from "../rules/criticals.js";
import {
  applyDamageFloor,
  computeInjury,
  halveDamage,
} from "../rules/damage.js";
import { formatDiceAdds, maxRoll, parseDiceAdds, toRollFormula } from "../rules/dice.js";
import {
  blastPlacementOf, blastRadius, fragmentationLabel, fragmentationRadius, fragmentationSpec, fragmentationStrikes,
  type BlastPlacement,
} from "../rules/explosions.js";
import { canMalfunction, type Delivery } from "../rules/cinematic.js";
import { hasInfiniteAmmunition } from "./cinematic.js";
import {
  EXTRA_EFFORT_FP,
  flurryOfBlowsPenalty,
  mightyBlowsBonus,
} from "../rules/extra-effort.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  rapidStrikePenalty,
  bulkPenalty,
  canAimWhileWatching,
  deceptiveAttack,
  maxDeception,
  opportunityFirePenalty,
  dualWeaponAttack,
} from "../rules/attack-options.js";
import { penaltyForRoll, penaltyFromEffects } from "../rules/attribute-penalties.js";
import {
  CHARGE_VELOCITY,
  mountedAttack,
  mountedShooting,
  lanceDamage,
} from "../rules/mounted.js";
import { consumeCharge, recordCharge } from "./mounted.js";
import { consumeStopThrust, recordStopThrust } from "./stop-thrust.js";
import type { Posture, SkillAttribute } from "../rules/types.js";
import {
  elevationRange,
  insideMinimumRange,
  rangedToHitModifier,
  attackRateOfFire,
  burstShots,
  fullAutoMinimum,
  rapidFireBonus,
  rapidFireHits,
  speedRangeModifier,
} from "../rules/ranged.js";
import { hearingDistanceModifier, telescopicOffset, telescopicScope } from "../rules/senses.js";
import {
  basedOnAnother,
  malfunctionFor,
  malfunctioned,
  mayExplode,
  type Malfunction,
} from "../rules/malfunctions.js";
import { TOTAL_DARKNESS, attackWithoutSight, darknessPenalty, type Sight, type VisionTraits } from "../rules/visibility.js";
import { impairedAttacks } from "../rules/trait-effects.js";
import { levelDifference } from "../rules/melee-situations.js";
import { effectiveLevelDifference } from "../rules/unarmed-techniques.js";
import { turnedBlade } from "../rules/subduing.js";
import { coverShot, struckCover, type CoverApproach } from "../rules/cover.js";
import {
  breakWeapon,
  consumeWeaponStrike,
  rangedWeaponTargets,
  recordWeaponStrike,
  weaponStrikeLine,
  type WeaponTarget,
} from "./weapon-damage.js";
import { announceShots, shotsReady, shotsSourceOf, spendShots, type ShotsTally } from "./ammunition.js";
import { malfunctionOf, malfunctionWithHooks, setMalfunction, type MalfunctionReport } from "./malfunctions.js";
import { strikingPart } from "../rules/hurting-yourself.js";
import type { DamageType } from "../rules/types.js";

import {
  cappedAimBonus,
  movingPlatformPenalty,
  targetingSystemBonus,
  unexpectedDodgePenalty,
  type PlatformMounting,
  type RideRoughness,
  type VehicleMedium,
} from "../rules/vehicle-combat.js";
import {
  accuracyApplies,
  areaDamageFallsOff,
  coneMayStillCatch,
  coneWidth,
  defendsAgainstArea,
  designationHeld,
  designationRolls,
  flightPlan,
  aimedThenGuided,
  guidanceModifiers,
  halvesDamage,
  projectileSpeed,
  steeringDuty,
  type Guidance,
} from "../rules/guided.js";
import { WILD_SWING_SKILL_CAP, allOutAttackBonus, stopThrustBonus, strongAttackDamageBonus, wildSwingPenalty, type AllOutAttackOption } from "../rules/maneuvers.js";
import { flailKind, type FlailKind } from "../rules/defenses.js";
import { canTargetFromArc, missByOneHitsTorso } from "../rules/hit-locations.js";
import { facingAgainstTarget } from "./attack-arc.js";
import { POSTURE_EFFECTS } from "../rules/posture.js";
import { drivingAttackPenalty, type VehicleAttackKind } from "../rules/scale.js";
import { mayFireMountedWeapon, vehicleAboard, type Aboard } from "./vehicle-aboard.js";
import { rollMalediction } from "./malediction.js";
import { pendingModifierLines, spendPendingModifiers } from "./pending-modifiers.js";

const CHAT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;
const DAMAGE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-roll.hbs`;

/** What rules a roll is judged by; only defenses skip the minimum-3 check. */
export type RollKind = "skill" | "attribute" | "attack" | "defense" | "selfControl";

export interface RollModifier {
  label: string;
  value: number;
  /**
   * What the line is, for a module that needs to find it whatever the label
   * says in the user's language (since 1.63.0): `speedRange`, `bulk`,
   * `accuracy`, `aim`, `braced`, `aimTarget`; since 1.86.0 `darkness`
   * and `laser`; since 1.87.0 `movingPlatform`; since 1.91.0 `size` on a
   * ranged attack, and `zen`, a zen skill's line (with `zen`, the skill's id);
   * since 1.105.0 `afflictionDr`, the DR bonus to an affliction's resistance roll;
   * since 1.153.0 `dualWeapon` (with `hand`) and `strikeAtWeapon` (with `itemId`).
   * Blank or absent on lines nobody has named.
   */
  key?: string;
  /** On a `dualWeapon` line, the hand rolled: `primary` or `off` (since 1.153.0). */
  hand?: "primary" | "off";
  /** On a `strikeAtWeapon` line, the id of the foe's item struck at (since 1.153.0). */
  itemId?: string;
  /** Why a `bulk` line applies: `moveAndAttack` or `closeCombat` (since 1.63.0). */
  situation?: string;
  /** On an `accuracy` line, how much of it a scope gives (since 1.63.0). */
  scope?: number;
  /**
   * On an `accuracy` line, true where only a homing weapon's lock-on earned
   * it (since 1.128.0): not an Aim maneuver, and not a flight long enough to
   * count as aimed.
   */
  lockOn?: boolean;
  /**
   * On a `darkness` line, the darkness itself, 1 to 9, before the eyes took
   * anything off it (since 1.86.0).
   */
  darkness?: number;
  /**
   * On a `movingPlatform` line (since 1.87.0): `vehicle` or `mount`, the
   * medium (`ground`, `air`, `water`), the ride (`smooth`, `rough`,
   * `offRoad`) and how the weapon is held (`handheld`, `openMount`,
   * `fixedMount`, `stabilized`). Since 1.141.0 also `vehicle`, the vehicle
   * actor for a `vehicle` platform, so a module can tell one kind of vehicle
   * from another.
   */
  platform?: "vehicle" | "mount";
  vehicle?: any;
  medium?: string;
  ride?: string;
  mounting?: string;
  /** On a `zen` line, the zen skill's id: `zenArchery`, or a module's `<module>.<key>` (since 1.91.0). */
  zen?: string;
}

/**
 * What the card says about a steered or area attack (Campaigns pp. 412-413).
 *
 * Assembled where the range is known, because every line of it depends on how
 * far away the target is.
 */
export interface GuidanceReport {
  /** "guided", "homing", or blank for an ordinary shot. */
  guidance: Guidance;
  /** Seconds until the projectile arrives, counting the turn it was fired. */
  seconds: number;
  /** True where it reaches the target on the turn it is launched. */
  hitsThisTurn: boolean;
  /** True where it runs out of reach first and crashes. */
  falls: boolean;
  /** True where 1/2D is the projectile's speed rather than a damage threshold. */
  speedNotDamage: boolean;
  /** True where the firer's own state and senses do not count. */
  ignoresFirer: boolean;
  /** True for an attack that covers ground, which no active defense stops. */
  area: boolean;
  /** How wide the cone is at this range, in yards; null where it is not a cone. */
  coneYards: number | null;
  /** True where a cone that missed may still catch the target. */
  coneMayCatch: boolean;
  /** True where the firer must Concentrate each turn and keep the target in sight. */
  mustSteer: boolean;
  /** True where damage holds up across the area instead of falling off. */
  damageHoldsUp: boolean;
}

/**
 * Works out what a steered or area attack does at this range (pp. 412-413).
 *
 * Returns null for an ordinary shot, which is most of them -- the card then
 * carries nothing extra, as it always has.
 */
export function guidanceReport(options: {
  guidance: string;
  rangeYards: number;
  halfDamageRange: number;
  maxRange: number;
  areaAttack: boolean;
  coneMaxWidth: number;
}): GuidanceReport | null {
  const guidance = (options.guidance || "none") as Guidance;
  const area = options.areaAttack === true;
  if (guidance === "none" && !area) return null;

  // "If a guided or homing attack has a 1/2D statistic, do not halve damage.
  // Instead, read this as the attack's speed in yards/second."
  const speed = projectileSpeed(options.halfDamageRange);
  const plan = flightPlan({
    rangeYards: options.rangeYards,
    speed,
    maxRange: options.maxRange,
  });
  const modifiers = guidanceModifiers(guidance);

  return {
    guidance,
    seconds: plan.seconds,
    hitsThisTurn: plan.hitsThisTurn,
    falls: plan.falls,
    speedNotDamage: !halvesDamage(guidance),
    ignoresFirer: !modifiers.firersCondition,
    area,
    coneYards:
      area && options.coneMaxWidth >= 0 && options.maxRange > 0
        ? coneWidth({
            rangeYards: options.rangeYards,
            maxRange: options.maxRange,
            maxWidth: options.coneMaxWidth > 0 ? options.coneMaxWidth : null,
          })
        : null,
    coneMayCatch: area && coneMayStillCatch(),
    // "Take a Concentrate maneuver each turn to steer the weapon. Should you
    // lose sight of the target while the attack is en route, your attack
    // misses automatically!" -- which only bites on a journey of more than the
    // turn it was fired on.
    mustSteer: steeringDuty(guidance).concentrates && !plan.hitsThisTurn && !plan.falls,
    // "Damage does not usually decline with distance" -- which is what tells
    // an area attack apart from an explosion, where it very much does.
    damageHoldsUp: area && !areaDamageFallsOff(),
  };
}

/**
 * The attacking weapon as the defense card reads it: its weight and blade for
 * the heavy-parry rules (Campaigns p. 376), and its skill, whether it thrusts
 * and whether it is a flail, for what they do to a parry or block.
 */
export interface AttackWeaponFlag {
  weight: number;
  material: string;
  swung: boolean;
  skill?: string;
  thrust?: boolean;
  flail?: FlailKind;
  /** The weapon item and the mode attacked with, for the modules' defense hooks. */
  itemUuid?: string;
  mode?: { index: number; ranged: boolean; derived?: string } | null;
}

/** How far a listener is from a sound, and how far it carries (since API 1.117.0). */
export interface HearingDistance {
  /** The listener's distance from the sound, in yards. */
  yards: number;
  /** The distance at which the sound is heard at no penalty (Campaigns p. 358). */
  baseYards: number;
}

/**
 * The Hearing Distance Table's line for a roll made `distance` from a sound
 * (Campaigns p. 358), the sound carrying as much farther as the listener's
 * Parabolic Hearing doubles it (Characters p. 72). Null where no distance is
 * given or it can't be read; a line of 0 where the listener is within one
 * step of the sound's rated distance, so a listener can still find it.
 */
export function hearingDistanceLine(actor: any, distance: HearingDistance | null | undefined): RollModifier | null {
  const yards = Number(distance?.yards);
  const baseYards = Number(distance?.baseYards);
  if (!(yards > 0) || !(baseYards > 0) || !Number.isFinite(yards) || !Number.isFinite(baseYards)) return null;
  const senses: any[] = Array.isArray(actor?.system?.derived?.senses) ? actor.system.derived.senses : [];
  const multiplier = Number(senses.find((s) => s?.sense === "hearing")?.rangeMultiplier) || 1;
  return {
    label: game.i18n.format("GWORLD.Senses.HearingDistance", { yards, baseYards: baseYards * multiplier }),
    value: hearingDistanceModifier(yards, baseYards * multiplier),
    key: "hearingDistance",
  };
}

export interface SuccessRollOptions {
  actor: any;
  /** The unmodified target number, e.g. a skill level or defense score. */
  base: number;
  /**
   * The skill a critical success or failure is judged against, where an
   * option says it differs from the roll's own: a bonus bought for accuracy
   * need not make a critical easier.
   */
  criticalSkill?: number;
  /**
   * Lines a module's attack option puts on the defender's rolls, each limited
   * to the defenses it names. Carried to the defense card.
   */
  defenseModifiers?: Array<ModifierLine & { defenses?: AddonDefenseKey[] }>;
  label: string;
  /** What kind of roll this is; defense rolls use the defense success rules. */
  kind?: RollKind;
  modifiers?: RollModifier[];
  /**
   * A burst, whose margin of success decides how many of its shots hit
   * (GURPS Basic Set: Campaigns p. 373).
   */
  rapidFire?: { shotsFired: number; recoil: number };
  /**
   * A penalty this attack imposes on the defender, from a Deceptive Attack or
   * a Feint. Recorded on the message so the defense card can apply it.
   */
  defensePenalty?: number;
  /**
   * True for a punch, kick, bite, grapple or slam, which reads its own critical
   * miss table (GURPS Basic Set: Campaigns p. 557).
   */
  unarmed?: boolean;
  /**
   * The weapon's Malf., and what it takes to put right if the roll reaches it
   * (GURPS Basic Set: Campaigns p. 407).
   */
  malfunction?: {
    number: number;
    techLevel: number;
    revolver: boolean;
    /** The weapon and mode fired, for `gworld.malfunction` and to put it out of action (since 1.71.0). */
    item?: any;
    modeIndex?: number;
  } | null;
  /**
   * The defender may dodge or block but not parry: a Missile spell
   * (Characters p. 241). Recorded on the message for the defense card.
   */
  noParry?: boolean;
  /** What a strike at a weapon or shield allows the defender (since 1.31.0): no parry, and no Defense Bonus. */
  strikeLimits?: { noParry?: boolean; noDefenseBonus?: boolean };
  /**
   * The weapon the attack is made with, for the defender's parry to weigh
   * (Campaigns p. 376) and for the Critical Miss Table's resistant weapons
   * (p. 556): its weight, its blade's material, whether it was swung, and
   * whether it rolls again on "your weapon breaks".
   */
  weapon?: AttackWeaponFlag & { resistsBreakage: boolean };
  /**
   * Where an attack that misses by 1 lands instead (Campaigns p. 552), as the
   * card names it; null or absent for an attack a miss by 1 simply misses.
   */
  missFallback?: string | null;
  /** Where the attack was aimed, and where a miss by 1 lands, for the defense card (since 1.25.0). */
  calledShot?: { hitLocation: string; addonLocation: string | null } | null;
  missFallbackShot?: { hitLocation: string; addonLocation: string | null } | null;
  /** A bonus the target's Dodge alone gets, from a laser dot they saw (p. 411). */
  dodgeBonus?: number;
  /**
   * What a steered or area attack has to say for itself (Campaigns pp. 412-413):
   * how long the projectile is in the air, whether it will get there at all,
   * how wide the cone is here, and whether an active defense is any use. Shown
   * on the card, and the area part decides what the defense card offers.
   */
  guidance?: GuidanceReport | null;
  /** How an attack reached its target, for TV Action Violence (p. 417). */
  delivery?: Delivery;
  /** What the attack does, blank where it does nothing (a grapple). */
  damageType?: string;
  /** Where TV Action Violence could buy a failed defense back (p. 417). */
  tvAction?: { uuid: string; name: string; attack: string };
  /**
   * Whose roll this was, so a failed resistance can be turned into one of the
   * book's conditions (Campaigns pp. 428-429).
   */
  affliction?: { uuid: string; name: string; label: string };
  /** The skill rolled against, for a module's point pools that pay only for some skills. */
  skill?: string;
  /**
   * The actor being looked for, on a roll to detect somebody (since 1.63.0).
   * It reaches `gworld.successRollModifiers` and `gworld.detectionModifiers`.
   */
  subject?: any;
  /**
   * What sort of roll this is beyond its kind, for modules' modifiers:
   * `fright`, `knockdown`, `selfControl`, a defense's name... A Fast-Draw or
   * Teaching skill is tagged from its name.
   */
  tags?: string[];
  /**
   * How far a Hearing roll's listener is from the sound (since API 1.117.0):
   * `yards` away from a sound heard at no penalty out to `baseYards`. Adds
   * the Hearing Distance Table's line (Campaigns p. 358), keyed
   * `hearingDistance`, with `baseYards` stretched by the listener's Parabolic
   * Hearing (Characters p. 72), and tags the roll `hearing`.
   */
  distance?: HearingDistance;
  /**
   * What the roll is made against, where it is an attack (since 1.49.0). It
   * reaches the `gworld.successRollModifiers` listeners untouched, so a module
   * can read the weapon and the range a resistance roll was forced by.
   */
  attack?: ResistedAttack;
  /**
   * The item the roll is made with (since 1.95.0): a weapon, a tool, a
   * vehicle. It reaches `gworld.successRollModifiers` and
   * `gworld.afterSuccessRoll` as `item`.
   */
  item?: any;
  /**
   * Who sees the card (since 1.95.0): one of Foundry's message modes
   * (`public`, `gm`, `blind`, `self`) or the older roll-mode names
   * (`publicroll`, `gmroll`, `blindroll`, `selfroll`). Left out, the card is
   * posted openly, as before.
   */
  rollMode?: string;
  /**
   * A roll the GM makes in secret (Campaigns p. 494; since 1.95.0): the card
   * goes to the GMs only, and not to whoever rolled -- the `blind` mode. A
   * `rollMode` given beside it wins.
   */
  secret?: boolean;
  /**
   * True to have a roll refused for an effective skill below 3 resolve to
   * a {@link SuccessRollRefusal} rather than null (since API 1.107.0), and
   * since API 1.131.0 one a `gworld.successRollModifiers` listener refused.
   * Left out, a refused roll resolves to null, as it always has.
   */
  returnRefusal?: boolean;
  /**
   * True for a roll to resist something -- an HT roll against a poison, a
   * stun or a blinding light -- rather than an attempt (since API 1.121.0).
   * It is rolled even at an effective level below 3, where an attempt would
   * be refused, and a 3 or 4 still succeeds and a 17 or 18 still fails
   * (Campaigns p. 348). It tags the roll `resist`, and a roll the caller
   * tags `resist` is taken as one without it.
   */
  resistance?: boolean;
}

/**
 * A success roll that was not made (since API 1.107.0): its effective skill
 * was below 3, so "you cannot attempt the roll" (Campaigns p. 344), or since
 * API 1.131.0 a `gworld.successRollModifiers` listener refused it, and
 * `reason` is the listener's.
 */
export interface SuccessRollRefusal {
  refused: true;
  /** Why, as the card and the warning say it. */
  reason: string;
  base: number;
  effective: number;
  modifiers: RollModifier[];
}

/** The older roll-mode names, as Foundry's message modes. */
const LEGACY_ROLL_MODES: Readonly<Record<string, string>> = Object.freeze({
  publicroll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self",
});

/**
 * The message mode a success roll's card is posted in, or null for the
 * system's usual open card: a known `rollMode`, else `blind` for a secret roll.
 */
export function successRollMessageMode(options: { rollMode?: unknown; secret?: unknown }): string | null {
  const known = (globalThis as { CONFIG?: { ChatMessage?: { modes?: Record<string, unknown> } } }).CONFIG?.ChatMessage?.modes
    ?? { public: {}, gm: {}, blind: {}, self: {} };
  if (typeof options.rollMode === "string" && options.rollMode) {
    const mode = LEGACY_ROLL_MODES[options.rollMode] ?? options.rollMode;
    if (mode in known) return mode;
  }
  return options.secret === true ? "blind" : null;
}

/** A critical miss, with what the table said and whether the weapon resisted. */
export interface CriticalMissResult {
  roll: any;
  total: number;
  effect: string;
  effectKey: string;
  gmDecides: boolean;
  /** The second roll a resistant weapon made, and what it came to. */
  again?: { roll: any; total: number; broke: boolean };
}

/**
 * The card for a roll that could not be attempted: the target, and why no
 * dice were rolled. The system's procedures that roll their own dice post
 * theirs with it too (since API 1.144.0).
 */
export async function postRefusal(options: Pick<SuccessRollOptions, "actor" | "base" | "label" | "rollMode" | "secret"> & { kind?: string }, refused: {
  reason: string;
  modifiers: RollModifier[];
  totalModifier: number;
  effective: number;
}): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
    label: options.label,
    kind: options.kind ?? "skill",
    refused: true,
    base: options.base,
    modifiers: refused.modifiers.filter((m) => m.value !== 0),
    totalModifier: refused.totalModifier,
    effective: refused.effective,
    resultLabel: refused.reason,
    resultClass: "failure",
  });
  const messageMode = successRollMessageMode(options);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: options.actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  }, messageMode ? { messageMode } : {});
}

/**
 * Rolls 3d6 against a target number and posts the result to chat.
 *
 * Returns the resolved outcome so callers can chain on it (an attack that hits
 * going on to roll damage, for instance).
 */
export async function rollSuccess(options: SuccessRollOptions & { returnRefusal: true }): Promise<SuccessRollResult | SuccessRollRefusal>;
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult | null>;
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult | SuccessRollRefusal | null> {
  const {
    actor, base, label, kind = "skill", rapidFire, defensePenalty = 0,
    unarmed = false, noParry = false,
  } = options;
  // What the actor's timed conditions and the modules add, beside the lines
  // the caller worked out.
  // A sound's distance makes it a Hearing roll, with the table's line among
  // the caller's so a listener can find and change it (since API 1.117.0).
  const heardAt = hearingDistanceLine(actor, options.distance);
  const tags = successRollTags({
    kind,
    skill: options.skill,
    tags: [...(options.tags ?? []), ...(heardAt ? ["hearing"] : []), ...(options.resistance === true ? ["resist"] : [])],
  });
  // A bonus a module held for this roll (since API 1.132.0) is among the
  // caller's lines, so a listener sees it and may take it off.
  const held = pendingModifierLines(actor, { skill: options.skill, tags });
  const given = [...(options.modifiers ?? []), ...(heardAt ? [heardAt] : []), ...held.map((h) => h.line)];
  // The caller's lines as the listeners left them, and theirs: a keyed line a
  // listener removes is gone from the roll (since API 1.109.0).
  // A listener may refuse the roll outright (since API 1.131.0), but not an
  // active defense: the defense card is where one is refused or settled, and
  // its caller has no answer to a defense that was never rolled.
  const context = {
    actor, label, kind, skill: String(options.skill ?? ""), base, tags, modifiers: [...given],
    ...(options.attack ? { attack: options.attack } : {}),
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.item ? { item: options.item } : {}),
  };
  const { modifiers, refusal } = kind === "defense"
    ? { modifiers: successRollLines(context), refusal: null }
    : refusableSuccessRoll(context);

  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const effective = base + totalModifier;

  // A roll a module's rule says can't be made is not made, whatever its
  // level, and is refused the way a roll below 3 is: a warning, a card in the
  // roll's own message mode with the listener's reason, and no
  // `gworld.afterSuccessRoll`, since there is no outcome to hear.
  if (refusal !== null) {
    ui.notifications?.warn(refusal);
    await postRefusal(options, { reason: refusal, modifiers, totalModifier, effective });
    return options.returnRefusal === true
      ? { refused: true, reason: refusal, base, effective, modifiers }
      : null;
  }

  // A roll at effective skill below 3 may not be attempted at all, and only
  // active defenses are exempt (Campaigns p. 344). Without this check a rolled
  // 3 or 4 would report success, since those always succeed once rolled. The
  // table is told on a card, so that everyone knows the attempt was impossible
  // rather than that nothing happened.
  // A roll to resist is not an attempt, so it is rolled whatever its level,
  // and at 1 or 2 only the 3 or 4 that always succeeds saves the victim
  // (Campaigns p. 348; since API 1.121.0).
  const resisting = tags.includes("resist");
  if (kind !== "defense" && !resisting && !canAttempt(effective)) {
    const reason = game.i18n.format("GWORLD.Roll.TooLowToAttempt", { label, effective });
    ui.notifications?.warn(reason);
    await postRefusal(options, { reason, modifiers, totalModifier, effective });
    return options.returnRefusal === true
      ? { refused: true, reason, base, effective, modifiers }
      : null;
  }

  const roll = new Roll("3d6");
  await roll.evaluate();

  const resolved =
    kind === "defense"
      ? resolveDefense(roll.total, effective, dieResults(roll))
      : resolveSuccess(roll.total, effective, dieResults(roll));
  // Criticals judged against another skill, where an option asked for that.
  // A 17 or 18 still fails and a critical success still succeeds.
  const criticalSkill = kind !== "defense" && typeof options.criticalSkill === "number" && Number.isFinite(options.criticalSkill)
    ? options.criticalSkill
    : null;
  const outcome = criticalSkill === null
    ? resolved
    : (() => {
        const criticalSuccess = isCriticalSuccess(roll.total, criticalSkill);
        const criticalFailure = !criticalSuccess && isCriticalFailure(roll.total, criticalSkill);
        const success = criticalSuccess ? true : criticalFailure ? false : roll.total >= 17 ? false : roll.total <= effective;
        const margin = success ? Math.max(0, effective - roll.total) : Math.max(0, roll.total - effective);
        return { ...resolved, criticalSuccess, criticalFailure, success, margin };
      })();

  // A critical hit or miss is read off a table rather than merely announced
  // (p. 381). The miss is rolled here, because its result lands on the attacker
  // straight away; the hit is rolled when the damage is applied, where the hit
  // location and the target's DR are both known.
  const criticalMiss =
    kind === "attack" && outcome.criticalFailure && isRuleOn("criticalTables")
      ? await rollCriticalMiss(criticalMissTableFor(unarmed), options.weapon?.resistsBreakage === true)
      : null;
  const criticalHit = kind === "attack" && outcome.criticalSuccess && isRuleOn("criticalTables");
  // An aimed attack that misses by 1 hits the torso instead (p. 552): it
  // connects, and the defender is asked to defend.
  const hitsInstead = kind === "attack" && !outcome.success && !outcome.criticalFailure && outcome.margin === 1 && Boolean(options.missFallback);

  // A gun that jams does so on the attack roll itself, whether or not the shot
  // would otherwise have hit -- "on any attack roll of Malf. or more".
  // "Furthermore, weapons never malfunction" (p. 417).
  const jam =
    kind === "attack" &&
    isRuleOn("malfunctions") &&
    canMalfunction(hasInfiniteAmmunition(actor)) &&
    options.malfunction
      ? await rollMalfunction(roll.total, options.malfunction, actor)
      : null;

  const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
    label,
    kind,
    criticalMiss,
    criticalHit,
    base,
    modifiers: modifiers.filter((m) => m.value !== 0),
    totalModifier,
    effective,
    outcome,
    resultLabel: hitsInstead
      ? `${describeOutcome(outcome, kind)} — ${game.i18n.format("GWORLD.CalledShot.MissByOne", { location: String(options.missFallback) })}`
      : describeOutcome(outcome, kind),
    resultClass: outcomeClass(outcome),
    // A burst that missed scored nothing, so hits are reported only on a hit.
    hits:
      rapidFire && outcome.success
        ? rapidFireHits({
            margin: outcome.margin,
            shotsFired: rapidFire.shotsFired,
            recoil: rapidFire.recoil,
          })
        : null,
    shotsFired: rapidFire?.shotsFired ?? null,
    jam,
    // A steered or area attack, which the ordinary ranged line cannot describe
    // (Campaigns pp. 412-413).
    guidance: options.guidance ?? null,
  });

  // A roll that can be bought up with points (Campaigns p. 347)
  // remembers what it was, and an attack that missed remembers the defense
  // card it would have posted on a hit.
  const successRoll = spendingInPlay() && actor?.uuid
    ? {
        [SYSTEM_ID]: {
          successRoll: {
            actorUuid: String(actor.uuid),
            skill: String(options.skill ?? ""),
            step: outcomeStep(outcome),
            combat: isCombatRoll(actor, kind),
            ...(kind === "attack" && !outcome.success && !hitsInstead
              ? {
                  onSuccess: attackFlags(
                    actor, label, defensePenalty, false, noParry, options.weapon, options.delivery, options.damageType,
                    options.guidance?.area === true && !defendsAgainstArea(), options.dodgeBonus ?? 0,
                    options.defenseModifiers ?? [], null, options.strikeLimits ?? null, tags,
                  ),
                }
              : {}),
          },
        },
      }
    : null;

  // A secret roll, or one a module asked to be whispered (since 1.95.0).
  const messageMode = successRollMessageMode(options);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    ...(successRoll ? { flags: successRoll } : {}),
    rolls: [
      roll,
      ...(criticalMiss ? [criticalMiss.roll] : []),
      ...(criticalMiss?.again ? [criticalMiss.again.roll] : []),
      ...(jam ? [jam.roll] : []),
    ],
    // An affliction that was not resisted is an affliction somebody now has,
    // and the card that failed is where it is handed out (pp. 428-429).
    ...(!outcome.success && options.affliction
      ? { flags: foundry.utils.mergeObject(foundry.utils.deepClone(successRoll ?? {}), { [SYSTEM_ID]: { affliction: options.affliction } }) }
      : {}),
    // "The hero can choose to convert his failed defense roll into a success"
    // (p. 417) -- which is an offer made on the card that failed.
    ...(kind === "defense" && !outcome.success && options.tvAction
      ? { flags: foundry.utils.mergeObject(foundry.utils.deepClone(successRoll ?? {}), { [SYSTEM_ID]: { tvAction: options.tvAction } }) }
      : {}),
    // An attack that connects is the moment to record who it was aimed at: the
    // defender rolls afterwards, by which time the attacker may well have
    // changed their target. A miss needs no defense, so it carries nothing.
    ...(kind === "attack" && (outcome.success || hitsInstead)
      ? {
          flags: foundry.utils.mergeObject(foundry.utils.deepClone(successRoll ?? {}), attackFlags(
            actor, label, defensePenalty, criticalHit, noParry, options.weapon,
            options.delivery, options.damageType,
            // "Active defenses don't protect against an area attack, but
            // victims may dive for cover or retreat out of the area" (p. 413).
            options.guidance?.area === true && !defendsAgainstArea(),
            options.dodgeBonus ?? 0,
            options.defenseModifiers ?? [],
            (hitsInstead ? options.missFallbackShot : options.calledShot) ?? null,
            options.strikeLimits ?? null,
            tags,
          )),
        }
      : {}),
  }, messageMode ? { messageMode } : {});

  // The dice are rolled, so the bonuses held for it are used up.
  await spendPendingModifiers(actor, held, modifiers);
  afterSuccessRoll({ actor, label, kind, skill: String(options.skill ?? ""), tags, outcome, ...(options.item ? { item: options.item } : {}) });

  // What the fumble did to the weapon travels back to whoever rolled, who
  // knows which item it was and can break it.
  return Object.assign(outcome, { criticalMissEffect: criticalMiss?.effectKey ?? null, hitsInstead });
}

/**
 * The lines a roll takes before anything its dialog adds: a weapon's own
 * to-hit, a lowered attribute, and for an attack the traits that impair it
 * and All-Out Attack's bonus.
 *
 * The roll pushes these, and the character sheet's attack preview shows them
 * before any roll is made, so the two can never disagree.
 */
export function standingRollLines(actor: any, options: {
  rollType: string | undefined;
  ranged: boolean;
  /** The weapon's own "-2 to hit", as its row carries it. */
  hitModifier?: unknown;
  /** The attribute the roll is based on, for a lowered attribute's penalty. */
  basedOn?: string | undefined;
  /** A Wild Swing takes no Determined bonus (p. 388). */
  wildSwing?: boolean;
  /** Whether a dialog asked about the attack, which then saw to sight. */
  dialogAsked: boolean;
}): RollModifier[] {
  const lines: RollModifier[] = [];
  const { rollType, ranged } = options;

  // A weapon used at a penalty with its own skill -- "-2 to hit", as a data
  // file may list it -- takes its own line off the attack, so the card says
  // where the number came from.
  const hitModifier = rollType === "attack" ? Number(options.hitModifier) || 0 : 0;
  if (hitModifier !== 0) {
    lines.push({ label: game.i18n.localize("GWORLD.Attack.WeaponToHit"), value: hitModifier });
  }

  // Something has temporarily knocked an attribute down (p. 421). It comes off
  // every skill that attribute governs -- and off nothing else: a defense, a
  // resistance roll and a Fright Check are all exempt, which is why this reads
  // the kind of roll rather than applying itself everywhere.
  const knockedDown = temporaryPenalty(actor, options.basedOn, rollKind(rollType));
  if (knockedDown !== 0) {
    // One figure on the roll, two different things to be told: a penalty the
    // GM typed in, and the conditions on the token. A line that says
    // "Nauseated" is one the player can do something about.
    const typed = typedPenalty(actor, options.basedOn, rollKind(rollType));
    const conditions = knockedDown - typed;
    if (typed !== 0) lines.push({ label: game.i18n.localize("GWORLD.Penalties.Label"), value: typed });
    if (conditions !== 0) lines.push({ label: afflictionLabel(actor), value: conditions });
  }

  // Bad Sight and One Eye each take their own line off an attack
  // (Characters pp. 123, 147) -- One Eye's -3 at range only when the shot
  // was not aimed -- and a blind fighter attacks blind even when nothing in
  // the dialog was ticked.
  if (rollType === "attack") {
    const traits = actor?.system?.derived?.traitEffects;
    const impaired = traits
      ? impairedAttacks(traits, {
          ranged,
          aimed: ranged && aimTurnsOf(actor) > 0,
          closeCombat: actor?.system?.conditions?.closeCombat === true,
        })
      : [];
    for (const penalty of impaired) lines.push({ label: penalty.trait, value: penalty.value });

    // All-Out Attack (Determined): "Make a single attack at +4 to hit!" in
    // melee, "+1 to hit" at range (p. 365). The other options buy something
    // other than accuracy, so they add nothing here.
    if (actor?.system?.maneuver === "allOutAttack") {
      const option = String(actor.system.allOutAttackOption ?? "determined") as AllOutAttackOption;
      // "you may not choose the 'Determined' option to get +4 to hit to offset
      // the Wild Swing penalty" (p. 388).
      const bonus = options.wildSwing ? 0 : allOutAttackBonus(option, ranged);
      if (bonus !== 0) {
        lines.push({ label: game.i18n.localize(`GWORLD.Maneuver.AllOutAttackOption.${option}`), value: bonus });
      }
    }
    if (!options.dialogAsked && eyesOf(actor).blindness) {
      const blind = sightModifier("clear", false, eyesOf(actor));
      if (blind) lines.push(blind);
    }
  }
  return lines;
}

/**
 * The lines an attack takes for where the fighters are and what they did
 * before: the Posture Table (Characters p. 551) for a melee attack from a low
 * posture and a shot at a low target, what Evaluate earned a melee attack
 * (Campaigns p. 364), and Move and Attack's -4 (p. 365).
 */
export function positionRollLines(actor: any, options: { rollType: string | undefined; ranged: boolean }): RollModifier[] {
  const lines: RollModifier[] = [];
  const { rollType, ranged } = options;
  if (rollType !== "attack") return lines;

  const own = String(actor?.system?.posture ?? "standing") as Posture;
  if (!ranged && own !== "standing" && POSTURE_EFFECTS[own]?.attack) {
    lines.push({ label: game.i18n.format("GWORLD.Attack.PostureLine", { posture: game.i18n.localize(`GWORLD.Posture.${own}`) }), value: POSTURE_EFFECTS[own].attack });
  }
  const aimedAt = targetedTokens();
  const theirs = aimedAt.length === 1 ? String(aimedAt[0]?.actor?.system?.posture ?? "standing") as Posture : "standing";
  if (ranged && theirs !== "standing" && POSTURE_EFFECTS[theirs]?.target) {
    lines.push({ label: game.i18n.format("GWORLD.Attack.TargetPostureLine", { posture: game.i18n.localize(`GWORLD.Posture.${theirs}`) }), value: POSTURE_EFFECTS[theirs].target });
  }

  const evaluated = !ranged ? evaluateBonusFor(actor) : 0;
  if (evaluated) lines.push({ label: game.i18n.localize("GWORLD.Maneuver.evaluate"), value: evaluated });

  // "Roll against your skill at -4", and "your effective skill cannot exceed
  // 9": the cap is taken once every other modifier is in; a module may lift it.
  if (!ranged && actor?.system?.maneuver === "moveAndAttack") {
    lines.push({ label: game.i18n.localize("GWORLD.Maneuver.moveAndAttack"), value: -4 });
  }
  return lines;
}

/** What an attack's preview shows: every line known before the roll, and where they leave the skill. */
export interface AttackPreview {
  base: number;
  lines: RollModifier[];
  /** The skill after every line, before any cap. */
  total: number;
  /** The skill Move and Attack caps it at, where it does; otherwise null. */
  cap: number | null;
  /** The skill that will be rolled against. */
  effective: number;
  /** The range to the one target and its size, where the map gives them. */
  measured: { rangeYards: number; targetSizeModifier: number } | null;
}

/**
 * The lines an attack will take before its dialog or a module adds anything,
 * for the character sheet to show ahead of the roll.
 *
 * Built from the same pieces the roll pushes: the standing lines, the quick
 * shot's range and size where the map measures them, what the options on the
 * attacker's maneuver add, and the position lines. What a shift-click dialog
 * or a module's `attackModifiers` hook adds at roll time is not known yet and
 * not shown.
 */
export function previewAttack(actor: any, row: {
  ranged: boolean;
  item?: any;
  /** The skill the attack is rolled with, for the weapon's tech level and familiarity (since 1.75.0). */
  skill?: string;
  skillLevel: number;
  hitModifier?: unknown;
  damageType?: string;
  reach?: string;
  weapon?: Record<string, unknown>;
}): AttackPreview {
  const base = Number(row.skillLevel) || 0;
  const lines: RollModifier[] = [];
  const measured = row.ranged ? measuredShot(actor) : null;
  if (row.ranged && measured) {
    lines.push(...quickShot(measured, weaponFromDataset(actor, row.weapon ?? {})).modifiers);
  }
  lines.push(...standingRollLines(actor, { rollType: "attack", ranged: row.ranged, hitModifier: row.hitModifier, dialogAsked: false }));
  lines.push(...equipmentUseLines(actor, row.item ?? null, row.skill).lines);
  const stance = maneuverOptionAttackEffect(attackContextFor({
    actor, item: row.item ?? null, ranged: row.ranged, damageType: row.damageType ?? "", reach: row.reach ?? "", effectiveSkill: base,
  }));
  if (stance) lines.push(...stance.modifiers);
  lines.push(...positionRollLines(actor, { rollType: "attack", ranged: row.ranged }));

  const shown = lines.filter((m) => Number.isFinite(m.value) && m.value !== 0);
  const total = base + shown.reduce((sum, m) => sum + m.value, 0);
  const cap = !row.ranged && actor?.system?.maneuver === "moveAndAttack" ? WILD_SWING_SKILL_CAP : null;
  return { base, lines: shown, total, cap, effective: cap === null ? total : Math.min(total, cap), measured };
}

/**
 * The weapon a ranged attack is resolved with, read from its row's data: the
 * same object wherever the attack's controls are drawn.
 */
export function weaponFromDataset(actor: any, dataset: Record<string, unknown>) {
  const n = (key: string) => Number(dataset[key]) || 0;
  return {
    damageType: String(dataset.damageType ?? "cr") as DamageType,
    accuracy: n("accuracy"),
    // Telescopic Vision is a scope of its own, the better of the two counting (Characters p. 92).
    scopeBonus: telescopicScope(n("scopeBonus"), telescopicTraitLevels(actor).levels, telescopicTraitLevels(actor).noTargeting),
    // A fixed-power scope needs its full bonus in seconds of Aim (Campaigns
    // p. 411) -- where it is the scope that counts, not the trait.
    scopeFixed: dataset.scopeFixed === "1" && n("scopeBonus") >= telescopicScope(n("scopeBonus"), telescopicTraitLevels(actor).levels, telescopicTraitLevels(actor).noTargeting),
    rateOfFire: n("rateOfFire") || 1,
    // A RoF marked "!" fires only on full auto (Characters p. 270; since 1.94.0).
    fullAutoOnly: dataset.fullAutoOnly === "1",
    // A tight-beam burn, which may be aimed at the eye and vitals (Campaigns p. 399; since 1.97.0).
    tightBeam: dataset.tightBeam === "1",
    recoil: n("recoil"),
    bulk: n("bulk"),
    // A shotgun's pellets, and the range inside which they strike as one.
    projectiles: Math.max(1, n("projectiles") || 1),
    halfDamageRange: n("halfDamageRange"),
    // How the projectile steers and how far it can fly (Campaigns p. 412),
    // and whether it covers ground rather than striking a point (p. 413).
    guidance: String(dataset.guidance ?? ""),
    maxRange: n("maxRange"),
    areaAttack: dataset.areaAttack === "1",
    coneMaxWidth: n("coneMaxWidth"),
    // The turns spent on an Aim maneuver, which is what buys the Accuracy.
    aim: {
      turns: aimTurnsOf(actor),
      braced: Boolean(actor?.system?.aim?.braced),
    },
    eyes: eyesOf(actor),
    // What is left in the weapon caps the burst (Campaigns p. 373).
    loaded: dataset.loaded === undefined || dataset.loaded === "" ? null : Number(dataset.loaded) || 0,
    // A shooter on a Wait is covering ground, and the area they declared
    // is what the penalty comes off.
    watching:
      actor?.system?.maneuver === "wait"
        ? {
            hexesWatched: Number(actor.system?.wait?.hexesWatched ?? 1),
            coveringLine: Boolean(actor.system?.wait?.coveringLine),
          }
        : null,
  };
}

/**
 * The penalty a lowered attribute puts on this roll (p. 421).
 *
 * Read from the derived total rather than from the field the GM types into,
 * because the afflictions on the token are folded into the total and not into
 * the field: reading the field is what left a nauseated character rolling at
 * full level while the sheet said -2. The field is the fallback for an actor
 * whose data has not been prepared.
 *
 * Returns zero for a roll the rule exempts, and for a button that does not say
 * what it is based on -- an attack rolls against a weapon skill whose attribute
 * is the skill's own business, and guessing at it would be worse than nothing.
 */
function temporaryPenalty(actor: any, basedOn: string | undefined, kind: RollKind): number {
  if (!basedOn) return 0;

  const against = kind === "defense" ? "activeDefense" : "skill";
  const effects = actor?.system?.derived?.attributePenalties;
  if (effects) {
    return penaltyFromEffects({ effects, basedOn: basedOn as SkillAttribute, kind: against });
  }

  return typedPenalty(actor, basedOn, kind);
}

/** The share of that penalty the GM typed onto the sheet, without the conditions. */
function typedPenalty(actor: any, basedOn: string | undefined, kind: RollKind): number {
  if (!basedOn) return 0;
  const penalties = actor?.system?.attributePenalties;
  if (!penalties) return 0;
  return penaltyForRoll({
    penalties,
    basedOn: basedOn as SkillAttribute,
    kind: kind === "defense" ? "activeDefense" : "skill",
  });
}

/** The conditions on the token, named, for the line their penalty takes. */
function afflictionLabel(actor: any): string {
  const names = (actor?.system?.derived?.afflictions?.names ?? []) as string[];
  const listed = names.map((key) => game.i18n.localize(key)).filter(Boolean);
  return listed.length > 0 ? listed.join(", ") : game.i18n.localize("GWORLD.Penalties.Label");
}

/**
 * Rolls on the Firearm Malfunction Table, if the shot jammed the gun (p. 407).
 *
 * "The weapon fires one shot, then jams" is the only outcome where the attack
 * still happens, so the shot is not cancelled here: the card reports both, and
 * the GM decides what a misfired attack that also rolled a hit means.
 */
async function rollMalfunction(
  attackRoll: number,
  weapon: NonNullable<SuccessRollOptions["malfunction"]>,
  actor: any,
): Promise<(MalfunctionReport & { roll: any }) | null> {
  if (!malfunctioned({ roll: attackRoll, malfunctionNumber: weapon.number })) return null;

  const roll = new Roll("3d6");
  await roll.evaluate();

  const rolled = malfunctionFor(roll.total);
  // "TL5+ weapons do not explode -- treat as a mechanical or electrical
  // problem", so the worst row of the table is two different results.
  const kind: Malfunction =
    rolled === "explosion" && !mayExplode(weapon.techLevel) ? "mechanical" : rolled;

  // The modules may read the result and replace it (since 1.71.0); one that
  // says there was no malfunction after all leaves the shot as it was.
  const modeIndex = Number.isInteger(weapon.modeIndex) ? weapon.modeIndex! : null;
  const report = malfunctionWithHooks({
    actor, item: weapon.item ?? null, modeIndex, attackRoll, roll: roll.total,
    techLevel: weapon.techLevel, revolver: weapon.revolver, kind,
  });
  if (!report) return null;
  // A weapon left out of action stays so until it is cleared.
  if (report.jams && weapon.item?.isOwner) await setMalfunction(weapon.item, { kind: report.kind, label: report.label, modeIndex: modeIndex ?? 0 });
  return { ...report, roll };
}

/**
 * Rolls on one of the critical miss tables and says what it landed on.
 *
 * The roll goes through Foundry's Roll class like any other, so that it shows
 * in the log and animates -- a result this unpleasant should be visibly rolled
 * rather than asserted.
 */
async function rollCriticalMiss(table: CriticalTable, resistsBreakage = false): Promise<CriticalMissResult> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const entry = criticalEntry(table, roll.total);
  const result: CriticalMissResult = {
    roll,
    total: roll.total,
    effect: game.i18n.localize(`GWORLD.Critical.${entry.effect}`),
    effectKey: entry.effect,
    gmDecides: entry.gmDecides === true,
  };

  // "Certain weapons are resistant to breakage... If you have a weapon like
  // that, roll again. Only if you get a 'broken weapon' result a second time
  // does the weapon really break. If you get any other result, you drop the
  // weapon instead." (p. 556)
  if (entry.effect === "weaponBreaks" && resistsBreakage && isRuleOn("weaponBreakage")) {
    const again = new Roll("3d6");
    await again.evaluate();
    const second = criticalEntry(table, again.total);
    const broke = second.effect === "weaponBreaks";
    result.again = { roll: again, total: again.total, broke };
    result.effectKey = broke ? "weaponBreaks" : "dropWeapon";
    result.effect = game.i18n.localize(`GWORLD.Critical.${broke ? "weaponBreaksTwice" : "dropWeaponInstead"}`);
    result.gmDecides = false;
  }
  return result;
}

/**
 * Who an attack was aimed at, recorded on the message so the card can offer
 * them a defense.
 *
 * Actors are named by UUID rather than by token, because the defense is rolled
 * by the actor and a token can be gone by the time anyone clicks.
 *
 * Only targeted tokens count. The selection is not a fallback here as it is
 * elsewhere: an attacker has their own token selected far more often than not,
 * and falling back would record them as defending against themselves.
 */
function attackFlags(
  actor: any,
  label: string,
  defensePenalty: number,
  criticalHit: boolean,
  noParry = false,
  weapon?: AttackWeaponFlag,
  delivery?: Delivery,
  damageType?: string,
  /** True for an area attack, which no active defense stops (p. 413). */
  areaAttack = false,
  /** +1 to Dodge for a target who saw a laser dot (Campaigns p. 411). */
  dodgeBonus = 0,
  /** Lines a module's attack option puts on the defender's rolls. */
  defenseModifiers: Array<ModifierLine & { defenses?: AddonDefenseKey[] }> = [],
  /** Where the blow was aimed (since 1.25.0). */
  calledShot: { hitLocation: string; addonLocation: string | null } | null = null,
  /** What a strike at a weapon or shield allows the defender (since 1.31.0). */
  strikeLimits: { noParry?: boolean; noDefenseBonus?: boolean } | null = null,
  /** The attack roll's tags, for the modules' defense hooks (since 1.44.0). */
  tags: readonly string[] = [],
): object {
  const defenders = targetedTokens()
    .filter((token: any) => token?.actor?.uuid)
    .map((token: any) => ({
      uuid: String(token.actor.uuid),
      name: String(token.actor.name ?? ""),
      // The token as well as the actor: tactical combat needs to know where
      // the two of them were standing, which the actor alone cannot say.
      tokenUuid: token.document?.uuid ? String(token.document.uuid) : "",
    }));

  if (defenders.length === 0) return {};

  const attackerToken = actor?.getActiveTokens?.()?.[0]?.document?.uuid;
  return {
    [SYSTEM_ID]: {
      defense: {
        attack: label,
        defenders,
        attackerToken: attackerToken ? String(attackerToken) : "",
        defensePenalty,
        // "In all cases, the target gets no active defense against the attack"
        // (p. 556) -- so the defense card offers none. An area attack is the
        // other case: "active defenses don't protect against an area attack,
        // but victims may dive for cover or retreat out of the area" (p. 413).
        noDefense: criticalHit || areaAttack,
        ...(areaAttack ? { areaAttack: true } : {}),
        // A thrown Missile spell cannot be parried (Characters p. 241).
        ...(noParry ? { noParry: true } : {}),
        // What the defender's parry has to weigh (Campaigns p. 376).
        // And, for the parry and block, its skill, whether it thrusts, and
        // whether it is a flail (Characters p. 208, Campaigns p. 376).
        ...(weapon
          ? {
              weapon: {
                weight: weapon.weight,
                material: weapon.material,
                swung: weapon.swung,
                ...(weapon.skill ? { skill: weapon.skill } : {}),
                ...(weapon.thrust ? { thrust: true } : {}),
                ...(weapon.flail ? { flail: weapon.flail } : {}),
                ...(weapon.itemUuid ? { itemUuid: weapon.itemUuid } : {}),
                ...(weapon.mode ? { mode: weapon.mode } : {}),
              },
            }
          : {}),
        // How the blow arrived and what it does, which is what decides whether
        // a point of fatigue can buy the defense back (p. 417). A punch cannot
        // be ducked this way; a bullet can.
        ...(delivery ? { delivery } : {}),
        ...(damageType ? { damageType } : {}),
        ...(dodgeBonus ? { dodgeBonus } : {}),
        ...(defenseModifiers.length > 0 ? { defenseModifiers } : {}),
        ...(calledShot ? { calledShot } : {}),
        ...(strikeLimits?.noParry || strikeLimits?.noDefenseBonus ? { strikeLimits: { noParry: strikeLimits.noParry === true, noDefenseBonus: strikeLimits.noDefenseBonus === true } } : {}),
        ...(tags.length > 0 ? { tags: [...tags] } : {}),
      },
    },
  };
}

export interface DamageRollOptions {
  actor: any;
  label: string;
  /** A dice+adds formula such as "1d+3". */
  formula: string;
  damageType: DamageType;
  armorDivisor?: number;
  modifiers?: RollModifier[];
  /** An explosive attack, which also hurts everyone near what it struck. */
  explosive?: boolean;
  /** Fragmentation thrown, as a dice formula -- the "[2d]" in "cr ex [2d]". */
  fragmentation?: string;
  /** The fragments' damage type, where not cutting (since API 1.72.0). */
  fragmentationType?: DamageType | "";
  /** The fragments' own armour divisor, where they have one (since API 1.72.0). */
  fragmentationDivisor?: number;
  /** Fragments that go on striking: seconds between and seconds in all, 0 for none (since API 1.72.0). */
  fragmentationLingerEvery?: number;
  fragmentationLingerFor?: number;
  /** Where the blast goes off, which the card offers first when applied (since API 1.72.0). */
  blastPlacement?: BlastPlacement | "" | null;
  /** A large-area injury (Campaigns p. 400), which the card ticks when applied (since API 1.72.0). */
  largeArea?: boolean;
  /** Where the attack that earned this damage was aimed. */
  calledShot?: CalledShot | null;
  /**
   * The attack options chosen for the attack that earned this damage, by
   * `<module>.<key>` (since API 1.108.0): carried to `gworld.injury` and
   * `gworld.armorDr` when the blow is applied.
   */
  attackOptions?: Record<string, unknown>;
  /**
   * Pellets striking as one mass (Campaigns p. 409): the rolled damage and
   * the target's DR are both multiplied by this.
   */
  massMultiplier?: number;
  /**
   * A blow aimed at a weapon rather than its wielder (Campaigns p. 401).
   * The card applies it to the item instead of to a token.
   */
  weaponTarget?: { actorUuid: string; itemId: string; name: string };
  /** A target at or past 1/2D, which halves the basic damage (Characters p. 270). */
  halfDamage?: boolean;
  /** What the weapon is made of, carried to the apply for a Vulnerability to silver. */
  material?: string;
  /** True when DR has no effect on the blow, as for a Malediction (Characters p. 106). */
  ignoresDr?: boolean;
  /** Incendiary (Characters p. 104): the blow's flame can set things alight. */
  incendiary?: boolean;
  /** Radiation (Characters p. 104): a rad per point of basic damage rolled. */
  radiation?: boolean;
  /** Double Knockback (Characters p. 104): the shove is twice as far. */
  doubleKnockback?: boolean;
  /** An attack that shoves nobody, whatever its damage type. */
  noKnockback?: boolean;
  /** A blow whose whole effect is knockback and blunt trauma, with no other injury (since API 1.63.0). */
  kineticOnly?: boolean;
  /** Surge (Characters p. 105): burning damage that does double to anything electrical, for the modules that read it (since API 1.63.0). */
  surge?: boolean;
  /**
   * A tight-beam burn (Campaigns p. 399; since API 1.97.0): x2 at the vitals,
   * and a tenth of its damage toward setting clothes alight. Travels on the card.
   */
  tightBeam?: boolean;
  /**
   * A pick's blow (Campaigns p. 405; since API 1.105.0): applied, one that
   * penetrates DR and does damage leaves the weapon stuck in its victim.
   * Travels on the card.
   */
  pick?: boolean;
  /** The item the blow comes from, for a module's hooks; its UUID travels on the card. */
  item?: any;
  /** Which of the item's modes it was rolled from. */
  mode?: { index: number; ranged: boolean; derived?: string } | null;
  /** The body part an unarmed blow strikes with, for Hurting Yourself (Campaigns p. 379). */
  strikingPart?: string | null;
  /**
   * Where the blow came from, for the modules' damage hooks (since 1.43.0),
   * e.g. "parriedLimb". A slam's two rolls are "slam" and "slammed" (since
   * API 1.139.0), and `gworld.damageModifiers` and `gworld.armorDr` see it too.
   */
  source?: string;
  /** The first hit of a multiple-projectile shot, rolled with its own line (since API 1.73.0). */
  firstHit?: boolean;
  /**
   * How far the target was, in yards, for the modules' damage hooks (since
   * 1.69.0): the range the attack was made at, or else the distance to the one
   * targeted token. Null where neither is known.
   */
  distanceYards?: number | null;
}

/**
 * How far the target of a damage roll is, in yards (since API 1.69.0): the
 * figure the caller gives, or, where it gives none, the distance on the map to
 * the one targeted token. Null where neither says -- a caller's explicit null
 * included, and a roll made with no scene.
 */
export function damageDistance(actor: any, given: number | null | undefined): number | null {
  if (given !== undefined && given !== null) return Number.isFinite(Number(given)) ? Math.max(0, Number(given)) : null;
  if (given === null) return null;
  try {
    return measuredShot(actor)?.rangeYards ?? null;
  } catch {
    return null;
  }
}

/**
 * Rolls damage and posts it to chat with the wounding modifier shown.
 *
 * Applying it to a target needs that target's DR, so the card carries the
 * numbers a GM needs rather than guessing at whom it hit.
 */
export async function rollDamage(options: DamageRollOptions): Promise<number> {
  const { actor, label, damageType, armorDivisor = 1, fragmentation = "" } = options;
  // A module may add lines to a damage roll, with what they are for, and put
  // another formula in its place.
  const item = options.item ?? null;
  const mode = options.mode ?? null;
  // How far away the target was: 1/2D already turns on it (Characters
  // p. 269), and a module's damage may too, explosive or not (since 1.69.0).
  const distanceYards = damageDistance(actor, options.distanceYards);
  const hookedDamage = callCombatHook(COMBAT_HOOKS.damageModifiers, {
    actor, item, mode, label, formula: options.formula, damageType, modifiers: [...(options.modifiers ?? [])],
    distanceYards,
    // Where the blow came from (since 1.139.0), so a listener can add to a
    // slam's damage alone and leave every other crushing roll as it is.
    source: options.source ? String(options.source) : null,
    // Whether this blow is incendiary (Characters p. 104; since API
    // 1.152.0): its mode's flag, which a listener may set for this blow
    // alone -- a round that burns only at close range, say.
    incendiary: options.incendiary === true,
  });
  // Only a true or false counts; anything else leaves the mode's own flag.
  const incendiary = typeof hookedDamage.incendiary === "boolean" ? hookedDamage.incendiary : options.incendiary === true;
  const replaced = typeof hookedDamage.formula === "string" && hookedDamage.formula !== options.formula && parseDiceAdds(hookedDamage.formula)
    ? hookedDamage.formula
    : null;
  const formula = replaced ?? options.formula;
  const modifiers = hookedDamage.modifiers.filter((m) => typeof m?.value === "number" && Number.isFinite(m.value));
  const explosive = options.explosive === true && isRuleOn("explosions");
  const cinematicBlast = explosive && isRuleOn("cinematicExplosions");
  const fragments = cinematicBlast ? "" : fragmentation;
  // Their type, divisor and whether they linger, where the row says (since
  // API 1.72.0); a bare dice string is cutting, as it always was.
  const fragmentSpec = explosive && fragments
    ? fragmentationSpec({
        fragmentation: fragments,
        fragmentationType: options.fragmentationType,
        fragmentationDivisor: options.fragmentationDivisor,
        fragmentationLingerEvery: options.fragmentationLingerEvery,
        fragmentationLingerFor: options.fragmentationLingerFor,
      })
    : null;
  const placement = explosive && !cinematicBlast ? blastPlacementOf(options.blastPlacement) : null;

  const parsed = parseDiceAdds(formula);
  if (!parsed) {
    ui.notifications?.warn(`Could not parse damage formula "${formula}".`);
    return 0;
  }

  const bonus = modifiers.reduce((sum, m) => sum + m.value, 0);
  // The multiplier travels with the roll: "6dx10" is six dice times ten, and
  // dropping it here would roll a tenth of the attack.
  const summed = {
    dice: parsed.dice,
    adds: parsed.adds + bonus,
    ...(parsed.multiplier ? { multiplier: parsed.multiplier } : {}),
  };
  // Modifying Dice + Adds (Characters p. 269) works on the damage with every
  // bonus in it, per-die ones included, so it is converted here, after the
  // modifiers are summed, and not on the formula the caller passed in. The
  // bonuses were counted from the dice before conversion, as they should be.
  const modified = normalizeDamage(formatDiceAdds(summed));
  const rolled = modified.converted ? (parseDiceAdds(modified.normalized) ?? summed) : summed;
  // An explosion reaches as far as the dice it rolls: counted after the rule,
  // since 2d+5 rolled as 3d+1 is three dice of damage (see rolledDice), and a
  // multiplied roll is that many dice again.
  const blastDice = rolled.dice * (rolled.multiplier ?? 1);
  const roll = new Roll(toRollFormula(rolled));
  await roll.evaluate();

  // A shotgun's pellets up close are one blow of several times the damage,
  // against several times the DR; the second half travels on the flag.
  const mass = Math.max(1, Math.floor(Number(options.massMultiplier ?? 1)));

  // The floor lives in the rules engine; duplicating it here would let chat
  // damage drift from the rules if it ever changes.
  const full = applyDamageFloor(roll.total * mass, damageType);
  // "Damaging attacks on targets at or beyond 1/2D inflict half damage."
  const basicDamage = options.halfDamage ? halveDamage(full, damageType) : full;
  // Each die as it came up, and the adds and multipliers that took them to
  // the total, so the card reads as the table would add it up.
  const dice = damageDice({ roll, rolled, mass });

  // Shown against DR 0 so the card states raw injury; the GM subtracts real DR.
  const undefended = computeInjury({ basicDamage, dr: 0, type: damageType });

  const content = await foundry.applications.handlebars.renderTemplate(DAMAGE_TEMPLATE, {
    label,
    // What was rolled, where the rule changed it, and what it was before: the
    // formula with the modifiers below already in it.
    formula: modified.converted ? modified.normalized : formula,
    modifiedFrom: modified.converted ? modified.raw : "",
    damageType,
    armorDivisor,
    // A divisor of 1 is the ordinary case and is not worth a line on the card.
    // Anything else is, in both directions: above 1 it divides the target's DR,
    // below 1 it multiplies it, and a stake at (0.5) doubling DR matters to the
    // GM every bit as much as a beam weapon halving it.
    hasArmorDivisor: armorDivisor !== 1,
    modifiers: modifiers.filter((m) => m.value !== 0),
    basicDamage,
    dice: damageDiceRow(dice, basicDamage, damageType),
    halvedFrom: options.halfDamage ? full : null,
    massMultiplier: mass > 1 ? mass : null,
    woundingModifier: undefended.woundingModifier,
    injuryIfUnarmored: undefended.injury,

    // An explosion reaches twice its dice in yards, and its fragments five
    // times theirs (GURPS Basic Set: Campaigns p. 414). Both are worth stating
    // on the card, because they decide who else is in trouble.
    explosive,
    // "if an explosion does 6dx2 damage, everyone within 24 yards is
    // vulnerable" -- twelve dice, not six. The multiplier counts.
    blastRadius: explosive ? blastRadius(blastDice) : 0,
    // "In cinematic combat, explosions do no direct damage! Ignore
    // fragmentation, too" (p. 417) -- so a cinematic grenade throws none, and
    // the card does not offer a radius for fragments nobody will roll.
    fragmentation: fragmentSpec ? fragmentationLabel(fragmentSpec) : fragments,
    fragmentationRadius: fragments
      ? fragmentationRadius(rolledDice(fragments))
      : 0,
    fragmentLingers: fragmentSpec?.linger
      ? game.i18n.format("GWORLD.Fragments.Lingers", {
          every: fragmentSpec.linger.every, for: fragmentSpec.linger.for, strikes: fragmentationStrikes(fragmentSpec.linger),
        })
      : "",
    blastPlacement: placement ? game.i18n.localize(`GWORLD.Blast.${placement}`) : "",
    largeArea: options.largeArea === true,
    cinematicBlast,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
    // Carried on the message so the card can still apply the blow later: the
    // roll is over, but who it lands on is decided afterwards, and re-reading
    // the numbers out of the rendered HTML would be parsing our own output.
    flags: {
      [SYSTEM_ID]: {
        damage: {
          basicDamage, damageType, armorDivisor, label,
          // Carried so the apply control opens on the location that was aimed
          // at, and knows to halve the DR of a chink it found.
          ...(options.calledShot
            ? {
                hitLocation: options.calledShot.hitLocation,
                chink: options.calledShot.chink,
                ...(options.calledShot.addonLocation ? { addonLocation: options.calledShot.addonLocation } : {}),
              }
            : {}),
          // The most these dice could have come up, for the critical results
          // that replace the roll with maximum damage.
          maxDamage: applyDamageFloor(maxRoll(rolled) * mass, damageType),
          // The dice themselves (since API 1.151.0), so the card that applies
          // a critical can show them maximised, and a module can read them.
          dice,
          ...(mass > 1 ? { drMultiplier: mass } : {}),
          ...(options.material ? { material: options.material } : {}),
          ...(options.ignoresDr ? { ignoresDr: true } : {}),
          // Carried to the apply, where a dose, a fire and a shove are worked
          // out against the victim rather than against the dice (pp. 104-105).
          ...(incendiary ? { incendiary: true } : {}),
          ...(options.radiation ? { radiation: true } : {}),
          ...(options.doubleKnockback ? { doubleKnockback: true } : {}),
          ...(options.noKnockback ? { noKnockback: true } : {}),
          ...(options.kineticOnly ? { kineticOnly: true } : {}),
          ...(options.surge ? { surge: true } : {}),
          ...(options.tightBeam && damageType === "burn" ? { tightBeam: true } : {}),
          ...(options.pick ? { pick: true } : {}),
          // The attack options the blow was struck with, for the modules that
          // read them when it lands (since API 1.108.0).
          // Kept as pairs, since a key's dot would nest it in the flag.
          ...(options.attackOptions && Object.keys(options.attackOptions).length > 0
            ? { attackOptions: attackOptionEntries(options.attackOptions) }
            : {}),
          ...(typeof item?.uuid === "string" ? { itemUuid: item.uuid } : {}),
          ...(mode ? { mode } : {}),
          ...(options.source ? { source: String(options.source) } : {}),
          ...(options.firstHit ? { firstHit: true } : {}),
          ...(options.weaponTarget ? { weaponTarget: options.weaponTarget } : {}),
          // Who struck bare-handed, and with what, for Hurting Yourself (p. 379).
          ...(options.strikingPart && typeof options.actor?.uuid === "string" ? { strikingPart: options.strikingPart, strikerUuid: options.actor.uuid } : {}),
          explosive,
          // What the card offers when the blow is applied, and the fragments
          // it offers to roll (since API 1.72.0).
          ...(placement ? { blastPlacement: placement } : {}),
          ...(options.largeArea ? { largeArea: true } : {}),
          ...(fragmentSpec ? { fragments: fragmentSpec } : {}),
          // The dice, not the rolled total: the blast radius is set by how
          // many dice the attack rolls, whatever they came up -- and a
          // multiplied roll is that many dice again. The dice rolled, after
          // Modifying Dice + Adds, as the card's radius counts them.
          diceOfDamage: blastDice,
        },
      },
    },
  });

  return basicDamage;
}

/**
 * Asks for a situational modifier before rolling.
 *
 * Returns null when the dialog is dismissed, which cancels the roll — distinct
 * from returning 0, which rolls unmodified.
 */
export async function promptForModifier(held: RollModifier[] = []): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("GWORLD.Chat.ModifierTitle") },
    content: `<div class="gworld">${heldModifiersNote(held)}
      <label style="display:flex;align-items:center;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" autofocus style="width:80px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLInputElement>('input[name="modifier"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });

  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * The bonuses held for this roll (since API 1.132.0), listed above the
 * modifier so the player knows they are coming and not to add them again.
 */
function heldModifiersNote(held: RollModifier[]): string {
  if (held.length === 0) return "";
  const escape = foundry.utils.escapeHTML;
  const lines = held.map((m) => `<li>${escape(m.label)} ${m.value > 0 ? "+" : ""}${m.value}</li>`).join("");
  return `<p class="hint">${escape(game.i18n.localize("GWORLD.Chat.HeldModifiers"))}</p><ul class="held-modifiers">${lines}</ul>`;
}

/**
 * The bonuses held for the roll a sheet button is about to make, as the roll
 * itself will find them, for its dialog to list.
 */
function heldForRoll(actor: any, rollType: string | undefined, skill: string | undefined, dataset: DOMStringMap): RollModifier[] {
  const tags = successRollTags({ kind: rollKind(rollType), skill, tags: [dataset.basedOn, dataset.sense].filter((t): t is string => Boolean(t)) });
  return pendingModifierLines(actor, { skill, tags }).map((h) => h.line);
}

/**
 * Handles a click on any element carrying the roll dataset.
 *
 * Shared by the character and NPC sheets so both route through chat and behave
 * identically — an NPC's Dodge should roll exactly like a PC's.
 */
export async function handleRollAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<SuccessRollResult | null> {
  if (target.dataset.rollType !== "attack" || Number(target.dataset.malediction) > 0) return rollAction(actor, event, target, null);

  // A maneuver's attacks this turn, as the modules may have changed them: an
  // attack that picks its own target asks for it, and each one made is counted.
  const sequence = attackSequenceFor(actor);
  const place = { index: sequence.made + 1, count: sequence.count };
  const inCombat = Boolean((game as any).combat?.started);
  let picked: any[] | null = null;
  if (sequence.pickTargets) {
    const candidates = attackTargetCandidates(actor);
    if (candidates.length > 0) {
      const choice = await promptForAttackTarget(
        game.i18n.format("GWORLD.Attack.SequenceTarget", place),
        candidates.map((c) => c.name),
      );
      if (choice === null) return null;
      const chosen = candidates[Number(choice)];
      if (chosen) picked = [{ actor: chosen.actor, document: chosen.document }];
    }
  }
  // Suppression Fire takes the whole turn and hoses an area rather than
  // shooting at anyone (Campaigns p. 409).
  if (target.dataset.ranged === "1" && suppressing(actor)) {
    const fired = await fireSuppression(actor, target, rollItemOf(actor, target));
    if (fired && inCombat) await recordAttackMade(actor);
    return null;
  }

  // One burst over several targets (Campaigns p. 409): an attack each, and
  // one attack of the turn for them all.
  if (!picked && maySpray(target.dataset, targetedTokens().filter((t: any) => t?.actor).length)) {
    const plan = await promptForSpray({
      actor,
      rateOfFire: Number(target.dataset.rateOfFire) || 1,
      recoil: Number(target.dataset.recoil) || 1,
      loaded: target.dataset.loaded === undefined || target.dataset.loaded === "" ? null : Number(target.dataset.loaded) || 0,
      minShots: fullAutoMinimum(Number(target.dataset.rateOfFire) || 1, target.dataset.fullAutoOnly === "1" ? "!" : ""),
      yardsBetween,
    });
    if (plan === null) return null;
    if (plan !== "single") {
      let last: SuccessRollResult | null = null;
      const tally: ShotsTally = { fired: 0, extra: 0, wasted: 0, targets: 0 };
      for (const [i, token] of plan.tokens.entries()) {
        const outcome = await withTargets([token], () => rollAction(actor, event, target, sequence.count > 1 ? place : null, plan.shots[i]!, tally));
        // An attack called off, or refused, ends the burst there.
        if (!outcome) break;
        last = outcome;
      }
      // The whole burst, once: what it fired at each target and what the
      // sweep between them wasted (since 1.71.0).
      if (tally.targets > 0) {
        const source = shotsSourceOf(target);
        announceShots({
          actor, item: rollItemOf(actor, target), modeIndex: source.modeIndex,
          fired: tally.fired * source.perShot, extra: tally.extra, wasted: tally.wasted * source.perShot, kind: "spraying", targets: tally.targets,
          derivedMode: source.derivedMode,
        });
      }
      if (last && inCombat) await recordAttackMade(actor);
      return last;
    }
  }

  const roll = () => rollAction(actor, event, target, sequence.count > 1 ? place : null);
  const outcome = picked ? await withTargets(picked, roll) : await roll();
  if (outcome && inCombat) await recordAttackMade(actor);
  return outcome;
}

/** The item an attack button belongs to, or null. */
function rollItemOf(actor: any, target: HTMLElement): any {
  const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
  return id ? actor?.items?.get?.(id) ?? null : null;
}

/** Asks which of the scene's tokens one attack of a sequence is aimed at. Null when dismissed. */
async function promptForAttackTarget(title: string, names: string[]): Promise<string | null> {
  const esc = foundry.utils.escapeHTML;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${esc(game.i18n.localize("GWORLD.Attack.Target"))}</span>
        <select name="target" style="min-width:160px">${names.map((name, i) => `<option value="${i}">${esc(name)}</option>`).join("")}</select>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) =>
        button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="target"]')?.value ?? "",
    },
    rejectClose: false,
  });
  return typeof result === "string" && result !== "" ? result : null;
}

async function rollAction(
  actor: any,
  event: Event,
  target: HTMLElement,
  /** Which attack of the turn's several this is, to say on the card. */
  place: { index: number; count: number } | null,
  /** This target's share of a Spraying Fire burst, or none (since 1.70.0). */
  spray: SprayShot | null = null,
  /** What a spray's attacks spent between them, announced once the burst is over (since 1.71.0). */
  tally: ShotsTally | null = null,
): Promise<SuccessRollResult | null> {
  const { rollType, rollLabel, rollTarget, ranged } = target.dataset;
  const base = Number(rollTarget);
  if (!Number.isFinite(base)) return null;

  // A Malediction is not a ranged attack at all: no Acc, no range bands, no
  // defense -- a roll against Will at its own range penalty, and a Quick
  // Contest for whoever it targets (Characters p. 106).
  if (rollType === "attack" && Number(target.dataset.malediction) > 0) {
    await rollMalediction(actor, event, target);
    return null;
  }

  // A ranged attack needs its range, which is not optional the way a
  // situational modifier is: defaulting it to zero would quietly roll every
  // shot as though it were point blank. So a plain click takes the range off
  // the map -- the distance from the shooter's token to the one target --
  // and rolls with nothing else asked; where that cannot be measured, or on
  // a shift-click, the dialog asks for everything.
  const malfunctionNumber = Number(target.dataset.malfunction) || 0;
  const weapon = weaponFromDataset(actor, { ...target.dataset });
  // A shot from a vehicle always asks, since whether the car swerved and
  // whether it is the car's own gun are things no map can say (p. 469). The
  // range is still measured, so the field starts at the right figure.
  const aboard = ranged ? vehicleAboard(actor) : null;
  // A rider asks too: whether the mount moved, and over what, is the
  // table's to say (pp. 397, 548; since 1.87.0).
  const riding = Boolean(ranged) && !aboard && actor?.system?.mounted === true && isRuleOn("mountedCombat");
  const measured = ranged && !(event as MouseEvent).shiftKey ? measuredShot(actor) : null;
  // The weapon the button belongs to, for the modules' attack options.
  const rolledItemId = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
  const rolledItem = rolledItemId ? actor?.items?.get?.(rolledItemId) ?? null : null;
  // A weapon out of action from a malfunction fires nothing until it is
  // cleared (Campaigns p. 407; since 1.71.0).
  const outOfAction = rollType === "attack" && ranged ? malfunctionOf(rolledItem) : null;
  if (outOfAction) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Malfunction.OutOfAction", { name: String(rolledItem?.name ?? ""), kind: outOfAction.label }));
    return null;
  }
  // The weapon's tech level against the skill's, and whether its user knows
  // this make (Characters pp. 168-169): lines keyed and tagged `techLevel`
  // and `unfamiliar`, for a module's listener to find (since 1.75.0). Worked
  // out before any dialog, which shows them in its effective skill.
  const equipmentUse = rollType === "attack" ? equipmentUseLines(actor, rolledItem, target.dataset.rollSkill) : null;
  if (equipmentUse?.impossible) {
    ui.notifications?.warn(equipmentUse.impossible);
    return null;
  }
  const equipmentShift = (equipmentUse?.lines ?? []).reduce((sum, line) => sum + line.value, 0);
  // An option a module says the attack must not go without -- a weapon's only
  // burst -- opens the dialog on a plain click too, where rolling past it
  // would fire as if it weren't there (since 1.94.0).
  const mustAsk = rollType === "attack" && requiredAttackOptions(attackContextFor({
    actor, item: rolledItem, ranged: Boolean(ranged), damageType: String(target.dataset.damageType ?? ""),
    reach: target.dataset.reach ?? "", effectiveSkill: base + equipmentShift,
  })).length > 0;
  // A target of a spray is shot at its share of the burst, at the Recoil its
  // place in the sweep gives it.
  const sprayed = spray ? { ...weapon, recoil: spray.recoil } : weapon;
  const shot = ranged
    ? measured && !aboard && !riding && !mustAsk
      ? quickShot(measured, sprayed, spray?.shots ?? null)
      : await promptForRangedAttack({
          ...sprayed,
          ...(spray ? { fixedShots: spray.shots } : {}),
          aboard,
          riding,
          mayFireMounted: mayFireMountedWeapon(actor, aboard),
          initialRange: measured?.rangeYards ?? 0,
          actor,
          item: rolledItem,
          effectiveSkill: base + equipmentShift,
          // Two pistols at once (Campaigns p. 417; since 1.153.0).
          dualWeaponTechnique: Number(actor?.system?.derived?.techniques?.dualWeaponAttack) || 0,
          ambidextrous: actor?.system?.derived?.traitEffects?.ambidextrous === true,
          offHandTraining: Number(actor?.system?.derived?.techniques?.offHandWeaponTraining) || 0,
          // A shot at the one foe's weapon, to break it (Campaigns p. 400; since 1.153.0).
          // Not for an explosive or fragmenting row, whose blast a blow to the item would lose.
          weaponTargets: rangedWeaponTargets(
            actor,
            targetedTokens().length === 1 ? targetedTokens()[0]?.actor : null,
            derivedRangedRow(actor, target.closest<HTMLElement>("[data-item-id]")),
          ),
        })
    : null;
  if (ranged && shot === null) return null;

  // A weapon with a minimum range cannot hit a target closer than it
  // (Characters p. 281): the attack is refused, unless a module's
  // `gworld.attackModifiers` listener clears the refusal and puts its own
  // penalty in (since 1.69.0).
  const minRange = ranged ? Math.max(0, Number(target.dataset.minRange) || 0) : 0;
  const tooClose = shot !== null && insideMinimumRange(shot.rangeYards, minRange)
    ? game.i18n.format("GWORLD.Ranged.InsideMinRange", { name: rollLabel ?? "", yards: shot.rangeYards, min: minRange })
    : null;

  // A melee attack asks only when asked -- shift-click, as every other roll --
  // but when it does ask, it asks about Deceptive Attack and Rapid Strike too,
  // since both are decided before the roll and both cost skill.
  const asksAboutMelee =
    !ranged && rollType === "attack" && ((event as MouseEvent).shiftKey || mustAsk);
  const melee = asksAboutMelee
    ? await promptForMeleeAttack({
        effectiveSkill: base + equipmentShift,
        damageType: (target.dataset.damageType ?? "cr") as DamageType,
        mounted: actor?.system?.mounted === true && isRuleOn("mountedCombat"),
        dualWeaponTechnique: Number(actor?.system?.derived?.techniques?.dualWeaponAttack) || 0,
        ambidextrous: actor?.system?.derived?.traitEffects?.ambidextrous === true,
        offHandTraining: Number(actor?.system?.derived?.techniques?.offHandWeaponTraining) || 0,
        eyes: eyesOf(actor),
        // "C, 1" and "1, 2" both reach as far as their last number does.
        reachYards: longestReach(target.dataset.reach ?? ""),
        actor,
        item: rolledItem,
        reach: target.dataset.reach ?? "",
        // A thrusting weapon on a Wait may be braced for a stop thrust (p. 366).
        stopThrust: actor?.system?.maneuver === "wait" && target.dataset.damageBase === "thr",
        halvedRapidStrike: target.dataset.rapidStrikeHalved === "1",
      })
    : null;
  if (asksAboutMelee && melee === null) return null;

  // "Firing from atop a moving animal tests both marksmanship and riding. Roll
  // against the lower of Riding or ranged weapon skill to hit" (p. 396).
  if (ranged && shot && actor?.system?.mounted === true && isRuleOn("mountedCombat")) {
    const capped = mountedShooting({
      ridingSkill: Number(actor?.system?.derived?.ridingSkill) || 6,
      weaponSkill: base,
    }).toHit;
    if (capped < base) {
      shot.modifiers.push({
        label: game.i18n.localize("GWORLD.Mounted.Riding"),
        value: capped - base,
      });
    }
  }

  const modifiers = shot
    ? shot.modifiers
    : melee
      ? melee.modifiers
      : await maybePromptModifiers(event, heldForRoll(actor, rollType, target.dataset.rollSkill ?? (rollType === "skill" ? rollLabel : undefined), target.dataset));
  if (modifiers === null) return null;

  modifiers.push(...standingRollLines(actor, {
    rollType,
    ranged: Boolean(ranged),
    hitModifier: target.dataset.hitModifier,
    basedOn: target.dataset.basedOn,
    wildSwing: melee?.wildSwing === true,
    dialogAsked: Boolean(melee || shot),
  }));
  if (equipmentUse) modifiers.push(...equipmentUse.lines);

  // "You must declare that you are using extra effort and spend the required FP
  // before you make your attack" -- and a fighter who cannot pay does not get
  // the option, so the roll is abandoned rather than made on a promise.
  // The eye can be aimed at only from the front or sides (Campaigns p. 552).
  const aimedShot = rollType === "attack" ? (melee?.calledShot ?? shot?.calledShot ?? null) : null;
  // Read for every attack, since `gworld.attackModifiers` hands it on too.
  const facing = rollType === "attack" ? facingAgainstTarget(actor) : null;
  const aimedArc = aimedShot ? (facing?.arc ?? null) : null;
  if (aimedShot && (!canTargetFromArc(aimedShot.hitLocation, aimedArc) || !registeredLocationAllowsArc(aimedShot.addonLocation, aimedArc))) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.CalledShot.NotFromBehind"));
    return null;
  }

  if (melee && melee.fatigue > 0) {
    const paid = await spendFatigue(actor, melee.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title"));
    if (!paid) return null;
    if (melee.mightyBlows) await recordMightyBlows(actor);
  }
  // A module's option chosen for a shot costs its FP the same way.
  if (shot?.addon && shot.addon.fatigue > 0) {
    const paid = await spendFatigue(actor, shot.addon.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title"));
    if (!paid) return null;
  }
  // What the modules' options chosen in the dialog did beyond the roll itself:
  // lines for the damage roll that follows, and for the defender's rolls.
  const chosenAddon = melee?.addon ?? shot?.addon ?? null;
  // What the options chosen on the attacker's maneuver do, which apply to
  // every attack made on it rather than being asked each time.
  const stance = rollType === "attack"
    ? maneuverOptionAttackEffect(attackContextFor({
        actor, item: rolledItem, ranged: Boolean(ranged), damageType: target.dataset.damageType ?? "",
        reach: target.dataset.reach ?? "", effectiveSkill: base,
      }))
    : null;
  if (stance && stance.fatigue > 0) {
    const paid = await spendFatigue(actor, stance.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title"));
    if (!paid) return null;
  }
  if (stance) modifiers.push(...stance.modifiers);
  // A merged effect carries the two fields that may be absent as null, which
  // the effect a listener writes says by leaving them out.
  const asEffect = ({ criticalSkill, malfunction, rateOfFire, recoil, ...rest }: NonNullable<typeof stance>) => ({
    ...rest,
    ...(criticalSkill !== null ? { criticalSkill } : {}),
    ...(malfunction !== null ? { malfunction } : {}),
    ...(rateOfFire !== null ? { rateOfFire } : {}),
    ...(recoil !== null ? { recoil } : {}),
  });
  const addon = stance && chosenAddon ? mergeAttackEffects([asEffect(chosenAddon), asEffect(stance)]) : (chosenAddon ?? stance);
  if (rollType === "attack") await recordAddonDamage(actor, addon?.damageModifiers ?? []);
  // And the options themselves, which the blow carries to where it lands (since API 1.108.0).
  if (rollType === "attack") await recordAttackOptions(actor, { ...(melee?.options ?? shot?.options ?? {}) });

  // A setting that spends more than one shot needs the shots to spend
  // (since 1.50.0). Refused rather than fired, because a weapon cannot use
  // rounds it has not got, and the cost is not visible until the option is
  // chosen.
  // A derived row that fires several of the stored mode's rounds a shot
  // needs them too (since 1.101.0).
  if (rollType === "attack" && ranged && shot && isRuleOn("reloading")) {
    const extra = Math.max(0, Math.floor(Number(shot.addon?.shots) || 0));
    const source = shotsSourceOf(target);
    const needed = shot.shellsFired * source.perShot + extra;
    const ready = (extra > 0 || source.perShot > 1) && Number.isInteger(source.modeIndex) ? shotsReady(rolledItem, source.modeIndex) : null;
    if (ready !== null && needed > ready) {
      ui.notifications?.warn(
        game.i18n.format("GWORLD.Ranged.NotEnoughShots", {
          name: String(rolledItem?.name ?? ""),
          needed,
          ready,
        }),
      );
      return null;
    }
  }

  // The foe's weapon a shot is aimed at, as the damage rolls will need it (since API 1.153.0).
  const struckFoe = shot?.weaponStrike ? targetedTokens()[0]?.actor : null;
  const struckWeapon = shot?.weaponStrike && struckFoe?.uuid
    ? { actorUuid: String(struckFoe.uuid), itemId: shot.weaponStrike.id, name: shot.weaponStrike.name }
    : null;

  // Where the blow was aimed travels to the damage roll, which is a separate
  // click: an attack that went for the skull should not have to be told twice.
  if (rollType === "attack") {
    await recordCalledShot(actor, melee?.calledShot ?? shot?.calledShot ?? null);
    await recordTurnedBlade(actor, melee?.turned === true);
    await recordPulledBlow(actor, melee?.pulledSt ?? null);
    if (melee?.charging) await recordCharge(actor);
    await recordStopThrust(actor, melee?.stopThrustBonus ?? 0);
    await recordLance(actor, melee?.lance ?? null);
    // Whatever this row's last attack was aimed at is done with; a shot at a
    // foe's weapon is held once the roll says how many hits it scored.
    await recordWeaponStrike(actor, shotRow(target.closest<HTMLElement>("[data-item-id]")), null);
    // Pellets striking as one mass are a fact about this shot that the damage
    // roll, a separate click, has to be told.
    await recordMassShot(actor, shot?.coneMultiplier ?? null);
    // And that the next damage roll from this row is the first hit of a shot
    // whose first projectile has its own line (since API 1.73.0).
    await recordFirstHit(
      actor,
      shot && target.dataset.firstHit === "1" && Number(target.dataset.projectiles) > 1
        ? shotRow(target.closest<HTMLElement>("[data-item-id]"))
        : null,
    );
    // And how far it went, for a module's damage hook.
    await recordShotRange(actor, shot ? shot.rangeYards : null, shotRow(target.closest<HTMLElement>("[data-item-id]")));
    // So does being past 1/2D, which halves whatever the damage roll comes to.
    await recordHalfDamage(
      actor,
      shot !== null &&
        beyondHalfDamage({
          rangeYards: shot.rangeYards,
          halfDamageRange: Number(target.dataset.halfDamageRange) || 0,
          guidance: target.dataset.guidance ?? "",
        }),
    );
  }

  // A Feint made last turn is spent by this attack, whether or not it is aimed
  // at the foe who was feinted -- it was good for one second either way.
  const feint =
    rollType === "attack" && isRuleOn("feint") ? await consumeFeint(actor) : 0;

  modifiers.push(...positionRollLines(actor, { rollType, ranged: Boolean(ranged) }));
  // Stealth's penalty for encumbrance (Characters p. 222), keyed so gear can
  // lighten it (since API 1.103.0).
  if (rollType === "skill") {
    const burden = skillEncumbrancePenalty(String(target.dataset.rollSkill ?? rollLabel ?? ""), Number(actor?.system?.derived?.encumbrance?.level) || 0);
    if (burden !== 0) modifiers.push({ label: game.i18n.localize("GWORLD.Field.Encumbrance"), value: burden, key: "encumbrance" });
  }
  // A Vision roll at the one token targeted: its size and range, less what
  // Telescopic Vision ignores (Characters pp. 92, 358).
  if (target.dataset.sense === "vision") modifiers.push(...visionRangeLines(actor));
  // What a module's aid to aiming gives against the foe aimed at (since API 1.63.0).
  if (rollType === "attack" && ranged) {
    const aimedAt = targetedTokens().length === 1 ? tokenUuid(targetedTokens()[0]) : "";
    modifiers.push(...aimTargetLines(aimStateOf(actor), aimTurnsOf(actor), aimedAt));
  }
  // What Evaluate earned and whether this is Move and Attack, which the hook
  // below is told separately; positionRollLines has put their lines in.
  const evaluated = rollType === "attack" && !ranged ? evaluateBonusFor(actor) : 0;
  const movingMelee = rollType === "attack" && !ranged && actor?.system?.maneuver === "moveAndAttack";
  // A zen skill's success waiting for this shot (Characters p. 228; since
  // 1.91.0): the attack is tagged `zen`, and its line is worked out once the
  // listeners have had their say about the size and range lines.
  const zenShot = rollType === "attack" && ranged && shot ? zenShotFor(actor, String(target.dataset.rollSkill ?? "")) : null;

  // A module may add to the attack roll and to what the defender faces, with
  // what each line is for.
  const attackRow = target.closest<HTMLElement>("[data-item-id]");
  const attackModeIndex = Number(attackRow?.dataset.modeIndex);
  // A derived mode the character has itself has no item, but still names its mode (API 1.35.0).
  const attackMode = (rolledItem || attackRow?.dataset.derivedMode) && attackRow?.dataset.modeIndex !== undefined && Number.isInteger(attackModeIndex)
    ? { index: attackModeIndex, ranged: attackRow.dataset.ranged === "1", ...(attackRow.dataset.derivedMode ? { derived: attackRow.dataset.derivedMode } : {}) }
    : null;
  // A homing weapon's lock-on and, for a semi-active one, who holds the spot
  // on the target (since API 1.128.0). Asked before the attack's own hook, so
  // what a listener decides about the lock-on is on the lines that hook sees.
  const homing = rollType === "attack" && ranged && shot && weapon.guidance === "homing"
    ? homingAttack({ actor, item: rolledItem, mode: attackMode, shot, weapon, semiActive: target.dataset.semiActive === "1" })
    : null;
  if (homing) applyLockOn(modifiers, homing.lockedOn === true, weapon);
  const hooked = rollType === "attack"
    ? callCombatHook(COMBAT_HOOKS.attackModifiers, {
        actor,
        item: rolledItem,
        mode: attackMode,
        rollType,
        ranged: Boolean(ranged),
        modifiers,
        defensePenalty: (melee?.defensePenalty ?? shot?.defensePenalty ?? 0) + feint,
        defenseModifiers: [...(addon?.defenseModifiers ?? [])],
        dataset: { ...target.dataset },
        // Move and Attack and a Wild Swing both hold skill to 9.
        skillCap: movingMelee || melee?.wildSwing ? WILD_SWING_SKILL_CAP : (null as number | null),
        // Since 1.40.0: whether this is a Wild Swing.
        wildSwing: melee?.wildSwing === true,
        // Since 1.111.0: a punch or a kick (Characters p. 271), or null for
        // any other attack, so a rule about a restrained or crippled limb can
        // refuse the one and allow the other.
        unarmed: unarmedBlow(target.dataset.naturalKey),
        // Where the blow is aimed, and at whom.
        calledShot: (() => {
          const aimedAt = melee?.calledShot ?? shot?.calledShot ?? null;
          return aimedAt ? { hitLocation: aimedAt.hitLocation, addonLocation: aimedAt.addonLocation ?? null, chink: aimedAt.chink === true } : null;
        })(),
        targets: targetedTokens().map((token: any) => token?.actor).filter(Boolean),
        // Since 1.23.0: the tokens themselves, for where the targets stand.
        targetTokens: targetedTokens().filter((token: any) => token?.actor).map((token: any) => token?.document ?? token),
        // Set where the target is inside the weapon's minimum range (since 1.69.0).
        refusal: tooClose as string | null,
        // Since 1.21.0: the options chosen, and what went into the defense
        // penalty and the roll from a Deceptive Attack, a feint and Evaluate.
        options: { ...(melee?.options ?? shot?.options ?? {}) } as Record<string, unknown>,
        deceptive: melee?.deceptive ?? 0,
        feint,
        evaluate: evaluated,
        // Since 1.27.0: the system's extra effort bought for this attack.
        extraEffort: { flurryOfBlows: melee?.flurryOfBlows === true, mightyBlows: melee?.mightyBlows === true },
        // Since 1.63.0: how the attacker has moved this turn, and the aim they hold.
        movement: attackerMovement(actor),
        aim: aimStateOf(actor),
        // Since 1.65.0: tags for the attack roll, which condition and area lines and modules read.
        // Since 1.75.0 `techLevel` and `unfamiliar` where the weapon took those lines.
        tags: [...(equipmentUse?.tags ?? []), ...(zenShot ? ["zen"] : [])] as string[],
        // Since 1.69.0: how far the shot is, in yards (null for a melee
        // attack), and the weapon's minimum range. Inside it, `refusal`
        // starts out saying so.
        rangeYards: shot ? shot.rangeYards : (null as number | null),
        minRange,
        // Since 1.70.0: this target's share of a Spraying Fire burst, or null.
        spraying: spray ? { ...spray } : (null as SprayShot | null),
        // Since 1.83.0: the shells this attack fires (null for a melee
        // attack), and what an option spends beyond them. Read-only.
        shots: shot ? shot.shellsFired : (null as number | null),
        extraShots: shot ? Math.max(0, Math.floor(Number(shot.addon?.shots) || 0)) : 0,
        // Since 1.86.0: the laser sight (null for a melee attack) -- whether
        // it is on, whether the target saw the dot, and what that gives the
        // target's Dodge, which a listener may change. Its to-hit line is in
        // `modifiers`, keyed `laser`.
        laser: shot
          ? { on: shot.laser?.on === true, targetSees: shot.laser?.targetSees === true, dodgeBonus: shot.dodgeBonus ?? 0 }
          : (null as { on: boolean; targetSees: boolean; dodgeBonus: number } | null),
        // Since 1.91.0: a zen skill's success this shot spends, `{ id, skill }`,
        // or null. Set it to null and the shot takes no `zen` line.
        zen: zenShot ? { ...zenShot } : (null as ZenShot | null),
        // Since 1.137.0: the arc the blow comes at the one target from, and
        // which side for a side attack, as the called shot read it. Null
        // outside tactical combat or without a single target. Read-only.
        arc: facing?.arc ?? null,
        side: facing?.side ?? null,
        // Since 1.153.0: a Dual-Weapon Attack (Campaigns p. 417), melee or
        // ranged, as `{ hand, sameTarget }`, or null; its line is in
        // `modifiers`, keyed `dualWeapon`. Read-only.
        dualWeapon: (() => {
          const dual = melee?.dualWeapon ?? shot?.dualWeapon ?? null;
          return dual ? { hand: dual.hand, sameTarget: dual.sameTarget } : null;
        })() as DualWeaponChoice | null,
        // Since 1.153.0: the foe's weapon a shot is aimed at to break it
        // (Campaigns p. 400), as `{ itemId, name, penalty }`, or null; its
        // line is in `modifiers`, keyed `strikeAtWeapon`. Read-only.
        weaponStrike: shot?.weaponStrike
          ? { itemId: shot.weaponStrike.id, name: shot.weaponStrike.name, penalty: shot.weaponStrike.penalty }
          : (null as { itemId: string; name: string; penalty: number } | null),
      })
    : null;
  // A module's rules may make this attack impossible here: it isn't rolled.
  const refusal = hooked ? hooked.refusal : tooClose;
  if (typeof refusal === "string" && refusal.trim()) {
    ui.notifications?.warn(refusal.trim());
    return null;
  }
  // What the zen skill gives back of the size and range penalties, from the
  // lines as the listeners left them.
  const zenApplied = hooked?.zen && typeof hooked.zen.id === "string" ? zenLine(hooked.zen, modifiers) : null;
  if (zenApplied) modifiers.push(zenApplied);
  const defensePenalty = Number(hooked?.defensePenalty ?? (melee?.defensePenalty ?? shot?.defensePenalty ?? 0) + feint) || 0;
  // What the laser dot gives the target's Dodge, after the listeners (since 1.86.0).
  const laserDodge = hooked?.laser
    ? Math.max(0, Math.floor(Number(hooked.laser.dodgeBonus) || 0))
    : (shot?.dodgeBonus ?? 0);

  // A shot taken at a measured range says so on the card, where the number
  // came from being the one thing a player will want to check -- and so does
  // anything a module's option had to say about the attack.
  const noted = [
    ...(addon && addon.reachBonus !== 0 ? [game.i18n.format("GWORLD.Addon.Reach", { yards: addon.reachBonus > 0 ? `+${addon.reachBonus}` : addon.reachBonus })] : []),
    // What a setting cost the weapon, beside what it was worth to the roll
    // (since 1.50.0): rounds spent, a Malf. of its own, a halved Rate of Fire.
    ...(addon && addon.shots > 0 ? [game.i18n.format("GWORLD.Addon.ExtraShots", { shots: addon.shots })] : []),
    ...(addon && addon.malfunction !== null ? [game.i18n.format("GWORLD.Addon.Malfunction", { number: addon.malfunction })] : []),
    ...(addon && (addon.rateOfFireMultiplier !== 1 || addon.rateOfFire !== null) && shot?.rateOfFire
      ? [game.i18n.format("GWORLD.Addon.RateOfFire", { rof: shot.rateOfFire })]
      : []),
    // And a Recoil an option set or added to (since 1.70.0).
    ...(addon && (addon.recoil !== null || addon.recoilModifier !== 0) && shot
      ? [game.i18n.format("GWORLD.Addon.Recoil", { recoil: shot.recoil })]
      : []),
    // One target of a Spraying Fire burst (Campaigns p. 409).
    ...(spray ? [game.i18n.format("GWORLD.Spraying.Card", { index: spray.index + 1, count: spray.count, shots: spray.shots, recoil: spray.recoil })] : []),
    ...(addon?.notes ?? []).map((note) => game.i18n.localize(note)),
  ];
  const label = [
    measured
      ? `${rollLabel ?? rollType ?? "Roll"} (${game.i18n.format("GWORLD.Ranged.Measured", { yards: measured.rangeYards })})`
      : (rollLabel ?? rollType ?? "Roll"),
    ...(place ? [game.i18n.format("GWORLD.Attack.SequencePlace", place)] : []),
    ...noted,
  ].join(" — ");

  // What the weapon is, for the defender's parry to weigh and the fumble
  // table to read (Campaigns pp. 376, 556). A weapon that says nothing
  // weighs nothing, which is what a spell or a natural attack should say.
  const weaponWeight = Number(target.dataset.weaponWeight);
  const wielded = Number.isFinite(weaponWeight)
    ? {
        weight: weaponWeight,
        material: target.dataset.material ?? "",
        swung: target.dataset.swung === "1",
        resistsBreakage: target.dataset.resistsBreakage === "1",
        skill: String(target.dataset.rollSkill ?? ""),
        thrust: target.dataset.ranged !== "1" && target.dataset.damageBase === "thr",
        flail: flailKind(target.dataset.rollSkill, String(rolledItem?.name ?? rollLabel ?? "")),
        ...(rolledItem?.uuid ? { itemUuid: String(rolledItem.uuid) } : {}),
        mode: attackMode,
      }
    : undefined;

  // Unarmed, in hand, thrown, or shot: the four the cinematic rules tell
  // apart (p. 417). A spell or anything else that says nothing is treated as
  // having been shot, which is the case the rule is permissive about.
  const delivery: Delivery =
    target.dataset.unarmed === "1"
      ? "unarmed"
      : target.dataset.ranged !== "1"
        ? "melee"
        : target.dataset.thrown === "1"
          ? "thrown"
          : "ranged";

  // Held to a cap on effective skill, once everything else is in.
  const capped = hooked ? skillCapLine(base, modifiers, hooked.skillCap === null || hooked.skillCap === undefined ? null : Number(hooked.skillCap), game.i18n.format("GWORLD.Attack.SkillCap", { cap: Number(hooked.skillCap) })) : null;
  if (capped) modifiers.push(capped);

  // Where an aimed blow that misses by 1 lands (p. 552), a module's location saying for itself.
  const missedInto = (() => {
    const into = aimedShot ? missFallbackFor(aimedShot, missByOneHitsTorso) : null;
    if (!into) return null;
    const added = into.addonLocation ? registeredHitLocation(into.addonLocation) : undefined;
    return { ...into, label: added ? added.label : game.i18n.localize(`GWORLD.HitLocation.${into.hitLocation}`).toLowerCase() };
  })();

  // A projectile aimed with one skill and homing with its own (since API 1.63.0):
  // the aiming roll comes first, and only on a success is the attack rolled.
  const storedMode = rolledItem && attackMode && !attackMode.derived
    ? (attackMode.ranged ? rolledItem.system?.rangedModes : rolledItem.system?.meleeModes)?.[attackMode.index]
    : null;
  // The row says it where a module's listener set it (since API 1.64.0); the stored mode otherwise.
  const guided = rollType === "attack"
    ? aimedThenGuided(target.dataset.aimingSkill ? { aimingSkill: target.dataset.aimingSkill, guidedSkillLevel: target.dataset.guidedSkillLevel } : storedMode)
    : null;
  if (guided) {
    const aiming = await rollSuccess({
      actor,
      base: aimingLevel(actor, guided.aimingSkill),
      label: game.i18n.format("GWORLD.Ranged.AimingRoll", { skill: guided.aimingSkill }),
      kind: "skill",
      skill: guided.aimingSkill,
      tags: ["aiming"],
    });
    if (!aiming?.success) return null;
  }

  // A semi-active weapon only finds the target while the spot is held on it:
  // one roll a turn of flight, made before the attack is (since API 1.128.0).
  // On the first one failed it misses. It was still launched, so it spends
  // its shot and the aim as any other attack does; it is just never rolled.
  const designation = homing?.semiActive === true ? await holdDesignation(actor, homing) : null;
  const spotLost = designation !== null && !designation.held;

  // The item the roll is made with, for the listeners (since 1.95.0): the
  // weapon of an attack, the tool the preparation picked for a skill.
  const rollingWith = rollType === "attack"
    ? rolledItem
    : rollType === "skill"
      ? toolFor(actor, String(target.dataset.rollSkill ?? rollLabel ?? ""))
      : null;
  const outcome = spotLost ? null : await rollSuccess({
    actor,
    base: guided?.skillLevel ?? base,
    label,
    kind: rollKind(rollType),
    ...(rollingWith ? { item: rollingWith } : {}),
    // The attribute a skill or attribute roll is based on, as a tag a condition's rolls can name (API 1.42.0),
    // and the sense a Perception roll is made by (API 1.63.0).
    // Since 1.65.0 an attack's roll also carries the tags a `gworld.attackModifiers` listener added.
    ...(target.dataset.basedOn || target.dataset.sense || (hooked?.tags ?? []).length
      ? { tags: [target.dataset.basedOn, target.dataset.sense, ...(hooked?.tags ?? [])].filter((t): t is string => typeof t === "string" && Boolean(t)) }
      : {}),
    // Who is being looked for: the one token targeted, on a roll to detect (API 1.63.0).
    ...(rollType !== "attack" && targetedTokens().length === 1 && targetedTokens()[0]?.actor
      ? { subject: targetedTokens()[0].actor }
      : {}),
    // The skill rolled, for bonus points only that skill's may pay for.
    ...(target.dataset.rollSkill || rollType === "skill" ? { skill: String(target.dataset.rollSkill ?? rollLabel ?? "") } : {}),
    ...(rollType === "attack" ? { delivery, damageType: target.dataset.damageType ?? "" } : {}),
    // A Missile spell "may block or dodge, but not parry" (Characters p. 241).
    noParry: target.dataset.noParry === "1",
    ...(wielded ? { weapon: wielded } : {}),
    modifiers,
    // Which critical miss table a fumble reads is decided by the attack, and
    // the sheet is where that is known.
    unarmed: target.dataset.unarmed === "1",
    // A Deceptive Attack's whole purpose is the penalty it puts on the
    // defender, and a Feint's is the same penalty bought a turn earlier, so
    // both travel with the attack to the defense card.
    ...(defensePenalty !== 0 ? { defensePenalty } : {}),
    // A module's option may put lines on the defender's rolls, and judge
    // criticals against another skill.
    ...(hooked && hooked.defenseModifiers.length > 0 ? { defenseModifiers: hooked.defenseModifiers } : {}),
    ...(addon && addon.criticalSkill !== null ? { criticalSkill: addon.criticalSkill } : {}),
    // A weapon that can jam says so on the button; one that cannot -- a bow, a
    // thrown rock -- carries nothing and is never asked.
    ...(malfunctionNumber || addon?.malfunction
      ? {
          malfunction: {
            // A setting that makes the weapon likelier to jam sets its own
            // Malf. for this attack; the stricter of the two is rolled against
            // (Campaigns p. 407). A weapon with no Malf. of its own can still
            // be given one by the setting.
            number: Math.min(
              ...[malfunctionNumber, addon?.malfunction].filter((n): n is number => typeof n === "number" && n > 0),
            ),
            // The weapon's own TL where it says one; else the wielder's.
            techLevel: Number(rolledItem?.system?.tl) || Number(actor?.system?.tl) || 3,
            revolver: target.dataset.revolver === "1",
            ...(rolledItem ? { item: rolledItem } : {}),
            ...(Number.isInteger(Number(target.dataset.modeIndex)) && target.dataset.modeIndex !== "" ? { modeIndex: Number(target.dataset.modeIndex) } : {}),
          },
        }
      : {}),
    // Only a burst needs its hits counted; a single shot either hits or does
    // not, and saying "1 hit" on every arrow would be noise. A spread of
    // pellets counts as a burst at Rcl 1, however many shells were fired.
    ...(shot && shot.shotsFired > 1
      ? { rapidFire: { shotsFired: shot.shotsFired, recoil: shot.recoil } }
      : {}),
    ...(laserDodge ? { dodgeBonus: laserDodge } : {}),
    // What the foe may do about a shot at a weapon a module's rules limit (since 1.153.0).
    ...(shot?.weaponStrike && (shot.weaponStrike.noParry || shot.weaponStrike.noDefenseBonus)
      ? { strikeLimits: { noParry: shot.weaponStrike.noParry, noDefenseBonus: shot.weaponStrike.noDefenseBonus } }
      : {}),
    // Where an aimed blow that misses by 1 lands instead (p. 552).
    ...(missedInto ? { missFallback: missedInto.label, missFallbackShot: { hitLocation: missedInto.hitLocation, addonLocation: missedInto.addonLocation } } : {}),
    ...(aimedShot ? { calledShot: { hitLocation: aimedShot.hitLocation, addonLocation: aimedShot.addonLocation ?? null } } : {}),
    // A steered or area attack says what it is doing, which needs the range
    // it was actually fired at (Campaigns pp. 412-413).
    ...(rollType === "attack" && ranged && shot
      ? {
          guidance: guidanceReport({
            guidance: weapon.guidance,
            rangeYards: shot.rangeYards,
            halfDamageRange: weapon.halfDamageRange,
            maxRange: weapon.maxRange,
            areaAttack: weapon.areaAttack,
            coneMaxWidth: weapon.coneMaxWidth,
          }),
        }
      : {}),
  });
  // An attack that could not be attempted -- effective skill below 3 -- was
  // never made: it spends no shots and no aim (since 1.83.0).
  if (outcome === null && !spotLost) return null;
  // Every hit of a burst at a weapon lands on the weapon, and a miss on nothing.
  if (rollType === "attack" && struckWeapon && shot) {
    await recordWeaponStrike(
      actor,
      shotRow(target.closest<HTMLElement>("[data-item-id]")),
      struckWeapon,
      weaponStrikeHits(outcome, shot),
    );
  }
  // The shot spends the zen skill's success, whatever became of it.
  if (zenShot) await clearZenShot(actor);

  // A shot at a random location behind cover (p. 407): "For shots that hit a
  // location that is only half exposed, roll 1d: on a roll of 4-6, the shot
  // strikes cover, not the target." Whether the location it found is half
  // exposed is the GM's to see, so the die is rolled and both readings given.
  if (rollType === "attack" && shot?.cover === "randomLocation" && outcome?.success) {
    const die = new Roll("1d6");
    await die.evaluate();
    const strikes = struckCover(die.total, coverShot({ approach: "randomLocation" }));
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${game.i18n.localize("GWORLD.Cover.randomLocation")}</span></div>
        <div class="gc-dice"><span class="gc-total">${die.total}</span></div>
        <div class="gc-result">${game.i18n.localize(strikes ? "GWORLD.Cover.StrikesCover" : "GWORLD.Cover.HitsTarget")}</div></div>`,
      rolls: [die],
    });
  }

  // A blow that missed its mark by 1 lands on the torso, and so does its damage (p. 552).
  if (rollType === "attack" && aimedShot && (outcome as { hitsInstead?: boolean } | null)?.hitsInstead) {
    // Cleared first: a flag set over another merges into it, and would keep the old location.
    await recordCalledShot(actor, null);
    await recordCalledShot(actor, { hitLocation: missedInto?.hitLocation ?? "torso", chink: false, ...(missedInto?.addonLocation ? { addonLocation: missedInto.addonLocation } : {}) });
  }

  // The shells fired come off the weapon's count (Campaigns p. 373) -- for a
  // module's derived row, off the stored mode it fires from (since 1.101.0).
  const shotsSource = shotsSourceOf(target);
  if (rollType === "attack" && ranged && shot && isRuleOn("reloading")) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? actor?.items?.get(id) : null;
    // "shots" on an option is what a setting spends beyond the shells fired.
    // So do a spray's shots wasted swinging to this target (Campaigns p. 409).
    const spent = (shot.shellsFired + (spray?.wasted ?? 0)) * shotsSource.perShot + Math.max(0, Math.floor(Number(shot.addon?.shots) || 0));
    if (item?.isOwner && Number.isInteger(shotsSource.modeIndex)) await spendShots(item, shotsSource.modeIndex, spent);
  }
  // What the attack spent, for the modules (since 1.71.0): once for the
  // attack, or -- for one target of a spray -- added to the burst's tally,
  // which is announced once the burst is over.
  if (rollType === "attack" && ranged && shot) {
    const extra = Math.max(0, Math.floor(Number(shot.addon?.shots) || 0));
    const wasted = spray?.wasted ?? 0;
    if (tally) {
      tally.fired += shot.shellsFired;
      tally.extra += extra;
      tally.wasted += wasted;
      tally.targets += 1;
    } else {
      announceShots({
        actor, item: rolledItem, modeIndex: shotsSource.modeIndex,
        fired: shot.shellsFired * shotsSource.perShot, extra, wasted: 0, kind: shot.shellsFired > 1 ? "rapidFire" : "single", targets: 1,
        derivedMode: shotsSource.derivedMode,
      });
    }
  }

  // A fumble that broke the weapon (Campaigns p. 556) is applied to it.
  if (rollType === "attack" && (outcome as any)?.criticalMissEffect === "weaponBreaks" && isRuleOn("weaponBreakage")) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? actor?.items?.get(id) : null;
    if (item?.isOwner) await breakWeapon(actor, item, "fumble");
  }

  // The shot spends the aim, and a swing of a weapon too heavy to hold
  // steady leaves it needing a Ready maneuver before the next.
  if (rollType === "attack" && ranged) await loseAim(actor, "fired");
  if (rollType === "attack" && !ranged && target.dataset.unreadyAfter === "1") {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? actor?.items?.get(id) : null;
    if (item?.isOwner) {
      await item.update({ "system.unready": true });
      ui.notifications?.info(game.i18n.format("GWORLD.Ready.NowUnready", { name: String(item.name) }));
    }
  }

  // A launch that lost its spot still counts as the attack made this turn,
  // which the caller only records for a roll it was handed back.
  if (spotLost && !spray && Boolean((game as any).combat?.started)) await recordAttackMade(actor);

  return outcome;
}

/** Where the attack options chosen wait for the damage roll (since API 1.108.0). */
const ATTACK_OPTIONS_FLAG = "attackOptions";

/**
 * The options as `[key, value]` pairs, the way a flag keeps them: a key is
 * `<module>.<key>`, and Foundry would read its dot as a path and nest it.
 */
export function attackOptionEntries(values: Record<string, unknown> | null | undefined): Array<[string, unknown]> {
  return Object.entries(values ?? {});
}

/** The options back from their pairs, passing over anything that isn't one. */
export function attackOptionsFromEntries(entries: unknown): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!Array.isArray(entries)) return values;
  for (const entry of entries) {
    if (Array.isArray(entry) && typeof entry[0] === "string" && entry[0]) values[entry[0]] = entry[1];
  }
  return values;
}

async function recordAttackOptions(actor: any, values: Record<string, unknown>): Promise<void> {
  if (!actor?.isOwner) return;
  const entries = attackOptionEntries(values);
  if (entries.length > 0) await actor.setFlag(SYSTEM_ID, ATTACK_OPTIONS_FLAG, entries);
  else if (actor.getFlag?.(SYSTEM_ID, ATTACK_OPTIONS_FLAG)) await actor.unsetFlag(SYSTEM_ID, ATTACK_OPTIONS_FLAG);
}

async function consumeAttackOptions(actor: any): Promise<Record<string, unknown>> {
  const entries = actor?.getFlag?.(SYSTEM_ID, ATTACK_OPTIONS_FLAG);
  if (entries && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, ATTACK_OPTIONS_FLAG);
  return attackOptionsFromEntries(entries);
}

/** Where the damage lines a module's attack option added wait for the damage roll. */
const ADDON_DAMAGE_FLAG = "addonDamage";

async function recordAddonDamage(actor: any, lines: ModifierLine[]): Promise<void> {
  if (!actor?.isOwner) return;
  if (lines.length > 0) await actor.setFlag(SYSTEM_ID, ADDON_DAMAGE_FLAG, lines);
  else if (actor.getFlag?.(SYSTEM_ID, ADDON_DAMAGE_FLAG)) await actor.unsetFlag(SYSTEM_ID, ADDON_DAMAGE_FLAG);
}

async function consumeAddonDamage(actor: any): Promise<ModifierLine[]> {
  const lines = actor?.getFlag?.(SYSTEM_ID, ADDON_DAMAGE_FLAG);
  if (Array.isArray(lines) && lines.length > 0 && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, ADDON_DAMAGE_FLAG);
  return Array.isArray(lines)
    ? lines.filter((l) => typeof l?.label === "string" && typeof l?.value === "number" && Number.isFinite(l.value))
    : [];
}

/** Where a couched lance's charge waits for the damage roll (p. 396). */
const LANCE_FLAG = "lance";

async function recordLance(
  actor: any,
  lance: { mountSt: number; yards: number; jousting: boolean } | null,
): Promise<void> {
  if (!actor?.isOwner) return;
  if (lance) await actor.setFlag(SYSTEM_ID, LANCE_FLAG, lance);
  else if (actor.getFlag?.(SYSTEM_ID, LANCE_FLAG)) await actor.unsetFlag(SYSTEM_ID, LANCE_FLAG);
}

async function consumeLance(actor: any): Promise<{ mountSt: number; yards: number; jousting: boolean } | null> {
  const lance = actor?.getFlag?.(SYSTEM_ID, LANCE_FLAG) ?? null;
  if (lance && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, LANCE_FLAG);
  return lance && lance.mountSt > 0 ? lance : null;
}

/** Where a shot past 1/2D is remembered for the damage roll. */
const HALF_DAMAGE_FLAG = "halfDamage";

async function recordHalfDamage(actor: any, halved: boolean): Promise<void> {
  if (!actor?.isOwner) return;
  if (halved) await actor.setFlag(SYSTEM_ID, HALF_DAMAGE_FLAG, true);
  else if (actor.getFlag?.(SYSTEM_ID, HALF_DAMAGE_FLAG)) await actor.unsetFlag(SYSTEM_ID, HALF_DAMAGE_FLAG);
}

async function consumeHalfDamage(actor: any): Promise<boolean> {
  const halved = actor?.getFlag?.(SYSTEM_ID, HALF_DAMAGE_FLAG) === true;
  if (halved && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, HALF_DAMAGE_FLAG);
  return halved;
}

/**
 * Where the range a shot was taken at is kept for the damage roll, which a
 * module's damage hook reads (since 1.69.0), with the row it was fired from:
 * a punch thrown next is not at the range the rifle fired at.
 */
const SHOT_RANGE_FLAG = "shotRange";

/** The row a shot's range belongs to: its item's id, or its derived mode's key, and its mode. */
/**
 * What a hit from a suppression zone leaves for the damage roll, which is a
 * separate click on the firer's row (Campaigns p. 409): how far the victim
 * was, whether that is past 1/2D, and no option's lines or mass of pellets.
 */
export async function recordSuppressionShot(actor: any, rowKey: string, rangeYards: number, halfDamageRange: number): Promise<void> {
  await recordAddonDamage(actor, []);
  await recordAttackOptions(actor, {});
  await recordMassShot(actor, null);
  await recordFirstHit(actor, null);
  await recordShotRange(actor, rangeYards, rowKey);
  await recordHalfDamage(actor, beyondHalfDamage({ rangeYards, halfDamageRange }));
}

/**
 * How many damage rolls a shot at a weapon lands on it: the burst's hits
 * (Campaigns p. 373) on a hit, none on a miss (since API 1.153.0).
 */
export function weaponStrikeHits(
  outcome: { success?: boolean; margin?: number } | null,
  shot: { shotsFired: number; recoil: number },
): number {
  if (!outcome?.success) return 0;
  if (shot.shotsFired <= 1) return 1;
  return rapidFireHits({ margin: Number(outcome.margin) || 0, shotsFired: shot.shotsFired, recoil: shot.recoil });
}

/** The character's derived ranged row a sheet row stands for, or null. */
function derivedRangedRow(actor: any, row: HTMLElement | null | undefined): { explosive?: boolean; fragmentation?: string } | null {
  if (!row) return null;
  const rows: any[] = actor?.system?.derived?.ranged ?? [];
  return rows.find((r) =>
    String(r?.itemId ?? "") === (row.dataset.itemId ?? "") &&
    String(r?.modeIndex ?? "") === (row.dataset.modeIndex ?? "") &&
    String(r?.derivedMode ?? "") === (row.dataset.derivedMode ?? "")) ?? null;
}

function shotRow(row: HTMLElement | null | undefined): string {
  if (!row) return "";
  return [row.dataset.itemId ?? "", row.dataset.derivedMode ?? "", row.dataset.modeIndex ?? ""].join("|");
}

async function recordShotRange(actor: any, yards: number | null, row: string): Promise<void> {
  if (!actor?.isOwner) return;
  if (yards !== null && Number.isFinite(yards)) await actor.setFlag(SYSTEM_ID, SHOT_RANGE_FLAG, { yards: Math.max(0, yards), row });
  else if (actor.getFlag?.(SYSTEM_ID, SHOT_RANGE_FLAG) !== undefined) await actor.unsetFlag(SYSTEM_ID, SHOT_RANGE_FLAG);
}

/** The range recorded for this row's last shot, spent by reading it; null for none or another row's. */
async function consumeShotRange(actor: any, row: string): Promise<number | null> {
  const shot = actor?.getFlag?.(SYSTEM_ID, SHOT_RANGE_FLAG);
  if (shot === undefined || shot === null) return null;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, SHOT_RANGE_FLAG);
  const yards = Number(shot?.yards);
  return shot?.row === row && Number.isFinite(yards) ? Math.max(0, yards) : null;
}

/** Where a shot's pellets striking as one mass are kept for the damage roll. */
const MASS_SHOT_FLAG = "massShot";

async function recordMassShot(actor: any, multiplier: number | null): Promise<void> {
  if (!actor?.isOwner) return;
  if (multiplier === null || multiplier <= 1) {
    if (actor.getFlag?.(SYSTEM_ID, MASS_SHOT_FLAG)) await actor.unsetFlag(SYSTEM_ID, MASS_SHOT_FLAG);
    return;
  }
  await actor.setFlag(SYSTEM_ID, MASS_SHOT_FLAG, multiplier);
}

async function consumeMassShot(actor: any): Promise<number> {
  const multiplier = Number(actor?.getFlag?.(SYSTEM_ID, MASS_SHOT_FLAG) ?? 1);
  if (multiplier > 1 && actor.isOwner) await actor.unsetFlag(SYSTEM_ID, MASS_SHOT_FLAG);
  return multiplier > 1 ? multiplier : 1;
}

/**
 * Where a shot whose first hit has a line of its own is remembered for the
 * damage roll (since API 1.73.0), with the row it was fired from.
 */
const FIRST_HIT_FLAG = "firstHit";

async function recordFirstHit(actor: any, row: string | null): Promise<void> {
  if (!actor?.isOwner) return;
  if (row !== null) await actor.setFlag(SYSTEM_ID, FIRST_HIT_FLAG, row);
  else if (actor.getFlag?.(SYSTEM_ID, FIRST_HIT_FLAG) !== undefined) await actor.unsetFlag(SYSTEM_ID, FIRST_HIT_FLAG);
}

/** Whether this row's next damage roll is its shot's first hit, spent by reading it. */
async function consumeFirstHit(actor: any, row: string): Promise<boolean> {
  const pending = actor?.getFlag?.(SYSTEM_ID, FIRST_HIT_FLAG);
  if (pending !== row) return false;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, FIRST_HIT_FLAG);
  return true;
}

/** What the map knows about a shot: how far, and at what size. */
interface MeasuredShot {
  rangeYards: number;
  targetSizeModifier: number;
}

/**
 * The range to the one targeted token, read off the map, or null when it
 * cannot be: no token for the shooter, no target or several, or no scene.
 *
 * Scenes are measured in yards by this system, and a scene set to feet or
 * metres is converted; any other unit is taken as yards, since a wrong
 * guess about a unit nobody uses for GURPS is not worth refusing the shot.
 */
export function measuredShot(actor: any): MeasuredShot | null {
  const targets = targetedTokens();
  if (targets.length !== 1) return null;
  const target: any = targets[0];
  const shooter: any = actor?.getActiveTokens?.()?.[0];
  const yards = yardsBetween(shooter, target);
  if (yards === null) return null;

  return {
    rangeYards: yards,
    targetSizeModifier: Number(target.actor?.system?.sm) || 0,
  };
}

/**
 * How far apart two tokens are, in whole yards, or null where the map cannot
 * say: no scene, or either token missing.
 */
export function yardsBetween(from: any, to: any): number | null {
  const stage: any = (globalThis as any).canvas;
  const scene = stage?.scene;
  if (!scene || !stage.grid?.measurePath) return null;
  if (!from?.center || !to?.center) return null;

  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  if (!Number.isFinite(distance)) return null;

  const units = String(scene.grid?.units ?? "").trim().toLowerCase();
  const yards = units === "ft" || units === "feet" || units === "'"
    ? distance / 3
    : units === "m" || units === "meters" || units === "metres"
      ? distance * 1.0936
      : distance;
  return Math.max(0, Math.round(yards));
}

/**
 * Whether a target is far enough away to take half damage (Characters p. 270).
 *
 * "Damaging attacks on targets at or beyond 1/2D inflict half damage, and
 * those that require a HT roll to resist are resisted at +3." A weapon with no
 * 1/2D listed never reaches it; a guided or homing one reads its 1/2D as its
 * speed rather than a threshold (Campaigns p. 412), so never halves at all.
 */
export function beyondHalfDamage(options: {
  rangeYards: number;
  halfDamageRange: number;
  guidance?: string;
}): boolean {
  if (!(options.halfDamageRange > 0)) return false;
  if (!halvesDamage(((options.guidance || "none") as Guidance))) return false;
  return options.rangeYards >= options.halfDamageRange;
}

/**
 * A shot with nothing asked: the measured range, the target's size, and the
 * weapon as it is. No aim, one shot, in the clear. Everything the dialog
 * offers is still there on a shift-click.
 */
function quickShot(
  measured: MeasuredShot,
  weapon: Parameters<typeof promptForRangedAttack>[0],
  /** Shells fired: one, or a target's share of a Spraying Fire burst. */
  shells: number | null = null,
): RangedShot {
  // One shell, or a "!" weapon's least burst: a quarter of its RoF, or what
  // is left in it (Characters p. 270; since 1.94.0). A spray's share is its own.
  if (shells === null) {
    const most = Math.max(1, Math.min(weapon.rateOfFire || 1, weapon.loaded ?? Infinity));
    shells = optionShots(1, most, { minShots: 0, shotsStep: 1 }, weapon) ?? 1;
  }
  // The shells, however many pellets are in each, and no aim unless the shooter
  // is on an Aim maneuver -- in which case its turns are what they are.
  const pellets = multipleProjectiles({
    shotsFired: shells,
    projectiles: weapon.projectiles ?? 1,
    recoil: weapon.recoil,
    rangeYards: measured.rangeYards,
    halfDamageRange: weapon.halfDamageRange ?? 0,
  });
  const modifiers = rangedModifiers(
    {
      range: measured.rangeYards,
      speed: 0,
      size: measured.targetSizeModifier,
      modifier: 0,
      shots: pellets.effectiveShots,
      situation: "normal",
      aimed: (weapon.aim?.turns ?? 0) > 0,
    },
    weapon,
  );
  return {
    modifiers,
    shotsFired: pellets.effectiveShots,
    shellsFired: shells,
    recoil: pellets.recoil,
    coneMultiplier: pellets.coneMultiplier,
    calledShot: null,
    rangeYards: measured.rangeYards,
  };
}

/** What a ranged attack was resolved into, by the dialog or by the map. */
interface RangedShot {
  modifiers: RollModifier[];
  /** The attack options chosen, by id. */
  options?: Record<string, unknown>;
  /** Shots for the rapid-fire arithmetic: shells times pellets. */
  shotsFired: number;
  /** Shells actually fired, which is what comes off the weapon's count. */
  shellsFired: number;
  /** Recoil to count hits with; 1 for a spread of pellets. */
  recoil: number;
  /** Pellets striking as one mass, or null when they spread. */
  coneMultiplier: number | null;
  calledShot: CalledShot | null;
  /** How far the shot had to travel, which a steered weapon's flight needs. */
  rangeYards: number;
  /** What was done about cover, which a random location may still strike. */
  cover?: CoverApproach | "none";
  /** +1 to the target's Dodge where they have seen a laser dot within its range. */
  dodgeBonus?: number;
  /** The laser sight as the dialog left it: on, and whether the target saw the dot (p. 411). */
  laser?: { on: boolean; targetSees: boolean } | null;
  /** What the modules' attack options chosen in the dialog add up to. */
  addon?: ReturnType<typeof applyAttackOptions>;
  /**
   * Rate of Fire after an option halved it (Campaigns p. 408), which is what
   * the shells asked for were capped by.
   */
  rateOfFire?: number;
  /** True where the shooter said a homing weapon had locked on (since 1.128.0). */
  lockedOn?: boolean;
  /** A Dual-Weapon Attack with two pistols, and which hand (Campaigns p. 417; since 1.153.0). */
  dualWeapon?: DualWeaponChoice | null;
  /** What the shot takes off the target's defense: -1 for both hands at one foe (since 1.153.0). */
  defensePenalty?: number;
  /** The foe's weapon the shot is aimed at, to break it (Campaigns p. 400; since 1.153.0). */
  weaponStrike?: WeaponTarget | null;
}

/** The context a module's attack option is shown and applied with. */
export function attackContextFor(options: {
  actor?: any;
  item?: any;
  ranged: boolean;
  damageType: string;
  reach?: string;
  effectiveSkill: number;
}): AttackContext {
  return {
    actor: options.actor ?? null,
    item: options.item ?? null,
    ranged: options.ranged,
    damageType: options.damageType,
    reach: options.reach ?? "",
    effectiveSkill: options.effectiveSkill,
    maneuver: String(options.actor?.system?.maneuver ?? ""),
    targets: targetedTokens(),
    chosen: {},
  };
}

/**
 * Asks for what a ranged attack needs before rolling: how far away the target
 * is, how fast it is moving, how big it is, and whether the shot was aimed.
 *
 * These are the modifiers GURPS Lite applies to a ranged attack (pp. 19-20 and
 * the Size and Speed/Range Table on p. 27). They are asked rather than
 * measured: the range to a target is knowable from the canvas only when both
 * tokens are on it, and a GM running a fight in the theatre of the mind has no
 * tokens at all.
 *
 * Returns null when the dialog is dismissed, which cancels the roll.
 */
/**
 * Draws the running "base -> modifiers -> effective" block inside an attack
 * dialog.
 *
 * Automatic lines are marked apart from the ones the player typed, which is
 * the distinction that tells them which numbers are theirs to change. The
 * markup is rebuilt each time rather than patched: it is a dozen lines, and a
 * redraw cannot fall out of step with the numbers the way a patch can.
 */
function drawBreakdown(root: HTMLElement, breakdown: RollBreakdown): void {
  const slot = root.querySelector<HTMLElement>("[data-roll-breakdown]");
  if (!slot) return;

  const L = (key: string) => game.i18n.localize(`GWORLD.Breakdown.${key}`);
  const line = (label: string, value: string, className = "") =>
    `<div class="gb-line ${className}"><span>${foundry.utils.escapeHTML(label)}</span><span>${value}</span></div>`;

  const lines = breakdown.lines
    .map((entry) =>
      line(
        entry.automatic ? `${entry.label} ${L("Auto")}` : entry.label,
        signed(entry.value),
        entry.automatic ? "gb-auto" : "gb-manual",
      ),
    )
    .join("");

  const capped = breakdown.cap !== null && breakdown.effective < breakdown.total
    ? line(L("Cap"), String(breakdown.cap), "gb-cap")
    : "";

  slot.innerHTML = `<div class="gb-breakdown">
    ${line(L("Base"), String(breakdown.base), "gb-base")}
    ${lines}
    ${capped}
    ${line(L("Effective"), String(breakdown.effective), "gb-effective")}
  </div>`;
}

/**
 * The lines a ranged attack will be rolled with, as the dialog's fields stand.
 *
 * `rangedModifiers` is the same function the shot itself is built from, and
 * the standing and position lines are the ones the roll adds afterwards, so
 * what is shown here is what will be rolled -- short of what a module's hook
 * adds at roll time, which nothing can know yet.
 */
/** What the ranged dialog was answered with, beyond the table's own inputs. */
type RangedDialogInput = RangedInput & {
  calledShot?: string;
  addonValues?: Record<string, unknown>;
  /** A Dual-Weapon Attack, and which hand (since 1.153.0). */
  dual?: DualWeaponChoice | null;
  /** The id of the foe's weapon aimed at, or blank (since 1.153.0). */
  weaponStrike?: string;
};

/**
 * The select for aiming a shot at a foe's weapon (Campaigns p. 400), offered
 * only where the one foe targeted has something to aim at. Its penalty is
 * the weapon's size, as for a blow.
 */
function weaponStrikeField(targets: WeaponTarget[]): string {
  if (targets.length === 0) return "";
  const esc = (text: string) => foundry.utils.escapeHTML(text);
  const options = targets
    .map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${t.penalty})</option>`)
    .join("");
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"
         title="${esc(game.i18n.localize("GWORLD.Breakage.StrikeAtHint"))}">
    <span>${game.i18n.localize("GWORLD.Breakage.StrikeAt")}</span>
    <select name="weaponStrike" style="width:180px">
      <option value="">${game.i18n.localize("GWORLD.Breakage.StrikeAtNone")}</option>
      ${options}
    </select>
  </label>`;
}

/**
 * The ranged dialog's lines that are not the table's: where the shot is
 * aimed -- a hit location, or a weapon in the foe's hand -- and a Dual-Weapon
 * Attack. One function for the running total and the shot, so the two agree.
 *
 * A shot at a weapon is aimed at the weapon, not at a part of the man, so a
 * called shot chosen as well is dropped: the weapon's penalty is the whole of
 * what the aim costs (Campaigns p. 400).
 */
export function rangedDialogLines(
  input: Pick<RangedDialogInput, "calledShot" | "dual" | "weaponStrike">,
  options: Pick<Parameters<typeof promptForRangedAttack>[0], "damageType" | "tightBeam" | "actor" | "weaponTargets"> & DualWeaponFighter,
): {
  modifiers: RollModifier[];
  aimed: ReturnType<typeof calledShotModifier>;
  defensePenalty: number;
  weaponStrike: WeaponTarget | null;
} {
  const modifiers: RollModifier[] = [];
  const weaponStrike = input.weaponStrike
    ? (options.weaponTargets ?? []).find((t) => t.id === input.weaponStrike) ?? null
    : null;
  const aimed = weaponStrike
    ? { shot: null, modifier: null }
    : calledShotModifier(input.calledShot ?? UNAIMED, options.damageType, options.tightBeam === true, options.actor);
  if (weaponStrike) modifiers.push(weaponStrikeLine(weaponStrike));
  if (aimed.modifier) modifiers.push(aimed.modifier);
  const dual = dualWeaponLine(input.dual ?? null, options);
  if (dual.modifier) modifiers.push(dual.modifier);
  return { modifiers, aimed, defensePenalty: dual.defensePenalty, weaponStrike };
}

function showRangedBreakdown(
  root: HTMLElement,
  input: RangedDialogInput,
  options: Parameters<typeof promptForRangedAttack>[0],
): void {
  const actor = options.actor;

  // The modules' options first, exactly as the shot reads them: one of them may
  // halve the Rate of Fire, which decides how many shots the recoil is reckoned
  // over, and several add modifiers of their own.
  const chosen = applyAttackOptions(
    attackContextFor({
      actor, item: options.item, ranged: true, damageType: options.damageType,
      effectiveSkill: Number(options.effectiveSkill) || 0,
    }),
    input.addonValues ?? {},
  );
  const fired = optionRateOfFire(options, chosen);
  // Held to an option's minimum burst and step, as the shot will be; a burst
  // the Rate of Fire can't reach is shown at its most, and refused on Roll.
  const shells = options.fixedShots
    ? Math.max(1, Math.floor(options.fixedShots))
    : optionShots(input.shots || 1, fired.rateOfFire, chosen, options) ?? fired.rateOfFire;
  const pellets = multipleProjectiles({
    shotsFired: shells,
    projectiles: options.projectiles ?? 1,
    recoil: fired.recoil,
    rangeYards: input.range,
    halfDamageRange: options.halfDamageRange ?? 0,
  });

  const fromDialog = rangedModifiers({ ...input, shots: pellets.effectiveShots }, options);
  fromDialog.push(...rangedDialogLines(input, options).modifiers);
  fromDialog.push(...chosen.modifiers);

  // What the roll will add once the dialog closes: the shooter's condition and
  // where they are standing. Asked with dialogAsked, as the roll asks it.
  const automatic = [
    ...standingRollLines(actor, { rollType: "attack", ranged: true, dialogAsked: true }),
    ...positionRollLines(actor, { rollType: "attack", ranged: true }),
  ];

  drawBreakdown(root, rollBreakdown(Number(options.effectiveSkill) || 0, [
    { modifiers: automatic, automatic: true },
    { modifiers: fromDialog, automatic: false },
  ]));
}

/**
 * The Rate of Fire the ranged dialog offers: the weapon's, held to one where
 * the rapid-fire rules are off, and to what is left in the weapon.
 */
function dialogRateOfFire(options: { rateOfFire: number; loaded?: number | null }): number {
  const loaded = options.loaded ?? null;
  return Math.max(1, Math.min(
    isRuleOn("rapidFire") ? Math.max(1, Math.floor(options.rateOfFire)) : 1,
    loaded === null ? Infinity : loaded,
  ));
}

/**
 * The Rate of Fire and Recoil a shot is fired at once its options are in:
 * set, multiplied (Campaigns p. 408) or given more Recoil (since 1.70.0),
 * never more shots than the weapon has left in it.
 */
export function optionRateOfFire(
  options: { rateOfFire: number; recoil: number; loaded?: number | null },
  chosen: { rateOfFire: number | null; rateOfFireMultiplier: number; recoil: number | null; recoilModifier: number },
): { rateOfFire: number; recoil: number } {
  const loaded = options.loaded ?? null;
  const rapid = isRuleOn("rapidFire");
  const fired = attackRateOfFire({
    rateOfFire: rapid ? options.rateOfFire : 1,
    recoil: options.recoil,
    setRateOfFire: rapid ? chosen.rateOfFire : null,
    multiplier: chosen.rateOfFireMultiplier,
    setRecoil: chosen.recoil,
    recoilModifier: chosen.recoilModifier,
  });
  return { rateOfFire: Math.max(1, Math.min(fired.rateOfFire, loaded === null ? Infinity : loaded)), recoil: fired.recoil };
}

/**
 * The shots a burst fires once its options are in (since 1.83.0): what was
 * asked for, held to the Rate of Fire and to an option's minimum and step.
 * Null where the Rate of Fire can't reach them. Without the rapid-fire
 * rules there are no bursts to hold to, and one shot is fired.
 */
export function optionShots(
  asked: number,
  rateOfFire: number,
  chosen: { minShots: number; shotsStep: number },
  weapon?: FullAutoWeapon | null,
): number | null {
  if (!isRuleOn("rapidFire")) return burstShots({ asked, rateOfFire });
  const held = burstLimits(chosen, rateOfFire, weapon);
  return burstShots({ asked, rateOfFire, minShots: held.minShots, step: held.shotsStep });
}

/** What a weapon's row says about full auto, for {@link burstLimits}. */
export interface FullAutoWeapon {
  /** The listed Rate of Fire, before any option or what is left in the weapon. */
  rateOfFire?: number;
  fullAutoOnly?: boolean;
}

/**
 * An option's minimum burst and step, with a "!" weapon's own least burst
 * folded in: a quarter of its listed RoF, rounded up (Characters p. 270;
 * since 1.94.0). The weapon's minimum never asks for more than the Rate of
 * Fire it has now -- one with fewer rounds left than that fires what it has --
 * where an option's minimum still refuses a burst it can't reach.
 */
export function burstLimits(
  chosen: { minShots: number; shotsStep: number },
  rateOfFire: number,
  weapon?: FullAutoWeapon | null,
): { minShots: number; shotsStep: number } {
  const own = weapon?.fullAutoOnly
    ? Math.min(fullAutoMinimum(Number(weapon.rateOfFire) || rateOfFire, "!"), Math.max(1, Math.floor(rateOfFire) || 1))
    : 0;
  return { minShots: Math.max(Number(chosen.minShots) || 0, own), shotsStep: chosen.shotsStep };
}

/** The warning for a burst its Rate of Fire can't fire (since 1.83.0). */
export function burstTooShort(
  name: string,
  rateOfFire: number,
  chosen: { minShots: number; shotsStep: number },
  weapon?: FullAutoWeapon | null,
): string {
  const held = burstLimits(chosen, rateOfFire, weapon);
  return game.i18n.format("GWORLD.Ranged.BurstTooShort", {
    name, min: Math.max(1, held.minShots), step: Math.max(1, held.shotsStep), rof: rateOfFire,
  });
}

export async function promptForRangedAttack(options: {
  /** What the weapon does, which decides where it can be aimed. */
  damageType: DamageType;
  accuracy: number;
  scopeBonus: number;
  /** True for a fixed-power scope, which gives nothing short of its bonus in seconds of Aim. */
  scopeFixed?: boolean;
  rateOfFire: number;
  /** A RoF marked "!": fired only on full auto, a quarter of the RoF at least (Characters p. 270; since 1.94.0). */
  fullAutoOnly?: boolean;
  /** A tight-beam burn, which the called-shot select lets at the eye and vitals (Campaigns p. 399; since 1.97.0). */
  tightBeam?: boolean;
  recoil: number;
  bulk: number;
  /**
   * Set when the shooter is on a Wait, covering ground with a ready weapon.
   * The area watched costs a penalty, and watching anything wider than one hex
   * forfeits Accuracy.
   */
  watching?: { hexesWatched: number; coveringLine: boolean } | null;
  /** Pellets per shell, for a shotgun; one for everything else. */
  projectiles?: number;
  /** The weapon's 1/2D range, inside a tenth of which pellets strike as one. */
  halfDamageRange?: number;
  /** The Aim maneuver as it stands: turns spent, and whether braced. */
  aim?: { turns: number; braced: boolean } | null;
  /** The shooter's eyes, for the dark. */
  eyes?: Eyes;
  /** Shots in the weapon, which caps a burst; null where no count is kept. */
  loaded?: number | null;
  /** The vehicle the shooter is aboard, if any, and whether they may fire its weapons. */
  aboard?: Aboard | null;
  /** True for a rider in the saddle, who is asked whether the mount moved (since 1.87.0). */
  riding?: boolean;
  mayFireMounted?: boolean;
  /** A range already measured off the map, to start the field at. */
  initialRange?: number;
  /** The shooter and the weapon, for the modules' attack options. */
  actor?: any;
  item?: any;
  /** The skill being rolled, for the modules' attack options. */
  effectiveSkill?: number;
  /** Shots already decided, for one target of a Spraying Fire burst: not asked (since 1.70.0). */
  fixedShots?: number;
  /** How the projectile steers: a homing one is asked whether it locked on (since 1.128.0). */
  guidance?: string;
  /** Levels of the Dual-Weapon Attack technique (Campaigns p. 417; since 1.153.0). */
  dualWeaponTechnique?: number;
  /** Ambidexterity, or full Off-Hand Weapon Training. */
  ambidextrous?: boolean;
  /** Levels of Off-Hand Weapon Training, for somebody who is not. */
  offHandTraining?: number;
  /** The weapons on the one foe targeted that the shot may be aimed at (Campaigns p. 400; since 1.153.0). */
  weaponTargets?: WeaponTarget[];
}): Promise<RangedShot | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Ranged.${key}`);
  const addonContext = attackContextFor({
    actor: options.actor, item: options.item, ranged: true, damageType: options.damageType,
    effectiveSkill: options.effectiveSkill ?? 0,
  });
  // What aiming is worth: Accuracy after a turn, more for the second and
  // third, more again for bracing. The box is ticked for somebody aiming and
  // says what it buys; anyone else may tick it to say they aimed off-sheet.
  // "With a variable-power scope, you may Aim for fewer seconds, but this
  // reduces your bonus by a like amount" (Campaigns p. 411). A +6 scope after
  // one second of aiming is worth +1, not +6, which is what this used to give.
  const turnsAimed = options.aim?.turns ?? 0;
  const scope = scopeBonus({ bonus: options.scopeBonus, secondsAimed: turnsAimed, fixed: options.scopeFixed === true });
  const aiming = aimBonus({
    turnsAimed,
    accuracy: options.accuracy + scope,
    braced: options.aim?.braced ?? false,
  });
  const accuracyLabel = aiming.total > 0
    ? `${L("Aimed")} (+${aiming.total}: ${game.i18n.format("GWORLD.Ranged.AimTurns", { turns: options.aim?.turns ?? 0 })})`
    : options.scopeBonus
      ? `${L("Aimed")} (+${options.accuracy}+${scope})`
      : `${L("Aimed")} (+${options.accuracy})`;

  const field = (name: string, label: string, value: string) => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span>
        <input type="number" name="${name}" value="${value}" step="1" style="width:90px">
      </label>`;

  // How many shots to fire is decided before the attack roll, and only a
  // weapon that can fire more than one is asked (p. 373) -- and no more than
  // it has left in it.
  const rateOfFire = dialogRateOfFire(options);
  // An option may raise the Rate of Fire (since 1.70.0), so a weapon that
  // fires one shot still asks when a module offers one that could.
  const mayRaise = attackOptionsFor(addonContext).length > 0 && isRuleOn("rapidFire");
  // A "!" weapon's field starts at its least burst (Characters p. 270; since 1.94.0).
  const leastShots = optionShots(1, rateOfFire, { minShots: 0, shotsStep: 1 }, options) ?? 1;
  const shotsField = options.fixedShots
    ? `<p class="ihint" style="margin:0">${game.i18n.format("GWORLD.Spraying.FixedShots", { shots: options.fixedShots, recoil: options.recoil })}</p>`
    : rateOfFire > 1 || mayRaise ? field("shots", rateOfFire > 1 ? `${L("Shots")} (${leastShots}-${rateOfFire})` : L("Shots"), String(leastShots)) : "";

  // Aboard a vehicle, the shot asks what only the table knows: whether it is
  // the vehicle's own weapon, whether the car swerved, and what its sights are.
  const aboard = options.aboard ?? null;
  const vehicleFields = aboard
    ? `<fieldset style="border:1px solid var(--color-border-light-2,#999);padding:4px 8px">
        <legend>${game.i18n.format("GWORLD.Ranged.FromVehicle", { vehicle: aboard.name })}</legend>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("VehicleWeapon")}</span>
          <select name="vehicleKind" style="width:150px">
            <option value="handheld">${L("Handheld")}</option>
            <option value="mounted">${L("Mounted")}</option>
          </select>
        </label>
        ${options.mayFireMounted ? "" : `<p class="ihint warn" style="margin:0">${L("MountedNeedsAttack")}</p>`}
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="vehicleDodged"><span>${L("VehicleDodgedBox")}</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="stabilized"><span>${L("Stabilized")}</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="targetingSystem"><span>${L("HasTargeting")}</span>
        </label>
        ${aboard.moving ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("WeaponMount")}</span>
          <select name="vehicleMounting" style="width:150px">
            <option value="fixedMount">${L("FixedMount")}</option>
            <option value="openMount">${L("OpenMount")}</option>
          </select>
        </label>
        ${rideField(aboard.medium)}` : ""}
      </fieldset>`
    : "";
  // In the saddle: whether the mount moved more than a step, and over what
  // (pp. 397, 548).
  const mountFields = !aboard && options.riding
    ? `<fieldset style="border:1px solid var(--color-border-light-2,#999);padding:4px 8px">
        <legend>${L("FromSaddle")}</legend>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" name="mountMoved"><span>${L("MountMoved")}</span>
        </label>
        ${rideField("ground")}
      </fieldset>`
    : "";

  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${field("range", L("Range"), String(options.initialRange ?? 0))}
      ${field("elevation", L("Elevation"), "0")}
      ${field("speed", L("TargetSpeed"), "0")}
      ${field("size", L("TargetSize"), "0")}
      ${shotsField}
      ${calledShotField(options.damageType, options.tightBeam === true, options.actor)}
      ${weaponStrikeField(options.weaponTargets ?? [])}
      ${dualWeaponFields()}
      ${sightField()}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Cover.Label")}</span>
        <select name="cover" style="width:150px">
          <option value="none">${game.i18n.localize("GWORLD.Cover.none")}</option>
          <option value="exposedLocation">${game.i18n.localize("GWORLD.Cover.exposedLocation")}</option>
          <option value="randomLocation">${game.i18n.localize("GWORLD.Cover.randomLocation")}</option>
          <option value="shootThrough">${game.i18n.localize("GWORLD.Cover.shootThrough")}</option>
        </select>
      </label>
      ${field("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), "0")}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Situation")}</span>
        <select name="situation" style="width:150px">
          <option value="normal">${L("Normal")}</option>
          <option value="moveAndAttack">${L("MoveAndAttack")}</option>
          <option value="closeCombat">${L("CloseCombat")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="aimed" ${aiming.total > 0 ? "checked" : ""}>
        <span>${accuracyLabel}</span>
      </label>
      ${options.guidance === "homing" ? `<label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="lockedOn"><span>${L("LockedOnBox")}</span>
      </label>` : ""}
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="laser"><span>${L("LaserSight")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="laserSeen"><span>${L("LaserSeen")}</span>
      </label>
      ${vehicleFields}
      ${mountFields}
      ${attackOptionFields(addonContext)}
      <div data-roll-breakdown></div>
    </div>`;
  /*
   * One reader for the form, used both by the running total the shooter is
   * shown and by the shot that is actually taken, so the number in front of
   * them is the number they get.
   */
  const readForm = (form: HTMLElement | null) => {
    const num = (name: string) =>
      Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
    const addonValues = readAttackOptionValues(form, addonContext);
    const aimed =
      form?.querySelector<HTMLInputElement>('input[name="aimed"]')?.checked ?? false;
    const situation =
      form?.querySelector<HTMLSelectElement>('select[name="situation"]')?.value ?? "normal";
    const sight = (form?.querySelector<HTMLSelectElement>('select[name="sight"]')?.value ??
      "clear") as Sight;
    const cover =
      form?.querySelector<HTMLSelectElement>('select[name="cover"]')?.value ?? "none";
    const calledShot =
      form?.querySelector<HTMLSelectElement>('select[name="calledShot"]')?.value ?? UNAIMED;
    return {
      addonValues,
      range: num("range"),
      elevation: num("elevation"),
      speed: num("speed"),
      size: num("size"),
      modifier: num("modifier"),
      shots: options.fixedShots ? options.fixedShots : rateOfFire > 1 || mayRaise ? num("shots") : 1,
      situation: situation as RangedInput["situation"],
      sight,
      darkness: num("darkness"),
      cover: cover as CoverApproach | "none",
      calledShot,
      aimed,
      dual: readDualWeapon(form),
      weaponStrike: form?.querySelector<HTMLSelectElement>('select[name="weaponStrike"]')?.value ?? "",
      lockedOn: form?.querySelector<HTMLInputElement>('input[name="lockedOn"]')?.checked ?? false,
      laser: {
        on: form?.querySelector<HTMLInputElement>('input[name="laser"]')?.checked ?? false,
        targetSees: form?.querySelector<HTMLInputElement>('input[name="laserSeen"]')?.checked ?? false,
      },
      vehicle: aboard
        ? {
            kind: (form?.querySelector<HTMLSelectElement>('select[name="vehicleKind"]')?.value ??
              "handheld") as VehicleAttackKind,
            operator: aboard.operator,
            dodged: form?.querySelector<HTMLInputElement>('input[name="vehicleDodged"]')?.checked ?? false,
            flying: aboard.flying,
            moving: aboard.moving,
            stabilityRating: aboard.stabilityRating,
            stabilized: form?.querySelector<HTMLInputElement>('input[name="stabilized"]')?.checked ?? false,
            targetingTl: form?.querySelector<HTMLInputElement>('input[name="targetingSystem"]')?.checked
              ? aboard.techLevel
              : 0,
            medium: aboard.medium,
            vehicle: aboard.vehicle,
            ride: readRide(form),
            weaponMount: (form?.querySelector<HTMLSelectElement>('select[name="vehicleMounting"]')?.value ??
              "fixedMount") as "fixedMount" | "openMount",
          }
        : null,
      mount: !aboard && options.riding
        ? {
            moving: form?.querySelector<HTMLInputElement>('input[name="mountMoved"]')?.checked ?? false,
            ride: readRide(form),
          }
        : null,
    };
  };

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content,
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      // The effective level, kept in step with the fields as they change: the
      // shooter decides whether to aim another second by seeing what it buys.
      const update = () => {
        const form = root.closest<HTMLElement>(".application") ?? root;
        showRangedBreakdown(root, readForm(form) as Parameters<typeof showRangedBreakdown>[1], options);
      };
      root.addEventListener("change", update);
      root.addEventListener("input", update);
      update();
    },
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => readForm(button.closest<HTMLElement>(".application")),
    },
    rejectClose: false,
  });

  if (!result || typeof result !== "object") return null;

  const input = result as RangedDialogInput;
  // The options are read first: one of them may halve the Rate of Fire
  // (Campaigns p. 408), which the dialog's own field could not know when it
  // was drawn, so the shots asked for are capped by what is left of it.
  const chosenOptions = applyAttackOptions(addonContext, input.addonValues ?? {});
  const fired = optionRateOfFire(options, chosenOptions);
  const effectiveRateOfFire = fired.rateOfFire;
  // A weapon cannot fire more shots than its Rate of Fire, nor fewer than one
  // -- nor fewer than an option's minimum burst, or between its steps (since
  // 1.83.0). A Spraying Fire burst has decided this attack's shots already.
  const burst = options.fixedShots
    ? Math.max(1, Math.floor(options.fixedShots))
    : optionShots(input.shots || 1, effectiveRateOfFire, chosenOptions, options);
  if (burst === null) {
    ui.notifications?.warn(burstTooShort(String(options.item?.name ?? ""), effectiveRateOfFire, chosenOptions, options));
    return null;
  }
  const shellsFired = burst;

  // Each shell may be several pellets, which count as shots of their own.
  const pellets = multipleProjectiles({
    shotsFired: shellsFired,
    projectiles: options.projectiles ?? 1,
    recoil: fired.recoil,
    rangeYards: input.range,
    halfDamageRange: options.halfDamageRange ?? 0,
  });

  const modifiers = rangedModifiers({ ...input, shots: pellets.effectiveShots }, options);
  const extras = rangedDialogLines(input, options);
  modifiers.push(...extras.modifiers);
  const aimed = extras.aimed;
  const addon = chosenOptions;
  modifiers.push(...addon.modifiers);

  return {
    addon,
    options: input.addonValues ?? {},
    modifiers,
    shotsFired: pellets.effectiveShots,
    shellsFired,
    rateOfFire: effectiveRateOfFire,
    recoil: pellets.recoil,
    coneMultiplier: pellets.coneMultiplier,
    calledShot: aimed.shot,
    rangeYards: input.range,
    cover: input.cover ?? "none",
    lockedOn: input.lockedOn === true,
    dualWeapon: input.dual ?? null,
    defensePenalty: extras.defensePenalty,
    weaponStrike: extras.weaponStrike,
    laser: { on: input.laser?.on === true, targetSees: input.laser?.targetSees === true },
    // "But if the target can see it, he gets +1 to Dodge!"
    dodgeBonus: input.laser?.on
      ? laserSight({
          rangeYards: input.range,
          halfDamageRange: options.halfDamageRange ?? 0,
          targetSeesDot: input.laser.targetSees,
        }).targetDodge
      : 0,
  };
}

interface RangedInput {
  range: number;
  /** Yards the shooter stands above the target; negative when below. */
  elevation?: number;
  speed: number;
  size: number;
  modifier: number;
  /** Shots fired this attack, at most the weapon's Rate of Fire. */
  shots: number;
  /**
   * Why the weapon's Bulk applies, if it does: a Move and Attack takes the
   * worse of -2 and Bulk, and close combat takes Bulk in place of the
   * speed/range penalty (pp. 365, 391).
   */
  situation: "normal" | "moveAndAttack" | "closeCombat";
  /** What the shooter can see of the target. */
  sight?: Sight;
  /** Darkness short of total, 0 to 9 (p. 394). */
  darkness?: number;
  /** What they decided to do about anything in the way. */
  cover?: CoverApproach | "none";
  aimed: boolean;
  /** Set when the shooter is aboard a vehicle (Campaigns pp. 467-469). */
  vehicle?: VehicleShot | null;
  /** Set when the shooter is in the saddle (Campaigns pp. 396-397; since 1.87.0). */
  mount?: MountShot | null;
  /** A laser sight in use, and whether the target has seen its dot (p. 411). */
  laser?: { on: boolean; targetSees: boolean } | null;
  /** True where a homing weapon's seeker has locked on, which is worth its Acc (since 1.128.0). */
  lockedOn?: boolean;
}

/** What firing from a vehicle adds to a shot. */
export interface VehicleShot {
  /** A weapon held in the hand, or one built into the vehicle. */
  kind: VehicleAttackKind;
  operator: boolean;
  /** True where the vehicle dodged this turn, which throws a passenger's aim. */
  dodged: boolean;
  flying: boolean;
  moving: boolean;
  stabilityRating: number;
  /** True for stabilized sights or a stabilized mount, which the SR cap spares. */
  stabilized: boolean;
  /** The vehicle's TL where it has a targeting system, or 0. */
  targetingTl: number;
  /** Ground, air or water: the row of the moving-platform penalty (since 1.87.0). */
  medium?: VehicleMedium;
  /** How rough the ride is (since 1.87.0); a good road or calm water where not given. */
  ride?: RideRoughness;
  /** The vehicle actor, which the `movingPlatform` line carries (since 1.141.0). */
  vehicle?: any;
  /** What the vehicle's own weapon sits on, when it is not stabilized (since 1.87.0). */
  weaponMount?: "fixedMount" | "openMount";
}

/** What firing from the saddle adds to a shot (since 1.87.0). */
export interface MountShot {
  /** True where the mount moved more than a step this turn (p. 397). */
  moving: boolean;
  /** How rough the ground is. */
  ride: RideRoughness;
}

/** The select asking how rough the ride is, worded for ground or water (p. 548). */
function rideField(medium: VehicleMedium): string {
  if (medium !== "ground" && medium !== "water") return "";
  const L = (key: string) => game.i18n.localize(`GWORLD.Ranged.${key}`);
  const options = medium === "water"
    ? [["smooth", L("RideCalm")], ["rough", L("RideRoughWater")]]
    : [["smooth", L("RideGoodRoad")], ["rough", L("RideBadRoad")], ["offRoad", L("RideOffRoad")]];
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("Ride")}</span>
          <select name="ride" style="width:150px">
            ${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </label>`;
}

function readRide(form: HTMLElement | null): RideRoughness {
  const value = form?.querySelector<HTMLSelectElement>('select[name="ride"]')?.value ?? "smooth";
  return value === "rough" || value === "offRoad" ? value : "smooth";
}

/**
 * How the weapon is held on a moving platform, for the table (p. 548): a
 * rider's weapon is in the hand; a vehicle's own weapon sits in a stabilized
 * turret or mount, or on whatever mount the shooter says.
 */
function platformMounting(vehicle: VehicleShot): PlatformMounting {
  if (vehicle.kind !== "mounted") return "handheld";
  if (vehicle.stabilized) return "stabilized";
  return vehicle.weaponMount ?? "fixedMount";
}

/**
 * Turns what the dialog collected into labelled modifiers, so the chat card
 * shows the shot's arithmetic rather than one opaque number.
 *
 * Accuracy is added only for an aimed shot: it is what taking the Aim maneuver
 * buys, and a snap shot gets none of it.
 */
export function rangedModifiers(
  input: RangedInput,
  weapon: {
    accuracy: number;
    scopeBonus: number;
    /** A fixed-power scope (Campaigns p. 411; since API 1.86.0). */
    scopeFixed?: boolean;
    bulk: number;
    /** A laser, which the slope does not affect at all. */
    beamWeapon?: boolean;
    watching?: { hexesWatched: number; coveringLine: boolean } | null;
    /** The Aim maneuver as it stands, for the extra turns and the bracing. */
    aim?: { turns: number; braced: boolean } | null;
    /** The shooter's eyes, which decide what the dark costs. */
    eyes?: Eyes;
    /** How the projectile steers, blank for one that does not (p. 412). */
    guidance?: string;
    /** The 1/2D figure, which for a steered weapon is its speed in yards/second. */
    halfDamageRange?: number;
    /** How far it can fly before it crashes. */
    maxRange?: number;
  },
): RollModifier[] {
  const L = (key: string) => game.i18n.localize(`GWORLD.Ranged.${key}`);
  const modifiers: RollModifier[] = [];

  // Height changes how far the shot has to travel before the table is read:
  // downhill is shorter, uphill is longer, and by different amounts (p. 408).
  const effectiveRange = elevationRange({
    groundYards: input.range,
    elevationYards: input.elevation ?? 0,
    beamWeapon: weapon.beamWeapon === true,
  });

  // A nearsighted shooter reads the table at twice the distance (p. 123).
  const seenRange = weapon.eyes?.nearsighted ? effectiveRange * 2 : effectiveRange;
  const { speedRange, size } = rangedToHitModifier({
    rangeYards: seenRange,
    targetSpeedYardsPerSecond: input.speed,
    targetSizeModifier: input.size,
  });

  const situation = input.situation ?? "normal";

  // What a steered weapon still takes (p. 412). "Treat a guided weapon as any
  // other firearm when assessing modifiers, but ignore range modifiers!" -- and
  // a homing one ignores the firer's senses as well, because the seeker is
  // what is looking.
  const guidance = ((weapon.guidance || "none") as Guidance);
  const steering = guidanceModifiers(guidance);
  // How long it is in the air, which is what makes the shot count as aimed.
  const flight = flightPlan({
    rangeYards: effectiveRange,
    speed: projectileSpeed(weapon.halfDamageRange ?? 0),
    maxRange: weapon.maxRange ?? 0,
  });

  // Opportunity fire: the wider the ground being covered, the worse the shot
  // (p. 390). Watching a single line is a flat -2 whatever its length.
  const watching = isRuleOn("opportunityFire") ? weapon.watching : null;
  if (watching) {
    modifiers.push({
      label: L("OpportunityFire"),
      value: watching.coveringLine
        ? OPPORTUNITY_LINE_PENALTY
        : opportunityFirePenalty(watching.hexesWatched),
    });
  }
  // In close combat the speed/range penalty is dropped and Bulk stands in its
  // place: the target is right there, and the weapon is in the way.
  if (speedRange !== 0 && situation !== "closeCombat" && steering.range) {
    modifiers.push({
      label:
        seenRange === input.range
          ? L("SpeedRange")
          : game.i18n.format("GWORLD.Ranged.SpeedRangeUphill", { yards: seenRange }),
      value: speedRange,
      key: "speedRange",
    });
  }
  // Keyed `size` (since 1.91.0), which a zen skill reads with `speedRange`.
  if (size !== 0) modifiers.push({ label: L("TargetSize"), value: size, key: "size" });

  // "Base visibility modifiers on the projectile's homing sense, not on your
  // senses" -- so the firer's dark and the firer's smoke stop counting, and
  // what the seeker can make out is the GM's to say.
  if (steering.firersSenses) {
    const unseen = sightModifier(input.sight ?? "clear", false, weapon.eyes);
    if (unseen) modifiers.push(unseen);
    const dark = darknessModifier(input.darkness ?? 0, weapon.eyes);
    if (dark) modifiers.push(dark);
  }

  // Cover is a choice between three ways of dealing with it, not one modifier
  // (p. 407), so what it costs depends on which one was taken.
  if (input.cover && input.cover !== "none") {
    const shot = coverShot({ approach: input.cover });
    if (shot.modifier !== 0) {
      modifiers.push({
        label: game.i18n.localize(`GWORLD.Cover.${input.cover}`),
        value: shot.modifier,
      });
    }
  }

  if (situation !== "normal") {
    modifiers.push({ label: L("Bulk"), value: bulkPenalty(weapon.bulk, situation), key: "bulk", situation });
  }

  // From a vehicle (p. 469). "If the operator fires a handheld weapon ... -2 to
  // hit or a penalty equal to his weapon's Bulk, whichever is worse"; and "if
  // the vehicle dodged and you aren't the operator, you have an extra -2 to
  // hit, or -4 if flying."
  const vehicle = input.vehicle ?? null;
  if (vehicle) {
    if (vehicle.operator) {
      const divided = drivingAttackPenalty({ kind: vehicle.kind, bulk: weapon.bulk });
      if (divided !== 0) modifiers.push({ label: L("Driving"), value: divided });
    }
    const thrown = unexpectedDodgePenalty({
      dodged: vehicle.dodged,
      operator: vehicle.operator,
      flying: vehicle.flying,
    });
    if (thrown !== 0) modifiers.push({ label: L("VehicleDodged"), value: thrown });
  }

  // Attacking from a moving vehicle or mount (p. 548): "the penalty depends
  // on how rough the ride is and whether you're using a weapon mount or a
  // handheld weapon" (p. 469). Keyed `movingPlatform`, for a module that
  // eases or replaces it (since 1.87.0).
  const platform = vehicle?.moving
    ? { platform: "vehicle" as const, vehicle: vehicle.vehicle ?? null, medium: vehicle.medium ?? (vehicle.flying ? "air" : "ground"), ride: vehicle.ride ?? "smooth", mounting: platformMounting(vehicle) }
    : input.mount?.moving
      ? { platform: "mount" as const, medium: "ground" as VehicleMedium, ride: input.mount.ride, mounting: "handheld" as PlatformMounting }
      : null;
  if (platform) {
    const rough = movingPlatformPenalty(platform);
    if (rough !== 0) {
      modifiers.push({
        label: L(platform.platform === "vehicle" ? "MovingVehicle" : "MovingMount"),
        value: rough,
        key: "movingPlatform",
        ...platform,
      });
    }
  }
  // "If the mount moves more than a step, you suffer the same penalties that
  // you would if firing from a moving vehicle: you can't benefit from extra
  // turns of Aim, or from telescopic scopes and other targeting systems"
  // (p. 397).
  const mountMoving = input.mount?.moving === true;

  // A Move and Attack loses the benefit of having aimed, whatever was ticked,
  // and so does anyone covering more than a single hex: "you cannot claim any
  // of the bonuses listed for the Aim maneuver ... Exception: if you watch a
  // single hex (only), you can Aim and Wait."
  const mayAim =
    situation !== "moveAndAttack" &&
    (!watching || (!watching.coveringLine && canAimWhileWatching(watching.hexesWatched)));
  // "If you Aim a guided weapon before you Attack, you receive its Acc bonus -
  // but you don't have to aim. If the projectile takes multiple seconds to
  // reach its target, the attack is automatically aimed and gets its Acc
  // bonus." So a steered shot with a journey ahead of it is aimed whether the
  // firer took the maneuver or not -- but only the maneuver buys the extra
  // turns and the bracing, which is why those stay behind the checkbox.
  const deliberatelyAimed = input.aimed && mayAim;
  // A homing weapon that has locked on gets its Acc as if it had aimed (since
  // API 1.128.0). Where nothing else would have given it, the line says so,
  // so a listener that clears the lock-on knows which line to take away.
  const lockedOn = guidance === "homing" && input.lockedOn === true;
  const onlyLockedOn = lockedOn && !accuracyApplies({ guidance, aimed: deliberatelyAimed, secondsInFlight: flight.seconds });
  if (accuracyApplies({ guidance, aimed: deliberatelyAimed, secondsInFlight: flight.seconds, lockedOn })) {
    // Aimed on the sheet: Accuracy, the second and third turns, the bracing.
    // Aimed by the checkbox alone: Accuracy, as one turn's aim is worth.
    const aimedFor = deliberatelyAimed ? Math.max(1, weapon.aim?.turns ?? 0) : 1;
    const scope = mountMoving ? 0 : scopeBonus({ bonus: weapon.scopeBonus, secondsAimed: aimedFor, fixed: weapon.scopeFixed === true });
    const aiming = aimBonus({
      turnsAimed: mountMoving ? Math.min(1, aimedFor) : aimedFor,
      accuracy: weapon.accuracy + scope,
      braced: deliberatelyAimed ? (weapon.aim?.braced ?? false) : false,
    });
    // The scope's share of the Accuracy rides on the line (since API 1.63.0).
    const scopeShare = Math.max(0, Math.min(scope, aiming.accuracy));
    if (aiming.accuracy !== 0) {
      modifiers.push({
        label: L(onlyLockedOn ? "LockedOn" : "Accuracy"),
        value: aiming.accuracy,
        key: "accuracy",
        ...(scopeShare ? { scope: scopeShare } : {}),
        ...(onlyLockedOn ? { lockOn: true } : {}),
      });
    }
    if (aiming.extraTurns !== 0) modifiers.push({ label: L("AimedLonger"), value: aiming.extraTurns, key: "aim" });
    if (aiming.braced !== 0) modifiers.push({ label: L("Braced"), value: aiming.braced, key: "braced" });

    // A targeting system is one more aiming bonus, and a moving vehicle caps
    // the lot: "the combined bonuses from aiming (Accuracy, extra turns of Aim,
    // targeting systems, and bracing) cannot exceed the SR of a moving vehicle
    // unless the sights or mount are stabilized" (p. 469). Shown as a cut off
    // the total, so the card still says what each part was worth.
    if (vehicle) {
      const targeting = vehicle.targetingTl > 0 ? targetingSystemBonus(vehicle.targetingTl) : 0;
      if (targeting !== 0) modifiers.push({ label: L("TargetingSystem"), value: targeting });
      const total = aiming.accuracy + aiming.extraTurns + aiming.braced + targeting;
      const capped = cappedAimBonus({
        bonus: total,
        stabilityRating: vehicle.stabilityRating,
        stabilized: vehicle.stabilized,
        moving: vehicle.moving,
      });
      if (capped < total) {
        modifiers.push({
          label: game.i18n.format("GWORLD.Ranged.StabilityCap", { sr: vehicle.stabilityRating }),
          value: capped - total,
        });
      }
    }
  }
  // A laser sight: "If you can see your own aiming dot, you get +1 to hit",
  // aimed or not, out to its range -- the weapon's 1/2D where none is given
  // (p. 411). Beyond that the dot is too dispersed to see.
  if (input.laser?.on) {
    const dot = laserSight({ rangeYards: effectiveRange, halfDamageRange: weapon.halfDamageRange ?? 0 });
    if (dot.toHit !== 0) modifiers.push({ label: L("LaserSight"), value: dot.toHit, key: "laser" });
  }

  const rapidFire = rapidFireBonus(input.shots ?? 1);
  if (rapidFire !== 0) modifiers.push({ label: L("RapidFire"), value: rapidFire });
  if (input.modifier !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Chat.Situational"), value: input.modifier });
  }

  return modifiers;
}

/**
 * Asks for a single number, for the handful of rolls that need one figure and
 * no options at all.
 *
 * Returns null when the dialog is dismissed, which cancels whatever asked.
 */
export async function promptForNumber(options: {
  title: string;
  label: string;
  initial?: number;
}): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: options.title },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;gap:8px">
        <span>${options.label}</span>
        <input type="number" name="value" value="${options.initial ?? 0}" step="1" min="0"
               autofocus style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLInputElement>('input[name="value"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });

  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * The markup for the called shot select, and what each option costs.
 *
 * Offered on every attack because the penalty is the whole decision: going for
 * the skull is -7 and going for the eye is -9, and a system that let you pick
 * the location only after the dice had landed was giving those away.
 */
function calledShotField(type: DamageType, tightBeam: boolean, actor?: any): string {
  const options = shotOptions(type, tightBeam, actor)
    .map((option) => {
      const cost = option.penalty === 0 ? "" : ` (${option.penalty})`;
      return `<option value="${option.value}">${option.label}${cost}</option>`;
    })
    .join("");

  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>${game.i18n.localize("GWORLD.CalledShot.Label")}</span>
    <select name="calledShot" style="width:180px">${options}</select>
  </label>`;
}

/** What a chosen called shot costs, as a modifier line. */
function calledShotModifier(value: string, type: DamageType, tightBeam: boolean, actor?: any): {
  shot: CalledShot | null;
  modifier: RollModifier | null;
} {
  const shot = parseShot(value);
  if (shot === null) return { shot: null, modifier: null };

  const option = shotOptions(type, tightBeam, actor).find((entry) => entry.value === value);
  if (!option || option.penalty === 0) return { shot, modifier: null };

  return { shot, modifier: { label: option.label, value: option.penalty } };
}

/**
 * The choices offered for what an attacker can see, worst first.
 *
 * Offered on every attack because it applies to every attack: a fight in a dark
 * room is not an exception, it is Tuesday.
 */
const SIGHT_OPTIONS: readonly Sight[] = ["clear", "positionKnown", "foeUnseen", "blind"];

/** The eyes an attacker has, and whether they have any (pp. 47, 60, 71, 123-124). */
export interface Eyes extends VisionTraits {
  blindness?: boolean;
  /** Used to being blind, so -6 rather than the -10 of fresh blindness (p. 124). */
  accustomedToBlindness?: boolean;
  /** Nearsighted: "double the actual distance to the target when calculating the range modifier" (p. 123). */
  nearsighted?: boolean;
}

/** What the sheet says about this character's eyes. */
export function eyesOf(actor: any): Eyes {
  const vision = actor?.system?.derived?.vision ?? {};
  return {
    nightVision: Number(vision.nightVision) || 0,
    darkVision: vision.darkVision === true,
    infravision: vision.infravision === true,
    blindness: vision.blindness === true,
    accustomedToBlindness: vision.accustomedToBlindness === true,
    nearsighted: vision.nearsighted === true,
  };
}

/**
 * The markup for the sight select and the darkness field, and the modifiers
 * they resolve to.
 *
 * Darkness short of total is its own number (p. 394): "-1 to -9", which is
 * what Night Vision takes off. Total darkness is the last option of the
 * select, since it is not a worse penalty but the foe unseen.
 */
function sightField(): string {
  const options = SIGHT_OPTIONS.map(
    (sight) =>
      `<option value="${sight}">${game.i18n.localize(`GWORLD.Sight.${sight}`)}</option>`,
  ).join("");

  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>${game.i18n.localize("GWORLD.Sight.Label")}</span>
    <select name="sight" style="width:150px">${options}</select>
  </label>
  <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span>${game.i18n.localize("GWORLD.Sight.Darkness")}</span>
    <input type="number" name="darkness" value="0" min="0" max="9" step="1" style="width:90px">
  </label>`;
}

/** What the chosen sight costs, as a modifier line. */
function sightModifier(sight: Sight, lightSource: boolean, eyes: Eyes = {}): RollModifier | null {
  // Somebody blind attacks blind whatever the light: at the practised -6, or
  // at -10 for somebody whose sight gear or a condition has just taken, "just
  // as if you were in total darkness" -- with no light or dark-seeing eyes to
  // help, since the eyes are what is missing (p. 124).
  if (eyes.blindness) {
    const accustomed = eyes.accustomedToBlindness !== false;
    return {
      label: game.i18n.localize(accustomed ? "GWORLD.Sight.Blindness" : "GWORLD.Sight.SuddenBlindness"),
      value: attackWithoutSight({ sight: "blind", accustomedToBlindness: accustomed }).modifier,
    };
  }
  const penalty = attackWithoutSight({ sight, lightSource, eyes });
  if (penalty.modifier === 0) return null;
  return {
    label: game.i18n.localize(`GWORLD.Sight.${sight}`),
    value: penalty.modifier,
  };
}

/** What the darkness costs after the eyes, as a modifier line. */
export function darknessModifier(darkness: number, eyes: Eyes = {}): RollModifier | null {
  if (eyes.blindness) return null;
  const value = darknessPenalty(darkness, eyes);
  if (value === 0) return null;
  // Keyed, with the darkness as it was, so a module's light or sight can take
  // points off it (since API 1.86.0).
  const raw = Math.max(0, Math.min(TOTAL_DARKNESS - 1, Math.floor(darkness)));
  return { label: game.i18n.localize("GWORLD.Sight.Darkness"), value, key: "darkness", darkness: raw };
}

/**
 * Asks what a melee attack is trading, before the roll.
 *
 * Deceptive Attack and Rapid Strike are both choices made before rolling
 * (pp. 369-370), and both cost skill, so they belong in the same place as the
 * situational modifier rather than being typed in as one.
 *
 * Returns null when the dialog is dismissed, which cancels the roll.
 */
/** A Dual-Weapon Attack as the dialog left it (Campaigns p. 417; since API 1.153.0). */
export interface DualWeaponChoice {
  /** The hand this roll is for: each hand is rolled separately. */
  hand: "primary" | "off";
  /** Both attacks aimed at one foe, whose defenses against them are at -1. */
  sameTarget: boolean;
}

/** What a fighter brings to a Dual-Weapon Attack, off the sheet. */
export interface DualWeaponFighter {
  /** Levels of the Dual-Weapon Attack technique, which buy the -4 back. */
  dualWeaponTechnique?: number;
  /** Ambidexterity, or full Off-Hand Weapon Training. */
  ambidextrous?: boolean;
  /** Levels of Off-Hand Weapon Training, for somebody who is not. */
  offHandTraining?: number;
}

/** The dialog's answer read as a choice, or null for one weapon. */
export function dualWeaponChoice(value: string, sameTarget: boolean): DualWeaponChoice | null {
  return value === "primary" || value === "off" ? { hand: value, sameTarget: sameTarget === true } : null;
}

/**
 * What a Dual-Weapon Attack does to the roll of the hand being rolled, and to
 * the defense against it (Campaigns p. 417). The same for a melee weapon and
 * a pistol: either hand may strike bare, with a one-handed melee weapon, or
 * fire a pistol. The line is keyed `dualWeapon` and says which hand (since
 * API 1.153.0).
 */
export function dualWeaponLine(
  choice: DualWeaponChoice | null,
  fighter: DualWeaponFighter,
): { modifier: RollModifier | null; defensePenalty: number } {
  if (!choice) return { modifier: null, defensePenalty: 0 };
  const both = dualWeaponAttack({
    technique: fighter.dualWeaponTechnique ?? 0,
    ambidextrous: fighter.ambidextrous === true,
    offHandTraining: fighter.offHandTraining ?? 0,
    sameTarget: choice.sameTarget,
  });
  const value = choice.hand === "off" ? both.offHand : both.primary;
  return {
    modifier: {
      label: game.i18n.localize(choice.hand === "off" ? "GWORLD.Melee.DualOff" : "GWORLD.Melee.DualPrimary"),
      value,
      key: "dualWeapon",
      hand: choice.hand,
    },
    defensePenalty: both.defensePenalty,
  };
}

/** The Dual-Weapon Attack fields, for the melee and the ranged dialogs alike. */
function dualWeaponFields(): string {
  if (!isRuleOn("dualWeaponAttack")) return "";
  const M = (key: string) => game.i18n.localize(`GWORLD.Melee.${key}`);
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${M("DualWeapon")}</span>
      <select name="dual" style="width:150px">
        <option value="no">${M("DualNone")}</option>
        <option value="primary">${M("DualPrimary")}</option>
        <option value="off">${M("DualOff")}</option>
      </select>
    </label>
    <label style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" name="dualSameTarget">
      <span>${M("DualSameTarget")}</span>
    </label>`;
}

/** Reads the Dual-Weapon Attack fields back. */
function readDualWeapon(form: HTMLElement | null): DualWeaponChoice | null {
  if (!isRuleOn("dualWeaponAttack")) return null;
  return dualWeaponChoice(
    form?.querySelector<HTMLSelectElement>('select[name="dual"]')?.value ?? "no",
    form?.querySelector<HTMLInputElement>('input[name="dualSameTarget"]')?.checked ?? false,
  );
}

/** What the melee dialog was answered with, as the modifier lines read it. */
interface MeleeAnswers {
  deceptive: number;
  modifier: number;
  rapid: boolean;
  flurry: boolean;
  sight: Sight;
  darkness: number;
  calledShot: string;
  ground: number;
  dual: DualWeaponChoice | null;
  charging: boolean;
  wildSwing: boolean;
  addonValues: Record<string, unknown>;
}

/** Everything the melee attack's answers work out to, lines and all. */
interface MeleeAssembly {
  modifiers: RollModifier[];
  deception: ReturnType<typeof deceptiveAttack>;
  flurried: boolean;
  aimed: ReturnType<typeof calledShotModifier>;
  addon: ReturnType<typeof applyAttackOptions>;
  groundPenalty: number;
  /** What a Dual-Weapon Attack at one foe takes off their defense. */
  dualDefense: number;
}

/**
 * Turns the melee dialog's answers into the lines the roll will carry.
 *
 * Pulled out of the dialog so the running total the fighter is shown and the
 * attack that is actually made are worked out by the same code. Everything the
 * caller needs besides the lines comes back with them, so nothing has to be
 * computed twice and the two cannot drift apart.
 */
function assembleMeleeAttack(
  answers: MeleeAnswers,
  options: Parameters<typeof promptForMeleeAttack>[0],
  context: { addonContext: ReturnType<typeof attackContextFor>; effortAllowed: boolean; rapidPenalty: number },
): MeleeAssembly {
  const L = (key: string) => game.i18n.localize(`GWORLD.Melee.${key}`);
  const E = (key: string) => game.i18n.localize(`GWORLD.ExtraEffort.${key}`);
  const {
    deceptive, modifier, rapid, flurry, sight, darkness, calledShot, ground, dual, charging,
    wildSwing, addonValues,
  } = answers;
  const { addonContext, effortAllowed, rapidPenalty } = context;

  // "You may not reduce your final effective skill below 10", so the ceiling is
  // set against the skill after the situational modifier, not before it. A
  // fighter at 16 who is also at -4 for something can afford one level of
  // deception, not three.
  const deception = deceptiveAttack(options.effectiveSkill + modifier, deceptive);
  const modifiers: RollModifier[] = [];

  if (deception.attackPenalty !== 0) {
    modifiers.push({ label: L("Deceptive"), value: deception.attackPenalty });
  }
  // A Flurry of Blows buys half the Rapid Strike penalty back, so the two are
  // one modifier rather than a penalty and a refund.
  const flurried = rapid && flurry && effortAllowed;
  if (rapid) {
    modifiers.push({
      label: flurried ? `${L("RapidStrike")} + ${E("Flurry")}` : L("RapidStrike"),
      value: flurried ? flurryOfBlowsPenalty(rapidPenalty) : rapidPenalty,
    });
  }
  // "If the mount's velocity is 7 or more relative to the foe, the attack has
  // -1 to hit but +1 damage" (p. 396). The damage half is collected at the
  // damage roll, which is a separate click.
  if (charging) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.Mounted.Charging"),
      value: mountedAttack(CHARGE_VELOCITY).toHit,
    });
  }

  // Both hands at once: each roll is separate, so this is the modifier for the
  // hand being rolled now (p. 417). The technique and Ambidexterity come off the
  // sheet rather than being asked about again.
  const dualWeapon = dualWeaponLine(dual, options);
  if (dualWeapon.modifier) modifiers.push(dualWeapon.modifier);

  // "You cannot target a particular part of the foe's body" on a Wild Swing:
  // the location is rolled (p. 388).
  const aimed = calledShotModifier(wildSwing ? UNAIMED : calledShot, options.damageType, false, options.actor);
  if (aimed.modifier) modifiers.push(aimed.modifier);

  // What the modules' options chosen here do to the roll; the rest of what
  // they do travels with the result.
  const addon = applyAttackOptions(addonContext, addonValues ?? {});
  modifiers.push(...addon.modifiers);

  const unseen = sightModifier(sight, false, options.eyes);
  if (unseen) modifiers.push(unseen);
  const dark = darknessModifier(darkness, options.eyes);
  if (dark) modifiers.push(dark);
  // A Wild Swing is at -5 or the visibility penalty, whichever is worse.
  if (wildSwing) {
    const swing = wildSwingPenalty((unseen?.value ?? 0) + (dark?.value ?? 0));
    if (swing) modifiers.push({ label: L("WildSwing"), value: swing });
  }

  if (modifier !== 0) {
    modifiers.push({ label: game.i18n.localize("GWORLD.Chat.Situational"), value: modifier });
  }

  // "the lower fighter is at -1 to any active defense" and worse as the drop
  // grows (p. 402). Only the defense half is applied: the rest of that rule is
  // about which locations each fighter can reach, which needs a called shot to
  // matter and a map to know.
  //
  // A long weapon closes the gap first: "each yard past the first brings the
  // foe three feet closer to you. This does not bring you any closer to your
  // foe!" So a man with a greatsword fighting somebody six feet above him
  // fights as though the drop were three.
  const levels = levelDifference(
    effectiveLevelDifference({ feet: ground, reachYards: options.reachYards ?? 1 }),
  );
  const groundPenalty = levels.negligible ? 0 : levels.lower.defense;

  return { modifiers, deception, flurried, aimed, addon, groundPenalty, dualDefense: dualWeapon.defensePenalty };
}

export async function promptForMeleeAttack(options: {
  effectiveSkill: number;
  /** What the weapon does, which decides where it can be aimed. */
  damageType: DamageType;
  /** In the saddle, which offers the charge (Campaigns p. 396). */
  mounted?: boolean;
  /** Levels of the Dual-Weapon Attack technique, which buy the -4 back. */
  dualWeaponTechnique?: number;
  /** Ambidexterity, or full Off-Hand Weapon Training. */
  ambidextrous?: boolean;
  /** Levels of Off-Hand Weapon Training, for somebody who is not. */
  offHandTraining?: number;
  /** The attacker's eyes, for the dark. */
  eyes?: Eyes;
  /**
   * The weapon's reach in yards, which closes a vertical gap without closing
   * it for the other fellow (Campaigns p. 402).
   */
  reachYards?: number;
  /** The attacker, the weapon and its reach column, for the modules' attack options. */
  actor?: any;
  item?: any;
  reach?: string;
  /** Whether a stop thrust may be declared: a thrusting attack on a Wait (Campaigns p. 366). */
  stopThrust?: boolean;
  /** A master's Rapid Strike with this attack is at half the penalty (Characters pp. 93, 99). */
  halvedRapidStrike?: boolean;
}): Promise<{
  /** A Wild Swing was declared (Campaigns p. 388). */
  wildSwing: boolean;
  /** A Dual-Weapon Attack, and which hand this roll is for (Campaigns p. 417). */
  dualWeapon: DualWeaponChoice | null;
  /** The stop thrust's damage bonus, or 0. */
  stopThrustBonus: number;
  /** What the modules' attack options chosen in the dialog add up to. */
  addon: ReturnType<typeof applyAttackOptions>;
  /** The attack options chosen, by id. */
  options: Record<string, unknown>;
  /** The Deceptive Attack's part of the defense penalty. */
  deceptive: number;
  modifiers: RollModifier[];
  defensePenalty: number;
  /** FP the chosen options cost, to be paid before the roll. */
  fatigue: number;
  /** True when Mighty Blows was bought, for the damage roll to collect. */
  mightyBlows: boolean;
  /** Whether Flurry of Blows was bought for a Rapid Strike (since 1.27.0). */
  flurryOfBlows: boolean;
  /** Where it was aimed, for the damage roll to collect. */
  calledShot: CalledShot | null;
  /** True when the blow was struck with the flat or the butt. */
  turned: boolean;
  /** True when it was struck from a mount moving at 7+ relative to the foe. */
  charging: boolean;
  /** The ST a blow is pulled to, or null for full strength (Campaigns p. 401). */
  pulledSt: number | null;
  /** A couched lance: the mount's ST and the yards it covered, or null (p. 396). */
  lance: { mountSt: number; yards: number; jousting: boolean } | null;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Melee.${key}`);

  // Only a cutting or impaling weapon has a flat or a butt to hit with, so the
  // option is offered only where there is something to turn.
  const turnable = turnedBlade({ type: options.damageType, damage: { dice: 1, adds: 0 } }) !== null;
  const E = (key: string) => game.i18n.localize(`GWORLD.ExtraEffort.${key}`);
  // A module's rules may take Rapid Strike or Deceptive Attack off this attack.
  const offered = callCombatHook(COMBAT_HOOKS.meleeAttackOptions, {
    actor: options.actor ?? null,
    item: options.item ?? null,
    maneuver: String(options.actor?.system?.maneuver ?? ""),
    rapidStrike: { available: true, refusal: null as string | null },
    deceptiveAttack: { available: true, refusal: null as string | null },
    // Since 1.27.0: the extra effort the dialog offers.
    flurryOfBlows: { available: true, refusal: null as string | null },
    mightyBlows: { available: true, refusal: null as string | null },
  });
  const refusedHere = [offered.rapidStrike, offered.deceptiveAttack, offered.flurryOfBlows, offered.mightyBlows]
    .filter((o) => o?.available === false && typeof o.refusal === "string" && o.refusal.trim())
    .map((o) => `<p style="margin:0;font-size:11px;opacity:0.8">${foundry.utils.escapeHTML(String(o.refusal))}</p>`)
    .join("");
  const deceptionAllowed = isRuleOn("deceptiveAttack") && offered.deceptiveAttack?.available !== false;
  const rapidAllowed = isRuleOn("rapidStrike") && offered.rapidStrike?.available !== false;
  const effortAllowed = isRuleOn("extraEffort");
  // Trained By A Master or Weapon Master halves it, and Flurry of Blows halves what is left.
  const rapidPenalty = rapidStrikePenalty(options.halvedRapidStrike === true);
  const addonContext = attackContextFor({
    actor: options.actor, item: options.item, ranged: false, damageType: options.damageType,
    reach: options.reach ?? "", effectiveSkill: options.effectiveSkill,
  });

  // A fighter at skill 11 or less cannot buy any deception at all, so they are
  // not offered a field that can only be left at zero. The ceiling shown is
  // against the unmodified skill, which is all that is known before the
  // situational modifier is typed; what is actually taken is clamped again
  // afterwards, against the skill the modifier leaves.
  const most = deceptionAllowed ? maxDeception(options.effectiveSkill) : 0;
  const deceptiveField = most > 0
    ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
         <span>${L("Deceptive")} (0-${most})</span>
         <input type="number" name="deceptive" value="0" min="0" max="${most}" step="1" style="width:90px">
       </label>`
    : deceptionAllowed
      ? `<p style="margin:0;font-size:11px;opacity:0.8">${L("NoDeception")}</p>`
      : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${refusedHere}
      ${deceptiveField}
      ${rapidAllowed
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="rapid">
             <span>${L("RapidStrike")} (${rapidPenalty})</span>
           </label>`
        : ""}
      ${effortAllowed && rapidAllowed && offered.flurryOfBlows?.available !== false
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="flurry">
             <span>${E("Flurry")} (${flurryOfBlowsPenalty(rapidPenalty)}, ${EXTRA_EFFORT_FP} FP)</span>
           </label>`
        : ""}
      ${options.mounted
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="charging">
             <span>${game.i18n.localize("GWORLD.Mounted.Charging")}</span>
           </label>
           <label style="display:flex;align-items:center;justify-content:space-between;gap:8px"
                  title="${game.i18n.localize("GWORLD.Mounted.LanceHint")}">
             <span>${game.i18n.localize("GWORLD.Mounted.LanceMountSt")}</span>
             <input type="number" name="lanceSt" value="0" min="0" step="1" style="width:90px">
           </label>
           <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
             <span>${game.i18n.localize("GWORLD.Mounted.LanceYards")}</span>
             <input type="number" name="lanceYards" value="0" min="0" step="1" style="width:90px">
           </label>
           <label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="jousting">
             <span>${game.i18n.localize("GWORLD.Mounted.Jousting")}</span>
           </label>`
        : ""}
      ${dualWeaponFields()}
      ${effortAllowed && offered.mightyBlows?.available !== false
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="mighty">
             <span>${E("MightyBlows")} (${EXTRA_EFFORT_FP} FP)</span>
           </label>`
        : ""}
      <label style="display:flex;align-items:center;gap:8px" title="${game.i18n.localize("GWORLD.Melee.WildSwingHint")}">
        <input type="checkbox" name="wildSwing">
        <span>${L("WildSwing")}</span>
      </label>
      ${options.stopThrust
        ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px" title="${game.i18n.localize("GWORLD.Melee.StopThrustHint")}">
             <span>${L("StopThrust")}</span>
             <input type="number" name="stopThrustYards" value="0" min="0" step="1" style="width:90px">
           </label>`
        : ""}
      ${calledShotField(options.damageType, false, options.actor)}
      ${turnable
        ? `<label style="display:flex;align-items:center;gap:8px">
             <input type="checkbox" name="turned">
             <span>${game.i18n.localize("GWORLD.Subdue.Turned")}</span>
           </label>`
        : ""}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px"
             title="${game.i18n.localize("GWORLD.Subdue.PullHint")}">
        <span>${game.i18n.localize("GWORLD.Subdue.Pull")}</span>
        <input type="number" name="pullSt" value="0" min="0" step="1" style="width:90px">
      </label>
      ${sightField()}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Ground.Label")}</span>
        <select name="ground" style="width:150px">
          <option value="0">${game.i18n.localize("GWORLD.Ground.Level")}</option>
          <option value="3">${game.i18n.localize("GWORLD.Ground.Higher3")}</option>
          <option value="4">${game.i18n.localize("GWORLD.Ground.Higher4")}</option>
          <option value="5">${game.i18n.localize("GWORLD.Ground.Higher5")}</option>
        </select>
      </label>
      ${attackOptionFields(addonContext)}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
      <div data-roll-breakdown></div>
    </div>`,
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      // The running total, kept in step with the boxes: a fighter weighing a
      // Deceptive Attack against a Rapid Strike can see what each costs.
      const update = () => {
        const form = root.closest<HTMLElement>(".application") ?? root;
        const answers = readMeleeForm(form) as unknown as MeleeAnswers;
        const { modifiers } = assembleMeleeAttack(answers, options, {
          addonContext, effortAllowed, rapidPenalty,
        });
        const automatic = [
          ...standingRollLines(options.actor, {
            rollType: "attack", ranged: false, wildSwing: answers.wildSwing, dialogAsked: true,
          }),
          ...positionRollLines(options.actor, { rollType: "attack", ranged: false }),
        ];
        // Move and Attack and a Wild Swing both hold skill to 9 (pp. 365, 388),
        // so the ceiling is shown rather than sprung at roll time. The same
        // pair the roll itself caps on.
        const cap = options.actor?.system?.maneuver === "moveAndAttack" || answers.wildSwing
          ? WILD_SWING_SKILL_CAP
          : null;
        drawBreakdown(root, rollBreakdown(Number(options.effectiveSkill) || 0, [
          { modifiers: automatic, automatic: true },
          { modifiers, automatic: false },
        ], { cap }));
      };
      root.addEventListener("change", update);
      root.addEventListener("input", update);
      update();
    },
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => readMeleeForm(button.closest<HTMLElement>(".application")),
    },
    rejectClose: false,
  });

  function readMeleeForm(form: HTMLElement | null) {
    const num = (name: string) =>
      Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
    const ticked = (name: string) =>
      form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
    return {
      addonValues: readAttackOptionValues(form, addonContext),
      deceptive: num("deceptive"),
      modifier: num("modifier"),
      rapid: ticked("rapid"),
      flurry: ticked("flurry"),
      mighty: ticked("mighty"),
      sight: (form?.querySelector<HTMLSelectElement>('select[name="sight"]')?.value ??
        "clear") as Sight,
      darkness: num("darkness"),
      calledShot:
        form?.querySelector<HTMLSelectElement>('select[name="calledShot"]')?.value ?? UNAIMED,
      turned: ticked("turned"),
      ground:
        Number(form?.querySelector<HTMLSelectElement>('select[name="ground"]')?.value ?? 0) || 0,
      dual: readDualWeapon(form),
      charging: ticked("charging"),
      pullSt: num("pullSt"),
      lanceSt: num("lanceSt"),
      lanceYards: num("lanceYards"),
      jousting: ticked("jousting"),
      wildSwing: ticked("wildSwing"),
      stopThrustYards: num("stopThrustYards"),
    };
  }

  if (!result || typeof result !== "object") return null;
  const {
    deceptive, modifier, rapid, flurry, mighty, sight, darkness, calledShot, turned, ground, dual,
    charging, pullSt, lanceSt, lanceYards, jousting, addonValues, wildSwing, stopThrustYards,
  } = result as {
    wildSwing: boolean;
    stopThrustYards: number;
    addonValues: Record<string, unknown>;
    deceptive: number;
    modifier: number;
    rapid: boolean;
    flurry: boolean;
    mighty: boolean;
    sight: Sight;
    darkness: number;
    calledShot: string;
    turned: boolean;
    ground: number;
    dual: DualWeaponChoice | null;
    charging: boolean;
    pullSt: number;
    lanceSt: number;
    lanceYards: number;
    jousting: boolean;
  };

  const assembled = assembleMeleeAttack(
    {
      deceptive, modifier, rapid, flurry, sight, darkness, calledShot, ground, dual, charging,
      wildSwing, addonValues: addonValues ?? {},
    },
    options,
    { addonContext, effortAllowed, rapidPenalty },
  );
  const { modifiers, deception, flurried, aimed, addon, groundPenalty, dualDefense } = assembled;

  const mightyBlows = mighty && effortAllowed;
  return {
    wildSwing: wildSwing === true,
    stopThrustBonus: options.stopThrust ? stopThrustBonus(stopThrustYards) : 0,
    addon,
    options: addonValues ?? {},
    deceptive: deception.defensePenalty,
    modifiers,
    defensePenalty: deception.defensePenalty + groundPenalty + dualDefense,
    dualWeapon: dual,
    // Both cost a flat point each, and both are paid before the roll -- as is
    // whatever the modules' options cost.
    fatigue: (flurried ? EXTRA_EFFORT_FP : 0) + (mightyBlows ? EXTRA_EFFORT_FP : 0) + addon.fatigue,
    mightyBlows,
    flurryOfBlows: flurried,
    calledShot: aimed.shot,
    turned: turned === true,
    charging: charging === true,
    pulledSt: pullSt > 0 ? Math.floor(pullSt) : null,
    lance: lanceSt > 0 && lanceYards > 0
      ? { mountSt: Math.floor(lanceSt), yards: Math.floor(lanceYards), jousting: jousting === true }
      : null,
  };
}

/**
 * The furthest a reach column reaches, in yards.
 *
 * The column is a list -- "C, 1" for a weapon usable in close combat and at a
 * yard, "1, 2" for a spear -- and what matters for closing a vertical gap is
 * the longest of them. A "C" alone is no reach at all.
 */
export function longestReach(reach: string): number {
  const yards = reach
    .split(",")
    .map((part) => Number(part.trim().replace("*", "")))
    .filter((value) => Number.isFinite(value));
  return yards.length > 0 ? Math.max(1, Math.max(...yards)) : 1;
}

/** Handles a click on any element carrying the damage dataset. */
export async function handleDamageAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<void> {
  const { damageLabel } = target.dataset;
  if (!target.dataset.damageFormula || !target.dataset.damageType) return;
  // The row the damage was rolled from names the weapon, which a module's
  // hooks may want to know.
  const itemRow = target.closest<HTMLElement>("[data-item-id]");
  // The first hit of a multiple-projectile shot whose first projectile has a
  // line of its own (since API 1.73.0): the first damage roll from the row
  // after the attack uses it, and every roll after that the row's own.
  const first = target.dataset.firstHitDamage ? await consumeFirstHit(actor, shotRow(itemRow)) : false;
  const line = projectileLine({
    line: {
      damage: target.dataset.damageFormula,
      damageType: target.dataset.damageType,
      armorDivisor: Number(target.dataset.armorDivisor) || 1,
    },
    firstHit: {
      damage: target.dataset.firstHitDamage ?? "",
      damageType: target.dataset.firstHitDamageType ?? "",
      armorDivisor: Number(target.dataset.firstHitArmorDivisor) || 0,
    },
    first,
  });
  const damageFormula = line.damage;
  const damageType = line.damageType;
  const armorDivisor = line.armorDivisor;
  const itemId = itemRow?.dataset.itemId;
  const item = itemId ? (actor?.items?.get?.(itemId) ?? null) : null;
  const modeIndex = Number(itemRow?.dataset.modeIndex);
  const mode = (item || itemRow?.dataset.derivedMode) && itemRow?.dataset.modeIndex !== undefined && Number.isInteger(modeIndex)
    ? { index: modeIndex, ranged: itemRow.dataset.ranged === "1", ...(itemRow.dataset.derivedMode ? { derived: itemRow.dataset.derivedMode } : {}) }
    : null;

  const modifiers = await maybePromptModifiers(event);
  if (modifiers === null) return;

  // Where the attack was aimed, so the apply control opens on that location
  // rather than asking again -- and, for a chink, so the DR it found is halved.
  const aimed = await consumeCalledShot(actor);
  // A shot aimed at a foe's weapon lands on the weapon (Campaigns p. 400; since 1.153.0).
  const weaponStruck = await consumeWeaponStrike(actor, shotRow(itemRow));
  // Pellets that struck as one mass, recorded by the attack roll.
  const mass = await consumeMassShot(actor);
  // A target past 1/2D, recorded by the attack roll too, and the range the
  // shot was taken at.
  const halved = await consumeHalfDamage(actor);
  const shotRange = await consumeShotRange(actor, shotRow(itemRow));

  // A blow struck with the flat of a blade crushes rather than cuts, and one
  // struck with the butt of a spear crushes for a point less.
  const flat = await consumeTurnedBlade(actor);

  // A blow pulled to a lower ST re-reads its damage at that ST (p. 401), and
  // everything after this -- a turned blade included -- works on that figure.
  const pulledSt = await consumePulledBlow(actor);
  const pulled = pulledSt && target.dataset.melee === "1"
    ? pulledFormula({
        strength: Number(actor?.system?.derived?.strikingSt) || Number(actor?.system?.attributes?.ST) || 10,
        chosen: pulledSt,
        stBased: target.dataset.stBased === "1",
        damageBase: target.dataset.damageBase ?? "",
        damageModifier: Number(target.dataset.damageModifier) || 0,
        minSt: target.dataset.minSt ? Number(target.dataset.minSt) || null : null,
        naturalKey: target.dataset.naturalKey ?? "",
        unarmedBonusSkill: target.dataset.unarmedBonusSkill ?? "",
        weaponMasterPerDie: Number(target.dataset.weaponMasterPerDie) || 0,
        dx: Number(actor?.system?.derived?.attributes?.DX) || 10,
        skills: {
          ...(actor?.system?.skillLevelByName?.("Brawling") != null ? { Brawling: actor.system.skillLevelByName("Brawling") } : {}),
          ...(actor?.system?.skillLevelByName?.("Boxing") != null ? { Boxing: actor.system.skillLevelByName("Boxing") } : {}),
          ...(actor?.system?.skillLevelByName?.("Karate") != null ? { Karate: actor.system.skillLevelByName("Karate") } : {}),
        },
      })
    : null;
  // A couched lance does the collision's damage, not the wielder's (p. 396):
  // "(mount's ST) x (distance moved last turn)/100 dice of damage, rounded
  // down -- and add the lance's thrust/impaling bonus of +3." A blunted
  // tournament lance crushes, and snaps past 15.
  const lance = await consumeLance(actor);
  const couched = lance
    ? lanceDamage({ mountStrength: lance.mountSt, yardsMoved: lance.yards, jousting: lance.jousting })
    : null;
  const baseFormula = couched
    ? formatDiceAdds({ dice: Math.max(1, couched.dice), adds: couched.adds })
    : (pulled ?? damageFormula);

  // A Mighty Blows bought before the attack is collected here, where the dice
  // are known -- the bonus is "+2 to damage, or +1 per die if that is better".
  // It applies only to ST-based thrust and swing damage, so a force sword's
  // flat 8d collects nothing however much fatigue was spent.
  if (isRuleOn("extraEffort") && (await consumeMightyBlows(actor))) {
    // Melee only: "if you take an Attack maneuver in melee combat". A bow's
    // damage is ST-based too, and would otherwise collect a bonus bought for a
    // sword.
    if (target.dataset.melee === "1" && target.dataset.stBased === "1") {
      modifiers.push({
        label: game.i18n.localize("GWORLD.ExtraEffort.MightyBlows"),
        value: mightyBlowsBonus(parseDiceAdds(damageFormula)?.dice ?? 0),
      });
    } else {
      ui.notifications?.info(game.i18n.localize("GWORLD.ExtraEffort.NotStBased"));
    }
  }

  // All-Out Attack (Strong): "+2 to damage - or +1 damage per die, if that
  // would be better. This only applies to melee attacks doing ST-based thrust
  // or swing damage" (p. 365).
  if (
    actor?.system?.maneuver === "allOutAttack" &&
    actor.system.allOutAttackOption === "strong" &&
    target.dataset.melee === "1" &&
    target.dataset.stBased === "1"
  ) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.Maneuver.AllOutAttackOption.strong"),
      value: strongAttackDamageBonus(parseDiceAdds(damageFormula)?.dice ?? 0),
    });
  }

  // Damage a module's option chosen at the attack added.
  modifiers.push(...(await consumeAddonDamage(actor)));
  // And the options themselves, for the rules that read them where it lands.
  const attackOptions = await consumeAttackOptions(actor);

  // A stop thrust: "+1 to thrust damage for every two full yards your
  // attacker moved toward you" (p. 366).
  const stopThrust = await consumeStopThrust(actor);
  if (stopThrust) modifiers.push({ label: game.i18n.localize("GWORLD.Melee.StopThrustLine"), value: stopThrust });

  // The other half of a mounted charge: "-1 to hit but +1 damage" (p. 396).
  if (await consumeCharge(actor)) {
    modifiers.push({
      label: game.i18n.localize("GWORLD.Mounted.Charging"),
      value: mountedAttack(CHARGE_VELOCITY).damageBonus,
    });
  }

  // A weapon whose damage cannot be parsed is not turned: substituting dice
  // for it would quietly change what the weapon does, which is worse than
  // simply hitting them with the sharp end.
  const parsed = flat ? parseDiceAdds(baseFormula) : null;
  const struck = parsed
    ? turnedBlade({
        type: damageType as DamageType,
        damage: parsed,
        reach: Number(target.dataset.reach) || 1,
      })
    : null;

  await rollDamage({
    actor,
    label: [
      damageLabel ?? "Damage",
      ...(line.firstHit ? [target.dataset.firstHitLabel || game.i18n.localize("GWORLD.Ranged.FirstHit")] : []),
      ...(pulled ? [game.i18n.format("GWORLD.Subdue.PulledTo", { st: pulledSt })] : []),
      ...(couched
        ? [game.i18n.format(couched.maxDamage ? "GWORLD.Mounted.JoustingLabel" : "GWORLD.Mounted.LanceLabel", {
            st: lance?.mountSt, yards: lance?.yards, max: couched.maxDamage,
          })]
        : []),
      ...(struck ? [game.i18n.localize("GWORLD.Subdue.Turned")] : []),
      ...(weaponStruck ? [game.i18n.format("GWORLD.Breakage.DamageLabel", { weapon: weaponStruck.name })] : []),
    ].join(" \u2014 "),
    formula: struck ? formatDiceAdds(struck.damage) : baseFormula,
    damageType: struck ? struck.type : couched ? couched.type : (damageType as DamageType),
    armorDivisor: Number(armorDivisor) || 1,
    ...(line.firstHit ? { firstHit: true } : {}),
    ...(aimed && !weaponStruck ? { calledShot: aimed } : {}),
    ...(weaponStruck ? { weaponTarget: weaponStruck } : {}),
    ...(Object.keys(attackOptions).length > 0 ? { attackOptions } : {}),
    ...(mass > 1 ? { massMultiplier: mass } : {}),
    ...(halved ? { halfDamage: true } : {}),
    // The shot's range where the attack recorded one; the map's otherwise.
    ...(shotRange !== null ? { distanceYards: shotRange } : {}),
    ...(target.dataset.material ? { material: target.dataset.material } : {}),
    ...(target.dataset.ignoresDr === "1" ? { ignoresDr: true } : {}),
    ...(target.dataset.incendiary === "1" ? { incendiary: true } : {}),
    ...(target.dataset.radiation === "1" ? { radiation: true } : {}),
    ...(target.dataset.doubleKnockback === "1" ? { doubleKnockback: true } : {}),
    ...(target.dataset.noKnockback === "1" ? { noKnockback: true } : {}),
    ...(target.dataset.kineticOnly === "1" ? { kineticOnly: true } : {}),
    ...(target.dataset.surge === "1" ? { surge: true } : {}),
    ...(target.dataset.tightBeam === "1" ? { tightBeam: true } : {}),
    ...(target.dataset.pick === "1" ? { pick: true } : {}),
    ...(item ? { item } : {}),
    ...(mode ? { mode } : {}),
    ...(strikingPart(target.dataset.naturalKey ?? "") ? { strikingPart: strikingPart(target.dataset.naturalKey ?? "") } : {}),
    explosive: target.dataset.explosive === "1",
    fragmentation: target.dataset.fragmentation ?? "",
    ...explosionDataset(target.dataset),
    modifiers,
  });
}

/**
 * What a damage button carries about its blast and its fragments beyond the
 * dice (since API 1.72.0), read off its data attributes; each only where set.
 */
export function explosionDataset(dataset: DOMStringMap): Partial<DamageRollOptions> {
  const number = (value: string | undefined) => (value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined);
  const divisor = number(dataset.fragmentationDivisor);
  const every = number(dataset.fragmentationLingerEvery);
  const lasting = number(dataset.fragmentationLingerFor);
  const placement = blastPlacementOf(dataset.blastPlacement);
  return {
    ...(dataset.fragmentationType ? { fragmentationType: dataset.fragmentationType as DamageType } : {}),
    ...(divisor !== undefined && divisor !== 1 ? { fragmentationDivisor: divisor } : {}),
    ...(every ? { fragmentationLingerEvery: every } : {}),
    ...(lasting ? { fragmentationLingerFor: lasting } : {}),
    ...(placement ? { blastPlacement: placement } : {}),
    ...(dataset.largeArea === "1" ? { largeArea: true } : {}),
  };
}

/** Maps a roll's data-roll-type to the rules the roll should be judged by. */
function rollKind(rollType: string | undefined): RollKind {
  if (rollType === "dodge" || rollType === "parry" || rollType === "block") return "defense";
  if (rollType === "attribute") return "attribute";
  if (rollType === "attack") return "attack";
  return "skill";
}

/**
 * Shift-click asks for a situational modifier. Returns null when the prompt is
 * dismissed, meaning the caller should abandon the roll entirely.
 */
async function maybePromptModifiers(event: Event, held: RollModifier[] = []): Promise<RollModifier[] | null> {
  if (!(event as MouseEvent).shiftKey) return [];

  const value = await promptForModifier(held);
  if (value === null) return null;
  if (value === 0) return [];
  return [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value }];
}

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  const dice = roll.dice?.[0]?.results ?? [];
  return dice.map((r: { result: number }) => r.result);
}

function describeOutcome(outcome: SuccessRollResult, kind: string): string {
  const key = outcome.criticalSuccess
    ? "CriticalSuccess"
    : outcome.criticalFailure
      ? "CriticalFailure"
      : outcome.success
        ? "Success"
        : "Failure";

  const base = game.i18n.localize(`GWORLD.Roll.${key}`);
  if (outcome.criticalSuccess || outcome.criticalFailure) return base;

  const marginKey = outcome.success ? "MarginOfSuccess" : "MarginOfFailure";
  // GURPS Lite defines no critical results for active defenses.
  const suffix = kind === "defense" ? "" : ` — ${game.i18n.localize(`GWORLD.Roll.${marginKey}`)} ${outcome.margin}`;
  return `${base}${suffix}`;
}

function outcomeClass(outcome: SuccessRollResult): string {
  if (outcome.criticalSuccess) return "crit-success";
  if (outcome.criticalFailure) return "crit-failure";
  return outcome.success ? "success" : "failure";
}

/** A punch or a kick, read off the row's natural key, or null for anything else. */
export function unarmedBlow(naturalKey: unknown): "punch" | "kick" | null {
  return naturalKey === "punch" || naturalKey === "kick" ? naturalKey : null;
}

/** A skill's level on a character, or its IQ-5 default where they haven't got it, for an aiming roll. */
function aimingLevel(actor: any, skill: string): number {
  const wanted = String(skill).toLowerCase().replace(/\/tl\d*/g, "").replace(/\s+/g, " ").trim();
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    const name = String(item.name ?? "").toLowerCase().replace(/\/tl\d*/g, "").replace(/\s+/g, " ").trim();
    const level = item.system?.derived?.level;
    if (name === wanted && typeof level === "number") return level;
  }
  const iq = Number(actor?.system?.derived?.attributes?.IQ ?? actor?.system?.attributes?.IQ) || 10;
  return iq - 5;
}

/** The skill the spot on a semi-active weapon's target is held with, unless a module says otherwise. */
export const DESIGNATION_SKILL = "Forward Observer";

/**
 * What a character rolls to hold the spot on a semi-active weapon's target
 * (since API 1.128.0): the skill made DX-based (Characters p. 172), since
 * keeping a dot on a moving target is a matter of a steady hand. The skill is
 * read as the IQ-based one Forward Observer is, at its IQ-5 default where the
 * character hasn't got it.
 */
export function designationLevel(actor: any, skill: string = DESIGNATION_SKILL): number {
  const iq = Number(actor?.system?.derived?.attributes?.IQ ?? actor?.system?.attributes?.IQ) || 10;
  const dx = Number(actor?.system?.derived?.attributes?.DX ?? actor?.system?.attributes?.DX) || 10;
  return basedOnAnother(aimingLevel(actor, skill), iq, dx);
}

/** A homing attack as `gworld.homingAttack` leaves it (since API 1.128.0). */
export interface HomingAttack {
  actor: any;
  item: any;
  mode: unknown;
  /** The one token targeted's actor, or null. */
  target: any;
  rangeYards: number;
  /** Seconds in the air, counting the turn it is launched. */
  seconds: number;
  /** True where it runs out of reach before it arrives. */
  falls: boolean;
  /** Whether the seeker has locked on, which is worth the weapon's Acc. */
  lockedOn: boolean;
  /** Whether it homes on a spot someone holds on the target. */
  semiActive: boolean;
  /** Who holds the spot: the firer unless a listener names someone else. */
  designator: any;
  /** The skill they hold it with. */
  skill: string;
  /** The level they roll at, or null for `designationLevel` of the designator. */
  level: number | null;
  /** How many rolls holding it takes: one a turn of flight. */
  rolls: number;
}

/**
 * Asks the modules about a homing attack before it is rolled (since API
 * 1.128.0): whether it locked on, whether it is semi-active, and who holds
 * the spot and how. What the shooter said in the dialog is the starting point.
 */
export function homingAttack(options: {
  actor: any;
  item: any;
  mode: unknown;
  shot: { rangeYards: number; lockedOn?: boolean };
  weapon: { halfDamageRange?: number; maxRange?: number };
  semiActive: boolean;
}): HomingAttack {
  const flight = flightPlan({
    rangeYards: options.shot.rangeYards,
    speed: projectileSpeed(options.weapon.halfDamageRange ?? 0),
    maxRange: options.weapon.maxRange ?? 0,
  });
  const targets = targetedTokens();
  const hooked = callCombatHook<HomingAttack>(COMBAT_HOOKS.homingAttack, {
    actor: options.actor,
    item: options.item,
    mode: options.mode,
    target: targets.length === 1 ? targets[0]?.actor ?? null : null,
    rangeYards: options.shot.rangeYards,
    seconds: flight.seconds,
    falls: flight.falls,
    lockedOn: options.shot.lockedOn === true,
    semiActive: options.semiActive,
    designator: options.actor,
    skill: DESIGNATION_SKILL,
    level: null,
    rolls: designationRolls({ semiActive: true, secondsInFlight: flight.seconds, falls: flight.falls }),
  });
  // Whatever a listener left, read the way the rolls need it.
  const level = hooked.level === null || hooked.level === undefined || !Number.isFinite(Number(hooked.level))
    ? null
    : Math.floor(Number(hooked.level));
  return {
    ...hooked,
    lockedOn: hooked.lockedOn === true,
    semiActive: hooked.semiActive === true,
    designator: hooked.designator ?? options.actor,
    skill: String(hooked.skill ?? "").trim() || DESIGNATION_SKILL,
    level,
    rolls: Math.max(0, Math.floor(Number(hooked.rolls) || 0)),
  };
}

/**
 * Puts a lock-on's Acc on an attack's lines, or takes it off, once the
 * modules have said whether there is one (since API 1.128.0). A lock-on gives
 * what one second of aim would, so where the attack already has an Accuracy
 * line -- aimed, or in the air long enough to count as aimed -- it adds
 * nothing; and only a line the lock-on alone earned is taken away.
 */
export function applyLockOn(
  modifiers: RollModifier[],
  lockedOn: boolean,
  weapon: { accuracy: number; scopeBonus: number; scopeFixed?: boolean },
): void {
  if (!lockedOn) {
    for (let i = modifiers.length - 1; i >= 0; i--) {
      if (modifiers[i]?.key === "accuracy" && modifiers[i]?.lockOn === true) modifiers.splice(i, 1);
    }
    return;
  }
  if (modifiers.some((line) => line.key === "accuracy")) return;
  const scope = scopeBonus({ bonus: weapon.scopeBonus, secondsAimed: 1, fixed: weapon.scopeFixed === true });
  const value = weapon.accuracy + scope;
  if (value === 0) return;
  const scopeShare = Math.max(0, Math.min(scope, value));
  modifiers.push({
    label: game.i18n.localize("GWORLD.Ranged.LockedOn"),
    value,
    key: "accuracy",
    ...(scopeShare ? { scope: scopeShare } : {}),
    lockOn: true,
  });
}

/**
 * The rolls to hold a semi-active weapon's spot on its target (since API
 * 1.128.0), one a turn of flight, stopping at the first failure. They are all
 * made when the attack is, since the system works out a steered weapon's
 * whole flight at once; the card of each says which turn it is for.
 */
async function holdDesignation(firer: any, homing: HomingAttack): Promise<{ held: boolean; rolls: Array<SuccessRollResult | null> }> {
  const designator = homing.designator ?? firer;
  const level = homing.level ?? designationLevel(designator, homing.skill);
  const needed = homing.rolls;
  const rolls: Array<SuccessRollResult | null> = [];
  for (let turn = 1; turn <= needed; turn++) {
    const roll = await rollSuccess({
      actor: designator,
      base: level,
      label: game.i18n.format("GWORLD.Guided.HoldSpot", { skill: homing.skill, turn, turns: needed }),
      kind: "skill",
      skill: homing.skill,
      tags: ["designation", "DX"],
    });
    rolls.push(roll);
    if (!roll?.success) break;
  }
  const held = designationHeld(rolls, needed);
  if (!held) {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: firer }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-result">${foundry.utils.escapeHTML(
        game.i18n.format("GWORLD.Guided.SpotLost", { name: String(designator?.name ?? "") }),
      )}</div></div>`,
    });
  }
  callCombatHook(COMBAT_HOOKS.afterDesignation, {
    actor: firer,
    item: homing.item,
    mode: homing.mode,
    target: homing.target,
    designator,
    skill: homing.skill,
    level,
    needed,
    rolls,
    held,
  });
  return { held, rolls };
}

/** A token's document UUID, whichever of the placeable or the document it is. */
function tokenUuid(token: any): string {
  return String(token?.document?.uuid ?? token?.uuid ?? "");
}

/**
 * How the attacker has moved this turn (since API 1.63.0): the maneuver, and
 * the yards the token's movement history records where the map can say.
 */
export function attackerMovement(actor: any): { maneuver: string; yards: number | null } {
  const maneuver = String(actor?.system?.maneuver ?? "");
  const token: any = actor?.getActiveTokens?.()?.[0];
  const history: any[] = token?.document?.movementHistory ?? [];
  if (!Array.isArray(history) || history.length < 2) return { maneuver, yards: history?.length ? 0 : null };
  const stage: any = (globalThis as any).canvas;
  if (!stage?.grid?.measurePath) return { maneuver, yards: null };
  const distance = Number(stage.grid.measurePath(history.map((p: any) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })))?.distance);
  if (!Number.isFinite(distance)) return { maneuver, yards: null };
  const units = String(stage.scene?.grid?.units ?? "").trim().toLowerCase();
  const yards = units === "ft" || units === "feet" || units === "'" ? distance / 3 : units === "m" ? distance * 1.0936 : distance;
  return { maneuver, yards: Math.round(yards) };
}

/** Telescopic Vision's levels among the character's own traits, and whether it was bought with No Targeting. */
function telescopicTraitLevels(actor: any): { levels: number; noTargeting: boolean } {
  let levels = 0;
  let noTargeting = false;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait" || !/^telescopic vision\b/i.test(String(item.name ?? ""))) continue;
    levels += Math.max(1, Number(item.system?.levels) || 0);
    if ((item.system?.modifiers ?? []).some((m: any) => /no targeting/i.test(String(m?.name ?? "")))) noTargeting = true;
  }
  return { levels, noTargeting };
}

/**
 * The size and range lines on a Vision roll at the one token targeted
 * (Characters p. 358), and what Telescopic Vision ignores of the range --
 * twice as much for a character whose Aim is on that token (p. 92). Nothing
 * where no single token is targeted or the map can't say how far it is.
 */
export function visionRangeLines(actor: any): RollModifier[] {
  const targets = targetedTokens();
  if (targets.length !== 1) return [];
  const target = targets[0];
  const yards = yardsBetween(actor?.getActiveTokens?.()?.[0], target);
  if (yards === null) return [];
  const lines: RollModifier[] = [];
  const sm = Math.round(Number(target?.actor?.system?.sm) || 0);
  if (sm) lines.push({ label: game.i18n.localize("GWORLD.Ranged.TargetSize"), value: sm, key: "size" });
  const range = speedRangeModifier(yards);
  if (range) {
    lines.push({ label: game.i18n.format("GWORLD.Senses.Range", { yards }), value: range, key: "speedRange" });
    const levels = Number(actor?.system?.derived?.traitEffects?.telescopicVision) || 0;
    const aim = aimStateOf(actor);
    const zoomed = aimTurnsOf(actor) > 0 && aim.target !== "" && aim.target === tokenUuid(target);
    const offset = telescopicOffset(range, levels, zoomed);
    if (offset) lines.push({ label: game.i18n.localize(zoomed ? "GWORLD.Senses.TelescopicZoomed" : "GWORLD.Senses.Telescopic"), value: offset, key: "telescopic" });
  }
  return lines;
}
