/**
 * What the party sheet shows, worked out from the members' data without
 * Foundry, so it can be tested: the member list's edits, each member's row,
 * the best of every skill between them, and the languages they share.
 */

import { pointBadge, poolPercent, type PointBadge } from "../sheet-v2/overview.js";
import { byName } from "../sort.js";

// ── the member list ────────────────────────────────────────────────────────

/** One member, as the party stores it: the actor's UUID. */
export interface MemberEntry {
  uuid: string;
}

/** The actor types that can join a party: people, not vehicles or other parties. */
export const JOINABLE_TYPES: readonly string[] = ["character", "npc"];

export function canJoin(type: unknown): boolean {
  return typeof type === "string" && JOINABLE_TYPES.includes(type);
}

/** The list with these UUIDs added at the end, each once, in the order given. */
export function addMembers(members: readonly MemberEntry[], uuids: readonly string[]): MemberEntry[] {
  const out = members.map((m) => ({ uuid: m.uuid }));
  const seen = new Set(out.map((m) => m.uuid));
  for (const uuid of uuids) {
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push({ uuid });
  }
  return out;
}

export function removeMember(members: readonly MemberEntry[], uuid: string): MemberEntry[] {
  return members.filter((m) => m.uuid !== uuid).map((m) => ({ uuid: m.uuid }));
}

/** The list with one member moved a step up (-1) or down (+1); unchanged at either end. */
export function moveMember(members: readonly MemberEntry[], uuid: string, by: -1 | 1): MemberEntry[] {
  const out = members.map((m) => ({ uuid: m.uuid }));
  const from = out.findIndex((m) => m.uuid === uuid);
  const to = from + by;
  const entry = out[from];
  if (!entry || to < 0 || to >= out.length) return out;
  out.splice(from, 1);
  out.splice(to, 0, entry);
  return out;
}

// ── a member's row ─────────────────────────────────────────────────────────

/** A defense as the character's data model works it out. */
export interface DefenseLike {
  total: number;
  source?: string;
}

/** The parts of a character's `system` the roster reads. */
export interface MemberSystemLike {
  hp?: { value?: unknown; max?: unknown };
  fp?: { value?: unknown; max?: unknown };
  derived?: {
    will?: unknown;
    per?: unknown;
    basicSpeed?: unknown;
    basicMove?: unknown;
    move?: unknown;
    dr?: unknown;
    status?: unknown;
    fatigue?: { status?: unknown };
    defenses?: { dodge?: DefenseLike | null; parry?: DefenseLike | null; block?: DefenseLike | null };
    hitLocations?: Array<{ key: string; dr?: unknown; splits?: unknown }>;
    encumbrance?: { key?: unknown; level?: unknown };
    points?: { spent?: unknown; available?: unknown; unspent?: unknown };
  };
}

export interface PoolView {
  value: number;
  max: number;
  /** 0-100, for the bar. */
  percent: number;
  /** "healthy", "reeling", ... for HP; "fresh", "veryTired", ... for FP. */
  status: string;
}

export interface MemberRow {
  hp: PoolView;
  fp: PoolView;
  will: number | null;
  per: number | null;
  basicSpeed: number | null;
  basicMove: number | null;
  move: number | null;
  defenses: { dodge: DefenseLike | null; parry: DefenseLike | null; block: DefenseLike | null };
  /** The torso's DR, and whether it splits by damage type. */
  dr: { value: number; splits: boolean };
  encumbrance: { key: string; level: number };
  points: PointBadge;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pool(stored: { value?: unknown; max?: unknown } | undefined, status: string): PoolView {
  const value = num(stored?.value) ?? 0;
  const max = num(stored?.max) ?? 0;
  return { value, max, percent: poolPercent(value, max), status };
}

function defense(value: DefenseLike | null | undefined): DefenseLike | null {
  if (!value || typeof value !== "object") return null;
  const total = num(value.total);
  return total === null ? null : { total, source: typeof value.source === "string" ? value.source : "" };
}

/** The figures a member's row on the party sheet carries. */
export function memberRow(system: MemberSystemLike): MemberRow {
  const derived = system.derived ?? {};
  const torso = (derived.hitLocations ?? []).find((l) => l.key === "torso");
  return {
    hp: pool(system.hp, typeof derived.status === "string" ? derived.status : "healthy"),
    fp: pool(system.fp, typeof derived.fatigue?.status === "string" ? derived.fatigue.status : "fresh"),
    will: num(derived.will),
    per: num(derived.per),
    basicSpeed: num(derived.basicSpeed),
    basicMove: num(derived.basicMove),
    move: num(derived.move),
    defenses: {
      dodge: defense(derived.defenses?.dodge),
      parry: defense(derived.defenses?.parry),
      block: defense(derived.defenses?.block),
    },
    dr: { value: num(torso?.dr) ?? num(derived.dr) ?? 0, splits: torso?.splits === true },
    encumbrance: {
      key: typeof derived.encumbrance?.key === "string" ? derived.encumbrance.key : "none",
      level: num(derived.encumbrance?.level) ?? 0,
    },
    points: pointBadge(derived.points ?? {}),
  };
}

// ── the best of each skill ─────────────────────────────────────────────────

export interface MemberSkillLike {
  id: string;
  name: string;
  level: number | null;
  points: number;
  attribute?: string;
}

export interface MemberSkillsLike {
  uuid: string;
  name: string;
  skills: readonly MemberSkillLike[];
}

/** One member's level in a skill. */
export interface SkillHolder {
  uuid: string;
  memberName: string;
  id: string;
  level: number;
  attribute: string;
}

export interface PartySkillRow {
  name: string;
  best: SkillHolder;
  /** Everyone else who has it, best first. */
  others: SkillHolder[];
}

/**
 * Every skill somebody has put points into, one row per name, with the
 * highest level and who holds it. On a tie the member listed first keeps the
 * row; the rest are named beside it.
 */
export function partySkills(members: readonly MemberSkillsLike[]): PartySkillRow[] {
  const byNameKey = new Map<string, SkillHolder[]>();
  for (const member of members) {
    for (const skill of member.skills) {
      const name = String(skill.name ?? "").trim();
      if (!name || skill.level === null || !Number.isFinite(skill.level) || skill.points <= 0) continue;
      const holders = byNameKey.get(name) ?? [];
      holders.push({
        uuid: member.uuid,
        memberName: member.name,
        id: skill.id,
        level: skill.level,
        attribute: String(skill.attribute ?? ""),
      });
      byNameKey.set(name, holders);
    }
  }
  const rows: PartySkillRow[] = [];
  for (const [name, holders] of byNameKey) {
    // A stable sort keeps the earlier member ahead on a tie.
    const sorted = [...holders].sort((a, b) => b.level - a.level);
    const best = sorted[0];
    if (best) rows.push({ name, best, others: sorted.slice(1) });
  }
  return rows.sort(byName);
}

// ── languages ──────────────────────────────────────────────────────────────

/** How well a language is known, worst to best (Characters p. 23). */
export const LANGUAGE_LEVELS = ["none", "broken", "accented", "native"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export interface MemberLanguageLike {
  name: string;
  spoken: string;
  written: string;
}

export interface MemberLanguagesLike {
  uuid: string;
  name: string;
  languages: readonly MemberLanguageLike[];
}

export interface LanguageHolder {
  uuid: string;
  memberName: string;
  level: LanguageLevel;
}

export interface PartyLanguageRow {
  name: string;
  /**
   * Everyone who speaks it, best first and then by name; empty when nobody
   * speaks it at all.
   *
   * A list rather than the best speaker alone, because the useful answer at
   * the table is *who* can talk to the innkeeper, not who talks to them best:
   * four members with native Common are four people who can be sent in.
   */
  spoken: LanguageHolder[];
  written: LanguageHolder[];
  /** How many members know it in any form. */
  known: number;
}

function languageRank(level: unknown): number {
  const index = (LANGUAGE_LEVELS as readonly string[]).indexOf(String(level ?? "none"));
  return index < 0 ? 0 : index;
}

function levelAt(rank: number): LanguageLevel {
  return LANGUAGE_LEVELS[rank] ?? "none";
}

/** Best level first, and members at the same level in name order. */
function byLevelThenName(a: LanguageHolder, b: LanguageHolder): number {
  const difference = languageRank(b.level) - languageRank(a.level);
  return difference !== 0 ? difference : a.memberName.localeCompare(b.memberName);
}

/** Every language anyone knows, with everyone who speaks and everyone who writes it. */
export function partyLanguages(members: readonly MemberLanguagesLike[]): PartyLanguageRow[] {
  const rows = new Map<string, PartyLanguageRow>();
  for (const member of members) {
    for (const language of member.languages) {
      const name = String(language.name ?? "").trim();
      if (!name) continue;
      const spokenRank = languageRank(language.spoken);
      const writtenRank = languageRank(language.written);
      if (spokenRank === 0 && writtenRank === 0) continue;
      const row = rows.get(name) ?? { name, spoken: [], written: [], known: 0 };
      row.known += 1;
      if (spokenRank > 0) {
        row.spoken.push({ uuid: member.uuid, memberName: member.name, level: levelAt(spokenRank) });
      }
      if (writtenRank > 0) {
        row.written.push({ uuid: member.uuid, memberName: member.name, level: levelAt(writtenRank) });
      }
      rows.set(name, row);
    }
  }
  for (const row of rows.values()) {
    row.spoken.sort(byLevelThenName);
    row.written.sort(byLevelThenName);
  }
  return [...rows.values()].sort(byName);
}

// ── the campaign's terms ───────────────────────────────────────────────────

/** The campaign's terms as the party stores them: null is "not set". */
export interface CampaignTerms {
  tl: number | null;
  startingPoints: number | null;
  disadvantageLimit: number | null;
}

export const CAMPAIGN_TERM_KEYS = ["tl", "startingPoints", "disadvantageLimit"] as const;
export type CampaignTermKey = (typeof CAMPAIGN_TERM_KEYS)[number];

/** The stored terms read strictly: anything but a finite number is "not set". */
export function termsFrom(stored: Partial<Record<CampaignTermKey, unknown>> | null | undefined): CampaignTerms {
  const read = (key: CampaignTermKey): number | null => {
    const value = stored?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return { tl: read("tl"), startingPoints: read("startingPoints"), disadvantageLimit: read("disadvantageLimit") };
}

/** Which of the terms a party has set, and so locks on its members' sheets. */
export function lockedTerms(terms: CampaignTerms | null): Record<CampaignTermKey, boolean> {
  return {
    tl: terms?.tl !== null && terms?.tl !== undefined,
    startingPoints: terms?.startingPoints !== null && terms?.startingPoints !== undefined,
    disadvantageLimit: terms?.disadvantageLimit !== null && terms?.disadvantageLimit !== undefined,
  };
}
