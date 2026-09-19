/**
 * Which skill a weapon's attack is rolled with (GURPS Basic Set: Characters
 * p. 175).
 *
 * A weapon names its skill, and until now that was the end of it: a character
 * who had bought a wildcard skill covering the weapon -- Sword! for a
 * broadsword, Gun! for a revolver -- still attacked at the *default* for
 * Broadsword or Guns (Pistol), because they held no skill item of that exact
 * name. Retyping the weapon's own skill was the only way round it, and it
 * rewrote the weapon for everybody who held it.
 *
 * Which named skills a wildcard stands in for is a book's business rather than
 * the system's, so the system offers the choice instead of guessing it: the
 * character's own skills, on this character's copy of the weapon.
 */

import { isWildcardSkill, sameSkill } from "../../rules/skills.js";

/** A skill the character has, as the picker needs it. */
export interface HeldSkill {
  name: string;
  /** Their level in it, or null where the sheet could not work one out. */
  level: number | null;
}

/** One option of the picker. */
export interface AttackSkillOption {
  /** What is stored: a skill name, or "" for the skill the weapon names. */
  value: string;
  label: string;
  selected: boolean;
  /** True for the entry that puts the row back to the weapon's own skill. */
  isDefault: boolean;
}

export interface AttackSkillInput {
  /** The skill the weapon's mode names. */
  modeSkill: string;
  /** The skill chosen for this character's copy, or "" for the weapon's own. */
  chosen: string;
  /** Every skill the character has. */
  skills: readonly HeldSkill[];
  /** Renders "Broadsword 14" and the weapon's own entry; keeps text out of here. */
  format: (options: { name: string; level: number | null }) => string;
  weaponsOwnLabel: (options: { name: string }) => string;
}

/**
 * The picker's options: the weapon's own skill first, then the character's
 * own, best level first and then by name.
 *
 * Wildcards sit among the rest rather than in a group of their own: to the
 * character a wildcard *is* one of their skills, and sorting by level puts a
 * usable one where it will be seen -- which is the whole complaint the picker
 * answers.
 */
export function attackSkillOptions(input: AttackSkillInput): AttackSkillOption[] {
  const chosen = input.chosen.trim();
  const options: AttackSkillOption[] = [{
    value: "",
    label: input.weaponsOwnLabel({ name: input.modeSkill }),
    selected: chosen === "",
    isDefault: true,
  }];

  const held = [...input.skills]
    .filter((skill) => skill.name.trim() !== "")
    // The weapon's own skill is already the first entry; offering it twice
    // would let the same choice be stored two different ways.
    .filter((skill) => !sameSkill(skill.name, input.modeSkill))
    .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity) || a.name.localeCompare(b.name));

  for (const skill of held) {
    options.push({
      value: skill.name,
      label: input.format({ name: skill.name, level: skill.level }),
      selected: sameSkill(skill.name, chosen),
      isDefault: false,
    });
  }

  // A skill chosen and since removed from the sheet still has to appear, or
  // the select would silently show something the row is not being rolled at.
  if (chosen !== "" && !options.some((option) => option.selected)) {
    options.push({
      value: chosen,
      label: input.format({ name: chosen, level: null }),
      selected: true,
      isDefault: false,
    });
  }
  return options;
}

/** Whether the row is being rolled with something other than the weapon's skill. */
export function rolledWithChosenSkill(modeSkill: string, chosen: string): boolean {
  return chosen.trim() !== "" && !sameSkill(chosen, modeSkill);
}

/** Whether any of the character's skills is a wildcard, for the picker's hint. */
export function holdsAWildcard(skills: readonly HeldSkill[]): boolean {
  return skills.some((skill) => isWildcardSkill(skill.name));
}
