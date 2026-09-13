/**
 * Weapons that tie somebody up, and one that sets them on fire (GURPS Basic
 * Set: Campaigns pp. 410-411).
 *
 * Four special ranged weapons, three of which end with the target unable to
 * move and one of which ends with them burning. What they share is that none
 * of them is settled by the damage roll: a bolas that hits does almost nothing
 * until somebody fails to get out of it.
 */

import type { DiceAdds } from "./types.js";

// ── bolas (p. 410) ──────────────────────────────────────────────────────────

/** "To escape, the victim requires a free hand, and must make three successful DX rolls." */
export const BOLAS_ESCAPE_ROLLS = 3;

/** What kind of limbs are trying to get out of it. */
export type Limbs = "hands" | "paws" | "hooves";

/**
 * The modifier on a roll to get out of a bolas (p. 410).
 *
 * "Animals roll to escape at -3 for paws or at -6 for hooves."
 */
export function bolasEscapeModifier(limbs: Limbs): number {
  return limbs === "hooves" ? -6 : limbs === "paws" ? -3 : 0;
}

/** Whether a defense works against a bolas, and what it costs to try (p. 410). */
export type EntanglingDefense = "dodge" | "block" | "parry";

export interface EntanglingDefenseResult {
  /** True when the defense may be attempted at all. */
  allowed: boolean;
  /** True when a failed attempt hands the weapon the parrying arm. */
  snaresTheArm: boolean;
  /** True when a successful cutting parry ruins the weapon instead. */
  cutsTheCords: boolean;
}

/**
 * What happens when somebody tries to defend against a bolas (p. 410).
 *
 * "The target can dodge or block, but if he tries to parry, the bolas hits his
 * parrying arm... (Exception: A successful parry with a cutting weapon cuts
 * the cords, ruining the bolas!)"
 */
export function bolasDefense(options: {
  defense: EntanglingDefense;
  cuttingWeapon?: boolean;
}): EntanglingDefenseResult {
  if (options.defense !== "parry") {
    return { allowed: true, snaresTheArm: false, cutsTheCords: false };
  }
  return {
    allowed: Boolean(options.cuttingWeapon),
    snaresTheArm: !options.cuttingWeapon,
    cutsTheCords: Boolean(options.cuttingWeapon),
  };
}

/** What a bolas does to the part of the body it wrapped around (p. 410). */
export type BolasHit =
  /** An arm or hand holding something, or the weapon itself. */
  | "disarms"
  /** A leg or foot: "you entangle two legs". */
  | "trips"
  /** Anywhere else: it wraps around and is a nuisance. */
  | "entangles"
  /**
   * The neck: "the bolas cuts off the target's breathing (see Suffocation,
   * p. 436) until he escapes." The same thing a lariat round the neck does,
   * except that a bolas needs no Contest to keep it there -- it is tied on,
   * and only the three escape rolls take it off.
   */
  | "neck";

export function bolasHit(location: string): BolasHit {
  const where = location.toLowerCase();
  if (where === "neck") return "neck";
  if (where === "arm" || where === "hand" || where === "weapon") return "disarms";
  if (where === "leg" || where === "foot") return "trips";
  return "entangles";
}

/**
 * Whether a bolas stops the victim breathing (p. 410).
 *
 * Only round the neck, and then until he is out of it -- so the caller runs
 * {@link ../suffocation.js suffocation} for every second the escape rolls are
 * still being failed.
 */
export function bolasSuffocates(location: string): boolean {
  return bolasHit(location) === "neck";
}

/** "a running target must make a DX roll or fall, taking 1d-2 damage." */
export const BOLAS_FALL_DAMAGE: DiceAdds = { dice: 1, adds: -2 };

/**
 * Whether a bolas around the legs trips somebody (p. 410).
 *
 * Only a running target is asked: a man standing still simply has his legs
 * tied together.
 */
export function bolasTrips(running: boolean): boolean {
  return running;
}

// ── lariats (p. 410) ────────────────────────────────────────────────────────

/** "A lariat takes 1 turn per 5 yards to ready after a miss." */
export const LARIAT_YARDS_PER_READY = 5;

/** "A typical lariat is 10 yards long." */
export const LARIAT_LENGTH_YARDS = 10;

/** "To escape from a taut lariat, cut the rope (DR 1, 2 HP)." */
export const LARIAT_ROPE = { dr: 1, hp: 2 };

/** How many turns a missed lariat takes to gather up again (p. 410). */
export function lariatReadyTurns(lengthYards = LARIAT_LENGTH_YARDS): number {
  return Math.max(1, Math.ceil(lengthYards / LARIAT_YARDS_PER_READY));
}

/** "your victim is at -5 in the Contest" when the rope is round his neck. */
export const LARIAT_NECK_PENALTY = -5;

/** "He rolls at -4 if he was running" to stay standing with a roped foot. */
export const LARIAT_RUNNING_PENALTY = -4;

export interface LariatHold {
  /** The modifier on the victim's side of the Quick Contest of ST. */
  contestModifier: number;
  /** True where winning the contest stops the victim breathing. */
  suffocates: boolean;
  /** True where the victim rolls DX to stay upright instead of contesting. */
  rollsToStand: boolean;
  /** The damage a fall does, or null where there is none. */
  fallDamage: DiceAdds | null;
}

/**
 * What a lariat does to what it caught (p. 410).
 *
 * The arm and torso are a Quick Contest of ST every turn. The neck is the same
 * contest with the victim five worse, and winning it "cuts off the victim's
 * breathing". The foot is not a contest at all: "the target must make a DX
 * roll to remain standing (this is instead of the Contest above)."
 */
export function lariatHold(options: {
  location: string;
  running?: boolean;
}): LariatHold {
  const where = options.location.toLowerCase();

  if (where === "neck") {
    return {
      contestModifier: LARIAT_NECK_PENALTY,
      suffocates: true,
      rollsToStand: false,
      fallDamage: null,
    };
  }
  if (where === "foot" || where === "leg") {
    return {
      contestModifier: options.running ? LARIAT_RUNNING_PENALTY : 0,
      suffocates: false,
      rollsToStand: true,
      // "If he falls, he takes 1d-4 damage - or 1d-2 if he was running."
      fallDamage: options.running ? { dice: 1, adds: -2 } : { dice: 1, adds: -4 },
    };
  }
  return { contestModifier: 0, suffocates: false, rollsToStand: false, fallDamage: null };
}

// ── nets (p. 411) ───────────────────────────────────────────────────────────

/** "must make three successful DX-4 rolls." */
export const NET_ESCAPE_ROLLS = 3;
export const NET_ESCAPE_MODIFIER = -4;

/** "rolls to escape from a small net are at +3." */
export const SMALL_NET_BONUS = 3;

/** "Animals roll at an extra -2, as do humans with only one hand available." */
export const NET_ONE_HAND_PENALTY = -2;

/** "treat a net of any size as a diffuse object with DR 1." */
export const NET_DR = 1;

/**
 * The roll to get out of a net (p. 411).
 *
 * "To escape, the victim requires at least one free hand, and must make three
 * successful DX-4 rolls... If the victim fails three consecutive rolls, he
 * becomes so entangled that he must be cut free."
 */
export function netEscapeTarget(options: {
  dexterity: number;
  small?: boolean;
  /** True for an animal, or a human with only one hand free. */
  oneHanded?: boolean;
}): number {
  return (
    options.dexterity +
    NET_ESCAPE_MODIFIER +
    (options.small ? SMALL_NET_BONUS : 0) +
    (options.oneHanded ? NET_ONE_HAND_PENALTY : 0)
  );
}

/** Whether somebody has failed their way into having to be cut free (p. 411). */
export function mustBeCutFree(consecutiveFailures: number): boolean {
  return consecutiveFailures >= NET_ESCAPE_ROLLS;
}

// ── Molotov cocktails and oil flasks (p. 411) ───────────────────────────────

/** "They have a Malf. of 12, regardless of tech level." */
export const MOLOTOV_MALFUNCTION = 12;

/** "In theory, the bottle bursts upon hitting a hard surface (anything with DR 3+)." */
export const MOLOTOV_BREAKS_ON_DR = 3;

/** "it breaks on a roll of 1-4" when you fall with one on your belt. */
export const MOLOTOV_BREAKS_ON = 4;

/** "A foe may strike at a bottle on your belt (-5 to hit)." */
export const MOLOTOV_ON_BELT_PENALTY = -5;

/** "In all cases, the flame burns for 10d seconds." */
export const MOLOTOV_BURNS_FOR: DiceAdds = { dice: 10, adds: 0 };

/** Where the bottle ended up, which decides what burns. */
export type MolotovLanding = "target" | "shield" | "ground" | "unbroken";

export interface MolotovEffect {
  /** The damage on the first second, where it burst on somebody. */
  initial: DiceAdds | null;
  /** The damage every second after that. */
  perSecond: DiceAdds;
  /** The share of DR that protects: a fifth, or all of it for sealed armour. */
  drFraction: number;
  /** Yards of ground set alight. */
  radiusYards: number;
}

/**
 * What a Molotov cocktail does where it landed (p. 411).
 *
 * "If the Molotov cocktail bursts on the target, it inflicts 3d burning
 * damage, and then 1d burning damage per second. Most DR protects at only 1/5
 * value; sealed armor protects completely. If you hit the target's shield, it
 * takes this damage instead... If you hit the ground, the flame does 1d-1
 * burning damage per second in a one-yard radius."
 */
export function molotovEffect(options: {
  landing: MolotovLanding;
  /** True for sealed armour, which keeps the fire out entirely. */
  sealed?: boolean;
}): MolotovEffect {
  if (options.landing === "unbroken") {
    return { initial: null, perSecond: { dice: 0, adds: 0 }, drFraction: 1, radiusYards: 0 };
  }
  if (options.landing === "ground") {
    return {
      initial: null,
      perSecond: { dice: 1, adds: -1 },
      drFraction: 1 / 5,
      radiusYards: 1,
    };
  }
  return {
    initial: { dice: 3, adds: 0 },
    perSecond: { dice: 1, adds: 0 },
    // "Most DR protects at only 1/5 value; sealed armor protects completely."
    drFraction: options.sealed ? 1 : 1 / 5,
    radiusYards: 0,
  };
}

/**
 * Where a thrown bottle actually ends up (p. 411).
 *
 * "If he dodges, the bottle shatters on the ground at his feet. The same thing
 * happens if he fails to defend but does not have DR 3+ (the bottle bounces
 * off without breaking). If he blocks, it breaks on his shield."
 *
 * Note which way round the second clause reads: a man in soft clothes is not
 * set alight, because the bottle needs something hard to break on.
 */
export function molotovLanding(options: {
  defense: "dodge" | "block" | "none";
  /** The DR of whatever the bottle would strike. */
  targetDr: number;
}): MolotovLanding {
  if (options.defense === "block") return "shield";
  if (options.defense === "dodge") return "ground";
  return options.targetDr >= MOLOTOV_BREAKS_ON_DR ? "target" : "unbroken";
}

/**
 * Whether a bottle on the belt survives a fall (p. 411).
 *
 * "Roll 1d for each bottle if you fall; it breaks on a roll of 1-4."
 */
export function bottleBreaks(roll: number): boolean {
  return roll <= MOLOTOV_BREAKS_ON;
}
