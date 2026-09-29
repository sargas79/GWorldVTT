/**
 * The perks the Revised edition adds (GURPS Basic Set Revised, Addendum 1,
 * pp. 328-329), the ones that change a number.
 *
 * A perk that names something -- a skill, a weapon, a kit -- is taken with a
 * specialty, and every rule here is read from those specialties. Perks that
 * say nothing a roll can use (Controllable Disadvantage apart) are records
 * only.
 */

import { normalizeSkillName } from "./skills.js";

/** A perk as the sheet holds it. */
export interface HeldPerk {
  name: string;
  levels?: number;
  /** What it was taken for: a skill, a weapon, a task. Blank where it needs none. */
  specialty?: string;
}

/** What a character's perks come to. */
export interface Perks {
  /** Dabbler: the bonus to the attribute default of each skill chosen, by normalised skill name. */
  dabbler: Record<string, number>;
  /** Dabbler choices spent, of the eight it allows. */
  dabblerSpent: number;
  /** Cutting-Edge Training: TLs above personal, by normalised skill name (without its /TL). */
  cuttingEdge: Record<string, number>;
  /** Off-Hand Training: the skills the off-hand -4 is waived for. */
  offHand: string[];
  /** Improvised Weapons: the combat skills whose improvised-weapon penalty is waived. */
  improvised: string[];
  /** Weapon Bond and Equipment Bond: the items (by name) that are +1. */
  bonds: string[];
  /** Alternative Feints: the non-combat skills that may Feint. */
  feintSkills: string[];
  /** Strongbow. */
  strongbow: boolean;
  /** Classic Features: the looks they are. */
  classicFeatures: string[];
  /** Permits held, one for each piece of gear. */
  permits: string[];
  /** No Nuisance Rolls: the tasks exempted. */
  noNuisance: string[];
  /** Special Exercises: levels beyond a human maximum, a level a perk. */
  specialExercises: number;
  /** Controllable Disadvantage: the disadvantages that may be inflicted on oneself. */
  controllable: string[];
  /** The Influence Shticks held, and the skill each lets body language carry. */
  shticks: string[];
}

/** The eight skills Dabbler covers, at one choice for +1, two for +2, four for +3. */
export const DABBLER_CHOICES = 8;
const DABBLER_COST: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4 };

/** Each Influence Shtick and the skill it stands in for (Revised p. 328). */
export const INFLUENCE_SHTICKS: Readonly<Record<string, string>> = {
  "convincing nod": "Fast-Talk",
  "disarming smile": "Diplomacy",
  "fearsome stare": "Intimidation",
  "gangster swagger": "Streetwise",
  "haughty sneer": "Savoir-Faire (High Society)",
  "sexy pose": "Sex Appeal",
};

/** Five Cutting-Edge Training perks may be exchanged for High TL 1 (p. 328). */
export const CUTTING_EDGE_FOR_HIGH_TL = 5;
/** Five Off-Hand Training perks may be exchanged for Ambidexterity (p. 329). */
export const OFF_HAND_FOR_AMBIDEXTERITY = 5;

/** The name of the technique this perk completely replaces (p. 329). */
export const OFF_HAND_TECHNIQUE_SUPERSEDED = "Off-Hand Weapon Training";

function key(name: string): string {
  return normalizeSkillName(name).toLowerCase();
}

function baseKey(name: string): string {
  return key(name).replace(/\s*\(.*\)\s*$/, "");
}

/** Whether a skill is the one a perk names: exactly, or the perk names its family. */
export function skillMatches(perkSkill: string, skill: string): boolean {
  const wanted = key(perkSkill);
  if (!wanted) return false;
  const have = key(skill);
  return have === wanted || baseKey(skill) === wanted || baseKey(perkSkill) === have;
}

/** A specialty split into its entries: commas or semicolons, one skill each. */
function entries(specialty: string): string[] {
  return specialty.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Dabbler's choices, from the specialty written as "Biology, Chemistry,
 * Physics +2, Mathematics (Applied) +3". A bare name is default+1; two
 * choices buy default+2 and four buy default+3 (p. 328). Only as many are
 * read as the eight choices pay for.
 */
export function dabblerChoices(specialty: string): { bonuses: Record<string, number>; spent: number } {
  const bonuses: Record<string, number> = {};
  let spent = 0;
  for (const entry of entries(specialty)) {
    const match = /^(.*?)\s*\+\s*([123])$/.exec(entry);
    const bonus = match ? Number(match[2]) : 1;
    const skill = key(match ? match[1]! : entry);
    if (!skill) continue;
    const cost = DABBLER_COST[bonus]!;
    if (spent + cost > DABBLER_CHOICES) break;
    spent += cost;
    bonuses[skill] = Math.max(bonuses[skill] ?? 0, bonus);
  }
  return { bonuses, spent };
}

/**
 * What Dabbler adds to a skill's default: its bonus, but never past the level
 * that a point in the skill would buy (p. 328: "you can't raise it to the
 * level that points in the skill would buy"). Nothing for a skill that has
 * points, since it is then studied.
 */
export function dabblerGain(options: {
  bonus: number;
  /** The level at the attribute default now. */
  level: number;
  /** The level one point buys: the attribute plus the difficulty's offset. */
  onePointLevel: number;
}): number {
  const room = options.onePointLevel - options.level;
  return Math.max(0, Math.min(Math.floor(options.bonus), room));
}

/** The bonus Dabbler gives a named skill, or 0. */
export function dabblerBonusFor(perks: Pick<Perks, "dabbler">, skill: string): number {
  const exact = perks.dabbler[key(skill)];
  if (exact !== undefined) return exact;
  return perks.dabbler[baseKey(skill)] ?? 0;
}

/**
 * The tech level a technological skill is used at, with Cutting-Edge
 * Training: a level above the personal one for each level of the perk, in
 * the one skill it names (p. 328).
 */
export function cuttingEdgeTechLevel(personal: number, levels: number): number {
  return Math.max(0, Math.floor(personal)) + Math.max(0, Math.floor(levels));
}

/** The Cutting-Edge levels held for a skill, matching its name without the /TL it carries. */
export function cuttingEdgeFor(perks: Pick<Perks, "cuttingEdge">, skill: string): number {
  return perks.cuttingEdge[key(skill)] ?? perks.cuttingEdge[baseKey(skill)] ?? 0;
}

/** Whether five Cutting-Edge Training perks may be traded for High TL 1. */
export function mayTradeForHighTl(cuttingEdgePerks: number): boolean {
  return cuttingEdgePerks >= CUTTING_EDGE_FOR_HIGH_TL;
}

/** Whether five Off-Hand Training perks may be traded for Ambidexterity. */
export function mayTradeForAmbidexterity(offHandPerks: number): boolean {
  return offHandPerks >= OFF_HAND_FOR_AMBIDEXTERITY;
}

/** Whether Off-Hand Training covers a skill, and so its defenses and techniques. */
export function offHandWaived(perks: Pick<Perks, "offHand">, skill: string): boolean {
  return perks.offHand.some((s) => skillMatches(s, skill));
}

/** Whether Improvised Weapons waives the improvised-weapon penalty for a skill. */
export function improvisedWaived(perks: Pick<Perks, "improvised">, skill: string): boolean {
  return perks.improvised.some((s) => skillMatches(s, skill));
}

/** The +1 of a Weapon Bond or Equipment Bond, for an item by name, which does not stack across bonds to one item. */
export function bondBonus(perks: Pick<Perks, "bonds">, itemName: string): number {
  const item = itemName.trim().toLowerCase();
  if (!item) return 0;
  return perks.bonds.some((b) => b.trim().toLowerCase() === item) ? 1 : 0;
}

/**
 * The ST Strongbow lets a bow ask beyond your own without penalty: +1 with
 * Bow at DX+1, +2 at DX+2 or better (p. 329). `relative` is the Bow level
 * less DX.
 */
export function strongbowAllowance(relative: number): number {
  if (relative >= 2) return 2;
  if (relative >= 1) return 1;
  return 0;
}

/** Whether a weapon skill is Bow, for Strongbow. */
export function isBowSkill(skill: string): boolean {
  return baseKey(skill) === "bow";
}

/**
 * The minimum ST to be held against, once Strongbow has been counted: a bow
 * stronger than you by up to the allowance is drawn unpenalised.
 */
export function strongbowMinSt(minSt: number | null, allowance: number): number | null {
  return minSt === null ? null : minSt - Math.max(0, allowance);
}

/** Alternative Feints: whether a skill may be used to Feint (p. 328). */
export function mayFeintWith(perks: Pick<Perks, "feintSkills">, skill: string): boolean {
  return perks.feintSkills.some((s) => skillMatches(s, skill));
}

/**
 * Classic Features: how much better an NPC who fancies the looks reacts, when
 * Appearance counts as one level higher (p. 328). `signed` is the Appearance
 * level: negative for the disadvantage (-1 Unattractive to -5 Horrific), zero
 * for Average, 1 to 6 for the advantage. `table` gives the reaction of each
 * level, which the social module owns.
 */
export function classicFeaturesGain(signed: number, reaction: (signed: number) => number): number {
  const level = Math.trunc(signed);
  return reaction(Math.min(6, level + 1)) - reaction(level);
}

/** Permit: gear whose LC is below the Control Rating needs one to carry legally (p. 329). */
export function needsPermit(lc: number | null, controlRating: number): boolean {
  return lc !== null && lc < controlRating;
}

/** How many of a list of gear the permits held cover: one permit, one piece of gear. */
export function permitsUncovered(gearLcs: ReadonlyArray<number | null>, controlRating: number, permits: number): number {
  const needed = gearLcs.filter((lc) => needsPermit(lc, controlRating)).length;
  return Math.max(0, needed - Math.max(0, Math.floor(permits)));
}

/** No Nuisance Rolls: the GM waives the rolls only where every score involved is 16+ (p. 329). */
export function nuisanceRollsWaived(scores: ReadonlyArray<number>): boolean {
  return scores.length > 0 && scores.every((s) => s >= 16);
}

/** Special Exercises: a human maximum raised a level a perk (p. 329). */
export function maximumWithSpecialExercises(maximum: number, perks: Pick<Perks, "specialExercises">): number {
  return maximum + Math.max(0, perks.specialExercises);
}

/**
 * Controllable Disadvantage: the number to roll to inflict it on yourself,
 * HT for a physical trait and Will for a mental one, at -1 for each attempt
 * beyond the first in the hour (p. 328).
 */
export function controllableTarget(options: { score: number; physical: boolean; attemptsThisHour: number }): number {
  return Math.floor(options.score) - Math.max(0, Math.floor(options.attemptsThisHour) - 1);
}

/** The Influence skill an Influence Shtick lets body language carry, or null for another perk. */
export function shtickSkill(perkName: string): string | null {
  return INFLUENCE_SHTICKS[perkName.trim().toLowerCase()] ?? null;
}

/** No perks at all. */
export function noPerks(): Perks {
  return {
    dabbler: {}, dabblerSpent: 0, cuttingEdge: {}, offHand: [], improvised: [], bonds: [], feintSkills: [],
    strongbow: false, classicFeatures: [], permits: [], noNuisance: [], specialExercises: 0, controllable: [],
    shticks: [],
  };
}

/** The specialty of a perk, from its own field or the parenthesis of its name: "Weapon Bond (Katana)". */
export function perkSpecialty(perk: HeldPerk): string {
  const own = (perk.specialty ?? "").trim();
  if (own) return own;
  const match = /\(([^()]*)\)\s*$/.exec(perk.name);
  return match ? match[1]!.trim() : "";
}

function perkKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/\s+\d+$/, "");
}

/** Reads the Revised perks off a character's traits. */
export function perksOf(traits: readonly HeldPerk[]): Perks {
  const out = noPerks();
  for (const trait of traits) {
    const name = perkKey(trait.name);
    const specialty = perkSpecialty(trait);
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    switch (name) {
      case "dabbler": {
        const { bonuses, spent } = dabblerChoices(specialty);
        for (const [skill, bonus] of Object.entries(bonuses)) out.dabbler[skill] = Math.max(out.dabbler[skill] ?? 0, bonus);
        out.dabblerSpent += spent;
        break;
      }
      case "cutting-edge training": {
        // "Piloting/TL8 (Aerospace)": the skill without its TL is what is matched.
        const skill = key(specialty);
        if (skill) out.cuttingEdge[skill] = (out.cuttingEdge[skill] ?? 0) + levels;
        break;
      }
      case "off-hand training": if (specialty) out.offHand.push(specialty); break;
      case "improvised weapons": if (specialty) out.improvised.push(specialty); break;
      case "weapon bond":
      case "equipment bond": if (specialty) out.bonds.push(specialty); break;
      case "alternative feints": if (specialty) out.feintSkills.push(specialty); break;
      case "strongbow": out.strongbow = true; break;
      case "classic features": out.classicFeatures.push(specialty); break;
      case "permit": out.permits.push(specialty); break;
      case "no nuisance rolls": out.noNuisance.push(specialty); break;
      case "special exercises": out.specialExercises += levels; break;
      case "controllable disadvantage": if (specialty) out.controllable.push(specialty); break;
      default:
        if (shtickSkill(name)) out.shticks.push(name);
    }
  }
  return out;
}
