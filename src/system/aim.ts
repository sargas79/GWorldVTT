/**
 * Keeping an aim, and losing it (GURPS Basic Set: Campaigns p. 364).
 *
 * The turns spent aiming live on the actor, and the shot reads them. What
 * this module adds is the losing: "If you are injured while aiming, or forced
 * to make an active defense, you lose your aim", and a shot fired spends it.
 * Choosing any other maneuver drops it too, since aiming is the maneuver.
 */

import { SYSTEM_ID } from "./constants.js";
import type { AimLoss } from "../rules/aim.js";

/** Turns spent aiming so far, or 0 for somebody not aiming. */
export function aimTurnsOf(actor: any): number {
  if (actor?.system?.maneuver !== "aim") return 0;
  return Math.max(0, Math.floor(Number(actor.system?.aim?.turns ?? 0)));
}

/**
 * Drops the aim, saying why, for an actor this user may change.
 *
 * Quiet when there was no aim to lose: most people hit in a fight were not
 * aiming, and a note about it every time would be noise.
 */
export async function loseAim(actor: any, reason: AimLoss): Promise<void> {
  if (!actor?.isOwner) return;
  const turns = Number(actor.system?.aim?.turns ?? 0);
  if (!(turns > 0)) return;

  await actor.update({ "system.aim.turns": 0 });
  if (reason !== "moved") {
    ui.notifications?.info(
      game.i18n.format(`GWORLD.Aim.Lost.${reason}`, { name: String(actor.name ?? "") }),
    );
  }
}

/**
 * Drops the aim when the maneuver changes to anything but Aim. Only the
 * client that made the change acts, so it is written once.
 */
export function registerAimTracking(): void {
  Hooks.on("updateActor", (actor: any, changes: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    const maneuver = changes?.system?.maneuver;
    if (typeof maneuver !== "string" || maneuver === "aim") return;
    void loseAim(actor, "moved");
  });
}

export { SYSTEM_ID as AIM_SYSTEM_ID };
