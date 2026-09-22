/**
 * What the character sheet's header and Overview tab show, worked out from
 * the character's data without Foundry, so it can be tested.
 */

import { byName } from "../sort.js";

// ── the point badge ────────────────────────────────────────────────────────

export interface PointBadge {
  spent: number;
  available: number;
  unspent: number;
  /** "ready" with points to spend, "spent" with none left, "over" past the budget. */
  state: "ready" | "spent" | "over";
  /** How far over the budget, as a positive number; zero when within it. */
  overBy: number;
}

/**
 * The header's point badge. Spending past the budget is never blocked -- a GM
 * may allow it, and a character part-way through being built is over and under
 * by turns -- so it is flagged, with how far over.
 */
export function pointBadge(points: { spent?: unknown; available?: unknown; unspent?: unknown }): PointBadge {
  const spent = Number(points.spent) || 0;
  const available = Number(points.available) || 0;
  const unspent = Number.isFinite(Number(points.unspent)) ? Number(points.unspent) : available - spent;
  return {
    spent,
    available,
    unspent,
    state: unspent < 0 ? "over" : unspent === 0 ? "spent" : "ready",
    overBy: unspent < 0 ? -unspent : 0,
  };
}

// ── active skills ──────────────────────────────────────────────────────────

export interface ActiveSkillInput {
  id: string;
  name: string;
  points: number;
  level: number | null;
}

export interface ActiveSkillRow<T extends ActiveSkillInput> {
  skill: T;
  pinned: boolean;
}

/**
 * The Overview's skills: those pinned first, then every other trained skill,
 * each run by name. An untrained skill is listed only when pinned; a pinned id
 * whose skill is gone is ignored.
 */
export function activeSkills<T extends ActiveSkillInput>(skills: readonly T[], pinnedIds: readonly string[]): ActiveSkillRow<T>[] {
  const pinned = new Set(pinnedIds);
  const first = skills.filter((s) => pinned.has(s.id)).sort(byName);
  const rest = skills.filter((s) => !pinned.has(s.id) && s.points > 0).sort(byName);
  return [...first.map((skill) => ({ skill, pinned: true })), ...rest.map((skill) => ({ skill, pinned: false }))];
}

/** The pinned list with an id added or taken out. */
export function togglePinned(pinnedIds: readonly string[], id: string): string[] {
  return pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id];
}

// ── contextual modifiers ───────────────────────────────────────────────────

/** A modifier in force right now, with what it applies to. */
export interface ContextModifier {
  /** What the sheet calls it: a localization key or text, as `labelKey` says. */
  label: string;
  /** Whether `label` is a localization key rather than text. */
  labelKey: boolean;
  /** A key for what the modifier applies to, e.g. "Dodge", "melee", "DX". */
  appliesTo: string;
  value: number;
}

export interface ContextInput {
  posture: string;
  /** The Posture Table's figures for that posture (Characters p. 551). */
  postureEffects: { attack: number; defense: number };
  /** The Dodge penalty the load carries (Characters p. 17), zero or negative. */
  encumbranceDodge: number;
  encumbranceKey: string;
  maneuver: string;
  /** Temporary attribute penalties, zero or negative. */
  attributePenalties: Partial<Record<"ST" | "DX" | "IQ" | "HT", number>>;
  /** Timed conditions modules put on the character, each with its modifier lines. */
  timed: Array<{ label: string; modifiers: Array<{ label: string; value: number }> }>;
  /**
   * The conditions on the token and what they cost (Campaigns pp. 428-429):
   * the names of what is on them, and the attribute figures the table gives.
   *
   * Listed apart from the typed penalties above, because "Nauseated -2" is a
   * line the player can do something about and "Penalties -2" is not.
   */
  afflictions: {
    names: readonly string[];
    effect: { dx: number; iq: number; st: number; ht: number; defense: number };
  };
  /** Attack penalties from traits: Bad Sight, One Eye and the like. */
  attackPenalties: { melee: Array<{ trait: string; value: number }>; ranged: Array<{ trait: string; value: number }> };
  /** Layered armour's DX penalty (Campaigns p. 286), zero or negative. */
  layeringPenalty: number;
}

/**
 * What is modifying this character's rolls right now: posture, load,
 * maneuver, lowered attributes, the conditions on the token, timed conditions,
 * impairing traits and layered armour. Lines worth nothing are left out.
 */
export function contextModifiers(input: ContextInput): ContextModifier[] {
  const lines: ContextModifier[] = [];
  const push = (label: string, labelKey: boolean, appliesTo: string, value: number) => {
    if (Number.isFinite(value) && value !== 0) lines.push({ label, labelKey, appliesTo, value });
  };

  push(`GWORLD.Posture.${input.posture}`, true, "melee", input.postureEffects.attack);
  push(`GWORLD.Posture.${input.posture}`, true, "defense", input.postureEffects.defense);
  push(`GWORLD.Encumbrance.${input.encumbranceKey}`, true, "Dodge", input.encumbranceDodge);
  if (input.maneuver === "moveAndAttack") push("GWORLD.Maneuver.moveAndAttack", true, "melee", -4);
  for (const key of ["ST", "DX", "IQ", "HT"] as const) push("GWORLD.Penalties.Label", true, key, Number(input.attributePenalties[key]) || 0);
  // What the token's conditions come to, under the names of the conditions
  // themselves. The defense figure is theirs alone: an attribute penalty
  // never touches a defense (p. 421), and nausea's -1 does.
  if (input.afflictions.names.length > 0) {
    const named = input.afflictions.names.join(", ");
    const effect = input.afflictions.effect;
    push(named, false, "ST", Number(effect.st) || 0);
    push(named, false, "DX", Number(effect.dx) || 0);
    push(named, false, "IQ", Number(effect.iq) || 0);
    push(named, false, "HT", Number(effect.ht) || 0);
    push(named, false, "defense", Number(effect.defense) || 0);
  }
  for (const condition of input.timed) {
    for (const m of condition.modifiers) push(`${condition.label}: ${m.label}`, false, "", m.value);
  }
  for (const p of input.attackPenalties.melee) push(p.trait, false, "melee", p.value);
  for (const p of input.attackPenalties.ranged) push(p.trait, false, "ranged", p.value);
  push("GWORLD.Armor.LayeringShort", true, "DX", input.layeringPenalty);
  return lines;
}

// ── vitals ─────────────────────────────────────────────────────────────────

/** How full a pool is, 0-100, for its bar. A pool below zero shows empty. */
export function poolPercent(value: unknown, max: unknown): number {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

/**
 * How much of the heaviest load the character is carrying, 0-100, for the
 * encumbrance bar: Extra-Heavy is ten times Basic Lift (Characters p. 17).
 */
export function loadPercent(carried: unknown, basicLift: unknown): number {
  const c = Number(carried);
  const bl = Number(basicLift);
  if (!Number.isFinite(c) || !Number.isFinite(bl) || bl <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c / (bl * 10)) * 100)));
}

// ── Will and Perception ────────────────────────────────────────────────────

/** One score the Overview rolls against: Will, Perception, or one sense. */
export interface AwarenessRoll {
  /** "will", "per", or the sense's own key. */
  key: string;
  /** The localization key for the row's name. */
  label: string;
  /** The attribute the roll is made against, and the tag it carries. */
  basedOn: "Will" | "Per";
  /** The sense the Perception roll is made by; empty for Will and plain Per. */
  sense: string;
  /** What is rolled against, or null where the sense is missing. */
  score: number | null;
  /** What traits moved a sense by, for the row's note. Zero for Will and Per. */
  modifier: number;
  /** Vision seen without colour (Colorblindness, Characters p. 127). */
  colorblind?: boolean;
  /** Hearing's distances multiplied (Parabolic Hearing, Characters p. 72). */
  rangeMultiplier?: number;
}

export interface AwarenessInput {
  will: unknown;
  per: unknown;
  /** The senses as `senseScores` worked them out, in the order they are shown. */
  senses: ReadonlyArray<{ sense: string; score: number | null; modifier: number; colorblind?: boolean; rangeMultiplier?: number }>;
}

/**
 * What the Overview rolls when the GM asks for a Will or a Perception roll:
 * the two scores, and then each sense, since "A Sense roll is a Perception
 * roll" made at the score that sense's traits leave (Characters pp. 35,
 * 124, 129, 138). A sense the character does not have is listed without a
 * score, so the row says the sense is gone rather than hiding it.
 */
export function awarenessRolls(input: AwarenessInput): AwarenessRoll[] {
  // A missing sense, and a score the character has not got, are both "no
  // roll" -- and `Number(null)` is 0, which would read as a score of zero.
  const score = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return [
    { key: "will", label: "GWORLD.Secondary.Will", basedOn: "Will", sense: "", score: score(input.will), modifier: 0 },
    { key: "per", label: "GWORLD.Secondary.Per", basedOn: "Per", sense: "", score: score(input.per), modifier: 0 },
    ...input.senses.map((sense) => ({
      key: sense.sense,
      label: `GWORLD.Senses.${sense.sense}`,
      basedOn: "Per" as const,
      sense: sense.sense,
      score: score(sense.score),
      modifier: Number(sense.modifier) || 0,
      ...(sense.colorblind ? { colorblind: true } : {}),
      ...(Number(sense.rangeMultiplier) > 1 ? { rangeMultiplier: Number(sense.rangeMultiplier) } : {}),
    })),
  ];
}
