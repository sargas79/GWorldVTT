/**
 * Powerstones and Manastones (GURPS Magic pp. 20, 69-70).
 *
 * A Powerstone is an object holding mana a wizard can spend in place of his
 * own fatigue. It has a capacity, grown one point per casting of the
 * Powerstone spell, and a charge, which it regains from the mana around it.
 * A One-College stone pays only for its college's spells; a dedicated or
 * exclusive one, set into a magic item, only for that item's spells, at two or
 * three energy a point; a Manastone never recharges.
 */

import type { ManaLevel } from "./casting.js";

export type PowerstoneKind = "normal" | "oneCollege" | "dedicated" | "exclusive" | "manastone";

export const POWERSTONE_KINDS: readonly PowerstoneKind[] = ["normal", "oneCollege", "dedicated", "exclusive", "manastone"];

/**
 * The price of a quirk-free Powerstone by capacity, as p. 20 tabulates it.
 */
export const POWERSTONE_PRICE_TABLE: ReadonlyMap<number, number> = new Map([
  [1, 70], [2, 165], [3, 280], [4, 425], [5, 595], [6, 790], [7, 1000], [8, 1300], [9, 1550],
  [10, 1900], [12, 2650], [15, 4050], [20, 7350], [25, 12000], [30, 18500], [35, 27000],
  [40, 38000], [45, 52000], [50, 69500], [60, 120000], [70, 195000], [80, 300000],
  [90, 460000], [100, 675000],
]);

/**
 * What the table is worked out from (p. 20): the object costs $10xP^2 + $40xP,
 * divided by (53/54)^P for the chance each casting destroys it, and each of
 * the P castings is $20 of labor.
 */
export function powerstoneFormulaPrice(capacity: number): number {
  const p = Math.max(0, Math.floor(capacity));
  if (p === 0) return 0;
  return (10 * p * p + 40 * p) / (53 / 54) ** p + 20 * p;
}

/**
 * A Powerstone's price by capacity. A capacity the table prints is priced at
 * its row; one between rows follows the table's own formula, rounded as the
 * rows are -- to $5 below $1,000, $50 below $10,000, $500 below $100,000,
 * and $5,000 above.
 */
export function powerstonePrice(capacity: number): number {
  const p = Math.max(0, Math.floor(capacity));
  const printed = POWERSTONE_PRICE_TABLE.get(p);
  if (printed !== undefined) return printed;
  const price = powerstoneFormulaPrice(p);
  const step = price < 1000 ? 5 : price < 10000 ? 50 : price < 100000 ? 500 : 5000;
  return Math.round(price / step) * step;
}

/** Seconds a Powerstone takes to regain a point, by the mana where it is; null where it cannot (p. 69). */
export function rechargeSeconds(mana: ManaLevel): number | null {
  switch (mana) {
    case "low": return 7 * 86400;
    case "normal": return 86400;
    case "high": return 12 * 3600;
    case "veryHigh": return 6 * 3600;
    default: return null;
  }
}

/** One stone as the recharge sees it. */
export interface StoneState {
  capacity: number;
  charge: number;
  kind: PowerstoneKind;
  /** Whether it is kept with others -- within six feet of them. */
  together: boolean;
}

/**
 * The points each stone regains over a span of time (p. 69).
 *
 * "A Powerstone does not recharge if it is within six feet of a larger
 * Powerstone. Stones of the same size split the available mana" -- so, of the
 * stones kept together, only the largest regain anything, and several of that
 * size share what one would have regained. A stone kept apart recharges alone.
 * A Manastone never recharges, and "Manastones have no effect on the recharge
 * rate of nearby Powerstones" (p. 70). None goes past its capacity.
 */
export function rechargeStones(stones: readonly StoneState[], mana: ManaLevel, elapsedSeconds: number): number[] {
  const interval = rechargeSeconds(mana);
  const points = interval === null ? 0 : Math.floor(Math.max(0, elapsedSeconds) / interval);
  const rechargeable = (s: StoneState) => s.kind !== "manastone";
  const together = stones.filter((s) => s.together && rechargeable(s));
  const largest = together.reduce((most, s) => Math.max(most, s.capacity), 0);
  const sharing = together.filter((s) => s.capacity === largest).length;
  return stones.map((stone) => {
    if (!rechargeable(stone)) return stone.charge;
    let gain = points;
    if (stone.together) {
      if (stone.capacity < largest) gain = 0;
      else gain = Math.floor(points / Math.max(1, sharing));
    }
    return Math.min(stone.capacity, stone.charge + gain);
  });
}

/** Energy each point of a stone's charge delivers: two for a dedicated stone, three for an exclusive one (p. 70). */
export function energyPerPoint(kind: PowerstoneKind): number {
  return kind === "dedicated" ? 2 : kind === "exclusive" ? 3 : 1;
}

/**
 * Whether a stone may pay for a spell (p. 70). A One-College stone "can
 * provide energy only for spells of a particular college"; a dedicated or
 * exclusive one only for "the spells cast by or through that item".
 */
export function stoneCanPay(options: {
  kind: PowerstoneKind;
  college: string;
  /** The item the stone is set into, for a dedicated or exclusive one. */
  itemName: string;
  spellColleges: readonly string[];
  /** The magic item the spell is cast through, or null for the caster's own. */
  castThrough: string | null;
}): boolean {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  switch (options.kind) {
    case "oneCollege":
      return Boolean(options.college) && options.spellColleges.some((c) => same(c, options.college));
    case "dedicated":
    case "exclusive":
      return options.castThrough !== null && Boolean(options.itemName) && same(options.castThrough, options.itemName);
    default:
      return true;
  }
}

/**
 * What drawing on a stone does to a cost (p. 69): "Any wizard touching a
 * Powerstone may take any or all of the energy it contains, using it instead
 * of his body's own energy." Points are spent until the cost is met or the
 * stone is empty, each worth its kind's energy; whatever is left is the
 * caster's to pay.
 */
export function drawFromStone(options: { charge: number; kind: PowerstoneKind; cost: number }): {
  spent: number;
  covered: number;
  remaining: number;
} {
  const cost = Math.max(0, Math.floor(options.cost));
  const per = energyPerPoint(options.kind);
  const spent = Math.min(Math.max(0, Math.floor(options.charge)), Math.ceil(cost / per));
  const covered = Math.min(cost, spent * per);
  return { spent, covered, remaining: cost - covered };
}
