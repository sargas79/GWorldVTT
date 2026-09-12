/**
 * Shotguns and multiple projectiles (GURPS Basic Set: Campaigns p. 409).
 *
 * A shotgun's Rate of Fire is written "3x9": three shots a turn, each of them
 * nine pellets. "Treat this as an attack with RoF equal to shots times
 * projectiles" for the rapid-fire bonus and for counting hits, and treat Rcl
 * as 1, since the pellets of one shell spread rather than kick.
 *
 * Up close they have not spread yet: "at ranges up to 10% of 1/2D, the
 * projectiles strike as a single mass. Roll damage once and multiply it by
 * half the number of projectiles (round up); the target's DR is multiplied by
 * the same amount."
 */

/** What "3x9" means. */
export interface RateOfFire {
  shots: number;
  projectiles: number;
}

/**
 * Reads a Rate of Fire as the table prints it: "3", "3x9", or "2×9".
 *
 * Anything unreadable is one shot of one projectile, which is what every
 * weapon that is not a shotgun has.
 */
export function parseRateOfFire(text: string | number | null | undefined): RateOfFire {
  const raw = String(text ?? "").trim().toLowerCase().replace("×", "x");
  const m = /^(\d+)(?:x(\d+))?/.exec(raw);
  if (!m) return { shots: 1, projectiles: 1 };
  return {
    shots: Math.max(1, Number(m[1])),
    projectiles: Math.max(1, Number(m[2] ?? 1)),
  };
}

/** The fraction of 1/2D range inside which the pellets have not spread. */
export const CONE_RANGE_FRACTION = 0.1;

/** What a burst of pellets does to the arithmetic of the attack. */
export interface MultipleProjectiles {
  /** Shots, for the rapid-fire bonus and the count of hits. */
  effectiveShots: number;
  /** Recoil to count hits with: always 1 for a spread of pellets. */
  recoil: number;
  /**
   * Set when the target is close enough that the pellets strike as one: the
   * figure both damage and the target's DR are multiplied by.
   */
  coneMultiplier: number | null;
}

/**
 * How a shot of several projectiles is resolved.
 *
 * A weapon firing one projectile a shot is left exactly as it was: its shots,
 * its own recoil, and no cone.
 */
export function multipleProjectiles(options: {
  shotsFired: number;
  projectiles: number;
  recoil: number;
  rangeYards: number;
  halfDamageRange: number;
}): MultipleProjectiles {
  const shots = Math.max(1, Math.floor(options.shotsFired));
  const projectiles = Math.max(1, Math.floor(options.projectiles));
  if (projectiles === 1) {
    return { effectiveShots: shots, recoil: options.recoil, coneMultiplier: null };
  }

  const close =
    options.halfDamageRange > 0 &&
    options.rangeYards <= options.halfDamageRange * CONE_RANGE_FRACTION;

  return {
    effectiveShots: shots * projectiles,
    recoil: 1,
    coneMultiplier: close ? Math.ceil(projectiles / 2) : null,
  };
}
