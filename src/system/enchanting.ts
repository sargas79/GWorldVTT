/**
 * Using and making magic items (GURPS Basic Set: Campaigns pp. 480-482).
 *
 * Using one is casting the spell on it at the item's Power, with no ritual
 * and with the item's own Power enchantment paying part of the cost; the
 * casting itself goes through the same dialog and card as any other.
 *
 * Making one is ceremonial magic: the enchanter and the spell both at 15 or
 * more, assistants each costing a point of skill and contributing energy, a
 * day per point or an hour per hundred, and a roll where 16 fails and 17-18
 * is a disaster. What it makes is written onto the item.
 */

import { SYSTEM_ID } from "./constants.js";
import { castSpell, currentMana } from "./casting.js";
import { sourceCollections } from "./compendium-sources.js";
import { applyFatigue } from "./fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { normalizeSkillName } from "../rules/skills.js";
import { resistanceAttribute } from "../rules/spell-attacks.js";
import {
  canEnchant,
  ceremonialBonus,
  enchantingSkill,
  enchantingThreshold,
  enchantingTime,
  enchantmentEnergy,
  isEffectEnchantment,
  itemPowerHere,
  magicItemEntry,
  maxAssistants,
  powerOnCritical,
  resolveEnchanting,
  type Enchantment,
  type EnchantingMethod,
} from "../rules/enchanting.js";
import type { ManaLevel } from "../rules/casting.js";

const ENCHANT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/enchant.hbs`;

const L = (key: string) => game.i18n.localize(`GWORLD.Enchant.${key}`);

/** The spell record a name refers to: the actor's own, else the compendia's. */
export async function findSpellRecord(actor: any, name: string): Promise<any | null> {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type === "spell" && normalizeSkillName(String(item.name ?? "")) === wanted) return item;
  }
  const sources = sourceCollections();
  for (const pack of (game as any).packs ?? []) {
    if (pack?.documentName !== "Item" || !sources.has(String(pack.collection))) continue;
    const index = await pack.getIndex();
    const entry = [...index].find(
      (e: any) => e.type === "spell" && normalizeSkillName(String(e.name ?? "")) === wanted,
    );
    if (entry) return await pack.getDocument(entry._id);
  }
  return null;
}

/**
 * Casts a spell from a magic item (p. 482): "Use the item's Power as the
 * caster's base skill and apply all the usual modifiers for the kind of spell
 * being cast."
 */
export async function castFromItem(actor: any, gear: any, index: number): Promise<void> {
  if (!actor?.isOwner || !gear) return;
  const entry = (actor.system?.derived?.magic?.items ?? []).find((i: any) => i.itemId === gear.id);
  const spell = entry?.magic?.spells?.find((s: any) => s.index === index);
  if (!spell) return;
  if (!spell.works) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Enchant.NotWorkingHere", { item: String(gear.name), power: spell.powerHere }));
    return;
  }
  if (spell.alwaysOn) {
    ui.notifications?.info(game.i18n.format("GWORLD.Enchant.AlwaysOnNote", { spell: spell.spell, item: String(gear.name) }));
    return;
  }
  const record = await findSpellRecord(actor, spell.spell);
  if (!record) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Enchant.NoRecord", { spell: spell.spell }));
    return;
  }
  await castSpell(actor, record, {
    fromItem: {
      itemName: String(gear.name),
      power: spell.powerHere,
      costReduction: Number(entry.magic.powerReduction ?? 0),
      mageOnly: Boolean(spell.mageOnly),
    },
  });
}

/** The level a spell is known at on the sheet, or null. */
function spellLevel(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type !== "spell" || normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" ? level : null;
  }
  return null;
}

interface EnchantChoices {
  spell: string;
  level: number;
  itemId: string;
  energy: number;
  method: EnchantingMethod;
  assistants: number;
  assistantEnergy: number;
  othersNearby: boolean;
  alwaysOn: boolean;
}

/**
 * Asks what is being made: which spell, on what, with how much energy from
 * whom, by which method. Energy is prefilled where the book prices it and
 * left to the GM where it does not.
 */
async function promptForEnchanting(actor: any, options: {
  spells: Array<{ name: string; level: number }>;
  gear: Array<{ id: string; name: string }>;
  enchant: number;
  mana: ManaLevel;
}): Promise<EnchantChoices | null> {
  const M = (key: string) => game.i18n.localize(`GWORLD.Enchant.Method.${key}`);
  const row = (label: string, field: string) =>
    `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${label}</span>${field}</label>`;
  const spellOptions = options.spells
    .map((s) => `<option value="${foundry.utils.escapeHTML(s.name)}">${foundry.utils.escapeHTML(s.name)} ${s.level}</option>`)
    .join("");
  const gearOptions = [
    `<option value="">${L("NoItem")}</option>`,
    ...options.gear.map((g) => `<option value="${g.id}">${foundry.utils.escapeHTML(g.name)}</option>`),
  ].join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <div style="font-size:11px;opacity:0.85">${L("Skill")} ${options.enchant} · ${game.i18n.localize("GWORLD.Mana.Here")} ${game.i18n.localize(`GWORLD.Mana.${options.mana}`)} · ${game.i18n.format("GWORLD.Enchant.Threshold", { skill: enchantingThreshold(options.mana) })}</div>
      ${row(L("Spell"), `<select name="spell" style="width:200px">${spellOptions}</select>`)}
      ${row(L("Level"), `<input type="number" name="level" value="1" min="1" step="1" style="width:90px">`)}
      ${row(L("Item"), `<select name="item" style="width:200px">${gearOptions}</select>`)}
      ${row(L("EnergyRequired"), `<input type="number" name="energy" value="0" min="0" step="1" style="width:90px">`)}
      <p style="margin:0;font-size:11px;opacity:0.8">${L("EnergyHint")}</p>
      ${row(L("MethodLabel"), `<select name="method" style="width:200px"><option value="quickAndDirty">${M("quickAndDirty")}</option><option value="slowAndSure">${M("slowAndSure")}</option></select>`)}
      ${row(L("Assistants"), `<input type="number" name="assistants" value="0" min="0" max="${maxAssistants(options.enchant)}" step="1" style="width:90px">`)}
      ${row(L("AssistantEnergy"), `<input type="number" name="assistantEnergy" value="0" min="0" step="1" style="width:90px">`)}
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="others"><span>${L("OthersNearby")}</span></label>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="alwaysOn"><span>${L("AlwaysOn")}</span></label>
    </div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) => Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value) || 0;
        const sel = (name: string) => form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        const tick = (name: string) => form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        return {
          spell: sel("spell"),
          level: Math.max(1, Math.floor(num("level"))),
          itemId: sel("item"),
          energy: Math.max(0, Math.floor(num("energy"))),
          method: (sel("method") === "slowAndSure" ? "slowAndSure" : "quickAndDirty") as EnchantingMethod,
          assistants: Math.max(0, Math.floor(num("assistants"))),
          assistantEnergy: Math.max(0, Math.floor(num("assistantEnergy"))),
          othersNearby: tick("others"),
          alwaysOn: tick("alwaysOn"),
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as EnchantChoices) : null;
}

/**
 * Enchants an item (Campaigns p. 481), from the Magic tab.
 *
 * The energy the book prices -- the six effects by level, the spells on the
 * Magic Items Table -- fills itself in when the entered figure is zero; the
 * GM types the rest. Quick and Dirty takes the caster's share of the energy
 * off them now, through the fatigue chart; Slow and Sure takes none.
 */
export async function enchantItem(actor: any): Promise<void> {
  if (!actor?.isOwner || !isRuleOn("magicItems")) return;
  const mana: ManaLevel = isRuleOn("manaLevels") ? currentMana() : "normal";
  const enchant = spellLevel(actor, "Enchant");
  const threshold = enchantingThreshold(mana);
  if (enchant === null || enchant < threshold) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Enchant.NeedsEnchant", { skill: threshold }));
    return;
  }

  const spells = [...actor.items]
    .filter((i: any) => i.type === "spell" && normalizeSkillName(String(i.name)) !== "enchant")
    .map((i: any) => ({ name: String(i.name), level: Number(i.system?.derived?.level) }))
    .filter((s: { level: number }) => Number.isFinite(s.level) && s.level >= threshold)
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  if (spells.length === 0) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Enchant.NoSpells", { skill: threshold }));
    return;
  }
  const gear = [...actor.items]
    .filter((i: any) => ["equipment", "armor", "shield"].includes(i.type) && i.system?.carried !== false)
    .map((i: any) => ({ id: String(i.id), name: String(i.name) }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

  const choices = await promptForEnchanting(actor, { spells, gear, enchant, mana });
  if (!choices) return;

  const spell = spellLevel(actor, choices.spell);
  if (spell === null || !canEnchant({ enchant, spell, mana })) return;

  // The book's price where it has one, else what was typed.
  const table = magicItemEntry(choices.spell);
  const priced = isEffectEnchantment(choices.spell)
    ? enchantmentEnergy(choices.spell, choices.level)
    : table
      ? table.energy * (table.perLevel ? choices.level : 1)
      : null;
  const energy = choices.energy > 0 ? choices.energy : (priced ?? 0);
  if (energy <= 0) {
    ui.notifications?.warn(L("NoEnergy"));
    return;
  }

  const assistants = Math.min(choices.assistants, maxAssistants(Math.min(enchant, spell)));
  const base = enchantingSkill({ enchant, spell, assistants, othersNearby: choices.othersNearby });
  const quick = choices.method === "quickAndDirty";
  // Quick and Dirty draws on everyone present now; Slow and Sure invests the
  // energy day by day and "There is no FP or HP cost to the enchanters".
  const casterShare = quick ? Math.max(0, energy - choices.assistantEnergy) : 0;
  const available = quick ? casterShare + choices.assistantEnergy : energy;
  const bonus = ceremonialBonus(energy, available);
  const effective = base + bonus;
  const time = enchantingTime({ method: choices.method, energy, mages: 1 + assistants });

  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
  const outcome = resolveEnchanting(roll.total, effective, dice);

  // "Succeed or fail, all the energy is spent when the GM rolls the dice."
  if (casterShare > 0) await applyFatigue(actor, casterShare);

  const rolls: any[] = [roll];
  let power: number | null = null;
  if (outcome.success) {
    power = effective;
    if (outcome.criticalSuccess) {
      const extra = new Roll("2d6");
      await extra.evaluate();
      rolls.push(extra);
      power = powerOnCritical(power, extra.total);
    }
  }

  // What was made goes onto the item, where the sheet reads it.
  const target = choices.itemId ? actor.items.get(choices.itemId) : null;
  if (power !== null && target) {
    const entry: Enchantment = {
      spell: choices.spell,
      level: choices.level,
      power,
      energy,
      alwaysOn: choices.alwaysOn || isEffectEnchantment(choices.spell) || Boolean(table?.alwaysOn),
      mageOnly: Boolean(table?.mageOnly),
    };
    await target.update({ "system.enchantments": [...(target.system.enchantments ?? []), entry] });
  }
  if (outcome.criticalFailure && target) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Enchant.Destroyed", { item: String(target.name) }));
  }

  const content = await foundry.applications.handlebars.renderTemplate(ENCHANT_TEMPLATE, {
    spell: choices.spell,
    level: isEffectEnchantment(choices.spell) ? choices.level : null,
    item: target ? String(target.name) : L("NoItem"),
    method: game.i18n.localize(`GWORLD.Enchant.Method.${choices.method}`),
    time: "hours" in time
      ? game.i18n.format("GWORLD.Cast.Hours", { n: time.hours })
      : game.i18n.format("GWORLD.Cast.Days", { n: time.days }),
    energy,
    casterShare,
    assistantEnergy: quick ? choices.assistantEnergy : 0,
    base: Math.min(enchant, spell),
    modifiers: [
      ...(assistants ? [{ label: L("AssistantsPenalty"), value: -assistants }] : []),
      ...(choices.othersNearby ? [{ label: L("OthersPenalty"), value: -1 }] : []),
      ...(bonus ? [{ label: L("ExtraEnergy"), value: bonus }] : []),
    ],
    effective,
    dice,
    roll: roll.total,
    resultLabel: outcome.criticalSuccess
      ? game.i18n.format("GWORLD.Enchant.CriticalSuccess", { power })
      : outcome.success
        ? game.i18n.format("GWORLD.Enchant.Success", { power })
        : outcome.criticalFailure
          ? L("CriticalFailure")
          : quick
            ? L("FailureQuick")
            : L("FailureSlow"),
    resultClass: outcome.criticalSuccess
      ? "crit-success"
      : outcome.success
        ? "success"
        : outcome.criticalFailure
          ? "crit-failure"
          : "failure",
    sixteen: roll.total === 16,
    powerHere: power !== null ? itemPowerHere(power, mana) : null,
    resistedNote: resistanceAttribute(String(spellRecordResisted(actor, choices.spell))) ? L("ResistedNote") : "",
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });
}

/** What the enchanted spell is resisted with, if the caster's record says. */
function spellRecordResisted(actor: any, name: string): string {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type === "spell" && normalizeSkillName(String(item.name ?? "")) === wanted) {
      return String(item.system?.resistedBy ?? "");
    }
  }
  return "";
}
