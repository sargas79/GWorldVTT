/**
 * Applying damage to a target (GURPS Basic Set: Characters pp. 378-380).
 *
 * The rules engine already does the arithmetic: `computeInjury` takes basic
 * damage through DR, the armour divisor and the wounding modifier, and
 * `applyInjury` turns the result into a new HP total and everything that
 * follows from it. What lives here is the Foundry half -- reading a target's
 * worn armour, writing the new total back, and saying what happened.
 *
 * DR is resolved against the damage type actually being applied rather than
 * the figure the sheet shows. The sheet leads with each location's highest
 * band, which is the right thing to show a player, but mail is DR 4 against a
 * blade and DR 2 against a mace, and applying the headline would stop a mace
 * with the DR that stops a sword.
 */

import { parseVulnerability, vulnerabilityMultiplier, type Vulnerability } from "../rules/vulnerability.js";
import { type ArmorPiece } from "../rules/armor.js";
import { armorLayers, bluntTraumaInjury } from "../rules/layered-armor.js";
import type { Arc } from "../rules/tactical.js";
import { isRuleOn } from "./optional-rules.js";
import {
  criticalBasicDamage,
  criticalShock,
  type CriticalEntry,
  type CriticalTable,
} from "../rules/criticals.js";
import { computeInjury } from "../rules/damage.js";
import type { HitLocation } from "../rules/hit-locations.js";
import { applyInjury, type InjuryConsequences } from "../rules/injury.js";
import { knockback, type KnockbackResult } from "../rules/maneuvers.js";
import { knockdownModifier, knockdownRequired } from "../rules/knockdown.js";
import { chinkDr } from "../rules/melee-situations.js";
import { woundBleeds } from "../rules/bleeding.js";
import {
  noTraitEffects,
  shockAfterTraits,
  type TraitEffects,
} from "../rules/trait-effects.js";
import type { DamageType } from "../rules/types.js";
import { attributeOf } from "./attributes.js";
import { loseAim } from "./aim.js";
import { syncHealthConditions } from "./conditions.js";
import { hasInjuryTolerance } from "../rules/injury-tolerance.js";
import {
  cannonFodderCollapses, cinematicExplosionInjury, knockbackStunPenalty,
} from "../rules/cinematic.js";
import { isCannonFodder } from "./cinematic.js";
import { COMBAT_HOOKS, callCombatHook, locationOverrides } from "./combat-extensions.js";

/** A critical hit, already rolled for on one of the tables. */
export interface CriticalHit {
  table: CriticalTable;
  /** The 3d rolled on that table. */
  roll: number;
  entry: CriticalEntry;
}

/** A blow about to land. */
export interface IncomingDamage {
  /** Damage rolled, after the minimum-damage floor. */
  basicDamage: number;
  type: DamageType;
  /** Above 1 it divides the target's DR; below 1 it multiplies it. */
  armorDivisor: number;
  hitLocation: HitLocation;
  /**
   * A location a module registered, as `<module>.<key>`. `hitLocation` is
   * then its parent, which supplies the armour and anything it doesn't change.
   */
  addonLocation?: string | null;
  /**
   * The most the damage dice could have come up, for the critical results that
   * substitute maximum damage for what was rolled.
   */
  maxDamage?: number;
  /** A critical hit, whose table entry may multiply damage or halve DR. */
  critical?: CriticalHit;
  /**
   * True when the blow found a gap in the armour, which halves the DR it meets
   * (Campaigns p. 400) -- after the armour divisor, and on top of anything a
   * critical did to it.
   */
  chink?: boolean;
  /**
   * A shotgun's pellets striking as one mass multiply the target's DR as
   * well as the damage (Campaigns p. 409). One for every other blow.
   */
  drMultiplier?: number;
  /**
   * True when this is a blast and Cinematic Explosions is in play (p. 417).
   * The rolled figure then buys knockback and nothing else, and what the
   * victim loses is a token point a yard.
   */
  cinematicBlast?: boolean;
  /** What the weapon is made of, for a Vulnerability to silver (Characters p. 161). */
  material?: string;
  /**
   * True when "the target's DR has no effect" (Characters p. 106): a
   * Malediction. Worn armour, the target's own DR and a location's all count
   * for nothing.
   */
  ignoresDr?: boolean;
  /** The item the blow was rolled from, where the card knows it. */
  itemUuid?: string;
  /**
   * The arc the blow came from, where the table is playing with facing.
   * Armour marked "F" protects against the front alone (Characters p. 282);
   * null means no facing is in play, and every blow meets it.
   */
  arc?: Arc | null;
}

/** What applying a blow did. */
export interface AppliedDamage {
  actorName: string;
  hitLocation: HitLocation;
  /** A module's location struck, as `<module>.<key>`, or null. */
  addonLocation: string | null;
  /** DR from worn armour alone, before the location's own is added. */
  wornDr: number;
  /** DR actually subtracted, after the location's own and the divisor. */
  effectiveDr: number;
  penetrating: number;
  woundingModifier: number;
  injury: number;
  /**
   * Injury from blunt trauma through flexible armour (Campaigns p. 379),
   * which is included in `injury` and stated apart because it is not a
   * wound: no wounding modifier was applied to it.
   */
  bluntTrauma: number;
  /** Injury discarded because it exceeded a limb's crippling threshold. */
  excessLost: number;
  crippled: boolean;
  /** True when the loss came off Fatigue Points rather than Hit Points. */
  costsFatigue: boolean;
  previous: number;
  current: number;
  max: number;
  consequences: InjuryConsequences;
  /** Basic damage after a critical multiplied or maximised it. */
  basicDamage: number;
  critical: CriticalHit | null;
  /** How far the blow shoves the target, and what that costs them to stay up. */
  knockback: KnockbackResult;
  /** DR the target has of their own, under whatever they are wearing. */
  naturalDr: number;
  /**
   * Modifiers the target's traits give to the HT rolls this blow calls for --
   * knockdown, staying conscious, staying alive. The rolls themselves are the
   * GM's; what the traits are worth to them is not.
   */
  htModifiers: { knockdown: number; consciousness: number; survival: number };
  /**
   * The knockdown roll this blow calls for, or null when it calls for none.
   * A major wound calls for one wherever it landed; a blow to the head or
   * vitals calls for one as soon as it causes any shock at all.
   */
  knockdown: { required: boolean; modifier: number } | null;
  /** True when a wound of this kind would bleed, which the GM may overrule. */
  bleeds: boolean;
  /**
   * The IQ roll Cinematic Knockback asks of anyone thrown about (p. 417),
   * or null when the rule is off or the blow shoved nobody.
   */
  knockbackStun: { required: boolean; penalty: number } | null;
  /** True when the injury is the token point a yard of a cinematic blast. */
  cinematicBlast: boolean;
  /**
   * True when this blow simply put a mook down (Campaigns p. 417). Nothing
   * about the wound is worth reporting then: "don't bother keeping track of
   * HP!"
   */
  collapsed: boolean;
}

/**
 * What a target's own traits do to a blow, read off their derived data.
 *
 * Falls back to nothing at all, so that a blow can be resolved against a plain
 * object -- a token with no prepared data, or a test.
 */
export function traitsOf(actor: any): TraitEffects {
  const effects = actor?.system?.derived?.traitEffects;
  return effects ? { ...noTraitEffects(), ...effects } : noTraitEffects();
}

/** The armour a target is actually wearing, as the rules engine wants it. */
export function wornArmor(actor: any): ArmorPiece[] {
  const items: any[] = [...(actor?.items ?? [])];
  return items
    .filter((item) => item.type === "armor" && item.system?.equipped)
    .map((item) => ({
      dr: Number(item.system?.dr ?? 0),
      drSplit: item.system?.drSplit ?? null,
      drSplitAppliesTo: item.system?.drSplitAppliesTo ?? [],
      locations: item.system?.locations ?? [],
      flexible: item.system?.flexible === true,
      frontOnly: item.system?.frontOnly === true,
      concealable: item.system?.concealable === true,
    }));
}

/**
 * Works out what a blow does to an actor, without writing anything.
 *
 * Separate from applying it so the numbers can be shown before -- or without --
 * changing the sheet, and so the arithmetic can be checked without a Foundry
 * document to write to.
 */
/**
 * The Vulnerabilities an actor has, read off their traits (Characters p. 161).
 * The name carries the form and the multiplier -- "Vulnerability (Silver x4)"
 * -- and so do any notes on it, for a trait whose name was left plain.
 */
export function vulnerabilitiesOf(actor: any): Vulnerability[] {
  const found: Vulnerability[] = [];
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait") continue;
    const name = String(item.name ?? "");
    if (!/vulnerab/i.test(name)) continue;
    const read = parseVulnerability(name) ?? parseVulnerability(String(item.system?.notes ?? ""));
    if (read) found.push(read);
  }
  return found;
}

export function resolveDamageAgainst(actor: any, damage: IncomingDamage): AppliedDamage {
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };

  const traits = traitsOf(actor);

  // Damage Resistance is the target's own, under whatever they are wearing:
  // "each point of DR stops one point of basic damage", the same as armour.
  // A breastplate marked "F" counts against a blow from the front alone
  // (Characters p. 282), so the arc it came from is read here; the layers
  // are kept apart because blunt trauma only counts what got past the rigid.
  // Hooves armour the feet and nothing else (Characters p. 42).
  const naturalDr = traits.damageResistance + (damage.hitLocation === "foot" ? traits.footDr : 0);
  const worn = wornArmor(actor);
  const arc = isRuleOn("frontArmor") ? (damage.arc ?? null) : null;
  const layers = armorLayers(worn, damage.hitLocation, damage.type, arc);
  const wornDr = layers.totalDr + naturalDr;

  // A blow that found a chink meets half the armour. It is applied to the worn
  // figure rather than inside the pipeline because natural DR is not armour
  // with gaps in it -- "joints or weak points in a suit of armor".
  const drMultiplier = Math.max(1, Math.floor(Number(damage.drMultiplier ?? 1)));
  const armour = damage.ignoresDr ? 0 : (damage.chink ? chinkDr(wornDr) : wornDr) * drMultiplier;

  // A critical can double or triple the blow, or replace the roll with the
  // most the dice could have given. All of that happens to basic damage, before
  // DR and before the wounding modifier.
  const critical = damage.critical?.entry.damage;
  const basicDamage = criticalBasicDamage({
    rolled: damage.basicDamage,
    maximum: damage.maxDamage ?? damage.basicDamage,
    ...(critical ? { damage: critical } : {}),
  });

  // A location a module registered changes what it says it changes -- the
  // wounding modifier, the crippling threshold, DR of its own, the knockdown
  // roll -- and takes everything else from the Basic Set location it is part of.
  const overrides = locationOverrides(damage.addonLocation, damage.type, Number(hp.max) || 0);

  // computeInjury adds the location's own natural DR itself, so it is given the
  // worn figure alone. maxHp is what caps injury to a limb at the point the
  // limb is crippled.
  const result = computeInjury({
    basicDamage,
    dr: armour + (damage.ignoresDr ? 0 : (overrides?.extraDr ?? 0)),
    ...(overrides && overrides.woundingModifier !== null ? { woundingOverride: overrides.woundingModifier } : {}),
    ...(overrides && overrides.cripplingThreshold !== undefined ? { cripplingThreshold: overrides.cripplingThreshold } : {}),
    type: damage.type,
    armorDivisor: damage.armorDivisor,
    hitLocation: damage.hitLocation,
    maxHp: Number(hp.max) || 0,
    // Halving or ignoring DR is the critical's doing and belongs inside the
    // pipeline, because the tables halve what is left after the armour divisor.
    ...(critical ? { critical } : {}),
    // A Malediction ignores the location's own DR as well as the armour's,
    // which is the one place the pipeline already knows how to drop it all.
    ...(damage.ignoresDr ? { critical: { ...(critical ?? {}), ignoreDr: true } } : {}),
    // A body that is not flesh is hurt as its substance allows.
    ...(hasInjuryTolerance(traits.injuryTolerance) ? { tolerance: traits.injuryTolerance } : {}),
    // And a body with a Vulnerability is hurt worse by the thing it fears.
    vulnerability: vulnerabilityMultiplier({
      vulnerabilities: vulnerabilitiesOf(actor),
      ...(damage.material ? { material: damage.material } : {}),
      damageType: damage.type,
    }),
  });

  // Fatigue comes off FP, and the consequences that follow -- shock, major
  // wounds, death checks -- are read against the pool it actually cost.
  // "An attack that does crushing, cutting, impaling, or piercing damage may
  // inflict 'blunt trauma' if it fails to penetrate flexible DR" (Campaigns
  // p. 379), and only what got past anything rigid over it counts.
  const trauma =
    isRuleOn("bluntTrauma") && result.penetrating <= 0
      ? bluntTraumaInjury({
          reachingFlexible: Math.max(0, basicDamage - layers.rigidDr - naturalDr),
          flexibleDr: layers.flexibleDr,
          type: damage.type,
        })
      : 0;

  // Knockback is worked out from damage before DR, and a crushing blow causes
  // it whether or not it got through (p. 378). It comes before the injury
  // because under Cinematic Explosions the injury is worked out from it.
  const shoved = knockback({
    basicDamage,
    type: damage.type,
    penetratedDr: result.penetrating > 0,
    targetStrength: attributeOf(actor, "ST", Number(hp.max) || 10),
    cinematic: isRuleOn("cinematicKnockback"),
  });

  const pool = result.costsFatigue ? fp : hp;
  const previous = Number(pool.value) || 0;
  const max = Number(pool.max) || 0;
  // "Explosions do no direct damage! Ignore fragmentation, too... Every yard
  // of knockback from a cinematic explosion causes a token 1 HP of crushing
  // damage" (p. 417). Whatever the pipeline made of the blast is thrown away:
  // it was only ever there to say how far the victim flew.
  const blast = damage.cinematicBlast === true;
  // Blunt trauma "is actual injury, not basic damage. There is no wounding
  // multiplier", so it is added after the pipeline rather than inside it.
  const injury = blast ? cinematicExplosionInjury(shoved.yards) : result.injury + trauma;
  const applied = applyInjury(injury, previous, max, { unkillable: traits.unkillable });

  // Two of the critical results change what follows from the injury rather than
  // the injury itself: one doubles shock past its usual floor, and the others
  // make a major wound of anything that penetrates, however little.
  const consequences: InjuryConsequences = {
    ...applied,
    // High Pain Threshold feels no shock at all and Low Pain Threshold feels it
    // twice; a critical's doubling is applied to whatever that left.
    shock: criticalShock(shockAfterTraits(applied.shock, traits), critical),
    majorWound:
      applied.majorWound || Boolean(critical?.majorWound && result.penetrating > 0),
  };

  const required = knockdownRequired({
    majorWound: consequences.majorWound,
    hitLocation: damage.hitLocation,
    shock: consequences.shock,
  });

  const record: AppliedDamage = {
    actorName: String(actor?.name ?? ""),
    hitLocation: damage.hitLocation,
    addonLocation: overrides ? (damage.addonLocation ?? null) : null,
    wornDr: armour,
    effectiveDr: result.effectiveDr,
    penetrating: result.penetrating,
    woundingModifier: result.woundingModifier,
    injury,
    // A cinematic blast threw the pipeline's figure away, and everything that
    // followed from it goes with it: a limb is not crippled, and nothing is
    // lost over the crippling threshold, by a wound the rule says never
    // happened.
    bluntTrauma: blast ? 0 : trauma,
    excessLost: blast ? 0 : result.excessLost,
    crippled: blast ? false : result.crippled,
    costsFatigue: result.costsFatigue,
    previous,
    current: applied.currentHp,
    max,
    consequences,
    basicDamage,
    critical: damage.critical ?? null,
    knockback: shoved,
    // Being blasted off your feet leaves you reeling (p. 417). The roll is the
    // victim's to make; what it is at is not.
    knockbackStun:
      isRuleOn("cinematicKnockback") && shoved.yards > 0
        ? { required: true, penalty: knockbackStunPenalty(shoved.yards) }
        : null,
    cinematicBlast: blast,
    naturalDr,
    // Fit's "+1 to all HT rolls" goes on each of the three (Characters p. 55).
    htModifiers: {
      knockdown: traits.knockdown + traits.htRolls,
      consciousness: traits.consciousness + traits.htRolls,
      survival: traits.survival + traits.htRolls,
    },
    knockdown: required
      ? {
          required: true,
          modifier: knockdownModifier({
            majorWound: consequences.majorWound,
            hitLocation: damage.hitLocation,
            shock: consequences.shock,
            traitModifier: traits.knockdown + traits.htRolls,
          }) + (overrides?.knockdown ?? 0),
        }
      : null,
    // Nothing bleeds that has no blood, and nothing bleeds from a cinematic
    // blast: what it cost was a token point a yard for being thrown about,
    // not an open wound. "All a blast does is disarray clothing, blacken
    // faces, and ... cause knockback" (p. 417).
    bleeds:
      !blast &&
      result.injury > 0 &&
      !traits.injuryTolerance.noBlood &&
      woundBleeds(damage.type, consequences.majorWound),
    collapsed: false,
  };

  // "They collapse (unconscious or dead) if any penetrating damage gets
  // through DR ... In any event, don't bother keeping track of HP!" (p. 417).
  // A mook is not wounded by degrees, so nothing that follows from a wound
  // follows here: no shock, no major wound, no roll to stay standing. The
  // first thing that gets through is the last thing that happens to them, and
  // whether it killed them is the GM's to say.
  if (isCannonFodder(actor) && cannonFodderCollapses(result.penetrating)) {
    return {
      ...record,
      // What they lost is whatever they had. A mook already at or below zero
      // loses nothing further: they were down before this landed.
      injury: Math.max(0, previous),
      current: 0,
      consequences: {
        ...consequences,
        shock: 0,
        majorWound: false,
        consciousnessRollRequired: false,
        deathCheckRequired: false,
      },
      knockdown: null,
      bleeds: false,
      collapsed: true,
    };
  }

  return record;
}

/**
 * Applies a blow to an actor and writes the new total.
 *
 * Returns null when this user may not change that actor. Foundry refuses the
 * update anyway, but it refuses it with a permission error in the console
 * rather than something the GM can act on, so the check is made here.
 */
export async function applyDamageToActor(
  actor: any,
  damage: IncomingDamage,
): Promise<AppliedDamage | null> {
  if (!actor?.isOwner) return null;

  // A module may change the blow before it is worked out: where it lands,
  // how hard, what it meets.
  const item = damage.itemUuid ? (fromUuidSync(damage.itemUuid) ?? null) : null;
  const incoming = callCombatHook(COMBAT_HOOKS.injury, { actor, item, damage: { ...damage } }).damage;

  const resolved = resolveDamageAgainst(actor, incoming);
  if (resolved.injury === 0 && !resolved.collapsed) {
    callCombatHook(COMBAT_HOOKS.afterDamage, { actor, item, damage: incoming, result: resolved });
    return resolved;
  }

  const path = resolved.costsFatigue ? "system.fp.value" : "system.hp.value";
  await actor.update({ [path]: resolved.current });
  // "If you are injured while aiming ... you lose your aim."
  await loseAim(actor, "injured");
  // And what it did, for a module with something that follows from it.
  callCombatHook(COMBAT_HOOKS.afterDamage, { actor, item, damage: incoming, result: resolved });
  return resolved;
}

/** Injury or fatigue taken off outside a damage card. */
export interface InjuryTaken {
  pool: "hp" | "fp";
  from: number;
  to: number;
  label: string;
}

/**
 * Takes a figure of injury, or of fatigue, straight off an actor: no DR, no
 * wounding modifier, no card. What follows from the new total follows as it
 * would from a blow -- the health conditions are brought into step, and an
 * injury spoils an aim (p. 364).
 *
 * Returns null when this user may not change the actor, or the amount isn't a
 * positive number.
 */
export async function takeInjury(
  actor: any,
  options: { amount: number; fatigue?: boolean; label?: string },
): Promise<InjuryTaken | null> {
  const amount = Math.floor(Number(options?.amount));
  if (!actor?.isOwner || !(amount > 0)) return null;

  const pool = options.fatigue ? "fp" : "hp";
  const from = Number(actor.system?.[pool]?.value) || 0;
  const to = from - amount;
  await actor.update({ [`system.${pool}.value`]: to });
  if (pool === "hp") await loseAim(actor, "injured");
  await syncHealthConditions(actor);
  return { pool, from, to, label: String(options.label ?? "") };
}
