/**
 * Working a ritual at the table (GURPS Monster Hunters 1: Champions
 * pp. 35-39).
 *
 * A casting is one chat card that lives as long as the ritual does. It keeps
 * the energy gathered against the cost, and offers each next step with its
 * modifiers worked out: another gathering roll, a source to tap, and at the
 * end the final roll. The card's flag is the state; every step rewrites the
 * card from it, so whoever looks at the chat sees where the ritual stands.
 *
 * The GM sets the circumstances on the card itself: whether the caster has a
 * connection to the subject, what the ground is, and how long magic has been
 * worked there. Other casters can be added to the card to work together
 * (p. 39), and each caster's Ritual Mastery and grimoire count for their own
 * rolls (pp. 25, 39).
 *
 * A ritual the GM has agreed can block is also offered as a defense against
 * an attack, and resolved at once (p. 37).
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
import { governingPath, type RitualEffectEntry } from "../rules/ritual-cost.js";
import { pathSkillName } from "../rules/ritual-path.js";
import {
  BLOCKING_GATHER_PENALTY,
  BLOCKING_TAP_PENALTY,
  finalCaster,
  workingTogetherPenalty,
} from "../rules/ritual-tricks.js";
import { resolveSuccess } from "../rules/success.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/ritual-casting.hbs`;

const L = (key: string) => game.i18n.localize(`GWORLD.RitualCast.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.RitualCast.${key}`, data);

/** One line of the card's record of the casting. */
interface LogEntry {
  text: string;
  kind: "gain" | "quirk" | "bad" | "note";
}

/** One caster working the ritual. */
interface Caster {
  uuid: string;
  name: string;
  skillName: string;
  /** The Path's level, with the penalty for extra Paths already in it. */
  skill: number;
  adept: boolean;
  magery: number | null;
  /** Ritual Mastery's bonus for this ritual as defined (p. 25). */
  mastery: number;
  /** The best grimoire carried for it, and whether it is being read from (p. 39). */
  grimoire: { name: string; bonus: number } | null;
  useGrimoire: boolean;
  /** How long this caster has worked; casters working together work at once. */
  seconds: number;
}

/** Everything the card remembers. */
interface CastingFlag {
  itemId: string;
  name: string;
  identity: string;
  effects: RitualEffectEntry[];
  cost: number;
  information: boolean;
  casters: Caster[];
  /** The caster whose turn the buttons take. */
  acting: number;
  connected: boolean;
  consecration: Consecration;
  adeptTimes: boolean;
  /** How long magic has been worked where the ritual is cast; -1 for desecrated ground. */
  siteYears: number;
  /** The seconds an adept takes over each gathering attempt, from one to five. */
  hurriedTo: number;
  energy: number;
  attempts: number;
  /** A critical success makes the next gathering attempt one second. */
  quick: boolean;
  quirks: number;
  /** Everyone who has sacrificed to this ritual: "may only contribute to a given ritual once". */
  donors: string[];
  log: LogEntry[];
  state: "gathering" | "cast" | "backfired" | "abandoned";
}

type Modifier = { label: string; value: number };

function flagOf(message: any): CastingFlag | null {
  const flag = message?.getFlag?.(SYSTEM_ID, "ritualCasting");
  return flag && typeof flag === "object" && Array.isArray(flag.casters) ? (flag as CastingFlag) : null;
}

function conditionsOf(flag: CastingFlag, caster: Caster): CastingConditions {
  return {
    adept: caster.adept,
    magery: caster.magery,
    connected: flag.connected,
    consecration: flag.consecration,
    adeptTimes: flag.adeptTimes,
  };
}

/** The bonuses a caster brings to this ritual: Ritual Mastery and an open grimoire. */
function bonusModifiers(caster: Caster): Modifier[] {
  const out: Modifier[] = [];
  if (caster.mastery) out.push({ label: game.i18n.localize("GWORLD.Ritual.Mastery"), value: caster.mastery });
  if (caster.useGrimoire && caster.grimoire?.bonus) out.push({ label: caster.grimoire.name, value: caster.grimoire.bonus });
  return out;
}

/** The modifiers on every roll a caster makes for the ritual. */
function generalModifiers(flag: CastingFlag, caster: Caster): Modifier[] {
  const out: Modifier[] = nonAdeptPenalties(conditionsOf(flag, caster)).map((p) => ({ label: L(`Penalty.${p.key}`), value: p.value }));
  const together = workingTogetherPenalty(flag.casters.length);
  if (together) out.push({ label: L("Together"), value: together });
  return [...out, ...bonusModifiers(caster)];
}

/** The modifiers on a caster's next gathering attempt: the general ones and those only gathering takes (p. 35). */
function gatheringModifiers(flag: CastingFlag, caster: Caster): Modifier[] {
  const out = generalModifiers(flag, caster);
  const streak = gatheringStreakPenalty(flag.attempts + 1);
  if (streak) out.push({ label: L("Streak"), value: streak });
  const conditions = conditionsOf(flag, caster);
  const hurried = flag.quick || (!conditions.adept && !conditions.adeptTimes) ? 0 : hurriedGatheringPenalty(flag.hurriedTo);
  if (hurried) out.push({ label: F("Hurried", { seconds: flag.hurriedTo }), value: hurried });
  const site = flag.siteYears > 0 ? sitePotencyBonus(flag.siteYears) : 0;
  if (site) out.push({ label: L("Site"), value: site });
  return out;
}

const total = (mods: Modifier[]) => mods.reduce((sum, m) => sum + m.value, 0);

/** "Using a grimoire doubles all casting times" (p. 39). */
const timeFactor = (caster: Caster) => (caster.useGrimoire && caster.grimoire ? 2 : 1);

function gatherSecondsFor(flag: CastingFlag, caster: Caster): number {
  return gatheringSeconds(conditionsOf(flag, caster), { hurriedTo: flag.hurriedTo, quick: flag.quick }) * timeFactor(caster);
}

function tapFor(flag: CastingFlag, caster: Caster): { seconds: number; roll: boolean } {
  const tap = tapping(conditionsOf(flag, caster));
  return { seconds: tap.seconds * timeFactor(caster), roll: tap.roll };
}

/** "5 s", "5 min", "1 h 2 min". */
function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const actingCaster = (flag: CastingFlag): Caster => flag.casters[Math.max(0, Math.min(flag.casters.length - 1, flag.acting))]!;

async function render(flag: CastingFlag): Promise<string> {
  const caster = actingCaster(flag);
  const gathering = gatheringModifiers(flag, caster);
  const last = flag.casters[finalCaster(flag.casters.map((c) => c.skill))]!;
  const final = generalModifiers(flag, last);
  const actor: any = await fromUuid(caster.uuid).catch(() => null);
  const reserve = Number(actor?.system?.derived?.ritualPath?.reserve?.value ?? 0) || 0;
  const tap = tapFor(flag, caster);
  const general = generalModifiers(flag, caster);
  const years = [0, 20, 50, 100, 500, 1000];
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    ...flag,
    open: flag.state === "gathering",
    enough: flag.energy >= flag.cost,
    percent: flag.cost > 0 ? Math.min(100, Math.round((100 * flag.energy) / flag.cost)) : 100,
    anyNonAdept: flag.casters.some((c) => !c.adept),
    anyQuick: flag.casters.some((c) => c.adept) || flag.adeptTimes,
    together: flag.casters.length > 1,
    casters: flag.casters.map((c, index) => ({ ...c, index, acting: index === flag.acting, last: c === last })),
    gathering: { modifiers: gathering, target: caster.skill + total(gathering), time: duration(gatherSecondsFor(flag, caster)) },
    final: { modifiers: final, target: last.skill + total(final), name: last.name },
    tap: { time: duration(tap.seconds), roll: tap.roll, target: caster.skill + total(general) },
    reserve,
    desecrated: flag.siteYears < 0,
    elapsed: duration(Math.max(0, ...flag.casters.map((c) => c.seconds))),
    sites: [
      { value: "-1", label: L("SiteDesecrated"), selected: flag.siteYears < 0 },
      ...years.map((y) => ({ value: String(y), label: y ? F("SiteYears", { years: y }) : L("SiteOrdinary"), selected: flag.siteYears === y })),
    ],
    consecrations: (["consecrated", "hasty", "none"] as Consecration[]).map((c) => ({
      value: c, label: L(`Consecration.${c}`), selected: flag.consecration === c,
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

/**
 * A character as a caster of this ritual: the Path they would roll, and the
 * bonuses their own copy of the ritual earns. Null for somebody who cannot
 * cast it at all.
 */
function casterFor(actor: any, effects: RitualEffectEntry[], identity: string): Caster | null {
  const rp = actor?.system?.derived?.ritualPath;
  if (!rp?.inPlay) return null;
  const levels = Object.fromEntries(((rp.paths ?? []) as any[]).map((p) => [p.path, p.level]));
  const skill = governingPath(effects, levels);
  if (skill.level === null || !skill.path) return null;
  // Ritual Mastery and a grimoire attach to the ritual as defined, so they
  // come from this caster's own ritual with the same definition, if any.
  const own = (actor.items?.contents ?? actor.items ?? [])
    .find((i: any) => i.type === "ritual" && i.system?.derived?.identity === identity);
  const grimoire = own?.system?.derived?.grimoire ?? null;
  return {
    uuid: String(actor.uuid),
    name: String(actor.name),
    skillName: pathSkillName(skill.path),
    skill: skill.level,
    adept: Boolean(rp.adept),
    magery: rp.magery ?? null,
    mastery: Number(own?.system?.derived?.mastery ?? 0),
    grimoire: grimoire && grimoire.bonus > 0 ? { name: String(grimoire.name), bonus: Number(grimoire.bonus) } : null,
    useGrimoire: false,
    seconds: 0,
  };
}

/** Starts working a ritual from its item: the card, with nothing gathered yet. */
export async function startRitualCasting(actor: any, item: any): Promise<void> {
  if (!isRuleOn("ritualPathMagic") || item?.type !== "ritual") return;
  const effects = (item.system?.effects ?? []) as RitualEffectEntry[];
  if (!effects.length) {
    ui.notifications?.warn(L("NoEffects"));
    return;
  }
  const identity = String(item.system?.derived?.identity ?? "");
  const caster = casterFor(actor, effects, identity);
  if (!caster) {
    ui.notifications?.warn(F("Uncastable", { path: String(item.system?.derived?.skill?.name ?? "") }));
    return;
  }
  const flag: CastingFlag = {
    itemId: String(item.id),
    name: String(item.name),
    identity,
    effects: effects.map((e) => ({ path: e.path, effect: e.effect, greater: Boolean(e.greater) })),
    cost: Number(item.system?.derived?.cost?.total ?? 0),
    information: item.system?.casting?.rangeKind === "information",
    casters: [caster],
    acting: 0,
    connected: true,
    consecration: "none",
    adeptTimes: false,
    siteYears: 0,
    hurriedTo: 5,
    energy: 0,
    attempts: 0,
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

/** Wires the card's controls for whoever may work the ritual: its casters' owners and the GM. */
export async function addRitualControls(message: any, html: HTMLElement): Promise<void> {
  const flag = flagOf(message);
  if (!flag) return;
  const controls = html.querySelector<HTMLElement>("[data-ritual-controls]");
  const settings = html.querySelector<HTMLElement>("[data-ritual-settings]");
  const owners = await Promise.all(flag.casters.map((c) => fromUuid(c.uuid).catch(() => null)));
  const mayAct = Boolean(game.user?.isGM || (message.isAuthor && owners.some((a: any) => a?.isOwner)));
  if (!mayAct || flag.state !== "gathering") {
    controls?.remove();
    settings?.remove();
    return;
  }
  // The circumstances are the GM's to say; a table without one lets the player.
  const gmPresent = game.users?.some?.((u: any) => u.isGM && u.active);
  if (settings && gmPresent && !game.user?.isGM) {
    settings.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ritual-gm]").forEach((el) => { el.disabled = true; });
  }

  html.querySelectorAll<HTMLElement>("[data-ritual-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void act(message, String(button.dataset.ritualAction));
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
  const [name, index] = key.split(":");
  switch (name) {
    case "connected": flag.connected = checked; break;
    case "adeptTimes": flag.adeptTimes = checked; break;
    case "consecration": flag.consecration = input.value as Consecration; break;
    case "siteYears": flag.siteYears = Number(input.value) || 0; break;
    case "hurriedTo": flag.hurriedTo = Math.max(1, Math.min(5, Math.floor(Number(input.value) || 5))); break;
    case "acting": flag.acting = Math.max(0, Math.min(flag.casters.length - 1, Number(input.value) || 0)); break;
    case "grimoire": {
      const caster = flag.casters[Number(index)];
      if (caster?.grimoire) caster.useGrimoire = checked;
      break;
    }
    default: return;
  }
  await save(message, flag);
}

async function act(message: any, action: string): Promise<void> {
  const flag = flagOf(message);
  if (!flag || flag.state !== "gathering") return;
  const caster = actingCaster(flag);
  const actor: any = await fromUuid(caster.uuid).catch(() => null);
  if (!actor) return;
  switch (action) {
    case "gather": return gather(message, flag, caster);
    case "reserve": return tapReserve(message, actor, flag, caster);
    case "sacrifice": return sacrificeTo(message, actor, flag, caster);
    case "cast": return castRitual(message, flag);
    case "join": return joinCasters(message, flag);
    case "abandon":
      flag.state = "abandoned";
      flag.log.push({ text: F("Abandoned", { energy: flag.energy }), kind: "note" });
      return save(message, flag);
  }
}

/**
 * Adds the targeted characters as casters (p. 39): "add their energy totals
 * together", each at -1 for every caster past the first.
 */
async function joinCasters(message: any, flag: CastingFlag): Promise<void> {
  let added = 0;
  for (const token of targetedTokens()) {
    const actor = token?.actor;
    if (!actor?.uuid || flag.casters.some((c) => c.uuid === actor.uuid)) continue;
    const caster = casterFor(actor, flag.effects, flag.identity);
    if (!caster) {
      ui.notifications?.warn(F("CannotJoin", { name: String(actor.name) }));
      continue;
    }
    flag.casters.push(caster);
    flag.log.push({ text: F("Joined", { name: caster.name, skill: `${caster.skillName}-${caster.skill}` }), kind: "note" });
    added += 1;
  }
  if (!added) {
    ui.notifications?.warn(L("JoinHint"));
    return;
  }
  await save(message, flag);
}

/** One attempt to gather ambient energy (p. 35). */
async function gather(message: any, flag: CastingFlag, caster: Caster): Promise<void> {
  if (flag.siteYears < 0 || flag.energy >= flag.cost) return;
  const mods = gatheringModifiers(flag, caster);
  const target = caster.skill + total(mods);
  const { result } = await roll3d6(target);
  const outcome = gatheringOutcome(result);
  caster.seconds += gatherSecondsFor(flag, caster);
  flag.attempts += 1;
  flag.quick = outcome.quick;
  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
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
async function tapRoll(message: any, flag: CastingFlag, caster: Caster): Promise<boolean> {
  const tap = tapFor(flag, caster);
  caster.seconds += tap.seconds;
  if (!tap.roll) return true;
  const target = caster.skill + total(generalModifiers(flag, caster));
  const { result } = await roll3d6(target);
  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
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

/** Draws on the acting caster's mana reserve (p. 36). */
async function tapReserve(message: any, actor: any, flag: CastingFlag, caster: Caster): Promise<void> {
  const reserve = Number(actor.system?.derived?.ritualPath?.reserve?.value ?? 0) || 0;
  const needed = Math.max(0, flag.cost - flag.energy);
  if (reserve <= 0 || needed <= 0) return;
  const amount = await askNumbers(L("ReserveTitle"), [{ key: "amount", label: F("ReservePrompt", { reserve }), initial: Math.min(reserve, needed), max: reserve }]);
  const drawn = Math.min(reserve, Math.max(0, Math.floor(amount?.amount ?? 0)));
  if (!drawn) return;
  if (!(await tapRoll(message, flag, caster))) return;
  await actor.update({ "system.ritualPath.manaReserve": reserve - drawn });
  flag.energy += drawn;
  flag.log.push({ text: F("FromReserve", { name: caster.name, energy: drawn, left: reserve - drawn }), kind: "gain" });
  await save(message, flag);
}

/**
 * A sacrifice of HP and FP, from a caster or a willing subject touching them:
 * "Every 2 HP or 3 FP expended translate into a point of energy", and "Each
 * person is a separate source, and may only contribute to a given ritual
 * once" (p. 36). The willing are the casters and whoever the user has
 * targeted.
 */
async function sacrificeTo(message: any, actor: any, flag: CastingFlag, caster: Caster): Promise<void> {
  const others = await Promise.all(flag.casters.map((c) => fromUuid(c.uuid).catch(() => null)));
  const candidates = [actor, ...others, ...targetedTokens().map((t: any) => t?.actor)]
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
  if (!(await tapRoll(message, flag, caster))) return;
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

/** The final roll, made by the caster with the highest skill (pp. 36-37, 39). */
async function castRitual(message: any, flag: CastingFlag): Promise<void> {
  if (flag.energy < flag.cost) return;
  const caster = flag.casters[finalCaster(flag.casters.map((c) => c.skill))]!;
  const actor: any = await fromUuid(caster.uuid).catch(() => null);
  if (!actor) return;
  const target = caster.skill + total(generalModifiers(flag, caster));
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
      caster.seconds += outcome.retrySeconds;
      flag.log.push({ text: L("InformationRolledRetry"), kind: "note" });
    } else {
      flag.state = "cast";
      flag.log.push({ text: L("InformationRolled"), kind: "note" });
    }
    return save(message, flag);
  }

  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
  if (outcome.kind === "backfire") {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
    return save(message, flag);
  }
  if (outcome.kind === "retry") {
    caster.seconds += outcome.retrySeconds;
    flag.log.push({ text: `${rolled}: ${F("Retry", { seconds: outcome.retrySeconds })}`, kind: "bad" });
    return save(message, flag);
  }

  flag.state = "cast";
  flag.log.push({ text: `${rolled}: ${F("Cast", { margin: result.margin })}`, kind: "gain" });
  if (outcome.refillReserve) await refillReserve(actor, flag);
  await save(message, flag);
  await offerResistance(actor, flag.name, result.total, target, flag.casters.map((c) => c.uuid));
}

/** A critical success "instantly refills the caster's mana reserve" (p. 37). */
async function refillReserve(actor: any, flag: { log: LogEntry[] }): Promise<void> {
  const max = Number(actor.system?.derived?.ritualPath?.reserve?.max ?? 0) || 0;
  if (max <= 0) return;
  await actor.update({ "system.ritualPath.manaReserve": max });
  flag.log.push({ text: F("ReserveRefilled", { max }), kind: "gain" });
}

/**
 * "Every potential subject who is not a willing participant resists with the
 * better of his HT or Will, plus any Magic Resistance" (p. 36).
 */
async function offerResistance(actor: any, name: string, roll: number, target: number, casters: string[]): Promise<void> {
  const subjects = targetedTokens().map((t: any) => t?.actor).filter((s: any) => s?.uuid && !casters.includes(s.uuid));
  if (!subjects.length) return;
  await postResistCard({
    caster: actor,
    spell: name,
    casterRoll: roll,
    casterEffective: target,
    resistedBy: L("ResistedBy"),
    area: false,
    subjects,
    ritual: true,
  });
}

// ── blocking rituals ─────────────────────────────────────────────────────────

/** The rituals a defender may cast as a blocking spell: marked so by the GM, and within reach. */
export function blockingRitualsOf(defender: any): Array<{ item: any; name: string; level: number; cost: number }> {
  if (!isRuleOn("ritualPathMagic")) return [];
  return ((defender?.items?.contents ?? []) as any[])
    .filter((i) => i.type === "ritual" && i.system?.blocking)
    .map((i) => ({ item: i, name: String(i.name), level: i.system?.derived?.skill?.level, cost: Number(i.system?.derived?.cost?.total ?? 0) }))
    .filter((r) => r.level !== null && r.level !== undefined);
}

/**
 * A ritual cast as a defense (p. 37). It "counts as an active defense, and
 * requires the adept to accumulate the necessary energy in zero time":
 * the mana reserve is tapped at -5, ambient energy is gathered at -10, and a
 * non-adept takes their own -5 more for casting quickly. "If any of the rolls
 * fail before enough energy is drawn, the ritual isn't quick enough to work".
 * A grimoire, which doubles the time, cannot be read in no time at all.
 */
export async function castBlockingRitual(defender: any, item: any, attack: string): Promise<void> {
  if (!defender?.isOwner || item?.type !== "ritual" || !isRuleOn("ritualPathMagic")) return;
  const effects = (item.system?.effects ?? []) as RitualEffectEntry[];
  const caster = casterFor(defender, effects, String(item.system?.derived?.identity ?? ""));
  if (!caster) return;
  const cost = Number(item.system?.derived?.cost?.total ?? 0);
  const conditions: CastingConditions = { adept: caster.adept, magery: caster.magery, connected: true, consecration: "consecrated", adeptTimes: true };
  const general = nonAdeptPenalties(conditions).reduce((sum, p) => sum + p.value, 0) + caster.mastery;
  const log: LogEntry[] = [];
  let energy = 0;
  let attempts = 0;
  let outcome: "blocked" | "slow" | "backfire" | "retry" = "slow";

  const step = async (target: number) => {
    const { result } = await roll3d6(target);
    return { result, text: F("Rolled", { roll: result.total, target }) };
  };

  const reserve = Number(defender.system?.derived?.ritualPath?.reserve?.value ?? 0) || 0;
  let failed = false;
  if (reserve > 0 && cost > 0) {
    const { result, text } = await step(caster.skill + general + BLOCKING_TAP_PENALTY);
    if (result.success) {
      const drawn = Math.min(reserve, cost);
      energy += drawn;
      await defender.update({ "system.ritualPath.manaReserve": reserve - drawn });
      log.push({ text: `${text}: ${F("FromReserve", { name: caster.name, energy: drawn, left: reserve - drawn })}`, kind: "gain" });
    } else {
      failed = true;
      outcome = result.criticalFailure ? "backfire" : "slow";
      log.push({ text: `${text}: ${L("TapFailed")}`, kind: "bad" });
    }
  }
  while (!failed && energy < cost && attempts < 20) {
    attempts += 1;
    const { result, text } = await step(caster.skill + general + BLOCKING_GATHER_PENALTY + gatheringStreakPenalty(attempts));
    const gathered = gatheringOutcome(result);
    if (!result.success) {
      failed = true;
      outcome = gathered.backfire ? "backfire" : "slow";
      log.push({ text: `${text}: ${L("TooSlow")}`, kind: "bad" });
      break;
    }
    energy += gathered.energy;
    log.push({ text: `${text}: ${F("Gathered", { energy: gathered.energy })}`, kind: "gain" });
  }
  if (!failed && energy >= cost) {
    const { result, text } = await step(caster.skill + general);
    const final = finalOutcome(result);
    outcome = final.kind === "success" ? "blocked" : final.kind === "backfire" ? "backfire" : "slow";
    log.push({ text: `${text}: ${outcome === "blocked" ? F("Cast", { margin: result.margin }) : L("TooSlow")}`, kind: outcome === "blocked" ? "gain" : "bad" });
    if (final.refillReserve) await refillReserve(defender, { log });
  }

  const resultText = outcome === "blocked"
    ? L("Blocked")
    : outcome === "backfire"
      ? F("Backfire", { energy: backfireEnergy(energy) })
      : L("BlockFailed");
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: defender }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(
      game.i18n.format("GWORLD.Chat.DefendingAgainst", { defense: String(item.name), attack }),
    )}</span><span class="gc-target">${foundry.utils.escapeHTML(`${caster.skillName}-${caster.skill}`)}</span></div>`
      + `<ol class="gc-log" style="margin: 4px 0; padding-left: 18px">${log.map((l) => `<li>${foundry.utils.escapeHTML(l.text)}</li>`).join("")}</ol>`
      + `<div class="gc-result ${outcome === "blocked" ? "success" : "failure"}">${foundry.utils.escapeHTML(resultText)}</div>`
      + `<div class="gc-note">${foundry.utils.escapeHTML(L("BlockingNote"))}</div></div>`,
  });
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
