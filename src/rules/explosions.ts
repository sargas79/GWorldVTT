import type { DamageType } from "./types.js";

/**
 * Explosions (GURPS Basic Set: Campaigns pp. 414-415).
 *
 * An explosive attack is marked "ex" after its damage type -- "cr ex" for a
 * crushing explosion. It does its listed damage to whoever it actually struck,
 * and collateral damage to everyone else nearby, falling off sharply with
 * distance.
 *
 * Many explosives also throw fragments, written in brackets after the damage:
 * "cr ex [2d]" is a crushing explosion that throws 2d of fragmentation.
 */

/**
 * How far an explosion's collateral damage reaches, in yards: twice its dice
 * of damage.
 *
 * The count is of dice actually rolled, after any multiplier -- the book's own
 * example is 6dx2, which is twelve dice and so reaches 24 yards.
 */
export function blastRadius(diceOfDamage: number): number {
  return Math.max(0, Math.floor(diceOfDamage)) * 2;
}

/** How far fragments reach, in yards: five times their dice of damage. */
export function fragmentationRadius(diceOfFragmentation: number): number {
  return Math.max(0, Math.floor(diceOfFragmentation)) * 5;
}

/**
 * The damage an explosion does to someone who was not struck directly.
 *
 * "Roll this damage but divide it by (3 x distance in yards from the center of
 * the blast), rounding down." So the rolled figure is what falls off, not the
 * dice: one roll can serve several victims at different distances.
 *
 * Distance is measured from the centre of the blast. At zero the victim was
 * struck directly and takes the listed damage as is, which is the caller's
 * business rather than a division by zero here.
 */
export function collateralDamage(rolledDamage: number, distanceYards: number, perYard = COLLATERAL_DIVISOR_PER_YARD): number {
  if (distanceYards <= 0) return Math.max(0, Math.floor(rolledDamage));
  return Math.max(0, Math.floor(rolledDamage / (Math.max(0.1, perYard) * distanceYards)));
}

/** What a blast's damage is divided by for each yard from its centre. */
export const COLLATERAL_DIVISOR_PER_YARD = 3;

/**
 * What an explosion does to one victim, given a single rolled figure.
 *
 * Two things change for anyone not struck directly, and both make the blast
 * weaker than the attack that carried it:
 *
 *   - The damage is divided by three times the distance.
 *   - The armour divisor does not apply. A shaped charge at (10) strips the DR
 *     of what it hits; everyone nearby gets their full DR against the blast.
 *
 * A third is the caller's to honour: "Use torso armor to determine DR against
 * explosion damage", whatever part of them was nearest.
 */
export interface BlastEffect {
  /** Damage this victim takes before DR. */
  damage: number;
  /** The armour divisor that applies to them. */
  armorDivisor: number;
  /** True when this victim was struck by the attack itself. */
  direct: boolean;
  /** True when they are far enough away to take nothing at all. */
  outOfRange: boolean;
  /** Where the blast went off, for the one it was against or inside (since API 1.72.0). */
  placement: BlastPlacement | null;
  /** True when DR has no effect: a blast inside its victim (p. 415). */
  ignoresDr: boolean;
  /** A wounding modifier in place of the type's, or null: x3 inside (p. 415). */
  woundingModifier: number | null;
}

/**
 * Where an explosion went off relative to one victim (Campaigns p. 415), when
 * it was not simply beside them.
 *
 *   - `contact`: pressed against them -- someone who threw himself on the
 *     grenade. He takes the most the dice could do, against his DR as
 *     usual, and everyone else gets his torso DR and HP as cover.
 *   - `internal`: inside them -- a follow-up warhead that got through, or a
 *     swallowed grenade. DR has no effect, and the blast is an attack on the
 *     vitals at x3.
 */
export type BlastPlacement = "contact" | "internal";

export const BLAST_PLACEMENTS: readonly BlastPlacement[] = ["contact", "internal"];

/** The wounding modifier of a blast inside its victim (p. 415). */
export const INTERNAL_BLAST_WOUNDING = 3;

/** A placement read from stored data, or null for an ordinary blast. */
export function blastPlacementOf(value: unknown): BlastPlacement | null {
  return value === "contact" || value === "internal" ? value : null;
}

/**
 * The cover the one lying on a blast gives everyone else (p. 415): his
 * torso's DR plus his HP, as cover DR.
 */
export function contactCoverDr(options: { torsoDr: number; hp: number }): number {
  return Math.max(0, Math.floor(Number(options.torsoDr) || 0)) + Math.max(0, Math.floor(Number(options.hp) || 0));
}

export function blastAt(options: {
  rolledDamage: number;
  distanceYards: number;
  diceOfDamage: number;
  /** The divisor on the attack, which applies only to a direct hit. */
  armorDivisor?: number;
  /**
   * What the damage is divided by per yard (since API 1.63.0): 3 as the Basic
   * Set has it, less for a blast that carries further. The reach grows to match.
   */
  divisorPerYard?: number;
  /**
   * Where it went off for this victim (since API 1.72.0). Either placement is
   * a direct hit whatever the distance says.
   */
  placement?: BlastPlacement | null;
  /** The most the dice could have come up, which a contact blast does (p. 415). */
  maxDamage?: number;
}): BlastEffect {
  const { rolledDamage, distanceYards, diceOfDamage, armorDivisor = 1 } = options;
  const perYard = Math.max(0.1, Number(options.divisorPerYard) || COLLATERAL_DIVISOR_PER_YARD);
  const placement = blastPlacementOf(options.placement);
  const plain = { placement: null, ignoresDr: false, woundingModifier: null };

  // Pressed against the blast, the victim takes the most the dice could do,
  // and his DR protects him as usual -- the attack's own divisor included,
  // since he is the one it struck.
  if (placement === "contact") {
    const most = Number.isFinite(Number(options.maxDamage)) ? Number(options.maxDamage) : rolledDamage;
    return {
      damage: Math.max(0, Math.floor(Math.max(most, rolledDamage))),
      armorDivisor,
      direct: true,
      outOfRange: false,
      placement,
      ignoresDr: false,
      woundingModifier: null,
    };
  }

  // Inside the victim, DR has no effect, and the blast is an attack on the
  // vitals with a x3 wounding modifier.
  if (placement === "internal") {
    return {
      damage: Math.max(0, Math.floor(rolledDamage)),
      armorDivisor: 1,
      direct: true,
      outOfRange: false,
      placement,
      ignoresDr: true,
      woundingModifier: INTERNAL_BLAST_WOUNDING,
    };
  }

  if (distanceYards <= 0) {
    return {
      damage: Math.max(0, Math.floor(rolledDamage)),
      armorDivisor,
      direct: true,
      outOfRange: false,
      ...plain,
    };
  }

  const outOfRange = distanceYards > blastRadius(diceOfDamage) * (COLLATERAL_DIVISOR_PER_YARD / perYard);
  return {
    damage: outOfRange ? 0 : collateralDamage(rolledDamage, distanceYards, perYard),
    armorDivisor: 1,
    direct: false,
    outOfRange,
    ...plain,
  };
}

/**
 * The skill fragments attack a bystander at (p. 414).
 *
 * Anyone the explosive actually struck is hit automatically; everyone else in
 * range is attacked at this skill, modified for the range from the blast.
 */
export const FRAGMENTATION_SKILL = 15;

/**
 * What an explosion's fragments do (p. 414).
 *
 * The Basic Set's fragments are cutting, and the blast's own armour divisor
 * does not apply to them. A table may still give fragments a type and divisor
 * of their own, and hot fragments go on burning: 1d(0.2) burning every 10
 * seconds for a minute, typically.
 */
export interface FragmentationSpec {
  /** The dice, "2d" in "[2d]". */
  dice: string;
  /** Their damage type: cutting unless the row says otherwise. */
  damageType: DamageType;
  /** Their own armour divisor, 1 for none. */
  armorDivisor: number;
  /**
   * Fragments that go on hurting -- hot fragments -- as seconds between blows
   * and seconds in all, or null for fragments that strike once.
   */
  linger: { every: number; for: number } | null;
}

/** The damage type fragments do unless the row says otherwise (p. 414). */
export const FRAGMENTATION_TYPE: DamageType = "cut";

const FRAGMENT_TYPES: ReadonlySet<string> = new Set(["burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"]);

/**
 * A row's fragments as one spec (since API 1.72.0), or null where it throws
 * none. A row keeps them in flat fields beside the dice, so a stored
 * `fragmentation` with nothing beside it still means what it always did: plain
 * cutting at no divisor.
 */
export function fragmentationSpec(row: {
  fragmentation?: unknown;
  fragmentationType?: unknown;
  fragmentationDivisor?: unknown;
  fragmentationLingerEvery?: unknown;
  fragmentationLingerFor?: unknown;
} | null | undefined): FragmentationSpec | null {
  const dice = typeof row?.fragmentation === "string" ? row.fragmentation.trim() : "";
  if (!dice) return null;
  const type = String(row?.fragmentationType ?? "").trim();
  const divisor = Number(row?.fragmentationDivisor);
  const every = Math.max(0, Math.floor(Number(row?.fragmentationLingerEvery) || 0));
  const total = Math.max(0, Math.floor(Number(row?.fragmentationLingerFor) || 0));
  return {
    dice,
    damageType: (FRAGMENT_TYPES.has(type) ? type : FRAGMENTATION_TYPE) as DamageType,
    armorDivisor: Number.isFinite(divisor) && divisor > 0 ? divisor : 1,
    linger: every > 0 && total >= every ? { every, for: total } : null,
  };
}

/** Fragments as a table prints them: "[2d]", "[1d-1 cr]", "[1d(0.2) burn]". */
export function fragmentationLabel(spec: FragmentationSpec): string {
  const divisor = spec.armorDivisor !== 1 ? `(${spec.armorDivisor})` : "";
  const type = spec.damageType !== FRAGMENTATION_TYPE ? ` ${spec.damageType}` : "";
  return `[${spec.dice}${divisor}${type}]`;
}

/**
 * How many times fragments strike in all: once when they land, and again at
 * every interval until the time runs out -- hot fragments at 10 seconds for a
 * minute strike six times. One for fragments that don't linger.
 */
export function fragmentationStrikes(linger: FragmentationSpec["linger"]): number {
  if (!linger || linger.every <= 0) return 1;
  return Math.max(1, Math.floor(linger.for / linger.every));
}
