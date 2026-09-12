/**
 * What a trait costs (GURPS Basic Set: Characters, chapters 2 and 3).
 *
 * Most traits cost a flat number of points. Levelled ones usually charge the
 * same for every level -- Acute Hearing is 2 points a level, however many you
 * buy -- and those are fully described by a per-level price.
 *
 * A minority are priced from a table instead, and the steps are not even:
 * Wealth runs 10, 20, 30, 50, 75 for Comfortable through Multimillionaire, and
 * Appearance runs 4, 12, 12, 16, 16, 20. There is no per-level figure that
 * reproduces either, so those carry the table itself. The book gives each step
 * a name, which is how players actually refer to them -- nobody says "Wealth 4",
 * they say "Filthy Rich" -- so the names travel with the costs.
 */

/** The pricing of one trait. */
export interface TraitCost {
  /** Flat cost, used when the trait is neither levelled nor tabled. */
  points: number;
  /** Levels bought. */
  levels: number;
  /** Cost of each level, for a trait priced evenly. */
  pointsPerLevel: number;
  /**
   * Total cost at each level, level 1 first. Empty for a trait priced evenly.
   * These are totals, not increments: Wealth 3 (Very Wealthy) costs 30 points,
   * not 10 + 20 + 30.
   */
  costTable: readonly number[];
  /**
   * Enhancements and limitations, each as a percentage: +20 for Reliable,
   * -40 for Costs Fatigue. Empty for a trait taken as printed.
   */
  modifiers?: readonly number[];
  /** A disadvantage's self-control number -- 6, 9, 12 or 15 -- or null for none. */
  selfControl?: number | null;
}

/**
 * The base cost of a trait, before any modifier.
 *
 * A tabled trait is always worth at least its first step: a character who has
 * Wealth at all is at least Comfortable, and level 0 is the ordinary person who
 * simply does not take the trait. Levels above the table's end stay at its last
 * figure rather than extrapolating a step the book never prints.
 */
export function baseTraitPoints(trait: TraitCost): number {
  if (trait.costTable.length > 0) {
    const step = Math.min(Math.max(trait.levels, 1), trait.costTable.length);
    return trait.costTable[step - 1]!;
  }
  return trait.points + trait.levels * trait.pointsPerLevel;
}

/** Total character points a trait costs, modifiers and self-control included. */
export function traitPoints(trait: TraitCost): number {
  return modifiedPoints(baseTraitPoints(trait), trait.modifiers ?? [], trait.selfControl ?? null);
}

/**
 * "The net modifier can never be less than -80%" (GURPS Basic Set: Characters
 * p. 102): however many limitations are piled on, a trait is worth a fifth of
 * its cost.
 */
export const MIN_NET_MODIFIER = -80;

/**
 * What a self-control number does to a disadvantage's cost (Characters
 * p. 120): the harder it is to resist, the more it pays back.
 */
export const SELF_CONTROL_MULTIPLIERS: Readonly<Record<number, number>> = {
  6: 2,
  9: 1.5,
  12: 1,
  15: 0.5,
};

/** The sum of a trait's modifiers, floored where the book floors it. */
export function netModifier(modifiers: readonly number[]): number {
  const net = modifiers.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return Math.max(MIN_NET_MODIFIER, net);
}

/**
 * A cost after its self-control number and its modifiers (Characters
 * pp. 102, 120).
 *
 * The self-control multiplier goes on first, because it is part of what the
 * disadvantage is; the enhancements and limitations then scale the whole.
 * A fraction rounds away from zero -- 6.5 points is 7, and -6.5 is -7 -- so
 * a limitation never quite makes an advantage free, and a disadvantage pays
 * back what it costs to live with.
 */
export function modifiedPoints(
  base: number,
  modifiers: readonly number[],
  selfControl: number | null = null,
): number {
  const control = selfControl === null ? 1 : (SELF_CONTROL_MULTIPLIERS[selfControl] ?? 1);
  const scaled = base * control * (1 + netModifier(modifiers) / 100);
  return scaled < 0 ? -Math.ceil(-scaled - 1e-9) : Math.ceil(scaled - 1e-9);
}

/**
 * The book's name for a level, or null where it does not name one.
 *
 * Names are stored level 1 first, matching the cost table. Not every level is
 * named even in a trait that names some: Combat Reflexes names its second step
 * and not its first.
 */
export function traitLevelName(
  levelNames: readonly string[],
  level: number,
): string | null {
  const name = levelNames[level - 1];
  return name ? name : null;
}

/**
 * How a trait's cost should be described in a list: "15", "2/level", or the
 * table's steps. Written for a sheet, so it says what a player would say.
 */
export function traitCostLabel(trait: TraitCost): string {
  if (trait.costTable.length > 0) return trait.costTable.join("/");
  if (trait.pointsPerLevel !== 0) return `${trait.pointsPerLevel}/level`;
  return String(trait.points);
}

/**
 * Reads a cost table typed as text, the way the book prints it: "10/20/30/50/75".
 *
 * Commas are accepted alongside slashes because both read naturally, and a
 * segment that is not a whole number is dropped rather than stored -- the
 * schema takes integers, and NaN would be refused on save with nothing on
 * screen to say which character caused it.
 *
 * An empty field means the trait is not priced from a table at all, and must
 * come back as an empty list: a single zero would price the trait at nothing.
 */
export function parseCostTable(text: string): number[] {
  return text
    .split(/[/,]/)
    .map((step) => step.trim())
    .filter((step) => step !== "")
    .map(Number)
    .filter((step) => Number.isInteger(step));
}

/**
 * Reads level names typed one per line.
 *
 * Trailing blank lines are an artefact of typing rather than levels the book
 * leaves unnamed. A blank between two names is kept, because that is how a
 * trait that names only some of its levels is written -- Combat Reflexes names
 * its second step and not its first.
 */
export function parseLevelNames(text: string): string[] {
  const names = text.split("\n").map((name) => name.trim());
  while (names.length > 0 && names[names.length - 1] === "") names.pop();
  return names;
}

/**
 * The next level of a levelled trait, or the current one if it is already at
 * the top.
 *
 * Levels step one at a time -- unlike skill points, every level of a trait
 * buys something -- but they stop where the book stops. `maxLevels` is the cap
 * the book prints; a tabled trait also cannot go past the steps it prices,
 * since there would be no cost to charge.
 */
export function nextTraitLevel(trait: {
  levels: number;
  maxLevels: number;
  costTable: readonly number[];
}): number {
  const ceiling = traitLevelCeiling(trait);
  const next = Math.max(0, Math.floor(trait.levels)) + 1;
  return ceiling === null ? next : Math.min(next, ceiling);
}

/** The previous level, floored at none. */
export function previousTraitLevel(trait: { levels: number }): number {
  return Math.max(0, Math.floor(trait.levels) - 1);
}

/**
 * The highest level this trait can reach, or null where the book sets no
 * limit and the cost is a flat rate per level.
 */
export function traitLevelCeiling(trait: {
  maxLevels: number;
  costTable: readonly number[];
}): number | null {
  const capped = trait.maxLevels > 0 ? trait.maxLevels : null;
  const priced = trait.costTable.length > 0 ? trait.costTable.length : null;
  if (capped === null) return priced;
  if (priced === null) return capped;
  return Math.min(capped, priced);
}
