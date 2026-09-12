/**
 * Getting better again (GURPS Basic Set: Campaigns pp. 423-427).
 *
 * Every fight so far has ended with wounded characters and no way to mend them
 * short of typing a new number into the sheet. This is the other half: what
 * rest, a bandage and a night's sleep are worth.
 *
 * All of it is slow on purpose. A day of rest and a good HT roll is one hit
 * point, and the First Aid that follows a fight is a die at best. GURPS heals
 * at the speed of a body, and nothing here is in a hurry to change that.
 */

import type { DiceAdds } from "./types.js";

/**
 * How much faster something large heals (p. 424).
 *
 * "The healing rates given for natural recovery, first aid, magical healing
 * spells... assume someone with human-scale Hit Points; that is, with fewer
 * than 20 HP. Those with more HP heal in proportion to their HP score. Multiply
 * HP healed by 2 at 20-29 HP, by 3 at 30-39 HP, by 4 at 40-49 HP, and so on."
 */
export function healingMultiplier(maxHp: number): number {
  if (maxHp < 20) return 1;
  return Math.floor(maxHp / 10);
}

// ── regeneration (Characters p. 80) ───────────────────────────────────────

/** A rate of Regeneration: how many seconds each hit point takes to come back. */
export interface RegenerationRate {
  key: "slow" | "regular" | "fast" | "veryFast" | "extreme";
  /** Seconds per hit point regained. Under one for Extreme, which is ten a second. */
  secondsPerHp: number;
}

/** The five rates the book prices, in the order the compendium levels them. */
export const REGENERATION_RATES: readonly RegenerationRate[] = [
  { key: "slow", secondsPerHp: 12 * 3600 },
  { key: "regular", secondsPerHp: 3600 },
  { key: "fast", secondsPerHp: 60 },
  { key: "veryFast", secondsPerHp: 1 },
  { key: "extreme", secondsPerHp: 0.1 },
];

/** The rate a trait at this level regenerates at, or null for no Regeneration. */
export function regenerationRate(level: number): RegenerationRate | null {
  const index = Math.floor(level);
  if (index <= 0) return null;
  return REGENERATION_RATES[Math.min(index, REGENERATION_RATES.length) - 1] ?? null;
}

/**
 * Hit points regained in a span of time, whole points only: a Slow
 * regenerator eleven hours into their twelfth has nothing back yet.
 */
export function regeneratedHp(rate: RegenerationRate["key"], seconds: number): number {
  const found = REGENERATION_RATES.find((r) => r.key === rate);
  if (!found || seconds <= 0) return 0;
  return Math.floor(seconds / found.secondsPerHp + 1e-9);
}

// ── natural recovery (p. 424) ───────────────────────────────────────────────

/**
 * What a day of rest restores on a successful HT roll (p. 424).
 *
 * "At the end of each day of rest and decent food, make a HT roll. On a
 * success, you recover 1 HP." One point, multiplied for anything larger than a
 * person.
 */
export function naturalRecovery(maxHp: number): number {
  return healingMultiplier(maxHp);
}

// ── first aid (p. 424) ──────────────────────────────────────────────────────

/** One row of the First Aid Table: how long it takes, and what it restores. */
export interface FirstAidEntry {
  /** The lowest tech level this row covers. */
  fromTl: number;
  minutes: number;
  restored: DiceAdds;
}

/**
 * The First Aid Table (p. 424), by tech level.
 *
 * Bandaging alone restores 1 HP and takes a minute; this is the fuller
 * treatment that follows it, and "this roll includes the 1 HP for bandaging".
 */
export const FIRST_AID_TABLE: readonly FirstAidEntry[] = [
  { fromTl: 0, minutes: 30, restored: { dice: 1, adds: -4 } },
  { fromTl: 2, minutes: 30, restored: { dice: 1, adds: -3 } },
  { fromTl: 4, minutes: 30, restored: { dice: 1, adds: -2 } },
  { fromTl: 5, minutes: 20, restored: { dice: 1, adds: -2 } },
  { fromTl: 6, minutes: 20, restored: { dice: 1, adds: -1 } },
  { fromTl: 8, minutes: 10, restored: { dice: 1, adds: 0 } },
  { fromTl: 9, minutes: 10, restored: { dice: 1, adds: 1 } },
];

/** What bandaging alone is worth, before any First Aid roll (p. 424). */
export const BANDAGING_HP = 1;

/** What a critical failure at First Aid costs the patient (p. 424). */
export const FIRST_AID_CRITICAL_FAILURE_HP = -2;

/** The First Aid Table row a tech level reads. */
export function firstAidAt(techLevel: number): FirstAidEntry {
  const tl = Math.max(0, Math.floor(techLevel));
  let found = FIRST_AID_TABLE[0]!;
  for (const row of FIRST_AID_TABLE) {
    if (tl >= row.fromTl) found = row;
  }
  return found;
}

/** How a First Aid attempt went, as the roll reports it. */
export interface FirstAidOutcome {
  success: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
}

/**
 * What a First Aid attempt restores (p. 424).
 *
 * "On a success, the medic rolls as indicated on the table to see how many HP
 * the victim recovers -- minimum 1 HP. A critical success restores the maximum
 * possible HP!... On a critical failure, the victim loses 2 HP instead of
 * recovering any HP at all!"
 *
 * A plain failure restores nothing beyond the bandaging that came first, which
 * is why this can return zero without anything having gone wrong.
 */
export function firstAidRecovery(options: {
  techLevel: number;
  outcome: FirstAidOutcome;
  /** What the table's dice came up, ignored on a critical either way. */
  rolled: number;
  maxHp: number;
}): number {
  const { outcome, rolled, maxHp } = options;
  const entry = firstAidAt(options.techLevel);
  const multiplier = healingMultiplier(maxHp);

  if (outcome.criticalFailure) return FIRST_AID_CRITICAL_FAILURE_HP;
  if (!outcome.success) return 0;

  const maximum = entry.restored.dice * 6 + entry.restored.adds;
  const restored = outcome.criticalSuccess ? maximum : rolled;

  // "minimum 1 HP", before the multiplier: a TL0 roll of 1d-4 can come up
  // negative, and a medic never makes a patient worse by succeeding.
  return Math.max(1, restored) * multiplier;
}

// ── fatigue (p. 427) ────────────────────────────────────────────────────────

/** Minutes of rest one point of fatigue comes back in (p. 427). */
export const FP_PER_REST_MINUTES = 10;

/**
 * Fatigue recovered by resting quietly (p. 427).
 *
 * "Lost FP return at the rate of 1 FP per 10 minutes of rest. The GM may allow
 * you to regain one extra FP if you eat a decent meal while resting."
 *
 * Reading, talking and thinking are rest; walking around is not, which is the
 * GM's judgement and not a parameter.
 */
export function fatigueRecovered(options: { minutes: number; meal?: boolean }): number {
  const rested = Math.floor(Math.max(0, options.minutes) / FP_PER_REST_MINUTES);
  return rested + (options.meal ? 1 : 0);
}

// ── waking up again (p. 423) ────────────────────────────────────────────────

/** What it takes to come round, given how badly hurt you are. */
export type WakingKind = "automatic" | "hourly" | "mortal";

export interface Waking {
  kind: WakingKind;
  /** Minutes until it happens, or until the next roll. */
  minutes: number;
  /** True when a HT roll is needed rather than time alone. */
  needsRoll: boolean;
}

/**
 * Recovering from unconsciousness (p. 423).
 *
 * "If you have 1 or more HP remaining, you awaken automatically in 15 minutes.
 * At 0 HP or worse, but above -1xHP, make a HT roll to awaken every hour. At
 * -1xHP or below, you are in bad shape. You get a single HT roll to awaken
 * after 12 hours."
 *
 * The last of those is the one that matters: fail it and "you won't regain
 * consciousness without medical treatment", and a HT roll every 12 hours after
 * that decides whether you live.
 */
export function wakingFrom(currentHp: number, maxHp: number): Waking {
  if (currentHp >= 1) return { kind: "automatic", minutes: 15, needsRoll: false };
  if (maxHp > 0 && currentHp <= -maxHp) {
    return { kind: "mortal", minutes: 12 * 60, needsRoll: true };
  }
  return { kind: "hourly", minutes: 60, needsRoll: true };
}
