/**
 * What is bolted to the gun (GURPS Basic Set: Campaigns p. 411).
 *
 * Four accessories, and each one changes a different number: a bipod changes
 * what the weapon takes to hold, a scope changes what aiming is worth, a laser
 * sight changes both sides of the exchange, and a silencer changes who hears
 * it. The sheet already carried a scope's bonus as a figure on a weapon mode;
 * nothing knew what to do with the other three.
 */

// ── bipods and tripods ──────────────────────────────────────────────────────

/** How the weapon is being held up. */
export type Support = "hands" | "bipod" | "tripod";

export interface SupportEffect {
  /** The minimum ST the weapon now takes, or null where it takes none. */
  minimumSt: number | null;
  /** True when the shooter counts as braced without an Aim maneuver saying so. */
  braced: boolean;
  /** True when the shooter may not move or step on a turn they fire. */
  rooted: boolean;
}

/**
 * What a bipod or a tripod does for a weapon (p. 411).
 *
 * "If a weapon has an attached bipod, a prone shooter may treat it as if it
 * were braced and reduce its ST requirement to 2/3 normal (round up)." A
 * tripod goes further: "He may ignore the weapon's ST requirement while it is
 * on its mount", at the price of standing still -- "the gunner cannot move or
 * step on any turn he fires the weapon, but he can defend normally."
 *
 * A bipod does nothing for somebody on their feet, which is the whole reason
 * to lie down behind one.
 */
export function supportEffect(options: {
  support: Support;
  minimumSt: number | null;
  /** True when the shooter is lying prone, which is what a bipod needs. */
  prone: boolean;
}): SupportEffect {
  const st = options.minimumSt;

  if (options.support === "tripod") {
    return { minimumSt: null, braced: true, rooted: true };
  }
  if (options.support === "bipod" && options.prone) {
    return {
      minimumSt: st === null ? null : Math.ceil((st * 2) / 3),
      braced: true,
      rooted: false,
    };
  }
  return { minimumSt: st, braced: false, rooted: false };
}

/** "Removing a weapon from its mount, or reattaching it, requires three Ready maneuvers." */
export const MOUNT_READY_MANEUVERS = 3;

/** "To open or close a folding bipod requires a Ready maneuver." */
export const BIPOD_READY_MANEUVERS = 1;

// ── scopes ──────────────────────────────────────────────────────────────────

/**
 * What a scope is worth for the seconds actually spent aiming (p. 411).
 *
 * "With a fixed-power scope, you must Aim for at least as many seconds as the
 * scope's bonus. With a variable-power scope, you may Aim for fewer seconds,
 * but this reduces your bonus by a like amount. Scopes are variable-power
 * unless otherwise noted."
 *
 * So a +4 scope is worth +4 after four seconds either way; the difference is
 * what happens when you have only two. A fixed scope gives nothing; a variable
 * one gives +2.
 */
export function scopeBonus(options: {
  /** The scope's full bonus. */
  bonus: number;
  secondsAimed: number;
  /** True for a fixed-power scope, which most are not. */
  fixed?: boolean;
}): number {
  const full = Math.max(0, options.bonus);
  const aimed = Math.max(0, options.secondsAimed);
  if (aimed >= full) return full;
  // A fixed scope is all or nothing; a variable one loses a point a second.
  return options.fixed ? 0 : aimed;
}

// ── laser sights ────────────────────────────────────────────────────────────

/** "If you can see your own aiming dot, you get +1 to hit." */
export const LASER_SIGHT_TO_HIT = 1;

/** "But if the target can see it, he gets +1 to Dodge!" */
export const LASER_SIGHT_TO_DODGE = 1;

export interface LaserSightEffect {
  /** Bonus to the shooter's attack roll. */
  toHit: number;
  /** Bonus to the target's Dodge. */
  targetDodge: number;
}

/**
 * What a laser sight is worth to both sides (p. 411).
 *
 * "Laser sights have a maximum range at which they are effective; beyond that
 * range, the dot is too dispersed to be visible. If no maximum range is given,
 * assume the sight's range is matched to the 1/2D range of the weapon."
 *
 * The bonus does not need an Aim maneuver: "regardless of whether you took an
 * Aim maneuver." What it needs is for the dot to be visible, which is the
 * thing the range decides -- and a dot nobody can see helps nobody and warns
 * nobody.
 */
export function laserSight(options: {
  rangeYards: number;
  /** The sight's own maximum, or null to take the weapon's 1/2D range. */
  sightRange?: number | null;
  halfDamageRange: number;
  /** True when the shooter can see their own dot on the target. */
  shooterSeesDot?: boolean;
  /** True when the target has noticed it. */
  targetSeesDot?: boolean;
}): LaserSightEffect {
  const reach = options.sightRange ?? options.halfDamageRange;
  if (reach > 0 && options.rangeYards > reach) return { toHit: 0, targetDodge: 0 };
  return {
    toHit: options.shooterSeesDot === false ? 0 : LASER_SIGHT_TO_HIT,
    targetDodge: options.targetSeesDot ? LASER_SIGHT_TO_DODGE : 0,
  };
}

// ── silencers ───────────────────────────────────────────────────────────────

/** "Someone several rooms away indoors... gets a Hearing+5 roll to hear an unsilenced shot." */
export const HEARING_A_SHOT = 5;

/** "A typical silencer gives an extra -4, while the best commercial silencers might give -6." */
export type Silencer = "none" | "typical" | "best";

export function silencerModifier(silencer: Silencer): number {
  return silencer === "best" ? -6 : silencer === "typical" ? -4 : 0;
}

/**
 * The roll to hear a shot from somewhere else (p. 411).
 *
 * "This roll may be at up to +4 for a high-powered weapon or quiet
 * environment, or down to -4 for a low-powered gun or noisy environment."
 */
export function hearingTarget(options: {
  hearing: number;
  silencer: Silencer;
  /** The GM's figure for how loud the gun and the room are, +4 to -4. */
  loudness?: number;
}): number {
  return options.hearing + HEARING_A_SHOT + silencerModifier(options.silencer) + (options.loudness ?? 0);
}

/**
 * What somebody close enough to be shot at hears (p. 411).
 *
 * "Anyone who is in front of your weapon and exposed and close enough for you
 * to attack with it automatically hears the shot - even with a silencer.
 * However, the silencer makes the sound difficult to localize: the listener
 * must make an IQ roll (not a Hearing roll) to deduce your location unless
 * you're in plain sight."
 */
export function heardUpClose(options: {
  silencer: Silencer;
  /** True when the shooter is in plain sight, which settles it either way. */
  inPlainSight: boolean;
}): { hears: true; locates: boolean; rollsAgainst: "sight" | "iq" } {
  if (options.inPlainSight || options.silencer === "none") {
    return { hears: true, locates: true, rollsAgainst: "sight" };
  }
  return { hears: true, locates: false, rollsAgainst: "iq" };
}
