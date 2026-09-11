/**
 * What a body can do: climbing, jumping, lifting, running, swimming and
 * throwing (GURPS Basic Set: Campaigns pp. 349-355).
 *
 * All of it falls out of three numbers already on the sheet -- ST, Basic Lift
 * and Basic Move -- which is why it is worth computing rather than looking up:
 * a player who wants to know whether they can clear the pit should be able to
 * read it, not work it out.
 *
 * The book opens each of these with a version of "don't stop the game for
 * this". These functions are for the moment when the GM does need the number.
 */

import type { DiceAdds } from "./types.js";

// ── jumping (p. 352) ────────────────────────────────────────────────────────

export interface JumpInput {
  /** Basic Move, or half the Jumping skill where that is better. */
  move: number;
  /** Yards run at the jump, which are added to Move for a running jump. */
  runningStartYards?: number;
  /**
   * False for a jump taken without the two Concentrate maneuvers the distances
   * assume, which halves them.
   */
  prepared?: boolean;
}

/**
 * A high jump, in inches: "(6 x Basic Move) - 10 inches".
 *
 * A running start adds the yards run to Basic Move before the arithmetic, and
 * cannot take the jump past twice its standing height.
 */
export function highJumpInches(input: JumpInput): number {
  return jumpDistance(input, (move) => 6 * move - 10);
}

/**
 * A broad jump, in feet: "(2 x Basic Move) - 3 feet".
 *
 * Same running-start rule, and the same ceiling of twice the standing distance.
 */
export function broadJumpFeet(input: JumpInput): number {
  return jumpDistance(input, (move) => 2 * move - 3);
}

function jumpDistance(input: JumpInput, formula: (move: number) => number): number {
  const move = Math.max(0, input.move);
  const run = Math.max(0, input.runningStartYards ?? 0);

  const standing = Math.max(0, formula(move));
  // "Maximum running high-jump height is twice standing high-jump height."
  const running = run > 0 ? Math.min(Math.max(0, formula(move + run)), standing * 2) : standing;

  // "Halve all distances if you jump without such preparation."
  return input.prepared === false ? running / 2 : running;
}

/**
 * Move for jumping purposes when the jumper has the Jumping skill: "you may
 * substitute half your skill level, rounded down, for Basic Move".
 *
 * The skill only helps someone it would actually help, so the better of the two
 * is what is used.
 */
export function jumpingMove(basicMove: number, jumpingSkill: number | null): number {
  if (jumpingSkill === null) return basicMove;
  return Math.max(basicMove, Math.floor(jumpingSkill / 2));
}

// ── lifting and moving things (p. 353) ──────────────────────────────────────

/** What each kind of lift is worth, as a multiple of Basic Lift. */
export const LIFT_MULTIPLES = {
  oneHanded: 2,
  twoHanded: 8,
  shove: 12,
  /** A shove with a running start is worth double. */
  runningShove: 24,
  carryOnBack: 15,
  shiftSlightly: 50,
} as const;

export type LiftKind = keyof typeof LIFT_MULTIPLES;

/** The weight one kind of lift can manage, in pounds. */
export function liftCapacity(basicLift: number, kind: LiftKind): number {
  return Math.max(0, basicLift) * LIFT_MULTIPLES[kind];
}

/** Every lift a given Basic Lift allows, for showing them together. */
export function liftCapacities(basicLift: number): Record<LiftKind, number> {
  const out = {} as Record<LiftKind, number>;
  for (const kind of Object.keys(LIFT_MULTIPLES) as LiftKind[]) {
    out[kind] = liftCapacity(basicLift, kind);
  }
  return out;
}

/**
 * Basic Lift after a successful Lifting roll (p. 353).
 *
 * "increases your Basic Lift by 5% times your margin of success for the purpose
 * of picking up heavy objects... Roll once per lift."
 */
export function liftingSkillCapacity(basicLift: number, margin: number): number {
  const gained = 1 + 0.05 * Math.max(0, margin);
  return Math.max(0, basicLift) * gained;
}

/**
 * The most that can be dragged behind you at all: "final effective weight
 * pulled, after all modifiers, cannot exceed 15xBL".
 */
export function maximumDrag(basicLift: number): number {
  return liftCapacity(basicLift, "carryOnBack");
}

// ── running (p. 354) ────────────────────────────────────────────────────────

/**
 * Sprinting Move, after the first second (p. 354).
 *
 * "Add 20% to your Move after one second... On a battle map... drop all
 * fractions... Assume that even the slowest sprinter gets +1 Move."
 */
export function sprintMove(move: number): number {
  const base = Math.max(0, move);
  return Math.max(base + 1, Math.floor(base * 1.2));
}

/**
 * Paced running, "exactly half the sprinting speed" -- and not rounded, because
 * it is a distance over minutes rather than hexes in a second.
 */
export function pacedMove(move: number): number {
  return (Math.max(0, move) * 1.2) / 2;
}

/** Seconds of sprinting, or minutes of paced running, between fatigue rolls. */
export const SPRINT_FATIGUE_SECONDS = 15;
export const PACED_FATIGUE_MINUTES = 1;

// ── swimming (p. 354) ───────────────────────────────────────────────────────

/**
 * Move in water (p. 354).
 *
 * "Land-dwellers such as humans have water Move equal to Basic Move/5 (round
 * down)... Minimum water Move for such characters is 1 yard/second." Anything
 * amphibious or aquatic swims at its full Basic Move.
 */
export function waterMove(basicMove: number, aquatic = false): number {
  if (aquatic) return Math.max(0, basicMove);
  return Math.max(1, Math.floor(Math.max(0, basicMove) / 5));
}

/** How heavy a swimmer is built, which oddly helps them float. */
export type SwimBuild = "normal" | "overweight" | "fat" | "veryFat";

const SWIM_BUILD_BONUS: Record<SwimBuild, number> = {
  normal: 0,
  overweight: 1,
  fat: 3,
  veryFat: 5,
};

/**
 * The modifier to a Swimming roll (p. 354).
 *
 * "+3 if you entered the water intentionally; a penalty equal to twice your
 * encumbrance level; +1 if you are Overweight, +3 if Fat, or +5 if Very Fat."
 */
export function swimmingModifier(options: {
  intentional?: boolean;
  /** 0 for None through 4 for Extra-Heavy. */
  encumbranceLevel?: number;
  build?: SwimBuild;
}): number {
  return (
    (options.intentional ? 3 : 0)
    - 2 * Math.max(0, options.encumbranceLevel ?? 0)
    + SWIM_BUILD_BONUS[options.build ?? "normal"]
  );
}

// ── climbing (p. 349) ───────────────────────────────────────────────────────

/** One row of the climbing table: what it costs, and how fast it goes. */
export interface Climb {
  key: string;
  /** Modifier to the Climbing roll, or null where no roll is needed. */
  modifier: number | null;
  /** How fast it goes when climbed in a hurry, and at leisure. */
  combat: string;
  regular: string;
}

/**
 * The climbing table (p. 349).
 *
 * The speeds are the book's own units -- rungs, feet per second, feet per
 * minute -- rather than being normalised, because a ladder is climbed in rungs
 * and a mountain is not.
 */
export const CLIMBS: readonly Climb[] = [
  { key: "ladderUp", modifier: null, combat: "3 rungs/s", regular: "1 rung/s" },
  { key: "ladderDown", modifier: null, combat: "2 rungs/s", regular: "1 rung/s" },
  { key: "tree", modifier: 5, combat: "1 ft/s", regular: "1 ft/3s" },
  { key: "mountain", modifier: 0, combat: "1 ft/2s", regular: "10 ft/min" },
  { key: "stoneWall", modifier: -3, combat: "1 ft/5s", regular: "4 ft/min" },
  { key: "modernBuilding", modifier: -3, combat: "1 ft/10s", regular: "2 ft/min" },
  { key: "ropeUp", modifier: -2, combat: "1 ft/s", regular: "20 ft/min" },
  { key: "ropeDown", modifier: -1, combat: "2 ft/s", regular: "30 ft/min" },
  { key: "ropeDownRigged", modifier: -1, combat: "12 ft/s", regular: "12 ft/s" },
];

/** One climb by name, or null for a kind of climb nobody listed. */
export function climb(key: string): Climb | null {
  return CLIMBS.find((row) => row.key === key) ?? null;
}

/**
 * The modifier to a Climbing roll: the climb's own, less encumbrance.
 *
 * "In all cases, subtract your encumbrance level from your roll as well.
 * Climbing while heavily laden is a dangerous matter!"
 */
export function climbingModifier(climbKey: string, encumbranceLevel = 0): number {
  return (climb(climbKey)?.modifier ?? 0) - Math.max(0, encumbranceLevel);
}

/** Minutes between Climbing rolls: one to start, then one every five minutes. */
export const CLIMB_ROLL_MINUTES = 5;

// ── throwing (p. 355) ───────────────────────────────────────────────────────

/**
 * The throwing table (p. 355), as [weight ratio, distance modifier].
 *
 * The ratio is the object's weight over the thrower's Basic Lift, and "if it
 * falls between two values, use the higher value" -- so a heavier throw is
 * always priced at the harder row.
 */
const THROW_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0.05, 3.5], [0.10, 2.5], [0.15, 2.0], [0.20, 1.5], [0.25, 1.2], [0.30, 1.1],
  [0.40, 1.0], [0.50, 0.8], [0.75, 0.7], [1.00, 0.6], [1.50, 0.4], [2.0, 0.30],
  [2.5, 0.25], [3.0, 0.20], [4.0, 0.15], [5.0, 0.12], [6.0, 0.10], [7.0, 0.09],
  [8.0, 0.08], [9.0, 0.07], [10.0, 0.06], [12.0, 0.05],
];

/** The heaviest thing that can be thrown at all, as a multiple of Basic Lift. */
export const MAX_THROWABLE_MULTIPLE = LIFT_MULTIPLES.twoHanded;

/**
 * The distance modifier for a weight ratio, or null when it is off the table.
 *
 * Below the lightest row the lightest modifier applies: a pebble does not fly
 * further than a stone for being lighter still.
 */
export function throwDistanceModifier(weightRatio: number): number | null {
  const ratio = Math.max(0, weightRatio);
  const row = THROW_TABLE.find(([listed]) => ratio <= listed);
  return row ? row[1] : null;
}

/**
 * How far an object can be thrown, in yards (p. 355).
 *
 * "Multiply your ST by the distance modifier to find the distance in yards you
 * can throw the object." Returns null for something too heavy to throw at all,
 * which is anything over 8xBL -- the two-handed lift.
 */
export function throwingDistance(options: {
  strength: number;
  basicLift: number;
  weight: number;
}): number | null {
  const { strength, basicLift, weight } = options;
  if (basicLift <= 0 || weight < 0) return null;
  if (weight > basicLift * MAX_THROWABLE_MULTIPLE) return null;

  const modifier = throwDistanceModifier(weight / basicLift);
  if (modifier === null) return null;

  return Math.max(0, strength) * modifier;
}

/**
 * The per-die modifier to thrust damage for a thrown object's weight (p. 355).
 *
 * The progression is not monotonic, and that is the book's: an object up to BL
 * does thrust +1 per die, and one up to 2xBL does plain thrust. Heavier things
 * hit harder until they are too unwieldy to throw properly.
 */
export function thrownDamagePerDie(weight: number, basicLift: number): number | null {
  if (basicLift <= 0) return null;
  const ratio = weight / basicLift;

  if (ratio <= 1 / 8) return -2;
  if (ratio <= 1 / 4) return -1;
  if (ratio <= 1 / 2) return 0;
  if (ratio <= 1) return 1;
  if (ratio <= 2) return 0;
  if (ratio <= 4) return -0.5;
  if (ratio <= MAX_THROWABLE_MULTIPLE) return -1;
  return null;
}

/**
 * Thrust damage adjusted for the weight of what was thrown.
 *
 * The per-die modifier multiplies the dice and is applied to the adds, with the
 * half-die case rounded down as the table says.
 */
export function thrownDamage(
  thrust: DiceAdds,
  weight: number,
  basicLift: number,
): DiceAdds | null {
  const perDie = thrownDamagePerDie(weight, basicLift);
  if (perDie === null) return null;

  return { dice: thrust.dice, adds: thrust.adds + Math.floor(perDie * thrust.dice) };
}
