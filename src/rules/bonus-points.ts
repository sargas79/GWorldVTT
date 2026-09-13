/**
 * Spending points on outcomes (GURPS Monster Hunters 1: Champions pp. 23,
 * 28, 31; Basic Set: Campaigns p. 347).
 *
 * "The costs below may be paid for with unspent character points, destiny
 * points (p. 23), and/or bonus points from a high wildcard skill (p. 28-29).
 * Wildcard bonus points may only be used in certain circumstances ... the
 * others have no special restrictions."
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
 * What it costs to move a roll up (p. 31): "2 points to turn critical failure
 * into failure, 1 point for failure to success ... and 2 points for success to
 * critical success. These are cumulative; e.g., critical failure to critical
 * success costs 5 points. Critical successes (only) may not be bought in
 * combat". Null for no step up, or a critical bought in combat.
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

/** Player guidance (p. 31): "Minor ... 1 point. Moderate ... 2 points. Major ... 3 points." */
export type GuidanceLevel = "minor" | "moderate" | "major";

/** "If the player has just rolled a critical success ... reduce the costs above by 1 point (minimum 1)." */
export function guidanceCost(level: GuidanceLevel, afterCriticalSuccess = false): number {
  const base = { minor: 1, moderate: 2, major: 3 }[level];
  return afterCriticalSuccess ? Math.max(1, base - 1) : base;
}

/** "Immediately after taking damage, a player can spend 1 point to reduce the final injury to 1 HP (or 1 FP)." */
export const FLESH_WOUND_POINTS = 1;

/**
 * Wildcard bonus points (p. 28): "for every 12 points spent on a wildcard
 * skill, the user receives one bonus point for that skill ... available at
 * the beginning of every game session, and don't accumulate if unused."
 */
export function wildcardBonusPoints(pointsInSkill: number): number {
  return Math.max(0, Math.floor(Math.max(0, pointsInSkill) / 12));
}

/**
 * "Users with at least 12 points in a wildcard skill ignore penalties for
 * familiarity, exotic equipment, or tech level differences (but not
 * improvised or low-quality equipment)" (p. 28).
 */
export function wildcardIgnoresFamiliarity(pointsInSkill: number): boolean {
  return pointsInSkill >= 12;
}

/**
 * Destiny as Monster Hunters 1 simplifies it (p. 23): "Destiny at the 5-,
 * 10-, or 15-point level lets you start the game with 1, 2, or 3 destiny
 * points", and as a disadvantage "the GM will set aside 1, 2, or 3 destiny
 * points each session ... and will use these on behalf of your foes!"
 */
export function destinyPoints(traitPoints: number): { own: number; gm: number } {
  const level = Math.min(3, Math.floor(Math.abs(traitPoints) / 5));
  return traitPoints > 0 ? { own: level, gm: 0 } : { own: 0, gm: traitPoints < 0 ? level : 0 };
}

/** "You regain one destiny point each game session, but can never have more than you started the game with." */
export function regainDestiny(current: number, starting: number): number {
  return Math.max(0, Math.min(starting, current + 1));
}

/** Where points come from. */
export type PointSource = { kind: "unspent" } | { kind: "destiny" } | { kind: "wildcard"; skill: string };

/** What points are being spent on. */
export type PointUse = "buySuccess" | "fleshWound" | "guidance";

/**
 * Whether a source may pay for a use (p. 31). Unspent and destiny points have
 * "no special restrictions". Wildcard bonus points pay for a success roll
 * only "against that skill"; for a flesh wound only "if the champion was
 * wounded while using that skill", and for guidance only "if the result is
 * directly tied to the use of the skill" -- which the GM decides, so those
 * are allowed with a check for the GM.
 */
export function sourceMayPay(source: PointSource, use: PointUse, roll: { skill?: string } = {}): { allowed: boolean; gmCheck: boolean } {
  if (source.kind !== "wildcard") return { allowed: true, gmCheck: false };
  if (use === "buySuccess") {
    const same = (roll.skill ?? "").trim().toLowerCase() === source.skill.trim().toLowerCase();
    return { allowed: same, gmCheck: false };
  }
  return { allowed: true, gmCheck: true };
}
