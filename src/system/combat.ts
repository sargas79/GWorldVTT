/**
 * Turn order (GURPS Lite p. 25).
 *
 * Everyone acts in order of Basic Speed, highest first, and that order holds
 * for the whole fight: GURPS does not re-roll initiative each round. Foundry
 * gets that for free, because the initiative formula is Basic Speed and nothing
 * random goes into it.
 *
 * What Foundry does not get right on its own is the tie, and ties are the
 * ordinary case rather than the exception: Basic Speed comes in quarter-point
 * steps, so a party of four will routinely have two people on 5.00. The book
 * breaks that tie on DX, and only then arbitrarily.
 */

import { attributeOf } from "./attributes.js";

/**
 * A combatant's DX, or null when there is nothing to read it from -- an actor
 * that has been deleted, or a combatant with no actor at all.
 */
function dexterityOf(combatant: any): number | null {
  const dx = combatant?.actor ? attributeOf(combatant.actor, "DX") : undefined;
  return typeof dx === "number" && Number.isFinite(dx) ? dx : null;
}

export class GWorldCombat extends Combat {
  /**
   * Orders combatants by Basic Speed, then by DX, then arbitrarily.
   *
   * Foundry calls this unbound, so it cannot reach `this` -- everything it
   * needs comes off the two combatants.
   *
   * The last tie-break is the combatant id rather than a roll. The book says to
   * roll, but this comparator runs on every re-render, and a random value there
   * would reshuffle the turn order underneath the players several times a
   * round. An id is arbitrary in the same way a roll is and has the one
   * property a turn order actually needs, which is that it stops changing.
   */
  override _sortCombatants(a: any, b: any): number {
    const initiativeOf = (c: any) =>
      typeof c?.initiative === "number" && Number.isFinite(c.initiative) ? c.initiative : -Infinity;

    const bySpeed = initiativeOf(b) - initiativeOf(a);
    if (bySpeed !== 0) return bySpeed;

    // A combatant whose DX cannot be read sorts after one whose DX can, rather
    // than being treated as DX 0 and jumping ahead of nobody in particular.
    const dxA = dexterityOf(a);
    const dxB = dexterityOf(b);
    if (dxA !== null && dxB !== null && dxA !== dxB) return dxB - dxA;
    if (dxA === null && dxB !== null) return 1;
    if (dxB === null && dxA !== null) return -1;

    return String(a?.id) > String(b?.id) ? 1 : -1;
  }
}
