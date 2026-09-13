/**
 * Tricks of the trade for Ritual Path Magic (GURPS Monster Hunters 1:
 * Champions pp. 25, 37-39, 56-57): what makes one ritual the same as another,
 * the bonuses that attach to a specific ritual, casting together, and casting
 * as a defense.
 */

import type { Comprehension } from "./languages.js";
import type { RitualEffectEntry, RitualRecord } from "./ritual-cost.js";

/**
 * What makes a ritual this ritual and not another (p. 39): its effects, which
 * of Area of Effect, Healing, Meta-Magic or Speed it uses, and what its
 * affliction, altered traits, bonus and damage are. "Don't bother listing
 * Duration, Extra Energy, Range, Subject Weight, or Traditional Trappings".
 *
 * Returned as a string two rituals share exactly when they are the same
 * ritual, so Ritual Mastery and a grimoire can remember the one they were
 * for. Effects are sorted: the order they were written in changes nothing.
 */
export function ritualIdentity(ritual: {
  effects: readonly RitualEffectEntry[];
  definition: RitualRecord["definition"] & { affliction?: string; traits?: string; bonusRolls?: string; damageType?: string };
}): string {
  const d = ritual.definition;
  const norm = (text: string | undefined) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const effects = ritual.effects
    .map((e) => `${e.greater ? "G" : "L"}:${e.effect}:${e.path}`)
    .sort()
    .join("+");
  const uses = (["area", "healing", "metaMagic", "speed"] as const).filter((key) => d[key]).join(",");
  const parts = [
    effects,
    uses,
    d.afflictionPercent || norm(d.affliction) ? `aff:${norm(d.affliction)}:${d.afflictionPercent}` : "",
    norm(d.traits) ? `traits:${norm(d.traits)}` : "",
    d.bonusScope ? `bonus:${d.bonusScope}:${norm(d.bonusRolls)}` : "",
    d.damage ? `dmg:${d.damageType ?? ""}:${d.damageKind}:${d.damageDelivery}` : "",
  ];
  return parts.join("|");
}

/** "You have +2 to all Path skill rolls when casting a specific ritual" (p. 25). */
export const RITUAL_MASTERY_BONUS = 2;

/** The ritual a Ritual Mastery trait is specialized in, or null for any other trait. */
export function masteredRitual(traitName: string): string | null {
  const match = /^\s*Ritual Mastery\s*\((.+)\)\s*$/i.exec(traitName);
  return match ? match[1]!.trim() : null;
}

/**
 * Ritual Mastery's bonus to one ritual. The trait names the ritual, and the
 * ritual remembers the definition it was mastered as: change the definition
 * and "you would forfeit his +2 bonus, as that would be considered a
 * different ritual" (p. 39).
 */
export function ritualMasteryBonus(options: {
  traitNames: readonly string[];
  ritualName: string;
  masteredAs: string;
  identity: string;
}): number {
  const name = options.ritualName.trim().toLowerCase();
  const held = options.traitNames.some((t) => masteredRitual(t)?.toLowerCase() === name);
  return held && options.masteredAs !== "" && options.masteredAs === options.identity ? RITUAL_MASTERY_BONUS : 0;
}

/**
 * A grimoire's bonus as it reaches the roll (p. 39), for a reader whose
 * comprehension of its dead language is the lower of spoken and written. A
 * dead-language book gives "full bonus for Native comprehension, reduce it by 1 for Accented, or
 * halve it (round up) for Broken", and nothing to someone who cannot read it
 * and has no translation. An encrypted book gives nothing until decoded.
 */
export function grimoireBonus(options: {
  bonus: number;
  deadLanguage: boolean;
  comprehension: Comprehension;
  encrypted: boolean;
  decoded: boolean;
}): number {
  const bonus = Math.max(0, Math.floor(options.bonus));
  if (options.encrypted && !options.decoded) return 0;
  if (!options.deadLanguage) return bonus;
  switch (options.comprehension) {
    case "native": return bonus;
    case "accented": return Math.max(0, bonus - 1);
    case "broken": return Math.ceil(bonus / 2);
    default: return 0;
  }
}

/** The Grimoire Table (p. 57): price and weight by bonus. */
export const GRIMOIRE_TABLE: ReadonlyArray<{ bonus: number; cost: number; weight: number }> = [
  { bonus: 2, cost: 100, weight: 2 },
  { bonus: 3, cost: 250, weight: 2.5 },
  { bonus: 4, cost: 600, weight: 3 },
  { bonus: 5, cost: 1500, weight: 3.5 },
  { bonus: 6, cost: 3500, weight: 4 },
  { bonus: 7, cost: 7500, weight: 5 },
  { bonus: 8, cost: 20000, weight: 6 },
  { bonus: 9, cost: 50000, weight: 8 },
  { bonus: 10, cost: 100000, weight: 10 },
];

/**
 * A grimoire's price and weight (p. 57). Dead-Language and Encrypted are each
 * "-0.2 CF", cost factors applied as a gadget's are: the price times one plus
 * the factors. Null for a bonus the table has no line for.
 */
export function grimoirePrice(options: { bonus: number; deadLanguage?: boolean; encrypted?: boolean }): { cost: number; weight: number } | null {
  const line = GRIMOIRE_TABLE.find((l) => l.bonus === Math.floor(options.bonus));
  if (!line) return null;
  const cf = (options.deadLanguage ? -0.2 : 0) + (options.encrypted ? -0.2 : 0);
  return { cost: Math.round(line.cost * (1 + cf)), weight: line.weight };
}

/**
 * A collection's weight (p. 57): "Take the weight listed for the best bonus,
 * then add 1/5 of the total weight for every other ritual." The book's
 * three-ritual collection at +4, +3 and +2 weighs 3 + 4.5/5 = 3.9 lbs.
 */
export function collectionWeight(bonuses: readonly number[]): number {
  const weights = bonuses
    .map((b) => GRIMOIRE_TABLE.find((l) => l.bonus === Math.floor(b))?.weight ?? 0)
    .sort((a, b) => b - a);
  if (!weights.length) return 0;
  const others = weights.slice(1).reduce((sum, w) => sum + w, 0);
  return Math.round((weights[0]! + others / 5) * 100) / 100;
}

/** "All rolls involved with the ritual are at -1 for every caster past the first" (p. 39). */
export function workingTogetherPenalty(casters: number): number {
  return casters > 1 ? 1 - casters : 0;
}

/**
 * The caster who makes the final roll: "The caster with the highest skill
 * always makes the final roll" (p. 39). The index of the highest; the first
 * of equals.
 */
export function finalCaster(skills: readonly number[]): number {
  let best = -1;
  skills.forEach((skill, index) => {
    if (best < 0 || skill > skills[best]!) best = index;
  });
  return best;
}

/**
 * A blocking ritual's rolls (p. 37): "Ambient energy can be gathered
 * instantly at -10 to skill ... An energy source may be tapped instantly; this
 * requires a skill roll at -5." (A non-adept's own -5 for casting quickly is
 * among the non-adept penalties.)
 */
export const BLOCKING_GATHER_PENALTY = -10;
export const BLOCKING_TAP_PENALTY = -5;
