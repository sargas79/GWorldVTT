/**
 * The Assistance Roll (Basic Set Revised pp. 337-341), an optional rule.
 *
 * A Rank trait carrying the Patron value of the organization behind it gets
 * an "Assistance roll" action. The dialog takes the aid asked for, the Rank
 * used, the modifiers the book lists (Charisma and Smooth Operator counted
 * from the sheet), and rolls 3d against the table's number; a card gives the
 * outcome ladder and the numbers of the aid asked for.
 *
 * A complementary skill roll against the master skill "Assistance Roll"
 * (p. 206) is held as a pending modifier and taken by this roll like any other.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { currentControlRating } from "./legality.js";
import { pendingModifiers, skillName, COMPLEMENTARY_SOURCE } from "./pending-modifiers.js";
import { rollSuccess } from "./roll.js";
import { averageStartingWealth } from "../rules/wealth.js";
import {
  ASSISTANCE_TYPES,
  assistanceLines,
  assistanceOutcome,
  assistanceTarget,
  assistanceType,
  baseAssistanceRoll,
  cashAmount,
  cashModifier,
  consultationSkill,
  facilitiesBonus,
  isPrivilegeTrait,
  keyRank,
  licenseModifier,
  responderCount,
  type AssistanceType,
} from "../rules/pulling-rank.js";

/** The master skill a complementary roll for an Assistance Roll names. */
export const ASSISTANCE_MASTER = "Assistance Roll";

/** The actor flag holding how many Assistance Rolls the petitioner has made this adventure. */
export const ASSISTANCE_COUNT_FLAG = "assistanceRolls";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.PullingRank.${key}`, data) : game.i18n.localize(`GWORLD.PullingRank.${key}`);

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/** Whether a trait is a Rank an Assistance Roll can be made from: a Rank with a Patron value. */
export function isAssistanceRank(item: any): boolean {
  if (item?.type !== "trait") return false;
  const name = String(item.name ?? "");
  return /\bRank\b/.test(name) && Number(item.system?.patronValue) > 0;
}

/** The level of a named trait an actor holds, 0 where none. */
function traitLevels(actor: any, name: string): number {
  const wanted = name.toLowerCase();
  let total = 0;
  for (const item of actor?.items ?? []) {
    if (item.type === "trait" && String(item.name ?? "").toLowerCase() === wanted) total += Number(item.system?.levels) || 1;
  }
  return total;
}

/** The complementary bonus held for the next Assistance Roll. */
function heldComplementary(actor: any): number {
  return pendingModifiers(actor)
    .filter((m) => m.source === COMPLEMENTARY_SOURCE && m.skill !== null && skillName(m.skill) === skillName(ASSISTANCE_MASTER))
    .reduce((sum, m) => sum + m.value, 0);
}

/** Whether the Rank carries Capricious Assistance among its modifiers. */
function isCapricious(item: any): boolean {
  return ((item?.system?.modifiers ?? []) as Array<{ name?: string }>).some((m) => /capricious assistance/i.test(String(m.name ?? "")));
}

/** What the dialog asks for. */
interface Answer {
  type: string;
  rank: number;
  inWorld: number;
  meta: number;
  innate: number;
  previous: number;
  personToPerson: boolean;
  reputation: number;
  controlRating: number;
  legalityClass: number;
  night: boolean;
  returned: boolean;
  tl: number;
}

/** The figures an aid type gives at this Rank and Patron value, as lines for the card. */
function aidFigures(type: AssistanceType, ctx: { value: number; rank: number; tl: number; returned: boolean; night: boolean; startingMoney: number }): string[] {
  switch (type.key) {
    case "cash":
      return [L("Figure.cash", { amount: cashAmount(ctx.startingMoney, ctx.rank, ctx.returned) })];
    case "consultation":
    case "recordsSearch":
      return [L("Figure.consultation", { skill: consultationSkill(ctx.value) })];
    case "facilities":
      return [L("Figure.facilities", { bonus: signed(facilitiesBonus(ctx.value, ctx.tl)) })];
    case "generalizedAssistance":
      return [L("Figure.generalized", { crit: signed(Math.floor(ctx.value / 5)), success: signed(Math.floor(Math.floor(ctx.value / 5) / 2)) })];
    case "muscle":
    case "theCavalry":
      return [L("Figure.people", { count: responderCount(ctx.value) })];
    case "warrant":
      return [L(ctx.night ? "Figure.warrantNight" : "Figure.warrantDay")];
    default:
      return [];
  }
}

/** Asks for the roll's particulars. Resolves to null when cancelled. */
async function ask(actor: any, item: any, value: number, cost: number): Promise<Answer | null> {
  const esc = foundry.utils.escapeHTML;
  const own = Number(item.system?.levels) || 0;
  const previous = Number(actor.getFlag?.(SYSTEM_ID, ASSISTANCE_COUNT_FLAG)) || 0;
  const cr = currentControlRating();
  const tl = Number(actor.system?.tl) || 0;
  const row = "display:flex;align-items:center;justify-content:space-between;gap:8px";
  const num = (name: string, v: number, extra = "") =>
    `<input type="number" name="${name}" value="${v}" step="1" style="width:70px" ${extra}>`;
  const charisma = Math.max(0, Number(actor.system?.derived?.charismaInfluence) || 0);
  const smooth = traitLevels(actor, "Smooth Operator");
  const complementary = heldComplementary(actor);
  const autoNotes = [
    charisma ? L("Auto.charisma", { value: signed(charisma) }) : "",
    smooth ? L("Auto.smoothOperator", { value: signed(smooth) }) : "",
    complementary ? L("Auto.complementary", { value: signed(complementary) }) : "",
  ].filter(Boolean);
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    <p class="hint">${esc(L("DialogHint", { value, cost, key: keyRank(value, cost), base: baseAssistanceRoll(own, value, cost) }))}</p>
    <label style="${row}"><span>${esc(L("Aid"))}</span>
      <select name="type">${ASSISTANCE_TYPES.map((t) => `<option value="${t.key}">${esc(L(`Type.${t.key}`))}</option>`).join("")}</select></label>
    <label style="${row}"><span>${esc(L("RankUsed"))}</span>${num("rank", own, 'min="0"')}</label>
    <p class="hint" style="margin:0">${esc(L("RankHint"))}</p>
    <label style="${row}"><span>${esc(L("InWorld"))}</span>${num("inWorld", 0, 'min="-10" max="5"')}</label>
    <label style="${row}"><span>${esc(L("Meta"))}</span>${num("meta", 0, 'min="-10" max="5"')}</label>
    <label style="${row}"><span>${esc(L("Innate"))}</span>${num("innate", 0)}</label>
    <label style="${row}"><span>${esc(L("Previous"))}</span>${num("previous", previous, 'min="0"')}</label>
    <label style="${row}"><span>${esc(L("Reputation"))}</span>${num("reputation", 0)}</label>
    <label style="${row}"><span>${esc(L("PersonToPerson"))}</span><input type="checkbox" name="personToPerson" checked></label>
    <label style="${row}"><span>${esc(L("ControlRating"))}</span>${num("controlRating", cr ?? 0, 'min="0" max="6"')}</label>
    <label style="${row}"><span>${esc(L("LegalityClass"))}</span>${num("legalityClass", 0, 'min="0" max="4"')}</label>
    <label style="${row}"><span>${esc(L("Night"))}</span><input type="checkbox" name="night"></label>
    <label style="${row}"><span>${esc(L("Returned"))}</span><input type="checkbox" name="returned"></label>
    <label style="${row}"><span>${esc(L("TechLevel"))}</span>${num("tl", tl, 'min="0"')}</label>
    ${autoNotes.length ? `<p class="hint" style="margin:0">${esc(autoNotes.join("; "))}</p>` : ""}
  </div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("DialogTitle", { name: String(item.name ?? "") }) },
    content,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        const field = (name: string) => root?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`) ?? null;
        const n = (name: string) => Number((field(name) as HTMLInputElement | null)?.value) || 0;
        const flag = (name: string) => (field(name) as HTMLInputElement | null)?.checked === true;
        return {
          type: String(field("type")?.value ?? "anyAssistance"),
          rank: Math.max(0, n("rank")),
          inWorld: n("inWorld"),
          meta: n("meta"),
          innate: n("innate"),
          previous: Math.max(0, n("previous")),
          personToPerson: flag("personToPerson"),
          reputation: n("reputation"),
          controlRating: n("controlRating"),
          legalityClass: n("legalityClass"),
          night: flag("night"),
          returned: flag("returned"),
          tl: n("tl"),
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as Answer) : null;
}

/**
 * Makes an Assistance Roll from a Rank trait. Resolves to the outcome key, or
 * null where nothing was rolled (the rule is off, the trait has no Patron
 * value, the target was under 3, or the dialog was cancelled).
 */
export async function rollAssistance(actor: any, item: any): Promise<string | null> {
  if (!isRuleOn("pullingRank") || !actor || !item) return null;
  const value = Number(item.system?.patronValue) || 0;
  const cost = Number(item.system?.pointsPerLevel) || 0;
  if (!(value > 0) || !(cost > 0)) {
    ui.notifications?.warn(L("NoPatronValue"));
    return null;
  }
  if (isPrivilegeTrait(String(item.name ?? ""))) return null;
  const answer = await ask(actor, item, value, cost);
  if (!answer) return null;
  const type = assistanceType(answer.type) ?? ASSISTANCE_TYPES[0]!;

  const base = baseAssistanceRoll(answer.rank, value, cost);
  let innate = answer.innate;
  if (type.byPatron) innate += cashModifier(value);
  if (type.byCRandLC) innate += licenseModifier(answer.controlRating, answer.legalityClass);
  const mods = {
    inWorld: type.unmodified ? 0 : answer.inWorld,
    meta: type.unmodified ? 0 : answer.meta,
    innate: type.unmodified ? 0 : innate,
    previousRequests: type.unmodified ? 0 : answer.previous,
    charisma: type.unmodified || !answer.personToPerson ? 0 : Math.max(0, Number(actor.system?.derived?.charismaInfluence) || 0),
    smoothOperator: type.unmodified || !answer.personToPerson ? 0 : traitLevels(actor, "Smooth Operator"),
    reputation: type.unmodified ? 0 : answer.reputation,
  };
  const modifiers = assistanceLines(mods).map((line) => ({ label: L(`Line.${line.key}`), value: line.value }));
  const { target, attempt } = assistanceTarget(base, mods);
  const label = L("Label", { name: String(item.name ?? ""), aid: L(`Type.${type.key}`) });
  if (!attempt && !type.unmodified) {
    ui.notifications?.warn(L("TooLow", { target }));
    return null;
  }

  const rolled = await rollSuccess({
    actor,
    base,
    label,
    kind: "skill",
    skill: ASSISTANCE_MASTER,
    modifiers,
    tags: ["assistance"],
  });
  if (!rolled) return null;
  // Counts as a request only once it was rolled.
  if (!type.unmodified) await actor.setFlag?.(SYSTEM_ID, ASSISTANCE_COUNT_FLAG, answer.previous + 1);

  const capricious = isCapricious(item);
  const outcome = assistanceOutcome({
    success: rolled.success,
    criticalSuccess: rolled.criticalSuccess,
    criticalFailure: rolled.criticalFailure,
    margin: rolled.margin,
    inWorldPenalty: mods.inWorld < 0,
    capricious,
  });
  const figures = outcome === "aid" || outcome === "aidComplicated"
    ? aidFigures(type, {
        value,
        rank: answer.rank,
        tl: answer.tl,
        returned: answer.returned,
        night: answer.night,
        startingMoney: averageStartingWealth(Number(actor.system?.tl) || answer.tl),
      })
    : [];
  const esc = foundry.utils.escapeHTML;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content:
      `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Title"))}</span>` +
      `<span class="gc-target">${esc(L(`Type.${type.key}`))}</span></div>` +
      `<div class="gc-note"><strong>${esc(L(`Outcome.${outcome}`))}</strong></div>` +
      figures.map((f) => `<div class="gc-note">${esc(f)}</div>`).join("") +
      `</div>`,
    flags: { [SYSTEM_ID]: { assistanceRoll: { aid: type.key, outcome, rank: answer.rank, target } } },
  });
  return outcome;
}

/** Sets the count of Assistance Rolls this adventure back to none. */
export async function resetAssistanceCount(actor: any): Promise<void> {
  await actor?.unsetFlag?.(SYSTEM_ID, ASSISTANCE_COUNT_FLAG);
}
