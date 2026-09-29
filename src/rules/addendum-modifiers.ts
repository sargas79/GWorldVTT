/**
 * The modifiers the Revised edition adds (GURPS Basic Set Revised
 * pp. 328-332, "Modifier Musings" and "New Modifiers").
 *
 * The records carry the percentages; what is here is the arithmetic and the
 * rolls that hang on them: what Hard to Use and Reliable do to a roll to use
 * an ability, what a Requires Roll asks for, how long a margin-based duration
 * lasts once it is Fixed or Reduced, what Costs Hit Points charges, and the
 * either/or and disadvantage-limitation shortcuts.
 */

/** A modifier as a trait holds it: the name and the percentage it was priced at. */
export interface ModifierRef {
  name: string;
  value: number;
}

/** The modifiers of a trait whose name starts with (or is) `name`, case-blind. */
function named(modifiers: readonly ModifierRef[], pattern: RegExp): ModifierRef[] {
  return modifiers.filter((m) => pattern.test(String(m?.name ?? "").trim()));
}

// ---------------------------------------------------------------------------
// Costs Hit Points (p. 330)
// ---------------------------------------------------------------------------

/**
 * The limitation of an ability that costs hit points: "-10% per HP per use,
 * doubled to -20% if the cost is per second"; converting FP costs already
 * built into an advantage is -5% per FP, or -10% if per second.
 */
export function costsHitPointsPercent(
  hp: number,
  options: { perSecond?: boolean; converted?: boolean } = {},
): number {
  const each = (options.converted ? 5 : 10) * (options.perSecond ? 2 : 1);
  const points = Math.max(0, Math.floor(Number(hp)) || 0);
  return points === 0 ? 0 : -each * points;
}

/**
 * What one use of an ability with Costs Hit Points takes, read back from the
 * percentage it was priced at: the same arithmetic reversed. Zero for a
 * trait without the limitation.
 */
export function costsHitPointsCost(modifiers: readonly ModifierRef[]): { hp: number; perSecond: boolean } {
  let hp = 0;
  let perSecond = false;
  for (const m of named(modifiers, /^costs hit points\b/i)) {
    const name = m.name.toLowerCase();
    const second = /per second/.test(name);
    const each = (/converted/.test(name) ? 5 : 10) * (second ? 2 : 1);
    hp += Math.round(Math.abs(Number(m.value) || 0) / each);
    perSecond ||= second;
  }
  return { hp, perSecond };
}

/**
 * The FP one use of an ability with Costs Fatigue takes (Characters p. 111):
 * -5% per FP, read back from the percentage. Zero for a trait without it.
 */
export function costsFatigueCost(modifiers: readonly ModifierRef[]): number {
  return named(modifiers, /^costs fatigue\b/i).reduce((sum, m) => sum + Math.round(Math.abs(Number(m.value) || 0) / 5), 0);
}

// ---------------------------------------------------------------------------
// Hard to Use and Reliable (pp. 331-332)
// ---------------------------------------------------------------------------

/** Hard to Use: at most four levels of -3 (p. 331). */
export const HARD_TO_USE_MAX_LEVELS = 4;
/** Reliable: a bonus of at most +10 (p. 332). */
export const RELIABLE_MAX_BONUS = 10;

/** The roll to use an ability once Hard to Use and Reliable have had their say. */
export interface AbilityRollModifiers {
  /** Reliable's bonus, cumulative with a power Talent. */
  bonus: number;
  /** Hard to Use's penalty, as a negative number or 0. */
  penalty: number;
  /** True where Hard to Use forbids the power Talent's bonus. */
  talentBarred: boolean;
  /** True where a trait has both, which the book forbids. */
  conflict: boolean;
}

/**
 * What the modifiers on an ability do to every roll to use it. A modifier
 * keeps its percentage: Hard to Use at -10% is two levels, -6, and Reliable at
 * +15% is +3.
 */
export function abilityRollModifiers(modifiers: readonly ModifierRef[]): AbilityRollModifiers {
  const hard = named(modifiers, /^hard to use\b/i);
  const reliable = named(modifiers, /^reliable\b/i);
  const levels = Math.min(
    HARD_TO_USE_MAX_LEVELS,
    Math.round(hard.reduce((s, m) => s + Math.abs(Number(m.value) || 0), 0) / 5),
  );
  const bonus = Math.min(
    RELIABLE_MAX_BONUS,
    Math.round(reliable.reduce((s, m) => s + Math.abs(Number(m.value) || 0), 0) / 5),
  );
  return {
    bonus,
    penalty: levels === 0 ? 0 : -3 * levels,
    talentBarred: levels > 0,
    conflict: hard.length > 0 && reliable.length > 0,
  };
}

/**
 * The total modifier to a roll to use an ability: Reliable's bonus, Hard to
 * Use's penalty, and the power Talent unless Hard to Use bars it.
 */
export function abilityRollTotal(modifiers: readonly ModifierRef[], talent = 0): number {
  const m = abilityRollModifiers(modifiers);
  return m.bonus + m.penalty + (m.talentBarred ? 0 : Math.max(0, Math.floor(talent) || 0));
}

/** Reliable and Hard to Use are "forbidden on ranged attacks" (pp. 331-332). */
export function mayHaveUseModifier(ranged: boolean): boolean {
  return !ranged;
}

// ---------------------------------------------------------------------------
// Requires (Attribute), (Skill) and Active Defense Roll (p. 332)
// ---------------------------------------------------------------------------

/** What a Requires modifier asks the user to roll. */
export type RequiresRoll =
  | { kind: "attribute"; attribute: "DX" | "IQ" | "HT" | "Will" | "Per"; quickContest: boolean; percent: number }
  | { kind: "skill"; easy: boolean; attribute: "DX" | "IQ" | "HT" | "Will" | "Per" | null; percent: number }
  | { kind: "activeDefense"; percent: number };

/** Requires Roll's percentage for an attribute (p. 332): -10 for DX, IQ, HT; -5 for Will, Per. */
export function requiresAttributePercent(
  attribute: "DX" | "IQ" | "HT" | "Will" | "Per",
  quickContest = false,
): number {
  const base = attribute === "Will" || attribute === "Per" ? -5 : -10;
  return base - (quickContest ? 10 : 0);
}

/**
 * Requires (Skill) Roll: "priced identically" to its attribute, except that
 * an Easy skill takes 5% off, never making it a bonus.
 */
export function requiresSkillPercent(
  attribute: "DX" | "IQ" | "HT" | "Will" | "Per",
  easy = false,
  quickContest = false,
): number {
  return Math.min(0, requiresAttributePercent(attribute, quickContest) + (easy ? 5 : 0));
}

const ATTRIBUTE_NAMES = { dx: "DX", iq: "IQ", ht: "HT", will: "Will", per: "Per" } as const;

/** Reads a Requires modifier's name, or null for a modifier that isn't one. */
export function requiresRollOf(modifier: ModifierRef): RequiresRoll | null {
  const name = String(modifier?.name ?? "").trim().toLowerCase();
  if (/^requires active defense roll/.test(name)) return { kind: "activeDefense", percent: -40 };
  const attribute = /^requires (dx|iq|ht|will|per) roll/.exec(name);
  if (attribute) {
    return {
      kind: "attribute",
      attribute: ATTRIBUTE_NAMES[attribute[1] as keyof typeof ATTRIBUTE_NAMES],
      quickContest: /quick contest/.test(name),
      percent: Number(modifier.value) || 0,
    };
  }
  if (/^requires skill roll/.test(name)) {
    return {
      kind: "skill",
      easy: /easy/.test(name),
      attribute: /will or per/.test(name) ? "Will" : /dx, iq or ht/.test(name) ? "IQ" : null,
      percent: Number(modifier.value) || 0,
    };
  }
  return null;
}

/**
 * The target of the Requires Active Defense Roll: DX/2 + 3, +1 with Combat
 * Reflexes, a cumulative -4 for each use after the first in a turn, -4 if
 * stunned, and none at all where no active defense is allowed.
 */
export function activeDefenseRollTarget(options: {
  dx: number;
  combatReflexes?: boolean;
  usesThisTurn?: number;
  stunned?: boolean;
  noDefense?: boolean;
}): number | null {
  if (options.noDefense) return null;
  const uses = Math.max(1, Math.floor(options.usesThisTurn ?? 1) || 1);
  return (
    Math.floor(options.dx / 2) + 3 +
    (options.combatReflexes ? 1 : 0) -
    4 * (uses - 1) -
    (options.stunned ? 4 : 0)
  );
}

/** The roll each Requires modifier on an ability asks for, its target worked out. */
export interface AbilityRollNeed {
  label: string;
  roll: RequiresRoll;
  /** The number to roll against, or null where a Quick Contest or a skill decides it. */
  target: number | null;
}

/**
 * The rolls a trait's Requires modifiers ask for, with the target of the ones
 * a score decides. Temporary changes to the score count (p. 332), so callers
 * pass the scores as they stand.
 */
export function requiredRolls(
  modifiers: readonly ModifierRef[],
  scores: { dx: number; iq: number; ht: number; will: number; per: number },
  options: { combatReflexes?: boolean; stunned?: boolean } = {},
): AbilityRollNeed[] {
  const needs: AbilityRollNeed[] = [];
  for (const m of modifiers) {
    const roll = requiresRollOf(m);
    if (!roll) continue;
    if (roll.kind === "attribute") {
      const key = roll.attribute.toLowerCase() as "dx" | "iq" | "ht" | "will" | "per";
      needs.push({ label: m.name, roll, target: roll.quickContest ? null : scores[key] });
    } else if (roll.kind === "activeDefense") {
      needs.push({
        label: m.name,
        roll,
        target: activeDefenseRollTarget({ dx: scores.dx, ...options }),
      });
    } else {
      needs.push({ label: m.name, roll, target: null });
    }
  }
  return needs;
}

// ---------------------------------------------------------------------------
// Durations (pp. 330-332)
// ---------------------------------------------------------------------------

/** Fixed Duration figures a margin-based duration "as if margin of success or failure were 3" (p. 330). */
export const FIXED_DURATION_MARGIN = 3;

/** The margin a duration is read from: 3 with Fixed Duration, else the roll's own. */
export function durationMargin(margin: number, modifiers: readonly ModifierRef[]): number {
  return named(modifiers, /^fixed duration\b/i).length > 0 ? FIXED_DURATION_MARGIN : margin;
}

/** Reduced Duration's divisors, 1/2 first, and what each is worth (p. 332). */
export const REDUCED_DURATION_STEPS: readonly { divisor: number; percent: number }[] = [
  { divisor: 2, percent: -5 },
  { divisor: 3, percent: -10 },
  { divisor: 6, percent: -15 },
  { divisor: 10, percent: -20 },
  { divisor: 20, percent: -25 },
  { divisor: 30, percent: -30 },
  { divisor: 60, percent: -35 },
];

/**
 * The limitation of a duration cut to 1/divisor, or null for a divisor the
 * table doesn't print (the book lets a GM extend the progression, which is
 * for the GM to price).
 */
export function reducedDurationPercent(divisor: number): number | null {
  const step = REDUCED_DURATION_STEPS.find((s) => s.divisor === divisor);
  return step ? step.percent : null;
}

/** The divisor a Reduced Duration modifier was priced at, or 1 for none. */
export function reducedDurationDivisor(modifiers: readonly ModifierRef[]): number {
  for (const m of named(modifiers, /^reduced duration\b/i)) {
    const written = /1\/(\d+)/.exec(m.name);
    if (written) return Number(written[1]);
    const step = REDUCED_DURATION_STEPS.find((s) => s.percent === Number(m.value));
    if (step) return step.divisor;
  }
  return 1;
}

/**
 * Whether a duration may be cut to 1/divisor: "you cannot take an ability's
 * minimum duration below one second" (p. 332), and a maintained duration
 * cannot be reduced at all.
 */
export function mayReduceDuration(minimumSeconds: number, divisor: number, maintained = false): boolean {
  if (maintained) return false;
  return minimumSeconds / Math.max(1, divisor) >= 1;
}

/** A duration in seconds after a Reduced Duration divisor, never under one second. */
export function reducedSeconds(seconds: number, divisor: number): number {
  return Math.max(1, seconds / Math.max(1, divisor));
}

/**
 * Maximum Duration's limitation for a time limit in seconds (p. 331):
 * under 30 s -75, up to 1 min -65, 10 min -50, 30 min -25, 1 h -10,
 * 12 h -5, longer -0.
 */
export function maximumDurationPercent(seconds: number): number {
  if (seconds < 30) return -75;
  if (seconds <= 60) return -65;
  if (seconds <= 600) return -50;
  if (seconds <= 1800) return -25;
  if (seconds <= 3600) return -10;
  if (seconds <= 12 * 3600) return -5;
  return 0;
}

/** After a Maximum Duration runs out the ability can't be reactivated for five minutes. */
export const MAXIMUM_DURATION_LOCKOUT_SECONDS = 300;

/**
 * Minimum Duration's limitation for the shortest time the ability stays on
 * (p. 331): under an hour -0, up to 8 h -5, 12 h -10, 24 h -15, a week -20,
 * a month -25, longer -30. On an advantage with Always On it is worth at most
 * 5% less than Always On, so it stops short of it.
 */
export function minimumDurationPercent(seconds: number, alwaysOnPercent: number | null = null): number {
  const hour = 3600;
  const table: [number, number][] = [
    [hour - 1, 0], [8 * hour, -5], [12 * hour, -10], [24 * hour, -15], [7 * 24 * hour, -20], [30 * 24 * hour, -25],
  ];
  const found = table.find(([limit]) => seconds <= limit);
  const value = found ? found[1] : -30;
  if (alwaysOnPercent === null || alwaysOnPercent >= 0) return value;
  return Math.max(value, alwaysOnPercent + 5);
}

/** Minimum Duration can never exceed Maximum Duration (p. 331). */
export function minimumWithinMaximum(minimumSeconds: number, maximumSeconds: number | null): boolean {
  return maximumSeconds === null || minimumSeconds <= maximumSeconds;
}

// ---------------------------------------------------------------------------
// Game Time (p. 331)
// ---------------------------------------------------------------------------

/**
 * Uses under Game Time. An ability that works at least once per real hour
 * gets its maximum uses per hour as uses per game day; one rated per session
 * gets that many per game week. The GM may multiply either by 2 to 7.
 */
export function gameTimeUses(
  perRealHour: number | null,
  perSession: number | null,
  multiplier = 1,
): { perGameDay: number | null; perGameWeek: number | null } {
  const factor = Math.min(7, Math.max(1, Math.floor(multiplier) || 1));
  return {
    perGameDay: perRealHour === null ? null : perRealHour * factor,
    perGameWeek: perSession === null ? null : perSession * factor,
  };
}

// ---------------------------------------------------------------------------
// Affects Others (p. 330)
// ---------------------------------------------------------------------------

/** Affects Others by touch is +50% per person; with a Force Field and Area Effect, a flat +50%. */
export function affectsOthersPercent(persons: number, forceFieldWithArea = false): number {
  if (forceFieldWithArea) return 50;
  return 50 * Math.max(0, Math.floor(persons) || 0);
}

/** Traits Affects Others may not go on: those that let the user do something (p. 330). */
export function mayAffectOthers(traitName: string): boolean {
  return !/^(healing|innate attack|mind control)\b/i.test(traitName.trim());
}

// ---------------------------------------------------------------------------
// Either/or limitations and limitations on disadvantages (pp. 329-330)
// ---------------------------------------------------------------------------

/**
 * The value of an either/or limitation: "multiply the percentage values of
 * both limitations together", each brought down to -80% first. Written and
 * returned as negative percentages: -20 and -30 make -6.
 */
export function eitherOrPercent(a: number, b: number): number {
  const fraction = (v: number) => Math.min(80, Math.abs(v)) / 100;
  const value = -(fraction(a) * fraction(b)) * 100;
  return Math.round(value * 100) / 100 || 0;
}

/**
 * The special limitation a disadvantage takes in place of a general one: the
 * counter-advantage's limitation subtracted from -100% (Deafness's No Deafness
 * at -30% makes -70%).
 */
export function disadvantageLimitation(counterLimitation: number): number {
  return -100 - counterLimitation;
}

// ---------------------------------------------------------------------------
// Power modifiers (p. 331-332)
// ---------------------------------------------------------------------------

/** One of the eleven power modifiers of the Revised edition, and what it costs. */
export interface PowerModifierOrigin {
  /** The origin as the sheet names it: "Biological", "Chi". */
  origin: string;
  percent: number;
  /** The mental disadvantage a character must take, in points, or 0 for none. */
  disadvantagePoints: number;
}

export const POWER_MODIFIER_ORIGINS: readonly PowerModifierOrigin[] = [
  { origin: "Biological", percent: -10, disadvantagePoints: 0 },
  { origin: "Chi", percent: -10, disadvantagePoints: -10 },
  { origin: "Cosmic", percent: 50, disadvantagePoints: 0 },
  { origin: "Divine", percent: -10, disadvantagePoints: -10 },
  { origin: "Magical", percent: -10, disadvantagePoints: 0 },
  { origin: "Moral", percent: -20, disadvantagePoints: -15 },
  { origin: "Nature", percent: -10, disadvantagePoints: 0 },
  { origin: "Psionic", percent: -10, disadvantagePoints: 0 },
  { origin: "Spirit", percent: -5, disadvantagePoints: -5 },
  { origin: "Super", percent: -10, disadvantagePoints: 0 },
  { origin: "Superscience", percent: -10, disadvantagePoints: 0 },
];

/**
 * The power modifier a list of modifier names carries, or null. A name is one
 * either plain ("Divine"), with what varies in brackets ("Spirit (fickle)")
 * or written "Power Modifier: Divine".
 */
export function powerModifierOrigin(modifierNames: readonly string[]): PowerModifierOrigin | null {
  for (const raw of modifierNames) {
    const name = String(raw ?? "").trim().toLowerCase().replace(/^power modifier:\s*/, "").replace(/\s*\(.*\)\s*$/, "");
    const found = POWER_MODIFIER_ORIGINS.find((o) => o.origin.toLowerCase() === name);
    if (found) return found;
  }
  return null;
}

/**
 * The origin a trait's power modifiers file it under on the Powers list, or
 * null. Cosmic is a power modifier but names no source of power -- it lifts the
 * limits of whatever source the ability has -- so a Cosmic trait is never an
 * ability of a "Cosmic" power. Magical is the one origin common enough to sit
 * beside another (a Divine spell-like ability), so a more specific origin on
 * the same trait wins over it.
 */
export function powerModifierSource(modifierNames: readonly string[]): PowerModifierOrigin | null {
  const found = modifierNames
    .map((name) => powerModifierOrigin([name]))
    .filter((origin): origin is PowerModifierOrigin => origin !== null && origin.origin !== "Cosmic");
  return found.find((origin) => origin.origin !== "Magical") ?? found[0] ?? null;
}

/**
 * A duration a condition carries after Reduced Duration: turns, rounds and
 * seconds all divided by the divisor, never under one of the unit it is in
 * (p. 332: "you cannot take an ability's minimum duration below one second").
 */
export function scaledDuration(
  duration: { turns?: number; rounds?: number; seconds?: number } | undefined,
  divisor: number,
): { turns?: number; rounds?: number; seconds?: number } | undefined {
  if (!duration || divisor <= 1) return duration;
  const cut = (n: number | undefined) => (typeof n === "number" ? Math.max(1, Math.floor(n / divisor)) : undefined);
  const scaled = { turns: cut(duration.turns), rounds: cut(duration.rounds), seconds: reducedSeconds(duration.seconds ?? 0, divisor) };
  return {
    ...(scaled.turns !== undefined ? { turns: scaled.turns } : {}),
    ...(scaled.rounds !== undefined ? { rounds: scaled.rounds } : {}),
    ...(duration.seconds !== undefined ? { seconds: scaled.seconds } : {}),
  };
}

/**
 * The target of an Unreliable/Activation roll, read from what the modifier
 * was priced at: -10% is 14 or less, -20% 11, -40% 8, -80% 5 (Characters
 * p. 116). Null where a trait has none. The worst of several holds.
 */
export function activationTarget(modifiers: readonly ModifierRef[]): number | null {
  const table: Record<number, number> = { 10: 14, 20: 11, 40: 8, 80: 5 };
  const targets = named(modifiers, /^unreliable\/activation\b/i)
    .map((m) => table[Math.abs(Number(m.value) || 0)])
    .filter((n): n is number => typeof n === "number");
  return targets.length > 0 ? Math.min(...targets) : null;
}

/** One roll a use of an ability asks for, in the order it is made. */
export interface AbilityUseRoll {
  label: string;
  /** The score to roll against; null where a skill's level is unknown to the sheet. */
  base: number | null;
  /** True where the roll is a Quick Contest rather than a plain success roll. */
  contest: boolean;
  /** Reliable and Hard to Use apply to it. */
  modified: boolean;
}

/**
 * The rolls one use of a trait takes, in order: each Requires roll, then the
 * Activation roll. Hard to Use and Reliable apply to every one but the
 * active-defense roll, which is a defense.
 */
export function abilityUseRolls(
  needs: readonly AbilityRollNeed[],
  activation: number | null,
  scores: { dx: number; iq: number; ht: number; will: number; per: number },
): AbilityUseRoll[] {
  const rolls: AbilityUseRoll[] = needs.map((need) => {
    const roll = need.roll;
    if (roll.kind === "attribute") {
      const key = roll.attribute.toLowerCase() as keyof typeof scores;
      return { label: need.label, base: roll.quickContest ? scores[key] : need.target, contest: roll.quickContest, modified: true };
    }
    if (roll.kind === "activeDefense") return { label: need.label, base: need.target, contest: false, modified: false };
    return { label: need.label, base: null, contest: false, modified: true };
  });
  if (activation !== null) rolls.push({ label: "Unreliable/Activation", base: activation, contest: false, modified: true });
  return rolls;
}

/** Nature's penalty to use abilities by place (p. 331): wild -1, settlement -3, pollution -5, wasteland -10. */
export function natureUsePenalty(place: "despoiled" | "settlement" | "polluted" | "wasteland"): number {
  return { despoiled: -1, settlement: -3, polluted: -5, wasteland: -10 }[place];
}

/**
 * Whether Nature's worse -20% version applies: a penalty equal to half the TL
 * (rounded up) of the most advanced artifact carried, or the full TL of an
 * implant, is taken on top.
 */
export function natureTechPenalty(artifactTl: number, implantTl = 0): number {
  return -Math.max(Math.ceil(Math.max(0, artifactTl) / 2), Math.max(0, implantTl));
}
