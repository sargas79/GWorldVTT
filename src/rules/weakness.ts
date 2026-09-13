/**
 * Weakness (GURPS Basic Set: Characters p. 161).
 *
 * "You suffer injury merely by being in the presence of a particular
 * substance or condition ... This injury comes off your HP directly,
 * regardless of your DR or defensive advantages." The level bought is how
 * quickly: 1d per 30 minutes, per 5 minutes, or per minute, which is how the
 * compendium names its three levels.
 *
 * Two limitations change what it does. Fatigue Only drains FP instead of HP.
 * Variable halves the rate behind "one relatively common class of barriers"
 * and doubles it for an intense source, so the same minute in the sun is half
 * a die behind sunscreen and two dice at noon in the desert.
 */

/** The minutes each level's die takes: level 1 is the slowest. */
export const WEAKNESS_INTERVALS: readonly number[] = [30, 5, 1];

/** One Weakness a character has. */
export interface Weakness {
  /** What it is to, as the trait's name says: "Sunlight", "Contact with holy water". */
  source: string;
  /** Minutes of exposure per 1d of injury. */
  intervalMinutes: number;
  /** "Fatigue Only": FP rather than HP. */
  fatigue: boolean;
  /** "Variable": halved behind its barrier, doubled by an intense source. */
  variable: boolean;
}

/** How strong the exposure is, which only a Variable Weakness notices. */
export type WeaknessIntensity = "shielded" | "normal" | "intense";

/** A trait as this module reads one. */
export interface WeaknessTrait {
  name: string;
  levels?: number;
  modifiers?: readonly string[];
}

/**
 * Reads a Weakness off a trait, or null for any other trait.
 *
 * What it is to is the parenthesis -- "Weakness (Sunlight; 1d per minute)"
 * names the rate there too, and that part is dropped, since the level already
 * says it. A Weakness bought before its level was set is read as the slowest.
 */
export function weaknessOf(trait: WeaknessTrait): Weakness | null {
  const name = trait.name.trim();
  if (!/^weakness\b/i.test(name)) return null;
  const level = Math.max(1, Math.min(WEAKNESS_INTERVALS.length, Math.floor(trait.levels ?? 1) || 1));
  const inside = /\((.*)\)\s*$/.exec(name)?.[1] ?? "";
  const source = inside
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !/^1d per\b/i.test(part) && !/^variable$/i.test(part))
    .join("; ");
  const modifiers = (trait.modifiers ?? []).map((m) => m.toLowerCase());
  return {
    source,
    intervalMinutes: WEAKNESS_INTERVALS[level - 1]!,
    fatigue: modifiers.some((m) => m.includes("fatigue only")),
    variable: modifiers.some((m) => /\bvariable\b/.test(m)) || /\bvariable\b/i.test(inside),
  };
}

/**
 * How many 1d a spell of exposure costs.
 *
 * One die per interval, whole intervals only: a vampire who steps into the sun
 * for twenty seconds has not yet been in it for the minute that costs a die.
 * The rate changes only for a Variable Weakness -- anything else takes the
 * same injury behind a parasol as in the open.
 */
export function weaknessDice(
  weakness: Pick<Weakness, "intervalMinutes" | "variable">,
  minutes: number,
  intensity: WeaknessIntensity = "normal",
): number {
  const factor = !weakness.variable ? 1 : intensity === "shielded" ? 2 : intensity === "intense" ? 0.5 : 1;
  const interval = weakness.intervalMinutes * factor;
  return Math.max(0, Math.floor(Math.max(0, minutes) / interval));
}
