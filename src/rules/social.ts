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
   * "pitying", "stylish", "impressed", "ownKind", "faithful", "adult".
   */
  condition:
    | ""
    | "attracted"
    | "knowing"
    | "respectful"
    | "pitying"
    | "stylish"
    | "impressed"
    | "ownKind"
    | "faithful"
    | "adult";
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
  { everyone: 1, attracted: 1 }, // Attractive: "+1 on reaction rolls"
  { everyone: 2, attracted: 4 }, // Beautiful: "+4 ... attracted to members of your sex, +2 from everyone else"
  { everyone: 2, attracted: 4 }, // Handsome
  { everyone: 2, attracted: 6 }, // Very Beautiful: "+6 ... +2 from others"
  { everyone: 2, attracted: 6 }, // Very Handsome
  { everyone: 2, attracted: 8 }, // Transcendent: "+8 (!) ... +2 from others"
];

/**
 * Appearance as a disadvantage (p. 21): Unattractive -1, Ugly -2, Hideous
 * -4, Monstrous -5, Horrific -6.
 */
const APPEARANCE_DISADVANTAGE: readonly number[] = [-1, -2, -4, -5, -6];

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
      // "-1 on reaction rolls per -5 points" for one written as levels, and
      // the book's own figure for each named one (p. 155).
      const named = namedStigma(key);
      if (named) {
        if (named.value !== 0) out.push({ label: trait.name, value: named.value, condition: named.condition });
      } else {
        out.push({ label: trait.name, value: -levels, condition: "" });
      }
    } else if (key === "odious personal habit") {
      // "-1 to reactions per -5 points" (p. 22).
      out.push({ label: trait.name, value: -levels, condition: "" });
    } else if (key === "pitiable") {
      // "+3 on reaction rolls from anyone who might conceivably feel pity" (p. 22).
      out.push({ label: trait.name, value: 3, condition: "pitying" });
    } else if (key === "fashion sense") {
      // "+1 to reactions ... in any situation where clothing might matter" (p. 21).
      out.push({ label: trait.name, value: 1, condition: "stylish" });
    } else if (key in TALENT_REACTION) {
      // "A bonus of +1 per level on all reaction rolls made by anyone in a
      // position to notice your Talent, if he would be impressed" (p. 89).
      out.push({ label: trait.name, value: levels, condition: "impressed" });
    }
  }

  // "Your total reaction modifier from reputations cannot be better than +4
  // or worse than -4 in a given situation" (p. 28).
  return capReputations(out);
}

/** The ten standard Talents, each worth its levels from those who notice (p. 89). */
const TALENT_REACTION: Readonly<Record<string, true>> = {
  "animal friend": true, artificer: true, "business acumen": true, "gifted artist": true,
  "green thumb": true, healer: true, "mathematical ability": true, "musical ability": true,
  outdoorsman: true, "smooth operator": true,
};

const REPUTATION_CAP = 4;

function capReputations(sources: ReactionSource[]): ReactionSource[] {
  const reputations = sources.filter((s) => s.label.trim().toLowerCase().startsWith("reputation"));
  const total = reputations.reduce((sum, s) => sum + s.value, 0);
  if (Math.abs(total) <= REPUTATION_CAP) return sources;
  const capped = Math.sign(total) * REPUTATION_CAP;
  // The first reputation carries the capped figure; the rest are dropped.
  const [first, ...rest] = reputations;
  return sources
    .filter((s) => !rest.includes(s))
    .map((s) => (s === first ? { ...s, value: capped } : s));
}

/**
 * What each named Social Stigma does to a reaction, as the book has it
 * (p. 155). Valuable Property is "limited freedom ... more than ... a
 * reaction modifier", and Subjugated is Second-Class Citizen's penalty.
 */
function namedStigma(key: string): { value: number; condition: ReactionSource["condition"] } | null {
  const named: Record<string, { value: number; condition: ReactionSource["condition"] }> = {
    "social stigma (criminal record)": { value: -1, condition: "knowing" },
    "social stigma (disowned)": { value: -1, condition: "" },
    "social stigma (publically disowned)": { value: -2, condition: "" },
    "social stigma (excommunicated)": { value: -3, condition: "faithful" },
    "social stigma (ignorant)": { value: -1, condition: "knowing" },
    "social stigma (minor)": { value: -2, condition: "adult" },
    "social stigma (minority group)": { value: -2, condition: "ownKind" },
    "social stigma (monster)": { value: -3, condition: "" },
    "social stigma (second-class citizen)": { value: -1, condition: "ownKind" },
    "social stigma (subjugated)": { value: -1, condition: "ownKind" },
    "social stigma (uneducated)": { value: -1, condition: "knowing" },
    "social stigma (valuable property)": { value: 0, condition: "" },
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
    key === "fashion sense" ||
    key in TALENT_REACTION
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
