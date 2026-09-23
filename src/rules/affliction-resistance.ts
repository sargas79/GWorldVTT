/**
 * What armour is worth against an affliction (GURPS Basic Set: Characters
 * p. 35).
 *
 * An affliction does no damage, so DR never comes off anything. It helps the
 * victim instead: the HT roll to resist gets a bonus equal to the victim's DR,
 * unless the attack has one of the modifiers that get past armour -- Blood
 * Agent, Contact Agent, Cosmic, Follow-Up, Malediction, Respiratory Agent or
 * Sense-Based. An armour divisor is how an affliction is made to reduce that
 * DR, and it divides the bonus the way it would divide DR against damage.
 *
 * The bonus is on the roll to resist the attack alone: "DR has no effect" on
 * the rolls to recover from its effects.
 */

/** The DR bonus to an affliction's resistance roll, 0 where none applies. */
export function afflictionDrBonus(options: {
  /** The victim's DR where the attack struck. */
  dr: number;
  /** The attack's armour divisor: above 1 it divides DR, below 1 it multiplies it. */
  armorDivisor?: number;
  /**
   * True for an attack DR does nothing against: one that ignores DR outright
   * (a cosmic divisor), a Malediction, or a follow-up delivered by a carrier
   * that got through.
   */
  ignoresDr?: boolean;
}): number {
  if (options.ignoresDr === true) return 0;
  const dr = Math.max(0, Math.floor(Number(options.dr) || 0));
  if (dr === 0) return 0;
  const divisor = Number(options.armorDivisor) > 0 ? Number(options.armorDivisor) : 1;
  return Math.floor(dr / divisor);
}
