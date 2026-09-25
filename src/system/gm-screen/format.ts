/**
 * How the GM Screen writes its figures: modifiers signed, multipliers with a
 * times sign, rolls as ranges. One place, so every table reads alike.
 */

import { formatDiceAdds } from "../../rules/dice.js";
import type { DiceAdds } from "../../rules/types.js";

/** A modifier with its sign: +2, 0, -4. */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

/** A wounding or other multiplier: x1.5. */
export function times(value: number): string {
  return `×${value}`;
}

/** A run of rolls: "3-4", "9", or "17+" where it has no end. */
export function span(from: number, to: number | null): string {
  if (to === null) return `${from}+`;
  return from === to ? String(from) : `${from}-${to}`;
}

/** The rolls a row covers, which are always a run. */
export function rollsOf(rolls: readonly number[]): string {
  const low = Math.min(...rolls);
  const high = Math.max(...rolls);
  return span(low, high);
}

/** A chance as a percentage, to one place where it needs one. */
export function percent(fraction: number): string {
  const value = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** Dice and adds as the sheet writes them: 2d-1. */
export function dice(formula: DiceAdds): string {
  return formatDiceAdds(formula);
}

/** A fraction of a yard, in inches as the tables print them: 1/5", 1.5". */
export function inches(value: number): string {
  const fractions: Array<[number, string]> = [
    [1 / 5, "1/5"],
    [1 / 3, "1/3"],
    [1 / 2, "1/2"],
    [2 / 3, "2/3"],
  ];
  const named = fractions.find(([n]) => Math.abs(n - value) < 1e-9);
  return `${named ? named[1] : String(value)}"`;
}
