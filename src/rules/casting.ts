/**
 * Casting spells (GURPS Basic Set: Characters pp. 235-239).
 *
 * The arithmetic of a casting: what the mana level does to the roll and to
 * who may roll at all, what high skill takes off the cost and the time, how
 * an Area or a large subject scales the cost, what distance costs, what other
 * spells still running cost, and what is paid on each of the four outcomes.
 * The Critical Spell Failure Table is here too, as the critical miss tables
 * are, each row as the mechanical effect it has.
 *
 * Nothing here rolls dice or touches a sheet; the system layer asks these
 * questions and applies the answers.
 */

import type { SuccessRollResult } from "./success.js";

// ── mana ─────────────────────────────────────────────────────────────────────

/** The five mana levels (p. 235), from none to very high. */
export const MANA_LEVELS = ["none", "low", "normal", "high", "veryHigh"] as const;
export type ManaLevel = (typeof MANA_LEVELS)[number];

/** Whether a value read from a setting or a flag names a mana level. */
export function isManaLevel(value: unknown): value is ManaLevel {
  return typeof value === "string" && (MANA_LEVELS as readonly string[]).includes(value);
}

/** "Low Mana: ... all spells perform at -5 to skill, for all purposes." */
export function manaSkillModifier(level: ManaLevel): number {
  return level === "low" ? -5 : 0;
}

/**
 * Who may cast here. "No Mana: No one can use magic at all." Low and normal:
 * "Only mages can cast spells." High and very high: "Anyone who knows spells
 * can cast them" -- knowing the spell is the caller's to check.
 */
export function mayCast(level: ManaLevel, isMage: boolean): boolean {
  if (level === "none") return false;
  if (level === "high" || level === "veryHigh") return true;
  return isMage;
}

/** "Very High Mana: ... all failures are treated as critical failures". */
export function failuresAreCritical(level: ManaLevel): boolean {
  return level === "veryHigh";
}

/** "Low Mana: ... critical failures have mild effects or no effect at all." */
export function criticalFailuresAreMild(level: ManaLevel): boolean {
  return level === "low";
}

/** "A mage who spends FP to cast a spell on his turn gets those FP back at the start of his next turn." */
export function fatigueReturnsNextTurn(level: ManaLevel): boolean {
  return level === "veryHigh";
}

/**
 * The mana where a spell is cast: a scene may override the world. A scene
 * that says nothing, or says something that is not a level, inherits.
 */
export function effectiveMana(world: unknown, scene: unknown): ManaLevel {
  if (isManaLevel(scene)) return scene;
  return isManaLevel(world) ? world : "normal";
}

// ── magic rituals ────────────────────────────────────────────────────────────

/** What a caster of a given base skill must do, and what it saves (p. 237). */
export interface Ritual {
  /** Energy taken off the cost to cast, and off the cost to maintain. */
  costReduction: number;
  /** What the casting time is multiplied by: 2 at low skill, 1/2, 1/4 and on at high. */
  timeMultiplier: number;
  /** The ritual itself, for the card to name. */
  ritual: "elaborate" | "spoken" | "quiet" | "none";
}

/**
 * The Magic Rituals list (p. 237), read off base skill: "In all cases,
 * 'skill' refers to base skill, not effective skill. The only modifier that
 * matters here is the -5 for low mana, if applicable."
 *
 * Skill 9 or less doubles the time; 10-14 is as listed; 15-19 takes 1 off the
 * cost; 20-24 halves the time and takes 2; 25-29 quarters it and takes 3; and
 * "for every five levels of skill beyond skill 25 ... halve casting time again
 * and reduce energy cost by one more point."
 */
export function ritualForSkill(baseSkill: number): Ritual {
  if (baseSkill <= 9) return { costReduction: 0, timeMultiplier: 2, ritual: "elaborate" };
  if (baseSkill <= 14) return { costReduction: 0, timeMultiplier: 1, ritual: "spoken" };
  if (baseSkill <= 19) return { costReduction: 1, timeMultiplier: 1, ritual: "quiet" };
  const stepsPast20 = Math.floor((baseSkill - 20) / 5);
  return {
    costReduction: 2 + stepsPast20,
    timeMultiplier: 1 / 2 ** (stepsPast20 + 1),
    ritual: "none",
  };
}

/** No ritual at all: what the list comes to when the rule is switched off. */
export const NO_RITUAL: Ritual = { costReduction: 0, timeMultiplier: 1, ritual: "spoken" };

/**
 * Casting time after skill. "Halved (round fractions up to the next second).
 * Minimum casting time is still one second." A Missile spell keeps its listed
 * time whatever the caster's skill: "high skill has no effect on ... the time
 * to cast Missile spells" (p. 237), which leaves the doubling at low skill.
 */
export function castingTimeAfterSkill(
  seconds: number,
  ritual: Ritual,
  options: { missile?: boolean } = {},
): number {
  const multiplier = options.missile && ritual.timeMultiplier < 1 ? 1 : ritual.timeMultiplier;
  return Math.max(1, Math.ceil(seconds * multiplier));
}

/**
 * Energy after skill. "If you know it well enough, you can cast it at no
 * cost." A Blocking spell is the exception: "Never reduce the cost of a
 * Blocking spell" (p. 236).
 */
export function energyAfterSkill(cost: number, ritual: Ritual, options: { blocking?: boolean } = {}): number {
  if (options.blocking) return Math.max(0, cost);
  return Math.max(0, cost - ritual.costReduction);
}

// ── what a casting costs before skill ────────────────────────────────────────

/**
 * An Area spell's cost: "base cost multiplied by the radius of the area of
 * effect in yards (minimum one yard)", and "You must spend a minimum of one
 * energy point on these spells" (p. 239).
 */
export function areaEnergy(baseCost: number, radiusYards: number): number {
  const radius = Math.max(1, Math.floor(radiusYards));
  return Math.max(1, Math.ceil(baseCost * radius));
}

/**
 * A Regular spell's cost for a large subject: "For a subject with a positive
 * SM, multiply cost by 1 + SM ... There is no cost reduction for a subject
 * with a negative SM" (p. 239).
 */
export function subjectSizeEnergy(cost: number, subjectSm: number): number {
  return cost * (1 + Math.max(0, Math.floor(subjectSm)));
}

/**
 * The energy a variable spell may take, with Magery raising the ceiling.
 *
 * "The upper limit is the higher of the standard number of levels or the
 * caster's Magery level" (p. 237), where a level of effect costs what the
 * least casting does: Major Healing's 1 to 4 has four levels of one energy,
 * and Explosive Fireball's 2 to 2xMagery has levels of two. A cost written
 * "1 to Magery" has no printed ceiling; Magery is its ceiling.
 */
export function energyBounds(
  energy: { cast: number | null; castMax: number | null; text: string },
  magery: number | null,
): { min: number; max: number | null } {
  const min = Math.max(0, energy.cast ?? 0);
  const perLevel = Math.max(1, energy.cast ?? 1);
  const talent = Math.max(0, magery ?? 0);

  if (energy.castMax !== null && energy.castMax !== undefined) {
    if (energy.castMax === min) return { min, max: min };
    const levels = Math.max(Math.floor(energy.castMax / perLevel), talent);
    return { min, max: Math.max(min, levels * perLevel) };
  }
  if (/magery/i.test(energy.text)) {
    return { min, max: Math.max(min, talent * perLevel) };
  }
  return { min, max: null };
}

// ── modifiers to the roll ────────────────────────────────────────────────────

/**
 * Distance to a subject that cannot be touched: "apply a skill penalty equal
 * to your distance in yards from the subject", and "If you cannot touch or
 * see the subject, there is a further -5 penalty" (p. 239). An Area spell
 * measures "from the nearest edge of the area".
 */
export function distancePenalty(options: { yards: number; cannotSeeOrTouch?: boolean }): number {
  const yards = Math.max(0, Math.floor(options.yards));
  // `|| 0` turns a -0 back into 0, so a subject in hand reads as no penalty.
  return (-yards - (options.cannotSeeOrTouch ? 5 : 0)) || 0;
}

/**
 * Other spells still running (p. 238): "-3 per spell you are concentrating on
 * at the moment ... -1 per other spell you have 'on' at the moment. A spell
 * that lasts permanently ... does not carry a penalty."
 */
export function maintenancePenalty(options: { spellsOn: number; concentratingOn: number }): number {
  return (-Math.max(0, options.spellsOn) - 3 * Math.max(0, options.concentratingOn)) || 0;
}

/** "You are at -1 on your spell roll per HP used" (p. 237). */
export function hpBurnPenalty(hp: number): number {
  return -Math.max(0, Math.floor(hp)) || 0;
}

/** How many of the spells running count against the caster. */
export function activeSpellCounts(
  active: ReadonlyArray<{ permanent?: boolean; concentrating?: boolean }>,
): { spellsOn: number; concentratingOn: number } {
  let spellsOn = 0;
  let concentratingOn = 0;
  for (const spell of active) {
    if (spell.permanent) continue;
    if (spell.concentrating) concentratingOn++;
    else spellsOn++;
  }
  return { spellsOn, concentratingOn };
}

// ── outcomes ─────────────────────────────────────────────────────────────────

/**
 * What a casting costs on each outcome (pp. 235, 241).
 *
 * Success: the cost. Critical success: "there is never an energy cost".
 * Failure: "If success would have cost energy, you lose one energy point;
 * otherwise, you lose nothing" -- except an Information spell, where "you
 * must always pay the full energy cost". Critical failure: "you must spend
 * the full energy cost".
 */
export function energyOnOutcome(options: {
  cost: number;
  outcome: Pick<SuccessRollResult, "success" | "criticalSuccess" | "criticalFailure">;
  information?: boolean;
}): number {
  const { cost, outcome } = options;
  if (outcome.criticalSuccess) return 0;
  if (outcome.success) return cost;
  if (outcome.criticalFailure || options.information) return cost;
  return cost > 0 ? 1 : 0;
}

/**
 * The outcome as the mana level reads it: in very high mana "all failures
 * are treated as critical failures".
 */
export function outcomeUnderMana<T extends Pick<SuccessRollResult, "success" | "criticalFailure">>(
  outcome: T,
  level: ManaLevel,
): T {
  if (!outcome.success && failuresAreCritical(level)) return { ...outcome, criticalFailure: true };
  return outcome;
}

/** One row of the Critical Spell Failure Table (p. 236). */
export interface SpellFailureEntry {
  rolls: readonly number[];
  /** Names the effect; localized as `GWORLD.SpellFailure.<effect>`. */
  effect: string;
  /** Injury the caster takes, as dice, where the row says so. */
  injuryDice?: number;
  /** Flat injury to the caster. */
  injury?: number;
  /** The caster is stunned, with an IQ roll to recover. */
  stunned?: boolean;
  /** True where the row's effect needs the GM: a random target, a demon. */
  gmDecides?: boolean;
}

/**
 * The Critical Spell Failure Table (p. 236). "If the result is inappropriate
 * -- or if it is the result that the caster intended -- roll again. The GM is
 * free to improvise instead of using the table."
 */
export const CRITICAL_SPELL_FAILURE: readonly SpellFailureEntry[] = [
  { rolls: [3], effect: "failsInjuryDice", injuryDice: 1 },
  { rolls: [4], effect: "onCasterOrFoe", gmDecides: true },
  { rolls: [5, 6], effect: "onCompanionOrFoe", gmDecides: true },
  { rolls: [7], effect: "wrongTarget", gmDecides: true },
  { rolls: [8], effect: "failsInjuryOne", injury: 1 },
  { rolls: [9], effect: "failsStunned", stunned: true },
  { rolls: [10, 11], effect: "noiseOnly" },
  { rolls: [12], effect: "weakShadow" },
  { rolls: [13], effect: "reversed" },
  { rolls: [14], effect: "uselessIllusion", gmDecides: true },
  { rolls: [15, 16], effect: "reversedWrongTarget", gmDecides: true },
  { rolls: [17], effect: "forgotten" },
  { rolls: [18], effect: "demon", gmDecides: true },
];

/** The table's row for a 3d roll. */
export function criticalSpellFailure(roll: number): SpellFailureEntry {
  const clamped = Math.min(18, Math.max(3, Math.floor(roll)));
  return CRITICAL_SPELL_FAILURE.find((entry) => entry.rolls.includes(clamped))!;
}

// ── duration and maintenance ─────────────────────────────────────────────────

/**
 * When a spell cast now runs out, in world seconds, or null for a spell whose
 * duration the sheet cannot count -- "Varies", "Special" -- which stays on
 * until dropped.
 */
export function spellExpiry(now: number, durationSeconds: number | null): number | null {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return now + durationSeconds;
}

/**
 * Whether a spell has run out. A spell with no counted expiry never has.
 */
export function isExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && now >= expiresAt;
}

/**
 * When a maintained spell next runs out: "the spell continues for another
 * interval equal to its duration" (p. 238), from where it stood, or from now
 * if it had already lapsed.
 */
export function maintainedExpiry(
  expiresAt: number | null,
  durationSeconds: number | null,
  now: number,
): number | null {
  if (expiresAt === null || durationSeconds === null || durationSeconds <= 0) return null;
  return Math.max(expiresAt, now) + durationSeconds;
}

/**
 * What ending a spell early costs: "If you suddenly decide to 'cancel' a spell
 * before its time is up ... you must pay one energy point" (p. 237). A spell
 * that has run out simply ends.
 */
export function cancelCost(expiresAt: number | null, now: number): number {
  return isExpired(expiresAt, now) ? 0 : 1;
}

/** The whole of a casting's effective skill, itemised for the card. */
export interface CastingModifier {
  key: string;
  value: number;
}

/** The distraction roll: "make a Will roll at -3 to continue casting" (p. 236). */
export const DISTRACTION_PENALTY = -3;
