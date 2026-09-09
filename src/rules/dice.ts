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
 * Returns `null` for unparseable input rather than throwing, so that malformed
 * compendium data surfaces as a validation error instead of a crash.
 */
export function parseDiceAdds(formula: string): DiceAdds | null {
  const text = formula.trim().toLowerCase().replace(/\s+/g, "");
  if (text === "") return null;

  const diceMatch = /^(\d*)d([+-]\d+)?$/.exec(text);
  if (diceMatch) {
    const dice = diceMatch[1] === "" || diceMatch[1] === undefined ? 1 : Number(diceMatch[1]);
    const adds = diceMatch[2] === undefined ? 0 : Number(diceMatch[2]);
    return { dice, adds };
  }

  const flatMatch = /^([+-]?\d+)$/.exec(text);
  if (flatMatch?.[1] !== undefined) return { dice: 0, adds: Number(flatMatch[1]) };

  return null;
}

/** Formats a {@link DiceAdds} back into canonical `NdX` notation, e.g. `2d+1`. */
export function formatDiceAdds({ dice, adds }: DiceAdds): string {
  if (dice === 0) return String(adds);
  const sign = adds > 0 ? `+${adds}` : adds < 0 ? String(adds) : "";
  return `${dice}d${sign}`;
}

/** Adds a flat modifier to a dice+adds expression (e.g. `thr+2` for a spear). */
export function addModifier(base: DiceAdds, modifier: number): DiceAdds {
  return { dice: base.dice, adds: base.adds + modifier };
}

/** The lowest total a dice+adds expression can produce, before any damage floor. */
export function minRoll({ dice, adds }: DiceAdds): number {
  return dice + adds;
}

/** The highest total a dice+adds expression can produce. */
export function maxRoll({ dice, adds }: DiceAdds): number {
  return dice * 6 + adds;
}

/** The mean total of a dice+adds expression. */
export function averageRoll({ dice, adds }: DiceAdds): number {
  return dice * 3.5 + adds;
}

export interface DiceAddsRoll {
  dice: number[];
  adds: number;
  total: number;
}

/** Rolls a dice+adds expression. The raw total is returned without any flooring. */
export function rollDiceAdds(formula: DiceAdds, rng: Rng = Math.random): DiceAddsRoll {
  const dice = rollDice(formula.dice, rng);
  const total = dice.reduce((sum, d) => sum + d, 0) + formula.adds;
  return { dice, adds: formula.adds, total };
}
