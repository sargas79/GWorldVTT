/**
 * Keeping an aim, and losing it (GURPS Basic Set: Campaigns p. 364).
 *
 * The turns spent aiming live on the actor, and the shot reads them. What
 * this module adds is the losing: "If you are injured while aiming, or forced
 * to make an active defense, you lose your aim", and a shot fired spends it.
 * Choosing any other maneuver drops it too, since aiming is the maneuver.
 */

import { SYSTEM_ID } from "./constants.js";
import { targetedTokens } from "./targets.js";
import type { AimLoss } from "../rules/aim.js";

/** A module's bonus for aiming at one foe, such as magnifying optics trained on them (since API 1.63.0). */
export interface AimTargetBonus {
  label: string;
  value: number;
  key?: string;
}

/** The aim an actor holds (since API 1.63.0): turns, bracing, whom at, and module bonuses for that foe. */
export interface AimState {
  turns: number;
  braced: boolean;
  /** The UUID of the token aimed at, blank where nobody was targeted. */
  target: string;
  bonuses: AimTargetBonus[];
}

/** The aim as the actor stores it. */
export function aimStateOf(actor: any): AimState {
  const aim = actor?.system?.aim ?? {};
  return {
    turns: Math.max(0, Math.floor(Number(aim.turns ?? 0))),
    braced: aim.braced === true,
    target: String(aim.target ?? ""),
    bonuses: (Array.isArray(aim.bonuses) ? aim.bonuses : [])
      .filter((b: any) => b && Number.isFinite(Number(b.value)) && Number(b.value) !== 0)
      .map((b: any) => ({ label: String(b.label ?? ""), value: Number(b.value), ...(b.key ? { key: String(b.key) } : {}) })),
  };
}

/**
 * The lines a shot takes from a module's per-target aim bonuses: only while
 * aiming, and only at the foe the aim was taken at.
 */
export function aimTargetLines(aim: AimState, turnsAiming: number, targetUuid: string): Array<{ label: string; value: number; key: string }> {
  if (!(turnsAiming > 0) || !aim.bonuses.length) return [];
  if (aim.target && aim.target !== targetUuid) return [];
  return aim.bonuses.map((b) => ({ label: b.label, value: b.value, key: b.key || "aimTarget" }));
}

/** Turns spent aiming so far, or 0 for somebody not aiming. */
export function aimTurnsOf(actor: any): number {
  if (actor?.system?.maneuver !== "aim") return 0;
  return Math.max(0, Math.floor(Number(actor.system?.aim?.turns ?? 0)));
}

/** The reasons the system has its own words for. */
const KNOWN_LOSSES: readonly AimLoss[] = ["injured", "defended", "fired", "moved"];

/**
 * Drops the aim, saying why, for an actor this user may change. True where
 * there was an aim to lose.
 *
 * Quiet when there was no aim to lose: most people hit in a fight were not
 * aiming, and a note about it every time would be noise. A reason the system
 * doesn't know -- a module's own, since API 1.87.0 -- is shown as given.
 */
export async function loseAim(actor: any, reason: AimLoss | string): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const turns = Number(actor.system?.aim?.turns ?? 0);
  if (!(turns > 0)) return false;

  await actor.update({ "system.aim.turns": 0, "system.aim.target": "", "system.aim.bonuses": [] });
  if (reason === "moved") return true;
  const name = String(actor.name ?? "");
  const text = (KNOWN_LOSSES as readonly string[]).includes(reason)
    ? game.i18n.format(`GWORLD.Aim.Lost.${reason}`, { name })
    : reason
      ? game.i18n.format("GWORLD.Aim.Lost.other", { name, reason: String(reason) })
      : game.i18n.format("GWORLD.Aim.Lost.plain", { name });
  ui.notifications?.info(text);
  return true;
}

/**
 * Drops the aim when the maneuver changes to anything but Aim. Only the
 * client that made the change acts, so it is written once.
 */
export function registerAimTracking(): void {
  Hooks.on("updateActor", (actor: any, changes: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    // An aim taken at someone new starts afresh: whom it is at, and no bonuses
    // a module gave for the last foe (since API 1.63.0).
    const turns = changes?.system?.aim?.turns;
    if (typeof turns === "number" && turns > 0 && actor?.isOwner) {
      const targets = targetedTokens();
      const uuid = targets.length === 1 ? String(targets[0]?.document?.uuid ?? targets[0]?.uuid ?? "") : "";
      if (uuid !== String(actor.system?.aim?.target ?? "")) {
        void actor.update({ "system.aim.target": uuid, "system.aim.bonuses": [] });
      }
    }
    const maneuver = changes?.system?.maneuver;
    if (typeof maneuver !== "string" || maneuver === "aim") return;
    void loseAim(actor, "moved");
  });
}

export { SYSTEM_ID as AIM_SYSTEM_ID };
