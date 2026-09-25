/**
 * Holdout (GURPS Basic Set: Characters p. 200).
 *
 * The skill of hiding things on your person. How well a thing hides turns on
 * its size and shape, which the skill's table gives as a modifier from +4 for
 * something the size of a postage stamp down to -6 for a crossbow; something
 * that moves or makes noise is -1 or worse on top, and what the character
 * wears counts too, from -7 for wearing nothing to +5 for the most concealing
 * of robes. Holdout defaults to IQ-5 or Sleight of Hand-3.
 *
 * Finding the thing is a Quick Contest of the searcher's Search against the
 * hider's Holdout, rolled by the GM in secret (p. 219), Search defaulting to
 * Perception-5 or Criminology-5.
 */

/** A row of the skill's size table: its key and the modifier it gives. */
export interface HoldoutSize {
  key: string;
  modifier: number;
}

/**
 * The size table (p. 200), largest bonus first. The keys name the book's
 * examples loosely; the modifier is what counts.
 */
export const HOLDOUT_SIZES: readonly HoldoutSize[] = Object.freeze([
  { key: "tiny", modifier: 4 },
  { key: "pea", modifier: 3 },
  { key: "coin", modifier: 2 },
  { key: "lockpickSet", modifier: 1 },
  { key: "disc", modifier: 0 },
  { key: "dagger", modifier: -1 },
  { key: "handgun", modifier: -2 },
  { key: "submachineGun", modifier: -3 },
  { key: "broadsword", modifier: -4 },
  { key: "bastardSword", modifier: -5 },
  { key: "crossbow", modifier: -6 },
].map((row) => Object.freeze(row)));

/** What a thing that moves or makes noise costs, at the least (p. 200). */
export const HOLDOUT_MOVING_PENALTY = -1;

/** Holdout's defaults (p. 200): IQ-5, or Sleight of Hand-3. */
export const HOLDOUT_IQ_DEFAULT = -5;
export const HOLDOUT_SLEIGHT_OF_HAND_DEFAULT = -3;
/** Search's defaults for the contest (p. 219): Perception-5, or Criminology-5. */
export const SEARCH_PERCEPTION_DEFAULT = -5;
export const SEARCH_CRIMINOLOGY_DEFAULT = -5;

/** What a character wears is worth from -7 (nothing at all) to +5 (p. 200). */
export const HOLDOUT_CLOTHING_MIN = -7;
export const HOLDOUT_CLOTHING_MAX = 5;

/** The clothing modifier, held to the page's range; 0 for anything not a number. */
export function holdoutClothingModifier(clothing: unknown): number {
  const n = Math.trunc(Number(clothing));
  if (!Number.isFinite(n)) return 0;
  return Math.max(HOLDOUT_CLOTHING_MIN, Math.min(HOLDOUT_CLOTHING_MAX, n));
}

/**
 * The size modifier for a thing: a row's key, or a modifier given as a
 * number (rounded toward zero). Null for anything else.
 */
export function holdoutSizeModifier(size: unknown): number | null {
  if (typeof size === "number") return Number.isFinite(size) ? Math.trunc(size) : null;
  if (typeof size === "string" && size.trim()) {
    const row = HOLDOUT_SIZES.find((r) => r.key === size.trim());
    if (row) return row.modifier;
    const number = Number(size);
    return Number.isFinite(number) ? Math.trunc(number) : null;
  }
  return null;
}

/**
 * What a thing that moves or makes noise costs: -1 for true, a given
 * penalty (as a negative number, -1 or worse) as it is, and nothing otherwise.
 */
export function holdoutMovingModifier(moving: unknown): number {
  if (moving === true) return HOLDOUT_MOVING_PENALTY;
  if (typeof moving === "number" && Number.isFinite(moving) && moving < 0) return Math.min(HOLDOUT_MOVING_PENALTY, Math.trunc(moving));
  return 0;
}

/**
 * What Holdout is rolled at: the skill where the character has it and it is
 * no worse than a default, else the better of IQ-5 and Sleight of Hand-3.
 */
export function holdoutLevel(options: { holdout: number | null; iq: number; sleightOfHand: number | null }): { level: number; from: "Holdout" | "IQ" | "Sleight of Hand" } {
  const candidates: Array<{ level: number; from: "Holdout" | "IQ" | "Sleight of Hand" }> = [
    { level: options.iq + HOLDOUT_IQ_DEFAULT, from: "IQ" },
  ];
  if (options.sleightOfHand !== null) candidates.push({ level: options.sleightOfHand + HOLDOUT_SLEIGHT_OF_HAND_DEFAULT, from: "Sleight of Hand" });
  if (options.holdout !== null) candidates.unshift({ level: options.holdout, from: "Holdout" });
  return candidates.reduce((best, next) => (next.level > best.level ? next : best));
}

/** What the searcher rolls: the best of Search, Perception-5 and Criminology-5 (p. 219). */
export function searchLevel(options: { search: number | null; per: number; criminology?: number | null }): { level: number; from: "Search" | "Per" | "Criminology" } {
  const candidates: Array<{ level: number; from: "Search" | "Per" | "Criminology" }> = [
    { level: options.per + SEARCH_PERCEPTION_DEFAULT, from: "Per" },
  ];
  if (options.criminology !== undefined && options.criminology !== null) {
    candidates.push({ level: options.criminology + SEARCH_CRIMINOLOGY_DEFAULT, from: "Criminology" });
  }
  if (options.search !== null) candidates.unshift({ level: options.search, from: "Search" });
  return candidates.reduce((best, next) => (next.level > best.level ? next : best));
}
