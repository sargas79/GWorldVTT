/**
 * Building modifiers that print correctly.
 *
 * Negating zero in JavaScript gives -0, which is equal to 0 everywhere except
 * where it is shown to somebody: a chat card reads "-0 Deceptive Attack", and
 * a dialog offers "-0" for no penalty at all.
 *
 * This has been written wrong three separate times in this system -- in the
 * Deceptive Attack ceiling, in the bleeding modifier and in the heat modifier
 * -- each caught by a test asserting `toBe(0)` against a `-0`. One function is
 * cheaper than a fourth comment explaining the same footgun.
 */

/**
 * Any signed modifier, as a number safe to print.
 *
 * Use it where the modifier can go either way -- a bigger dose of a poison is a
 * penalty to resist it and a smaller one is a bonus -- and `penalty()` where it
 * can only ever be a penalty.
 */
export function modifier(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * A penalty of some number of steps, as a number safe to print.
 *
 * Pass the size of the penalty, not its sign: `penalty(3)` is -3 and
 * `penalty(0)` is a positive zero rather than a negative one.
 */
export function penalty(steps: number): number {
  return modifier(-Math.max(0, steps));
}

/**
 * The sum of several penalties, as a number safe to print.
 *
 * Adding -0 to -0 gives -0, so a modifier assembled from several parts needs
 * the same care as one built from a single step.
 */
export function totalPenalty(...steps: number[]): number {
  return penalty(steps.reduce((sum, step) => sum + Math.max(0, step), 0));
}
