/**
 * Zen Archery, and any skill of the same shape (GURPS Basic Set: Characters
 * p. 228).
 *
 * The archer concentrates -- the Concentrate maneuver, counted on the actor
 * as `system.concentrateTurns` -- and then rolls the skill, at -10 on the
 * instant and less the longer the concentration was. A success is held on the
 * actor until the next shot with a weapon skill the zen skill covers, which
 * takes a line keyed `zen` giving back two-thirds of its size and speed/range
 * penalties. A failure, or the shot, spends it.
 *
 * The system registers Zen Archery for the Bow skill. A module registers its
 * own skill for other weapons with `registerZenSkill` (since API 1.91.0), and
 * it works the same way. Knowing the skill is what makes it available, as for
 * the system's other cinematic skills: it has no default, so a character
 * without it has no roll to make.
 */

import { ZEN_ARCHERY, ZEN_ARCHERY_COVERS, concentrateTurnsAfterTurn, zenConcentrationModifier, zenShotBonus, zenSkillCovers } from "../rules/zen-archery.js";
import { normalizeSkillName } from "../rules/skills.js";
import { SYSTEM_ID } from "./constants.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";
import { rollSuccess, type RollModifier } from "./roll.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Where a successful roll waits for the shot it is for. */
const ZEN_SHOT_FLAG = "zenShot";

/** A module's zen skill, as it registers it (since API 1.91.0). */
export interface ZenSkillRegistration {
  module: string;
  key: string;
  /** The skill's name, as the character sheet has it: "Zen Marksmanship". */
  skill: string;
  /**
   * The weapon skills it is used with. A name covers its specialties, so
   * "Guns" covers "Guns (Pistol)" and "Guns/TL8 (Rifle)".
   */
  covers: string[];
  /** Whether it is offered to this actor right now (e.g. "my switch is on"). Defaults to always. */
  available?: (actor: any) => boolean;
}

/** A zen skill the system knows: its own, or a module's. */
export interface ZenSkill {
  /** `zenArchery` for the system's own; `<module>.<key>` for a module's. */
  id: string;
  skill: string;
  covers: string[];
  available: (actor: any) => boolean;
}

/** A successful roll waiting for its shot. */
export interface ZenShot {
  /** The zen skill's id. */
  id: string;
  /** Its name, for the line on the shot. */
  skill: string;
}

const zenSkills = new Map<string, ZenSkill>([
  ["zenArchery", { id: "zenArchery", skill: ZEN_ARCHERY, covers: [...ZEN_ARCHERY_COVERS], available: () => true }],
]);

function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

/** Registers a module's zen skill. Returns its `<module>.<key>`, or null. */
export function registerZenSkill(registration: ZenSkillRegistration): string | null {
  const r = registration ?? ({} as ZenSkillRegistration);
  const what = `zen skill ${r.module}.${r.key}`;
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse(what, "the key is missing or malformed");
  if (typeof r.skill !== "string" || !r.skill.trim()) return refuse(what, "it names no skill");
  const covers = Array.isArray(r.covers) ? r.covers.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()) : [];
  if (!covers.length) return refuse(what, "it covers no weapon skill");
  const id = `${r.module}.${r.key}`;
  if (zenSkills.has(id)) return refuse(what, "that key is already registered");
  zenSkills.set(id, {
    id,
    skill: r.skill.trim(),
    covers,
    available: typeof r.available === "function" ? r.available : () => true,
  });
  return id;
}

/** Every zen skill, the system's first. */
export function registeredZenSkills(): ZenSkill[] {
  return [...zenSkills.values()];
}

/** For tests: forgets the modules' registrations. */
export function resetZenSkills(): void {
  for (const id of [...zenSkills.keys()]) if (id !== "zenArchery") zenSkills.delete(id);
}

/** A skill's level by name, as the sheet compares names; null where the character doesn't have it. */
function skillLevel(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    if (normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" ? level : null;
  }
  return null;
}

function offered(actor: any, zen: ZenSkill): boolean {
  try {
    return zen.available(actor) !== false;
  } catch (error) {
    console.error(`gworld | zen skill ${zen.id}: available() threw`, error);
    return false;
  }
}

/** The turns this actor has concentrated, unbroken, as the actor holds them. */
export function concentrateTurnsOf(actor: any): number {
  return Math.max(0, Math.floor(Number(actor?.system?.concentrateTurns ?? 0) || 0));
}

/**
 * The zen skills this actor knows and may use now, with the level, the
 * modifier the turns concentrated give the roll, and whether a success is
 * waiting for its shot.
 */
export function zenSkillsOf(actor: any): Array<ZenSkill & { level: number; modifier: number; ready: boolean }> {
  const turns = concentrateTurnsOf(actor);
  const pending = pendingZenShot(actor);
  return registeredZenSkills().flatMap((zen) => {
    const level = skillLevel(actor, zen.skill);
    if (level === null || !offered(actor, zen)) return [];
    return [{ ...zen, level, modifier: zenConcentrationModifier(turns), ready: pending?.id === zen.id }];
  });
}

/** The success waiting for its shot, or null. */
export function pendingZenShot(actor: any): ZenShot | null {
  const flag = actor?.getFlag?.(SYSTEM_ID, ZEN_SHOT_FLAG) ?? actor?.flags?.[SYSTEM_ID]?.[ZEN_SHOT_FLAG];
  if (!flag || typeof flag.id !== "string" || !flag.id) return null;
  return { id: flag.id, skill: String(flag.skill ?? "") };
}

/** Drops a waiting success, for an actor this user may change. */
export async function clearZenShot(actor: any): Promise<void> {
  if (!actor?.isOwner || !pendingZenShot(actor)) return;
  await actor.unsetFlag(SYSTEM_ID, ZEN_SHOT_FLAG);
}

/**
 * Rolls a zen skill at the modifier the turns concentrated give it, tagged
 * `zen`. A success waits on the actor for the next shot the skill covers; a
 * failure drops any success already waiting. Returns the roll, or null where
 * there was none: an unknown skill, one the actor doesn't know, a user who
 * doesn't own the actor.
 */
export async function rollZenSkill(actor: any, id: string = "zenArchery"): Promise<{ success: boolean } | null> {
  if (!actor?.isOwner) return null;
  const zen = zenSkills.get(String(id ?? ""));
  if (!zen || !offered(actor, zen)) return null;
  const level = skillLevel(actor, zen.skill);
  if (level === null) return null;
  const turns = concentrateTurnsOf(actor);
  const modifiers: RollModifier[] = [{
    label: turns > 0
      ? game.i18n.format("GWORLD.Zen.Concentrated", { turns })
      : game.i18n.localize("GWORLD.Zen.Instant"),
    value: zenConcentrationModifier(turns),
    key: "zenConcentration",
  }];
  const outcome = await rollSuccess({
    actor,
    base: level,
    label: zen.skill,
    kind: "skill",
    skill: zen.skill,
    tags: ["zen", "IQ"],
    modifiers,
  });
  if (!outcome) return null;
  if (outcome.success) {
    await actor.setFlag(SYSTEM_ID, ZEN_SHOT_FLAG, { id: zen.id, skill: zen.skill });
    ui.notifications?.info(game.i18n.format("GWORLD.Zen.Ready", { name: String(actor.name ?? ""), skill: zen.skill, weapons: zen.covers.join(", ") }));
  } else {
    await clearZenShot(actor);
  }
  return { success: outcome.success === true };
}

/**
 * The success waiting for a shot rolled with this weapon skill, or null
 * where none is waiting or the one waiting doesn't cover the skill.
 */
export function zenShotFor(actor: any, weaponSkill: string): ZenShot | null {
  const pending = pendingZenShot(actor);
  if (!pending) return null;
  const zen = zenSkills.get(pending.id);
  if (!zen || !zenSkillCovers(zen.covers, weaponSkill)) return null;
  return { id: zen.id, skill: zen.skill };
}

/**
 * The line a zen success puts on a shot, worked out from the shot's lines
 * keyed `size` and `speedRange` as they stand: what it gives back of them,
 * keyed `zen` and carrying the skill's id. Null where they come to no
 * penalty, and there is nothing to ease.
 */
export function zenLine(shot: ZenShot, modifiers: ReadonlyArray<{ label?: string; value: number; key?: string }>): RollModifier & { zen: string } | null {
  const sum = (key: string) => modifiers.filter((m) => m.key === key).reduce((total, m) => total + (Number(m.value) || 0), 0);
  const value = zenShotBonus({ size: sum("size"), speedRange: sum("speedRange") });
  if (value === 0) return null;
  return { label: game.i18n.format("GWORLD.Zen.Line", { skill: shot.skill }), value, key: "zen", zen: shot.id };
}

/**
 * Moves the concentration on at the end of each combatant's turn: one more
 * after a turn spent concentrating, and none after any other. The GM's
 * client writes it.
 */
export function registerConcentrateTracking(): void {
  Hooks.on(PROCEDURE_HOOKS.turnEnd, (_combat: unknown, combatant: any) => {
    if (!game.user?.isGM) return;
    const actor = combatant?.actor;
    const system = actor?.system;
    if (!system || typeof system.concentrateTurns !== "number") return;
    const next = concentrateTurnsAfterTurn(system.concentrateTurns, String(system.maneuver ?? ""));
    if (next !== system.concentrateTurns) void actor.update({ "system.concentrateTurns": next });
  });
}
