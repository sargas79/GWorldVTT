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
import { isRuleOn } from "./optional-rules.js";
import { shotsAfterFiring } from "../rules/cinematic.js";
import { hasInfiniteAmmunition } from "./cinematic.js";
import {
  crossbowReloadTime,
  fullLoad,
  parseShots,
  reloadTime,
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
  return { mode, entry: parseShots(String(mode.shots ?? "")) };
}

/**
 * Writes a count to every mode drawing on the same magazine.
 *
 * A pump shotgun fires shot or slug from one tube of five, and the table
 * gives both the same Shots entry; an ICW's rifle and grenade launcher have
 * their own, and are counted apart. So the column itself says which modes
 * share: identical entries are one magazine.
 */
async function setLoaded(item: any, modeIndex: number, loaded: number): Promise<void> {
  const modes: any[] = item.system.rangedModes ?? [];
  const shared = String(modes[modeIndex]?.shots ?? "");
  await item.update({
    "system.rangedModes": modes.map((m: any, i: number) =>
      i === modeIndex || String(m.shots ?? "") === shared ? { ...m, loaded } : m,
    ),
  });
}

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
  const base = reloadTime(entry, entry.perShot ? loading : capacity);

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
  if (entry.perShot) {
    const asked = await promptForShots(capacity - loaded);
    if (asked === null) return;
    shotsToLoad = asked;
  }

  const plan = reloadPlan(actor, item, modeIndex, shotsToLoad);
  if (!plan) return;
  if (plan.tooStrong) {
    ui.notifications?.warn(L("TooStrong", { name: String(item.name) }));
    return;
  }
  if (plan.needsGoatsFoot && plan.seconds === null) {
    ui.notifications?.warn(L("NeedsGoatsFoot", { name: String(item.name) }));
    return;
  }

  await setLoaded(item, modeIndex, loaded + plan.loading);
  // "Reloading requires a number of Ready maneuvers" (p. 373).
  if (actor?.isOwner && actor.system?.maneuver !== undefined) await actor.update({ "system.maneuver": "ready" });

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    name: String(item.name),
    loaded: loaded + plan.loading,
    capacity,
    seconds: plan.seconds,
    perShot: plan.perShot,
    loading: plan.loading,
    goatsFoot: plan.needsGoatsFoot,
    mustStand: plan.mustStand,
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
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
 * Takes the shells a shot fired off the count. A thrown weapon or one whose
 * column says nothing keeps no count, and is left alone.
 */
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
