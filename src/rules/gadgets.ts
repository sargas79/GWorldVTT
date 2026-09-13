/**
 * Improving gear with cost factors (GURPS Monster Hunters 1: Champions
 * pp. 53-54, 59).
 *
 * "Each modifier has a 'cost factor' (CF). To find the final cost of an item,
 * multiply its base cost by (1 + total CF) ... Weight effects multiply
 * together." So improvements add, and weights multiply: a cutting-edge,
 * rugged flashlight is three times its price and 0.8 times its weight.
 */

/** The improvements a gadget or an article of clothing can be made with. */
export interface GadgetImprovements {
  /** "Made of the latest materials. Multiply weight by 2/3. +1 CF." */
  cuttingEdge?: boolean;
  /** "The item resembles something else of a similar shape ... +4 CF." */
  disguised?: boolean;
  /** "Shockproof and waterproof, giving +2 on rolls to avoid breakage, water damage, etc. Multiply weight by 1.2. +1 CF." */
  rugged?: boolean;
  /** Clothing (p. 59): "giving -4 to Smell rolls to find the wearer ... +2 CF." */
  scentMasking?: boolean;
  /** Clothing (p. 59): "a Holdout bonus: +1 bonus for +4 CF, +2 for +19 CF." Zero for none. */
  undercover?: number;
}

/** The grades a gadget can be bought in, as the book prices them (p. 54). */
export type GadgetQuality = "basic" | "good" | "fine";

/** "Fine-Quality ... +19 CF. Good-Quality ... +4 CF", mutually exclusive. */
export const GADGET_QUALITY_CF: Readonly<Record<GadgetQuality, number>> = { basic: 0, good: 4, fine: 19 };

/** Undercover's Holdout bonus, from none to +2. */
function undercoverLevel(level: number | undefined): 0 | 1 | 2 {
  const n = Math.floor(Number(level) || 0);
  return n >= 2 ? 2 : n === 1 ? 1 : 0;
}

/**
 * The total cost factor of an item's improvements and grade. A grade other
 * than good or fine, and any grade on "labs and tool kits", which "do not
 * take quality modifiers", adds nothing.
 */
export function gadgetCostFactor(improvements: GadgetImprovements, quality: string = "basic"): number {
  let cf = 0;
  if (improvements.cuttingEdge) cf += 1;
  if (improvements.disguised) cf += 4;
  if (improvements.rugged) cf += 1;
  if (improvements.scentMasking) cf += 2;
  cf += [0, 4, 19][undercoverLevel(improvements.undercover)]!;
  cf += GADGET_QUALITY_CF[quality as GadgetQuality] ?? 0;
  return cf;
}

/** "Weight effects multiply together." */
export function gadgetWeightFactor(improvements: GadgetImprovements): number {
  return (improvements.cuttingEdge ? 2 / 3 : 1) * (improvements.rugged ? 1.2 : 1);
}

/**
 * An improved item's price and weight from its list figures: cost times
 * (1 + CF), weight times the product of the weight effects, to the cent and
 * the hundredth of a pound.
 */
export function improvedGadget(options: {
  listCost: number;
  listWeight: number;
  improvements: GadgetImprovements;
  quality?: string;
}): { cost: number; weight: number; costFactor: number; weightFactor: number } {
  const costFactor = gadgetCostFactor(options.improvements, options.quality);
  const weightFactor = gadgetWeightFactor(options.improvements);
  return {
    cost: Math.round(Math.max(0, options.listCost) * (1 + costFactor) * 100) / 100,
    weight: Math.round(Math.max(0, options.listWeight) * weightFactor * 100) / 100,
    costFactor,
    weightFactor,
  };
}

/** Rugged's bonus "on rolls to avoid breakage, water damage, etc." */
export const RUGGED_BONUS = 2;

/** Scent-Masking's penalty to "Smell rolls to find the wearer (or track him by scent)". */
export const SCENT_MASKING_PENALTY = -4;

/**
 * An article's Holdout bonus: its own, as the table gives it -- a long coat
 * "Gives +4 to Holdout. Can be made undercover for a larger bonus!" -- with
 * Undercover's added.
 */
export function holdoutBonus(options: { own: number; undercover?: number }): number {
  return Math.max(0, Math.floor(Number(options.own) || 0)) + undercoverLevel(options.undercover);
}

/**
 * Signature Gear's price (p. 53): "1 point for every $10,000 or fraction
 * thereof that the gear costs. For items under $10,000, this boils down to
 * '1 point per piece of equipment.'" The were-hunter's $7,700 saber is
 * Signature Gear [1].
 */
export function signatureGearPointCost(cost: number): number {
  return Math.max(1, Math.ceil(Math.max(0, cost) / 10000));
}
