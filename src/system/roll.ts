/**
 * Rolling and chat output.
 *
 * The dice go through Foundry's Roll class so that dice-animation modules and
 * the roll log behave normally; the *interpretation* — success, margin, and
 * critical status — comes from the pure rules engine, which is the only place
 * those rules are defined.
 */

import { outcomeStep } from "../rules/bonus-points.js";
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
import { targetedTokens, withTargets } from "./targets.js";
import {
  afterSuccessRoll,
  attackSequenceFor,
  attackTargetCandidates,
  maneuverOptionAttackEffect,
  recordAttackMade,
  successRollModifiers,
  type ResistedAttack,
  successRollTags,
} from "./procedure-extensions.js";
import { aimTurnsOf, loseAim } from "./aim.js";
import { evaluateBonusFor } from "./evaluate.js";
import { aimBonus } from "../rules/aim.js";
import {
  scopeBonus,
  laserSight,
} from "../rules/accessories.js";
import { multipleProjectiles } from "../rules/shotguns.js";
import {
  canAttempt, isCriticalFailure, isCriticalSuccess, resolveDefense, resolveSuccess, type SuccessRollResult,
} from "../rules/success.js";
import {
  COMBAT_HOOKS,
  skillCapLine,
  applyAttackOptions,
  attackOptionFields,
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
import { blastRadius, fragmentationRadius } from "../rules/explosions.js";
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
import { penaltyForRoll } from "../rules/attribute-penalties.js";
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
  rangedToHitModifier,
  rapidFireBonus,
  rapidFireHits,
} from "../rules/ranged.js";
import {
  REPAIRS,
  clearsItself,
  malfunctionFor,
  malfunctioned,
  mayExplode,
  type Malfunction,
} from "../rules/malfunctions.js";
import { attackWithoutSight, darknessPenalty, type Sight, type VisionTraits } from "../rules/visibility.js";
import { impairedAttacks } from "../rules/trait-effects.js";
import { levelDifference } from "../rules/melee-situations.js";
import { effectiveLevelDifference } from "../rules/unarmed-techniques.js";
import { turnedBlade } from "../rules/subduing.js";
import { coverShot, struckCover, type CoverApproach } from "../rules/cover.js";
import { breakWeapon } from "./weapon-damage.js";
import { shotsReady, spendShots } from "./ammunition.js";
import { strikingPart } from "../rules/hurting-yourself.js";
import type { DamageType } from "../rules/types.js";

import { cappedAimBonus, targetingSystemBonus, unexpectedDodgePenalty } from "../rules/vehicle-combat.js";
import {
  accuracyApplies,
  areaDamageFallsOff,
  coneMayStillCatch,
  coneWidth,
  defendsAgainstArea,
  flightPlan,
  guidanceModifiers,
  halvesDamage,
  projectileSpeed,
  steeringDuty,
  type Guidance,
} from "../rules/guided.js";
import { WILD_SWING_SKILL_CAP, allOutAttackBonus, stopThrustBonus, strongAttackDamageBonus, wildSwingPenalty, type AllOutAttackOption } from "../rules/maneuvers.js";
import { flailKind, type FlailKind } from "../rules/defenses.js";
import { canTargetFromArc, missByOneHitsTorso } from "../rules/hit-locations.js";
import { arcAgainstTarget } from "./attack-arc.js";
import { POSTURE_EFFECTS } from "../rules/posture.js";
import { drivingAttackPenalty, type VehicleAttackKind } from "../rules/scale.js";
import { mayFireMountedWeapon, vehicleAboard, type Aboard } from "./vehicle-aboard.js";
import { rollMalediction } from "./malediction.js";

const CHAT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;
const DAMAGE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-roll.hbs`;

/** What rules a roll is judged by; only defenses skip the minimum-3 check. */
export type RollKind = "skill" | "attribute" | "attack" | "defense" | "selfControl";

export interface RollModifier {
  label: string;
  value: number;
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
  malfunction?: { number: number; techLevel: number; revolver: boolean } | null;
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
   * What sort of roll this is beyond its kind, for modules' modifiers:
   * `fright`, `knockdown`, `selfControl`, a defense's name... A Fast-Draw or
   * Teaching skill is tagged from its name.
   */
  tags?: string[];
  /**
   * What the roll is made against, where it is an attack (since 1.49.0). It
   * reaches the `gworld.successRollModifiers` listeners untouched, so a module
   * can read the weapon and the range a resistance roll was forced by.
   */
  attack?: ResistedAttack;
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
 * Rolls 3d6 against a target number and posts the result to chat.
 *
 * Returns the resolved outcome so callers can chain on it (an attack that hits
 * going on to roll damage, for instance).
 */
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult | null> {
  const {
    actor, base, label, kind = "skill", rapidFire, defensePenalty = 0,
    unarmed = false, noParry = false,
  } = options;
  // What the actor's timed conditions and the modules add, beside the lines
  // the caller worked out.
  const tags = successRollTags({ kind, skill: options.skill, tags: options.tags });
  const given = options.modifiers ?? [];
  const modifiers = [
    ...given,
    ...successRollModifiers({
      actor, label, kind, skill: String(options.skill ?? ""), base, tags, modifiers: [...given],
      ...(options.attack ? { attack: options.attack } : {}),
    }),
  ];

  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const effective = base + totalModifier;

  // A roll at effective skill below 3 may not be attempted at all, and only
  // active defenses are exempt (GURPS Lite p. 2). Without this check a rolled
  // 3 or 4 would report success, since those always succeed once rolled.
  if (kind !== "defense" && !canAttempt(effective)) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Roll.TooLowToAttempt", { label, effective }),
    );
    return null;
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
      ? await rollMalfunction(roll.total, options.malfunction)
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
  });

  afterSuccessRoll({ actor, label, kind, skill: String(options.skill ?? ""), tags, outcome });

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
    lines.push({ label: game.i18n.localize("GWORLD.Penalties.Label"), value: knockedDown });
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
 * same object whether the row is a classic sheet's table row or the new
 * sheet's card.
 */
export function weaponFromDataset(actor: any, dataset: Record<string, unknown>) {
  const n = (key: string) => Number(dataset[key]) || 0;
  return {
    damageType: String(dataset.damageType ?? "cr") as DamageType,
    accuracy: n("accuracy"),
    scopeBonus: n("scopeBonus"),
    rateOfFire: n("rateOfFire") || 1,
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
 * Returns zero for a roll the rule exempts, and for a button that does not say
 * what it is based on -- an attack rolls against a weapon skill whose attribute
 * is the skill's own business, and guessing at it would be worse than nothing.
 */
function temporaryPenalty(actor: any, basedOn: string | undefined, kind: RollKind): number {
  if (!basedOn) return 0;

  const penalties = actor?.system?.attributePenalties;
  if (!penalties) return 0;

  return penaltyForRoll({
    penalties,
    basedOn: basedOn as SkillAttribute,
    kind: kind === "defense" ? "activeDefense" : "skill",
  });
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
  weapon: { number: number; techLevel: number; revolver: boolean },
): Promise<{
  roll: any;
  kind: Malfunction;
  label: string;
  repair: string;
  fires: boolean;
  clears: boolean;
  explodes: boolean;
} | null> {
  if (!malfunctioned({ roll: attackRoll, malfunctionNumber: weapon.number })) return null;

  const roll = new Roll("3d6");
  await roll.evaluate();

  const rolled = malfunctionFor(roll.total);
  // "TL5+ weapons do not explode -- treat as a mechanical or electrical
  // problem", so the worst row of the table is two different results.
  const kind: Malfunction =
    rolled === "explosion" && !mayExplode(weapon.techLevel) ? "mechanical" : rolled;

  const repair = REPAIRS[kind];
  const clears = clearsItself(kind, weapon.revolver);

  return {
    roll,
    kind,
    label: game.i18n.localize(`GWORLD.Malfunction.${kind}`),
    repair: clears
      ? game.i18n.localize("GWORLD.Malfunction.Revolver")
      : repair.hours > 0
        ? game.i18n.format("GWORLD.Malfunction.Hours", { hours: repair.hours })
        : game.i18n.format("GWORLD.Malfunction.Ready", { ready: repair.readyManeuvers }),
    // "The weapon fires one shot, then jams. (Treat the fired shot as a normal
    // attack.)"
    fires: kind === "stoppage",
    clears,
    explodes: kind === "explosion",
  };
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
  /** Where the attack that earned this damage was aimed. */
  calledShot?: CalledShot | null;
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
  /** The item the blow comes from, for a module's hooks; its UUID travels on the card. */
  item?: any;
  /** Which of the item's modes it was rolled from. */
  mode?: { index: number; ranged: boolean; derived?: string } | null;
  /** The body part an unarmed blow strikes with, for Hurting Yourself (Campaigns p. 379). */
  strikingPart?: string | null;
  /** Where the blow came from, for the modules' damage hooks (since 1.43.0), e.g. "parriedLimb". */
  source?: string;
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
  const hookedDamage = callCombatHook(COMBAT_HOOKS.damageModifiers, {
    actor, item, mode, label, formula: options.formula, damageType, modifiers: [...(options.modifiers ?? [])],
  });
  const replaced = typeof hookedDamage.formula === "string" && hookedDamage.formula !== options.formula && parseDiceAdds(hookedDamage.formula)
    ? hookedDamage.formula
    : null;
  const formula = replaced ?? options.formula;
  const modifiers = hookedDamage.modifiers.filter((m) => typeof m?.value === "number" && Number.isFinite(m.value));
  const explosive = options.explosive === true && isRuleOn("explosions");
  const cinematicBlast = explosive && isRuleOn("cinematicExplosions");
  const fragments = cinematicBlast ? "" : fragmentation;

  const parsed = parseDiceAdds(formula);
  if (!parsed) {
    ui.notifications?.warn(`Could not parse damage formula "${formula}".`);
    return 0;
  }

  const bonus = modifiers.reduce((sum, m) => sum + m.value, 0);
  // The multiplier travels with the roll: "6dx10" is six dice times ten, and
  // dropping it here would roll a tenth of the attack.
  const rolled = {
    dice: parsed.dice,
    adds: parsed.adds + bonus,
    ...(parsed.multiplier ? { multiplier: parsed.multiplier } : {}),
  };
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

  // Shown against DR 0 so the card states raw injury; the GM subtracts real DR.
  const undefended = computeInjury({ basicDamage, dr: 0, type: damageType });

  const content = await foundry.applications.handlebars.renderTemplate(DAMAGE_TEMPLATE, {
    label,
    formula,
    damageType,
    armorDivisor,
    // A divisor of 1 is the ordinary case and is not worth a line on the card.
    // Anything else is, in both directions: above 1 it divides the target's DR,
    // below 1 it multiplies it, and a stake at (0.5) doubling DR matters to the
    // GM every bit as much as a beam weapon halving it.
    hasArmorDivisor: armorDivisor !== 1,
    modifiers: modifiers.filter((m) => m.value !== 0),
    basicDamage,
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
    blastRadius: explosive ? blastRadius(parsed.dice * (parsed.multiplier ?? 1)) : 0,
    // "In cinematic combat, explosions do no direct damage! Ignore
    // fragmentation, too" (p. 417) -- so a cinematic grenade throws none, and
    // the card does not offer a radius for fragments nobody will roll.
    fragmentation: fragments,
    fragmentationRadius: fragments
      ? fragmentationRadius(parseDiceAdds(fragments)?.dice ?? 0)
      : 0,
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
          ...(mass > 1 ? { drMultiplier: mass } : {}),
          ...(options.material ? { material: options.material } : {}),
          ...(options.ignoresDr ? { ignoresDr: true } : {}),
          // Carried to the apply, where a dose, a fire and a shove are worked
          // out against the victim rather than against the dice (pp. 104-105).
          ...(options.incendiary ? { incendiary: true } : {}),
          ...(options.radiation ? { radiation: true } : {}),
          ...(options.doubleKnockback ? { doubleKnockback: true } : {}),
          ...(options.noKnockback ? { noKnockback: true } : {}),
          ...(typeof item?.uuid === "string" ? { itemUuid: item.uuid } : {}),
          ...(mode ? { mode } : {}),
          ...(options.source ? { source: String(options.source) } : {}),
          ...(options.weaponTarget ? { weaponTarget: options.weaponTarget } : {}),
          // Who struck bare-handed, and with what, for Hurting Yourself (p. 379).
          ...(options.strikingPart && typeof options.actor?.uuid === "string" ? { strikingPart: options.strikingPart, strikerUuid: options.actor.uuid } : {}),
          explosive,
          // The dice, not the rolled total: the blast radius is set by how
          // many dice the attack rolls, whatever they came up -- and a
          // multiplied roll is that many dice again.
          diceOfDamage: parsed.dice * (parsed.multiplier ?? 1),
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
export async function promptForModifier(): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("GWORLD.Chat.ModifierTitle") },
    content: `<div class="gworld">
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
  const roll = () => rollAction(actor, event, target, sequence.count > 1 ? place : null);
  const outcome = picked ? await withTargets(picked, roll) : await roll();
  if (outcome && inCombat) await recordAttackMade(actor);
  return outcome;
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
  const measured = ranged && !(event as MouseEvent).shiftKey ? measuredShot(actor) : null;
  // The weapon the button belongs to, for the modules' attack options.
  const rolledItemId = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
  const rolledItem = rolledItemId ? actor?.items?.get?.(rolledItemId) ?? null : null;
  const shot = ranged
    ? measured && !aboard
      ? quickShot(measured, weapon)
      : await promptForRangedAttack({
          ...weapon,
          aboard,
          mayFireMounted: mayFireMountedWeapon(actor, aboard),
          initialRange: measured?.rangeYards ?? 0,
          actor,
          item: rolledItem,
          effectiveSkill: base,
        })
    : null;
  if (ranged && shot === null) return null;

  // A melee attack asks only when asked -- shift-click, as every other roll --
  // but when it does ask, it asks about Deceptive Attack and Rapid Strike too,
  // since both are decided before the roll and both cost skill.
  const asksAboutMelee =
    !ranged && rollType === "attack" && (event as MouseEvent).shiftKey;
  const melee = asksAboutMelee
    ? await promptForMeleeAttack({
        effectiveSkill: base,
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
      : await maybePromptModifiers(event);
  if (modifiers === null) return null;

  modifiers.push(...standingRollLines(actor, {
    rollType,
    ranged: Boolean(ranged),
    hitModifier: target.dataset.hitModifier,
    basedOn: target.dataset.basedOn,
    wildSwing: melee?.wildSwing === true,
    dialogAsked: Boolean(melee || shot),
  }));

  // "You must declare that you are using extra effort and spend the required FP
  // before you make your attack" -- and a fighter who cannot pay does not get
  // the option, so the roll is abandoned rather than made on a promise.
  // The eye can be aimed at only from the front or sides (Campaigns p. 552).
  const aimedShot = rollType === "attack" ? (melee?.calledShot ?? shot?.calledShot ?? null) : null;
  const aimedArc = aimedShot ? arcAgainstTarget(actor) : null;
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
  const asEffect = ({ criticalSkill, malfunction, ...rest }: NonNullable<typeof stance>) => ({
    ...rest,
    ...(criticalSkill !== null ? { criticalSkill } : {}),
    ...(malfunction !== null ? { malfunction } : {}),
  });
  const addon = stance && chosenAddon ? mergeAttackEffects([asEffect(chosenAddon), asEffect(stance)]) : (chosenAddon ?? stance);
  if (rollType === "attack") await recordAddonDamage(actor, addon?.damageModifiers ?? []);

  // A setting that spends more than one shot needs the shots to spend
  // (since 1.50.0). Refused rather than fired, because a weapon cannot use
  // rounds it has not got, and the cost is not visible until the option is
  // chosen.
  if (rollType === "attack" && ranged && shot && isRuleOn("reloading")) {
    const extra = Math.max(0, Math.floor(Number(shot.addon?.shots) || 0));
    const modeIndex = Number(target.dataset.modeIndex);
    const ready = extra > 0 && Number.isInteger(modeIndex) ? shotsReady(rolledItem, modeIndex) : null;
    if (ready !== null && shot.shellsFired + extra > ready) {
      ui.notifications?.warn(
        game.i18n.format("GWORLD.Ranged.NotEnoughShots", {
          name: String(rolledItem?.name ?? ""),
          needed: shot.shellsFired + extra,
          ready,
        }),
      );
      return null;
    }
  }

  // Where the blow was aimed travels to the damage roll, which is a separate
  // click: an attack that went for the skull should not have to be told twice.
  if (rollType === "attack") {
    await recordCalledShot(actor, melee?.calledShot ?? shot?.calledShot ?? null);
    await recordTurnedBlade(actor, melee?.turned === true);
    await recordPulledBlow(actor, melee?.pulledSt ?? null);
    if (melee?.charging) await recordCharge(actor);
    await recordStopThrust(actor, melee?.stopThrustBonus ?? 0);
    await recordLance(actor, melee?.lance ?? null);
    // Pellets striking as one mass are a fact about this shot that the damage
    // roll, a separate click, has to be told.
    await recordMassShot(actor, shot?.coneMultiplier ?? null);
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
  // What Evaluate earned and whether this is Move and Attack, which the hook
  // below is told separately; positionRollLines has put their lines in.
  const evaluated = rollType === "attack" && !ranged ? evaluateBonusFor(actor) : 0;
  const movingMelee = rollType === "attack" && !ranged && actor?.system?.maneuver === "moveAndAttack";

  // A module may add to the attack roll and to what the defender faces, with
  // what each line is for.
  const attackRow = target.closest<HTMLElement>("[data-item-id]");
  const attackModeIndex = Number(attackRow?.dataset.modeIndex);
  // A derived mode the character has itself has no item, but still names its mode (API 1.35.0).
  const attackMode = (rolledItem || attackRow?.dataset.derivedMode) && attackRow?.dataset.modeIndex !== undefined && Number.isInteger(attackModeIndex)
    ? { index: attackModeIndex, ranged: attackRow.dataset.ranged === "1", ...(attackRow.dataset.derivedMode ? { derived: attackRow.dataset.derivedMode } : {}) }
    : null;
  const hooked = rollType === "attack"
    ? callCombatHook(COMBAT_HOOKS.attackModifiers, {
        actor,
        item: rolledItem,
        mode: attackMode,
        rollType,
        ranged: Boolean(ranged),
        modifiers,
        defensePenalty: (melee?.defensePenalty ?? 0) + feint,
        defenseModifiers: [...(addon?.defenseModifiers ?? [])],
        dataset: { ...target.dataset },
        // Move and Attack and a Wild Swing both hold skill to 9.
        skillCap: movingMelee || melee?.wildSwing ? WILD_SWING_SKILL_CAP : (null as number | null),
        // Since 1.40.0: whether this is a Wild Swing.
        wildSwing: melee?.wildSwing === true,
        // Where the blow is aimed, and at whom.
        calledShot: (() => {
          const aimedAt = melee?.calledShot ?? shot?.calledShot ?? null;
          return aimedAt ? { hitLocation: aimedAt.hitLocation, addonLocation: aimedAt.addonLocation ?? null, chink: aimedAt.chink === true } : null;
        })(),
        targets: targetedTokens().map((token: any) => token?.actor).filter(Boolean),
        // Since 1.23.0: the tokens themselves, for where the targets stand.
        targetTokens: targetedTokens().filter((token: any) => token?.actor).map((token: any) => token?.document ?? token),
        refusal: null as string | null,
        // Since 1.21.0: the options chosen, and what went into the defense
        // penalty and the roll from a Deceptive Attack, a feint and Evaluate.
        options: { ...(melee?.options ?? shot?.options ?? {}) } as Record<string, unknown>,
        deceptive: melee?.deceptive ?? 0,
        feint,
        evaluate: evaluated,
        // Since 1.27.0: the system's extra effort bought for this attack.
        extraEffort: { flurryOfBlows: melee?.flurryOfBlows === true, mightyBlows: melee?.mightyBlows === true },
      })
    : null;
  // A module's rules may make this attack impossible here: it isn't rolled.
  if (hooked && typeof hooked.refusal === "string" && hooked.refusal.trim()) {
    ui.notifications?.warn(hooked.refusal.trim());
    return null;
  }
  const defensePenalty = Number(hooked?.defensePenalty ?? (melee?.defensePenalty ?? 0) + feint) || 0;

  // A shot taken at a measured range says so on the card, where the number
  // came from being the one thing a player will want to check -- and so does
  // anything a module's option had to say about the attack.
  const noted = [
    ...(addon && addon.reachBonus !== 0 ? [game.i18n.format("GWORLD.Addon.Reach", { yards: addon.reachBonus > 0 ? `+${addon.reachBonus}` : addon.reachBonus })] : []),
    // What a setting cost the weapon, beside what it was worth to the roll
    // (since 1.50.0): rounds spent, a Malf. of its own, a halved Rate of Fire.
    ...(addon && addon.shots > 0 ? [game.i18n.format("GWORLD.Addon.ExtraShots", { shots: addon.shots })] : []),
    ...(addon && addon.malfunction !== null ? [game.i18n.format("GWORLD.Addon.Malfunction", { number: addon.malfunction })] : []),
    ...(addon && addon.rateOfFireMultiplier !== 1 && shot?.rateOfFire
      ? [game.i18n.format("GWORLD.Addon.RateOfFire", { rof: shot.rateOfFire })]
      : []),
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

  const outcome = await rollSuccess({
    actor,
    base,
    label,
    kind: rollKind(rollType),
    // The attribute a skill or attribute roll is based on, as a tag a condition's rolls can name (API 1.42.0).
    ...(target.dataset.basedOn ? { tags: [String(target.dataset.basedOn)] } : {}),
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
            techLevel: Number(actor?.system?.tl) || 3,
            revolver: target.dataset.revolver === "1",
          },
        }
      : {}),
    // Only a burst needs its hits counted; a single shot either hits or does
    // not, and saying "1 hit" on every arrow would be noise. A spread of
    // pellets counts as a burst at Rcl 1, however many shells were fired.
    ...(shot && shot.shotsFired > 1
      ? { rapidFire: { shotsFired: shot.shotsFired, recoil: shot.recoil } }
      : {}),
    ...(shot?.dodgeBonus ? { dodgeBonus: shot.dodgeBonus } : {}),
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

  // The shells fired come off the weapon's count (Campaigns p. 373).
  if (rollType === "attack" && ranged && shot && isRuleOn("reloading")) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? actor?.items?.get(id) : null;
    const modeIndex = Number(target.dataset.modeIndex);
    // "shots" on an option is what a setting spends beyond the shells fired.
    const spent = shot.shellsFired + Math.max(0, Math.floor(Number(shot.addon?.shots) || 0));
    if (item?.isOwner && Number.isInteger(modeIndex)) await spendShots(item, modeIndex, spent);
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

  return outcome;
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
): RangedShot {
  // One shell, however many pellets are in it, and no aim unless the shooter
  // is on an Aim maneuver -- in which case its turns are what they are.
  const pellets = multipleProjectiles({
    shotsFired: 1,
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
    shellsFired: 1,
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
  /** What the modules' attack options chosen in the dialog add up to. */
  addon?: ReturnType<typeof applyAttackOptions>;
  /**
   * Rate of Fire after an option halved it (Campaigns p. 408), which is what
   * the shells asked for were capped by.
   */
  rateOfFire?: number;
}

/** The context a module's attack option is shown and applied with. */
function attackContextFor(options: {
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
export async function promptForRangedAttack(options: {
  /** What the weapon does, which decides where it can be aimed. */
  damageType: DamageType;
  accuracy: number;
  scopeBonus: number;
  rateOfFire: number;
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
  mayFireMounted?: boolean;
  /** A range already measured off the map, to start the field at. */
  initialRange?: number;
  /** The shooter and the weapon, for the modules' attack options. */
  actor?: any;
  item?: any;
  /** The skill being rolled, for the modules' attack options. */
  effectiveSkill?: number;
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
  const scope = scopeBonus({ bonus: options.scopeBonus, secondsAimed: turnsAimed });
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
  const loaded = options.loaded ?? null;
  const rateOfFire = Math.max(1, Math.min(
    isRuleOn("rapidFire") ? Math.max(1, Math.floor(options.rateOfFire)) : 1,
    loaded === null ? Infinity : loaded,
  ));
  const shotsField =
    rateOfFire > 1 ? field("shots", `${L("Shots")} (1-${rateOfFire})`, "1") : "";

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
      </fieldset>`
    : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${field("range", L("Range"), String(options.initialRange ?? 0))}
      ${field("elevation", L("Elevation"), "0")}
      ${field("speed", L("TargetSpeed"), "0")}
      ${field("size", L("TargetSize"), "0")}
      ${shotsField}
      ${calledShotField(options.damageType, false, options.actor)}
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
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="laser"><span>${L("LaserSight")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="laserSeen"><span>${L("LaserSeen")}</span>
      </label>
      ${vehicleFields}
      ${attackOptionFields(addonContext)}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
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
          shots: rateOfFire > 1 ? num("shots") : 1,
          situation: situation as RangedInput["situation"],
          sight,
          darkness: num("darkness"),
          cover: cover as CoverApproach | "none",
          calledShot,
          aimed,
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
              }
            : null,
        };
      },
    },
    rejectClose: false,
  });

  if (!result || typeof result !== "object") return null;

  const input = result as RangedInput & { calledShot?: string; addonValues?: Record<string, unknown> };
  // The options are read first: one of them may halve the Rate of Fire
  // (Campaigns p. 408), which the dialog's own field could not know when it
  // was drawn, so the shots asked for are capped by what is left of it.
  const chosenOptions = applyAttackOptions(addonContext, input.addonValues ?? {});
  const effectiveRateOfFire = Math.max(
    1,
    Math.floor(rateOfFire * (chosenOptions.rateOfFireMultiplier > 0 ? chosenOptions.rateOfFireMultiplier : 1)),
  );
  // A weapon cannot fire more shots than its Rate of Fire, nor fewer than one.
  const shellsFired = Math.min(effectiveRateOfFire, Math.max(1, Math.floor(input.shots || 1)));

  // Each shell may be several pellets, which count as shots of their own.
  const pellets = multipleProjectiles({
    shotsFired: shellsFired,
    projectiles: options.projectiles ?? 1,
    recoil: options.recoil,
    rangeYards: input.range,
    halfDamageRange: options.halfDamageRange ?? 0,
  });

  const aimed = calledShotModifier(input.calledShot ?? UNAIMED, options.damageType, false, options.actor);
  const modifiers = rangedModifiers({ ...input, shots: pellets.effectiveShots }, options);
  if (aimed.modifier) modifiers.push(aimed.modifier);
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
  /** A laser sight in use, and whether the target has seen its dot (p. 411). */
  laser?: { on: boolean; targetSees: boolean } | null;
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
    });
  }
  if (size !== 0) modifiers.push({ label: L("TargetSize"), value: size });

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
    modifiers.push({ label: L("Bulk"), value: bulkPenalty(weapon.bulk, situation) });
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
  if (accuracyApplies({ guidance, aimed: deliberatelyAimed, secondsInFlight: flight.seconds })) {
    // Aimed on the sheet: Accuracy, the second and third turns, the bracing.
    // Aimed by the checkbox alone: Accuracy, as one turn's aim is worth.
    const aimedFor = deliberatelyAimed ? Math.max(1, weapon.aim?.turns ?? 0) : 1;
    const aiming = aimBonus({
      turnsAimed: aimedFor,
      accuracy:
        weapon.accuracy + scopeBonus({ bonus: weapon.scopeBonus, secondsAimed: aimedFor }),
      braced: deliberatelyAimed ? (weapon.aim?.braced ?? false) : false,
    });
    if (aiming.accuracy !== 0) modifiers.push({ label: L("Accuracy"), value: aiming.accuracy });
    if (aiming.extraTurns !== 0) modifiers.push({ label: L("AimedLonger"), value: aiming.extraTurns });
    if (aiming.braced !== 0) modifiers.push({ label: L("Braced"), value: aiming.braced });

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
    if (dot.toHit !== 0) modifiers.push({ label: L("LaserSight"), value: dot.toHit });
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
  // Somebody blind attacks blind whatever the light, at the practised -6.
  if (eyes.blindness) {
    return {
      label: game.i18n.localize("GWORLD.Sight.Blindness"),
      value: attackWithoutSight({ sight: "blind", accustomedToBlindness: true }).modifier,
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
function darknessModifier(darkness: number, eyes: Eyes = {}): RollModifier | null {
  if (eyes.blindness) return null;
  const value = darknessPenalty(darkness, eyes);
  if (value === 0) return null;
  return { label: game.i18n.localize("GWORLD.Sight.Darkness"), value };
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
  const dualAllowed = isRuleOn("dualWeaponAttack");
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
      ${dualAllowed
        ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
             <span>${game.i18n.localize("GWORLD.Melee.DualWeapon")}</span>
             <select name="dual" style="width:150px">
               <option value="no">${game.i18n.localize("GWORLD.Melee.DualNone")}</option>
               <option value="primary">${game.i18n.localize("GWORLD.Melee.DualPrimary")}</option>
               <option value="off">${game.i18n.localize("GWORLD.Melee.DualOff")}</option>
             </select>
           </label>`
        : ""}
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
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
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
          dual: form?.querySelector<HTMLSelectElement>('select[name="dual"]')?.value ?? "no",
          charging: ticked("charging"),
          pullSt: num("pullSt"),
          lanceSt: num("lanceSt"),
          lanceYards: num("lanceYards"),
          jousting: ticked("jousting"),
          wildSwing: ticked("wildSwing"),
          stopThrustYards: num("stopThrustYards"),
        };
      },
    },
    rejectClose: false,
  });

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
    dual: string;
    charging: boolean;
    pullSt: number;
    lanceSt: number;
    lanceYards: number;
    jousting: boolean;
  };

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
  if (dual === "primary" || dual === "off") {
    const both = dualWeaponAttack({
      technique: options.dualWeaponTechnique ?? 0,
      ambidextrous: options.ambidextrous === true,
      offHandTraining: options.offHandTraining ?? 0,
    });
    modifiers.push({
      label: game.i18n.localize(dual === "off" ? "GWORLD.Melee.DualOff" : "GWORLD.Melee.DualPrimary"),
      value: dual === "off" ? both.offHand : both.primary,
    });
  }

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

  const mightyBlows = mighty && effortAllowed;
  return {
    wildSwing: wildSwing === true,
    stopThrustBonus: options.stopThrust ? stopThrustBonus(stopThrustYards) : 0,
    addon,
    options: addonValues ?? {},
    deceptive: deception.defensePenalty,
    modifiers,
    defensePenalty: deception.defensePenalty + groundPenalty,
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
  const { damageFormula, damageType, damageLabel, armorDivisor } = target.dataset;
  if (!damageFormula || !damageType) return;
  // The row the damage was rolled from names the weapon, which a module's
  // hooks may want to know.
  const itemRow = target.closest<HTMLElement>("[data-item-id]");
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
  // Pellets that struck as one mass, recorded by the attack roll.
  const mass = await consumeMassShot(actor);
  // A target past 1/2D, recorded by the attack roll too.
  const halved = await consumeHalfDamage(actor);

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
      ...(pulled ? [game.i18n.format("GWORLD.Subdue.PulledTo", { st: pulledSt })] : []),
      ...(couched
        ? [game.i18n.format(couched.maxDamage ? "GWORLD.Mounted.JoustingLabel" : "GWORLD.Mounted.LanceLabel", {
            st: lance?.mountSt, yards: lance?.yards, max: couched.maxDamage,
          })]
        : []),
      ...(struck ? [game.i18n.localize("GWORLD.Subdue.Turned")] : []),
    ].join(" \u2014 "),
    formula: struck ? formatDiceAdds(struck.damage) : baseFormula,
    damageType: struck ? struck.type : couched ? couched.type : (damageType as DamageType),
    armorDivisor: Number(armorDivisor) || 1,
    ...(aimed ? { calledShot: aimed } : {}),
    ...(mass > 1 ? { massMultiplier: mass } : {}),
    ...(halved ? { halfDamage: true } : {}),
    ...(target.dataset.material ? { material: target.dataset.material } : {}),
    ...(target.dataset.ignoresDr === "1" ? { ignoresDr: true } : {}),
    ...(target.dataset.incendiary === "1" ? { incendiary: true } : {}),
    ...(target.dataset.radiation === "1" ? { radiation: true } : {}),
    ...(target.dataset.doubleKnockback === "1" ? { doubleKnockback: true } : {}),
    ...(target.dataset.noKnockback === "1" ? { noKnockback: true } : {}),
    ...(item ? { item } : {}),
    ...(mode ? { mode } : {}),
    ...(strikingPart(target.dataset.naturalKey ?? "") ? { strikingPart: strikingPart(target.dataset.naturalKey ?? "") } : {}),
    explosive: target.dataset.explosive === "1",
    fragmentation: target.dataset.fragmentation ?? "",
    modifiers,
  });
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
async function maybePromptModifiers(event: Event): Promise<RollModifier[] | null> {
  if (!(event as MouseEvent).shiftKey) return [];

  const value = await promptForModifier();
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
