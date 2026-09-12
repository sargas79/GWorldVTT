/**
 * Money (GURPS Basic Set: Characters pp. 25-27, 264-266; Campaigns pp. 516-517).
 *
 * Wealth on the sheet was a point cost and a name. This is what the name is
 * worth: the starting wealth of the tech level, multiplied by the level of
 * Wealth; what a month of the character's Status costs to keep up; and what a
 * job at a given level of Wealth pays. All three come off one table and one
 * figure, which is why they live together.
 */

/** Starting wealth by tech level, in $ (p. 27). */
export const STARTING_WEALTH_BY_TL: readonly number[] = [
  250, 500, 750, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000,
];

/** The tech level whose starting wealth the Status table is written for (p. 265). */
export const STATUS_TABLE_TL = 8;

export type WealthLevel =
  | "deadBroke"
  | "poor"
  | "struggling"
  | "average"
  | "comfortable"
  | "wealthy"
  | "veryWealthy"
  | "filthyRich"
  | "multimillionaire";

/** What each level of Wealth multiplies the starting wealth by (p. 25). */
export const WEALTH_MULTIPLIERS: Readonly<Record<Exclude<WealthLevel, "multimillionaire">, number>> = {
  deadBroke: 0,
  poor: 0.2,
  struggling: 0.5,
  average: 1,
  comfortable: 2,
  wealthy: 5,
  veryWealthy: 20,
  filthyRich: 100,
};

/** The levels of the Wealth advantage, in the compendium's order (p. 25). */
const ADVANTAGE_LEVELS: readonly WealthLevel[] = [
  "comfortable", "wealthy", "veryWealthy", "filthyRich", "multimillionaire",
];
/** The levels of Wealth as a disadvantage: Struggling, Poor, Dead Broke. */
const DISADVANTAGE_LEVELS: readonly WealthLevel[] = ["struggling", "poor", "deadBroke"];

/** A trait as the sheet holds it, for reading Wealth and Status off. */
export interface WealthTrait {
  name: string;
  levels?: number;
}

/** A character's Wealth, as the trait on the sheet says it. */
export interface WealthStanding {
  level: WealthLevel;
  /**
   * Multimillionaire's own level: 1 for the first, each one ten times the
   * last (p. 25). Zero for everybody else.
   */
  multimillionaire: number;
}

function levelsOf(trait: WealthTrait): number {
  return Math.max(1, Math.floor(trait.levels ?? 0) || 1);
}

/** Wealth from the traits held: Average for anyone without the trait. */
export function wealthFrom(traits: readonly WealthTrait[]): WealthStanding {
  let standing: WealthStanding = { level: "average", multimillionaire: 0 };
  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    const levels = levelsOf(trait);
    if (key === "wealth") {
      const index = Math.min(levels, ADVANTAGE_LEVELS.length) - 1;
      const level = ADVANTAGE_LEVELS[index]!;
      standing = {
        level,
        multimillionaire: level === "multimillionaire" ? levels - ADVANTAGE_LEVELS.length + 1 : 0,
      };
    } else if (key === "wealth (disadvantage)") {
      standing = { level: DISADVANTAGE_LEVELS[Math.min(levels, DISADVANTAGE_LEVELS.length) - 1]!, multimillionaire: 0 };
    }
  }
  return standing;
}

/** The multiplier a standing is worth (p. 25). */
export function wealthMultiplier(standing: WealthStanding): number {
  if (standing.level === "multimillionaire") {
    // "Multimillionaire 1 ... 1,000 times average starting wealth", and
    // "each additional level ... multiplies by 10".
    return 1000 * 10 ** Math.max(0, standing.multimillionaire - 1);
  }
  return WEALTH_MULTIPLIERS[standing.level];
}

/** Starting wealth for a tech level, before Wealth (p. 27). */
export function averageStartingWealth(tl: number): number {
  const index = Math.max(0, Math.min(STARTING_WEALTH_BY_TL.length - 1, Math.floor(tl)));
  return STARTING_WEALTH_BY_TL[index]!;
}

/** What this character started with (pp. 25, 27). */
export function startingWealth(tl: number, standing: WealthStanding): number {
  return averageStartingWealth(tl) * wealthMultiplier(standing);
}

/**
 * The Status Table's monthly cost of living, by Status (p. 265).
 *
 * Written for TL8; "at other TLs, multiply by the TL's starting wealth divided
 * by $20,000", which is the same ratio the rest of the money is on.
 */
const COST_OF_LIVING_TL8: Readonly<Record<number, number>> = {
  [-2]: 100,
  [-1]: 300,
  0: 600,
  1: 1200,
  2: 3000,
  3: 12000,
  4: 60000,
  5: 600000,
  6: 6000000,
  7: 60000000,
  8: 600000000,
};

/** Status from the traits held: 0 for anyone without one (p. 28). */
export function statusFrom(traits: readonly WealthTrait[]): number {
  let status = 0;
  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    if (key === "status") status += levelsOf(trait);
    else if (key === "status (disadvantage)") status -= levelsOf(trait);
  }
  return Math.max(-2, Math.min(8, status));
}

/** What a month at this Status costs at this tech level (p. 265). */
export function costOfLiving(status: number, tl: number): number {
  const clamped = Math.max(-2, Math.min(8, Math.floor(status)));
  const atTl8 = COST_OF_LIVING_TL8[clamped]!;
  return Math.round(atTl8 * (averageStartingWealth(tl) / averageStartingWealth(STATUS_TABLE_TL)));
}

/**
 * What a job pays a month (Campaigns p. 517).
 *
 * "The monthly pay for a job is ... a multiple of the average monthly pay,
 * which is starting wealth for the TL divided by 10" -- so an Average job at
 * TL8 pays $2,000, and a Wealthy one five times that.
 */
export const MONTHS_OF_STARTING_WEALTH = 10;

export function monthlyPay(tl: number, jobLevel: Exclude<WealthLevel, "multimillionaire" | "deadBroke">): number {
  return Math.round((averageStartingWealth(tl) / MONTHS_OF_STARTING_WEALTH) * WEALTH_MULTIPLIERS[jobLevel]);
}

/** The cost of what is carried and stored, for reading against starting wealth. */
export function gearCost(items: ReadonlyArray<{ cost?: number; quantity?: number }>): number {
  let total = 0;
  for (const item of items) {
    const cost = Number(item.cost ?? 0);
    const quantity = Number(item.quantity ?? 1);
    if (Number.isFinite(cost) && Number.isFinite(quantity)) total += cost * quantity;
  }
  return total;
}
