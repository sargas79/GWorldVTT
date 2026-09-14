/**
 * Techniques bought for a skill chosen when they are learned (GURPS Basic Set:
 * Characters pp. 230-233).
 *
 * Many techniques are not written for one skill. Disarming's prerequisite is
 * "any unarmed combat or Melee Weapon skill", Dual-Weapon Attack's "any
 * one-handed Melee Weapon skill", Off-Hand Weapon Training's "any Melee Weapon
 * skill". Such a technique names the kinds of skill it may be bought for, and
 * the skill is picked when a character takes it: Disarming (Broadsword).
 */

import { normalizeSkillName } from "./skills.js";

/** The kinds of skill an open technique may be bought for. */
export type SkillFamily = "any" | "unarmed" | "melee" | "oneHandedMelee" | "shield" | "ranged";

export const SKILL_FAMILIES: readonly SkillFamily[] = ["any", "unarmed", "melee", "oneHandedMelee", "shield", "ranged"];

/**
 * The skills in each family. The unarmed combat skills are Boxing, Brawling,
 * Judo, Karate, Sumo Wrestling and Wrestling (Characters pp. 182-203). The
 * Melee Weapon skills are the specialties of that skill (pp. 208-209) --
 * Cloak, Garrote, Lance and Parry Missile Weapons are skills of their own,
 * which GCA's group includes and the book does not. The one-handed ones leave
 * out the weapons the book makes two-handed: the Two-Handed skills, Polearm and
 * Staff. The ranged weapon skills are named without their specialties.
 */
const FAMILY_SKILLS: Record<Exclude<SkillFamily, "any">, readonly string[]> = {
  unarmed: ["Boxing", "Brawling", "Judo", "Karate", "Sumo Wrestling", "Wrestling"],
  melee: [
    "Axe/Mace", "Broadsword", "Flail", "Force Sword", "Force Whip", "Jitte/Sai", "Knife", "Kusari",
    "Main-Gauche", "Monowire Whip", "Polearm", "Rapier", "Saber", "Shortsword", "Smallsword", "Spear",
    "Staff", "Tonfa", "Two-Handed Axe/Mace", "Two-Handed Flail", "Two-Handed Sword", "Whip",
  ],
  oneHandedMelee: [
    "Axe/Mace", "Broadsword", "Flail", "Force Sword", "Force Whip", "Jitte/Sai", "Knife", "Kusari",
    "Main-Gauche", "Monowire Whip", "Rapier", "Saber", "Shortsword", "Smallsword", "Spear", "Tonfa", "Whip",
  ],
  shield: ["Shield", "Shield (Shield)", "Shield (Buckler)", "Shield (Force)"],
  ranged: [
    "Artillery", "Beam Weapons", "Blowpipe", "Bolas", "Bow", "Crossbow", "Dropping", "Gunner", "Guns",
    "Innate Attack", "Lasso", "Liquid Projector", "Net", "Sling", "Spear Thrower", "Throwing",
    "Thrown Weapon",
  ],
};

/** A skill's name without its specialty: "Guns (Pistol)" is a Guns skill. */
function family(name: string): string {
  return normalizeSkillName(name).replace(/\s*\(.*\)\s*$/, "");
}

/** Whether a skill belongs to a family, by its name with or without its specialty. */
export function inSkillFamily(skill: string, of: SkillFamily): boolean {
  if (of === "any") return true;
  const wanted = normalizeSkillName(skill);
  const bare = family(skill);
  return FAMILY_SKILLS[of].some((listed) => {
    const name = normalizeSkillName(listed);
    return name === wanted || (!/\(/.test(listed) && name === bare);
  });
}

/** What an open technique says it may be bought for. */
export interface OpenTechnique {
  families: readonly SkillFamily[];
  /** Skills named outright, where the technique lists them rather than a kind. */
  choices: readonly string[];
}

/** Whether a technique is open: it names kinds or a list of skills, and no skill yet. */
export function isOpenTechnique(system: { prerequisite?: string; skillFamilies?: readonly string[]; skillChoices?: readonly string[] }): boolean {
  return !String(system.prerequisite ?? "").trim()
    && ((system.skillFamilies?.length ?? 0) > 0 || (system.skillChoices?.length ?? 0) > 0);
}

/**
 * The skills a character has that an open technique may be bought for, in the
 * order the character's sheet lists them.
 */
export function qualifyingSkills(technique: OpenTechnique, known: readonly string[]): string[] {
  const listed = technique.choices.map(normalizeSkillName);
  return known.filter((skill) =>
    listed.includes(normalizeSkillName(skill))
    || technique.families.some((of) => inSkillFamily(skill, of)));
}

/**
 * An open technique once its skill is chosen: "Disarming" for Broadsword is
 * "Disarming (Broadsword)". A name already carrying a placeholder in brackets
 * loses it first.
 */
export function techniqueForSkill(name: string, skill: string): string {
  const base = name.replace(/\s*\((?:any [^)]*|[^)]*skill[^)]*)\)\s*$/i, "").trim();
  return `${base} (${skill})`;
}

/**
 * The skill a template's entry chose for an open technique, from its name:
 * "Disarming (Rapier)" is for Rapier. Null where the name chooses none.
 */
export function skillChosenIn(entryName: string, baseName: string): string | null {
  const base = techniqueForSkill(baseName, "").replace(/\s*\(\)$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}\\s*\\((.+)\\)$`, "i").exec(entryName.trim());
  return match ? match[1]!.trim() : null;
}
