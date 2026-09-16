/**
 * What the new character sheet's header and Overview tab show, worked out from
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
  /** Attack penalties from traits: Bad Sight, One Eye and the like. */
  attackPenalties: { melee: Array<{ trait: string; value: number }>; ranged: Array<{ trait: string; value: number }> };
  /** Layered armour's DX penalty (Campaigns p. 286), zero or negative. */
  layeringPenalty: number;
}

/**
 * What is modifying this character's rolls right now: posture, load,
 * maneuver, lowered attributes, timed conditions, impairing traits and layered
 * armour. Lines worth nothing are left out.
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
