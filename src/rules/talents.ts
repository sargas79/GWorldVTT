/**
 * Talents, and the other traits that are a bonus to a list of skills
 * (GURPS Basic Set: Characters pp. 41, 89-91, 97).
 *
 * A Talent is "+1 per level to every skill in a group", and the group is the
 * whole of the trait: Animal Friend is the six animal skills, Smooth Operator
 * the thirteen skills of talking people into things. The book prints the lists
 * with the traits, and they are reproduced here so that buying the trait puts
 * the bonus on the skills rather than leaving it to be typed into each one.
 *
 * Voice and Charisma are not Talents but work the same way for part of what
 * they do: Voice is "+2 to the following skills", Charisma "+1 per level to
 * Fortune-Telling, Leadership, Panhandling and Public Speaking".
 *
 * The rest of the Basic Set's traits that name the skills they add to --
 * Absolute Direction to Navigation, Empathy to Detect Lies, Appearance to Sex
 * Appeal, Shyness against the social skills -- are the second half of this
 * module, each a line of its own on the skill rather than folded into the
 * talent line, so the sheet can say which trait did what.
 */

import { normalizeSkillName } from "./skills.js";

/** The skills each talent covers, as the book lists them. */
export const TALENT_SKILLS: Readonly<Record<string, readonly string[]>> = {
  // p. 90
  "animal friend": ["Animal Handling", "Falconry", "Packing", "Riding", "Teamster", "Veterinary"],
  artificer: [
    "Armoury", "Carpentry", "Electrician", "Electronics Repair", "Engineer", "Machinist",
    "Masonry", "Mechanic", "Smith",
  ],
  "business acumen": [
    "Accounting", "Administration", "Economics", "Finance", "Gambling", "Market Analysis",
    "Merchant", "Propaganda",
  ],
  "gifted artist": ["Artist", "Jeweler", "Leatherworking", "Photography", "Sewing"],
  "green thumb": ["Biology", "Farming", "Gardening", "Herb Lore", "Naturalist"],
  healer: [
    "Diagnosis", "Esoteric Medicine", "First Aid", "Pharmacy", "Physician", "Physiology",
    "Psychology", "Surgery", "Veterinary",
  ],
  "mathematical ability": [
    "Accounting", "Astronomy", "Cryptography", "Engineer", "Finance", "Market Analysis",
    "Mathematics", "Physics",
  ],
  "musical ability": [
    "Group Performance (Conducting)", "Musical Composition", "Musical Influence",
    "Musical Instrument", "Singing",
  ],
  outdoorsman: ["Camouflage", "Fishing", "Mimicry", "Naturalist", "Navigation", "Survival", "Tracking"],
  "smooth operator": [
    "Acting", "Carousing", "Detect Lies", "Diplomacy", "Fast-Talk", "Intimidation", "Leadership",
    "Panhandling", "Politics", "Public Speaking", "Savoir-Faire", "Sex Appeal", "Streetwise",
  ],
};

/** Voice (p. 97): "+2 to the following skills", once, whatever the level. */
export const VOICE_SKILLS: readonly string[] = [
  "Diplomacy", "Fast-Talk", "Mimicry", "Performance", "Politics", "Public Speaking",
  "Sex Appeal", "Singing",
];
export const VOICE_BONUS = 2;

/** Charisma (p. 41): "+1 per level" to these four, over and above its reaction bonus. */
export const CHARISMA_SKILLS: readonly string[] = [
  "Fortune-Telling", "Leadership", "Panhandling", "Public Speaking",
];

/** A trait as the sheet holds it, for reading the bonuses off. */
export interface BonusTrait {
  name: string;
  levels?: number;
  /**
   * The skills this trait gives its level to, as its own compendium entry
   * states them. A Talent from a data file carries its own skill list, and is
   * known only this way. Empty for a trait that states none, which is read by
   * name from the Basic Set's lists instead.
   */
  talentSkills?: readonly string[];
}

/**
 * Skill bonuses from every talent held, keyed by the skill's normalized name.
 *
 * A skill that two talents both cover -- Accounting is in Business Acumen and
 * Mathematical Ability -- gets both: the book sets no ceiling on stacking
 * talents beyond the four levels each is capped at.
 *
 * Specialised skills match on their base name too: Musical Instrument
 * (Flute) is a Musical Instrument, and the talent lists the base.
 */
export function talentBonuses(traits: readonly BonusTrait[]): Map<string, number> {
  const bonuses = new Map<string, number>();
  const add = (skill: string, bonus: number) => {
    const key = normalizeSkillName(skill);
    bonuses.set(key, (bonuses.get(key) ?? 0) + bonus);
  };

  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);

    // The trait's own list first. A Basic Set Talent already on a character
    // from before the list was a field carries none, and is read by name.
    const own = (trait.talentSkills ?? []).filter((skill) => skill.trim());
    const listed = own.length ? own : TALENT_SKILLS[key];
    if (listed) {
      for (const skill of listed) add(skill, levels);
      continue;
    }
    if (key === "voice") {
      for (const skill of VOICE_SKILLS) add(skill, VOICE_BONUS);
    } else if (key === "charisma") {
      for (const skill of CHARISMA_SKILLS) add(skill, levels);
    }
  }
  return bonuses;
}

/**
 * What the talents add to one skill, by name.
 *
 * The specialty is tried first and then the base: "Musical Instrument
 * (Flute)" is looked up whole, and then as "Musical Instrument".
 */
export function talentBonusFor(skillName: string, bonuses: ReadonlyMap<string, number>): number {
  const whole = normalizeSkillName(skillName);
  if (bonuses.has(whole)) return bonuses.get(whole)!;
  const base = whole.replace(/\s*\(.*\)\s*$/, "");
  return base !== whole ? (bonuses.get(base) ?? 0) : 0;
}

/** One trait's bonus to one skill, labelled with the trait so the sheet can say so. */
export interface TraitSkillBonus {
  label: string;
  value: number;
}

/**
 * The bonus a trait gives, by its level: a flat figure, a figure a level, or
 * a row of figures the level picks from.
 */
type ByLevel = number | ((levels: number) => number);

/** A trait that adds to (or takes from) a list of skills by name. */
interface SkillBonusTrait {
  skills: readonly string[];
  value: ByLevel;
}

/**
 * The skills that need a delicate touch (p. 59): High Manual Dexterity adds
 * to them and Ham-Fisted (p. 138) takes from them, the latter with Fast-Draw.
 */
const FINE_WORK_SKILLS: readonly string[] = [
  "Artist", "Jeweler", "Knot-Tying", "Leatherworking", "Lockpicking", "Pickpocket", "Sewing",
  "Sleight of Hand", "Surgery",
];

/** The skills Shyness stands in the way of (p. 154): "skills that require you to deal with people". */
const SHYNESS_SKILLS: readonly string[] = [
  "Acting", "Carousing", "Diplomacy", "Fast-Talk", "Intimidation", "Leadership", "Merchant",
  "Panhandling", "Performance", "Politics", "Public Speaking", "Savoir-Faire", "Sex Appeal",
  "Streetwise", "Teaching",
];

/** Stuttering (p. 157), and Disturbing Voice (p. 132), which has "identical" effects. */
const STUTTERING_SKILLS: readonly string[] = [
  "Diplomacy", "Fast-Talk", "Performance", "Public Speaking", "Sex Appeal", "Singing",
];

/** The six Influence skills (p. 359), which Oblivious is -1 to use (p. 146). */
const INFLUENCE_SKILLS: readonly string[] = [
  "Diplomacy", "Fast-Talk", "Intimidation", "Savoir-Faire", "Sex Appeal", "Streetwise",
];

/**
 * Sex Appeal takes "any bonus for above-average appearance (p. 21) -- or
 * double the penalty for below-average appearance!" (p. 219). The bonus is the
 * one from those attracted to you, who are the only people the skill works on:
 * Attractive +1, Beautiful or Handsome +4, Very +6, Transcendent +8.
 */
const SEX_APPEAL_APPEARANCE: readonly number[] = [1, 4, 4, 6, 6, 8];
/** Unattractive -1, Ugly -2, Hideous -4, Monstrous -5, Horrific -6 (p. 21), doubled. */
const SEX_APPEAL_UNAPPEARANCE: readonly number[] = [-2, -4, -8, -10, -12];

const row = (figures: readonly number[]) => (levels: number) =>
  figures[Math.min(Math.max(1, levels), figures.length) - 1]!;

/**
 * Every other Basic Set trait that names the skills it adds to, by the
 * trait's name in lower case. A trait that comes in two entries -- Absolute
 * Direction and 3D Spatial Sense, Flexibility and Double-Jointed -- is listed
 * under both, and a levelled one reads its higher level the same way.
 *
 * Left out on purpose, being conditions on a roll rather than a level:
 * Callous's Psychology "to help others", Truthfulness's Acting "to deceive",
 * Chameleon and Silence's Stealth "when being seen matters", Infravision's
 * Tracking on a fresh trail, Versatile, Daredevil, Single-Minded and Higher
 * Purpose. Charisma's "+1 to Influence rolls" (p. 41) is a bonus to the roll,
 * not the skill, and stays on the Influence roll.
 */
const SKILL_BONUS_TRAITS: Readonly<Record<string, readonly SkillBonusTrait[]>> = {
  // "+3 to Body Sense and Navigation (Air, Land, or Sea)" (p. 34).
  "absolute direction": [
    { skills: ["Body Sense", "Navigation", "Navigation (Air)", "Navigation (Land)", "Navigation (Sea)"], value: 3 },
    // Its second level is 3D Spatial Sense: "plus +1 to Piloting and +2 to
    // Aerobatics, Free Fall, and Navigation (Hyperspace or Space)".
    { skills: ["Piloting"], value: (levels) => (levels >= 2 ? 1 : 0) },
    { skills: ["Aerobatics", "Free Fall", "Navigation (Hyperspace)", "Navigation (Space)"], value: (levels) => (levels >= 2 ? 2 : 0) },
  ],
  "3d spatial sense": [
    { skills: ["Body Sense", "Navigation", "Navigation (Air)", "Navigation (Land)", "Navigation (Sea)"], value: 3 },
    { skills: ["Piloting"], value: 1 },
    { skills: ["Aerobatics", "Free Fall", "Navigation (Hyperspace)", "Navigation (Space)"], value: 2 },
  ],
  // "+2 to Climbing skill" (p. 41).
  brachiator: [{ skills: ["Climbing"], value: 2 }],
  // "+4 to Tracking skill" (p. 49).
  "discriminatory smell": [{ skills: ["Tracking"], value: 4 }],
  // "+4 to all Disguise rolls" (p. 51).
  "elastic skin": [{ skills: ["Disguise"], value: 4 }],
  // "the bonus to Detect Lies, Fortune-Telling, and Psychology is +3" (p. 51); Sensitive is +1.
  empathy: [{ skills: ["Detect Lies", "Fortune-Telling", "Psychology"], value: 3 }],
  sensitive: [{ skills: ["Detect Lies", "Fortune-Telling", "Psychology"], value: 1 }],
  // "+3 on Climbing rolls; on Escape rolls ...; on Erotic Art skill" (p. 56);
  // its second level, Double-Jointed, is +5.
  flexibility: [{ skills: ["Climbing", "Escape", "Erotic Art"], value: (levels) => (levels >= 2 ? 5 : 3) }],
  "double-jointed": [{ skills: ["Climbing", "Escape", "Erotic Art"], value: 5 }],
  // "Each level (to a maximum of four) gives +1" to the fine-work skills (p. 59).
  "high manual dexterity": [{ skills: FINE_WORK_SKILLS, value: (levels) => Math.min(levels, 4) }],
  // "+1 to Acrobatics, Climbing, and Piloting skills" (p. 74).
  "perfect balance": [{ skills: ["Acrobatics", "Climbing", "Piloting"], value: 1 }],
  // "+1 on all ST, DX, and Escape rolls to slip restraints" a level, to five (p. 85).
  slippery: [{ skills: ["Escape"], value: (levels) => Math.min(levels, 5) }],

  // Disadvantages.
  // "-3 on all Teaching rolls" (p. 125).
  callous: [{ skills: ["Teaching"], value: -3 }],
  // "-1 on most Artist, Chemistry, Driving, Merchant, Piloting, and Tracking
  // rolls" (p. 127). "Most" is the GM's to trim where colour cannot matter.
  colorblindness: [{ skills: ["Artist", "Chemistry", "Driving", "Merchant", "Piloting", "Tracking"], value: -1 }],
  // "-3 penalty on any Merchant skill roll" (p. 137).
  gullibility: [{ skills: ["Merchant"], value: -3 }],
  // "For -5 points, the penalty is -3; for -10 points, it is -6" (p. 138).
  "ham-fisted": [{ skills: [...FINE_WORK_SKILLS, "Fast-Draw"], value: (levels) => -3 * Math.min(levels, 2) }],
  // "-3 penalty on all skills that rely ... on understanding someone's emotional motivation" (p. 142).
  "low empathy": [{
    skills: [
      "Acting", "Carousing", "Criminology", "Detect Lies", "Diplomacy", "Enthrallment", "Fast-Talk",
      "Interrogation", "Leadership", "Merchant", "Politics", "Psychology", "Savoir-Faire", "Sex Appeal",
      "Sociology", "Streetwise",
    ],
    value: -3,
  }],
  // "-1 to use or resist Influence skills" (p. 146).
  oblivious: [{ skills: INFLUENCE_SKILLS, value: -1 }],
  // Mild -1, Severe -2, Crippling "-4 on default rolls" (p. 154).
  shyness: [{ skills: SHYNESS_SKILLS, value: row([-1, -2, -4]) }],
  stuttering: [{ skills: STUTTERING_SKILLS, value: -2 }],
  "disturbing voice": [{ skills: STUTTERING_SKILLS, value: -2 }],
  // "a permanent -5 to Fast Talk skill" (p. 159).
  truthfulness: [{ skills: ["Fast-Talk"], value: -5 }],

  // Appearance, on Sex Appeal alone (pp. 21, 219).
  appearance: [{ skills: ["Sex Appeal"], value: row(SEX_APPEAL_APPEARANCE) }],
  "appearance (disadvantage)": [{ skills: ["Sex Appeal"], value: row(SEX_APPEAL_UNAPPEARANCE) }],
};

/**
 * Skill bonuses from every trait held that names its skills, keyed by the
 * skill's normalized name, each carrying the trait's name as its label.
 *
 * Talents are not here: they are one line on the sheet, from talentBonuses.
 * A trait held twice, or two that reach the same skill, both count.
 */
export function traitSkillBonuses(traits: readonly BonusTrait[]): Map<string, TraitSkillBonus[]> {
  const bonuses = new Map<string, TraitSkillBonus[]>();
  for (const trait of traits) {
    const entries = SKILL_BONUS_TRAITS[trait.name.trim().toLowerCase()];
    if (!entries) continue;
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    for (const entry of entries) {
      // A line worth nothing at this level is kept: it marks the specialty as
      // one the trait names, so the lookup does not fall back to the base.
      const value = typeof entry.value === "function" ? entry.value(levels) : entry.value;
      for (const skill of entry.skills) {
        const key = normalizeSkillName(skill);
        const list = bonuses.get(key) ?? [];
        list.push({ label: trait.name.trim(), value });
        bonuses.set(key, list);
      }
    }
  }
  return bonuses;
}

/**
 * What the traits add to one skill, by name: the specialty first and then the
 * base, as talentBonusFor reads it, so Navigation (Space) finds its own line
 * where one is listed and Piloting (Glider) falls back to Piloting.
 */
export function traitSkillBonusesFor(
  skillName: string,
  bonuses: ReadonlyMap<string, TraitSkillBonus[]>,
): TraitSkillBonus[] {
  const whole = normalizeSkillName(skillName);
  const base = whole.replace(/\s*\(.*\)\s*$/, "");
  const lines = bonuses.get(whole) ?? (base !== whole ? bonuses.get(base) : undefined) ?? [];
  return lines.filter((line) => line.value !== 0);
}

/**
 * Whether a trait is one of the talents, or one of the two that act like one.
 * A trait carrying its own skill list is a talent whatever it is called.
 */
export function isTalent(name: string, talentSkills: readonly string[] = []): boolean {
  if (talentSkills.some((skill) => skill.trim())) return true;
  const key = name.trim().toLowerCase();
  return key in TALENT_SKILLS || key === "voice" || key === "charisma";
}
