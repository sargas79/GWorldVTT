/**
 * What a ritual costs (GURPS Monster Hunters 1: Champions pp. 33-35, 39).
 *
 * "Every spell must be defined clearly", and the definition sets the energy:
 *
 *     Energy Cost = (spell effects + modifiers) x Greater effects multiplier
 *
 * A spell effect is one of seven things done to one Path's subject, Lesser or
 * Greater. The modifiers are what else the definition says -- how far, how
 * wide, how long, how much damage -- each read off the book's tables. Which
 * skill every roll uses follows from the Paths: the lowest of them, at -1 for
 * each Path past the second (p. 35).
 */

import { parseDiceAdds } from "./dice.js";
import type { RitualPath } from "./ritual-path.js";
import { longDistanceModifier } from "./trait-attacks.js";

/** The seven effects and their base energy (p. 33). */
export const RITUAL_EFFECTS = {
  sense: 2,
  strengthen: 3,
  restore: 4,
  control: 5,
  destroy: 5,
  create: 6,
  transform: 8,
} as const;
export type RitualEffect = keyof typeof RITUAL_EFFECTS;

/** One effect of a ritual: what it does, to which Path's subject, and how blatantly. */
export interface RitualEffectEntry {
  path: RitualPath;
  effect: RitualEffect;
  greater: boolean;
}

/** "0 Greater effects x1, 1 x3, 2 x5, 3 x7, +1 +2" (p. 34). */
export function greaterEffectsMultiplier(greater: number): number {
  return 1 + 2 * Math.max(0, Math.floor(greater));
}

/**
 * The "Size" value of a line of the Size and Speed/Range Table (Characters
 * p. 550), for a distance, radius or speed in yards. The table repeats every
 * factor of ten -- 2, 3, 5, 7, 10, 15 yards are sizes 0 to 5, 20 to 150 are 6
 * to 11 -- and a figure between two lines takes the larger. Ritual modifiers
 * never go below zero, which is what this returns for two yards or less.
 */
export function sizeSpeedRangeValue(yards: number): number {
  if (!(yards > 2)) return 0;
  const steps = [2, 3, 5, 7, 10, 15];
  for (let n = 0; ; n++) {
    const limit = steps[n % 6]! * 10 ** Math.floor(n / 6);
    if (yards <= limit) return n;
  }
}

/** The Ritual Effect Table's durations, in order; each line is one more energy (p. 35). */
export const RITUAL_DURATIONS = [
  "momentary", "10min", "30min", "1hr", "3hr", "6hr", "12hr", "1day", "3days", "1week", "2weeks", "1month",
] as const;

/**
 * Energy for a duration: the table's line, one more per month past the first,
 * and "for durations over a year, the added energy becomes (number of years)
 * + 21" (p. 35).
 */
export function durationEnergy(options: { step: number; extraMonths?: number; years?: number }): number {
  if ((options.years ?? 0) > 0) return Math.ceil(options.years!) + 21;
  const step = Math.max(0, Math.min(RITUAL_DURATIONS.length - 1, Math.floor(options.step)));
  return step + (step === RITUAL_DURATIONS.length - 1 ? Math.max(0, Math.floor(options.extraMonths ?? 0)) : 0);
}

/** How a damaging ritual's damage type changes its energy (p. 35). */
export type RitualDamageKind = "standard" | "small" | "large" | "heavy";
const DAMAGE_KIND_MULTIPLIER: Record<RitualDamageKind, number> = { standard: 1, small: 0.5, large: 1.5, heavy: 2 };

/**
 * How the damage reaches its victim. A malediction-type attack bypasses DR,
 * and is what the table prices. "A visible, blatant, external attack, which
 * must be delivered by touch or thrown ... and can be dodged" does double the
 * damage if explosive, or triple otherwise, for the same energy.
 */
export type RitualDelivery = "malediction" | "external" | "externalExplosive";

/**
 * The Ritual Effect Table's damage column: 1d is nothing, and each further +1
 * of damage one more energy, a die being four steps -- 1d+2, 2d-1, 2d.
 */
function damageSteps(dice: { dice: number; adds: number }): number {
  return Math.max(0, 4 * dice.dice + dice.adds - 4);
}

/**
 * Energy for damage (p. 35). The damage type scales the energy: x0.5 for
 * small piercing, x1.5 for cutting or large piercing, x2 for corrosion,
 * fatigue, huge piercing or impaling. An external attack buys two or three
 * times the damage, so its dice are divided before they are looked up -- the
 * book's own example: "a 3d+3 fireball adds +1 energy". Null for dice that
 * cannot be read.
 */
export function damageEnergy(options: {
  dice: string;
  kind?: RitualDamageKind | undefined;
  delivery?: RitualDelivery | undefined;
}): number | null {
  const parsed = parseDiceAdds(options.dice);
  if (!parsed) return null;
  const divisor = options.delivery === "external" ? 3 : options.delivery === "externalExplosive" ? 2 : 1;
  const steps = Math.ceil((4 * parsed.dice + parsed.adds) / divisor) - 4;
  const energy = Math.max(0, steps);
  return Math.ceil(energy * DAMAGE_KIND_MULTIPLIER[options.kind ?? "standard"]);
}

/** Healing reads the same damage column, with no multiplier (p. 34). */
export function healingEnergy(dice: string): number | null {
  const parsed = parseDiceAdds(dice);
  return parsed ? damageSteps(parsed) : null;
}

/** The Ritual Effect Table's weight column, in pounds (p. 35). */
const WEIGHT_LINES = [10, 30, 100, 300, 1000, 3000, 10_000, 30_000, 100_000, 300_000, 900_000, 2_700_000];

/** Energy for the largest subject a physical change works on: a line per x3 past the table. */
export function subjectWeightEnergy(pounds: number): number {
  if (!(pounds > 0)) return 0;
  for (let i = 0; i < WEIGHT_LINES.length; i++) if (pounds <= WEIGHT_LINES[i]!) return i;
  return WEIGHT_LINES.length - 1 + Math.ceil(Math.log(pounds / WEIGHT_LINES.at(-1)!) / Math.log(3));
}

/** Bestows a Bonus or Penalty (p. 34): broad, moderate, or a single skill. */
export type RitualBonusScope = "broad" | "moderate" | "single";
const BONUS_BASE: Record<RitualBonusScope, number> = { broad: 5, moderate: 2, single: 1 };

/** "+1 5/2/1, +2 10/4/2 ... etc. x2": the size of the bonus or penalty, whichever sign. */
export function bonusEnergy(scope: RitualBonusScope, amount: number): number {
  const size = Math.abs(Math.floor(amount));
  return size === 0 ? 0 : BONUS_BASE[scope] * 2 ** (size - 1);
}

/** Every modifier a definition can carry (pp. 34-35). Zero or blank is "not used". */
export interface RitualModifiers {
  /** Affliction: "+1 energy for every +5% it's worth as an enhancement". Stun is 0. */
  afflictionPercent?: number;
  /** Altered Traits: points of advantages or attributes given, +1 each. */
  traitsAdded?: number;
  /** Altered Traits: points of disadvantages given or advantages taken, +1 per 5. */
  traitsRemoved?: number;
  /** Area of Effect: the radius in yards, twice its Size value, at least +2. */
  areaRadius?: number;
  /** Subjects in the area left out, +1 for every two. */
  excludedSubjects?: number;
  bonusScope?: RitualBonusScope | "";
  bonusAmount?: number;
  damageDice?: string;
  damageKind?: RitualDamageKind;
  damageDelivery?: RitualDelivery;
  /** Duration: a line of the Ritual Effect Table, then months, or years. */
  durationStep?: number;
  extraMonths?: number;
  years?: number;
  extraEnergy?: number;
  healingDice?: string;
  /** Meta-Magic: "additional energy equal to the cost of the original spell". */
  metaMagic?: number;
  /** Range in yards: its Size value, at least +0. */
  rangeYards?: number;
  /** An information spell's range: the Long-Distance penalty, as energy. */
  informationRangeYards?: number;
  /** A cross-time spell: the Long-Distance penalty reading miles as days. */
  crossTimeDays?: number;
  /** Dimensional barriers crossed, 10 each. */
  dimensions?: number;
  /** Speed in yards a second: its Size value, at least +0. */
  speedYards?: number;
  /** The largest subject a physical change works on, in pounds. */
  subjectWeight?: number;
  /** Traditional Trappings: up to 25% off the final cost, the GM's to give. */
  trappingsPercent?: number;
}

/** The lines of a ritual's cost, for the sheet to show. */
export interface RitualCost {
  effects: number;
  modifiers: number;
  greater: number;
  multiplier: number;
  /** Before any Traditional Trappings. */
  subtotal: number;
  total: number;
  /** "Cannot be combined with duration" (p. 34): damage or healing given one. */
  durationConflict: boolean;
}

/** The energy of each modifier a definition uses. */
export function modifierEnergy(m: RitualModifiers): number {
  const n = (v: number | undefined) => Math.max(0, Number(v ?? 0) || 0);
  let total = 0;
  if (n(m.afflictionPercent)) total += Math.ceil(n(m.afflictionPercent) / 5);
  total += n(m.traitsAdded) + Math.ceil(n(m.traitsRemoved) / 5);
  if (n(m.areaRadius)) total += Math.max(2, 2 * sizeSpeedRangeValue(n(m.areaRadius))) + Math.ceil(n(m.excludedSubjects) / 2);
  if (m.bonusScope) total += bonusEnergy(m.bonusScope, Number(m.bonusAmount ?? 0));
  if (m.damageDice?.trim()) total += damageEnergy({ dice: m.damageDice, kind: m.damageKind, delivery: m.damageDelivery }) ?? 0;
  if (m.healingDice?.trim()) total += healingEnergy(m.healingDice) ?? 0;
  total += durationEnergy({ step: n(m.durationStep), extraMonths: n(m.extraMonths), years: n(m.years) });
  total += n(m.extraEnergy) + n(m.metaMagic);
  if (n(m.rangeYards)) total += sizeSpeedRangeValue(n(m.rangeYards));
  if (n(m.informationRangeYards)) total += -longDistanceModifier(n(m.informationRangeYards));
  if (n(m.crossTimeDays)) total += -longDistanceModifier(n(m.crossTimeDays) * 1760);
  total += 10 * Math.floor(n(m.dimensions));
  if (n(m.speedYards)) total += sizeSpeedRangeValue(n(m.speedYards));
  total += subjectWeightEnergy(n(m.subjectWeight));
  return total;
}

/** A ritual's energy cost, line by line (pp. 33-34). */
export function ritualCost(definition: { effects: readonly RitualEffectEntry[]; modifiers: RitualModifiers }): RitualCost {
  const effects = definition.effects.reduce((sum, e) => sum + (RITUAL_EFFECTS[e.effect] ?? 0), 0);
  const modifiers = modifierEnergy(definition.modifiers);
  const greater = definition.effects.filter((e) => e.greater).length;
  const multiplier = greaterEffectsMultiplier(greater);
  const subtotal = (effects + modifiers) * multiplier;
  const trappings = Math.max(0, Math.min(25, Number(definition.modifiers.trappingsPercent ?? 0) || 0));
  const m = definition.modifiers;
  return {
    effects,
    modifiers,
    greater,
    multiplier,
    subtotal,
    total: Math.ceil(subtotal * (1 - trappings / 100)),
    durationConflict: Boolean((m.damageDice?.trim() || m.healingDice?.trim()) && ((m.durationStep ?? 0) > 0 || (m.years ?? 0) > 0)),
  };
}

/** The skill a ritual's rolls use (p. 35). */
export interface GoverningPath {
  path: RitualPath | null;
  /** The Path's level with the penalty for extra Paths taken, or null. */
  level: number | null;
  /** -1 for each Path past the second. */
  penalty: number;
}

/**
 * "For spells that mix two paths, the caster uses the lower of the two ... If
 * the spell requires three or more paths, the caster uses his lowest one and
 * is at a -1 penalty (to all ritual-related rolls) for every Path past the
 * first two." A Path the caster cannot use at all makes the ritual uncastable.
 */
export function governingPath(
  effects: readonly Pick<RitualEffectEntry, "path">[],
  levels: Readonly<Partial<Record<RitualPath, number | null>>>,
): GoverningPath {
  const paths = [...new Set(effects.map((e) => e.path))];
  if (paths.length === 0) return { path: null, level: null, penalty: 0 };
  const penalty = paths.length > 2 ? 2 - paths.length : 0;
  let lowest: RitualPath | null = null;
  let lowestLevel = Infinity;
  for (const path of paths) {
    const level = levels[path];
    if (level === null || level === undefined) return { path, level: null, penalty };
    if (level < lowestLevel) { lowest = path; lowestLevel = level; }
  }
  return { path: lowest, level: lowestLevel + penalty, penalty };
}

/** How far a ritual reaches: in yards, as information, or across time (p. 34). */
export type RitualRangeKind = "yards" | "information" | "crossTime";

/**
 * A defined ritual as an item holds it, split the way p. 39 splits it.
 *
 * The `definition` is what makes it this ritual and not another: its effects,
 * which of Area of Effect, Healing, Meta-Magic and Speed it uses, and what its
 * affliction, bonus and damage are. Change any of that and Ritual Mastery or a
 * grimoire no longer applies. The `casting` is what "can be varied freely" or
 * "changed on the fly": how much, how far, how long.
 */
export interface RitualRecord {
  effects: readonly RitualEffectEntry[];
  definition: {
    afflictionPercent: number;
    area: boolean;
    healing: boolean;
    metaMagic: boolean;
    speed: boolean;
    bonusScope: RitualBonusScope | "";
    damage: boolean;
    damageKind: RitualDamageKind;
    damageDelivery: RitualDelivery;
  };
  casting: {
    areaRadius: number;
    excludedSubjects: number;
    traitsAdded: number;
    traitsRemoved: number;
    bonusAmount: number;
    damageDice: string;
    healingDice: string;
    metaMagic: number;
    speedYards: number;
    durationStep: number;
    extraMonths: number;
    years: number;
    extraEnergy: number;
    rangeYards: number;
    rangeKind: RitualRangeKind;
    dimensions: number;
    subjectWeight: number;
    trappingsPercent: number;
  };
}

/** The modifiers a ritual item prices: only those its definition says it uses. */
export function modifiersOfRitual(ritual: Pick<RitualRecord, "definition" | "casting">): RitualModifiers {
  const d = ritual.definition;
  const c = ritual.casting;
  const range = Number(c.rangeYards) || 0;
  return {
    afflictionPercent: d.afflictionPercent,
    traitsAdded: c.traitsAdded,
    traitsRemoved: c.traitsRemoved,
    ...(d.area ? { areaRadius: c.areaRadius, excludedSubjects: c.excludedSubjects } : {}),
    ...(d.bonusScope ? { bonusScope: d.bonusScope, bonusAmount: c.bonusAmount } : {}),
    ...(d.damage ? { damageDice: c.damageDice, damageKind: d.damageKind, damageDelivery: d.damageDelivery } : {}),
    ...(d.healing ? { healingDice: c.healingDice } : {}),
    ...(d.metaMagic ? { metaMagic: c.metaMagic } : {}),
    ...(d.speed ? { speedYards: c.speedYards } : {}),
    durationStep: c.durationStep,
    extraMonths: c.extraMonths,
    years: c.years,
    extraEnergy: c.extraEnergy,
    ...(c.rangeKind === "information" ? { informationRangeYards: range }
      : c.rangeKind === "crossTime" ? { crossTimeDays: range }
      : { rangeYards: range }),
    dimensions: c.dimensions,
    subjectWeight: c.subjectWeight,
    trappingsPercent: c.trappingsPercent,
  };
}

/** A ritual's effects as the book names them: "Greater Sense Crossroads, Lesser Sense Mind". */
export function describeEffects(effects: readonly RitualEffectEntry[]): string {
  return effects
    .map((e) => `${e.greater ? "Greater" : "Lesser"} ${e.effect.charAt(0).toUpperCase()}${e.effect.slice(1)} ${e.path}`)
    .join(", ");
}
