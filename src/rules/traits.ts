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
}

/**
 * Total character points a trait costs.
 *
 * A tabled trait is always worth at least its first step: a character who has
 * Wealth at all is at least Comfortable, and level 0 is the ordinary person who
 * simply does not take the trait. Levels above the table's end stay at its last
 * figure rather than extrapolating a step the book never prints.
 */
export function traitPoints(trait: TraitCost): number {
  if (trait.costTable.length > 0) {
    const step = Math.min(Math.max(trait.levels, 1), trait.costTable.length);
    return trait.costTable[step - 1]!;
  }
  return trait.points + trait.levels * trait.pointsPerLevel;
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
