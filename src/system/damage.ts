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

import { wornDrAt, type ArmorPiece } from "../rules/armor.js";
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
}

/** What applying a blow did. */
export interface AppliedDamage {
  actorName: string;
  hitLocation: HitLocation;
  /** DR from worn armour alone, before the location's own is added. */
  wornDr: number;
  /** DR actually subtracted, after the location's own and the divisor. */
  effectiveDr: number;
  penetrating: number;
  woundingModifier: number;
  injury: number;
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
    }));
}

/**
 * Works out what a blow does to an actor, without writing anything.
 *
 * Separate from applying it so the numbers can be shown before -- or without --
 * changing the sheet, and so the arithmetic can be checked without a Foundry
 * document to write to.
 */
export function resolveDamageAgainst(actor: any, damage: IncomingDamage): AppliedDamage {
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };

  const traits = traitsOf(actor);

  // Damage Resistance is the target's own, under whatever they are wearing:
  // "each point of DR stops one point of basic damage", the same as armour.
  const wornDr = wornDrAt(wornArmor(actor), damage.hitLocation, damage.type)
    + traits.damageResistance;

  // A blow that found a chink meets half the armour. It is applied to the worn
  // figure rather than inside the pipeline because natural DR is not armour
  // with gaps in it -- "joints or weak points in a suit of armor".
  const armour = damage.chink ? chinkDr(wornDr) : wornDr;

  // A critical can double or triple the blow, or replace the roll with the
  // most the dice could have given. All of that happens to basic damage, before
  // DR and before the wounding modifier.
  const critical = damage.critical?.entry.damage;
  const basicDamage = criticalBasicDamage({
    rolled: damage.basicDamage,
    maximum: damage.maxDamage ?? damage.basicDamage,
    ...(critical ? { damage: critical } : {}),
  });

  // computeInjury adds the location's own natural DR itself, so it is given the
  // worn figure alone. maxHp is what caps injury to a limb at the point the
  // limb is crippled.
  const result = computeInjury({
    basicDamage,
    dr: armour,
    type: damage.type,
    armorDivisor: damage.armorDivisor,
    hitLocation: damage.hitLocation,
    maxHp: Number(hp.max) || 0,
    // Halving or ignoring DR is the critical's doing and belongs inside the
    // pipeline, because the tables halve what is left after the armour divisor.
    ...(critical ? { critical } : {}),
  });

  // Fatigue comes off FP, and the consequences that follow -- shock, major
  // wounds, death checks -- are read against the pool it actually cost.
  const pool = result.costsFatigue ? fp : hp;
  const previous = Number(pool.value) || 0;
  const max = Number(pool.max) || 0;
  const applied = applyInjury(result.injury, previous, max);

  // Knockback is worked out from damage before DR, and a crushing blow causes
  // it whether or not it got through (p. 378).
  const shoved = knockback({
    basicDamage,
    type: damage.type,
    penetratedDr: result.penetrating > 0,
    targetStrength: Number(actor?.system?.attributes?.ST) || Number(hp.max) || 10,
  });

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

  return {
    actorName: String(actor?.name ?? ""),
    hitLocation: damage.hitLocation,
    wornDr: armour,
    effectiveDr: result.effectiveDr,
    penetrating: result.penetrating,
    woundingModifier: result.woundingModifier,
    injury: result.injury,
    excessLost: result.excessLost,
    crippled: result.crippled,
    costsFatigue: result.costsFatigue,
    previous,
    current: applied.currentHp,
    max,
    consequences,
    basicDamage,
    critical: damage.critical ?? null,
    knockback: shoved,
    naturalDr: traits.damageResistance,
    htModifiers: {
      knockdown: traits.knockdown,
      consciousness: traits.consciousness,
      survival: traits.survival,
    },
    knockdown: required
      ? {
          required: true,
          modifier: knockdownModifier({
            majorWound: consequences.majorWound,
            hitLocation: damage.hitLocation,
            shock: consequences.shock,
            traitModifier: traits.knockdown,
          }),
        }
      : null,
    bleeds: result.injury > 0 && woundBleeds(damage.type, consequences.majorWound),
  };
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

  const resolved = resolveDamageAgainst(actor, damage);
  if (resolved.injury === 0) return resolved;

  const path = resolved.costsFatigue ? "system.fp.value" : "system.hp.value";
  await actor.update({ [path]: resolved.current });
  return resolved;
}
