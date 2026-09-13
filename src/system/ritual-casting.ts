/**
 * Working a ritual at the table (GURPS Monster Hunters 1: Champions
 * pp. 35-37).
 *
 * A casting is one chat card that lives as long as the ritual does. It keeps
 * the energy gathered against the cost, and offers each next step with its
 * modifiers worked out: another gathering roll, a source to tap, and at the
 * end the final roll. The card's flag is the state; every step rewrites the
 * card from it, so whoever looks at the chat sees where the ritual stands.
 *
 * The GM sets the circumstances on the card itself: whether the caster has a
 * connection to the subject, what the ground is, and how long magic has been
 * worked there.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { isRuleOn } from "./optional-rules.js";
import { postResistCard } from "./spell-resistance.js";
import { targetedTokens } from "./targets.js";
import {
  backfireEnergy,
  finalOutcome,
  gatheringOutcome,
  gatheringSeconds,
  gatheringStreakPenalty,
  hurriedGatheringPenalty,
  nonAdeptPenalties,
  sacrifice,
  sitePotencyBonus,
  tapping,
  type CastingConditions,
  type Consecration,
  type RitualRoll,
} from "../rules/ritual-casting.js";
import { resolveSuccess } from "../rules/success.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/ritual-casting.hbs`;

const L = (key: string) => game.i18n.localize(`GWORLD.RitualCast.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.RitualCast.${key}`, data);

/** One line of the card's record of the casting. */
interface LogEntry {
  text: string;
  kind: "gain" | "quirk" | "bad" | "note";
}

/** Everything the card remembers. */
interface CastingFlag {
  actorUuid: string;
  itemId: string;
  name: string;
  cost: number;
  skillName: string;
  /** The Path's level, with the penalty for extra Paths already in it. */
  skill: number;
  information: boolean;
  conditions: CastingConditions;
  /** How long magic has been worked where the caster stands; -1 for desecrated ground. */
  siteYears: number;
  /** The seconds an adept takes over each gathering attempt, from one to five. */
  hurriedTo: number;
  energy: number;
  attempts: number;
  seconds: number;
  /** A critical success makes the next gathering attempt one second. */
  quick: boolean;
  quirks: number;
  /** Everyone who has sacrificed to this ritual: "may only contribute to a given ritual once". */
  donors: string[];
  log: LogEntry[];
  state: "gathering" | "cast" | "backfired" | "abandoned";
}

function flagOf(message: any): CastingFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "ritualCasting");
  return flag && typeof flag === "object" ? (flag as CastingFlag) : null;
}

/** The penalties on every roll for the ritual, as the card lists them. */
function generalModifiers(flag: CastingFlag): Array<{ label: string; value: number }> {
  return nonAdeptPenalties(flag.conditions).map((p) => ({ label: L(`Penalty.${p.key}`), value: p.value }));
}

/** The modifiers on the next gathering attempt: the general ones and those only gathering takes (p. 35). */
function gatheringModifiers(flag: CastingFlag): Array<{ label: string; value: number }> {
  const out = generalModifiers(flag);
  const streak = gatheringStreakPenalty(flag.attempts + 1);
  if (streak) out.push({ label: L("Streak"), value: streak });
  const hurried = flag.quick || (!flag.conditions.adept && !flag.conditions.adeptTimes) ? 0 : hurriedGatheringPenalty(flag.hurriedTo);
  if (hurried) out.push({ label: F("Hurried", { seconds: flag.hurriedTo }), value: hurried });
  const site = flag.siteYears > 0 ? sitePotencyBonus(flag.siteYears) : 0;
  if (site) out.push({ label: L("Site"), value: site });
  return out;
}

const total = (mods: Array<{ value: number }>) => mods.reduce((sum, m) => sum + m.value, 0);

/** "5 s", "5 min", "1 h 2 min". */
function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

async function render(flag: CastingFlag): Promise<string> {
  const gathering = gatheringModifiers(flag);
  const general = generalModifiers(flag);
  const actor: any = await fromUuid(flag.actorUuid).catch(() => null);
  const reserve = Number(actor?.system?.derived?.ritualPath?.reserve?.value ?? 0) || 0;
  const tap = tapping(flag.conditions);
  const enough = flag.energy >= flag.cost;
  const open = flag.state === "gathering";
  const years = [0, 20, 50, 100, 500, 1000];
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    ...flag,
    open,
    enough,
    percent: flag.cost > 0 ? Math.min(100, Math.round((100 * flag.energy) / flag.cost)) : 100,
    adept: flag.conditions.adept,
    gathering: { modifiers: gathering, target: flag.skill + total(gathering), time: duration(gatheringSeconds(flag.conditions, { hurriedTo: flag.hurriedTo, quick: flag.quick })) },
    final: { modifiers: general, target: flag.skill + total(general) },
    tap: { time: duration(tap.seconds), roll: tap.roll, target: flag.skill + total(general) },
    reserve,
    desecrated: flag.siteYears < 0,
    elapsed: duration(flag.seconds),
    sites: [
      { value: "-1", label: L("SiteDesecrated"), selected: flag.siteYears < 0 },
      ...years.map((y) => ({ value: String(y), label: y ? F("SiteYears", { years: y }) : L("SiteOrdinary"), selected: flag.siteYears === y })),
    ],
    consecrations: (["consecrated", "hasty", "none"] as Consecration[]).map((c) => ({
      value: c, label: L(`Consecration.${c}`), selected: flag.conditions.consecration === c,
    })),
  });
}

/** Rewrites the card from its state. */
async function save(message: any, flag: CastingFlag): Promise<void> {
  await message.update({ content: await render(flag), [`flags.${SYSTEM_ID}.ritualCasting`]: flag });
}

/** Rolls 3d6 against a target, for a step of the casting. */
async function roll3d6(target: number): Promise<{ roll: any; result: RitualRoll & { total: number } }> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
  const resolved = resolveSuccess(roll.total, target, dice);
  return { roll, result: { ...resolved, total: roll.total } };
}

/** Starts working a ritual from its item: the card, with nothing gathered yet. */
export async function startRitualCasting(actor: any, item: any): Promise<void> {
  if (!isRuleOn("ritualPathMagic") || item?.type !== "ritual") return;
  const skill = item.system?.derived?.skill;
  const cost = Number(item.system?.derived?.cost?.total ?? 0);
  if (!(item.system?.effects ?? []).length) {
    ui.notifications?.warn(L("NoEffects"));
    return;
  }
  if (skill?.level === null || skill?.level === undefined) {
    ui.notifications?.warn(F("Uncastable", { path: String(skill?.name ?? "") }));
    return;
  }
  const rp = actor.system?.derived?.ritualPath ?? {};
  const flag: CastingFlag = {
    actorUuid: String(actor.uuid),
    itemId: String(item.id),
    name: String(item.name),
    cost,
    skillName: String(skill.name),
    skill: Number(skill.level),
    information: item.system?.casting?.rangeKind === "information",
    conditions: {
      adept: Boolean(rp.adept),
      magery: rp.magery ?? null,
      connected: true,
      consecration: "none",
      adeptTimes: false,
    },
    siteYears: 0,
    hurriedTo: 5,
    energy: 0,
    attempts: 0,
    seconds: 0,
    quick: false,
    quirks: 0,
    donors: [],
    log: [],
    state: "gathering",
  };
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await render(flag),
    flags: { [SYSTEM_ID]: { ritualCasting: flag } },
  });
}

/** Wires the card's controls for whoever may work the ritual: its caster's owners and the GM. */
export async function addRitualControls(message: any, html: HTMLElement): Promise<void> {
  const flag = flagOf(message);
  if (!flag) return;
  const actor: any = await fromUuid(flag.actorUuid).catch(() => null);
  const controls = html.querySelector<HTMLElement>("[data-ritual-controls]");
  const settings = html.querySelector<HTMLElement>("[data-ritual-settings]");
  const mayAct = Boolean(game.user?.isGM || actor?.isOwner);
  if (!mayAct || flag.state !== "gathering") {
    controls?.remove();
    settings?.remove();
    return;
  }
  // The circumstances are the GM's to say; a table without one lets the player.
  const gmPresent = game.users?.some?.((u: any) => u.isGM && u.active);
  if (settings && gmPresent && !game.user?.isGM) {
    settings.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => { el.disabled = true; });
  }

  html.querySelectorAll<HTMLElement>("[data-ritual-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void act(message, actor, String(button.dataset.ritualAction));
    });
  });
  html.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ritual-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      void changeSetting(message, String(input.dataset.ritualSetting), input);
    });
  });
}

async function changeSetting(message: any, key: string, input: HTMLInputElement | HTMLSelectElement): Promise<void> {
  const flag = flagOf(message);
  if (!flag) return;
  const checked = (input as HTMLInputElement).checked;
  switch (key) {
    case "connected": flag.conditions.connected = checked; break;
    case "adeptTimes": flag.conditions.adeptTimes = checked; break;
    case "consecration": flag.conditions.consecration = input.value as Consecration; break;
    case "siteYears": flag.siteYears = Number(input.value) || 0; break;
    case "hurriedTo": flag.hurriedTo = Math.max(1, Math.min(5, Math.floor(Number(input.value) || 5))); break;
    default: return;
  }
  await save(message, flag);
}

async function act(message: any, actor: any, action: string): Promise<void> {
  const flag = flagOf(message);
  if (!flag || flag.state !== "gathering" || !actor) return;
  switch (action) {
    case "gather": return gather(message, flag);
    case "reserve": return tapReserve(message, actor, flag);
    case "sacrifice": return sacrificeTo(message, actor, flag);
    case "cast": return castRitual(message, actor, flag);
    case "abandon":
      flag.state = "abandoned";
      flag.log.push({ text: F("Abandoned", { energy: flag.energy }), kind: "note" });
      return save(message, flag);
  }
}

/** One attempt to gather ambient energy (p. 35). */
async function gather(message: any, flag: CastingFlag): Promise<void> {
  if (flag.siteYears < 0 || flag.energy >= flag.cost) return;
  const mods = gatheringModifiers(flag);
  const target = flag.skill + total(mods);
  const { result } = await roll3d6(target);
  const outcome = gatheringOutcome(result);
  flag.seconds += gatheringSeconds(flag.conditions, { hurriedTo: flag.hurriedTo, quick: flag.quick });
  flag.attempts += 1;
  flag.quick = outcome.quick;
  const rolled = F("Rolled", { roll: result.total, target });
  if (outcome.backfire) {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
  } else {
    flag.energy += outcome.energy;
    if (outcome.quirk) flag.quirks += 1;
    flag.log.push({
      text: `${rolled}: ${F(outcome.quirk ? "GatheredQuirk" : outcome.quick ? "GatheredQuick" : "Gathered", { energy: outcome.energy })}`,
      kind: outcome.quirk ? "quirk" : "gain",
    });
  }
  await save(message, flag);
}

/**
 * A roll to tap a source, which only a non-adept working at an adept's speed
 * has to make (p. 36). False where it failed and nothing was drawn.
 */
async function tapRoll(message: any, flag: CastingFlag): Promise<boolean> {
  const tap = tapping(flag.conditions);
  flag.seconds += tap.seconds;
  if (!tap.roll) return true;
  const target = flag.skill + total(generalModifiers(flag));
  const { result } = await roll3d6(target);
  const rolled = F("Rolled", { roll: result.total, target });
  if (result.criticalFailure) {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
    await save(message, flag);
    return false;
  }
  if (!result.success) {
    flag.log.push({ text: `${rolled}: ${L("TapFailed")}`, kind: "bad" });
    await save(message, flag);
    return false;
  }
  return true;
}

/** Draws on the caster's mana reserve (p. 36). */
async function tapReserve(message: any, actor: any, flag: CastingFlag): Promise<void> {
  const reserve = Number(actor.system?.derived?.ritualPath?.reserve?.value ?? 0) || 0;
  const needed = Math.max(0, flag.cost - flag.energy);
  if (reserve <= 0 || needed <= 0) return;
  const amount = await askNumbers(L("ReserveTitle"), [{ key: "amount", label: F("ReservePrompt", { reserve }), initial: Math.min(reserve, needed), max: reserve }]);
  const drawn = Math.min(reserve, Math.max(0, Math.floor(amount?.amount ?? 0)));
  if (!drawn) return;
  if (!(await tapRoll(message, flag))) return;
  await actor.update({ "system.ritualPath.manaReserve": reserve - drawn });
  flag.energy += drawn;
  flag.log.push({ text: F("FromReserve", { energy: drawn, left: reserve - drawn }), kind: "gain" });
  await save(message, flag);
}

/**
 * A sacrifice of HP and FP, from the caster or a willing subject touching
 * them: "Every 2 HP or 3 FP expended translate into a point of energy", and
 * "Each person is a separate source, and may only contribute to a given
 * ritual once" (p. 36). The willing are whoever the user has targeted.
 */
async function sacrificeTo(message: any, actor: any, flag: CastingFlag): Promise<void> {
  const candidates = [actor, ...targetedTokens().map((t: any) => t?.actor)]
    .filter((a: any, i: number, all: any[]) => a?.uuid && all.findIndex((b: any) => b?.uuid === a.uuid) === i)
    .filter((a: any) => !flag.donors.includes(String(a.uuid)));
  if (!candidates.length) {
    ui.notifications?.warn(L("NoDonors"));
    return;
  }
  const answer = await askNumbers(L("SacrificeTitle"), [
    { key: "hp", label: L("SacrificeHp"), initial: 0 },
    { key: "fp", label: L("SacrificeFp"), initial: 0 },
  ], candidates.map((c: any) => ({ value: String(c.uuid), label: String(c.name) })));
  if (!answer) return;
  const donor = candidates.find((c: any) => String(c.uuid) === answer.donor) ?? candidates[0];
  const spent = sacrifice({ hp: answer.hp ?? 0, fp: answer.fp ?? 0 });
  if (!spent.energy) return;
  if (!donor.isOwner) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Chat.CannotApply", { names: String(donor.name) }));
    return;
  }
  if (!(await tapRoll(message, flag))) return;
  await donor.update({
    "system.hp.value": (Number(donor.system?.hp?.value) || 0) - spent.hp,
    "system.fp.value": (Number(donor.system?.fp?.value) || 0) - spent.fp,
  });
  await syncHealthConditions(donor);
  flag.donors.push(String(donor.uuid));
  flag.energy += spent.energy;
  flag.log.push({ text: F("Sacrificed", { name: String(donor.name), hp: spent.hp, fp: spent.fp, energy: spent.energy }), kind: "gain" });
  await save(message, flag);
}

/** The final roll (pp. 36-37). */
async function castRitual(message: any, actor: any, flag: CastingFlag): Promise<void> {
  if (flag.energy < flag.cost) return;
  const target = flag.skill + total(generalModifiers(flag));
  const { roll, result } = await roll3d6(target);
  const outcome = finalOutcome(result, { information: flag.information });

  // "For spells to learn information, the GM rolls": the roll goes to the GM
  // alone, and the card says only that it was made.
  if (flag.information) {
    const gms = (game.users?.filter?.((u: any) => u.isGM) ?? []).map((u: any) => u.id);
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      whisper: gms,
      blind: true,
      rolls: [roll],
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(flag.name)}</span></div>`
        + `<div class="gc-result ${result.success ? "success" : "failure"}">${F("Rolled", { roll: result.total, target })}: `
        + `${L(outcome.kind === "lie" ? "InformationLie" : outcome.kind === "retry" ? "InformationRetry" : "InformationTrue")}</div></div>`,
    });
    if (outcome.kind === "retry") {
      flag.seconds += outcome.retrySeconds;
      flag.log.push({ text: L("InformationRolledRetry"), kind: "note" });
    } else {
      flag.state = "cast";
      flag.log.push({ text: L("InformationRolled"), kind: "note" });
    }
    return save(message, flag);
  }

  const rolled = F("Rolled", { roll: result.total, target });
  if (outcome.kind === "backfire") {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
    return save(message, flag);
  }
  if (outcome.kind === "retry") {
    flag.seconds += outcome.retrySeconds;
    flag.log.push({ text: `${rolled}: ${F("Retry", { seconds: outcome.retrySeconds })}`, kind: "bad" });
    return save(message, flag);
  }

  flag.state = "cast";
  flag.log.push({ text: `${rolled}: ${F("Cast", { margin: result.margin })}`, kind: "gain" });
  if (outcome.refillReserve) {
    const max = Number(actor.system?.derived?.ritualPath?.reserve?.max ?? 0) || 0;
    if (max > 0) {
      await actor.update({ "system.ritualPath.manaReserve": max });
      flag.log.push({ text: F("ReserveRefilled", { max }), kind: "gain" });
    }
  }
  await save(message, flag);

  // "every potential subject who is not a willing participant resists with the
  // better of his HT or Will, plus any Magic Resistance".
  const subjects = targetedTokens().map((t: any) => t?.actor).filter((s: any) => s?.uuid && s.uuid !== actor.uuid);
  if (subjects.length) {
    await postResistCard({
      caster: actor,
      spell: flag.name,
      casterRoll: result.total,
      casterEffective: target,
      resistedBy: L("ResistedBy"),
      area: false,
      subjects,
      ritual: true,
    });
  }
}

/** A small form of numbers, with a choice of whose they are where there is one. */
async function askNumbers(
  title: string,
  fields: Array<{ key: string; label: string; initial: number; max?: number }>,
  donors?: Array<{ value: string; label: string }>,
): Promise<Record<string, any> | null> {
  const row = (inner: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center">${inner}</label>`;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    ${donors && donors.length > 1
      ? row(`<span>${L("Donor")}</span><select name="donor">${donors.map((d) => `<option value="${d.value}">${foundry.utils.escapeHTML(d.label)}</option>`).join("")}</select>`)
      : ""}
    ${fields.map((f) => row(`<span>${f.label}</span><input type="number" name="${f.key}" value="${f.initial}" min="0" ${f.max !== undefined ? `max="${f.max}"` : ""} step="1" style="width:80px">`)).join("")}
  </div>`;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const out: Record<string, any> = { donor: form?.querySelector<HTMLSelectElement>('select[name="donor"]')?.value ?? donors?.[0]?.value };
        for (const f of fields) out[f.key] = Number(form?.querySelector<HTMLInputElement>(`input[name="${f.key}"]`)?.value ?? 0) || 0;
        return out;
      },
    },
    rejectClose: false,
  });
  return answer && typeof answer === "object" ? (answer as Record<string, any>) : null;
}
