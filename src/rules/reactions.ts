/**
 * What strangers make of you (GURPS Basic Set: Campaigns pp. 359, 494, 560).
 *
 * A reaction roll is not a success roll, and the differences are the whole
 * shape of this module: there is no target number, a high roll is good, and the
 * modifiers apply to the die roll itself rather than to anything it is compared
 * against. So nothing here goes through `resolveSuccess`.
 *
 * An Influence roll is the other way in: a Quick Contest that buys a stated
 * reaction outright instead of rolling for one.
 */

import { modifier } from "./modifiers.js";

/** The bands of the Reaction Table (p. 560). */
export type Reaction =
  | "disastrous"
  | "veryBad"
  | "bad"
  | "poor"
  | "neutral"
  | "good"
  | "veryGood"
  | "excellent";

/** The bands in order, worst first, so one can be compared to another. */
export const REACTIONS: readonly Reaction[] = [
  "disastrous",
  "veryBad",
  "bad",
  "poor",
  "neutral",
  "good",
  "veryGood",
  "excellent",
];

/** One row of the Reaction Table (p. 560). */
export interface ReactionBand {
  reaction: Reaction;
  /** The lowest modified roll in this band. */
  min: number;
  /** The highest, or null for the open-ended top row. */
  max: number | null;
}

/**
 * The Reaction Table (p. 560).
 *
 * "0 or less: Disastrous. 1 to 3: Very Bad. 4 to 6: Bad. 7 to 9: Poor. 10 to
 * 12: Neutral. 13 to 15: Good. 16 to 18: Very Good. 19 or better: Excellent."
 *
 * Both ends are open: modifiers apply to the roll, so a 3d roll can land well
 * outside 3-18.
 */
export const REACTION_TABLE: readonly ReactionBand[] = [
  { reaction: "disastrous", min: Number.NEGATIVE_INFINITY, max: 0 },
  { reaction: "veryBad", min: 1, max: 3 },
  { reaction: "bad", min: 4, max: 6 },
  { reaction: "poor", min: 7, max: 9 },
  { reaction: "neutral", min: 10, max: 12 },
  { reaction: "good", min: 13, max: 15 },
  { reaction: "veryGood", min: 16, max: 18 },
  { reaction: "excellent", min: 19, max: null },
];

/** Which band a modified reaction roll fell in (p. 560). */
export function reactionFor(total: number): Reaction {
  const band = REACTION_TABLE.find(
    (row) => total >= row.min && (row.max === null || total <= row.max),
  );
  return band?.reaction ?? "neutral";
}

/** How the two bands compare, for capping a reaction at a best case. */
export function compareReactions(a: Reaction, b: Reaction): number {
  return REACTIONS.indexOf(a) - REACTIONS.indexOf(b);
}

/**
 * A reaction, held within whatever ceiling and floor an NPC came with (p. 494).
 *
 * "Predetermined reaction penalties sometimes come with a 'best-case' reaction.
 * Treat any reaction better than the best-case reaction as the best-case
 * scenario; do not roll again... Predetermined bonuses and worst-case reactions
 * are possible for unusually friendly NPCs."
 */
export function boundReaction(options: {
  reaction: Reaction;
  best?: Reaction | null;
  worst?: Reaction | null;
}): Reaction {
  let reaction = options.reaction;
  if (options.best && compareReactions(reaction, options.best) > 0) reaction = options.best;
  if (options.worst && compareReactions(reaction, options.worst) < 0) reaction = options.worst;
  return reaction;
}

/** What a reaction roll came to, and what it means. */
export interface ReactionResult {
  /** The three dice, before modifiers. */
  rolled: number;
  modifier: number;
  total: number;
  reaction: Reaction;
  /** True when a best-case or worst-case ceiling changed the answer. */
  bounded: boolean;
}

/**
 * A reaction roll (p. 494).
 *
 * "There is no target number to roll against. A high roll is good, not bad.
 * Reaction modifiers apply directly to the die roll."
 */
export function reactionRoll(options: {
  rolled: number;
  modifier?: number;
  best?: Reaction | null;
  worst?: Reaction | null;
}): ReactionResult {
  const total = options.rolled + (options.modifier ?? 0);
  const raw = reactionFor(total);
  const reaction = boundReaction({
    reaction: raw,
    ...(options.best === undefined ? {} : { best: options.best }),
    ...(options.worst === undefined ? {} : { worst: options.worst }),
  });

  return {
    rolled: options.rolled,
    modifier: modifier(options.modifier ?? 0),
    total,
    reaction,
    bounded: reaction !== raw,
  };
}

/** The bonus a successful roll against an appropriate skill is worth (p. 494). */
export const SKILL_REACTION_BONUS = 2;

/**
 * Whether a skill is good enough to give its bonus without a roll (p. 494).
 *
 * "In a few cases, skill 20+ gives an automatic +2 to reactions. Diplomacy and
 * Fast-Talk work this way if you are allowed to talk -- as does Merchant skill,
 * during commercial transactions."
 */
export const AUTOMATIC_BONUS_SKILL = 20;

export function automaticSkillBonus(skillLevel: number): boolean {
  return skillLevel >= AUTOMATIC_BONUS_SKILL;
}

// ── influence rolls (p. 359) ────────────────────────────────────────────────

/** The skills the book names as Influence skills (p. 359). */
export const INFLUENCE_SKILLS = [
  "Diplomacy",
  "Fast-Talk",
  "Intimidation",
  "Savoir-Faire",
  "Sex Appeal",
  "Streetwise",
] as const;

export type InfluenceSkill = (typeof INFLUENCE_SKILLS)[number] | string;

/** What an Influence roll bought. */
export interface InfluenceResult {
  reaction: Reaction;
  won: boolean;
  /** True when Diplomacy's second chance should be rolled as well. */
  rollsAnyway: boolean;
}

/**
 * An Influence roll (p. 359).
 *
 * "Roll a Quick Contest: your Influence skill vs. the subject's Will. If you
 * win, you get a 'Good' reaction from the NPC -- 'Very Good' if you used Sex
 * Appeal. On any other outcome... a 'Bad' reaction -- 'Very Bad' if you
 * attempted specious intimidation."
 *
 * The reaction is stated rather than rolled, which is the point of the whole
 * manoeuvre: an Influence roll trades the spread of the table for a known
 * outcome in both directions.
 */
export function influenceResult(options: {
  skill: InfluenceSkill;
  won: boolean;
  /** Intimidation with nothing to back it up (p. 202). */
  specious?: boolean;
}): InfluenceResult {
  const skill = String(options.skill);

  if (options.won) {
    return {
      reaction: skill === "Sex Appeal" ? "veryGood" : "good",
      won: true,
      rollsAnyway: false,
    };
  }

  return {
    reaction: options.specious && skill === "Intimidation" ? "veryBad" : "bad",
    won: false,
    // "If you used Diplomacy, the GM will also make a regular reaction roll and
    // use the better of the two reactions. Thus, Diplomacy is relatively safe."
    rollsAnyway: skill === "Diplomacy",
  };
}

/**
 * Whether an Influence attempt is decided before any dice (pp. 60, 95, 154).
 *
 * "If the subject is Indomitable, you lose automatically unless you have
 * Empathy... Intimidation attempts against those with the Unfazeable advantage
 * also fail automatically. On the other hand, you win automatically -- no roll
 * required -- against those with Slave Mentality."
 */
export function automaticInfluence(options: {
  skill: InfluenceSkill;
  indomitable?: boolean;
  unfazeable?: boolean;
  slaveMentality?: boolean;
  /** Empathy of the appropriate kind, which lets you try an Indomitable. */
  empathy?: boolean;
}): boolean | null {
  if (options.slaveMentality) return true;
  if (options.unfazeable && String(options.skill) === "Intimidation") return false;
  if (options.indomitable && !options.empathy) return false;
  return null;
}
