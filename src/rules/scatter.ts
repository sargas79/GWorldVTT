/**
 * Where a thrown grenade actually landed (GURPS Basic Set: Campaigns p. 414).
 *
 * An ordinary miss with an ordinary weapon is over with: nothing happens. A
 * miss with something that goes off is a different question -- it went
 * somewhere, and what is standing there matters. So an area attack needs two
 * more numbers than a normal one: how far off it was, and which way.
 */

/** The six directions of a hex map, as one die (p. 414). */
export const DIRECTIONS = 6;

/**
 * The bonus for lobbing something at the ground rather than at somebody (p. 414).
 *
 * "You can deliberately attack an area of ground with an area-effect or
 * explosive attack... Roll to hit at +4. There's no defense roll."
 */
export const AREA_ATTACK_BONUS = 4;

/** Where a missed area attack came down. */
export interface Scatter {
  /** Yards from the intended point of impact. */
  yards: number;
  /**
   * Direction as a clock face of six: 1 is the direction the attacker faces,
   * and each step is 60 degrees clockwise from there.
   */
  direction: number;
}

/**
 * How far a missed area attack scattered (p. 414).
 *
 * "You missed your target by a number of yards equal to your margin of failure,
 * to a maximum of half the distance to the target (round up). If the enemy
 * dodges, use his margin of success to determine distance instead."
 *
 * The exception squares the margin: "if your target was flying or underwater,
 * or you're using the Artillery or Dropping skill to fire upon or bomb a target
 * you can't see, you miss by yards equal to the square of your margin of
 * failure. This does not apply to a dodge."
 */
export function scatterDistance(options: {
  /** By how much the attack roll failed, or the defender's margin if dodged. */
  margin: number;
  /** Yards to the intended target, which caps an ordinary miss. */
  distanceYards: number;
  /** True when the margin is the defender's rather than the attacker's. */
  dodged?: boolean;
  /** Flying, underwater, or fired blind with Artillery or Dropping. */
  unseen?: boolean;
  /** The die rolled for direction, 1 being the way the attacker faces. */
  directionRoll: number;
}): Scatter {
  const margin = Math.max(0, Math.floor(options.margin));

  // The cap and the squaring are exclusive: the exception's own words are "this
  // does not apply to a dodge", and it replaces the cap rather than joining it.
  const yards =
    options.unseen && !options.dodged
      ? margin * margin
      : Math.min(margin, Math.ceil(Math.max(0, options.distanceYards) / 2));

  return {
    yards,
    direction: ((Math.round(options.directionRoll) - 1 + DIRECTIONS) % DIRECTIONS) + 1,
  };
}

/**
 * The compass bearing of a scatter, in degrees clockwise from the attacker's
 * facing (p. 414).
 *
 * "Take the direction you are facing as a roll of 1, 60 degrees clockwise (the
 * next facing, on a hex map) as a roll of 2, and so on."
 */
export function scatterBearing(direction: number): number {
  return (((Math.round(direction) - 1) % DIRECTIONS) + DIRECTIONS) % DIRECTIONS * 60;
}

/**
 * How far fragments reach (p. 414).
 *
 * "Everyone within (5 x dice of fragmentation damage) yards is vulnerable."
 */
export function fragmentationRadius(fragmentationDice: number): number {
  return 5 * Math.max(0, fragmentationDice);
}

/** The skill fragments attack bystanders at (p. 414). */
export const FRAGMENT_SKILL = 15;

/**
 * How many fragments hit somebody (p. 414).
 *
 * "For every three points by which the attack roll succeeds, one additional
 * fragment strikes the target" -- so one for the hit itself and another per
 * three of margin.
 */
export function fragmentHits(margin: number): number {
  if (margin < 0) return 0;
  return 1 + Math.floor(margin / 3);
}

/**
 * Which modifiers the fragment attack takes (p. 414).
 *
 * "Only three modifiers apply: the range modifier for the distance from the
 * center of the blast to the target, the modifier for the target's posture, and
 * the target's Size Modifier." Against an airburst the posture one is dropped:
 * "lying prone under an airburst does not decrease the body area exposed."
 */
export function fragmentTarget(options: {
  rangeModifier: number;
  postureModifier: number;
  sizeModifier: number;
  airburst?: boolean;
}): number {
  const posture = options.airburst ? 0 : options.postureModifier;
  return FRAGMENT_SKILL + options.rangeModifier + posture + options.sizeModifier;
}
