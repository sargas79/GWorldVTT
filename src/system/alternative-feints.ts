/**
 * Alternative Feints (GURPS Basic Set Revised p. 328): a Feint made with a
 * non-combat skill the perk names, in place of the weapon's.
 */

import { noPerks } from "../rules/addendum-perks.js";

/** What a Feint is rolled against, and what to call it. */
export interface FeintBasis {
  base: number;
  /** The skill's name, or blank for the weapon's own. */
  skill: string;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Asks which skill to Feint with when the actor holds Alternative Feints for
 * one they know. Null when the dialog is dismissed; the weapon's own when the
 * actor has no such perk, without asking.
 */
export async function chooseFeintSkill(actor: any, weaponBase: number, weaponLabel: string): Promise<FeintBasis | null> {
  const perks = actor?.system?.derived?.perks ?? noPerks();
  const options: Array<{ skill: string; base: number }> = [];
  for (const skill of perks.feintSkills as string[]) {
    const level = actor?.system?.skillLevelByName?.(skill);
    if (typeof level === "number" && Number.isFinite(level)) options.push({ skill, base: level });
  }
  if (options.length === 0) return { base: weaponBase, skill: "" };

  const L = (key: string, data: Record<string, unknown> = {}) => game.i18n.format(`GWORLD.Perks.${key}`, data);
  const choices = [{ skill: "", base: weaponBase, label: weaponLabel || L("FeintWeapon") }, ...options.map((o) => ({ ...o, label: `${o.skill} (${o.base})` }))];
  const html = choices.map((c, i) => `<option value="${i}">${escape(c.label)}</option>`).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("FeintTitle") },
    content: `<div class="gworld"><label style="display:flex;flex-direction:column;gap:4px">${L("FeintChoose")}<select name="skill">${html}</select></label></div>`,
    ok: {
      label: L("FeintOk"),
      callback: (_event: Event, button: HTMLElement) =>
        button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="skill"]')?.value ?? null,
    },
    rejectClose: false,
  });
  if (chosen === null || chosen === undefined) return null;
  const picked = choices[Number(chosen)];
  return picked ? { base: picked.base, skill: picked.skill } : null;
}
