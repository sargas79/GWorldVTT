/**
 * Large-Area Injury (GURPS Basic Set: Campaigns p. 400).
 *
 * Some blows land on most of a body at once: a dragon's breath, a huge fire, a
 * bath in acid, anything "area effect" or "cone", and any explosion outside
 * the victim. Armour still protects -- but a suit that leaves a gap is only as
 * good as the average of the torso and the gap.
 */

import type { HitLocation } from "./hit-locations.js";

/**
 * The locations a large-area blow can find exposed, where nothing narrower is
 * said: a true area effect exposes everything. The vitals lie under the torso
 * and are not a surface of their own.
 */
export const LARGE_AREA_LOCATIONS: readonly HitLocation[] = [
  "torso", "skull", "face", "eye", "neck", "groin", "arm", "hand", "leg", "foot",
];

/** What a large-area blow meets. */
export interface LargeAreaDr {
  /** The DR it meets: torso and least-protected averaged, rounding up. */
  dr: number;
  /** The exposed location with the lowest DR against this attack (the torso if nothing is lower). */
  leastProtected: HitLocation;
}

/**
 * The effective DR against a large-area injury (p. 400): the torso's DR and
 * the lowest DR among the exposed locations -- which may be the torso's own --
 * averaged, rounding up. Each location's DR is the one against the attack's
 * own damage type, which is the caller's to read.
 */
export function largeAreaDr(options: {
  torsoDr: number;
  /** Each exposed location's DR against this attack. The torso's own may be among them. */
  exposed: ReadonlyArray<{ location: HitLocation; dr: number }>;
}): LargeAreaDr {
  const torso = Math.max(0, Number(options.torsoDr) || 0);
  let least: { location: HitLocation; dr: number } = { location: "torso", dr: torso };
  for (const entry of options.exposed) {
    const dr = Math.max(0, Number(entry.dr) || 0);
    if (dr < least.dr) least = { location: entry.location, dr };
  }
  return { dr: Math.ceil((torso + least.dr) / 2), leastProtected: least.location };
}

/**
 * Where a large-area blow lands for the pipeline (p. 400): it is treated as a
 * torso hit unless a single location is exposed, in which case it is a hit
 * there -- and a lone limb loses what exceeds a major wound, as any blow to it
 * does. Returns that one location, or null for the averaged torso hit.
 */
export function largeAreaSingleLocation(exposed: ReadonlyArray<HitLocation> | null | undefined): HitLocation | null {
  const unique = [...new Set(exposed ?? [])];
  return unique.length === 1 ? unique[0]! : null;
}
