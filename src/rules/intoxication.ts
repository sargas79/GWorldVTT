/**
 * Drink and drugs (GURPS Basic Set: Campaigns pp. 439-441).
 *
 * Drinking is a poison rule wearing a friendlier hat: a dose you take
 * willingly, an hourly resistance roll, and a track of states you slide down
 * one step per failure. The drugs are the same machinery with different
 * numbers, which is why they share a file.
 *
 * The states themselves are afflictions (p. 428), so what being drunk *does*
 * is not defined here -- only how many steps down the track somebody has gone.
 */

import { penalty } from "./modifiers.js";

/** The states between sober and dead drunk (p. 439). */
export const INTOXICATION_LEVELS = ["sober", "tipsy", "drunk", "unconscious", "coma"] as const;

export type Intoxication = (typeof INTOXICATION_LEVELS)[number];

/**
 * How many drinks an hour somebody can take before rolling (p. 439).
 *
 * "At the end of any hour during which you consume more than ST/4 drinks, roll
 * against the higher of HT or Carousing."
 */
export function drinksBeforeRolling(strength: number): number {
  return Math.max(0, strength) / 4;
}

/** Whether this hour's drinking calls for a roll at all (p. 439). */
export function mustRollForDrink(options: { strength: number; drinks: number }): boolean {
  return options.drinks > drinksBeforeRolling(options.strength);
}

/**
 * The modifier to the hourly roll (p. 439).
 *
 * "-1 per drink over ST/4 that hour; -2 on an empty stomach, or +1 if you have
 * recently eaten; +2 for the Alcohol Tolerance perk, or -2 for the Alcohol
 * Intolerance quirk."
 */
export function drinkModifier(options: {
  strength: number;
  drinks: number;
  emptyStomach?: boolean;
  recentlyEaten?: boolean;
  tolerance?: boolean;
  intolerance?: boolean;
}): number {
  const over = Math.max(0, options.drinks - drinksBeforeRolling(options.strength));

  let modifier = penalty(Math.floor(over));
  if (options.emptyStomach) modifier -= 2;
  else if (options.recentlyEaten) modifier += 1;
  if (options.tolerance) modifier += 2;
  if (options.intolerance) modifier -= 2;

  return modifier;
}

/** How far down the track a roll pushed somebody. */
export interface DrinkResult {
  level: Intoxication;
  /** Steps taken this roll: 0, 1, 2, or the 3 of a hopeless critical. */
  steps: number;
  /** True when they are drunk and should roll for pink elephants. */
  pinkElephantsRoll: boolean;
  /** True when the Heaves roll stands between them and the floor. */
  heavesRoll: boolean;
}

/** One step further down the track, stopping at coma. */
function slide(level: Intoxication, steps: number): Intoxication {
  const at = INTOXICATION_LEVELS.indexOf(level);
  const to = Math.min(INTOXICATION_LEVELS.length - 1, Math.max(0, at) + Math.max(0, steps));
  return INTOXICATION_LEVELS[to]!;
}

/**
 * What one hour of drinking did (p. 439).
 *
 * "Each failure shifts you one level from sober to tipsy to drunk to
 * unconscious (drunken stupor) to coma. A critical failure drops you two
 * levels... If penalties reduce your roll to 2 or less, critical failure means
 * you drop three levels!"
 */
export function drinkResult(options: {
  level: Intoxication;
  success: boolean;
  criticalFailure?: boolean;
  /** The modified target the roll was made against, which can go below 3. */
  effectiveTarget: number;
}): DrinkResult {
  if (options.success) {
    return {
      level: options.level,
      steps: 0,
      pinkElephantsRoll: false,
      heavesRoll: false,
    };
  }

  const steps = options.criticalFailure ? (options.effectiveTarget <= 2 ? 3 : 2) : 1;
  const level = slide(options.level, steps);

  return {
    level,
    steps,
    // "If you are drunk, make one additional HT+4 roll."
    pinkElephantsRoll: level === "drunk",
    // "When a failed HT roll indicates that you would fall unconscious or into
    // a coma, make a second, unmodified HT roll."
    heavesRoll: level === "unconscious" || level === "coma",
  };
}

/** The bonus to the extra roll for hallucinating while drunk (p. 439). */
export const PINK_ELEPHANTS_MODIFIER = 4;

/**
 * Hours between the rolls to sober up (p. 439).
 *
 * "After half as many hours as the total number of drinks you consumed, roll
 * vs. HT... Continue to roll each time this many hours pass until you are
 * sober."
 */
export function soberingHours(totalDrinks: number): number {
  return Math.max(0, totalDrinks) / 2;
}

/** One step back towards sober (p. 439). */
export function soberUp(level: Intoxication): Intoxication {
  // "Exception: to recover from a coma, you need medical help!" -- so a coma
  // does not sober up on its own, however long somebody is left alone.
  if (level === "coma" || level === "sober") return level;
  return INTOXICATION_LEVELS[INTOXICATION_LEVELS.indexOf(level) - 1]!;
}

/**
 * The modifier to the roll against a hangover (p. 439).
 *
 * "You must roll vs. HT when you stop drinking, at -2 if you're drunk or -4 if
 * you're unconscious."
 */
export function hangoverModifier(level: Intoxication): number {
  if (level === "unconscious" || level === "coma") return penalty(4);
  if (level === "drunk") return penalty(2);
  return 0;
}

/** Whether stopping at this state calls for a hangover roll at all (p. 439). */
export function risksHangover(level: Intoxication): boolean {
  return level !== "sober";
}

/**
 * When a hangover starts and how long it runs (p. 439).
 *
 * "This kicks in 1d hours after the end of the drinking session -- or on
 * awakening, if you pass out or fall asleep before this time -- and lasts hours
 * equal to your margin of failure."
 */
export function hangover(options: { delayRoll: number; marginOfFailure: number }): {
  startsInHours: number;
  hours: number;
} {
  return {
    startsInHours: Math.max(1, Math.floor(options.delayRoll)),
    hours: Math.max(1, Math.floor(options.marginOfFailure)),
  };
}

// ── drugs (pp. 440-441) ─────────────────────────────────────────────────────

/** The classes of addictive drug the book gives rules for (pp. 440-441). */
export type DrugKind = "stimulant" | "hallucinogen" | "sedative" | "painkiller" | "heroin";

/** A drug, as the book describes one. */
export interface Drug {
  kind: DrugKind;
  /** Seconds before it takes effect. */
  delaySeconds: number;
  /** The modifier to the HT roll to resist, or null where there is none. */
  resistanceModifier: number | null;
  reference: string;
}

export const DRUGS: Readonly<Record<DrugKind, Drug>> = {
  // "Potent ones restore 1d FP... These effects endure for (12 - HT) hours."
  stimulant: { kind: "stimulant", delaySeconds: 0, resistanceModifier: null, reference: "Campaigns p. 440" },
  // "Most of these drugs are taken orally and require about 20 minutes to work."
  hallucinogen: { kind: "hallucinogen", delaySeconds: 1200, resistanceModifier: -2, reference: "Campaigns p. 440" },
  sedative: { kind: "sedative", delaySeconds: 1200, resistanceModifier: -2, reference: "Campaigns p. 441" },
  painkiller: { kind: "painkiller", delaySeconds: 1200, resistanceModifier: -4, reference: "Campaigns p. 441" },
  heroin: { kind: "heroin", delaySeconds: 0, resistanceModifier: -4, reference: "Campaigns p. 441" },
};

/**
 * How long a stimulant lasts, in hours (p. 440).
 *
 * "These effects endure for (12 - HT) hours, minimum one hour."
 */
export function stimulantHours(health: number): number {
  return Math.max(1, 12 - health);
}

/**
 * What a stimulant costs when it wears off (p. 440).
 *
 * "The user loses twice the FP he recovered", and picks up Bad Temper and
 * Chronic Depression for as long again as the drug lasted.
 */
export function stimulantCrash(fpRestored: number): number {
  return 2 * Math.max(0, fpRestored);
}

/**
 * The penalty to the HT roll for taking stimulants repeatedly (p. 440).
 *
 * "He must roll vs. HT after the second and later doses, at a cumulative -1 per
 * dose after the first." A critical failure there is a heart attack.
 */
export function stimulantDoseModifier(dosesToday: number): number {
  return penalty(Math.max(0, Math.floor(dosesToday) - 1));
}

/**
 * The penalty to a depressant's resistance roll for taking several (p. 441).
 *
 * "Anyone who takes two or more doses of depressants risks an overdose. This
 * definitely includes taking a single dose of two or more depressants! Any
 * alcohol at all counts as an extra dose... each doubling of dosage gives -2 to
 * resistance rolls."
 */
export function overdoseModifier(options: { doses: number; anyAlcohol?: boolean }): number {
  const doses = Math.max(1, Math.floor(options.doses)) + (options.anyAlcohol ? 1 : 0);
  return penalty(2 * Math.floor(Math.log2(doses)));
}

/** How long an overdose puts somebody out, in hours (p. 441). */
export function overdoseHours(marginOfFailure: number): number {
  return Math.max(1, Math.floor(marginOfFailure));
}

/**
 * The poison an overdose becomes (p. 441).
 *
 * "It inflicts 1 point of toxic damage, repeating at 15-minute intervals for 24
 * cycles. If the victim reaches -1xHP, he slips into a coma."
 */
export const OVERDOSE_POISON = {
  intervalSeconds: 900,
  cycles: 24,
  damagePerCycle: 1,
} as const;

// ── withdrawal (p. 440) ─────────────────────────────────────────────────────

/** Successful daily rolls needed to shake an Addiction (p. 440). */
export const WITHDRAWAL_DAYS = 14;

/** The cap on the roll a withdrawal attempt is made against (p. 440). */
export const WITHDRAWAL_MAX = 13;

/** What a day of withdrawal did. */
export interface WithdrawalDay {
  /** Successful days banked, this one included. */
  daysClear: number;
  /** True once the habit is beaten. */
  withdrawn: boolean;
  /** Hit points lost today, for a physiological dependency with no drug about. */
  hpLost: number;
  /** True when they gave in and the whole attempt starts again. */
  gaveIn: boolean;
  /** True when a psychological dependency picked up another quirk today. */
  quirk: boolean;
}

/**
 * One daily withdrawal roll (p. 440).
 *
 * "Each success puts you a day closer... If [the drug] is [available], you give
 * in and take a dose; if you still want to try to withdraw, you must restart
 * the process from day one. If the drug is not available, you take 1 HP of
 * injury and may continue the process... but that day doesn't count."
 */
export function withdrawalDay(options: {
  success: boolean;
  daysClear: number;
  drugAvailable: boolean;
  /** Will rather than HT, and quirks rather than injury. */
  psychological?: boolean;
}): WithdrawalDay {
  const clear = Math.max(0, Math.floor(options.daysClear));

  if (options.success) {
    const now = clear + 1;
    return {
      daysClear: now,
      withdrawn: now >= WITHDRAWAL_DAYS,
      hpLost: 0,
      gaveIn: false,
      quirk: false,
    };
  }

  if (options.drugAvailable) {
    return { daysClear: 0, withdrawn: false, hpLost: 0, gaveIn: true, quirk: false };
  }

  return {
    daysClear: clear,
    withdrawn: false,
    hpLost: options.psychological ? 0 : 1,
    gaveIn: false,
    quirk: options.psychological === true,
  };
}
