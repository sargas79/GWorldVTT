/**
 * A bonus held for a later roll (since API 1.132.0).
 *
 * Some bonuses are earned now and spent on a roll to come: the Evaluate
 * maneuver's is the Basic Set's own case (Campaigns p. 364), and a module's
 * rules may give others -- a survey that helps the next roll of a related
 * skill. A module holds one on the actor with `actors.addPendingModifier`,
 * and the actor's next success roll that matches it takes its line and uses
 * it up. It may lapse first, at a world time.
 *
 * The bonuses live on the actor as a flag, like its timed conditions, and are
 * written by whoever owns it. A lapsed one is ignored on sight and dropped at
 * the next write, so nothing has to watch the clock for them.
 */

import { SYSTEM_ID } from "./constants.js";
import type { RollModifier } from "./roll.js";

/** What a module asks to hold: the line, and what a roll must be to take it. */
export interface PendingModifierRequest {
  /** The line's label on the roll, as the card shows it. */
  label: string;
  /** What it adds to the roll (or takes off it, below 0). Never 0. */
  value: number;
  /** Tags the roll must carry, every one of them: its kind is one (`skill`, `attribute`, `attack`...). */
  tags?: string[];
  /** The skill the roll must be of, by name. "Survival" takes any specialty; "Survival (Desert)" only that one. */
  skill?: string;
  /** The world time, in seconds, it lapses at if no roll has taken it. */
  expires?: number;
}

/** A held bonus as the actor keeps it. */
export interface PendingModifier {
  id: string;
  label: string;
  value: number;
  tags: string[];
  skill: string | null;
  expires: number | null;
}

/** What a success roll is, for matching it to the bonuses held for it. */
export interface PendingRoll {
  skill?: string | undefined;
  /** The roll's tags, its kind among them. */
  tags: string[];
}

/** Where the held bonuses are kept on an actor. */
export const PENDING_MODIFIERS_FLAG = "pendingModifiers";

/** The key a held bonus's line carries on the roll, for a listener to find it by. */
export const PENDING_MODIFIER_KEY = "pendingModifier";

function worldTime(): number {
  return Number((globalThis as any).game?.time?.worldTime) || 0;
}

function newId(): string {
  const random = (globalThis as any).foundry?.utils?.randomID;
  return typeof random === "function" ? String(random()) : Math.random().toString(36).slice(2, 18);
}

/** Whether a held bonus has lapsed at this world time. */
function lapsed(entry: PendingModifier, now: number): boolean {
  return entry.expires !== null && now >= entry.expires;
}

/** Every bonus the actor has kept, lapsed or not, as far as they read as one. */
function stored(actor: any): PendingModifier[] {
  const kept = actor?.getFlag?.(SYSTEM_ID, PENDING_MODIFIERS_FLAG);
  return Array.isArray(kept)
    ? kept.filter((m): m is PendingModifier => m && typeof m.id === "string" && typeof m.label === "string" && Number.isFinite(m.value))
    : [];
}

/** The bonuses held on an actor that haven't lapsed. */
export function pendingModifiers(actor: any, now = worldTime()): PendingModifier[] {
  return stored(actor).filter((m) => !lapsed(m, now));
}

/**
 * A skill's name as the two sides are compared: case, spacing and a tech
 * level don't count, so "Guns/TL8 (Pistol)" is "guns (pistol)".
 */
function skillName(name: string): string {
  return name.toLowerCase().replace(/\/tl\d*/g, "").replace(/\s+/g, " ").trim();
}

/** Whether a roll takes a held bonus: its skill, where the bonus names one, and every tag it asks for. */
export function pendingModifierMatches(entry: PendingModifier, roll: PendingRoll): boolean {
  if (entry.skill) {
    const wanted = skillName(entry.skill);
    const rolled = skillName(String(roll.skill ?? ""));
    // A bonus for a skill without a specialty is good for any of its specialties.
    const general = wanted.includes("(") ? rolled : rolled.replace(/\s*\(.*\)$/, "");
    if (!rolled || general !== wanted) return false;
  }
  return entry.tags.every((tag) => roll.tags.includes(tag));
}

/**
 * The lines the bonuses held for this roll put on it, each keyed
 * `pendingModifier`, with the bonus each came from, so the ones the roll
 * keeps can be used up once it is made.
 */
export function pendingModifierLines(actor: any, roll: PendingRoll, now = worldTime()): Array<{ line: RollModifier; id: string }> {
  return pendingModifiers(actor, now)
    .filter((entry) => pendingModifierMatches(entry, roll))
    .map((entry) => ({ line: { label: entry.label, value: entry.value, key: PENDING_MODIFIER_KEY }, id: entry.id }));
}

/**
 * Holds a bonus for the actor's next success roll that matches it. Returns
 * its id, or null for a user who can't change the actor, a bonus with no
 * label or no value, one that names neither a skill nor a tag (it would go
 * on whatever came next, a defense included), or one already lapsed.
 */
export async function addPendingModifier(actor: any, request: PendingModifierRequest): Promise<string | null> {
  if (!actor?.isOwner || !request || typeof request !== "object") return null;
  const label = typeof request.label === "string" ? request.label.trim() : "";
  const value = Number(request.value);
  if (!label || !Number.isFinite(value) || value === 0) return null;
  const tags = Array.isArray(request.tags) ? [...new Set(request.tags.filter((t): t is string => typeof t === "string" && t !== ""))] : [];
  const skill = typeof request.skill === "string" && request.skill.trim() ? request.skill.trim() : null;
  if (!skill && tags.length === 0) return null;
  const now = worldTime();
  const expires = request.expires === undefined || request.expires === null ? null : Number(request.expires);
  if (expires !== null && (!Number.isFinite(expires) || expires <= now)) return null;
  const entry: PendingModifier = { id: newId(), label, value, tags, skill, expires };
  await actor.setFlag(SYSTEM_ID, PENDING_MODIFIERS_FLAG, [...pendingModifiers(actor, now), entry]);
  return entry.id;
}

/** Takes a held bonus off before any roll has used it. Resolves to whether there was one to take. */
export async function removePendingModifier(actor: any, id: string): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const kept = stored(actor);
  if (!kept.some((m) => m.id === id)) return false;
  await actor.setFlag(SYSTEM_ID, PENDING_MODIFIERS_FLAG, pendingModifiers(actor).filter((m) => m.id !== id));
  return true;
}

/**
 * Uses up the held bonuses a roll that was made took: the ones whose lines
 * were still on it once the listeners had had their say, since a line a
 * listener took off did nothing for the roll. Lapsed ones go with them.
 */
export async function spendPendingModifiers(actor: any, held: Array<{ line: RollModifier; id: string }>, applied: readonly unknown[]): Promise<void> {
  if (!actor?.isOwner || held.length === 0) return;
  const spent = new Set(held.filter((h) => applied.includes(h.line)).map((h) => h.id));
  if (spent.size === 0) return;
  await actor.setFlag(SYSTEM_ID, PENDING_MODIFIERS_FLAG, pendingModifiers(actor).filter((m) => !spent.has(m.id)));
}
