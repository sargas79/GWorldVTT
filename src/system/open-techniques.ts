/**
 * Choosing the skill an open technique is bought for (GURPS Basic Set:
 * Characters p. 230).
 *
 * Disarming is written for "any unarmed combat or Melee Weapon skill". When a
 * character takes it, they are asked which of their own skills it is for, and
 * the technique becomes that skill's: Disarming (Broadsword), bought off
 * Broadsword. A character with no such skill is told so, and gets nothing.
 */

import {
  isOpenTechnique,
  qualifyingSkills,
  skillChosenIn,
  techniqueForSkill,
  type SkillFamily,
} from "../rules/technique-skills.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.Technique.Open.${key}`, data)
    : game.i18n.localize(`GWORLD.Technique.Open.${key}`);

/** Whether item data is an open technique still waiting for its skill. */
export function isOpenTechniqueData(data: any): boolean {
  return data?.type === "technique" && isOpenTechnique(data.system ?? {});
}

/** The names of an actor's skills, as its sheet lists them. */
function skillNamesOf(actor: any): string[] {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item?.type === "skill")
    .map((item: any) => String(item.name ?? ""))
    .filter(Boolean);
}

/** The technique for one skill: its name, and the prerequisite it is bought off. */
export function withChosenSkill(data: any, skill: string): any {
  return {
    ...data,
    name: techniqueForSkill(String(data.name ?? ""), skill),
    system: { ...data.system, prerequisite: skill },
  };
}

/**
 * Asks which skill an open technique is for, and returns the technique for it.
 *
 * The data is returned unchanged for anything that is not an open technique,
 * and null when the character has no skill it may be bought for or the dialog
 * is closed -- in which case nothing should be created.
 */
export async function chooseTechniqueSkill(actor: any, data: any): Promise<any | null> {
  if (!isOpenTechniqueData(data)) return data;

  const options = qualifyingSkills(
    {
      families: (data.system?.skillFamilies ?? []) as SkillFamily[],
      choices: (data.system?.skillChoices ?? []) as string[],
    },
    skillNamesOf(actor),
  );
  if (options.length === 0) {
    ui.notifications?.warn(L("NoSkill", { name: String(data.name ?? ""), actor: String(actor?.name ?? "") }));
    return null;
  }

  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title", { name: String(data.name ?? "") }) },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${escape(L("Which"))}</span>
        <select name="skill">${options.map((skill) => `<option value="${escape(skill)}">${escape(skill)}</option>`).join("")}</select>
      </label>
    </div>`,
    ok: {
      label: L("Take"),
      callback: (_event: Event, button: HTMLElement) =>
        button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="skill"]')?.value ?? null,
    },
    rejectClose: false,
  });
  if (typeof chosen !== "string" || !chosen) return null;
  return withChosenSkill(data, chosen);
}

/**
 * An open technique a template names with its skill already chosen:
 * "Disarming (Rapier)" takes Disarming for Rapier, with no question asked.
 * Anything else is returned as it was.
 */
export function templateTechnique(data: any, entryName: string, documentName: string): any {
  if (!isOpenTechniqueData(data)) return data;
  const skill = skillChosenIn(entryName, documentName);
  return skill ? withChosenSkill({ ...data, name: documentName }, skill) : data;
}
