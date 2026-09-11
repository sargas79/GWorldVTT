/**
 * A blow struck with the flat or the butt
 * (GURPS Basic Set: Campaigns p. 401).
 *
 * Chosen at the attack and collected at the damage roll, the same way a called
 * shot is, because those are two clicks and the decision belongs to the first
 * of them: whether you meant to kill somebody is not something to settle after
 * the dice have landed.
 */

import { SYSTEM_ID } from "./constants.js";

/** Where the decision waits between the two rolls. */
export const TURNED_BLADE_FLAG = "turnedBlade";

/** Remembers that this blow was struck to subdue rather than to kill. */
export async function recordTurnedBlade(actor: any, turned: boolean): Promise<void> {
  if (!actor?.isOwner) return;

  if (!turned) {
    if (actor.getFlag?.(SYSTEM_ID, TURNED_BLADE_FLAG)) {
      await actor.unsetFlag(SYSTEM_ID, TURNED_BLADE_FLAG);
    }
    return;
  }

  await actor.setFlag(SYSTEM_ID, TURNED_BLADE_FLAG, true);
}

/** Collects it for the damage roll, and clears it either way. */
export async function consumeTurnedBlade(actor: any): Promise<boolean> {
  if (!actor?.getFlag?.(SYSTEM_ID, TURNED_BLADE_FLAG)) return false;
  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, TURNED_BLADE_FLAG);
  return true;
}
