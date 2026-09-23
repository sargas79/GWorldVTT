/**
 * Reloading on the sheet (GURPS Basic Set: Characters p. 270; Campaigns
 * pp. 373, 382).
 *
 * A ranged mode keeps a count of what is loaded. Firing takes shells off
 * it; the Reload button puts them back, takes the Ready maneuvers the
 * table lists, and says so in the log. A crossbow stronger than its user
 * takes longer, or a goat's foot, or cannot be cocked at all.
 */

import { SYSTEM_ID } from "./constants.js";
import { shotsEntryFor } from "./shots-entry.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";
import { skillLevelOf } from "./skill-level.js";
import { isRuleOn } from "./optional-rules.js";
import { shotsAfterFiring } from "../rules/cinematic.js";
import { hasInfiniteAmmunition } from "./cinematic.js";
import { payFor, purchaseNote } from "./shopping.js";
import {
  AMMUNITION_TYPES,
  ammunitionCost,
  nearestAmmunitionByCalibre,
  ammunitionEffect,
  ammunitionFits,
  availableAmmunition,
  calibreOf,
  crossbowReloadTime,
  fastDrawHelps,
  fullLoad,
  loadPlan,
  loadsByTheRound,
  reloadTime,
  reloadTimeWith,
  usableAids,
  type AmmunitionReference,
  type ReloadAid,
  type ReloadRequiredRoll,
  type ReloadRoll,
  type AmmunitionType,
  type ShotsEntry,
} from "../rules/ammunition.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/reload.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Reload.${key}`, data) : game.i18n.localize(`GWORLD.Reload.${key}`);

/** Whether the actor has a goat's foot to cock a strong crossbow with (p. 276). */
function hasGoatsFoot(actor: any): boolean {
  return [...(actor?.items ?? [])].some(
    (item: any) => item.type === "equipment" && /goat'?s foot/i.test(String(item.name ?? "")) && item.system?.carried !== false,
  );
}

/** The mode at an index, and the Shots entry it carries. */
function modeOf(item: any, modeIndex: number): { mode: any; entry: ShotsEntry } | null {
  const mode = item?.system?.rangedModes?.[modeIndex];
  if (!mode) return null;
  return { mode, entry: shotsEntryFor(item, modeIndex, mode) };
}

/**
 * Writes a count to every mode drawing on the same magazine.
 *
 * A pump shotgun fires shot or slug from one tube of five, and the table
 * gives both the same Shots entry; an ICW's rifle and grenade launcher have
 * their own, and are counted apart. So the column itself says which modes
 * share: identical entries are one magazine.
 */
async function setLoaded(item: any, modeIndex: number, loaded: number, extra: Record<string, unknown> = {}): Promise<void> {
  const modes: any[] = item.system.rangedModes ?? [];
  const shared = String(modes[modeIndex]?.shots ?? "");
  await item.update({
    "system.rangedModes": modes.map((m: any, i: number) =>
      i === modeIndex || String(m.shots ?? "") === shared ? { ...m, loaded, ...extra } : m,
    ),
  });
}

// ── rounds carried as items (Characters p. 278) ─────────────────────────────

const A = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Ammunition.${key}`, data) : game.i18n.localize(`GWORLD.Ammunition.${key}`);

/** A count of rounds, whole and never negative. */
const rounds = (value: unknown): number => Math.max(0, Math.floor(Number(value)) || 0);

/** The weapon as the fit rule sees it. */
const fitOf = (item: any) => ({ name: String(item?.name ?? ""), weaponClass: String(item?.system?.weaponClass ?? "") });

/** Whether an item is a box of rounds. */
export function isAmmunition(item: any): boolean {
  return item?.type === "equipment" && item.system?.category === "ammunition";
}

/**
 * The carried ammunition that fits a weapon and has rounds left, the box
 * it is loaded from first.
 */
export function carriedAmmunitionFor(actor: any, item: any, modeIndex = 0): any[] {
  const weapon = fitOf(item);
  const loadedFrom = String(item?.system?.rangedModes?.[modeIndex]?.loadedFrom ?? "");
  return [...(actor?.items ?? [])]
    .filter((box: any) => isAmmunition(box) && box.system?.carried !== false && rounds(box.system?.quantity) > 0
      && ammunitionFits(weapon, String(box.system?.ammunition?.fits ?? "")))
    .sort((a: any, b: any) => Number(b.id === loadedFrom) - Number(a.id === loadedFrom) || String(a.name).localeCompare(String(b.name)));
}

/**
 * Loads a weapon from a box of rounds the character carries.
 *
 * The rounds come off the box; what was in the weapon from another box goes
 * back to that box where it still exists. The mode fires the box's kind
 * from then on, and a Reload draws on the same box. Loading is a reload,
 * and takes the Ready maneuvers the table lists.
 */
export async function loadAmmunition(actor: any, item: any, modeIndex: number, box: any): Promise<boolean> {
  if (!item?.isOwner || !box || !isAmmunition(box) || !isRuleOn("reloading")) return false;
  const found = modeOf(item, modeIndex);
  if (!found) return false;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  if (capacity <= 0 || entry.thrown) return false;

  const previousId = String(mode.loadedFrom ?? "");
  const sameSource = previousId === box.id;
  const available = rounds(box.system?.quantity);
  const plan = loadPlan({ capacity, loaded: rounds(mode.loaded), available, sameSource });
  if (plan.take <= 0) {
    // Nothing to load: the weapon is full of this box's rounds, or the box is empty.
    if (sameSource && rounds(mode.loaded) >= capacity) ui.notifications?.info(L("AlreadyFull", { name: String(item.name) }));
    else ui.notifications?.warn(A("NoRoundsLeft", { source: String(box.name) }));
    return false;
  }
  const left = available - plan.take;

  const previous = previousId && !sameSource ? actor?.items?.get(previousId) ?? null : null;
  if (plan.returned > 0 && previous) {
    await previous.update({ "system.quantity": rounds(previous.system?.quantity) + plan.returned });
    ui.notifications?.info(A("Returned", { rounds: plan.returned, name: String(previous.name) }));
  }
  await box.update({ "system.quantity": left });
  const kind = String(box.system?.ammunition?.kind ?? "");
  await setLoaded(item, modeIndex, plan.loaded, { loadedFrom: box.id, ammunition: kind });
  if (actor?.isOwner && actor.system?.maneuver !== undefined) await actor.update({ "system.maneuver": "ready" });

  const seconds = reloadTime(entry, loadsByTheRound(entry) ? plan.take : capacity);
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    loaded: plan.loaded,
    capacity,
    seconds,
    perShot: entry.perShot,
    loading: plan.take,
    source: A("Left", { name: String(box.name), rounds: left }),
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
  return true;
}

/**
 * Asks which carried box to load from, where more than one fits, and
 * loads it. Says so when nothing carried fits.
 */
export async function chooseAndLoad(actor: any, item: any, modeIndex: number): Promise<boolean> {
  if (!item?.isOwner || !isRuleOn("reloading")) return false;
  const boxes = carriedAmmunitionFor(actor, item, modeIndex);
  if (boxes.length === 0) {
    ui.notifications?.warn(A("NothingFits", { name: String(item.name) }));
    return false;
  }
  if (boxes.length === 1) return loadAmmunition(actor, item, modeIndex, boxes[0]);

  const escape = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));
  const options = boxes.map((box: any) => {
    const kind = String(box.system?.ammunition?.kind ?? "");
    const label = `${box.name} — ${A("Count", { rounds: rounds(box.system?.quantity) })}${kind ? `, ${A(kind)}` : ""}`;
    return `<option value="${escape(box.id)}">${escape(label)}</option>`;
  }).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: A("LoadTitle", { name: String(item.name) }) },
    content: `<div class="gworld"><label style="display:flex;flex-direction:column;gap:4px">${A("Choose")}<select name="box">${options}</select></label></div>`,
    ok: {
      label: A("Load"),
      callback: (_event: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="box"]')?.value ?? null,
    },
    rejectClose: false,
  });
  if (!chosen) return false;
  const box = boxes.find((b: any) => b.id === chosen);
  return box ? loadAmmunition(actor, item, modeIndex, box) : false;
}

/** The calibre a weapon's name states, as the name writes it: "9mm", ".40", "12G". */
function calibreTokenOf(name: string): string {
  const m = /,\s*([0-9.]+\s*(?:mm[A-Za-z]?|G|gauge)?|\.[0-9]+[A-Za-z]*)\b/i.exec(name);
  return m ? m[1]!.trim() : "";
}

/**
 * What rounds for this weapon say they fit: its calibre, or arrow / bolt.
 * The bow and crossbow cases are the fit rule's own, so what Buy makes is
 * what Load will accept.
 */
export function ammunitionFitFor(item: any): string {
  const weapon = fitOf(item);
  if (ammunitionFits(weapon, "bolt")) return "bolt";
  if (ammunitionFits(weapon, "arrow")) return "arrow";
  return calibreTokenOf(weapon.name) || weapon.name;
}

/**
 * The rounds the packs carry: those that fit this weapon, and every other
 * listed box, which is what a weapon with no record of its own is priced from.
 */
async function packAmmunitionFor(item: any): Promise<{
  fitting: Record<string, any> | null;
  listed: AmmunitionReference[];
}> {
  const weapon = fitOf(item);
  const listed: AmmunitionReference[] = [];
  let fitting: Record<string, any> | null = null;
  for (const pack of game.packs ?? []) {
    if (pack.metadata?.type !== "Item") continue;
    const index = await pack.getIndex({
      fields: ["type", "system.category", "system.ammunition", "system.cost", "system.weight"],
    });
    for (const entry of index) {
      if (entry.type !== "equipment" || entry.system?.category !== "ammunition") continue;
      const fits = String(entry.system?.ammunition?.fits ?? "");
      if (!fits) continue;
      listed.push({
        name: String(entry.name ?? ""),
        fits,
        costPerRound: Number(entry.system?.cost) || 0,
        weightPerRound: Number(entry.system?.weight) || 0,
      });
      if (!fitting && ammunitionFits(weapon, fits)) {
        const doc = await pack.getDocument(entry._id);
        if (doc) fitting = doc.toObject();
      }
    }
  }
  return { fitting, listed };
}

/**
 * Buys rounds for a weapon: a box of the kind chosen, holding as many as
 * asked (one full load by default), priced at $20 a pound of reload
 * (Characters p. 278) times what the kind costs, from the packs' record
 * where there is one.
 */
export async function buyAmmunition(actor: any, item: any, modeIndex: number): Promise<any | null> {
  if (!actor?.isOwner || !item || !isRuleOn("reloading")) return null;
  const found = modeOf(item, modeIndex);
  if (!found) return null;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  const bow = item.system?.weaponClass === "bow";
  const shape = {
    damageType: mode.damageType,
    armorDivisor: Number(mode.armorDivisor) || 1,
    calibreMm: calibreOf(String(item.name ?? "")),
    tl: Number(item.system?.tl) || 0,
    bow,
  };
  const kinds = availableAmmunition(shape);
  const escape = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));
  const kindOptions = kinds.map((kind) => `<option value="${kind}"${kind === String(mode.ammunition ?? "") ? " selected" : ""}>${escape(A(kind || "none"))}</option>`).join("");

  // What a round of this weighs and costs before the kind's multiplier. The
  // pack's own record where there is one; else the table's reload weight over
  // the load; else the listed cartridge nearest in bore, since a weapon whose
  // reload weight was never filled in -- which is all of them -- would
  // otherwise be priced at $20 x 0, and buy its ammunition free.
  const { fitting: record, listed } = await packAmmunitionFor(item);
  const fits = String(record?.system?.ammunition?.fits ?? "") || ammunitionFitFor(item);
  const fromReload = capacity > 0 ? (Number(mode.reloadWeight) || 0) / capacity : 0;
  const comparable = record || fromReload > 0
    ? null
    : nearestAmmunitionByCalibre(listed, shape.calibreMm);
  const roundWeight = record
    ? Number(record.system?.weight) || 0
    : fromReload > 0 ? fromReload : comparable?.weightPerRound ?? 0;
  const basicCost = record
    ? Number(record.system?.cost) || ammunitionCost(roundWeight)
    : fromReload > 0 ? ammunitionCost(roundWeight) : comparable?.costPerRound ?? 0;

  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title: A("BuyTitle", { name: String(item.name) }) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:8px">
      <label style="display:flex;flex-direction:column;gap:4px">${A("Kind")}<select name="kind">${kindOptions}</select></label>
      <label style="display:flex;flex-direction:column;gap:4px">${A("Rounds")}<input type="number" name="rounds" min="1" step="1" value="${Math.max(1, capacity)}"></label>
      <label style="display:flex;flex-direction:column;gap:4px">${A("CostPerRound")}<input type="number" name="cost" min="0" step="0.01" value="${basicCost}"></label>
      <p class="ihint" style="margin:0">${escape(comparable
        ? A("PricedLike", { name: comparable.name })
        : record ? A("PricedFromRecord", { name: String(record.name) }) : A("PricedFromReload"))}</p>
    </div>`,
    ok: {
      label: A("Buy"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        const typed = root?.querySelector<HTMLInputElement>('input[name="cost"]')?.value;
        return {
          kind: root?.querySelector<HTMLSelectElement>('select[name="kind"]')?.value ?? "",
          rounds: rounds(root?.querySelector<HTMLInputElement>('input[name="rounds"]')?.value),
          cost: typed === undefined || typed === "" ? basicCost : Math.max(0, Number(typed) || 0),
        };
      },
    },
    rejectClose: false,
  });
  if (!asked || typeof asked !== "object") return null;
  const { kind, rounds: count, cost: askedCost } = asked as { kind: string; rounds: number; cost: number };
  if (count <= 0) return null;

  const effect = kind ? ammunitionEffect(kind as AmmunitionType, shape) : null;
  const multiplier = effect?.costMultiplier ?? 1;
  const roundCost = Math.round(askedCost * multiplier * 100) / 100;
  const baseName = record ? String(record.name) : A("RoundsFor", { fits });
  const name = kind ? `${baseName}, ${A(kind).toLowerCase()}` : baseName;
  const lc = effect?.lc ?? null;

  const data = {
    ...(record ?? {}),
    name,
    type: "equipment",
    system: {
      ...(record?.system ?? {}),
      category: "ammunition",
      ammunition: { kind, fits },
      quantity: count,
      weight: roundWeight,
      cost: roundCost,
      listCost: roundCost,
      carried: true,
      equipped: false,
      tl: record?.system?.tl || String(item.system?.tl ?? ""),
      ...(lc !== null ? { lc } : {}),
    },
  };
  delete (data as any)._id;
  const [made] = await actor.createEmbeddedDocuments("Item", [data]);
  // Rounds are shopping like any other, so the box is paid for out of the
  // cash on the sheet (Characters pp. 26, 278).
  await payFor(actor, Math.round(roundCost * count * 100) / 100, purchaseNote(count, name));
  ui.notifications?.info(A("Created", { name, rounds: count }));
  return made ?? null;
}

/** Every kind a box can be, for a select. */
export const AMMUNITION_KINDS: readonly string[] = AMMUNITION_TYPES;

/**
 * How long this weapon takes to reload in these hands, and whether it can
 * be reloaded at all.
 */
export function reloadPlan(actor: any, item: any, modeIndex: number, shotsToLoad?: number): {
  seconds: number | null;
  capacity: number;
  loading: number;
  perShot: boolean;
  needsGoatsFoot: boolean;
  mustStand: boolean;
  tooStrong: boolean;
} | null {
  const found = modeOf(item, modeIndex);
  if (!found) return null;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  const loaded = Math.max(0, Number(mode.loaded ?? 0) || 0);
  const loading = Math.max(0, Math.min(capacity - loaded, shotsToLoad ?? capacity - loaded));
  const base = reloadTime(entry, loadsByTheRound(entry) ? loading : capacity);

  // "Crossbows and ST": the bow's own ST against the user's (p. 270).
  const crossbow = /crossbow|prodd/i.test(String(mode.skill ?? "")) || /crossbow|prodd/i.test(String(item?.name ?? ""));
  if (crossbow) {
    const st = Number(actor?.system?.attributes?.ST ?? 10) || 10;
    const cocking = crossbowReloadTime({
      bowSt: mode.weaponSt ?? null,
      userSt: st,
      baseSeconds: base,
      goatsFoot: hasGoatsFoot(actor),
    });
    return { ...cocking, capacity, loading, perShot: entry.perShot };
  }
  return { seconds: base, capacity, loading, perShot: entry.perShot, needsGoatsFoot: false, mustStand: false, tooStrong: false };
}

/**
 * Reloads a weapon: fills the count, records the Ready maneuver, and posts
 * what it took. A weapon that loads shot by shot asks how many.
 */
export async function reloadWeapon(actor: any, item: any, modeIndex: number): Promise<void> {
  if (!item?.isOwner || !isRuleOn("reloading")) return;
  const found = modeOf(item, modeIndex);
  if (!found) return;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  if (capacity <= 0 || entry.thrown) return;
  const loaded = Math.max(0, Number(mode.loaded ?? 0) || 0);
  if (loaded >= capacity) {
    ui.notifications?.info(L("AlreadyFull", { name: String(item.name) }));
    return;
  }

  let shotsToLoad = capacity - loaded;
  if (loadsByTheRound(entry)) {
    const asked = await promptForShots(capacity - loaded);
    if (asked === null) return;
    shotsToLoad = asked;
  }

  const plan = reloadPlan(actor, item, modeIndex, shotsToLoad);
  if (!plan) return;
  // A weapon loaded from a box reloads from that box, and stops when it is
  // empty; one loaded from nowhere in particular reloads as it always has.
  const sourceId = String(mode.loadedFrom ?? "");
  const source = sourceId ? actor?.items?.get(sourceId) ?? null : null;
  if (source && rounds(source.system?.quantity) <= 0) {
    ui.notifications?.warn(A("NoRoundsLeft", { source: String(source.name) }));
    return;
  }
  if (plan.tooStrong) {
    ui.notifications?.warn(L("TooStrong", { name: String(item.name) }));
    return;
  }
  if (plan.needsGoatsFoot && plan.seconds === null) {
    ui.notifications?.warn(L("NeedsGoatsFoot", { name: String(item.name) }));
    return;
  }

  // What a module's Shots entry offers to help -- an assistant, a loading aid
  // (since 1.71.0) -- is asked first, since it changes what the skill saves.
  const ticked = entry.aids.length > 0 ? await promptForAids(item, entry.aids) : [];
  if (ticked === null) return;
  const aids = usableAids(ticked);

  // The rolls a module says the load needs (since 1.88.0), made before the
  // skill is offered: one failed that aborts spends the time and loads nothing.
  const required: string[] = [];
  let aborted = false;
  for (const roll of entry.requiredRolls) {
    const outcome = await rollForReload(actor, roll);
    const failed = outcome !== "success";
    const abort = failed && roll.onFail !== "continue";
    required.push(L(`Required.${abort ? "abort" : failed ? "failure" : "success"}`, { label: roll.label }));
    if (abort) { aborted = true; break; }
  }

  // Fast-Draw (Ammo) "always shaves at least one second off the reload time"
  // on a success -- more where the entry says so; a failure drops a round, a
  // critical failure the lot (Characters pp. 194-195).
  const timing = { entry, seconds: plan.seconds, rounds: plan.loading, aids };
  const fastDraw = !aborted && fastDrawHelps(timing)
    ? await rollFastDrawAmmo(actor, item, reloadTimeWith({ ...timing, fastDraw: true }).saved, entry.fastDrawRoll)
    : null;
  const { seconds, saved } = reloadTimeWith({ ...timing, fastDraw: fastDraw?.outcome === "success" });
  let loading = aborted ? 0 : plan.loading;
  if (fastDraw?.outcome === "failure") loading = Math.max(0, loading - 1);
  if (fastDraw?.outcome === "criticalFailure") loading = 0;
  if (source) {
    loading = Math.min(loading, rounds(source.system?.quantity));
    await source.update({ "system.quantity": rounds(source.system?.quantity) - loading });
  }

  await setLoaded(item, modeIndex, loaded + loading, source ? {} : { loadedFrom: "" });
  // "Reloading requires a number of Ready maneuvers" (p. 373).
  if (actor?.isOwner && actor.system?.maneuver !== undefined) await actor.update({ "system.maneuver": "ready" });

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    loaded: loaded + loading,
    capacity,
    seconds,
    perShot: plan.perShot,
    loading,
    fastDraw: fastDraw ? L(`FastDraw.${fastDraw.label ? "Other." : ""}${fastDraw.outcome}`, { seconds: saved, label: fastDraw.label }) : "",
    required,
    aids: aids.map((aid) => aid.label).join(", "),
    goatsFoot: plan.needsGoatsFoot,
    mustStand: plan.mustStand,
    source: source ? A("Left", { name: String(source.name), rounds: rounds(source.system?.quantity) }) : "",
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
}

/** The skill that reloads faster (Characters pp. 194-195). */
const FAST_DRAW_AMMO = "Fast-Draw (Ammo)";

/**
 * Offers the Fast-Draw (Ammo) roll to a character who knows the skill, where
 * the seconds it would save change anything, and makes it. Null where it
 * wasn't made. A module's Shots entry may name another roll in its place --
 * a skill, a level, or both (since 1.88.0).
 */
async function rollFastDrawAmmo(
  actor: any,
  item: any,
  saves: number,
  instead: ReloadRoll | null = null,
): Promise<{ outcome: "success" | "failure" | "criticalFailure"; label?: string } | null> {
  if (!actor || saves <= 0) return null;
  const skill = instead?.skill ?? FAST_DRAW_AMMO;
  const level = instead?.level ?? skillLevelOf(actor, skill);
  if (level === null) return null;
  const label = instead ? instead.label ?? skill : undefined;
  const wanted = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("Title") },
    content: `<p>${label === undefined
      ? L("FastDraw.Ask", { name: String(item?.name ?? ""), level, seconds: saves })
      : L("FastDraw.Other.Ask", { name: String(item?.name ?? ""), level, seconds: saves, label: foundry.utils.escapeHTML(label) })}</p>`,
    rejectClose: false,
  });
  if (!wanted) return null;
  // The roll module reaches this one, so it is loaded when the roll is made.
  const { rollSuccess } = await import("./roll.js");
  const result = await rollSuccess({ actor, base: level, label: label ?? L("FastDraw.Label"), skill });
  if (!result) return null;
  const outcome = result.criticalFailure ? "criticalFailure" : result.success ? "success" : "failure";
  return label === undefined ? { outcome } : { outcome, label };
}

/**
 * Makes a roll a module's Shots entry says the load needs (since 1.88.0),
 * against its level or the character's in its skill. Without either it
 * fails; one too low to attempt fails as well.
 */
async function rollForReload(actor: any, roll: ReloadRequiredRoll): Promise<"success" | "failure"> {
  const skill = roll.skill ?? "";
  const level = roll.level ?? (skill ? skillLevelOf(actor, skill) : null);
  if (!actor || level === null) return "failure";
  const { rollSuccess } = await import("./roll.js");
  const result = await rollSuccess({ actor, base: level, label: roll.label, ...(skill ? { skill } : {}) });
  return result?.success ? "success" : "failure";
}

/**
 * Asks which of the aids a module's Shots entry offers are used for this
 * reload (since 1.71.0). Null where the dialog was dismissed.
 */
async function promptForAids(item: any, aids: readonly ReloadAid[]): Promise<ReloadAid[] | null> {
  const escape = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));
  const boxes = aids.map((aid, i) => `<label style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" name="aid-${i}"${aid.checked && usableAids(aids.filter((other) => other.checked)).includes(aid) ? " checked" : ""}${aid.exclusiveGroup ? ` data-group="${escape(aid.exclusiveGroup)}"` : ""}><span>${escape(aid.label)}</span>
    </label>`).join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px"><p style="margin:0">${escape(L("Aids", { name: String(item?.name ?? "") }))}</p>${boxes}</div>`,
    // Aids sharing a group are used one at a time (since 1.88.0).
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      root.addEventListener("change", (event: Event) => {
        const box = event.target as HTMLInputElement | null;
        const group = box?.dataset?.group;
        if (!box?.checked || !group) return;
        root.querySelectorAll<HTMLInputElement>("input[data-group]").forEach((other) => {
          if (other !== box && other.dataset.group === group) other.checked = false;
        });
      });
    },
    ok: {
      label: L("Action"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return aids.filter((_aid, i) => form?.querySelector<HTMLInputElement>(`input[name="aid-${i}"]`)?.checked === true);
      },
    },
    rejectClose: false,
  });
  return Array.isArray(result) ? (result as ReloadAid[]) : null;
}

/** Asks how many shots to load, for a weapon loaded one at a time. */
async function promptForShots(most: number): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("HowMany", { most })}</span>
        <input type="number" name="shots" value="${most}" min="1" max="${most}" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: L("Action"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="shots"]');
        return Number(input?.value ?? most);
      },
    },
    rejectClose: false,
  });
  if (typeof result !== "number" || !Number.isFinite(result)) return null;
  return Math.max(1, Math.min(most, Math.floor(result)));
}

/**
 * Loads a ranged mode at once, without the Ready maneuvers or the card the
 * Reload button takes -- for a module's rule that readies a weapon faster
 * than the table. Shared magazines and the capacity hold as ever. Returns the
 * new count, or null where the mode keeps none or the user can't change it.
 */
export async function loadInstantly(item: any, modeIndex: number, shots: number): Promise<number | null> {
  if (!item?.isOwner || !isRuleOn("reloading")) return null;
  const found = modeOf(item, Math.floor(Number(modeIndex)));
  if (!found) return null;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  if (entry.thrown || capacity <= 0) return null;
  const loaded = Math.max(0, Number(mode.loaded ?? 0) || 0);
  const after = Math.min(capacity, loaded + Math.max(0, Math.floor(Number(shots) || 0)));
  if (after !== loaded) await setLoaded(item, Math.floor(Number(modeIndex)), after);
  return after;
}

/**
 * Gives a ranged mode back shots an attack took (since 1.83.0) -- for a
 * module's rule that says an attack fired nothing after all. Never above the
 * mode's capacity, and nothing where Infinite Ammunition kept the count from
 * going down. Shared magazines hold as ever. Returns the new count, or null
 * where the mode keeps none or the user can't change it.
 */
export async function refundShots(item: any, modeIndex: number, shots: number): Promise<number | null> {
  if (!item?.isOwner || !isRuleOn("reloading")) return null;
  const index = Math.floor(Number(modeIndex));
  const found = modeOf(item, index);
  if (!found) return null;
  const { mode, entry } = found;
  const capacity = fullLoad(entry);
  if (entry.thrown || capacity <= 0) return null;
  const loaded = Math.max(0, Number(mode.loaded ?? 0) || 0);
  if (hasInfiniteAmmunition((item as { actor?: any }).actor ?? null)) return loaded;
  const after = Math.min(capacity, loaded + Math.max(0, Math.floor(Number(shots) || 0)));
  if (after !== loaded) await setLoaded(item, index, after);
  return after;
}

// ── what an attack spent (since 1.71.0) ─────────────────────────────────────

/** How an attack spent its shots. */
export type ShotsKind = "single" | "rapidFire" | "spraying" | "suppression";

/** What `gworld.afterShots` hands its listeners. */
export interface AfterShotsContext {
  actor: any;
  item: any;
  modeIndex: number;
  /** The stored mode, read-only. */
  mode: any;
  /** Everything the attack used: `fired` + `extra` + `wasted`. */
  shots: number;
  /** Shells fired at the target or targets, or into the zones. */
  fired: number;
  /** What an attack option spent beyond them. */
  extra: number;
  /** Shots a spray wasted sweeping between targets (Campaigns p. 409). */
  wasted: number;
  kind: ShotsKind;
  /** Targets attacked: one, a spray's count, none for suppression. */
  targets: number;
  /**
   * The derived attack mode fired, where a module's row spent the stored
   * mode's rounds (since 1.101.0); null for the stored mode's own row.
   */
  derivedMode: string | null;
}

/** A spray's attacks, added up as they are made. */
export interface ShotsTally {
  fired: number;
  extra: number;
  wasted: number;
  targets: number;
}

/**
 * Tells the modules what an attack spent, once, after it is made -- whether or
 * not the weapon keeps a count, so heat, fouling or wear can be followed
 * without watching the item. Nothing is said for an attack that spent nothing.
 */
export function announceShots(options: Omit<AfterShotsContext, "mode" | "shots" | "derivedMode"> & { derivedMode?: string | null }): void {
  const modeIndex = Math.floor(Number(options.modeIndex));
  const mode = options.item?.system?.rangedModes?.[modeIndex];
  if (!options.item || !mode) return;
  const count = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
  const fired = count(options.fired);
  const extra = count(options.extra);
  const wasted = count(options.wasted);
  const shots = fired + extra + wasted;
  if (shots <= 0) return;
  callCombatHook(COMBAT_HOOKS.afterShots, {
    actor: options.actor ?? null, item: options.item, modeIndex, mode,
    shots, fired, extra, wasted, kind: options.kind, targets: count(options.targets),
    derivedMode: options.derivedMode ? String(options.derivedMode) : null,
  } satisfies AfterShotsContext);
}

/** Where an attack row's shots come from: a stored mode, and the rounds each shot takes. */
export interface ShotsSource {
  /** The stored ranged mode whose count the attack spends; not an integer where there is none. */
  modeIndex: number;
  /** The rounds each shot of the row takes off it: 1 but for a derived row that says otherwise. */
  perShot: number;
  /** The derived attack mode fired, or null for a stored mode's own row. */
  derivedMode: string | null;
}

/**
 * Which stored mode an attack spends (since 1.101.0). A stored mode's row
 * spends its own count; a module's derived row spends nothing unless it names
 * the stored mode whose rounds it fires (`spendsFrom`), and then
 * `roundsPerShot` of them for each shot.
 */
export function shotsSourceOf(button: { dataset: Record<string, string | undefined>; closest?: (selector: string) => any } | null): ShotsSource {
  const data = button?.dataset ?? {};
  const derived = String(data.derivedMode ?? button?.closest?.("[data-derived-mode]")?.dataset?.derivedMode ?? "") || null;
  const from = data.spendsFrom === undefined || data.spendsFrom === "" ? NaN : Number(data.spendsFrom);
  if (derived && Number.isInteger(from) && from >= 0) {
    return { modeIndex: from, perShot: Math.max(1, Math.floor(Number(data.roundsPerShot) || 1)), derivedMode: derived };
  }
  // A derived row that names no stored mode spends nothing.
  if (derived) return { modeIndex: NaN, perShot: 1, derivedMode: derived };
  return { modeIndex: data.modeIndex === undefined || data.modeIndex === "" ? NaN : Number(data.modeIndex), perShot: 1, derivedMode: null };
}

/**
 * Takes the shells a shot fired off the count. A thrown weapon or one whose
 * column says nothing keeps no count, and is left alone.
 */
/**
 * Shots the weapon has ready in one of its modes, or null where the mode keeps
 * no count -- a thrown weapon, or one whose table gives no magazine.
 */
export function shotsReady(item: any, modeIndex: number): number | null {
  const found = modeOf(item, modeIndex);
  if (!found) return null;
  const { mode, entry } = found;
  if (entry.thrown || fullLoad(entry) <= 0) return null;
  return Math.max(0, Number(mode.loaded ?? 0) || 0);
}

export async function spendShots(item: any, modeIndex: number, shellsFired: number): Promise<void> {
  if (!item?.isOwner || !isRuleOn("reloading")) return;
  const found = modeOf(item, modeIndex);
  if (!found) return;
  const { mode, entry } = found;
  if (entry.thrown || fullLoad(entry) <= 0) return;
  const loaded = Math.max(0, Number(mode.loaded ?? 0) || 0);
  // Infinite Ammunition (Campaigns p. 417): the count simply never goes down,
  // which is what "they immediately find more" comes to at the table.
  const after = shotsAfterFiring({
    loaded,
    fired: Math.max(1, Math.floor(shellsFired)),
    infinite: hasInfiniteAmmunition((item as { actor?: any }).actor ?? null),
  });
  if (after === loaded) return;
  await setLoaded(item, modeIndex, after);
  if (after === 0) ui.notifications?.info(L("Empty", { name: String(item.name) }));
}
