/**
 * A weapon that malfunctioned, and putting it right (GURPS Basic Set:
 * Campaigns p. 407; since API 1.71.0).
 *
 * The attack roll that reaches Malf. rolls on the Firearm Malfunction Table,
 * and the modules have their say on what it landed on through
 * `gworld.malfunction`. A weapon left out of action keeps the malfunction as
 * a flag on the item until it is cleared: it will not fire, the sheet says
 * so, and its Clear button makes the Armoury or IQ-based weapon skill roll
 * the table asks for -- after `gworld.clearMalfunction` has changed the
 * procedure where a module's rules do.
 */

import { SYSTEM_ID } from "./constants.js";
import { COMBAT_HOOKS, callCombatHook, type ModifierLine } from "./combat-extensions.js";
import { normalizeSkillName } from "../rules/skills.js";
import {
  REPAIRS,
  basedOnAnother,
  clearingResult,
  clearingRolls,
  clearsItself,
  type ClearingResult,
  type Malfunction,
} from "../rules/malfunctions.js";

/** Where an item keeps what is wrong with it. */
export const MALFUNCTION_FLAG = "malfunction";

const KINDS: readonly Malfunction[] = ["mechanical", "misfire", "stoppage", "explosion"];
const isKnown = (kind: unknown): kind is Malfunction => KINDS.includes(kind as Malfunction);

/** A weapon out of action, as its flag keeps it. */
export interface WeaponMalfunction {
  /** One of the table's kinds, a module's own, or `destroyed` after a critical failure clearing it. */
  kind: string;
  label: string;
  /** The mode that was fired when it happened. */
  modeIndex: number;
}

const localize = (key: string, data?: Record<string, unknown>): string => {
  const i18n = (globalThis as any).game?.i18n;
  if (!i18n) return key;
  return data ? i18n.format(`GWORLD.Malfunction.${key}`, data) : i18n.localize(`GWORLD.Malfunction.${key}`);
};

/** What an item's flag says is wrong with it, or null where nothing is. */
export function malfunctionOf(item: any): WeaponMalfunction | null {
  const flag = item?.getFlag?.(SYSTEM_ID, MALFUNCTION_FLAG) ?? item?.flags?.[SYSTEM_ID]?.[MALFUNCTION_FLAG];
  if (!flag || typeof flag !== "object" || typeof flag.kind !== "string" || !flag.kind) return null;
  return {
    kind: flag.kind,
    label: typeof flag.label === "string" && flag.label ? flag.label : labelFor(flag.kind),
    modeIndex: Number.isInteger(flag.modeIndex) ? flag.modeIndex : 0,
  };
}

/**
 * Puts a weapon out of action, or back in it with null. False where the user
 * doesn't own the item.
 */
export async function setMalfunction(item: any, malfunction: { kind: string; label?: string; modeIndex?: number } | null): Promise<boolean> {
  if (!item?.isOwner) return false;
  if (malfunction === null) {
    if (malfunctionOf(item)) await item.unsetFlag(SYSTEM_ID, MALFUNCTION_FLAG);
    return true;
  }
  if (typeof malfunction.kind !== "string" || !malfunction.kind) return false;
  await item.setFlag(SYSTEM_ID, MALFUNCTION_FLAG, {
    kind: malfunction.kind,
    label: typeof malfunction.label === "string" && malfunction.label ? malfunction.label : labelFor(malfunction.kind),
    modeIndex: Number.isInteger(malfunction.modeIndex) ? malfunction.modeIndex : 0,
  });
  return true;
}

function labelFor(kind: string): string {
  return isKnown(kind) || kind === "destroyed" ? localize(kind) : kind;
}

// ── the table's result, as the modules leave it ────────────────────────────

/** What a malfunction came to, as the attack card reports it. */
export interface MalfunctionReport {
  kind: string;
  label: string;
  /** What putting it right takes, in words. */
  repair: string;
  /** "The weapon fires one shot, then jams": the attack still happens. */
  fires: boolean;
  /** A revolver's misfire, which costs nothing but the shot. */
  clears: boolean;
  explodes: boolean;
  /** Whether the weapon is left out of action until it is cleared. */
  jams: boolean;
}

/** What `gworld.malfunction` hands its listeners. */
export interface MalfunctionContext extends MalfunctionReport {
  actor: any;
  item: any;
  modeIndex: number | null;
  /** The attack roll that reached Malf., and the 3d rolled on the table. */
  attackRoll: number;
  roll: number;
  techLevel: number;
  revolver: boolean;
}

/** The table's own reading of a kind. A module's kind is out of action and says only its name. */
function reportFor(kind: string, revolver: boolean): MalfunctionReport {
  if (!isKnown(kind)) return { kind, label: kind, repair: "", fires: false, clears: false, explodes: false, jams: true };
  const repair = REPAIRS[kind];
  const clears = clearsItself(kind, revolver);
  return {
    kind,
    label: localize(kind),
    repair: clears
      ? localize("Revolver")
      : repair.hours > 0
        ? localize("Hours", { hours: repair.hours })
        : localize("Ready", { ready: repair.readyManeuvers }),
    // "The weapon fires one shot, then jams. (Treat the fired shot as a normal attack.)"
    fires: kind === "stoppage",
    clears,
    explodes: kind === "explosion",
    jams: !clears,
  };
}

/**
 * The malfunction an attack came to, once `gworld.malfunction` has had its
 * say: null where a listener set `kind` to null, and the shot goes off as
 * though nothing had happened. A listener that changes `kind` gets the rest
 * worked out again for the new kind, except what it set itself.
 */
export function malfunctionWithHooks(base: {
  actor: any;
  item: any;
  modeIndex: number | null;
  attackRoll: number;
  roll: number;
  techLevel: number;
  revolver: boolean;
  kind: Malfunction;
}): MalfunctionReport | null {
  const table = reportFor(base.kind, base.revolver);
  const context: MalfunctionContext = { ...base, ...table };
  callCombatHook(COMBAT_HOOKS.malfunction, context);
  if (context.kind === null || context.kind === undefined || (context.kind as unknown) === "") return null;
  const kind = String(context.kind);
  const fresh = kind === table.kind ? table : reportFor(kind, base.revolver);
  const pick = <K extends keyof MalfunctionReport>(key: K, valid: (v: unknown) => boolean): MalfunctionReport[K] =>
    context[key] !== table[key] && valid(context[key]) ? context[key] : fresh[key];
  const isString = (v: unknown) => typeof v === "string";
  const isBoolean = (v: unknown) => typeof v === "boolean";
  return {
    kind,
    label: pick("label", isString) || kind,
    repair: pick("repair", isString),
    fires: pick("fires", isBoolean),
    clears: pick("clears", isBoolean),
    explodes: pick("explodes", isBoolean),
    jams: pick("jams", isBoolean),
  };
}

// ── clearing it ────────────────────────────────────────────────────────────

/** One roll that may clear the weapon, as the dialog offers it. */
export interface ClearingOption {
  key: string;
  label: string;
  /** The level rolled against before `modifier`; null where the character can't make it. */
  level: number | null;
  modifier: number;
}

/** Something that helps, offered as a choice: an assistant, a tool. */
export interface ClearingAid {
  id: string;
  label: string;
  /** Added to the roll. */
  modifier?: number;
  /** Replaces the Ready maneuvers, or the hours, an attempt takes. */
  readyManeuvers?: number;
  hours?: number;
  checked?: boolean;
}

/** What `gworld.clearMalfunction` hands its listeners; everything but the first four is theirs to change. */
export interface ClearMalfunctionContext {
  actor: any;
  item: any;
  modeIndex: number;
  malfunction: WeaponMalfunction;
  rolls: ClearingOption[];
  /** Ready maneuvers an attempt takes, and the hours for one measured in hours. */
  readyManeuvers: number;
  hours: number;
  needsBothHands: boolean;
  /** What a critical failure does: makes it a mechanical problem, or destroys the weapon. */
  criticalFailure: "mechanical" | "destroyed";
  /** Lines every roll takes. */
  modifiers: ModifierLine[];
  aids: ClearingAid[];
  /** Why it can't be tried now, or null. */
  refusal: string | null;
}

/** The character's best Armoury, a small-arms specialty first; null where they know none. */
function armouryLevel(actor: any): number | null {
  let best: number | null = null;
  let smallArms: number | null = null;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    const name = normalizeSkillName(String(item.name ?? ""));
    if (!/^armou?ry\b/.test(name)) continue;
    const level = item.system?.derived?.level;
    if (typeof level !== "number") continue;
    if (/small arms/.test(name)) smallArms = Math.max(smallArms ?? level, level);
    best = Math.max(best ?? level, level);
  }
  return smallArms ?? best;
}

function attributeOf(actor: any, key: string): number | null {
  const value = actor?.system?.derived?.attributes?.[key] ?? actor?.system?.attributes?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The weapon skill, IQ-based (Characters p. 172), for the mode that malfunctioned. */
function iqBasedWeaponSkill(actor: any, item: any, modeIndex: number): { name: string; level: number } | null {
  const rows: any[] = actor?.system?.derived?.ranged ?? [];
  const row = rows.find((r) => r?.itemId === item?.id && r?.modeIndex === modeIndex) ?? rows.find((r) => r?.itemId === item?.id);
  if (!row || typeof row.skillLevel !== "number") return null;
  const name = String(row.skillName ?? item?.system?.rangedModes?.[modeIndex]?.skill ?? "");
  const skill = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && normalizeSkillName(String(i.name ?? "")) === normalizeSkillName(name));
  const attribute = attributeOf(actor, String(skill?.system?.attribute ?? "DX"));
  const iq = attributeOf(actor, "IQ");
  if (attribute === null || iq === null) return null;
  return { name, level: basedOnAnother(row.skillLevel, attribute, iq) };
}

/**
 * What clearing a weapon takes (p. 407), once `gworld.clearMalfunction` has
 * had its say; null where nothing is wrong with it. A destroyed weapon is
 * refused.
 */
export function clearingProcedure(actor: any, item: any): ClearMalfunctionContext | null {
  const malfunction = malfunctionOf(item);
  if (!malfunction) return null;
  // A module's own kind is cleared as the table's worst unless it says otherwise.
  const kind: Malfunction = isKnown(malfunction.kind) ? malfunction.kind : "mechanical";
  const repair = REPAIRS[kind];
  const iq = attributeOf(actor, "IQ");
  const armoury = armouryLevel(actor);
  const weapon = iqBasedWeaponSkill(actor, item, malfunction.modeIndex);
  const rolls: ClearingOption[] = clearingRolls(kind).map((roll) =>
    roll.skill === "armoury"
      ? {
          key: "armoury",
          label: localize("Armoury"),
          // Armoury defaults to IQ-5 (Characters p. 178).
          level: armoury ?? (iq === null ? null : iq - 5),
          modifier: roll.modifier,
        }
      : { key: "weapon", label: localize("WeaponSkill", { skill: weapon?.name ?? "" }), level: weapon?.level ?? null, modifier: roll.modifier },
  );
  const context: ClearMalfunctionContext = {
    actor,
    item,
    modeIndex: malfunction.modeIndex,
    malfunction,
    rolls,
    readyManeuvers: repair.readyManeuvers,
    hours: repair.hours,
    needsBothHands: repair.needsBothHands,
    criticalFailure: repair.criticalFailure,
    modifiers: [],
    aids: [],
    refusal: malfunction.kind === "destroyed" ? localize("Destroyed") : null,
  };
  callCombatHook(COMBAT_HOOKS.clearMalfunction, context);
  const whole = (n: unknown, fallback: number) => (Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : fallback);
  return {
    ...context,
    rolls: (Array.isArray(context.rolls) ? context.rolls : rolls).filter((r) => r && typeof r.key === "string" && typeof r.label === "string"),
    readyManeuvers: whole(context.readyManeuvers, repair.readyManeuvers),
    hours: whole(context.hours, repair.hours),
    criticalFailure: context.criticalFailure === "destroyed" ? "destroyed" : "mechanical",
    modifiers: (Array.isArray(context.modifiers) ? context.modifiers : []).filter((l) => typeof l?.label === "string" && Number.isFinite(l?.value)),
    aids: (Array.isArray(context.aids) ? context.aids : []).filter((a) => a && typeof a.id === "string" && typeof a.label === "string"),
    refusal: typeof context.refusal === "string" && context.refusal ? context.refusal : null,
  };
}

/**
 * What one attempt took and did, from the choices made: the roll picked,
 * the aids used and the lines they add, and the time spent.
 */
export function clearingAttempt(procedure: ClearMalfunctionContext, choice: { roll: string; aids: readonly string[]; modifier?: number }): {
  option: ClearingOption | null;
  modifiers: ModifierLine[];
  readyManeuvers: number;
  hours: number;
} {
  const option = procedure.rolls.find((r) => r.key === choice.roll) ?? null;
  const aids = procedure.aids.filter((aid) => choice.aids.includes(aid.id));
  const modifiers: ModifierLine[] = [
    ...(option && option.modifier !== 0 ? [{ label: option.label, value: option.modifier }] : []),
    ...procedure.modifiers,
    ...aids.filter((aid) => Number(aid.modifier)).map((aid) => ({ label: aid.label, value: Number(aid.modifier) })),
    ...(Number(choice.modifier) ? [{ label: localize("Other"), value: Number(choice.modifier) }] : []),
  ];
  const last = <K extends "readyManeuvers" | "hours">(key: K) =>
    aids.reduce((n, aid) => (Number.isFinite(Number(aid[key])) ? Math.max(0, Math.floor(Number(aid[key]))) : n), procedure[key]);
  return { option, modifiers, readyManeuvers: last("readyManeuvers"), hours: last("hours") };
}

/**
 * Tries to clear a weapon's malfunction: asks which roll and what helps,
 * rolls it, and leaves the weapon cleared, still out of action, a mechanical
 * problem, or destroyed. Null where nothing was tried.
 */
export async function clearMalfunction(actor: any, item: any): Promise<ClearingResult | null> {
  if (!item?.isOwner) return null;
  const procedure = clearingProcedure(actor, item);
  if (!procedure) return null;
  if (procedure.refusal) {
    ui.notifications?.warn(procedure.refusal);
    return null;
  }
  const usable = procedure.rolls.filter((r) => typeof r.level === "number");
  if (usable.length === 0) {
    ui.notifications?.warn(localize("NoRoll", { name: String(item.name ?? "") }));
    return null;
  }
  const esc = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));
  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
  const time = procedure.hours > 0
    ? localize("AttemptHours", { hours: procedure.hours })
    : localize("AttemptReady", { ready: procedure.readyManeuvers });
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p style="margin:0">${esc(localize("ClearIntro", { name: String(item.name ?? ""), kind: procedure.malfunction.label, time }))}${procedure.needsBothHands ? ` ${esc(localize("BothHands"))}` : ""}</p>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(localize("Roll"))}</span>
        <select name="roll">${usable.map((r) => `<option value="${esc(r.key)}">${esc(`${r.label} ${r.level}${r.modifier ? ` (${signed(r.modifier)})` : ""}`)}</option>`).join("")}</select>
      </label>
      ${procedure.aids.map((aid, i) => `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="aid-${i}"${aid.checked ? " checked" : ""}><span>${esc(aid.label)}</span></label>`).join("")}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(localize("Other"))}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:70px">
      </label>
    </div>`;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: localize("ClearTitle", { name: String(item.name ?? "") }) },
    content,
    ok: {
      label: localize("Clear"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          roll: form?.querySelector<HTMLSelectElement>('select[name="roll"]')?.value ?? usable[0]!.key,
          aids: procedure.aids.filter((_aid, i) => form?.querySelector<HTMLInputElement>(`input[name="aid-${i}"]`)?.checked === true).map((aid) => aid.id),
          modifier: Number(form?.querySelector<HTMLInputElement>('input[name="modifier"]')?.value) || 0,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object") return null;
  const attempt = clearingAttempt(procedure, answer as { roll: string; aids: string[]; modifier: number });
  if (!attempt.option || typeof attempt.option.level !== "number") return null;

  // The roll module reaches this one, so it is loaded when the roll is made.
  const { rollSuccess } = await import("./roll.js");
  const outcome = await rollSuccess({
    actor,
    base: attempt.option.level,
    label: localize("ClearTitle", { name: String(item.name ?? "") }),
    modifiers: attempt.modifiers,
    tags: ["clearMalfunction"],
  });
  if (!outcome) return null;
  const result = clearingResult(outcome, procedure.criticalFailure);
  if (result === "cleared") await setMalfunction(item, null);
  else if (result === "mechanical") await setMalfunction(item, { kind: "mechanical", modeIndex: procedure.modeIndex });
  else if (result === "destroyed") await setMalfunction(item, { kind: "destroyed", modeIndex: procedure.modeIndex });
  // Each attempt is Ready maneuvers, where it isn't an hour's work.
  if (attempt.hours <= 0 && attempt.readyManeuvers > 0 && actor?.isOwner && actor.system?.maneuver !== undefined) {
    await actor.update({ "system.maneuver": "ready" });
  }
  const spent = attempt.hours > 0 ? localize("AttemptHours", { hours: attempt.hours }) : localize("AttemptReady", { ready: attempt.readyManeuvers });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(localize("ClearTitle", { name: String(item.name ?? "") }))}</span></div>
      <div class="gc-result">${esc(localize(`Result.${result}`, { name: String(item.name ?? "") }))} <span class="gc-mod">${esc(spent)}</span></div></div>`,
  });
  return result;
}
