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
import { normalizeSkillName } from "../rules/skills.js";
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
  type FailureOutcome,
  healthAfterNeglect,
  needsMaintenance,
} from "../rules/repairs.js";
import { weaponFacts } from "./weapon-damage.js";
import { equipmentFailureModifiers, type ModifierLine } from "./combat-extensions.js";

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
  "Armoury", "Electrician", "Electronics Repair", "Machinist", "Mechanic", "Smith",
] as const;

/**
 * The best repair skill on the sheet, or null where there is none. The book
 * names the skills without their "/TL" or specialty -- which specialty fits
 * the job is the GM's call -- so any specialty of one counts, "Armoury/TL
 * (Body Armor)" as much as "Electrician/TL".
 */
export function repairSkillOf(actor: any): { name: string; level: number } | null {
  const wanted = REPAIR_SKILLS.map((skill) => normalizeSkillName(skill));
  let best: { name: string; level: number } | null = null;
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    const name = String(item.name ?? "");
    const bare = normalizeSkillName(name).replace(/\s*\(.*\)$/, "");
    if (!wanted.includes(bare)) continue;
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
  let partsRoll: any = null;
  if (state.kind === "major") {
    partsRoll = new Roll("1d6");
    await partsRoll.evaluate();
    parts = { die: partsRoll.total, cost: sparePartsCost(state.cost, partsRoll.total) };
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
    rolls: partsRoll ? [roll, partsRoll] : [roll],
  });
}

/** How an equipment failure roll went: the success roll's result, in the three words a module needs. */
export type EquipmentFailureOutcome = "success" | "failure" | "criticalFailure";

/** What `items.equipmentFailure` resolves to. */
export interface EquipmentFailureResult {
  outcome: EquipmentFailureOutcome;
  /** What the failure costs the thing (p. 485): nothing, a minor repair or a major one. */
  result: FailureOutcome;
  target: number;
  roll: number;
  margin: number;
  /** Whether the thing's hit points were marked down to what the result calls for. */
  applied: boolean;
}

/**
 * The thing's HT for the book's rolls (p. 485): "Most machines and similar
 * artifacts in good repair are HT 10. Swords, tables, shields, and other
 * solid, Homogenous objects are HT 12." A module may make the thing sturdier
 * or frailer (`gworld.objectStats`). Missed maintenance wears down "machines
 * and similar artifacts", and "this rule does not apply to items without
 * moving parts": a sword left uncleaned is a dirty sword, not a failing one.
 */
function failureHealth(item: any): { health: number; missedChecks: number; hp: number } {
  const facts = weaponFacts(item);
  const maintained = needsMaintenance({ movingParts: facts.firearm });
  return {
    health: facts.ht,
    missedChecks: maintained ? Number(item.system?.missedMaintenance ?? 0) || 0 : 0,
    hp: facts.hp,
  };
}

/**
 * Rolls against a failure target already worked out, marks the thing down
 * and posts the card: the half the exposure check and a module's roll share.
 */
async function rollEquipmentFailure(options: {
  actor: any;
  item: any;
  target: number;
  /** The thing's hit points, which a failure marks down. */
  hp: number;
  /** Lines the card shows beside the hook's: the module's own modifier. */
  lines: ModifierLine[];
  failureModifiers: ModifierLine[];
  title: string;
  apply: boolean;
}): Promise<EquipmentFailureResult> {
  const { actor, item, target } = options;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, faces(roll));
  const result = exposureOutcome({ success: outcome.success, criticalFailure: outcome.criticalFailure });

  // A thing that has failed cannot work until it is mended, and the state
  // the book puts it in is the one the repair rules read: damaged for a
  // minor repair, out of hit points for a major one. Armour keeps no hit
  // points to mark.
  const { hp } = options;
  const marks = options.apply && result !== "works" && hp > 0 && item.system?.hpLost !== undefined;
  if (marks) {
    const hpLost = result === "needsMajorRepair"
      ? hp
      : Math.max(Number(item.system?.hpLost ?? 0) || 0, Math.ceil(hp / 2));
    await item.update({ "system.hpLost": hpLost });
  }

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    exposure: true,
    title: options.title,
    target,
    failureModifiers: [...options.lines, ...options.failureModifiers].filter((m) => m.value !== 0),
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

  return {
    outcome: outcome.criticalFailure ? "criticalFailure" : outcome.success ? "success" : "failure",
    result,
    target,
    roll: roll.total,
    margin: outcome.margin,
    applied: marks,
  };
}

/**
 * Slime, Sand and Equipment Failure (p. 485): a HT+4 roll for a thing
 * carelessly exposed, off whatever health neglect has left it.
 */
export async function exposureCheck(options: {
  actor: any;
  item: any;
  /**
   * How the gear has been treated, as one number: +1 for the daily clean
   * the book rewards, 0 for ordinary use, -1 or -2 for abuse.
   */
  care: number;
}): Promise<void> {
  const { actor, item } = options;
  if (!item?.isOwner || !isRuleOn("repairs")) return;
  const { health, missedChecks, hp } = failureHealth(item);
  const failure = equipmentFailureModifiers(actor, item, equipmentFailureTarget({
    health,
    missedChecks,
    cleaned: options.care > 0,
    brutal: options.care < 0 ? options.care : 0,
  }));
  await rollEquipmentFailure({
    actor,
    item,
    target: failure.target,
    hp,
    lines: [],
    failureModifiers: failure.modifiers,
    title: L("ExposureTitle", { name: String(item.name) }),
    apply: true,
  });
}

/**
 * An equipment failure roll a module asks for (p. 485): the thing's HT, off
 * whatever health neglect has left it, at the module's modifier -- a daily
 * reliability check, a machine stopped in a hurry. Without the exposure
 * check's +4, which is for gear carelessly exposed. The hook has its say,
 * the card is posted, and on a failure the thing is marked down as the book
 * says unless `apply` is false. Null where the user doesn't own the item.
 */
export async function equipmentFailure(options: {
  actor?: any;
  item: any;
  modifier?: number;
  label?: string;
  apply?: boolean;
}): Promise<EquipmentFailureResult | null> {
  const { item } = options;
  if (!item?.isOwner) return null;
  const actor = options.actor ?? item.actor ?? null;
  const label = typeof options.label === "string" && options.label.trim() ? options.label.trim() : null;
  const modifier = Math.trunc(Number(options.modifier) || 0);
  const { health, missedChecks, hp } = failureHealth(item);
  const base = healthAfterNeglect(health, missedChecks);
  const failure = equipmentFailureModifiers(actor, item, base + modifier, label);
  return rollEquipmentFailure({
    actor,
    item,
    target: failure.target,
    hp,
    lines: [{ label: label ?? L("FailureModifier"), value: modifier }],
    failureModifiers: failure.modifiers,
    title: L("FailureTitle", { name: String(item.name), label: label ?? L("FailureLabel") }),
    apply: options.apply !== false,
  });
}
