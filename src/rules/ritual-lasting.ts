/**
 * What becomes of a ritual once it is cast (GURPS Monster Hunters 1:
 * Champions pp. 37-39): how long it lasts and how it is extended, rituals
 * held back until a condition is met, charms, and what happens when two
 * rituals overlap.
 */

import { RITUAL_DURATIONS, type RitualEffectEntry } from "./ritual-cost.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A month on the Ritual Effect Table, taken as thirty days. */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** The seconds each line of the Ritual Effect Table's durations lasts (p. 35). */
export const RITUAL_DURATION_SECONDS: Readonly<Record<(typeof RITUAL_DURATIONS)[number], number>> = {
  momentary: 0,
  "10min": 10 * MINUTE,
  "30min": 30 * MINUTE,
  "1hr": HOUR,
  "3hr": 3 * HOUR,
  "6hr": 6 * HOUR,
  "12hr": 12 * HOUR,
  "1day": DAY,
  "3days": 3 * DAY,
  "1week": 7 * DAY,
  "2weeks": 14 * DAY,
  "1month": MONTH,
};

/** How long a ritual lasts, in seconds; zero for a momentary one (p. 35). */
export function ritualDurationSeconds(options: { step: number; extraMonths?: number; years?: number }): number {
  if ((options.years ?? 0) > 0) return Math.ceil(options.years!) * YEAR;
  const step = Math.max(0, Math.min(RITUAL_DURATIONS.length - 1, Math.floor(options.step)));
  const base = RITUAL_DURATION_SECONDS[RITUAL_DURATIONS[step]!];
  return base + (step === RITUAL_DURATIONS.length - 1 ? Math.max(0, Math.floor(options.extraMonths ?? 0)) * MONTH : 0);
}

/**
 * Extending a ritual (p. 37): "The energy cost is equal to that required for
 * the additional duration ... An extension ritual cannot lengthen a spell by
 * more than its original duration", so a week-long spell is extended "one
 * week at a time (as four separate, 9-energy extension rituals)". The
 * energy is the added duration's line; null where it would add more than the
 * spell first lasted.
 */
export function extensionEnergy(options: { originalSeconds: number; addedStep: number }): number | null {
  const step = Math.max(1, Math.min(RITUAL_DURATIONS.length - 1, Math.floor(options.addedStep)));
  if (ritualDurationSeconds({ step }) > options.originalSeconds) return null;
  return step;
}

/**
 * "This requires adding a Lesser Control Magic effect to the spell" (p. 38):
 * whether a ritual may be cast conditionally.
 */
export function mayBeConditional(effects: readonly RitualEffectEntry[]): boolean {
  return effects.some((e) => e.path === "Magic" && e.effect === "control" && !e.greater);
}

/**
 * "Any given caster can only have (Thaumatology + Magery) conditional rituals
 * 'hanging' at once" (p. 38). Magery 0, or none, adds nothing.
 */
export function conditionalLimit(options: { thaumatology: number | null; magery: number | null }): number {
  return Math.max(0, (options.thaumatology ?? 0) + Math.max(0, options.magery ?? 0));
}

/**
 * A new conditional ritual among those already hanging (p. 38): "If he were
 * to cast a 19th one, his oldest conditional spell would be immediately
 * defused without effect." The list is oldest first; what comes back is the
 * list to keep and the rituals that were defused.
 */
export function hangConditional<T>(hanging: readonly T[], added: T, limit: number): { hanging: T[]; defused: T[] } {
  const all = [...hanging, added];
  const over = Math.max(0, all.length - Math.max(0, limit));
  return { hanging: all.slice(over), defused: all.slice(0, over) };
}

/** An effect as the stacking rules compare it: Greater and Lesser are different (p. 37). */
function effectKey(e: RitualEffectEntry): string {
  return `${e.greater ? "Greater" : "Lesser"} ${e.effect.charAt(0).toUpperCase()}${e.effect.slice(1)} ${e.path}`;
}

/**
 * The effects two rituals share (p. 37): "A person cannot be under the
 * influence of the same spell effect from different rituals ... the spell
 * which took more energy to cast remains, while the other fizzles". Only
 * the table knows whether they are on the same person, so this says which
 * effects would collide.
 */
export function sharedEffects(a: readonly RitualEffectEntry[], b: readonly RitualEffectEntry[]): string[] {
  const other = new Set(b.map(effectKey));
  return [...new Set(a.map(effectKey))].filter((key) => other.has(key));
}

/** Which of two overlapping rituals remains: the one that took more energy; a tie keeps the one already there. */
export function stackingSurvivor(existingEnergy: number, newEnergy: number): "existing" | "new" {
  return newEnergy > existingEnergy ? "new" : "existing";
}

/**
 * Where a charm is made (p. 39): "working in the field with nothing gives -5
 * to all skill rolls to make a charm, borrowing a friend's kitchen gives -2,
 * a normal workspace kit gives no modifier, a good-quality one gives +1, and
 * a fine-quality kit gives +2."
 */
export const CHARM_WORKSPACES = { none: -5, borrowed: -2, basic: 0, good: 1, fine: 2 } as const;
export type CharmWorkspace = keyof typeof CHARM_WORKSPACES;

/** "The actual creation requires 30 minutes to prepare the object" (p. 39). */
export const CHARM_PREPARATION_SECONDS = 30 * MINUTE;
