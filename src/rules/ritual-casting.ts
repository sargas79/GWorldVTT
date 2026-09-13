/**
 * Casting a ritual (GURPS Monster Hunters 1: Champions pp. 35-37).
 *
 * "The process of casting a spell is nothing more than the act of gathering
 * this energy; once you have enough, a single skill roll determines how well
 * you channeled it." So a casting is a running total: gathering rolls and
 * energy sources add to it until it reaches the ritual's cost, and then one
 * final roll against the same Path decides what happens.
 *
 * Everything here is arithmetic on that total. Who rolls, and what the card
 * shows, is the system's.
 */

/** The outcome of a 3d6 roll against a skill, as the success rules resolve it. */
export interface RitualRoll {
  success: boolean;
  /** By how much it succeeded or failed, never negative. */
  margin: number;
  criticalSuccess: boolean;
  criticalFailure: boolean;
}

/** Seconds an adept takes to gather ambient energy once (p. 35). */
export const GATHER_SECONDS = 5;

/** The seconds a non-adept takes instead, "five minutes (not seconds)" (p. 36). */
export const NON_ADEPT_GATHER_SECONDS = 300;

/** "Tapping into power sources takes one minute per attempt" for a non-adept (p. 36). */
export const NON_ADEPT_TAP_SECONDS = 60;

/**
 * "At every third attempt for a given ritual, apply a cumulative -1 to skill
 * -- long rituals are more difficult" (p. 35). Attempts count from one.
 */
export function gatheringStreakPenalty(attempt: number): number {
  const penalty = -Math.floor(Math.max(0, Math.floor(attempt)) / 3);
  return penalty === 0 ? 0 : penalty;
}

/**
 * Gathering faster: "a -1 skill penalty per one second less time (minimum one
 * second)" (p. 35). The seconds taken, from one to five.
 */
export function hurriedGatheringPenalty(seconds: number): number {
  const taken = Math.max(1, Math.min(GATHER_SECONDS, Math.floor(seconds)));
  return taken === GATHER_SECONDS ? 0 : taken - GATHER_SECONDS;
}

/**
 * A place of magical potency: "A site used for at least 20 years gives +1; 50
 * years gives +2; 100 years gives +3; 500 years gives +4; and 1,000 years
 * gives +5 (the maximum)" (p. 36).
 */
export function sitePotencyBonus(years: number): number {
  const lines = [20, 50, 100, 500, 1000];
  return lines.filter((line) => years >= line).length;
}

/** Where a ritual is worked: a consecrated place, a hasty circle, or neither (p. 36). */
export type Consecration = "consecrated" | "hasty" | "none";

/** What the non-adept rules ask about a casting (p. 36). */
export interface CastingConditions {
  /** Ritual Adept, which lifts every restriction below. */
  adept: boolean;
  /** Magery, null for none at all. Magery 0 counts. */
  magery: number | null;
  /** The subject is present, located to a yard, or represented by something tied to it. */
  connected: boolean;
  consecration: Consecration;
  /** A non-adept working at the adept's speed. */
  adeptTimes: boolean;
}

/** One of the restrictions on a non-adept, for the card to name. */
export interface CastingPenalty {
  key: "connection" | "consecration" | "hasty" | "magery" | "adeptTimes";
  value: number;
}

/**
 * The penalties a non-adept takes to every roll for the ritual (p. 36): -5
 * without a connection, -5 outside consecrated space (-1 in a hasty circle),
 * -5 without Magery, and -5 more for working at an adept's speed. "All
 * penalties stack". An adept takes none of them.
 */
export function nonAdeptPenalties(conditions: CastingConditions): CastingPenalty[] {
  if (conditions.adept) return [];
  const out: CastingPenalty[] = [];
  if (!conditions.connected) out.push({ key: "connection", value: -5 });
  if (conditions.consecration === "none") out.push({ key: "consecration", value: -5 });
  if (conditions.consecration === "hasty") out.push({ key: "hasty", value: -1 });
  if (conditions.magery === null) out.push({ key: "magery", value: -5 });
  if (conditions.adeptTimes) out.push({ key: "adeptTimes", value: -5 });
  return out;
}

/** The seconds one gathering attempt takes (pp. 35-36). */
export function gatheringSeconds(conditions: CastingConditions, options: { hurriedTo?: number; quick?: boolean } = {}): number {
  // "your next gathering attempt for this ritual only takes one second (even for non-adepts)".
  if (options.quick) return 1;
  if (!conditions.adept && !conditions.adeptTimes) return NON_ADEPT_GATHER_SECONDS;
  return Math.max(1, Math.min(GATHER_SECONDS, Math.floor(options.hurriedTo ?? GATHER_SECONDS)));
}

/**
 * Tapping an energy source: one second and no roll for an adept; a minute for
 * a non-adept, or a second with a roll at the adept's speed (p. 36).
 */
export function tapping(conditions: CastingConditions): { seconds: number; roll: boolean } {
  if (conditions.adept) return { seconds: 1, roll: false };
  return conditions.adeptTimes ? { seconds: 1, roll: true } : { seconds: NON_ADEPT_TAP_SECONDS, roll: false };
}

/**
 * The energy a ritual that "fails horribly" turns on its caster: "double the
 * energy collected (or 20 energy, if less than 10 has been accumulated)"
 * (p. 35).
 */
export function backfireEnergy(collected: number): number {
  return collected < 10 ? 20 : 2 * collected;
}

/** What one gathering roll yields (p. 35). */
export interface GatheringOutcome {
  energy: number;
  /** A failure's "minor, unintended effect", for the GM to choose. */
  quirk: boolean;
  /** A critical failure: the ritual fails horribly. */
  backfire: boolean;
  /** A critical success: the next attempt takes one second. */
  quick: boolean;
}

/**
 * "Critical Failure: The ritual fails horribly! ... Failure: You obtain a
 * single energy point. However, the spell acquires a 'quirk' ... Success: You
 * gather energy equal to your margin of success (minimum 1). Critical
 * Success: As for Success, plus your next gathering attempt for this ritual
 * only takes one second."
 */
export function gatheringOutcome(roll: RitualRoll): GatheringOutcome {
  if (roll.criticalFailure) return { energy: 0, quirk: false, backfire: true, quick: false };
  if (!roll.success) return { energy: 1, quirk: true, backfire: false, quick: false };
  return { energy: Math.max(1, roll.margin), quirk: false, backfire: false, quick: roll.criticalSuccess };
}

/**
 * A sacrifice: "Every 2 HP or 3 FP expended translate into a point of energy"
 * (p. 36). What does not make a whole point is not spent.
 */
export function sacrifice(options: { hp: number; fp: number }): { energy: number; hp: number; fp: number } {
  const hpPoints = Math.floor(Math.max(0, options.hp) / 2);
  const fpPoints = Math.floor(Math.max(0, options.fp) / 3);
  return { energy: hpPoints + fpPoints, hp: hpPoints * 2, fp: fpPoints * 3 };
}

/** What the final roll does (pp. 36-37). */
export interface FinalOutcome {
  /** "lie" is an information ritual that looks like it worked and did not. */
  kind: "backfire" | "retry" | "success" | "lie";
  /** A failure's wait before trying again, "seconds equal to the margin of failure". */
  retrySeconds: number;
  /** A critical success "instantly refills the caster's mana reserve". */
  refillReserve: boolean;
  /**
   * An information ritual the GM failed by 5 or more, or critically: "he
   * lies, instead of the normal failure effects".
   */
  lie: boolean;
}

/**
 * The final roll. It "takes any general skill penalties ... but none of the
 * energy-gathering modifiers". A failure only delays; an information ritual's
 * failure is a false answer rather than a delay or a backfire.
 */
export function finalOutcome(roll: RitualRoll, options: { information?: boolean } = {}): FinalOutcome {
  if (options.information && !roll.success) {
    const lie = roll.criticalFailure || roll.margin >= 5;
    return { kind: lie ? "lie" : "retry", retrySeconds: lie ? 0 : Math.max(1, roll.margin), refillReserve: false, lie };
  }
  if (roll.criticalFailure) return { kind: "backfire", retrySeconds: 0, refillReserve: false, lie: false };
  if (!roll.success) return { kind: "retry", retrySeconds: Math.max(1, roll.margin), refillReserve: false, lie: false };
  return { kind: "success", retrySeconds: 0, refillReserve: roll.criticalSuccess, lie: false };
}

/** The subject's side of a ritual's resistance: "the better of his HT or Will, plus any Magic Resistance" (p. 36). */
export function ritualResistance(options: { ht: number; will: number; magicResistance: number }): number {
  return Math.max(options.ht, options.will) + Math.max(0, options.magicResistance);
}
