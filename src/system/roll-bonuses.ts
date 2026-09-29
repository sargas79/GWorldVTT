/**
 * Bonuses a roll dialog offers, for the Revised edition's optional rules
 * (Basic Set Revised pp. 324-325, 328-329, 333):
 *
 * - a wildcard skill's positive relative level, as a bonus in the category
 *   the GM picks, halved where the book halves it (under three dice, an
 *   active defense, Accuracy, a large group or direct damage) and never
 *   stacked with itself;
 * - a Talent's alternative benefit, its levels as a bonus in place of its
 *   reaction bonus;
 * - Equipment Bond and the gear that goes with a technological skill: the
 *   bonded item, its tech level and familiarity, for a tool-skill roll.
 *
 * The dialog lists what applies to this roll, the player ticks what the GM
 * allows, and the lines go on the roll. A roll with nothing on offer opens no
 * dialog. The rules are in `rules/alternative-abilities.ts`.
 */

import {
  defaultWildcardCategory,
  wildcardCategoriesFor,
  talentBenefitBonus,
  talentBenefitOf,
  wildcardBonus,
  wildcardHalved,
  type WildcardCategory,
} from "../rules/alternative-abilities.js";
import { isWildcardSkill, normalizeSkillName } from "../rules/skills.js";
import { isTechnologicalSkill } from "../rules/tech-level.js";
import { noPerks } from "../rules/addendum-perks.js";
import { isRuleOn } from "./optional-rules.js";
import { pendingModifiers } from "./pending-modifiers.js";
import { equipmentUseLines } from "./tech-level.js";
import type { RollModifier } from "./roll.js";

/** What kind of roll the dialog is for. */
export type BonusRollKind = "skill" | "attribute" | "defense" | "attack" | "damage";

/** What the dialog needs to know about the roll. */
export interface BonusRollContext {
  kind: BonusRollKind;
  /** The skill rolled, for a skill roll. */
  skill?: string | undefined;
  /** Dice rolled, where not three. */
  dice?: number;
}

/** One wildcard skill able to give a bonus. */
export interface WildcardOffer {
  id: string;
  name: string;
  /** Its positive relative level. */
  level: number;
}

/** One Talent whose alternative benefit is on offer. */
export interface TalentOffer {
  id: string;
  name: string;
  benefit: string;
  value: number;
}

/** One bonded item a tool-skill roll may be made with. */
export interface EquipmentOffer {
  id: string;
  name: string;
  lines: RollModifier[];
}

/** Everything a roll's dialog offers. */
export interface BonusOffers {
  wildcards: WildcardOffer[];
  talents: TalentOffer[];
  equipment: EquipmentOffer[];
}

const L = (key: string) => game.i18n.localize(key);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(key, data);

/** The score a skill's attribute has on this actor. */
function scoreOf(actor: any, attribute: string): number | null {
  const derived = actor?.system?.derived ?? {};
  const value = attribute === "Will" ? derived.will : attribute === "Per" ? derived.per : derived.attributes?.[attribute];
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A wildcard skill's relative level, or 0 for a skill that isn't one or sits at or below its attribute. */
export function wildcardRelativeLevel(actor: any, item: any): number {
  if (item?.type !== "skill" || !isWildcardSkill(String(item.name ?? ""))) return 0;
  const level = item.system?.derived?.level;
  const score = scoreOf(actor, String(item.system?.attribute ?? "DX"));
  if (typeof level !== "number" || score === null) return 0;
  return Math.max(0, level - score);
}

/** The wildcard skills of an actor with a positive relative level, none of them the skill being rolled. */
export function wildcardOffers(actor: any, rolled: string | undefined): WildcardOffer[] {
  if (!isRuleOn("wildcardBonus")) return [];
  const rolledName = normalizeSkillName(String(rolled ?? ""));
  const held = pendingModifiers(actor).filter((h) => h.source === "wildcard");
  const out: WildcardOffer[] = [];
  for (const item of actor?.items ?? []) {
    const level = wildcardRelativeLevel(actor, item);
    if (level <= 0) continue;
    const name = String(item.name ?? "");
    if (rolledName && normalizeSkillName(name) === rolledName) continue;
    // A bonus already held from this wildcard (the sheet's button) is not offered a second time.
    if (held.some((h) => h.label.includes(name))) continue;
    out.push({ id: String(item.id), name, level });
  }
  return out;
}

/** The Talents whose reaction bonus was replaced by a benefit that is a bonus to a roll. */
export function talentOffers(actor: any): TalentOffer[] {
  const out: TalentOffer[] = [];
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait") continue;
    const benefit = talentBenefitOf(item.system?.talentBenefit);
    const value = talentBenefitBonus({ benefit, levels: Number(item.system?.levels ?? 0) });
    if (benefit === "" || benefit === "none" || (value === 0 && benefit !== "feat")) continue;
    out.push({ id: String(item.id), name: String(item.name ?? ""), benefit, value });
  }
  return out;
}

/**
 * The items flagged as bonded (Weapon Bond, Equipment Bond), as many as the
 * character holds bond perks for: a perk covers one item (pp. 328-329).
 */
export function bondedItems(actor: any): any[] {
  const perks = actor?.system?.derived?.perks ?? noPerks();
  const flagged = [...(actor?.items ?? [])].filter((i: any) => ["equipment", "armor", "shield"].includes(i.type) && i.system?.bonded === true);
  return flagged.slice(0, Math.max(0, perks.bondPerks));
}

/** The bonded items a tool-skill roll may be made with, and the lines each puts on the roll. */
export function equipmentOffers(actor: any, skill: string | undefined): EquipmentOffer[] {
  const name = String(skill ?? "").trim();
  if (!name) return [];
  const skillItem = [...(actor?.items ?? [])].find((i: any) => i.type === "skill" && normalizeSkillName(String(i.name ?? "")) === normalizeSkillName(name));
  if (!isTechnologicalSkill(String(skillItem?.name ?? name), skillItem?.system?.techLevel)) return [];
  const out: EquipmentOffer[] = [];
  for (const item of bondedItems(actor)) {
    const use = equipmentUseLines(actor, item, name);
    if (use.impossible) continue;
    out.push({ id: String(item.id), name: String(item.name ?? ""), lines: use.lines.map((l) => ({ label: l.label, value: l.value, key: l.key })) });
  }
  return out;
}

/** What a roll's dialog offers: nothing at all for most rolls. */
export function bonusOffers(actor: any, context: BonusRollContext): BonusOffers {
  const attack = context.kind === "attack" || context.kind === "damage";
  return {
    wildcards: wildcardOffers(actor, context.skill),
    talents: attack ? [] : talentOffers(actor),
    equipment: context.kind === "skill" ? equipmentOffers(actor, context.skill) : [],
  };
}

/** Whether any bonus is on offer. */
export function anyOffered(offers: BonusOffers): boolean {
  return offers.wildcards.length > 0 || offers.talents.length > 0 || offers.equipment.length > 0;
}

const NAMES = {
  wildcard: "bonusWildcard",
  category: "bonusCategory",
  halve: "bonusHalve",
  talent: "bonusTalent",
  equipment: "bonusEquipment",
} as const;

/** The dialog's fields for what is on offer: HTML to put in the modifier dialog. */
export function offerFieldsHtml(offers: BonusOffers, context: BonusRollContext): string {
  const esc = foundry.utils.escapeHTML;
  const row = "display:flex;gap:8px;justify-content:space-between;align-items:center";
  const parts: string[] = [];
  if (offers.wildcards.length > 0) {
    const chosen = defaultWildcardCategory(context.kind);
    const auto = context.kind === "defense" ? L("GWORLD.RollBonus.DefenseHalved") : "";
    parts.push(`<fieldset style="display:flex;flex-direction:column;gap:4px"><legend>${esc(L("GWORLD.RollBonus.Wildcard"))}</legend>
      <label style="${row}"><span>${esc(L("GWORLD.RollBonus.WildcardSkill"))}</span>
        <select name="${NAMES.wildcard}"><option value="">${esc(L("GWORLD.RollBonus.None"))}</option>${
          offers.wildcards.map((w) => `<option value="${esc(w.id)}">${esc(F("GWORLD.RollBonus.WildcardOption", { skill: w.name, level: w.level }))}</option>`).join("")
        }</select></label>
      <label style="${row}"><span>${esc(L("GWORLD.Wildcard.Category"))}</span>
        <select name="${NAMES.category}">${
          wildcardCategoriesFor(context.kind).map((c) => `<option value="${c}"${c === chosen ? " selected" : ""}>${esc(L(`GWORLD.Wildcard.Categories.${c}`))}</option>`).join("")
        }</select></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${NAMES.halve}"><span>${esc(L("GWORLD.Wildcard.Halve"))}</span></label>
      ${auto ? `<p class="ihint" style="margin:0">${esc(auto)}</p>` : ""}
    </fieldset>`);
  }
  if (offers.talents.length > 0) {
    parts.push(`<fieldset style="display:flex;flex-direction:column;gap:4px"><legend>${esc(L("GWORLD.RollBonus.Talent"))}</legend>${
      offers.talents.map((t) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${NAMES.talent}" value="${esc(t.id)}">
        <span>${esc(F("GWORLD.RollBonus.TalentOption", { talent: t.name, benefit: L(`GWORLD.Alternative.Benefit.${t.benefit}`), value: `${t.value > 0 ? "+" : ""}${t.value}` }))}</span></label>`).join("")
    }</fieldset>`);
  }
  if (offers.equipment.length > 0) {
    parts.push(`<fieldset style="display:flex;flex-direction:column;gap:4px"><legend>${esc(L("GWORLD.RollBonus.Equipment"))}</legend>
      <label style="${row}"><span>${esc(L("GWORLD.RollBonus.EquipmentUsing"))}</span>
        <select name="${NAMES.equipment}"><option value="">${esc(L("GWORLD.RollBonus.None"))}</option>${
          offers.equipment.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")
        }</select></label></fieldset>`);
  }
  return parts.length === 0 ? "" : `<div class="roll-bonuses" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">${parts.join("")}</div>`;
}

/** The lines the player chose in the dialog's fields. A wildcard is never taken twice for one roll. */
export function readOffers(root: HTMLElement | null | undefined, offers: BonusOffers, context: BonusRollContext): RollModifier[] {
  const lines: RollModifier[] = [];
  if (!root) return lines;
  const picked = root.querySelector<HTMLSelectElement>(`select[name="${NAMES.wildcard}"]`)?.value ?? "";
  const wildcard = offers.wildcards.find((w) => w.id === picked);
  if (wildcard) {
    const raw = root.querySelector<HTMLSelectElement>(`select[name="${NAMES.category}"]`)?.value ?? "";
    const category = (wildcardCategoriesFor(context.kind) as readonly string[]).includes(raw) ? (raw as WildcardCategory) : defaultWildcardCategory(context.kind);
    const halve = root.querySelector<HTMLInputElement>(`input[name="${NAMES.halve}"]`)?.checked === true;
    const options = {
      relativeLevel: wildcard.level,
      category,
      activeDefense: context.kind === "defense",
      halve,
      ...(context.dice !== undefined ? { dice: context.dice } : {}),
    };
    const value = wildcardBonus(options);
    if (value !== 0) {
      lines.push({
        label: F("GWORLD.RollBonus.WildcardLine", { skill: wildcard.name, category: L(`GWORLD.Wildcard.Categories.${category}`), halved: wildcardHalved(options) ? L("GWORLD.RollBonus.Halved") : "" }).trim(),
        value,
        key: "wildcard",
      });
    }
  }
  const ticked = new Set([...root.querySelectorAll<HTMLInputElement>(`input[name="${NAMES.talent}"]:checked`)].map((box) => box.value));
  for (const talent of offers.talents) {
    if (!ticked.has(talent.id) || talent.value === 0) continue;
    lines.push({
      label: F("GWORLD.RollBonus.TalentLine", { talent: talent.name, benefit: L(`GWORLD.Alternative.Benefit.${talent.benefit}`) }),
      value: talent.value,
      key: "talentBenefit",
    });
  }
  const gear = root.querySelector<HTMLSelectElement>(`select[name="${NAMES.equipment}"]`)?.value ?? "";
  const item = offers.equipment.find((e) => e.id === gear);
  if (item) lines.push(...item.lines);
  return lines;
}
