/**
 * Mending what is broken, and what breaks it (GURPS Basic Set: Campaigns
 * pp. 484-485).
 *
 * Damage to objects said what a thing can take; this is the other half of
 * that chapter. "Most artifacts cannot heal naturally... If they become
 * disabled, they cannot recover until repaired." A repair is a skill roll
 * against the thing's price, half an hour at a time, and what it gives back
 * is the margin. Beneath that sit the two rules that break gear without
 * anyone striking it: missed maintenance, and a day in the sand.
 */

import { objectState, type ObjectState } from "./objects.js";

// ── what a repair is (p. 484) ──────────────────────────────────────────────

/** How far gone the thing is, which decides what mending it takes. */
export type RepairKind = "none" | "minor" | "major" | "beyondRepair";

/**
 * "Each attempt to repair damaged equipment that still has positive HP"
 * is a minor repair; "an artifact reduced to zero or negative HP requires
 * spare parts"; and a destroyed one "is beyond repair. Replace it at 100%
 * of its original cost."
 */
export function repairKind(options: { hpLost: number; hp: number; destroyed?: boolean }): RepairKind {
  if (options.destroyed) return "beyondRepair";
  if (options.hp <= 0) return "none";
  const lost = Math.max(0, options.hpLost);
  if (lost === 0) return "none";
  const state: ObjectState = objectState(options.hp - lost, options.hp);
  if (state === "destroyed") return "beyondRepair";
  return options.hp - lost > 0 ? "minor" : "major";
}

/** Half an hour an attempt (p. 484). */
export const REPAIR_HOURS = 0.5;

/**
 * What the thing's price does to the roll (p. 484): "if the device costs
 * $1,000 or less, roll at +1. Roll at -1 if it costs $10,001-$100,000, at
 * -2 if it costs $100,001-$1,000,000, or at -3 if it costs over
 * $1,000,000."
 *
 * The book leaves $1,001 to $10,000 unmodified, which is the gap between
 * the +1 band and the first penalty.
 */
export function priceModifier(cost: number): number {
  const price = Math.max(0, cost);
  if (price <= 1000) return 1;
  if (price <= 10000) return 0;
  if (price <= 100000) return -1;
  if (price <= 1000000) return -2;
  return -3;
}

/** "All rolls are at an extra -2" for a major repair (p. 484). */
export const MAJOR_REPAIR_PENALTY = -2;

/** Everything that goes into one repair attempt. */
export function repairTarget(options: {
  skill: number;
  cost: number;
  kind: RepairKind;
  /** The tools of the trade, from Equipment Modifiers (p. 345). */
  equipment?: number;
  /** Anything else the GM allows: time spent, a workshop, a hurry. */
  modifier?: number;
}): number {
  return (
    options.skill +
    priceModifier(options.cost) +
    (options.kind === "major" ? MAJOR_REPAIR_PENALTY : 0) +
    (options.equipment ?? 0) +
    (options.modifier ?? 0)
  );
}

/** "Success restores 1 HP times the margin of success (minimum 1)." */
export function hitPointsRestored(margin: number): number {
  return Math.max(1, Math.floor(margin));
}

/** "Spare parts that cost 1d x 10% of its original price" (p. 484). */
export function sparePartsCost(price: number, die: number): number {
  const roll = Math.min(6, Math.max(1, Math.floor(die)));
  return Math.round(Math.max(0, price) * roll * 0.1);
}

/** "A typical rate is $20/hour", at a "typical skill level of 9 + 1d". */
export const HIRED_RATE_PER_HOUR = 20;

export function hiredTechnicianSkill(die: number): number {
  return 9 + Math.min(6, Math.max(1, Math.floor(die)));
}

// ── what breaks gear on its own (p. 485) ───────────────────────────────────

/**
 * "Missed or failed maintenance checks result in HT loss. This HT loss is
 * cumulative, and affects all HT rolls... To restore lost HT, use the
 * Repairs rules, above. Treat each point of HT restored as a separate major
 * repair."
 */
export function healthAfterNeglect(baseHealth: number, missedChecks: number): number {
  return baseHealth - Math.max(0, Math.floor(missedChecks));
}

/** "If the item lacks a HT score, assume HT 10." */
export const ASSUMED_HEALTH = 10;

/** "Make a HT+4 roll for it" when gear is carelessly exposed (p. 485). */
export const EXPOSURE_BONUS = 4;

/**
 * The target for a Slime, Sand and Equipment Failure roll (p. 485), from
 * the item's current HT, the +4 the rule grants, and the care taken:
 * "+1 if the PCs take significant time out each day to clean and maintain
 * their gear; -1 or -2 if the abuse or the environment is unusually
 * brutal."
 */
export function equipmentFailureTarget(options: {
  health?: number | null;
  missedChecks?: number;
  cleaned?: boolean;
  brutal?: number;
}): number {
  const base = options.health ?? ASSUMED_HEALTH;
  return (
    healthAfterNeglect(base, options.missedChecks ?? 0) +
    EXPOSURE_BONUS +
    (options.cleaned ? 1 : 0) -
    Math.abs(options.brutal ?? 0)
  );
}

/**
 * What a failed exposure roll costs (p. 485): "On a failure, the equipment
 * breaks down, jams, or otherwise fails; it cannot function at all without
 * minor repairs. On a critical failure, it requires major repairs."
 */
export type FailureOutcome = "works" | "needsMinorRepair" | "needsMajorRepair";

export function exposureOutcome(options: { success: boolean; criticalFailure: boolean }): FailureOutcome {
  if (options.criticalFailure) return "needsMajorRepair";
  return options.success ? "works" : "needsMinorRepair";
}

/**
 * Whether a thing needs maintenance at all (p. 485): "This rule does not
 * apply to items without moving parts, equipment in storage, or any
 * artifact just sitting there, unused, if it has a sealed case."
 */
export function needsMaintenance(options: {
  movingParts: boolean;
  inStorage?: boolean;
  sealedAndUnused?: boolean;
}): boolean {
  if (!options.movingParts) return false;
  if (options.inStorage) return false;
  return !options.sealedAndUnused;
}
