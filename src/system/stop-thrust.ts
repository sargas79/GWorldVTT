/**
 * A stop thrust's damage bonus (GURPS Basic Set: Campaigns p. 366), carried
 * from the attack roll to the damage roll that follows, which is a separate
 * click.
 */

import { SYSTEM_ID } from "./constants.js";

const STOP_THRUST_FLAG = "stopThrust";

/** Records the bonus a stop thrust bought, or clears it. */
export async function recordStopThrust(actor: any, bonus: number): Promise<void> {
  if (!actor?.isOwner) return;
  if (bonus > 0) await actor.setFlag(SYSTEM_ID, STOP_THRUST_FLAG, bonus);
  else if (actor.getFlag?.(SYSTEM_ID, STOP_THRUST_FLAG) !== undefined) await actor.unsetFlag(SYSTEM_ID, STOP_THRUST_FLAG);
}

/** Collects a stop thrust's bonus for the damage roll, and clears it. */
export async function consumeStopThrust(actor: any): Promise<number> {
  const bonus = Number(actor?.getFlag?.(SYSTEM_ID, STOP_THRUST_FLAG)) || 0;
  if (bonus && actor?.isOwner) await actor.unsetFlag(SYSTEM_ID, STOP_THRUST_FLAG);
  return bonus;
}
