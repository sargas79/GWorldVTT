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
 *
 * The DX goes into the initiative itself, as a fraction too small to show,
 * rather than into the comparator. The comparator runs on every client, but
 * whether a player may end their turn is decided by the server, which orders
 * the combatants its own way -- initiative, then id -- and never runs the
 * system's code. A comparator that broke ties on DX gave the server and the
 * table two different orders whenever two Basic Speeds tied, and the server
 * then refused a player's "end turn" because, by its order, the turn was
 * somebody else's (sargas79/GWorldVTT#979).
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

/**
 * What DX adds to Basic Speed in the initiative: a hundred-thousandth a point,
 * well under the quarter-point steps Basic Speed comes in and under the two
 * decimals the tracker shows. Nothing for a combatant whose DX can't be read,
 * which so sorts after one whose DX can.
 */
export function initiativeTieBreak(dx: number | null): number {
  if (dx === null || !Number.isFinite(dx)) return 0;
  return Math.min(999, Math.max(0, Math.round(dx))) / 100000;
}

/** The initiative formula: Basic Speed, then DX in the digits the tracker leaves off. */
export const INITIATIVE_FORMULA = "@derived.basicSpeed + @tieBreak";

export class GWorldCombatant extends Combatant {
  /** The initiative roll, with this combatant's DX to break a tie in Basic Speed. */
  override getInitiativeRoll(formula?: string): any {
    const data = { ...(this.actor?.getRollData?.() ?? {}), tieBreak: initiativeTieBreak(dexterityOf(this)) };
    return new Roll(formula || this._getInitiativeFormula?.() || INITIATIVE_FORMULA, data);
  }
}

export class GWorldCombat extends Combat {
  /**
   * Orders combatants by initiative, highest first, then by id -- the order
   * Foundry's server keeps, which is what decides whose turn it is.
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

    // Two unrolled combatants are both at -Infinity, whose difference is NaN.
    const bySpeed = initiativeOf(b) - initiativeOf(a);
    if (bySpeed !== 0 && !Number.isNaN(bySpeed)) return bySpeed;

    return String(a?.id) > String(b?.id) ? 1 : -1;
  }
}
