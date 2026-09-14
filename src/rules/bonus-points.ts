/**
 * Spending points on outcomes: buying a success roll up, a flesh wound, and a
 * piece of player guidance (Influencing Success Rolls, Campaigns p. 347).
 *
 * The system prices each and pays with unspent character points; point pools
 * that add-on modules register pay for the same things.
 */

/** A success roll's result, as the price list steps through it. */
export type OutcomeStep = "criticalFailure" | "failure" | "success" | "criticalSuccess";
const STEPS: readonly OutcomeStep[] = ["criticalFailure", "failure", "success", "criticalSuccess"];

/** The step a resolved roll is at. */
export function outcomeStep(outcome: { success: boolean; criticalSuccess: boolean; criticalFailure: boolean }): OutcomeStep {
  if (outcome.criticalSuccess) return "criticalSuccess";
  if (outcome.success) return "success";
  return outcome.criticalFailure ? "criticalFailure" : "failure";
}

/**
 * What it costs to move a roll up: 2 points from critical failure to failure,
 * 1 from failure to success, and 2 from success to critical success,
 * cumulatively; a critical success is never bought in combat. Null for no step
 * up, or a critical bought in combat.
 */
export function buySuccessCost(from: OutcomeStep, to: OutcomeStep, options: { combat: boolean }): number | null {
  const a = STEPS.indexOf(from);
  const b = STEPS.indexOf(to);
  if (b <= a) return null;
  if (to === "criticalSuccess" && options.combat) return null;
  const price = [2, 1, 2];
  let cost = 0;
  for (let i = a; i < b; i++) cost += price[i]!;
  return cost;
}

/** The steps a roll could be bought up to, with their prices. */
export function purchasableSteps(from: OutcomeStep, options: { combat: boolean }): Array<{ step: OutcomeStep; cost: number }> {
  return STEPS.map((step) => ({ step, cost: buySuccessCost(from, step, options) }))
    .filter((s): s is { step: OutcomeStep; cost: number } => s.cost !== null);
}

/** Player guidance: minor 1 point, moderate 2, major 3. */
export type GuidanceLevel = "minor" | "moderate" | "major";

/** A point less straight after a critical success, but never less than 1. */
export function guidanceCost(level: GuidanceLevel, afterCriticalSuccess = false): number {
  const base = { minor: 1, moderate: 2, major: 3 }[level];
  return afterCriticalSuccess ? Math.max(1, base - 1) : base;
}

/** A flesh wound's price in points (Campaigns p. 417). */
export const FLESH_WOUND_POINTS = 1;

/** Where points come from. */
export type PointSource =
  | { kind: "unspent" }
  /** A pool an add-on module registered: the registration, and the pool's id within it. */
  | { kind: "pool"; pool: string; id: string };

/** What points are being spent on. */
export type PointUse = "buySuccess" | "fleshWound" | "guidance";
