/**
 * Aiming at something in particular (GURPS Basic Set: Campaigns pp. 398-400).
 *
 * Hit locations have been half-built for a long time: every location's to-hit
 * penalty is in the rules engine and printed on the sheet, the wounding
 * modifiers and crippling thresholds are applied when damage lands, and the
 * damage card asks where the blow hit. What was missing is the part where you
 * decide *before* the roll -- the penalty for going for the skull, and the fact
 * that having gone for it, that is where the damage lands.
 *
 * A called shot is chosen at the attack and collected at the damage roll, the
 * same way a Feint and a Mighty Blows are, because the two are separate clicks
 * and the decision belongs to the first of them.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  HIT_LOCATIONS,
  HIT_LOCATION_ORDER,
  canTarget,
  type HitLocation,
} from "../rules/hit-locations.js";
import { canTargetChinks, chinkPenalty } from "../rules/melee-situations.js";
import type { DamageType } from "../rules/types.js";

/** Where a declared called shot waits for its damage roll. */
export const CALLED_SHOT_FLAG = "calledShot";

/** A shot aimed somewhere in particular. */
export interface CalledShot {
  hitLocation: HitLocation;
  /** True when it was aimed at a gap in the armour rather than at the armour. */
  chink: boolean;
}

/** One option the attack dialog offers. */
export interface ShotOption {
  value: string;
  label: string;
  /** The to-hit penalty for choosing it. */
  penalty: number;
}

/** The value the dialog uses for "wherever it lands". */
export const UNAIMED = "torso";

/**
 * The locations this attack could be aimed at, with what each costs.
 *
 * Locations a given attack cannot target are left out rather than offered and
 * refused: you cannot put a swung axe through somebody's eye, and a list that
 * says so by omission is shorter than one that says so by erroring.
 */
export function shotOptions(type: DamageType, tightBeam = false): ShotOption[] {
  const options: ShotOption[] = [];

  for (const location of HIT_LOCATION_ORDER) {
    if (!canTarget(location, type, {})) continue;

    const info = HIT_LOCATIONS[location];
    options.push({
      value: location,
      label: game.i18n.localize(`GWORLD.HitLocation.${location}`),
      penalty: info.toHit,
    });
  }

  // "You may use a piercing, impaling, or tight-beam burning attack to target
  // joints or weak points" -- worth its own two entries, because the penalty
  // replaces the location's own rather than adding to it.
  if (canTargetChinks(type, tightBeam)) {
    options.push({
      value: "chink:torso",
      label: game.i18n.localize("GWORLD.CalledShot.ChinkTorso"),
      penalty: chinkPenalty("torso"),
    });
    options.push({
      value: "chink:other",
      label: game.i18n.localize("GWORLD.CalledShot.ChinkOther"),
      penalty: chinkPenalty("skull"),
    });
  }

  return options;
}

/** Reads a dialog value back into a called shot, or null for an unaimed blow. */
export function parseShot(value: string): CalledShot | null {
  if (!value || value === UNAIMED) return null;

  if (value.startsWith("chink:")) {
    const where = value.slice("chink:".length);
    return { hitLocation: where === "torso" ? "torso" : "skull", chink: true };
  }

  return { hitLocation: value as HitLocation, chink: false };
}

/** Remembers a called shot for the damage roll that follows it. */
export async function recordCalledShot(actor: any, shot: CalledShot | null): Promise<void> {
  if (!actor?.isOwner) return;

  if (shot === null) {
    if (actor.getFlag?.(SYSTEM_ID, CALLED_SHOT_FLAG)) {
      await actor.unsetFlag(SYSTEM_ID, CALLED_SHOT_FLAG);
    }
    return;
  }

  await actor.setFlag(SYSTEM_ID, CALLED_SHOT_FLAG, shot);
}

/**
 * Collects the called shot the next damage roll belongs to.
 *
 * Spent whichever way it goes: a shot aimed at the eye and then rolled for
 * damage was that shot, and the next one starts again from nothing.
 */
export async function consumeCalledShot(actor: any): Promise<CalledShot | null> {
  const shot = actor?.getFlag?.(SYSTEM_ID, CALLED_SHOT_FLAG) as CalledShot | undefined;
  if (!shot?.hitLocation) return null;

  if (actor.isOwner) await actor.unsetFlag(SYSTEM_ID, CALLED_SHOT_FLAG);
  return shot;
}
