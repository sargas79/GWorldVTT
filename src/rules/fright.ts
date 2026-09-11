/**
 * Fright Checks (GURPS Basic Set: Campaigns pp. 360-361).
 *
 * A Will roll against something so unusual and terrifying "that they might stun
 * or even permanently scar someone" -- and, when it fails, a second roll on a
 * table that runs from a second of stunning to a permanent point of IQ.
 *
 * The table's entries are recorded here as short statements of what happens,
 * not as the book's own text, and the ones the book hands to the GM -- which
 * quirk, which phobia, which physical effect -- say so rather than inventing
 * one.
 */

/** The most a modified Will can be for a Fright Check: the Rule of 14. */
export const FRIGHT_CHECK_CEILING = 13;

/**
 * The Will a Fright Check is actually rolled against (p. 360).
 *
 * "If final, modified Will exceeds 13, reduce it to 13 for the purpose of the
 * Fright Check. This means that a roll of 14 or more is automatically a
 * failure." Nobody is so steady that nothing can frighten them -- and the rule
 * is the Fright Check's alone, which is why it is applied here and not in the
 * ordinary Will roll.
 */
export function frightCheckWill(modifiedWill: number): number {
  return Math.min(FRIGHT_CHECK_CEILING, modifiedWill);
}

/** One row of the Fright Check Table. */
export interface FrightEntry {
  /** The lowest total this row covers. */
  from: number;
  /** The highest, or null for the open-ended last row. */
  to: number | null;
  /** Names the effect; localized as `GWORLD.Fright.Effect.<effect>`. */
  effect: string;
  /** True where the book leaves the particulars to the GM. */
  gmDecides?: boolean;
}

/**
 * The Fright Check Table (pp. 360-361), read on 3d plus the margin by which the
 * Will roll failed. The lowest reachable total is 4: a rolled 3 with a margin
 * of 1.
 */
export const FRIGHT_CHECK_TABLE: readonly FrightEntry[] = [
  { from: 4, to: 5, effect: "stunnedRecovers" },
  { from: 6, to: 7, effect: "stunnedWillUnmodified" },
  { from: 8, to: 9, effect: "stunnedWillModified" },
  { from: 10, to: 10, effect: "stunned1d" },
  { from: 11, to: 11, effect: "stunned2d" },
  { from: 12, to: 12, effect: "retching" },
  { from: 13, to: 13, effect: "quirk", gmDecides: true },
  { from: 14, to: 15, effect: "loseFpAndStun" },
  { from: 16, to: 16, effect: "stunAndQuirk", gmDecides: true },
  { from: 17, to: 17, effect: "faint" },
  { from: 18, to: 18, effect: "faintAndFall" },
  { from: 19, to: 19, effect: "severeFaint" },
  { from: 20, to: 20, effect: "faintNearShock" },
  { from: 21, to: 21, effect: "panic" },
  { from: 22, to: 22, effect: "delusion10", gmDecides: true },
  { from: 23, to: 23, effect: "phobia10", gmDecides: true },
  { from: 24, to: 24, effect: "physical15", gmDecides: true },
  { from: 25, to: 25, effect: "worseSelfControl", gmDecides: true },
  { from: 26, to: 26, effect: "faintAndDelusion10", gmDecides: true },
  { from: 27, to: 27, effect: "faintAndPhobia10", gmDecides: true },
  { from: 28, to: 28, effect: "lightComa" },
  { from: 29, to: 29, effect: "coma" },
  { from: 30, to: 30, effect: "catatonia" },
  { from: 31, to: 31, effect: "seizure" },
  { from: 32, to: 32, effect: "stricken" },
  { from: 33, to: 33, effect: "totalPanic", gmDecides: true },
  { from: 34, to: 34, effect: "delusion15", gmDecides: true },
  { from: 35, to: 35, effect: "phobia15", gmDecides: true },
  { from: 36, to: 36, effect: "physical20", gmDecides: true },
  { from: 37, to: 37, effect: "physical30", gmDecides: true },
  { from: 38, to: 38, effect: "comaAndDelusion15", gmDecides: true },
  { from: 39, to: 39, effect: "comaAndPhobia15", gmDecides: true },
  { from: 40, to: null, effect: "comaAndPhobiaAndIq", gmDecides: true },
];

/**
 * The row a total lands on.
 *
 * A total below the table -- which the dice cannot produce, but a caller might
 * ask for -- reads as the first row, and anything past the end reads as the
 * last, which is where the table itself says everything from 40 up goes.
 */
export function frightCheckResult(total: number): FrightEntry {
  const rounded = Math.round(total);
  const first = FRIGHT_CHECK_TABLE[0]!;
  if (rounded <= first.from) return first;

  return (
    FRIGHT_CHECK_TABLE.find((row) => rounded >= row.from && (row.to === null || rounded <= row.to))
    ?? FRIGHT_CHECK_TABLE[FRIGHT_CHECK_TABLE.length - 1]!
  );
}

/** The total read on the table: 3d plus the margin the Will roll failed by. */
export function frightCheckTotal(roll: number, marginOfFailure: number): number {
  return roll + Math.max(0, Math.round(marginOfFailure));
}
