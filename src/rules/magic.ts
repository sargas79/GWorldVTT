/**
 * Learning spells (GURPS Basic Set: Characters pp. 235, 242).
 *
 * A spell is a skill: IQ/Hard or IQ/Very Hard, bought on the Skill Cost Table,
 * with no default. "Add your Magery to IQ when you learn spells" -- so a mage
 * with IQ 12 and Magery 3 learns every spell off 15.
 *
 * The book also describes a second way of learning the same spells (p. 242,
 * "Ritual Magic"): one core skill, an IQ/Very Hard "college skill" per college
 * that defaults to the core at -6, and each spell as a Hard technique off its
 * college skill, defaulting at -1 per prerequisite the spell would have had.
 * The same spell record serves both. Which arithmetic reads its points is the
 * character's magic style, which follows from which kind of Magery they have.
 *
 * Casting is another chapter's worth of rules and lives elsewhere; this is
 * only what it takes to have a spell on the sheet at a level.
 */

import {
  effectiveSkillLevel,
  nextSkillPoints,
  nextTechniquePoints,
  normalizeSkillName,
  previousSkillPoints,
  previousTechniquePoints,
  relativeLevelForPoints,
  resolveTechnique,
  techniqueLevelsForPoints,
} from "./skills.js";
import type { SkillAttribute } from "./types.js";

/** Spells are Hard or Very Hard, and nothing else (p. 235). */
export type SpellDifficulty = "H" | "VH";

/**
 * The classes a spell can fall into (pp. 239-241). "Each spell falls into one
 * or more classes ... These classes are not mutually exclusive", which is why
 * a spell carries a list of them: Sense Foes is both Information and Area.
 */
export const SPELL_CLASSES = [
  "regular",
  "area",
  "melee",
  "missile",
  "blocking",
  "information",
  "enchantment",
  "special",
] as const;

export type SpellClass = (typeof SPELL_CLASSES)[number];

/** How a character's spells are bought and rolled. */
export type MagicStyle = "standard" | "ritual";

/**
 * What the sheet has chosen, where "auto" follows the character's traits:
 * Ritual Magery without ordinary Magery means the ritual style, and anything
 * else means the standard one.
 */
export type MagicStylePreference = "auto" | MagicStyle;

/** What a character's traits say about their magic. */
export interface MagicTalent {
  /** Magery level, or null for somebody with no Magery at all. Magery 0 is 0. */
  magery: number | null;
  /** Ritual Magery, the separate advantage the ritual style uses (p. 242). */
  ritualMagery: number | null;
}

/**
 * The style a character actually uses.
 *
 * "If standard and ritual magic coexist, normal Magery and Ritual Magery are
 * separate advantages" -- so a character with only the ritual kind is a
 * ritual mage, and one with both, or neither, is read the standard way unless
 * the sheet says otherwise.
 */
export function magicStyleFor(preference: MagicStylePreference, talent: MagicTalent): MagicStyle {
  if (preference === "standard" || preference === "ritual") return preference;
  return talent.ritualMagery !== null && talent.magery === null ? "ritual" : "standard";
}

/**
 * The Magery that adds to a spell under a style: ordinary Magery for the
 * standard style, Ritual Magery for the ritual one ("Magery adds to core
 * skill, college skills, and spells", p. 242). Nothing for a character who has
 * none, which is not the same as Magery 0.
 */
export function mageryForStyle(style: MagicStyle, talent: MagicTalent): number | null {
  return style === "ritual" ? talent.ritualMagery : talent.magery;
}

/**
 * A spell's level under the standard system: IQ plus Magery, plus what the
 * points bought. Null when no points are spent, because "Spells have no
 * default -- you can only cast spells you know."
 *
 * Somebody without Magery can still write a spell down and put points in it;
 * the level is worked out at Magery 0 and the sheet says why it cannot be
 * cast. Whether the world lets a non-mage cast at all is the mana level's
 * business (p. 235), which is a casting question rather than a learning one.
 */
export function spellLevel(options: {
  iq: number;
  magery: number | null;
  points: number;
  difficulty: SpellDifficulty;
  bonus?: number;
}): number | null {
  const resolved = effectiveSkillLevel({
    attributeScore: options.iq + (options.magery ?? 0),
    difficulty: options.difficulty,
    points: options.points,
    bonus: options.bonus ?? 0,
  });
  return resolved?.level ?? null;
}

/** What a ritual spell resolves to. */
export interface RitualSpellLevel {
  level: number;
  /** Levels of the technique actually applied, after the cap. */
  levels: number;
  /** True when the points bought more than the college skill allows. */
  cappedByCollege: boolean;
}

/**
 * A spell's level under Ritual Magic (p. 242): a Hard technique defaulting to
 * the college skill at -1 per prerequisite, never above the college skill.
 * "Ritual mages can cast spells at default!" -- so there is a level even with
 * no points at all, which is the opposite of the standard rule.
 */
export function ritualSpellLevel(options: {
  collegeLevel: number;
  prerequisiteCount: number;
  points: number;
  bonus?: number;
}): RitualSpellLevel {
  const resolved = resolveTechnique({
    prerequisiteLevel: options.collegeLevel,
    defaultModifier: -Math.max(0, Math.floor(options.prerequisiteCount)),
    levels: techniqueLevelsForPoints(options.points, "H"),
    maxRelativeToPrerequisite: 0,
  });
  return {
    level: resolved.level + (options.bonus ?? 0),
    levels: resolved.levels,
    cappedByCollege: resolved.cappedByPrerequisite,
  };
}

/**
 * The names a college's skill goes by. GCA writes "Path of Fire"; the book
 * says "college skill" and calls it a "path" in the same breath, so "Fire
 * College" is accepted as well.
 */
export function collegeSkillNames(college: string): string[] {
  const name = college.trim();
  return name ? [`Path of ${name}`, `${name} College`] : [];
}

/** Whether a skill by this name is one of the ritual style's college skills. */
export function isCollegeSkill(skillName: string): boolean {
  const name = normalizeSkillName(skillName);
  return name.startsWith("path of ") || name.endsWith(" college");
}

/** The core skills the ritual style is built on (p. 242). */
const CORE_SKILLS = new Set(["ritual magic", "thaumatology"]);

/**
 * What Magery adds to a skill that is not a spell.
 *
 * Standard Magery adds "to IQ when you learn Thaumatology skill" (p. 66).
 * Ritual Magery "adds to core skill, college skills, and spells" (p. 242), so
 * it goes on Ritual Magic, Thaumatology and every college skill.
 */
export function magicSkillBonus(skillName: string, talent: MagicTalent): number {
  const name = normalizeSkillName(skillName);
  let bonus = 0;
  if (name === "thaumatology" && talent.magery !== null) bonus += talent.magery;
  if (talent.ritualMagery !== null && (CORE_SKILLS.has(name) || isCollegeSkill(name))) {
    bonus += talent.ritualMagery;
  }
  return bonus;
}

/**
 * The next point total that buys something for a spell. A standard spell walks
 * the Skill Cost Table at its difficulty; a ritual one is a technique and
 * steps a point at a time.
 */
export function nextSpellPoints(points: number, difficulty: SpellDifficulty, style: MagicStyle): number {
  return style === "ritual" ? nextTechniquePoints(points) : nextSkillPoints(points, difficulty);
}

/** The previous point total for a spell, or zero. */
export function previousSpellPoints(points: number, difficulty: SpellDifficulty, style: MagicStyle): number {
  return style === "ritual" ? previousTechniquePoints(points) : previousSkillPoints(points, difficulty);
}

/** The relative level a spell's points bought, for the sheet's column. */
export function spellRelativeLevel(points: number, difficulty: SpellDifficulty): number | null {
  return relativeLevelForPoints(points, difficulty);
}

// ── prerequisites ────────────────────────────────────────────────────────────

/**
 * One requirement for learning a spell (p. 235): another spell, a Magery
 * level, an attribute score, an advantage, a skill, or a count of spells --
 * of one college, of any college, or one from each of several colleges.
 */
export type Prerequisite =
  | { kind: "spell"; name: string }
  | { kind: "magery"; level: number }
  | { kind: "attribute"; attribute: SkillAttribute; minimum: number }
  | { kind: "trait"; name: string }
  | { kind: "skill"; name: string }
  | { kind: "college"; college: string; count: number }
  | { kind: "spells"; count: number }
  | { kind: "colleges"; count: number };

/**
 * A clause is met when any of its alternatives is; the list is met when every
 * clause is. "Truthsayer or Borrow Language" is one clause with two
 * alternatives, and "Magery 1, Create Fire, Shape Fire" is three clauses.
 */
export type PrerequisiteClause = Prerequisite[];

const ATTRIBUTE_NAMES = new Map<string, SkillAttribute>([
  ["st", "ST"], ["dx", "DX"], ["iq", "IQ"], ["ht", "HT"], ["will", "Will"], ["per", "Per"],
]);

/**
 * Reads one requirement as the book writes it. A name on its own is a spell;
 * anything else is marked -- "Empathy (advantage)", "Locksmith (skill)" --
 * because a spell called Locksmith is not impossible and guessing would be
 * worse than asking.
 */
export function parsePrerequisite(text: string): Prerequisite {
  const t = text.trim().replace(/\s+/g, " ");

  const magery = /^(?:ritual )?magery (\d+)\+?$/i.exec(t);
  if (magery) return { kind: "magery", level: Number(magery[1]) };

  const attribute = /^(st|dx|iq|ht|will|per) (\d+)\+?$/i.exec(t);
  if (attribute) {
    return {
      kind: "attribute",
      attribute: ATTRIBUTE_NAMES.get(attribute[1]!.toLowerCase())!,
      minimum: Number(attribute[2]),
    };
  }

  const colleges = /^(?:(?:one|1) spell from each of |spells from )(\d+) colleges$/i.exec(t);
  if (colleges) return { kind: "colleges", count: Number(colleges[1]) };

  const anySpells = /^(\d+) spells$/i.exec(t);
  if (anySpells) return { kind: "spells", count: Number(anySpells[1]) };

  const college = /^(\d+) (.+?) spells?$/i.exec(t);
  if (college) return { kind: "college", college: college[2]!.trim(), count: Number(college[1]) };

  const marked = /^(.+?) \((advantage|trait|perk|skill)\)$/i.exec(t);
  if (marked) {
    const kind = marked[2]!.toLowerCase() === "skill" ? "skill" : "trait";
    return { kind, name: marked[1]!.trim() };
  }

  return { kind: "spell", name: t };
}

/**
 * Reads a whole prerequisite line: clauses separated by commas, alternatives
 * within a clause by "or". An empty line has no requirements.
 */
export function parsePrerequisites(text: string): PrerequisiteClause[] {
  return text
    .split(",")
    .map((clause) => clause.trim())
    .filter(Boolean)
    .map((clause) =>
      clause
        .split(/\s+or\s+/i)
        .map((alternative) => alternative.trim())
        .filter(Boolean)
        .map(parsePrerequisite),
    )
    .filter((clause) => clause.length > 0);
}

/** A requirement written back the way the grammar reads it. */
export function describePrerequisite(prerequisite: Prerequisite): string {
  switch (prerequisite.kind) {
    case "spell":
      return prerequisite.name;
    case "magery":
      return `Magery ${prerequisite.level}`;
    case "attribute":
      return `${prerequisite.attribute} ${prerequisite.minimum}`;
    case "trait":
      return `${prerequisite.name} (advantage)`;
    case "skill":
      return `${prerequisite.name} (skill)`;
    case "college":
      return `${prerequisite.count} ${prerequisite.college} spells`;
    case "spells":
      return `${prerequisite.count} spells`;
    case "colleges":
      return `spells from ${prerequisite.count} colleges`;
  }
}

/** A prerequisite line written back from its clauses. */
export function describePrerequisites(clauses: readonly PrerequisiteClause[]): string {
  return clauses.map((clause) => clause.map(describePrerequisite).join(" or ")).join(", ");
}

/** A spell as the prerequisite check sees it. */
export interface KnownSpell {
  name: string;
  colleges: readonly string[];
  /** Points spent. "You must have at least one point in the prerequisite spell." */
  points: number;
}

/** What a character has, for checking a spell's requirements against. */
export interface PrerequisiteContext {
  magery: number | null;
  attributes: Partial<Record<SkillAttribute, number>>;
  spells: readonly KnownSpell[];
  hasTrait: (name: string) => boolean;
  hasSkill: (name: string) => boolean;
}

function known(spells: readonly KnownSpell[]): KnownSpell[] {
  return spells.filter((spell) => spell.points >= 1);
}

function sameName(a: string, b: string): boolean {
  return normalizeSkillName(a) === normalizeSkillName(b);
}

/** Whether one requirement is met. */
export function prerequisiteMet(prerequisite: Prerequisite, context: PrerequisiteContext): boolean {
  const spells = known(context.spells);
  switch (prerequisite.kind) {
    case "spell":
      return spells.some((spell) => sameName(spell.name, prerequisite.name));
    case "magery":
      return context.magery !== null && context.magery >= prerequisite.level;
    case "attribute":
      return (context.attributes[prerequisite.attribute] ?? 0) >= prerequisite.minimum;
    case "trait":
      return context.hasTrait(prerequisite.name);
    case "skill":
      return context.hasSkill(prerequisite.name);
    case "college":
      return (
        spells.filter((spell) => spell.colleges.some((c) => sameName(c, prerequisite.college))).length >=
        prerequisite.count
      );
    case "spells":
      return spells.length >= prerequisite.count;
    case "colleges": {
      // "Some spells fall into more than one college ... This is only
      // important when counting prerequisites" -- a spell of two colleges
      // counts for both.
      const colleges = new Set(
        spells.flatMap((spell) => spell.colleges.map((c) => normalizeSkillName(c))),
      );
      return colleges.size >= prerequisite.count;
    }
  }
}

/** What a check came to: whether every clause is met, and the ones that are not. */
export interface PrerequisiteCheck {
  met: boolean;
  /** Each unmet clause, as the book would write it. */
  missing: string[];
}

/** Checks every clause, naming the ones the character does not satisfy. */
export function checkPrerequisites(
  clauses: readonly PrerequisiteClause[],
  context: PrerequisiteContext,
): PrerequisiteCheck {
  const missing = clauses
    .filter((clause) => !clause.some((alternative) => prerequisiteMet(alternative, context)))
    .map((clause) => clause.map(describePrerequisite).join(" or "));
  return { met: missing.length === 0, missing };
}
