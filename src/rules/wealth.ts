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
 * The Cost of Living Table's monthly figure by Status (p. 265) -- "a
 * 'generic' cost of living for each Status level", the same at every tech
 * level, in the constant $ the book prices everything in.
 */
const COST_OF_LIVING: Readonly<Record<number, number>> = {
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

/** What a month at this Status costs (p. 265). */
export function costOfLiving(status: number): number {
  const clamped = Math.max(-2, Math.min(8, Math.floor(status)));
  return COST_OF_LIVING[clamped]!;
}

/**
 * "A fair monthly pay for someone of Average wealth working at a 'typical'
 * job for his tech level" (Campaigns p. 517), TL0 to TL12.
 */
export const TYPICAL_MONTHLY_PAY_BY_TL: readonly number[] = [
  625, 650, 675, 700, 800, 1100, 1600, 2100, 2600, 3600, 5600, 8100, 10600,
];

/**
 * What a job pays a month (Campaigns p. 517): the typical pay of the tech
 * level, "multipl[ied] ... by the starting wealth multiplier for that wealth
 * level". A Comfortable job at TL8 pays $5,200.
 */
export function monthlyPay(tl: number, jobLevel: Exclude<WealthLevel, "multimillionaire" | "deadBroke">): number {
  const index = Math.max(0, Math.min(TYPICAL_MONTHLY_PAY_BY_TL.length - 1, Math.floor(tl)));
  return Math.round(TYPICAL_MONTHLY_PAY_BY_TL[index]! * WEALTH_MULTIPLIERS[jobLevel]);
}

/**
 * Independent Income and Debt (Characters p. 26): each level is "1% of your
 * starting wealth (adjusted for wealth level)" a month, coming in or going
 * out, to a most of 20%.
 */
export function monthlyIncomeFromTraits(
  traits: readonly WealthTrait[],
  starting: number,
): { income: number; debt: number } {
  let incomeLevels = 0;
  let debtLevels = 0;
  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    if (key === "independent income") incomeLevels += levelsOf(trait);
    else if (key === "debt") debtLevels += levelsOf(trait);
  }
  const percent = (levels: number) => Math.min(20, levels) / 100;
  return {
    income: Math.round(starting * percent(incomeLevels)),
    debt: Math.round(starting * percent(debtLevels)),
  };
}

/**
 * What a point spent on money is worth (Characters p. 26): "Each point
 * yields 10% of the campaign's average starting wealth." The average, not
 * the character's own -- a Poor character's point is worth as much as a
 * Wealthy one's.
 */
export const MONEY_PER_POINT = 0.1;

export function pointsForMoney(points: number, tl: number): number {
  return Math.round(averageStartingWealth(tl) * MONEY_PER_POINT * Math.max(0, points));
}

/**
 * What Signature Gear is worth (p. 85): "each point in Signature Gear gives
 * goods worth up to 50% of the average campaign starting wealth".
 */
export const SIGNATURE_GEAR_PER_POINT = 0.5;

export function signatureGearValue(points: number, tl: number): number {
  return Math.round(averageStartingWealth(tl) * SIGNATURE_GEAR_PER_POINT * Math.max(0, points));
}

/** The points a character has put into Signature Gear, from the traits held. */
export function signatureGearPoints(traits: readonly WealthTrait[]): number {
  let points = 0;
  for (const trait of traits) {
    if (trait.name.trim().toLowerCase() === "signature gear") points += levelsOf(trait);
  }
  return points;
}

/**
 * What an article of clothing costs (p. 266), as a share of the wearer's
 * monthly cost of living: a complete wardrobe is the whole of it, ordinary
 * clothes a fifth, winter clothes 30%, formal wear 40%, a month of
 * cosmetics a tenth.
 *
 * "Use full Status to figure the cost of a complete wardrobe... When buying
 * just one outfit, though, treat Status greater than 3 as Status 3."
 */
export const WARDROBE_PERCENT = 100;

export function clothingCost(percentOfCostOfLiving: number, status: number): number {
  const wholeWardrobe = percentOfCostOfLiving >= WARDROBE_PERCENT;
  const effective = wholeWardrobe ? status : Math.min(3, status);
  return Math.round(costOfLiving(effective) * (percentOfCostOfLiving / 100));
}

/**
 * Equipment Modifiers (Campaigns p. 345): what the quality of your tools is
 * worth to the skill that uses them, and what that quality costs.
 *
 * "No equipment: -10 for technological skills, -5 for other skills.
 * Improvised equipment: -5 for technological skills, -2 for other skills.
 * Basic equipment: No modifier... Good-quality equipment: +1. Costs about
 * 5x basic price. Fine-quality equipment: +2. Costs about 20x basic price.
 * Best equipment possible at your TL: +TL/2, round down (minimum +2)."
 */
export const EQUIPMENT_QUALITIES = ["none", "improvised", "basic", "good", "fine", "best"] as const;
export type EquipmentQuality = (typeof EQUIPMENT_QUALITIES)[number];

export function equipmentQualityModifier(
  quality: EquipmentQuality,
  options: { technological?: boolean; tl?: number } = {},
): number {
  switch (quality) {
    case "none":
      return options.technological ? -10 : -5;
    case "improvised":
      return options.technological ? -5 : -2;
    case "basic":
      return 0;
    case "good":
      return 1;
    case "fine":
      return 2;
    case "best":
      // "+TL/2, round down (minimum +2)".
      return Math.max(2, Math.floor(Math.max(0, options.tl ?? 0) / 2));
  }
}

/** What a grade of equipment costs, as a multiple of the basic price (p. 345). */
export function equipmentQualityCost(quality: EquipmentQuality): number | null {
  switch (quality) {
    case "basic": return 1;
    case "good": return 5;
    case "fine": return 20;
    // Nothing is sold for no equipment, improvised gear is what came to hand,
    // and the best at a TL is "not usually for sale!"
    default: return null;
  }
}

/**
 * What a purchase comes to, and what it leaves (Characters pp. 25-27).
 *
 * Starting gear is bought out of starting wealth, which is why the sheet
 * reads what the gear cost against that figure and not against the cash in
 * hand. Anything bought afterwards is paid for in cash, and this is that
 * sum: the price times the number of them, what the money comes down to,
 * and how far short of it the character is. Money is dollars and cents, so
 * both figures are rounded to the cent rather than left to drift.
 */
export function purchase(options: { price: number; quantity: number; money: number }): {
  quantity: number;
  total: number;
  moneyAfter: number;
  short: number;
} {
  const quantity = Math.max(0, Math.floor(Number(options.quantity) || 0));
  const price = Number.isFinite(options.price) ? Math.max(0, Number(options.price)) : 0;
  const money = Number.isFinite(options.money) ? Number(options.money) : 0;
  const total = Math.round(price * quantity * 100) / 100;
  const moneyAfter = Math.round((money - total) * 100) / 100;
  return { quantity, total, moneyAfter, short: moneyAfter < 0 ? Math.abs(moneyAfter) : 0 };
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

/**
 * What a tool gives the skills it serves: a stated number where the item has
 * one (a kit that gives -2, which no grade does), the grade's modifier otherwise
 * (since API 1.63.0).
 */
export function toolModifier(quality: EquipmentQuality, statedModifier: number | null | undefined, options: { technological?: boolean; tl?: number } = {}): number {
  return typeof statedModifier === "number" && Number.isFinite(statedModifier)
    ? Math.trunc(statedModifier)
    : equipmentQualityModifier(quality, options);
}
