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

    const listed = TALENT_SKILLS[key];
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

/** Whether a trait is one of the talents, or one of the two that act like one. */
export function isTalent(name: string): boolean {
  const key = name.trim().toLowerCase();
  return key in TALENT_SKILLS || key === "voice" || key === "charisma";
}
