/**
 * Missed sleep (GURPS Basic Set: Campaigns pp. 426-427; Characters pp. 50, 65, 136).
 *
 * "The average human can function for a 16-hour 'day.' He must then rest
 * for an eight-hour 'sleep period.'" Past the day, "you lose 1 FP if you fail
 * to go to sleep, and 1 FP per quarter-day (usually four hours) you stay
 * awake after that." Sleep short of the period shortens the next day by
 * "twice the hours of missed sleep", and only sleep gives the fatigue back:
 * "at least one full sleep period ... restores 1 FP. Further uninterrupted
 * sleep restores 1 FP per hour."
 */

/** The human sleep period, in hours (p. 427). */
export const SLEEP_PERIOD_HOURS = 8;
/** Hours in a day, of which the sleep period is the rest. */
const HOURS_IN_A_DAY = 24;
/** "1 FP per quarter-day (usually four hours)". */
export const QUARTER_DAY_HOURS = 4;

/** A trait as the sheet holds it, for reading the sleep traits off. */
export interface SleepTrait {
  name: string;
  levels?: number;
}

/**
 * How long this character must sleep (Characters pp. 50, 65, 136): Less Sleep
 * "reduces your sleep period by one hour" a level, Extra Sleep adds one, and
 * Doesn't Sleep "can ignore this entire section". Null for the last.
 */
export function sleepPeriodFrom(traits: readonly SleepTrait[]): number | null {
  let hours = SLEEP_PERIOD_HOURS;
  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    if (key === "doesn't sleep" || key === "doesnt sleep") return null;
    if (key === "less sleep") hours -= levels;
    else if (key === "extra sleep") hours += levels;
  }
  return Math.max(0, hours);
}

/**
 * How long the character can stay up before it starts to cost (p. 427): the
 * day is what the sleep period leaves of twenty-four hours, less "twice the
 * hours of missed sleep" from the night before.
 */
export function wakingDayHours(sleepPeriod: number, missedSleepHours = 0): number {
  return Math.max(0, HOURS_IN_A_DAY - sleepPeriod - 2 * Math.max(0, missedSleepHours));
}

/**
 * Fatigue lost to staying up (p. 427): a point at the end of the day, and a
 * point a quarter-day after it.
 */
export function stayingUpFatigue(options: { hoursAwake: number; dayHours: number }): number {
  const over = options.hoursAwake - options.dayHours;
  if (over <= 0) return 0;
  return 1 + Math.floor(over / QUARTER_DAY_HOURS);
}

/**
 * Fatigue got back by sleeping (p. 427): nothing short of a full sleep
 * period, a point for it, and a point an hour beyond it.
 */
export function sleepRecovery(options: { hoursSlept: number; sleepPeriod: number }): number {
  if (options.hoursSlept < options.sleepPeriod) return 0;
  return 1 + Math.floor(options.hoursSlept - options.sleepPeriod);
}

/**
 * Whether staying awake is a roll (p. 427): "if you've lost half or more of
 * your FP to lack of sleep, you must make a Will roll every two hours you
 * spend inactive", and "if you're down to less than 1/3 your FP ... once per
 * 30 minutes of inaction or two hours of action".
 */
export function dozingOff(options: { lostToSleep: number; maxFp: number; currentFp: number }): {
  rolls: boolean;
  /** Minutes between rolls while inactive. */
  inactiveMinutes: number;
  /** Minutes between rolls while active, or null when only inaction risks it. */
  activeMinutes: number | null;
} {
  if (options.maxFp > 0 && options.currentFp < options.maxFp / 3) {
    return { rolls: true, inactiveMinutes: 30, activeMinutes: 120 };
  }
  if (options.maxFp > 0 && options.lostToSleep * 2 >= options.maxFp) {
    return { rolls: true, inactiveMinutes: 120, activeMinutes: null };
  }
  return { rolls: false, inactiveMinutes: 0, activeMinutes: null };
}

/** What a made Will roll to stay awake still costs: "-2 to DX, IQ, and self-control rolls". */
export const AWAKE_BUT_TIRED_PENALTY = -2;
