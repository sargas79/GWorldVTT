/**
 * Dice utilities for the "dice+adds" system (GURPS Lite p. 2).
 *
 * All roll functions take an injectable `rng` so tests can be deterministic.
 * `rng()` must return a float in [0, 1) like `Math.random`.
 */

import type { DiceAdds } from "./types.js";

export type Rng = () => number;

/** Rolls a single six-sided die. */
export function rollDie(rng: Rng = Math.random): number {
  return Math.floor(rng() * 6) + 1;
}

/** Rolls `count` six-sided dice and returns the individual results. */
export function rollDice(count: number, rng: Rng = Math.random): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) results.push(rollDie(rng));
  return results;
}

/**
 * Parses a dice+adds expression such as `2d`, `1d-2`, `3d+1`, or a flat `4`.
 *
 * Also accepts a multiplier, written `6dx10` or `6d×10` -- the notation the
 * heaviest weapons and largest explosives come in. The multiplier applies to
 * the whole roll, adds included.
 *
 * Returns `null` for unparseable input rather than throwing, so that malformed
 * compendium data surfaces as a validation error instead of a crash.
 */
export function parseDiceAdds(formula: string): DiceAdds | null {
  const text = formula.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x");
  if (text === "") return null;

  const diceMatch = /^(\d*)d([+-]\d+)?(?:x(\d+))?$/.exec(text);
  if (diceMatch) {
    const dice = diceMatch[1] === "" || diceMatch[1] === undefined ? 1 : Number(diceMatch[1]);
    const adds = diceMatch[2] === undefined ? 0 : Number(diceMatch[2]);
    const multiplier = diceMatch[3] === undefined ? 1 : Number(diceMatch[3]);
    // A multiplier of zero would silently erase the attack, so it is not a
    // multiplier this understands.
    if (multiplier < 1) return null;
    return multiplier === 1 ? { dice, adds } : { dice, adds, multiplier };
  }

  const flatMatch = /^([+-]?\d+)$/.exec(text);
  if (flatMatch?.[1] !== undefined) return { dice: 0, adds: Number(flatMatch[1]) };

  return null;
}

/** The multiplier on a roll, which is 1 unless one was given. */
function factor({ multiplier }: DiceAdds): number {
  return multiplier === undefined || multiplier < 1 ? 1 : multiplier;
}

/** Formats a {@link DiceAdds} back into canonical `NdX` notation, e.g. `2d+1`. */
export function formatDiceAdds(formula: DiceAdds): string {
  const { dice, adds } = formula;
  const times = factor(formula);
  const suffix = times === 1 ? "" : `x${times}`;
  if (dice === 0) return times === 1 ? String(adds) : `${adds}${suffix}`;
  const sign = adds > 0 ? `+${adds}` : adds < 0 ? String(adds) : "";
  return `${dice}d${sign}${suffix}`;
}

/**
 * Renders a dice+adds pair as a dice-roller formula, e.g. `2d6 - 1`.
 *
 * GURPS notation (`2d-1`) is not a valid roller formula, and the naive
 * interpolation `2d6 + -1` puts two operators in a row, which formula grammars
 * reject. Zero dice renders as the bare modifier so flat damage does not become
 * `0d6`.
 */
export function toRollFormula(formula: DiceAdds): string {
  const { dice, adds } = formula;
  const times = factor(formula);

  const base =
    dice <= 0
      ? String(adds)
      : adds === 0
        ? `${dice}d6`
        : `${dice}d6 ${adds < 0 ? "-" : "+"} ${Math.abs(adds)}`;

  // The multiplier applies to the whole roll, so the roll is bracketed before
  // it is multiplied -- "6d6 + 2 * 10" would multiply only the 2.
  return times === 1 ? base : `(${base}) * ${times}`;
}

/** Adds a flat modifier to a dice+adds expression (e.g. `thr+2` for a spear). */
export function addModifier(base: DiceAdds, modifier: number): DiceAdds {
  const multiplied = factor(base);
  const next: DiceAdds = { dice: base.dice, adds: base.adds + modifier };
  return multiplied === 1 ? next : { ...next, multiplier: multiplied };
}

/** The lowest total a dice+adds expression can produce, before any damage floor. */
export function minRoll(formula: DiceAdds): number {
  return (formula.dice + formula.adds) * factor(formula);
}

/** The highest total a dice+adds expression can produce. */
export function maxRoll(formula: DiceAdds): number {
  return (formula.dice * 6 + formula.adds) * factor(formula);
}

/** The mean total of a dice+adds expression. */
export function averageRoll(formula: DiceAdds): number {
  return (formula.dice * 3.5 + formula.adds) * factor(formula);
}

export interface DiceAddsRoll {
  dice: number[];
  adds: number;
  total: number;
}

/** Rolls a dice+adds expression. The raw total is returned without any flooring. */
export function rollDiceAdds(formula: DiceAdds, rng: Rng = Math.random): DiceAddsRoll {
  const dice = rollDice(formula.dice, rng);
  const total = (dice.reduce((sum, d) => sum + d, 0) + formula.adds) * factor(formula);
  return { dice, adds: formula.adds, total };
}
