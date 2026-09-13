/**
 * Mending gear on the sheet (GURPS Basic Set: Campaigns pp. 484-485).
 *
 * The item sheet used to have a Repair button that simply wiped the damage
 * off. The book asks for rather more: half an hour, a skill roll against
 * the thing's price, and back come as many hit points as the roll beat its
 * target by. Beside it sits the roll that breaks gear with nobody striking
 * it, for a day in the sand or a month of neglect.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { resolveSuccess } from "../rules/success.js";
import {
  REPAIR_HOURS,
  equipmentFailureTarget,
  exposureOutcome,
  hitPointsRestored,
  priceModifier,
  repairKind,
  repairTarget,
  sparePartsCost,
  type RepairKind,
} from "../rules/repairs.js";
import { weaponFacts } from "./weapon-damage.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/repair.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Repair.${key}`, data) : game.i18n.localize(`GWORLD.Repair.${key}`);

/** The d6 faces of an evaluated roll, for the card. */
function faces(roll: any): number[] {
  return (roll?.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/** What the sheet knows about a damaged thing: its hit points, and what it cost. */
export function damageState(item: any): { hp: number; hpLost: number; cost: number; kind: RepairKind } {
  const facts = weaponFacts(item);
  const hpLost = Number(item?.system?.hpLost ?? 0) || 0;
  const cost = Number(item?.system?.cost ?? 0) || 0;
  return { hp: facts.hp, hpLost, cost, kind: repairKind({ hpLost, hp: facts.hp }) };
}

/** The skills the book names for putting things right (p. 484). */
export const REPAIR_SKILLS = [
  "Armoury", "Armoury/TL", "Electrician", "Electronics Repair", "Machinist", "Mechanic", "Smith",
] as const;

/** The best repair skill on the sheet, or null where there is none. */
export function repairSkillOf(actor: any): { name: string; level: number } | null {
  let best: { name: string; level: number } | null = null;
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    const name = String(item.name ?? "");
    const bare = name.replace(/\/TL\d*/i, "").trim();
    if (!(REPAIR_SKILLS as readonly string[]).some((s) => s.replace("/TL", "") === bare)) continue;
    const level = Number(item.system?.derived?.level);
    if (!Number.isFinite(level)) continue;
    if (!best || level > best.level) best = { name, level };
  }
  return best;
}

/**
 * One repair attempt: half an hour, a skill roll, and the margin in hit
 * points back (p. 484).
 */
export async function repairItem(options: {
  actor: any;
  item: any;
  skill: number;
  skillName: string;
  modifier: number;
}): Promise<void> {
  const { actor, item } = options;
  if (!item?.isOwner) return;
  const state = damageState(item);
  if (state.kind === "none") {
    ui.notifications?.info(L("Sound", { name: String(item.name) }));
    return;
  }
  if (state.kind === "beyondRepair") {
    ui.notifications?.warn(L("Destroyed", { name: String(item.name), cost: state.cost }));
    return;
  }

  // "An artifact reduced to zero or negative HP requires spare parts that
  // cost 1d x 10% of its original price."
  let parts: { die: number; cost: number } | null = null;
  if (state.kind === "major") {
    const die = new Roll("1d6");
    await die.evaluate();
    parts = { die: die.total, cost: sparePartsCost(state.cost, die.total) };
  }

  const target = repairTarget({
    skill: options.skill,
    cost: state.cost,
    kind: state.kind,
    modifier: options.modifier,
  });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, faces(roll));

  const restored = outcome.success ? Math.min(state.hpLost, hitPointsRestored(outcome.margin)) : 0;
  if (restored > 0) await item.update({ "system.hpLost": state.hpLost - restored });

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    kind: L(`Kind.${state.kind}`),
    skillName: options.skillName,
    hours: REPAIR_HOURS,
    target,
    priceModifier: priceModifier(state.cost),
    dice: faces(roll),
    roll: roll.total,
    outcome,
    restored,
    hpLost: state.hpLost - restored,
    hp: state.hp,
    parts,
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll, ...(parts ? [] : [])],
  });
}

/**
 * Slime, Sand and Equipment Failure (p. 485): a HT+4 roll for a thing
 * carelessly exposed, off whatever health neglect has left it.
 */
export async function exposureCheck(options: {
  actor: any;
  item: any;
  cleaned: boolean;
  brutal: number;
}): Promise<void> {
  const { actor, item } = options;
  if (!item?.isOwner || !isRuleOn("repairs")) return;
  const facts = weaponFacts(item);
  const health = facts.firearm || facts.weaponClass === "firearm" ? 10 : 12;
  const target = equipmentFailureTarget({
    health,
    missedChecks: Number(item.system?.missedMaintenance ?? 0) || 0,
    cleaned: options.cleaned,
    brutal: options.brutal,
  });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, faces(roll));
  const result = exposureOutcome({ success: outcome.success, criticalFailure: outcome.criticalFailure });

  // A thing that has failed cannot work until it is mended, and the state
  // the book puts it in is the one the repair rules read: damaged for a
  // minor repair, out of hit points for a major one.
  if (result !== "works") {
    const hpLost = result === "needsMajorRepair"
      ? facts.hp
      : Math.max(Number(item.system?.hpLost ?? 0) || 0, Math.ceil(facts.hp / 2));
    await item.update({ "system.hpLost": hpLost });
  }

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    exposure: true,
    target,
    dice: faces(roll),
    roll: roll.total,
    outcome,
    result: L(`Exposure.${result}`),
    failed: result !== "works",
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });
}
