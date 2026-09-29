/**
 * Bonuses for wildcard skills (Basic Set Revised p. 333), an optional rule.
 *
 * A wildcard skill's positive relative level doubles as a bonus to what the
 * GM judges related to it. The GM picks the category of roll; the bonus is
 * held for the character's next roll of it, halved where the book halves it.
 * A wildcard's bonus never stacks with itself: a new one replaces the last.
 */

import { isRuleOn } from "./optional-rules.js";
import { addPendingModifier, pendingModifiers, removePendingModifier } from "./pending-modifiers.js";
import { WILDCARD_CATEGORIES, wildcardBonus, type WildcardCategory } from "../rules/alternative-abilities.js";

/** The source held wildcard bonuses carry. */
export const WILDCARD_SOURCE = "wildcard";

const L = (key: string) => game.i18n.localize(`GWORLD.Wildcard.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Wildcard.${key}`, data);

/** Categories the book halves as a matter of course: active defenses aside, only Accuracy and direct damage ("best halved"). */
const HALVED_BY_DEFAULT: ReadonlySet<WildcardCategory> = new Set(["accuracy"]);

/** Asks the GM's category for a wildcard's bonus and holds it for the next roll. */
export async function grantWildcardBonus(actor: any, skill: { name: string; relativeLevel: number }): Promise<boolean> {
  if (!isRuleOn("wildcardBonus") || !actor?.isOwner) return false;
  if (!(skill.relativeLevel > 0)) return false;
  const esc = foundry.utils.escapeHTML;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("Title", { skill: skill.name }) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="ihint" style="margin:0">${esc(F("Hint", { level: skill.relativeLevel }))}</p>
      <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("Category"))}</span>
        <select name="category">${WILDCARD_CATEGORIES.map((c) => `<option value="${c}">${esc(L(`Categories.${c}`))}</option>`).join("")}</select></label>
      <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("Skill"))}</span>
        <input type="text" name="skill" placeholder="${esc(L("SkillPlaceholder"))}"></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="halve"><span>${esc(L("Halve"))}</span></label>
    </div>`,
    ok: {
      label: L("Grant"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return {
          category: root?.querySelector<HTMLSelectElement>('select[name="category"]')?.value ?? "noSkill",
          skill: root?.querySelector<HTMLInputElement>('input[name="skill"]')?.value.trim() ?? "",
          halve: root?.querySelector<HTMLInputElement>('input[name="halve"]')?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object") return false;
  const category = (WILDCARD_CATEGORIES as readonly string[]).includes((answer as any).category) ? ((answer as any).category as WildcardCategory) : "noSkill";
  const value = wildcardBonus({
    relativeLevel: skill.relativeLevel,
    category,
    halve: (answer as any).halve === true || HALVED_BY_DEFAULT.has(category),
  });
  if (value === 0) return false;
  // Never stacks with itself: this wildcard's bonus already held (its name is in the line) is replaced.
  const label = F("Line", { skill: skill.name, category: L(`Categories.${category}`) });
  for (const held of pendingModifiers(actor)) {
    if (held.source === WILDCARD_SOURCE && held.label.includes(skill.name)) await removePendingModifier(actor, held.id);
  }
  const named = String((answer as any).skill ?? "");
  const id = await addPendingModifier(actor, {
    label,
    value,
    source: WILDCARD_SOURCE,
    ...(named ? { skill: named } : { tags: [category === "noSkill" || category === "hazard" || category === "resist" ? "attribute" : "skill"] }),
  });
  if (id) ui.notifications?.info(F("Held", { value: `${value > 0 ? "+" : ""}${value}`, skill: skill.name }));
  return id !== null;
}
