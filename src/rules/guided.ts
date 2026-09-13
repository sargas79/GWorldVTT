/**
 * Weapons that steer, and attacks that cover ground (GURPS Basic Set:
 * Campaigns pp. 412-413).
 *
 * Two kinds of missile and two kinds of spread. What they have in common is
 * that the ordinary ranged rules stop describing them: a homing missile does
 * not care how far away the target is or whether the firer is bleeding, and an
 * area attack cannot be dodged at all.
 */

// ── guided and homing weapons (p. 412) ──────────────────────────────────────

/** How a projectile finds its way. */
export type Guidance =
  /** "A projectile that can receive steering commands in flight." */
  | "guided"
  /** "A projectile that steers itself to the target." */
  | "homing"
  /** Neither: an ordinary shell or bullet. */
  | "none";

/** Which of the ordinary ranged modifiers still apply. */
export interface GuidanceModifiers {
  /** True when range modifiers are read as usual. */
  range: boolean;
  /** True when the firer's own injury, movement and posture still count. */
  firersCondition: boolean;
  /** True when visibility is judged by the firer's senses rather than the seeker's. */
  firersSenses: boolean;
  /** True when size and speed modifiers apply, which they always do. */
  sizeAndSpeed: boolean;
}

/**
 * Which modifiers a steered weapon still takes (p. 412).
 *
 * Guided: "Treat a guided weapon as any other firearm when assessing
 * modifiers, but ignore range modifiers!"
 *
 * Homing: "Homing missiles ignore range modifiers and all modifiers for your
 * injury, movement, posture, etc.! Base visibility modifiers on the
 * projectile's homing sense, not on your senses... All other ranged combat
 * modifiers (for size, speed, etc.) apply normally."
 *
 * The difference is the whole point of the two: a guided weapon is still being
 * flown by somebody, so their state matters; a homing one is not.
 */
export function guidanceModifiers(guidance: Guidance): GuidanceModifiers {
  if (guidance === "homing") {
    return { range: false, firersCondition: false, firersSenses: false, sizeAndSpeed: true };
  }
  if (guidance === "guided") {
    return { range: false, firersCondition: true, firersSenses: true, sizeAndSpeed: true };
  }
  return { range: true, firersCondition: true, firersSenses: true, sizeAndSpeed: true };
}

/**
 * How fast a steered projectile travels, in yards a second (p. 412).
 *
 * "If a guided or homing attack has a 1/2D statistic, do not halve damage.
 * Instead, read this as the attack's speed in yards/second."
 */
export function projectileSpeed(halfDamageRange: number): number {
  return Math.max(0, halfDamageRange);
}

/** Whether a steered weapon halves its damage past 1/2D, which it does not. */
export function halvesDamage(guidance: Guidance): boolean {
  return guidance === "none";
}

export interface FlightPlan {
  /** True when it can reach the target on the turn it is fired. */
  hitsThisTurn: boolean;
  /** Seconds until it arrives, counting the turn of firing. */
  seconds: number;
  /** True when it runs out of reach before arriving and crashes. */
  falls: boolean;
}

/**
 * How long a steered projectile takes to arrive (p. 412).
 *
 * "The projectile can hit a target at up to its 1/2D range on the turn you
 * launch it. It requires multiple turns to reach a more distant target... The
 * projectile continues to close at a speed equal to its 1/2D until it has
 * traveled a total distance equal to its Max (that is, for Max/speed seconds,
 * including the turn of firing). If it still has not hit, it will crash."
 *
 * Which is why "it's possible to 'outrun' a guided or homing attack . . . if
 * you're fast enough!"
 */
export function flightPlan(options: {
  rangeYards: number;
  speed: number;
  maxRange: number;
}): FlightPlan {
  const speed = Math.max(0, options.speed);
  if (speed <= 0) return { hitsThisTurn: false, seconds: 0, falls: true };

  const seconds = Math.ceil(options.rangeYards / speed);
  const reach = Math.floor(options.maxRange / speed);
  return {
    hitsThisTurn: options.rangeYards <= speed,
    seconds: Math.max(1, seconds),
    falls: options.rangeYards > options.maxRange || seconds > Math.max(1, reach),
  };
}

/** What the firer has to do while a steered weapon is in the air (p. 412). */
export interface SteeringDuty {
  /** True where a Concentrate maneuver is needed every turn. */
  concentrates: boolean;
  /** True where losing sight of the target means an automatic miss. */
  needsSight: boolean;
  /** True where an Attack maneuver is needed on the turn it arrives. */
  attacksOnArrival: boolean;
}

/**
 * Who is flying it, and what that costs them (p. 412).
 *
 * "Guided Weapons: Take a Concentrate maneuver each turn to steer the weapon.
 * Should you lose sight of the target while the attack is en route, your
 * attack misses automatically! You must make an Attack or All-Out Attack
 * (Determined) on the turn the projectile reaches the target."
 *
 * A homing weapon asks none of it: "the firer does not need to do anything
 * once the weapon is launched."
 */
export function steeringDuty(guidance: Guidance): SteeringDuty {
  if (guidance === "guided") {
    return { concentrates: true, needsSight: true, attacksOnArrival: true };
  }
  return { concentrates: false, needsSight: false, attacksOnArrival: false };
}

/**
 * Whether a steered attack is aimed without an Aim maneuver (p. 412).
 *
 * "If you Aim a guided weapon before you Attack, you receive its Acc bonus -
 * but you don't have to aim. If the projectile takes multiple seconds to reach
 * its target, the attack is automatically aimed and gets its Acc bonus."
 */
export function accuracyApplies(options: {
  guidance: Guidance;
  aimed: boolean;
  secondsInFlight: number;
}): boolean {
  if (options.guidance === "none") return options.aimed;
  return options.aimed || options.secondsInFlight > 1;
}

// ── area and cone attacks (p. 413) ──────────────────────────────────────────

/**
 * Whether an active defense is any use against this (p. 413).
 *
 * "Active defenses don't protect against an area attack, but victims may dive
 * for cover or retreat out of the area."
 */
export function defendsAgainstArea(): boolean {
  return false;
}

/**
 * Whether damage falls off with distance from the centre (p. 413).
 *
 * "Damage does not usually decline with distance" -- which is what tells an
 * area attack apart from an explosion, where it very much does (p. 414).
 */
export function areaDamageFallsOff(): boolean {
  return false;
}

/**
 * How wide a cone is at a given range (p. 413).
 *
 * "A cone is one yard wide at its origin, but increases in width at a 'rate of
 * spread' equal to its specified maximum width divided by its specified
 * maximum range. For instance, a cone with a maximum range of 100 yards and a
 * maximum width of 5 yards would spread by one yard per 20 yards of range; out
 * at 60 yards, it would be three yards wide. If maximum width is unspecified,
 * assume the cone spreads by one yard per yard of range."
 *
 * Note where the book's own example lands: at 60 yards a cone spreading one
 * yard per 20 is three yards wide, not four. The yard it starts at is not
 * added on top.
 */
export function coneWidth(options: {
  rangeYards: number;
  maxRange: number;
  /** The cone's widest, or null where the table does not say. */
  maxWidth?: number | null;
}): number {
  const range = Math.max(0, options.rangeYards);
  const width = options.maxWidth ?? null;

  // "If maximum width is unspecified, assume the cone spreads by one yard per
  // yard of range."
  if (width === null || options.maxRange <= 0) return Math.max(1, range);

  const perYard = width / options.maxRange;
  return Math.max(1, Math.floor(range * perYard));
}

/** Whether a cone attack that missed may still catch its target (p. 413). */
export function coneMayStillCatch(): boolean {
  // "A cone attack requires a roll to hit . . . but it might still catch the
  // target in the area of effect on a miss!"
  return true;
}
