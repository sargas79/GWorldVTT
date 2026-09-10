/**
 * Explosions (GURPS Basic Set: Campaigns p. 414).
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
export function collateralDamage(rolledDamage: number, distanceYards: number): number {
  if (distanceYards <= 0) return Math.max(0, Math.floor(rolledDamage));
  return Math.max(0, Math.floor(rolledDamage / (3 * distanceYards)));
}

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
}

export function blastAt(options: {
  rolledDamage: number;
  distanceYards: number;
  diceOfDamage: number;
  /** The divisor on the attack, which applies only to a direct hit. */
  armorDivisor?: number;
}): BlastEffect {
  const { rolledDamage, distanceYards, diceOfDamage, armorDivisor = 1 } = options;

  if (distanceYards <= 0) {
    return {
      damage: Math.max(0, Math.floor(rolledDamage)),
      armorDivisor,
      direct: true,
      outOfRange: false,
    };
  }

  const outOfRange = distanceYards > blastRadius(diceOfDamage);
  return {
    damage: outOfRange ? 0 : collateralDamage(rolledDamage, distanceYards),
    armorDivisor: 1,
    direct: false,
    outOfRange,
  };
}

/**
 * The skill fragments attack a bystander at (p. 414).
 *
 * Anyone the explosive actually struck is hit automatically; everyone else in
 * range is attacked at this skill, modified for the range from the blast.
 */
export const FRAGMENTATION_SKILL = 15;
