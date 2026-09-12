/**
 * What the social traits do to a reaction roll (GURPS Basic Set: Characters
 * pp. 21-29, 41, 97, 155-156; Campaigns p. 494).
 *
 * The Reaction Table is rolled with modifiers on the dice, and most of those
 * modifiers are traits: "Appearance, Charisma, Reputation, Status, and so on
 * all affect reaction rolls." Until now the GM typed a number. This works out
 * what the sheet already says.
 *
 * Two kinds. An unconditional modifier applies to everyone who meets the
 * character -- Charisma, an Odious Personal Habit, an ugly face. A conditional
 * one applies to some of them: a Reputation only among those who have heard
 * it, Pitiable only from those who might feel pity. The unconditional ones are
 * added up; the conditional ones are offered, and the GM says which apply.
 */

/** One source of a reaction modifier, as the roll dialog lists it. */
export interface ReactionSource {
  /** The trait it comes from, as named on the sheet. */
  label: string;
  value: number;
  /**
   * Blank for a modifier that always applies. Otherwise a key naming who it
   * applies to, for the dialog to explain: "attracted", "knowing", "respectful",
   * "pitying", "stylish".
   */
  condition: "" | "attracted" | "knowing" | "respectful" | "pitying" | "stylish";
}

/** A trait as the sheet holds it, for reading the modifiers off. */
export interface SocialTrait {
  name: string;
  levels?: number;
  /** A flat reaction modifier typed on the trait itself, which is the GM's. */
  reactionModifier?: number;
}

/**
 * Appearance (p. 21), by level of the advantage: the reaction bonus from
 * everyone, and the larger one "from those attracted to your sex", which the
 * table offers as the difference.
 */
const APPEARANCE_ADVANTAGE: readonly { everyone: number; attracted: number }[] = [
  { everyone: 1, attracted: 1 }, // Attractive
  { everyone: 2, attracted: 4 }, // Beautiful
  { everyone: 2, attracted: 4 }, // Handsome
  { everyone: 2, attracted: 6 }, // Very Beautiful
  { everyone: 2, attracted: 6 }, // Very Handsome
  { everyone: 3, attracted: 8 }, // Transcendent
];

/** Appearance as a disadvantage (p. 21): Unattractive through Horrific. */
const APPEARANCE_DISADVANTAGE: readonly number[] = [-1, -2, -3, -4, -5];

function levelsOf(trait: SocialTrait): number {
  return Math.max(1, Math.floor(trait.levels ?? 0) || 1);
}

/**
 * The reaction modifiers a character's traits carry.
 *
 * Read by name, as the trait table is: a trait that is not one of these says
 * nothing here unless a modifier was typed onto it.
 */
export function reactionSources(traits: readonly SocialTrait[]): ReactionSource[] {
  const out: ReactionSource[] = [];

  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    const levels = levelsOf(trait);

    // The GM's own figure, whatever the trait is.
    const typed = Math.trunc(Number(trait.reactionModifier ?? 0)) || 0;
    if (typed !== 0) out.push({ label: trait.name, value: typed, condition: "" });

    if (key === "appearance") {
      const row = APPEARANCE_ADVANTAGE[Math.min(levels, APPEARANCE_ADVANTAGE.length) - 1]!;
      out.push({ label: trait.name, value: row.everyone, condition: "" });
      if (row.attracted > row.everyone) {
        out.push({ label: trait.name, value: row.attracted - row.everyone, condition: "attracted" });
      }
    } else if (key === "appearance (disadvantage)") {
      const value = APPEARANCE_DISADVANTAGE[Math.min(levels, APPEARANCE_DISADVANTAGE.length) - 1]!;
      out.push({ label: trait.name, value, condition: "" });
    } else if (key === "charisma") {
      // "+1 to reaction rolls per level" (p. 41).
      out.push({ label: trait.name, value: levels, condition: "" });
    } else if (key === "voice") {
      // "+2 on any reaction roll made by someone who can hear your voice" (p. 97).
      out.push({ label: trait.name, value: 2, condition: "" });
    } else if (key === "reputation") {
      // "+1 per level ... from those who recognize you" (p. 26).
      out.push({ label: trait.name, value: levels, condition: "knowing" });
    } else if (key === "reputation (disadvantage)") {
      out.push({ label: trait.name, value: -levels, condition: "knowing" });
    } else if (key === "status") {
      // "+1 reaction from those who respect your Status" a level (p. 28).
      out.push({ label: trait.name, value: levels, condition: "respectful" });
    } else if (key === "status (disadvantage)") {
      out.push({ label: trait.name, value: -levels, condition: "respectful" });
    } else if (key.startsWith("social stigma")) {
      // "-1 on reaction rolls per -5 points" (p. 155), and the compendium
      // prices the named ones as flat traits: a level a -5.
      const points = flatStigmaLevels(key) ?? levels;
      out.push({ label: trait.name, value: -points, condition: "" });
    } else if (key === "odious personal habit") {
      // "-1 to reactions per -5 points" (p. 22).
      out.push({ label: trait.name, value: -levels, condition: "" });
    } else if (key === "pitiable") {
      // "+3 on reaction rolls from anyone who might conceivably feel pity" (p. 22).
      out.push({ label: trait.name, value: 3, condition: "pitying" });
    } else if (key === "fashion sense") {
      // "+1 to reactions ... in any situation where clothing might matter" (p. 21).
      out.push({ label: trait.name, value: 1, condition: "stylish" });
    }
  }

  return out;
}

/** How many -5s a named Social Stigma is worth (p. 155). */
function flatStigmaLevels(key: string): number | null {
  const named: Record<string, number> = {
    "social stigma (criminal record)": 1,
    "social stigma (disowned)": 1,
    "social stigma (publically disowned)": 2,
    "social stigma (excommunicated)": 1,
    "social stigma (ignorant)": 1,
    "social stigma (minor)": 1,
    "social stigma (minority group)": 2,
    "social stigma (monster)": 3,
    "social stigma (second-class citizen)": 1,
    "social stigma (subjugated)": 4,
    "social stigma (uneducated)": 1,
    "social stigma (valuable property)": 2,
  };
  return key in named ? named[key]! : null;
}

/** Whether a trait is one this module reads a reaction modifier off. */
export function isSocialTrait(name: string): boolean {
  const key = name.trim().toLowerCase();
  return (
    key === "appearance" ||
    key === "appearance (disadvantage)" ||
    key === "charisma" ||
    key === "voice" ||
    key === "reputation" ||
    key === "reputation (disadvantage)" ||
    key === "status" ||
    key === "status (disadvantage)" ||
    key.startsWith("social stigma") ||
    key === "odious personal habit" ||
    key === "pitiable" ||
    key === "fashion sense"
  );
}

/** What always applies, added up. */
export function unconditionalReaction(sources: readonly ReactionSource[]): number {
  return sources.filter((s) => s.condition === "").reduce((sum, s) => sum + s.value, 0);
}

/** Charisma's other half: "+1 per level to Influence rolls" (p. 41). */
export function charismaInfluenceBonus(traits: readonly SocialTrait[]): number {
  return traits
    .filter((t) => t.name.trim().toLowerCase() === "charisma")
    .reduce((sum, t) => sum + levelsOf(t), 0);
}
