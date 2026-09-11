/**
 * Shooting through one thing into another (GURPS Basic Set: Campaigns p. 408).
 *
 * "It's usually too much trouble to worry about this, but if it becomes
 * important -- e.g., shooting through a door, or a bystander behind your
 * target" -- which is exactly the kind of thing a table asks about once and
 * then wants an answer for.
 *
 * The whole rule turns on one number: cover DR, which is what the thing in the
 * way is worth as armour to whatever is behind it.
 */

/** What the thing in the way is made of, which decides how its HP count. */
export type CoverKind =
  /** A person or an animal: all of their hit points. */
  | "flesh"
  /** A machine or a vehicle: half. */
  | "unliving"
  /** A solid object: a quarter. */
  | "homogenous"
  /** A wall or a door: its DR alone, however many hit points it has. */
  | "thinSlab";

/**
 * What is between the shot and whoever is behind it (p. 408).
 *
 * "Add together the target or cover's DR -- on both sides, for a person in
 * armor -- and HP (for flesh), 1/2 HP (for a machine, vehicle, or other
 * Unliving target), or 1/4 HP (for a Homogenous object). Use the object's DR
 * alone if it's a thin slab, like a wall or a door. Finally, apply any armor
 * divisor."
 */
export function coverDr(options: {
  /** The DR of one side. Doubled for a person in armour, who has two.  */
  dr: number;
  hp: number;
  kind: CoverKind;
  /** The attack's armour divisor, which divides the lot. */
  armorDivisor?: number;
}): number {
  const dr = Math.max(0, options.dr);
  const hp = Math.max(0, options.hp);

  const armour = options.kind === "flesh" ? 2 * dr : dr;
  const structure =
    options.kind === "flesh"
      ? hp
      : options.kind === "unliving"
        ? hp / 2
        : options.kind === "homogenous"
          ? hp / 4
          : 0;

  const divisor = Math.max(1, options.armorDivisor ?? 1);
  return Math.floor((armour + structure) / divisor);
}

/**
 * Whether the shot came out the other side (p. 408).
 *
 * "An attack only overpenetrates if its basic damage exceeds the target's cover
 * DR" -- basic damage, before the first target's own DR is taken off, which is
 * why this takes the roll and not the wound.
 */
export function overpenetrates(basicDamage: number, cover: number): boolean {
  return basicDamage > cover;
}

/**
 * What lands on whoever was behind (p. 408).
 *
 * "If so, they get the cover DR plus their own DR against the damage." Worked
 * against the book's own example: a 7d(2) rifle bullet rolling 20 through
 * Agent Gray's DR 8 vest and 12 HP is cover DR 14, so the VIP behind him takes
 * 20 - 14 = 6 before his own DR.
 */
export function damageThrough(options: {
  basicDamage: number;
  cover: number;
  /** The DR of whoever is behind, before the armour divisor. */
  targetDr?: number;
  armorDivisor?: number;
}): number {
  if (!overpenetrates(options.basicDamage, options.cover)) return 0;

  // "If an explosive attack has an armor divisor, it does not apply to the
  // collateral damage" is the explosion rule; here the divisor has already been
  // spent on the cover, so what is left is the second target's own DR.
  const divisor = Math.max(1, options.armorDivisor ?? 1);
  const behind = Math.floor(Math.max(0, options.targetDr ?? 0) / divisor);

  return Math.max(0, options.basicDamage - options.cover - behind);
}

/** The damage types that can go through something (p. 408). */
export const OVERPENETRATING_TYPES = ["pi-", "pi", "pi+", "pi++", "imp", "burn"] as const;

/**
 * Whether this kind of damage overpenetrates at all (p. 408).
 *
 * "When you inflict piercing, impaling, or tight-beam burning damage with a
 * ranged attack." Burning only counts as a tight beam, which is the caller's to
 * know: a flamethrower does not drill through people.
 */
export function canOverpenetrate(options: {
  type: string;
  ranged: boolean;
  tightBeam?: boolean;
}): boolean {
  if (!options.ranged) return false;
  if (options.type === "burn") return options.tightBeam === true;
  return (OVERPENETRATING_TYPES as readonly string[]).includes(options.type);
}
