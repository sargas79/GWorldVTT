/**
 * The effective skill level, worked out before the dice are thrown.
 *
 * The chat card has always shown the sum after the fact: base, each signed
 * modifier, and the target that was rolled against. What it could not do is
 * show it beforehand, which is when it matters -- a shooter deciding whether
 * to aim another second, or to step out of cover, is choosing between numbers
 * they could not see.
 *
 * The lines come from the same `rangedModifiers` and roll-line functions the
 * card is built from, so the two cannot disagree: this module only groups them,
 * totals them, and says where each came from.
 */

/** A modifier as the roll code passes it about: a label and a signed value. */
export interface BreakdownModifier {
  label: string;
  value: number;
}

/** One line of the breakdown. */
export interface BreakdownLine {
  label: string;
  value: number;
  /**
   * Automatic lines follow from the character's state and the map -- shock,
   * posture, range, the light. Manual ones were typed or ticked in the dialog.
   * The distinction is what the player needs in order to know which numbers
   * are theirs to change.
   */
  automatic: boolean;
}

/** What the roll will be made against, and how it got there. */
export interface RollBreakdown {
  base: number;
  lines: BreakdownLine[];
  /** The sum of the lines shown. */
  total: number;
  /** A ceiling the roll cannot pass, such as a Move and Attack's, or null. */
  cap: number | null;
  /** The number actually rolled against, after any cap. */
  effective: number;
}

/** A group of modifiers that share a source. */
export interface BreakdownGroup {
  modifiers: readonly (BreakdownModifier | null | undefined)[];
  automatic: boolean;
}

/**
 * Gathers the groups into one breakdown.
 *
 * A modifier worth nothing is dropped rather than shown as "+0": the list is
 * meant to explain the number, and a line that changes nothing explains
 * nothing. A malformed value is dropped for the same reason -- it would
 * otherwise turn the total into NaN and take the whole display with it.
 */
export function rollBreakdown(
  base: number,
  groups: readonly BreakdownGroup[],
  options: { cap?: number | null } = {},
): RollBreakdown {
  const start = Number(base) || 0;
  const lines: BreakdownLine[] = [];

  for (const group of groups) {
    for (const modifier of group.modifiers ?? []) {
      if (!modifier) continue;
      const value = Number(modifier.value);
      if (!Number.isFinite(value) || value === 0) continue;
      lines.push({ label: String(modifier.label ?? ""), value, automatic: group.automatic });
    }
  }

  const total = start + lines.reduce((sum, line) => sum + line.value, 0);
  const cap = options.cap ?? null;
  return { base: start, lines, total, cap, effective: cap === null ? total : Math.min(total, cap) };
}

/** A value written the way a modifier reads: +2, -4, never a bare 2. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
