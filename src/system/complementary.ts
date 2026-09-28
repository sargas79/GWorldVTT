/**
 * Complementary skills (GURPS Basic Set Revised p. 206; long tasks p. 346).
 *
 * A complementary skill is rolled before the master skill it assists, at
 * personal modifiers only, and its outcome becomes a modifier -- +2 to -2 --
 * on the master skill. The roll here holds that modifier on whoever will
 * attempt the master skill, as a bonus held for a later roll
 * (`pending-modifiers.ts`): the next roll of the master skill takes it and
 * uses it up, and the roll dialog lists it and lets it be discarded.
 *
 * A bonus can't be chained: a skill that holds a complementary bonus can't
 * itself complement another. And on a long task the master skill may take
 * several complementary skills at once, up to +4 in all; otherwise a new
 * complementary roll replaces the one held.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import {
  COMPLEMENTARY_SOURCE,
  addPendingModifier,
  pendingModifierMatches,
  pendingModifiers,
  removePendingModifier,
  skillName,
  type PendingModifier,
} from "./pending-modifiers.js";
import { rollSuccess, standingRollLines, type RollModifier } from "./roll.js";
import { rollQuickContest } from "./contest.js";
import { targetedTokens } from "./targets.js";
import { complementaryBonus, complementaryRoom, contestMarginFor } from "../rules/complementary.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.Complementary.${key}`, data)
    : game.i18n.localize(`GWORLD.Complementary.${key}`);

/** The complementary bonuses an actor holds for one master skill. */
export function complementaryHeldFor(actor: any, master: string): PendingModifier[] {
  const wanted = skillName(master);
  return pendingModifiers(actor).filter(
    (m) => m.source === COMPLEMENTARY_SOURCE && m.skill !== null && skillName(m.skill) === wanted,
  );
}

/**
 * Whether a skill is a master skill at the moment: it holds a complementary
 * bonus, which its next roll would take. It can't complement a third skill
 * (p. 206: no chaining).
 */
export function isMasterSkill(actor: any, skill: string): boolean {
  return pendingModifiers(actor).some(
    (m) =>
      m.source === COMPLEMENTARY_SOURCE && pendingModifierMatches(m, { skill, tags: ["skill"] }),
  );
}

/** What a complementary roll is asked to do. */
export interface ComplementaryRequest {
  /** Who rolls the complementary skill. */
  actor: any;
  /** The complementary skill: its name, its level as the sheet shows it, the equipment in that level, and its attribute. */
  skill: { name: string; level: number; equipment?: number; attribute?: string };
  /** The master skill it assists, by name. */
  master: string;
  /** Who will attempt the master skill and so holds the modifier. The roller, where left out. */
  recipient?: any;
  /** A long task with several complementary skills: they add up, to +4 (p. 206). */
  longTask?: boolean;
  /** The opponent, and the score it resists with, where the complementary skill is a Quick Contest. */
  contest?: { foe: any; base: number } | null;
}

/** What came of it: the modifier the roll earned and the part of it held. */
export interface ComplementaryResult {
  /** The modifier the outcome gave, +2 to -2. */
  bonus: number;
  /** What was held for the master skill: less than the bonus where the +4 cap left room for only part of it. */
  held: number;
  /** The id of the held bonus, or null where none was held. */
  id: string | null;
}

/**
 * Rolls a complementary skill and holds the modifier it earns for the master
 * skill. Resolves to null where nothing was rolled: the rule is off, the
 * skill can't be attempted, or it was refused.
 */
export async function rollComplementary(
  request: ComplementaryRequest,
): Promise<ComplementaryResult | null> {
  if (!isRuleOn("complementarySkills")) return null;
  const { actor, skill } = request;
  const recipient = request.recipient ?? actor;
  const master = String(request.master ?? "").trim();
  if (!actor || !master || !Number.isFinite(skill?.level)) return null;

  // "A complementary skill can't boost a master skill that serves to
  // complement some third skill."
  if (isMasterSkill(actor, skill.name)) {
    ui.notifications?.warn(L("NoChaining", { skill: skill.name }));
    return null;
  }
  if (recipient.isOwner !== true) {
    ui.notifications?.warn(L("NotYours", { name: String(recipient.name ?? "") }));
    return null;
  }

  // Personal modifiers only, "never external ones": what afflictions and
  // conditions do to the roller, but not the equipment in the skill's level.
  const equipment = Number(skill.equipment) || 0;
  const modifiers: RollModifier[] = [
    ...standingRollLines(actor, {
      rollType: "skill",
      ranged: false,
      basedOn: skill.attribute,
      dialogAsked: false,
    }),
    ...(equipment !== 0 ? [{ label: L("NoEquipment"), value: -equipment }] : []),
  ];
  const label = L("Label", { skill: skill.name, master });

  let outcome:
    | { contestMargin: number }
    | { success: boolean; criticalSuccess: boolean; criticalFailure: boolean };
  if (request.contest?.foe) {
    const rolled = await rollQuickContest({
      label,
      first: { actor, base: skill.level, modifiers, note: skill.name },
      second: { actor: request.contest.foe, base: request.contest.base, note: skill.name },
      tags: ["complementary"],
      returnRefusal: true,
    });
    if ("refused" in rolled) return null;
    outcome = { contestMargin: contestMarginFor(rolled) };
  } else {
    const rolled = await rollSuccess({
      actor,
      base: skill.level,
      label,
      kind: "skill",
      skill: skill.name,
      modifiers,
      tags: ["complementary"],
    });
    if (!rolled) return null;
    outcome = {
      success: rolled.success,
      criticalSuccess: rolled.criticalSuccess,
      criticalFailure: rolled.criticalFailure,
    };
  }

  const bonus = complementaryBonus(outcome);
  const held = complementaryHeldFor(recipient, master);
  let value: number = bonus;
  if (request.longTask === true) {
    // Several complementary skills, "the total bonus cannot exceed +4".
    value = complementaryRoom(
      held.map((m) => m.value),
      bonus,
    );
  } else {
    // One complementary bonus for the task: a new roll takes the place of the last.
    for (const old of held) await removePendingModifier(recipient, old.id);
  }
  const id =
    value === 0
      ? null
      : await addPendingModifier(recipient, {
          label: L("Line", { skill: skill.name, helper: String(actor.name ?? "") }),
          value,
          skill: master,
          source: COMPLEMENTARY_SOURCE,
        });

  const kept = id === null ? 0 : value;
  await postComplementary({ actor, recipient, skill: skill.name, master, bonus, held: kept });
  return { bonus, held: kept, id };
}

/** Says on a card what the complementary roll earned, and for whom. */
async function postComplementary(card: {
  actor: any;
  recipient: any;
  skill: string;
  master: string;
  bonus: number;
  held: number;
}): Promise<void> {
  const esc = foundry.utils.escapeHTML;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const capped = card.held !== card.bonus;
  const text =
    capped && card.held === 0
      ? L("CardCapped", { master: card.master })
      : L("Card", {
          recipient: String(card.recipient.name ?? ""),
          master: card.master,
          bonus: signed(card.held),
        });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: card.actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content:
      `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Title"))}</span>` +
      `<span class="gc-target">${esc(card.skill)} &rarr; ${esc(card.master)}</span></div>` +
      `<div class="gc-note">${esc(text)}</div>` +
      (capped && card.held > 0
        ? `<div class="gc-note">${esc(L("CardPartlyCapped", { bonus: signed(card.bonus) }))}</div>`
        : "") +
      `</div>`,
    flags: {
      [SYSTEM_ID]: {
        complementary: {
          skill: card.skill,
          master: card.master,
          bonus: card.bonus,
          held: card.held,
        },
      },
    },
  });
}

/** The skills of an actor, by name, as the dialog offers them. */
function skillNames(actor: any): string[] {
  return [...(actor?.items ?? [])]
    .filter((i: any) => i?.type === "skill")
    .map((i: any) => String(i.name ?? ""));
}

/** The characters the user could ask to attempt the master skill: those they own. */
function candidates(): any[] {
  return [...((game as any).actors ?? [])].filter(
    (a: any) => (a?.type === "character" || a?.type === "npc") && a.isOwner === true,
  );
}

/** What the dialog asks. */
export interface ComplementaryAnswer {
  master: string;
  recipient: any;
  longTask: boolean;
  contest: { foe: any; base: number } | null;
}

/**
 * Asks which skill the roll assists and who will attempt it, whether it is a
 * long task, and -- where the user has one token targeted -- whether the
 * target resists in a Quick Contest and at what score.
 */
export async function promptForComplementary(
  actor: any,
  skill: string,
): Promise<ComplementaryAnswer | null> {
  const esc = foundry.utils.escapeHTML;
  const people = [actor, ...candidates().filter((a) => a !== actor)];
  const masters = [...new Set(people.flatMap(skillNames))]
    .filter((name) => skillName(name) !== skillName(skill))
    .sort((a, b) => a.localeCompare(b));
  const targets = targetedTokens();
  const foe = targets.length === 1 ? (targets[0]?.actor ?? null) : null;

  const row = "display:flex;align-items:center;justify-content:space-between;gap:8px";
  const who =
    people.length > 1
      ? `<label style="${row}"><span>${esc(L("Recipient"))}</span>
         <select name="recipient">${people.map((a, i) => `<option value="${i}">${esc(String(a.name ?? ""))}</option>`).join("")}</select>
       </label>`
      : "";
  const contest = foe
    ? `<label style="${row}"><span><input type="checkbox" name="contested"> ${esc(L("ContestedBy", { name: String(foe.name ?? "") }))}</span>
         <input type="number" name="theirs" value="10" step="1" style="width:70px" aria-label="${esc(L("TheirSkill"))}">
       </label>`
    : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("DialogTitle", { skill }) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="hint">${esc(L("DialogHint"))}</p>
      <label style="${row}"><span>${esc(L("Master"))}</span>
        <input type="text" name="master" list="gworld-complementary-masters" autofocus autocomplete="off" style="width:180px">
        <datalist id="gworld-complementary-masters">${masters.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      </label>
      ${who}
      <label style="${row}"><span>${esc(L("LongTask"))}</span><input type="checkbox" name="longTask"></label>
      ${contest}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const field = (name: string) =>
          form?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null;
        const picked = Number(field("recipient")?.value ?? 0) || 0;
        const contested = field("contested")?.checked === true;
        return {
          master: String(field("master")?.value ?? "").trim(),
          recipient: people[picked] ?? actor,
          longTask: field("longTask")?.checked === true,
          contest: contested && foe ? { foe, base: Number(field("theirs")?.value) || 0 } : null,
        };
      },
    },
    rejectClose: false,
  });
  if (!result || typeof result !== "object") return null;
  const answer = result as ComplementaryAnswer;
  return answer.master ? answer : null;
}
