/**
 * Terrain, illumination, vision, frostbite and the horizon (GURPS Basic Set
 * Revised, Addendum 4, pp. 573-575).
 *
 * Figures only: the terrain table for foraging, Tracking and daily travel,
 * the named illumination levels with their flicker, adaptation and
 * point-source falloff, "in plain sight", Vision rolls in combat, frostbite
 * and the Horizon Table.
 */

// -- terrain types redux (p. 573) --------------------------------------------

export type TerrainType = "arctic" | "desert" | "island" | "jungle" | "mountain" | "plains" | "swampland" | "woodlands";

/** A dice modifier, `dice`d plus `add`: 1d-7 is `{ dice: 1, add: -7 }`. */
export interface DiceModifier {
  dice: number;
  add: number;
}

export interface TerrainInfo {
  foraging: DiceModifier;
  /** The average foraging modifier the table lists. */
  foragingAverage: number;
  /** Tracking modifier; `windy` is the value with lots of wind (or lapping water), where the footnote gives one. */
  tracking: number;
  trackingLoose?: number;
  /** Daily travel multipliers: the extremes and the average. */
  travelMin: number;
  travelMax: number;
  travelAverage: number;
}

export const TERRAIN_TYPES: Readonly<Record<TerrainType, TerrainInfo>> = {
  arctic: { foraging: { dice: 1, add: -7 }, foragingAverage: -4, tracking: -2, trackingLoose: 0, travelMin: 0.2, travelMax: 1, travelAverage: 0.5 },
  desert: { foraging: { dice: 1, add: -7 }, foragingAverage: -4, tracking: -2, trackingLoose: 0, travelMin: 0.2, travelMax: 1.25, travelAverage: 0.5 },
  island: { foraging: { dice: 2, add: -7 }, foragingAverage: 0, tracking: -2, trackingLoose: 0, travelMin: 0.2, travelMax: 1.25, travelAverage: 0.5 },
  jungle: { foraging: { dice: 2, add: -7 }, foragingAverage: 0, tracking: 0, travelMin: 0.2, travelMax: 0.2, travelAverage: 0.2 },
  mountain: { foraging: { dice: 1, add: -7 }, foragingAverage: -4, tracking: -2, travelMin: 0.2, travelMax: 0.2, travelAverage: 0.2 },
  plains: { foraging: { dice: 2, add: -7 }, foragingAverage: 0, tracking: 0, travelMin: 0.5, travelMax: 1.25, travelAverage: 1 },
  swampland: { foraging: { dice: 2, add: -7 }, foragingAverage: 0, tracking: -4, travelMin: 0.2, travelMax: 0.2, travelAverage: 0.2 },
  woodlands: { foraging: { dice: 2, add: -7 }, foragingAverage: 0, tracking: 0, travelMin: 0.2, travelMax: 1, travelAverage: 0.5 },
};

export const TERRAIN_ORDER: readonly TerrainType[] = ["arctic", "desert", "island", "jungle", "mountain", "plains", "swampland", "woodlands"];

/** The dice range a modifier gives: 1d-7 gives -6 to -1. */
export function modifierRange(modifier: DiceModifier): { min: number; max: number } {
  return { min: modifier.dice + modifier.add, max: modifier.dice * 6 + modifier.add };
}

/**
 * The foraging modifier (p. 573): a roll's, the listed average, or for
 * exceptional terrain "the maximum or minimum" (`rich` or `desolate`).
 */
export function foragingModifier(
  terrain: TerrainType,
  options: { roll?: number; exceptional?: "rich" | "desolate" } = {},
): number {
  const info = TERRAIN_TYPES[terrain];
  const range = modifierRange(info.foraging);
  if (options.exceptional === "rich") return range.max;
  if (options.exceptional === "desolate") return range.min;
  if (options.roll !== undefined) return Math.max(range.min, Math.min(range.max, options.roll + info.foraging.add));
  return info.foragingAverage;
}

/**
 * The Tracking modifier (p. 573). Where the table's footnote lets loose snow
 * or sand without wind or water give 0, `loose` and no `windy` does; with lots
 * of wind or water it is the listed -4 instead.
 */
export function trackingModifier(terrain: TerrainType, options: { loose?: boolean; windy?: boolean } = {}): number {
  const info = TERRAIN_TYPES[terrain];
  if (info.trackingLoose !== undefined && options.loose) return options.windy ? -4 : info.trackingLoose;
  return info.tracking;
}

/** The travel multiplier (p. 573): the average, or the best or worst the ground gives. */
export function travelMultiplier(terrain: TerrainType, which: "average" | "min" | "max" = "average"): number {
  const info = TERRAIN_TYPES[terrain];
  return which === "min" ? info.travelMin : which === "max" ? info.travelMax : info.travelAverage;
}

/** Skiers get x1 on snow and skaters x1.25 on ice (p. 573's footnote). */
export function arcticTravelFor(mode: "walking" | "skiing" | "skating", ground: "loose" | "ice" | "packed" | "average"): number {
  if (mode === "skiing" && ground !== "average") return 1;
  if (mode === "skating" && ground === "ice") return 1.25;
  if (ground === "loose") return 0.2;
  if (ground === "ice") return 0.5;
  if (ground === "packed") return 1;
  return TERRAIN_TYPES.arctic.travelAverage;
}

export type AquaticTerrain = "bank" | "deepOceanVent" | "reef" | "tropicalLagoon" | "freshWaterLake" | "riverStream" | "openOcean" | "saltWaterSea";

/** Foraging in water, usually against Fishing (p. 573): 2d-6, 2d-7 or 2d-8. */
export const AQUATIC_FORAGING: Readonly<Record<AquaticTerrain, DiceModifier>> = {
  bank: { dice: 2, add: -6 },
  deepOceanVent: { dice: 2, add: -6 },
  reef: { dice: 2, add: -6 },
  tropicalLagoon: { dice: 2, add: -6 },
  freshWaterLake: { dice: 2, add: -7 },
  riverStream: { dice: 2, add: -7 },
  openOcean: { dice: 2, add: -8 },
  saltWaterSea: { dice: 2, add: -8 },
};

// -- illumination levels (p. 574) ------------------------------------------

export interface IlluminationLevel {
  /** The penalty, 0 to -10. */
  penalty: number;
  /** Whether the level is moonlight or twilight, under a clear sky (the dagger). */
  clearSky?: boolean;
  /** A single nearby point source at 1 yard (the double dagger). */
  pointSource?: boolean;
}

/** The named levels of the table, by key. */
export const ILLUMINATION_LEVELS: Readonly<Record<string, IlluminationLevel>> = {
  totalDarkness: { penalty: -10 },
  overcastMoonless: { penalty: -9 },
  starlightThroughClouds: { penalty: -8 },
  starlight: { penalty: -7 },
  quarterMoon: { penalty: -6, clearSky: true },
  halfMoon: { penalty: -5, clearSky: true },
  indicatorLed: { penalty: -5, pointSource: true },
  fullMoon: { penalty: -4, clearSky: true },
  deepTwilight: { penalty: -3, clearSky: true },
  candlelight: { penalty: -3, pointSource: true },
  nightlight: { penalty: -3, pointSource: true },
  twilight: { penalty: -2, clearSky: true },
  streetLightSide: { penalty: -2 },
  gaslight: { penalty: -2, pointSource: true },
  phoneScreen: { penalty: -2, pointSource: true },
  sunrise: { penalty: -1 },
  streetLightMain: { penalty: -1 },
  torch: { penalty: -1, pointSource: true },
  flashlight: { penalty: -1, pointSource: true },
  daylight: { penalty: 0 },
  interior: { penalty: 0 },
  readingLight: { penalty: 0, pointSource: true },
  brightFlashlight: { penalty: 0, pointSource: true },
};

export const ILLUMINATION_ORDER: readonly string[] = Object.keys(ILLUMINATION_LEVELS);

/** Nothing is darker than this, however many penalties add up. */
export const MIN_ILLUMINATION_PENALTY = -10;

/**
 * A point source's penalty at a distance (p. 574): the level's own at 1 yard,
 * another -1 at 2 yards, and beyond that half the range penalty (p. 550) for
 * the distance, rounded for the worse, added to that -1. A candle: -3, -4 at 2
 * yards, -5 to 5 yards, -6 to 10 yards. It stops at the area's ambient level.
 */
export function pointSourcePenalty(basePenalty: number, yards: number, ambient = MIN_ILLUMINATION_PENALTY): number {
  const distance = Math.max(1, yards);
  let penalty = basePenalty;
  if (distance > 1) {
    penalty -= 1;
    if (distance > 2) penalty -= Math.ceil(Math.abs(rangePenaltyFor(distance)) / 2);
  }
  // "A light source never makes things darker": stop at the ambient level.
  return Math.max(penalty, ambient, MIN_ILLUMINATION_PENALTY);
}

/**
 * The range penalty for a distance in yards (p. 550's Size and Speed/Range
 * table's penalty column; -0 to 2 yards, then -1 to 3, -2 to 5, -3 to 7, and so
 * on in the 1, 1.5, 2, 3, 5, 7 sequence times ten). Enough here to halve.
 */
export function rangePenaltyFor(yards: number): number {
  const steps = [2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 30000, 50000, 70000, 100000];
  if (yards <= 2) return 0;
  for (let i = 0; i < steps.length; i++) if (yards <= steps[i]!) return -(i);
  return -steps.length;
}

/** One reading of the light: everything p. 574 adds together. */
export interface IlluminationInput {
  /** The named level, or a penalty. */
  level: string | number;
  /** Distance in yards, for a point source. */
  yards?: number;
  /** The area's ambient penalty, that a source stops at. */
  ambient?: number;
  /** Flicker or moving shadows, -1 to -3. */
  flicker?: number;
  /** A sudden shift of darkness the eyes have not adapted to yet. */
  unadapted?: boolean;
  /** Heavy cloud over a clear-sky level. */
  heavyCloud?: boolean;
  /** Above the Arctic Circle or below the Antarctic, for moonlight. */
  polar?: boolean;
}

/** Minutes of adaptation per sudden -1 of shift (p. 574), and the penalty until then. */
export const ADAPTATION_MINUTES_PER_STEP = 2;
export const ADAPTATION_PENALTY = -2;

/** Minutes the eyes need to adapt to a sudden shift of `shift` levels. */
export function adaptationMinutes(shift: number): number {
  return Math.max(0, Math.ceil(Math.abs(shift))) * ADAPTATION_MINUTES_PER_STEP;
}

/** What the light costs a Vision or ranged attack roll, never past -10 (p. 574). */
export function illuminationPenalty(input: IlluminationInput): number {
  const named = typeof input.level === "string" ? ILLUMINATION_LEVELS[input.level] : undefined;
  let penalty = typeof input.level === "number" ? input.level : (named?.penalty ?? 0);
  if (named?.pointSource && input.yards !== undefined) penalty = pointSourcePenalty(named.penalty, input.yards, input.ambient ?? MIN_ILLUMINATION_PENALTY);
  if (named?.clearSky) {
    if (input.heavyCloud) penalty -= 1;
    if (input.polar) penalty -= 1;
  }
  if (penalty < 0 && input.flicker) penalty -= Math.max(0, Math.min(3, Math.floor(input.flicker)));
  if (penalty < 0 && input.unadapted) penalty += ADAPTATION_PENALTY;
  return Math.max(MIN_ILLUMINATION_PENALTY, Math.min(0, penalty));
}

/** The named level nearest a darkness penalty (0 to 10), for a scene's darkness value. */
export function illuminationNameFor(darkness: number): string {
  const wanted = -Math.max(0, Math.min(10, Math.round(darkness)));
  const order = ["daylight", "sunrise", "twilight", "deepTwilight", "fullMoon", "halfMoon", "quarterMoon", "starlight", "starlightThroughClouds", "overcastMoonless", "totalDarkness"];
  return order[-wanted] ?? "daylight";
}

// -- in plain sight (p. 574) -------------------------------------------------

export const PLAIN_SIGHT_BONUS = 10;
export const PLAIN_SIGHT_DETAIL_BONUS = 20;

export interface PlainSightInput {
  /** Actively looking in the right general direction. */
  watching: boolean;
  /** What is looked at. */
  subject: "light" | "object";
  /** A light source is unconcealed and in the arc of vision (a directional one is pointed at you). */
  unconcealedLight?: boolean;
  /** No modifiers but distance and size apply and no attempt at concealment was made. */
  unmodified?: boolean;
  /** The target was already located by a Vision roll and small details are wanted. */
  detail?: boolean;
  /** A Quick Contest against a concealment skill, a vision-based skill roll or an attack. */
  excluded?: "contest" | "skill" | "attack";
}

/** The Vision bonus for plain sight: +10, +20 for details of a located target, else 0. */
export function plainSightBonus(input: PlainSightInput): number {
  if (!input.watching || input.excluded) return 0;
  if (input.detail) return PLAIN_SIGHT_DETAIL_BONUS;
  if (input.subject === "light") return input.unconcealedLight ? PLAIN_SIGHT_BONUS : 0;
  return input.unmodified ? PLAIN_SIGHT_BONUS : 0;
}

// -- vision rolls in combat (pp. 574-575) ----------------------------------

/** An attacker this small or smaller may go unseen. */
export const UNSEEN_ATTACKER_SM = -10;
/** A ranged attacker whose range penalty is this bad or worse may go unseen. */
export const UNSEEN_RANGE_PENALTY = -10;

export interface CombatVision {
  /** Whether a Vision roll decides if there is an active defense at all. */
  needsRoll: boolean;
  /** The modifier to it, with the +10 for plain sight; 0 when no roll is needed. */
  modifier: number;
}

/**
 * Whether a defender must see the attack coming (pp. 574-575): against an
 * attacker of SM -10 or smaller (the modifier includes SM), or a ranged one
 * whose range penalty is -10 or worse (the modifier includes it), both with
 * +10 for plain sight. "Never roll when Vision is at a bonus, though."
 */
export function combatVision(options: {
  attackerSm?: number | undefined;
  rangePenalty?: number | undefined;
  /** Other modifiers: distance and size penalties together, darkness and so on. */
  other?: number | undefined;
}): CombatVision {
  const sm = options.attackerSm ?? 0;
  const range = Math.min(0, options.rangePenalty ?? 0);
  const small = sm <= UNSEEN_ATTACKER_SM;
  const far = range <= UNSEEN_RANGE_PENALTY;
  if (!small && !far) return { needsRoll: false, modifier: 0 };
  const modifier = (small ? sm : 0) + (far ? range : 0) + (options.other ?? 0) + PLAIN_SIGHT_BONUS;
  return modifier > 0 ? { needsRoll: false, modifier } : { needsRoll: true, modifier };
}

/** What a surprise ranged attack from concealment leaves a defender: nothing at first, a Vision roll without +10 after. */
export function concealedAttackDefense(options: { firstAttack: boolean; seen?: boolean }): "none" | "dodgeMinus4" | "normal" {
  if (options.firstAttack) return "none";
  return options.seen ? "normal" : "dodgeMinus4";
}

// -- frostbite (p. 574) -----------------------------------------------------

/** Locations frostbite reaches when bare. */
export const FROSTBITE_LOCATIONS: readonly string[] = ["face", "hand", "foot", "ear"];

/** The protection that keeps a location from it: gloves on the hands and a balaclava, mask, scarf or deep hood on the face. */
export const FROSTBITE_PROTECTION: Readonly<Record<string, string>> = { hand: "gloves", face: "balaclava" };

/**
 * The exposed locations, from what is worn: every location in `all` that no
 * worn piece covers (`covered`). A piece that names no location covers all.
 */
export function exposedLocations(covered: readonly string[], all: readonly string[] = ["skull", "face", "neck", "torso", "arm", "hand", "leg", "foot"]): string[] {
  const has = new Set(covered);
  return all.filter((location) => !has.has(location));
}

/** The HP lost to frostbite for a loss of FP to cold: 1 on each exposed location per FP (p. 574). */
export function frostbiteDamage(fpLost: number, exposed: readonly string[]): Array<{ location: string; hp: number }> {
  const fp = Math.max(0, Math.floor(fpLost));
  if (fp === 0) return [];
  return exposed.map((location) => ({ location, hp: fp }));
}

// -- visual signals and the horizon (p. 575) --------------------------------

/** The Horizon Table: SM, height in yards, and the horizon in miles. */
export const HORIZON_TABLE: ReadonlyArray<{ sm: number; yards: number; miles: number }> = [
  { sm: -10, yards: 1.5 / 36, miles: 0.4 },
  { sm: -9, yards: 2 / 36, miles: 0.5 },
  { sm: -8, yards: 3 / 36, miles: 0.6 },
  { sm: -7, yards: 5 / 36, miles: 0.8 },
  { sm: -6, yards: 8 / 36, miles: 1 },
  { sm: -5, yards: 1 / 3, miles: 1.2 },
  { sm: -4, yards: 0.5, miles: 1.5 },
  { sm: -3, yards: 2 / 3, miles: 1.75 },
  { sm: -2, yards: 1, miles: 2 },
  { sm: -1, yards: 1.5, miles: 2.5 },
  { sm: 0, yards: 2, miles: 3 },
  { sm: 1, yards: 3, miles: 3.5 },
  { sm: 2, yards: 5, miles: 4.5 },
  { sm: 3, yards: 7, miles: 5.5 },
  { sm: 4, yards: 10, miles: 6.5 },
  { sm: 5, yards: 15, miles: 8 },
  { sm: 6, yards: 20, miles: 9.5 },
  { sm: 7, yards: 30, miles: 12 },
  { sm: 8, yards: 50, miles: 15 },
  { sm: 9, yards: 70, miles: 18 },
  { sm: 10, yards: 100, miles: 21 },
];

/**
 * The horizon for a viewpoint's SM, in miles (p. 575). Each further SM +12 (x100 height) is another x10;
 * below -10 the table stops at 0.4 mile.
 */
export function horizonMiles(sm: number): number {
  const s = Math.round(sm);
  if (s <= -10) return 0.4;
  if (s > 10) return Math.round(21 * 10 ** ((s - 10) / 12) * 100) / 100;
  return HORIZON_TABLE.find((row) => row.sm === s)?.miles ?? 3;
}

/** The horizon for a height in yards: the nearest row at or below it. */
export function horizonMilesForHeight(yards: number): number {
  if (yards >= 10000) {
    const steps = Math.floor(Math.log10(yards / 100) / 2 + 1e-9);
    return horizonMilesForHeight(yards / 100 ** steps) * 10 ** steps;
  }
  let miles = HORIZON_TABLE[0]!.miles;
  for (const row of HORIZON_TABLE) if (row.yards <= yards + 1e-9) miles = row.miles;
  return miles;
}

/** Line of sight between two viewpoints: their horizons added (p. 575). */
export function signalRange(smA: number, smB: number): number {
  return Math.round((horizonMiles(smA) + horizonMiles(smB)) * 100) / 100;
}

/**
 * The Vision modifier for a deliberate signal (p. 575): +10 for plain sight;
 * a light at night reverses the darkness penalty into a bonus.
 */
export function signalVisionBonus(options: { deliberate: boolean; light?: boolean; darknessPenalty?: number }): number {
  let bonus = options.deliberate ? PLAIN_SIGHT_BONUS : 0;
  if (options.light && options.darknessPenalty) bonus += Math.abs(options.darknessPenalty);
  return bonus;
}
