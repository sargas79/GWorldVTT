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

/** A damage line: dice, type and armour divisor. */
export interface ProjectileLine {
  damage: string;
  damageType: string;
  armorDivisor: number;
}

/**
 * The line a hit from a multiple-projectile shot is rolled with (since API
 * 1.73.0).
 *
 * The Basic Set's pellets are all alike, and every hit uses the weapon's one
 * line. A load whose first projectile differs from the rest -- one heavy ball
 * ahead of the shot, say -- gives that one its own line, used for the first
 * hit of the shot and never again; anything it leaves blank is the weapon's.
 */
export function projectileLine(options: {
  line: ProjectileLine;
  firstHit: Partial<ProjectileLine> | null | undefined;
  first: boolean;
}): ProjectileLine & { firstHit: boolean } {
  const own = options.firstHit;
  if (!options.first || !own || typeof own.damage !== "string" || !own.damage.trim()) {
    return { ...options.line, firstHit: false };
  }
  const divisor = Number(own.armorDivisor);
  return {
    damage: own.damage.trim(),
    damageType: typeof own.damageType === "string" && own.damageType ? own.damageType : options.line.damageType,
    armorDivisor: divisor > 0 ? divisor : options.line.armorDivisor,
    firstHit: true,
  };
}
