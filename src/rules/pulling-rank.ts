/**
 * Pulling Rank (GURPS Basic Set Revised, Addendum 2, pp. 337-341).
 *
 * Rank as an effective Patron. The organization behind the Rank has a
 * hypothetical Patron value the character never pays; dividing it by what a
 * level of Rank costs gives the key Rank at which help comes on 9 or less. An
 * Assistance Roll (AR) fans out from there: +1 for each Rank above the key,
 * -2 for each below.
 */

/** The hypothetical Patron values of an organization, by power (p. 337). */
export const ORGANIZATION_VALUES = [10, 15, 20, 25, 30] as const;

export type OrganizationValue = (typeof ORGANIZATION_VALUES)[number];

/** The most and least a level of Rank may cost (pp. 337-338). */
export const RANK_COST_MIN = 2;
export const RANK_COST_MAX = 10;
/** What a level of Rank costs unless the GM says otherwise. */
export const RANK_COST_STANDARD = 5;

/** The Patron-to-Rank Table (p. 338): the cost a level may have for an effective Patron value. */
export const PATRON_TO_RANK: Readonly<Record<OrganizationValue, readonly [number, number]>> = {
  10: [2, 5],
  15: [3, 7],
  20: [3, 10],
  25: [4, 10],
  30: [5, 10],
};

/** The Rank-to-Patron Table (p. 338): the effective Patron values a level cost fits, low to high. */
export function patronRangeForCost(costPerLevel: number): readonly [number, number] | null {
  const cost = Math.floor(costPerLevel);
  if (cost < 2 || cost > 10) return null;
  if (cost === 2) return [10, 10];
  if (cost === 3) return [10, 20];
  if (cost === 4) return [10, 25];
  if (cost === 5) return [10, 30];
  if (cost <= 7) return [15, 30];
  return [20, 30];
}

/** The cost range of a level of Rank for a Patron value, or null where the value is not one of the five. */
export function costRangeForPatron(value: number): readonly [number, number] | null {
  return (PATRON_TO_RANK as Record<number, readonly [number, number]>)[value] ?? null;
}

/**
 * Whether a Patron value and a per-level cost sit together on the tables
 * (the GM may go outside them, but the tables are the recommendation).
 */
export function costWithinTables(value: number, costPerLevel: number): boolean {
  const range = costRangeForPatron(value);
  return range !== null && costPerLevel >= range[0] && costPerLevel <= range[1];
}

/** Capricious Assistance: a -50% limitation on Rank, 5 points a level becoming 3 (p. 338). */
export const CAPRICIOUS_ASSISTANCE_PERCENT = -50;

/**
 * A level of Rank's price once its modifiers are in (p. 338): +50% or +100%
 * where the aid gives a higher effective TL than the setting, -50% for
 * Capricious Assistance. Rounded up, as every point cost is (5 at -50% is 3).
 */
export function rankCostPerLevel(base: number, percents: readonly number[] = []): number {
  const net = Math.max(-80, percents.reduce((sum, p) => sum + p, 0));
  return Math.ceil((base * (100 + net)) / 100 - 1e-9);
}

/**
 * The Rank at which help comes on 9 or less: the Patron value divided by the
 * cost per level, fractions dropped (p. 338).
 */
export function keyRank(patronValue: number, costPerLevel: number): number {
  if (!(costPerLevel > 0)) return 0;
  return Math.floor(patronValue / costPerLevel);
}

/** The base Assistance Roll for a Rank: 9 at the key, +1 a Rank above, -2 a Rank below (p. 338). */
export function baseAssistanceRoll(rank: number, patronValue: number, costPerLevel: number): number {
  const key = keyRank(patronValue, costPerLevel);
  const difference = Math.floor(rank) - key;
  return 9 + (difference >= 0 ? difference : difference * 2);
}

/** What the modifiers of an Assistance Roll come from (p. 338). */
export interface AssistanceModifiers {
  /** In-world appropriateness: +1 to +5, or -1 to -10. */
  inWorld?: number;
  /** Meta-game appropriateness: +1 to +5, or -1 to -10. */
  meta?: number;
  /** The type of assistance's own modifier. */
  innate?: number;
  /** Assistance Rolls already made this adventure (or assignment) by the petitioner or their team. */
  previousRequests?: number;
  /** Charisma's levels, for a request made person to person. */
  charisma?: number;
  /** Smooth Operator's levels, for a request made person to person. */
  smoothOperator?: number;
  /** Reputation with the organization, from the service record. */
  reputation?: number;
  /** A complementary skill roll's modifier (p. 206). */
  complementary?: number;
}

/** A modifier a roll takes: its name in `GWORLD.PullingRank.Line` and its value. */
export interface AssistanceLine {
  key: "inWorld" | "meta" | "innate" | "previous" | "charisma" | "smoothOperator" | "reputation" | "complementary";
  value: number;
}

/** How far an appropriateness modifier may go either way (p. 338). */
export const APPROPRIATENESS_MAX = 5;
export const INAPPROPRIATENESS_MAX = 10;

/** An appropriateness modifier held to +5 and -10. */
export function clampAppropriateness(value: number): number {
  return Math.max(-INAPPROPRIATENESS_MAX, Math.min(APPROPRIATENESS_MAX, Math.trunc(value) || 0));
}

/** The modifier for previous requests: -1 for each after the first (p. 338). */
export function previousRequestsModifier(previous: number): number {
  return -Math.max(0, Math.floor(previous) || 0);
}

/** The lines of an Assistance Roll's modifiers, those that are zero left out. */
export function assistanceLines(mods: AssistanceModifiers): AssistanceLine[] {
  const lines: AssistanceLine[] = [
    { key: "inWorld", value: clampAppropriateness(mods.inWorld ?? 0) },
    { key: "meta", value: clampAppropriateness(mods.meta ?? 0) },
    { key: "innate", value: Math.trunc(mods.innate ?? 0) },
    { key: "previous", value: previousRequestsModifier(mods.previousRequests ?? 0) },
    { key: "charisma", value: Math.trunc(mods.charisma ?? 0) },
    { key: "smoothOperator", value: Math.trunc(mods.smoothOperator ?? 0) },
    { key: "reputation", value: Math.trunc(mods.reputation ?? 0) },
    { key: "complementary", value: Math.trunc(mods.complementary ?? 0) },
  ];
  return lines.filter((l) => l.value !== 0);
}

/** The target of an Assistance Roll and whether it can be attempted at all: under 3 is no attempt (p. 339). */
export function assistanceTarget(base: number, mods: AssistanceModifiers): { target: number; attempt: boolean } {
  const target = base + assistanceLines(mods).reduce((sum, l) => sum + l.value, 0);
  return { target, attempt: target >= 3 };
}

/** What became of an Assistance Roll. */
export type AssistanceOutcome =
  | "aid"
  | "aidComplicated"
  | "none"
  | "noneDrawback"
  | "disciplinary"
  | "disaster";

/**
 * The outcome ladder (pp. 338-339). Success brings the aid, failure none,
 * failure by 10+ or a critical failure none and, where the request rated an
 * in-world penalty, disciplinary action. Under Capricious Assistance only
 * success by 5+ is clean; 0-4 comes with a downside; failure by 1-4 brings
 * nothing or a benefit outweighed by a drawback; failure by 5+ or a critical
 * failure is disaster.
 */
export function assistanceOutcome(roll: {
  success: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
  margin: number;
  inWorldPenalty?: boolean;
  capricious?: boolean;
}): AssistanceOutcome {
  if (roll.capricious) {
    if (roll.success) return roll.criticalSuccess || roll.margin >= 5 ? "aid" : "aidComplicated";
    if (roll.criticalFailure || roll.margin >= 5) return "disaster";
    return "noneDrawback";
  }
  if (roll.success) return "aid";
  if ((roll.criticalFailure || roll.margin >= 10) && roll.inWorldPenalty) return "disciplinary";
  return "none";
}

/** Whether an outcome brings the aid asked for. */
export function outcomeBringsAid(outcome: AssistanceOutcome): boolean {
  return outcome === "aid" || outcome === "aidComplicated";
}

/** The Rank an Assistance Roll uses, by who is asking (p. 338). */
export function rankUsed(options: {
  own: number;
  /** The highest Rank of a group serving the same organization. */
  group?: number | null;
  /** A group with a leader of higher Rank than any of them uses their highest Rank plus 1. */
  groupHasLeader?: boolean;
  /** A preauthorizing NPC's Rank. */
  npc?: number | null;
}): number {
  if (options.npc !== null && options.npc !== undefined) return Math.max(0, Math.floor(options.npc));
  if (options.group !== null && options.group !== undefined) {
    return Math.max(0, Math.floor(options.group)) + (options.groupHasLeader ? 1 : 0);
  }
  return Math.max(0, Math.floor(options.own));
}

// -- Sample assistance (pp. 339-341) ------------------------------------------------------------

/** One kind of assistance a Rank may ask for. */
export interface AssistanceType {
  key: string;
  /** The type's own modifier to the roll, at its usual starting value. */
  innate: number;
  /** The range the GM may set it within, where the book gives one. */
  range?: readonly [number, number];
  /** Made unmodified: no modifier of any kind applies (Any Assistance Available). */
  unmodified?: boolean;
  /** Its modifier comes from the Patron value (Cash). */
  byPatron?: boolean;
  /** Its modifier is minus the local CR plus the item's LC (License, Shipping). */
  byCRandLC?: boolean;
}

/** The sample assistance in the book's order, by key; names are `GWORLD.PullingRank.Type.<key>`. */
export const ASSISTANCE_TYPES: readonly AssistanceType[] = [
  { key: "anyAssistance", innate: 0, unmodified: true },
  { key: "bailout", innate: 0 },
  { key: "cash", innate: 0, byPatron: true },
  { key: "consultation", innate: 0 },
  { key: "coverUp", innate: 0 },
  { key: "disappearance", innate: 0, range: [-5, 0] },
  { key: "entryClearance", innate: 5, range: [0, 5] },
  { key: "evacuation", innate: 1, range: [1, 10] },
  { key: "facilities", innate: 0 },
  { key: "falseId", innate: 0 },
  { key: "files", innate: 0 },
  { key: "fireSupport", innate: -5, range: [-10, -5] },
  { key: "gear", innate: 0 },
  { key: "generalizedAssistance", innate: 0 },
  { key: "insertionExtraction", innate: 0 },
  { key: "introduction", innate: 0, range: [0, 5] },
  { key: "invitation", innate: 0, range: [0, 5] },
  { key: "license", innate: 0, range: [0, 5], byCRandLC: true },
  { key: "muscle", innate: 0 },
  { key: "recordsSearch", innate: 0 },
  { key: "safehouse", innate: 0 },
  { key: "shipping", innate: 0, byCRandLC: true },
  { key: "technicalMeans", innate: -1, range: [-5, -1] },
  { key: "theCavalry", innate: 0, range: [-10, 0] },
  { key: "transportation", innate: 0 },
  { key: "warrant", innate: 0, range: [-5, 5] },
];

/** A sample assistance type by key, or null. */
export function assistanceType(key: string): AssistanceType | null {
  return ASSISTANCE_TYPES.find((t) => t.key === key) ?? null;
}

/** Cash's share of the campaign's starting money, in percent, by Rank 0 to 8 (p. 339). */
export const CASH_PERCENT_BY_RANK: readonly number[] = [0.5, 1.5, 5, 15, 50, 150, 500, 1500, 5000];

/** Cash's roll modifier by effective Patron value: -4, 0, +2, +4, +6 (p. 339). */
export function cashModifier(patronValue: number): number {
  return ({ 10: -4, 15: 0, 20: 2, 25: 4, 30: 6 } as Record<number, number>)[patronValue] ?? 0;
}

/**
 * The most Cash a Rank may ask for, in dollars: a share of the campaign's
 * starting money, times ten if it is for show and will be returned. Ranks
 * above 8 take the Rank 8 figure, the last the book gives.
 */
export function cashAmount(startingMoney: number, rank: number, returned = false): number {
  const index = Math.max(0, Math.min(CASH_PERCENT_BY_RANK.length - 1, Math.floor(rank)));
  const share = (startingMoney * CASH_PERCENT_BY_RANK[index]!) / 100;
  return Math.floor(share * (returned ? 10 : 1));
}

/** Consultation's effective skill: a Contact Group at 15 + Patron value/5, from 17 to 21 (p. 339). */
export function consultationSkill(patronValue: number): number {
  return 15 + Math.floor(patronValue / 5);
}

/** Facilities' equipment bonus: a fifth of the Patron value, never above TL/2 (p. 339). */
export function facilitiesBonus(patronValue: number, techLevel: number): number {
  return Math.min(Math.floor(patronValue / 5), Math.floor(Math.max(0, techLevel) / 2));
}

/**
 * Generalized Assistance as a complementary bonus (p. 339): a critical
 * success gives a fifth of the Patron value, success half that rounded down,
 * failure -1 and critical failure -2.
 */
export function generalizedAssistanceBonus(
  patronValue: number,
  roll: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean },
): number {
  const full = Math.floor(patronValue / 5);
  if (roll.criticalSuccess) return full;
  if (roll.criticalFailure) return -2;
  return roll.success ? Math.floor(full / 2) : -1;
}

/** Muscle's and The Cavalry's headcount: at most half the Patron value (pp. 340-341). */
export function responderCount(patronValue: number): number {
  return Math.floor(patronValue / 2);
}

/** The roll modifier of License and Shipping: minus the local CR, plus the item's LC (pp. 340-341). */
export function licenseModifier(controlRating: number, legalityClass: number): number {
  return -Math.max(0, Math.floor(controlRating) || 0) + Math.max(0, Math.floor(legalityClass) || 0);
}

/** Hours until a Warrant: 1d by day, 1d+8 by night (p. 341), given the die. */
export function warrantHours(die: number, night: boolean): number {
  return die + (night ? 8 : 0);
}

/** The skill of Muscle's people is 10-15, "1d+9" (p. 341), given the die. */
export function muscleSkill(die: number): number {
  return die + 9;
}

/**
 * The advantages whose social benefits "just work" and take no Assistance
 * Roll (p. 340): Clerical Investment, Legal Enforcement Powers, Legal
 * Immunity, Security Clearance, Tenure and their like. Pay with Rank is a
 * job roll (p. 516).
 */
export const PRIVILEGE_TRAITS: readonly string[] = [
  "Clerical Investment",
  "Legal Enforcement Powers",
  "Legal Immunity",
  "Security Clearance",
  "Tenure",
];

/** Whether a trait's benefits work without an Assistance Roll (p. 340). */
export function isPrivilegeTrait(name: string): boolean {
  const lower = String(name ?? "").toLowerCase();
  return PRIVILEGE_TRAITS.some((t) => lower.startsWith(t.toLowerCase()));
}

// -- The two tables on the item sheet (pp. 337-338) ---------------------------------------------

/** What the item sheet keeps of a Rank's Patron value and level cost. */
export interface RankTableResult {
  patronValue: number;
  costPerLevel: number;
  /** Which figure was moved, for the sheet to say so. */
  changed: Array<"patronValue" | "costPerLevel">;
  /** Whether the pair lies outside the tables, whatever was kept (the GM may go there). */
  outside: boolean;
}

/**
 * Holds a Patron value to one of the five the tables give and a level cost
 * to the range the Patron-to-Rank Table allows for it. A value of 0 means no
 * Assistance Rolls and leaves the cost alone. With `override`, the GM's
 * exception, nothing is moved and the result only says the pair is outside.
 */
export function enforceRankTables(patronValue: number, costPerLevel: number, override = false): RankTableResult {
  const rawValue = Math.max(0, Math.floor(Number(patronValue) || 0));
  const cost = Number(costPerLevel) || 0;
  if (rawValue === 0) return { patronValue: 0, costPerLevel: cost, changed: [], outside: false };
  const snapped = ORGANIZATION_VALUES.reduce((best, v) => (Math.abs(v - rawValue) < Math.abs(best - rawValue) ? v : best), ORGANIZATION_VALUES[0] as number);
  const value = override ? rawValue : snapped;
  const range = costRangeForPatron(value);
  const changed: RankTableResult["changed"] = [];
  if (value !== rawValue) changed.push("patronValue");
  let kept = cost;
  if (range && !override && cost > 0 && (cost < range[0] || cost > range[1])) {
    kept = Math.min(range[1], Math.max(range[0], cost));
    changed.push("costPerLevel");
  }
  return { patronValue: value, costPerLevel: kept, changed, outside: !costWithinTables(value, kept) };
}

// -- Delivering the aid (pp. 339-341) -----------------------------------------------------------

/** What an aid type puts in the petitioner's hands, beyond words on the card. */
export type AidDelivery = "money" | "people" | "equipment" | "bonus" | "hours" | "none";

/** Which of the deliveries an aid type makes. */
export function aidDelivery(key: string): AidDelivery {
  switch (key) {
    case "cash": return "money";
    case "muscle":
    case "theCavalry": return "people";
    case "facilities": return "equipment";
    case "generalizedAssistance": return "bonus";
    case "warrant": return "hours";
    default: return "none";
  }
}

/** The best Luck a character has: 1 Luck, 2 Extraordinary Luck, 3 Ridiculous Luck, 0 none. */
export function luckLevel(traitNames: readonly string[]): number {
  let best = 0;
  for (const raw of traitNames) {
    const name = String(raw ?? "").toLowerCase();
    if (/^ridiculous luck/.test(name)) best = Math.max(best, 3);
    else if (/^extraordinary luck/.test(name)) best = Math.max(best, 2);
    else if (/^luck\b/.test(name)) best = Math.max(best, 1);
  }
  return best;
}

interface RollFigures {
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  margin: number;
}

/** Whether roll `b` is better for the roller than `a`: a better outcome step, then a better margin. */
export function betterRoll(a: RollFigures, b: RollFigures): boolean {
  const step = (r: RollFigures) => (r.criticalSuccess ? 3 : r.success ? 2 : r.criticalFailure ? 0 : 1);
  if (step(b) !== step(a)) return step(b) > step(a);
  const signedMargin = (r: RollFigures) => (r.success ? r.margin : -r.margin);
  return signedMargin(b) > signedMargin(a);
}
