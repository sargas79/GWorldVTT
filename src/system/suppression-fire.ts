/**
 * Suppression Fire (GURPS Basic Set: Campaigns pp. 365, 409).
 *
 * An All-Out Attack that hoses a two-yard zone with automatic fire instead of
 * shooting at anyone. Anyone who enters the zone -- or the swath a yard
 * either side of the line from the firer to it -- before the firer's next
 * turn is attacked, at the normal modifiers but never at more than 6 plus the
 * rapid-fire bonus for the shots in the zone (8 plus it from a vehicle or
 * tripod mount), and struck at a random location.
 *
 * How it plays here:
 * - The firer's attack button, on All-Out Attack (Suppression Fire), asks for
 *   the shots and the zones, spends the shots and posts a card. The zone is
 *   centred on the one targeted token, or else on this user's latest
 *   template on the scene.
 * - The active GM's client keeps the zones on the scene as modifier areas
 *   (bands from the firer to each zone, with no lines), removes them when the
 *   firer's next turn starts or when the card's End button is pressed, and
 *   posts a prompt when a token moves into or through one.
 * - The card, and each prompt, carries a button for each token in the zone
 *   that resolves the attack on it: the GM or the firer's owner presses it.
 *   Tokens in the zone when it is placed are listed too.
 */

import { rapidFireHits, suppressionSkillCap, suppressionZones, SPREAD_FIRE_MIN_RATE_OF_FIRE, MULTIPLE_ZONES_MIN_RATE_OF_FIRE } from "../rules/ranged.js";
import { inShape, segmentCrossesShape, type ModifierArea, type Point } from "../rules/modifier-areas.js";
import { randomHitLocation } from "../rules/hit-locations.js";
import { aimBonus } from "../rules/aim.js";
import { scopeBonus } from "../rules/accessories.js";
import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { targetedTokens, withTargets } from "./targets.js";
import { addArea, centerOf, listAreas, pixelsPerYard, removeArea } from "./modifier-areas.js";
import { aimTurnsOf, loseAim } from "./aim.js";
import { announceShots, shotsReady, spendShots } from "./ammunition.js";
import { malfunctionOf } from "./malfunctions.js";
import { recordCalledShot } from "./called-shot.js";
import {
  applyAttackOptions,
  asAttackEffect as effectFields,
  attackOptionFields,
  attackOptionsFor,
  mergeAttackEffects,
  randomLocationWithHooks,
  readAttackOptionValues,
  registeredHitLocation,
  skillCapLine,
} from "./combat-extensions.js";
import { maneuverOptionAttackEffect } from "./procedure-extensions.js";
import { spendFatigue } from "./extra-effort.js";
import type { ModifierLine } from "./combat-extensions.js";
import {
  attackContextFor,
  burstTooShort,
  eyesOf,
  optionRateOfFire,
  optionShots,
  rangedModifiers,
  recordSuppressionShot,
  rollSuccess,
  standingRollLines,
  weaponFromDataset,
  yardsBetween,
} from "./roll.js";

const FLAG = "suppression";
/** Two yards across (Campaigns p. 409). */
const ZONE_RADIUS_YARDS = 1;

/** A suppression fired, as its card keeps it. */
export interface SuppressionRecord {
  actorUuid: string;
  tokenUuid: string;
  sceneId: string;
  /** The row fired from, for the damage roll that follows a hit. */
  itemId: string;
  modeIndex: number;
  rowKey: string;
  weapon: string;
  base: number;
  damageType: string;
  recoil: number;
  mounted: boolean;
  /** Lines the modules' options put on each attack from the zones (since 1.83.0). */
  modifiers?: ModifierLine[];
  halfDamageRange: number;
  /** What the shot's own modifiers are worked out from. */
  shooting: {
    accuracy: number;
    scopeBonus: number;
    bulk: number;
    guidance: string;
    halfDamageRange: number;
    maxRange: number;
    aimed: boolean;
    aim: { turns: number; braced: boolean };
  };
  /** Where the firer stood, and each zone's centre and shots, in scene pixels. */
  from: Point;
  zones: Array<{ center: Point; shots: number }>;
  /** A zone's radius, in yards and in scene pixels. */
  radius: number;
  radiusPx: number;
  /** Shots still able to strike: once every shot has hit, no more can (p. 409). */
  hitsLeft: number;
  ended: boolean;
}

/** Whether the actor is on All-Out Attack (Suppression Fire). */
export function suppressing(actor: any): boolean {
  return actor?.system?.maneuver === "allOutAttack" && actor.system.allOutAttackOption === "suppression" && isRuleOn("rapidFire");
}

/** Whether a row may lay down suppression fire. */
export function maySuppress(row: { rateOfFire?: unknown; noSuppressionFire?: unknown }): boolean {
  return Number(row.rateOfFire) >= SPREAD_FIRE_MIN_RATE_OF_FIRE && row.noSuppressionFire !== true && row.noSuppressionFire !== "1";
}

/**
 * Whether a row may lay down suppression fire, or may once a module's attack
 * option raises its Rate of Fire (since 1.83.0): the options' RoF is only
 * known when they are chosen, so a row with any on offer is let through to
 * the dialog, which refuses a burst still short of RoF 5.
 */
export function mayRaiseToSuppress(actor: any, item: any, row: { rateOfFire?: unknown; noSuppressionFire?: unknown }): boolean {
  if (maySuppress(row)) return true;
  if (row.noSuppressionFire === true || row.noSuppressionFire === "1" || !isRuleOn("rapidFire")) return false;
  return attackOptionsFor(attackContextFor({ actor, item, ranged: true, damageType: "", effectiveSkill: 0 })).length > 0;
}

function esc(text: string): string {
  return foundry.utils.escapeHTML(String(text ?? ""));
}

/** This user's latest template on the scene, as a point, or null. */
function latestTemplatePoint(): Point | null {
  const templates: any[] = (globalThis as any).canvas?.templates?.placeables ?? [];
  const mine = templates.filter((t) => t?.document?.author?.id === game.user?.id || t?.document?.user?.id === game.user?.id);
  const last = mine[mine.length - 1]?.document;
  return last && Number.isFinite(last.x) && Number.isFinite(last.y) ? { x: last.x, y: last.y } : null;
}

/**
 * Zone centres: the first where the fire is aimed, the rest beside it across
 * the line of fire, alternately either side, each a zone's width on.
 */
export function zoneCentres(from: Point, aim: Point, count: number, widthPx: number): Point[] {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const across = { x: -dy / length, y: dx / length };
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const step = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
    return { x: aim.x + across.x * widthPx * step, y: aim.y + across.y * widthPx * step };
  });
}

/** The areas a record's zones are kept as, the radius in scene pixels. */
function zoneAreas(messageId: string, record: SuppressionRecord, label: string): ModifierArea[] {
  return record.zones.map((zone, i) => ({
    id: `${SYSTEM_ID}-suppression-${messageId}-${i}`,
    label,
    center: zone.center,
    radius: record.radiusPx,
    from: record.from,
    lines: [],
    expires: null,
  }));
}

/** The zones of a record a point lies in, by index. */
function zonesHolding(record: SuppressionRecord, point: Point): number[] {
  return zoneAreas("x", record, "").flatMap((area, i) => (inShape(point, area) ? [i] : []));
}

/**
 * Fires suppression from an attack button. Returns true where it was fired.
 */
export async function fireSuppression(actor: any, button: HTMLElement, item: any): Promise<boolean> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Suppression.${key}`);
  const data = button.dataset;
  const row = button.closest<HTMLElement>("[data-item-id]");
  // The modules' options on this attack, and on the shooter's maneuver: one
  // may raise the Rate of Fire to what suppression needs (since 1.83.0).
  const weapon = weaponFromDataset(actor, { ...data });
  const addonContext = attackContextFor({
    actor, item, ranged: true, damageType: weapon.damageType, effectiveSkill: Number(data.rollTarget) || 0,
  });
  const stance = maneuverOptionAttackEffect(addonContext);
  if (!mayRaiseToSuppress(actor, item, { rateOfFire: optionRateOfFire(weapon, stance).rateOfFire, noSuppressionFire: data.noSuppressionFire })) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Suppression.NeedsRoF", { name: String(data.rollLabel ?? ""), rof: SPREAD_FIRE_MIN_RATE_OF_FIRE }));
    return false;
  }
  // A weapon out of action fires nothing until it is cleared (since 1.71.0).
  const outOfAction = malfunctionOf(item);
  if (outOfAction) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Malfunction.OutOfAction", { name: String(item?.name ?? ""), kind: outOfAction.label }));
    return false;
  }
  const shooterToken = actor?.getActiveTokens?.()?.[0] ?? null;
  const from = centerOf(shooterToken);
  const scene = (globalThis as any).canvas?.scene;
  if (!from || !scene) {
    ui.notifications?.warn(L("NoToken"));
    return false;
  }
  const targets = targetedTokens();
  const aimPoint = targets.length === 1 ? centerOf(targets[0]) : latestTemplatePoint();
  if (!aimPoint) {
    ui.notifications?.warn(L("NoZone"));
    return false;
  }

  // The Rate of Fire before the dialog's options, which may raise it: the
  // weapon's, as the maneuver's options leave it, capped by what is loaded.
  const offered = attackOptionsFor(addonContext).length > 0;
  const rateOfFire = optionRateOfFire(weapon, stance).rateOfFire;
  if (rateOfFire < SPREAD_FIRE_MIN_RATE_OF_FIRE && !offered) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Suppression.NeedsRoF", { name: String(data.rollLabel ?? ""), rof: SPREAD_FIRE_MIN_RATE_OF_FIRE }));
    return false;
  }
  const turnsAimed = aimTurnsOf(actor);
  const aiming = aimBonus({
    turnsAimed,
    accuracy: weapon.accuracy + scopeBonus({ bonus: weapon.scopeBonus, secondsAimed: turnsAimed }),
    braced: weapon.aim.braced,
  });
  const mountedByDefault = data.mount === "mounted" && data.offMount !== "1";
  const field = (name: string, label: string, value: number, extra = "") => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span><input type="number" name="${name}" value="${value}" min="1" step="1" style="width:90px"${extra}>
      </label>`;
  // With options offered the Rate of Fire is only known once they are
  // chosen, so the shots aren't capped in the field but after the dialog.
  const shotsLabel = (rof: number) => `${game.i18n.localize("GWORLD.Ranged.Shots")} (1-${rof})`;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p style="margin:0" data-suppression-intro>${game.i18n.format("GWORLD.Suppression.Intro", { rof: rateOfFire })}</p>
      ${field("shots", `<span data-suppression-shots>${shotsLabel(rateOfFire)}</span>`, rateOfFire, offered ? "" : ` max="${rateOfFire}"`)}
      ${rateOfFire >= MULTIPLE_ZONES_MIN_RATE_OF_FIRE || offered ? field("zones", L("Zones"), 1) : ""}
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="mounted" ${mountedByDefault ? "checked" : ""}><span>${L("Mounted")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="aimed" ${turnsAimed > 0 ? "checked" : ""}>
        <span>${game.i18n.localize("GWORLD.Ranged.Aimed")} (+${turnsAimed > 0 ? aiming.total : weapon.accuracy})</span>
      </label>
      ${attackOptionFields(addonContext)}
    </div>`;
  // What the options chosen come to, beside the maneuver's.
  const effectOf = (form: ParentNode | null) => mergeAttackEffects([
    effectFields(stance),
    effectFields(applyAttackOptions(addonContext, readAttackOptionValues(form, addonContext))),
  ]);
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content,
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      if (!offered) return;
      // The Rate of Fire the options chosen give, kept in step with them.
      const update = () => {
        const rof = optionRateOfFire(weapon, effectOf(root)).rateOfFire;
        const intro = root.querySelector<HTMLElement>("[data-suppression-intro]");
        if (intro) intro.textContent = game.i18n.format("GWORLD.Suppression.Intro", { rof });
        const label = root.querySelector<HTMLElement>("[data-suppression-shots]");
        if (label) label.textContent = shotsLabel(rof);
      };
      root.addEventListener("change", update);
      update();
    },
    ok: {
      label: L("Fire"),
      callback: (_event: Event, b: HTMLElement) => {
        const form = b.closest<HTMLElement>(".application");
        const n = (name: string, fallback: number) => Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value) || fallback;
        const box = (name: string) => form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        return { shots: n("shots", rateOfFire), zones: n("zones", 1), mounted: box("mounted"), aimed: box("aimed"), effect: effectOf(form) };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object") return false;
  const chosen = answer as { shots: number; zones: number; mounted: boolean; aimed: boolean; effect: ReturnType<typeof mergeAttackEffects> };
  // The Rate of Fire the options give is the one suppression needs 5+ of
  // (Campaigns p. 409), and the shots are held to their burst (since 1.83.0).
  const fired = optionRateOfFire(weapon, chosen.effect);
  if (fired.rateOfFire < SPREAD_FIRE_MIN_RATE_OF_FIRE) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Suppression.NeedsRoF", { name: String(data.rollLabel ?? ""), rof: SPREAD_FIRE_MIN_RATE_OF_FIRE }));
    return false;
  }
  const burst = optionShots(chosen.shots, fired.rateOfFire, chosen.effect);
  if (burst === null) {
    ui.notifications?.warn(burstTooShort(String(item?.name ?? data.rollLabel ?? ""), fired.rateOfFire, chosen.effect));
    return false;
  }
  const split = suppressionZones({ rateOfFire: fired.rateOfFire, shots: burst, zones: chosen.zones });
  if (split.problem) {
    ui.notifications?.warn(game.i18n.format(`GWORLD.Suppression.Problem.${split.problem}`, { rof: fired.rateOfFire, per: 5 }));
    return false;
  }
  const shots = split.shotsPerZone.reduce((s, n) => s + n, 0);
  // What an option spends beyond the shots fired, which the weapon must have.
  const extra = chosen.effect.shots;
  const modeIndex = Number(data.modeIndex);
  const ready = isRuleOn("reloading") && Number.isInteger(modeIndex) ? shotsReady(item, modeIndex) : null;
  if (ready !== null && shots + extra > ready) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Ranged.NotEnoughShots", { name: String(item?.name ?? ""), needed: shots + extra, ready }));
    return false;
  }
  // And the FP an option costs, paid before the shots go.
  if (chosen.effect.fatigue > 0 && !(await spendFatigue(actor, chosen.effect.fatigue, game.i18n.localize("GWORLD.ExtraEffort.Title")))) return false;

  const radius = ZONE_RADIUS_YARDS;
  const widthPx = 2 * radius * pixelsPerYard(scene);
  const centres = zoneCentres(from, aimPoint, split.shotsPerZone.length, widthPx);
  const record: SuppressionRecord = {
    actorUuid: String(actor.uuid ?? ""),
    tokenUuid: String(shooterToken?.document?.uuid ?? ""),
    sceneId: String(scene.id ?? ""),
    itemId: String(item?.id ?? row?.dataset.itemId ?? ""),
    modeIndex: Number(data.modeIndex) || 0,
    rowKey: row ? [row.dataset.itemId ?? "", row.dataset.derivedMode ?? "", row.dataset.modeIndex ?? ""].join("|") : "",
    weapon: String(data.rollLabel ?? ""),
    base: Number(data.rollTarget) || 0,
    damageType: String(data.damageType ?? ""),
    recoil: Math.max(1, Math.floor(fired.recoil) || 1),
    mounted: chosen.mounted,
    modifiers: chosen.effect.modifiers,
    halfDamageRange: weapon.halfDamageRange,
    shooting: {
      accuracy: weapon.accuracy,
      scopeBonus: weapon.scopeBonus,
      bulk: weapon.bulk,
      guidance: weapon.guidance,
      halfDamageRange: weapon.halfDamageRange,
      maxRange: weapon.maxRange,
      aimed: chosen.aimed,
      aim: { turns: weapon.aim.turns, braced: weapon.aim.braced },
    },
    from,
    zones: centres.map((center, i) => ({ center, shots: split.shotsPerZone[i]! })),
    radius,
    radiusPx: radius * pixelsPerYard(scene),
    hitsLeft: shots,
    ended: false,
  };

  // The rounds go, and so does the aim (Campaigns p. 373).
  if (isRuleOn("reloading") && item?.isOwner && Number.isInteger(modeIndex)) await spendShots(item, modeIndex, shots + extra);
  announceShots({ actor, item, modeIndex, fired: shots, extra, wasted: 0, kind: "suppression", targets: 0 });
  await loseAim(actor, "fired");

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: cardContent(record),
    flags: { [SYSTEM_ID]: { [FLAG]: record } },
  });
  return true;
}

/** The card's text; the buttons are added as it is rendered. */
function cardContent(record: SuppressionRecord): string {
  const zones = record.zones
    .map((zone, i) => `<span class="gc-mod">${esc(game.i18n.format("GWORLD.Suppression.Zone", {
      index: i + 1,
      shots: zone.shots,
      cap: suppressionSkillCap(zone.shots, record.mounted),
    }))}</span>`)
    .join("");
  return `<div class="gworld gworld-chat" data-gworld-suppression>
      <div class="gc-head">
        <span class="gc-label">${esc(game.i18n.format("GWORLD.Suppression.Card", { weapon: record.weapon }))}</span>
        <span class="gc-target">${game.i18n.localize("GWORLD.Chat.Target")} ${record.base}</span>
      </div>
      <div class="gc-mods">${zones}</div>
      <div class="gc-result">${esc(game.i18n.localize("GWORLD.Suppression.Explains"))}</div>
    </div>`;
}

/** The record on a card, or null. */
function recordOf(message: any): SuppressionRecord | null {
  const record = message?.getFlag?.(SYSTEM_ID, FLAG) ?? message?.flags?.[SYSTEM_ID]?.[FLAG];
  return record && typeof record === "object" && Array.isArray(record.zones) ? (record as SuppressionRecord) : null;
}

/** The scene a record's zones are on. */
function sceneOf(record: SuppressionRecord): any {
  return (game as any).scenes?.get?.(record.sceneId) ?? null;
}

/** Tokens on the record's scene standing in a zone now, other than the firer's. */
function tokensInZones(record: SuppressionRecord): Array<{ token: any; zone: number }> {
  const scene = sceneOf(record);
  const out: Array<{ token: any; zone: number }> = [];
  for (const doc of scene?.tokens ?? []) {
    if (doc?.uuid === record.tokenUuid || !doc?.actor) continue;
    const point = docCentre(doc, scene);
    if (!point) continue;
    const zones = zonesHolding(record, point);
    if (zones.length) out.push({ token: doc, zone: zones[0]! });
  }
  return out;
}

/** A token document's centre in scene pixels, from a position of it. */
function docCentre(doc: any, scene: any, position?: { x?: number; y?: number; width?: number; height?: number }): Point | null {
  if (!position) {
    const c = doc?.object?.center;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x, y: c.y };
  }
  const size = Number(scene?.grid?.size) || 100;
  const x = Number(position?.x ?? doc?.x);
  const y = Number(position?.y ?? doc?.y);
  const w = Number(position?.width ?? doc?.width) || 1;
  const h = Number(position?.height ?? doc?.height) || 1;
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x + (w * size) / 2, y: y + (h * size) / 2 } : null;
}

/** Whether this user may resolve the record's attacks: the GM, or whoever owns the firer. */
async function firerFor(record: SuppressionRecord): Promise<any> {
  const actor = await fromUuid(record.actorUuid).catch(() => null);
  return actor && (actor.isOwner || game.user?.isGM) ? actor : null;
}

/**
 * Resolves the attack on one token from a suppression's zone (Campaigns
 * p. 409): the normal modifiers but for visibility, the rapid-fire bonus for
 * the zone's shots, the skill cap, and a random location on a hit.
 */
export async function attackFromZone(message: any, tokenDoc: any, zoneIndex: number): Promise<void> {
  const record = recordOf(message);
  if (!record) return;
  const L = (key: string) => game.i18n.localize(`GWORLD.Suppression.${key}`);
  if (record.ended) {
    ui.notifications?.warn(L("Ended"));
    return;
  }
  if (record.hitsLeft <= 0) {
    ui.notifications?.warn(L("NoHitsLeft"));
    return;
  }
  const firer = await firerFor(record);
  if (!firer) {
    ui.notifications?.warn(L("NotYours"));
    return;
  }
  const zone = record.zones[zoneIndex] ?? record.zones[0]!;
  const victim = tokenDoc?.object ?? tokenDoc;
  const shooter = (await fromUuid(record.tokenUuid).catch(() => null)) as any;
  const range = yardsBetween(shooter?.object ?? { center: record.from }, victim) ?? 0;

  // "All normal attack modifiers apply -- including the rapid-fire bonus for
  // your effective RoF and any bonus for aiming prior to suppressing", less
  // the ones for seeing the target.
  const modifiers = rangedModifiers(
    {
      range,
      speed: 0,
      size: Number(tokenDoc?.actor?.system?.sm) || 0,
      modifier: 0,
      shots: zone.shots,
      situation: "normal",
      aimed: record.shooting.aimed,
    },
    { ...record.shooting, eyes: eyesOf(firer), watching: null },
  );
  modifiers.push(...standingRollLines(firer, { rollType: "attack", ranged: true, dialogAsked: true }));
  modifiers.push(...(record.modifiers ?? []));
  const cap = suppressionSkillCap(zone.shots, record.mounted);
  const capped = skillCapLine(record.base, modifiers, cap, game.i18n.format("GWORLD.Suppression.Cap", { cap }));
  if (capped) modifiers.push(capped);

  const outcome = await withTargets([victim], () =>
    rollSuccess({
      actor: firer,
      base: record.base,
      label: game.i18n.format("GWORLD.Suppression.Attack", { weapon: record.weapon, name: String(tokenDoc?.name ?? "") }),
      kind: "attack",
      modifiers,
      delivery: "ranged",
      damageType: record.damageType,
      rapidFire: { shotsFired: zone.shots, recoil: record.recoil },
      tags: ["suppressionFire"],
    }),
  );
  if (!outcome?.success) return;

  // "You cannot target a particular hit location with suppression fire."
  const hits = Math.min(record.hitsLeft, rapidFireHits({ margin: outcome.margin, shotsFired: zone.shots, recoil: record.recoil }));
  const die = new Roll("3d6");
  await die.evaluate();
  const location = randomLocationWithHooks(Number(die.total), randomHitLocation(Number(die.total)).location, tokenDoc?.actor, { damageType: record.damageType });
  const added = location.addonLocation ? registeredHitLocation(location.addonLocation) : undefined;
  const where = added ? added.label : game.i18n.localize(`GWORLD.HitLocation.${location.hitLocation}`);
  await recordCalledShot(firer, { hitLocation: location.hitLocation, chink: false, ...(location.addonLocation ? { addonLocation: location.addonLocation } : {}) });
  await recordSuppressionShot(firer, record.rowKey, range, record.halfDamageRange);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: firer }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(game.i18n.localize("GWORLD.Suppression.RandomLocation"))}</span></div>
      <div class="gc-dice"><span class="gc-total">${die.total}</span></div>
      <div class="gc-result">${esc(where)}</div></div>`,
    rolls: [die],
  });
  if (message?.isOwner || game.user?.isGM) {
    await message.setFlag(SYSTEM_ID, `${FLAG}.hitsLeft`, Math.max(0, record.hitsLeft - hits));
  }
}

/** Ends a suppression: its zones come off the scene and its card says so. */
async function endSuppression(message: any): Promise<void> {
  const record = recordOf(message);
  if (!record || record.ended) return;
  const scene = sceneOf(record);
  for (const area of listAreas(scene)) {
    if (area.id.startsWith(`${SYSTEM_ID}-suppression-${message.id}-`)) await removeArea(scene, area.id);
  }
  if (message.isOwner || game.user?.isGM) await message.setFlag(SYSTEM_ID, `${FLAG}.ended`, true);
}

/** The active GM, who keeps the zones: one client, so nothing is done twice. */
function isKeeper(): boolean {
  const active = (game as any).users?.activeGM;
  return active ? active.id === game.user?.id : Boolean(game.user?.isGM);
}

/** The live suppressions on a scene. */
function liveSuppressions(sceneId: string): Array<{ message: any; record: SuppressionRecord }> {
  const out: Array<{ message: any; record: SuppressionRecord }> = [];
  for (const message of (game as any).messages?.contents ?? []) {
    const record = recordOf(message);
    if (record && !record.ended && record.sceneId === sceneId) out.push({ message, record });
  }
  return out;
}

/** A button that attacks one token from a zone. */
function attackButton(message: any, tokenDoc: any, zone: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = game.i18n.format("GWORLD.Suppression.AttackButton", { name: String(tokenDoc?.name ?? "") });
  button.addEventListener("click", () => {
    button.disabled = true;
    void attackFromZone(message, tokenDoc, zone).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

/** Puts the buttons on a suppression card, and on a prompt that someone entered a zone. */
async function addSuppressionControls(message: any, html: HTMLElement): Promise<void> {
  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root) return;
  const prompt = message?.getFlag?.(SYSTEM_ID, "suppressionEntered") as { messageId: string; tokenUuid: string; zone: number } | undefined;
  if (prompt) {
    const source = (game as any).messages?.get?.(prompt.messageId);
    const record = recordOf(source);
    if (!record || record.ended || !(await firerFor(record))) return;
    const tokenDoc = await fromUuid(prompt.tokenUuid).catch(() => null);
    if (!tokenDoc) return;
    const row = document.createElement("div");
    row.className = "gc-apply";
    row.append(attackButton(source, tokenDoc, prompt.zone));
    root.append(row);
    return;
  }

  const record = recordOf(message);
  if (!record) return;
  if (record.ended) {
    const done = document.createElement("div");
    done.className = "gc-result";
    done.textContent = game.i18n.localize("GWORLD.Suppression.Ended");
    root.append(done);
    return;
  }
  const left = document.createElement("div");
  left.className = "gc-mods";
  left.innerHTML = `<span class="gc-mod">${esc(game.i18n.format("GWORLD.Suppression.HitsLeft", { hits: record.hitsLeft }))}</span>`;
  root.append(left);
  if (!(await firerFor(record))) return;

  // Whoever stands in a zone now, and whoever is targeted.
  const rows = document.createElement("div");
  rows.className = "gc-apply";
  for (const { token, zone } of tokensInZones(record)) rows.append(attackButton(message, token, zone));
  const aimed = document.createElement("button");
  aimed.type = "button";
  aimed.className = "gc-apply-button";
  aimed.textContent = game.i18n.localize("GWORLD.Suppression.AttackTargeted");
  aimed.addEventListener("click", () => {
    const targets = targetedTokens().filter((t: any) => t?.actor);
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Suppression.TargetOne"));
      return;
    }
    const doc = targets[0].document ?? targets[0];
    const point = centerOf(targets[0]);
    const zones = point ? zonesHolding(record, point) : [];
    void attackFromZone(message, doc, zones[0] ?? 0);
  });
  const end = document.createElement("button");
  end.type = "button";
  end.className = "gc-apply-button";
  end.textContent = game.i18n.localize("GWORLD.Suppression.End");
  end.addEventListener("click", () => void endSuppression(message));
  rows.append(aimed, end);
  root.append(rows);
}

/** Registers the hooks that keep the zones and resolve them. Called once, at init. */
export function registerSuppressionFire(): void {
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    void addSuppressionControls(message, html);
  });

  // The GM's client puts the zones on the scene: a player can't change it.
  Hooks.on("createChatMessage", (message: any) => {
    if (!isKeeper()) return;
    const record = recordOf(message);
    if (!record) return;
    const scene = sceneOf(record);
    if (!scene) return;
    const label = game.i18n.format("GWORLD.Suppression.Card", { weapon: record.weapon });
    void (async () => {
      for (const area of zoneAreas(String(message.id), record, label)) {
        // The radius is stored in pixels; the areas API takes yards.
        await addArea(scene, { ...area, radius: record.radius });
      }
    })();
  });

  // Anyone entering a zone, or crossing it, before the firer's next turn.
  Hooks.on("moveToken", (doc: any, movement: any) => {
    if (!isKeeper() || !doc?.actor) return;
    const scene = doc.parent;
    const live = liveSuppressions(String(scene?.id ?? ""));
    if (!live.length) return;
    const path = [movement?.origin, ...(movement?.passed?.waypoints ?? [])]
      .map((p: any) => docCentre(doc, scene, p))
      .filter((p): p is Point => p !== null);
    if (path.length < 2) return;
    for (const { message, record } of live) {
      if (doc.uuid === record.tokenUuid) continue;
      const areas = zoneAreas(String(message.id), record, "");
      const start = path[0]!;
      const zone = areas.findIndex((area) => !inShape(start, area) && path.slice(1).some((p, i) => inShape(p, area) || segmentCrossesShape(path[i]!, p, area)));
      if (zone < 0) continue;
      void ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor: doc.actor }),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        whisper: ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id),
        content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(game.i18n.format("GWORLD.Suppression.Entered", { name: String(doc.name ?? ""), weapon: record.weapon }))}</span></div></div>`,
        flags: { [SYSTEM_ID]: { suppressionEntered: { messageId: String(message.id), tokenUuid: String(doc.uuid), zone } } },
      });
    }
  });

  // The zones last until the start of the firer's next turn.
  Hooks.on("updateCombat", (combat: any, changed: any) => {
    if (!isKeeper() || !("turn" in (changed ?? {}) || "round" in (changed ?? {}))) return;
    const combatant = combat?.combatant;
    if (!combatant) return;
    // The firer by their token, or by their actor where the sheet fired it.
    const token = String(combatant.token?.uuid ?? "");
    const actor = String(combatant.actor?.uuid ?? "");
    for (const message of (game as any).messages?.contents ?? []) {
      const record = recordOf(message);
      if (record && !record.ended && ((token && record.tokenUuid === token) || (actor && record.actorUuid === actor))) void endSuppression(message);
    }
  });
}
