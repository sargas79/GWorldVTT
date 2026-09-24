/**
 * Pulling and dragging a load (GURPS Basic Set: Campaigns p. 353), and the
 * muscle-powered wheelchair (Characters p. 142).
 *
 * A load pulled behind you counts toward encumbrance at an effective weight:
 * its full weight dragged, less on runners or wheels, and half again on a
 * smooth, level surface. Past fifteen times Basic Lift it can't be moved at
 * all.
 */

/** What the load is pulled on. */
export type Conveyance = "none" | "sledge" | "cart" | "wagon";

/**
 * What each conveyance divides the weight by (p. 353): a sledge over snow or
 * ice halves it, a two-wheeled cart divides it by 10, a four-wheeled wagon by 20.
 */
export const CONVEYANCE_DIVISORS: Readonly<Record<Conveyance, number>> = {
  none: 1,
  sledge: 2,
  cart: 10,
  wagon: 20,
};

/** A smooth, level surface -- a floor, a road, a frozen lake -- halves it again, whatever it is on. */
export const SMOOTH_SURFACE_DIVISOR = 2;

/** The most effective weight that can be moved at all, in multiples of Basic Lift. */
export const TOWING_LIMIT_BL = 15;

/**
 * The effective weight of a pulled load (p. 353). `weight` is the load and
 * what it is pulled on together -- the book has the sledge, cart or wagon
 * added before dividing. Never below 0.
 */
export function towedWeight(options: { weight: number; conveyance?: Conveyance; smooth?: boolean }): number {
  const weight = Math.max(0, Number(options.weight) || 0);
  const divisor = CONVEYANCE_DIVISORS[options.conveyance ?? "none"] ?? 1;
  return weight / divisor / (options.smooth === true ? SMOOTH_SURFACE_DIVISOR : 1);
}

/** Whether a load of this effective weight can be moved at all (p. 353). */
export function canPull(effectiveWeight: number, basicLift: number): boolean {
  return effectiveWeight <= TOWING_LIMIT_BL * Math.max(0, Number(basicLift) || 0);
}

/** A muscle-powered wheelchair's ground Move: a quarter of ST, rounded down (Characters p. 142). */
export function wheelchairMove(st: number): number {
  return Math.max(0, Math.floor((Number(st) || 0) / 4));
}
