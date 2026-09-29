/**
 * The parts of Vision Corrections (Basic Set Revised pp. 573-574) that sit in
 * a dialog or on a roll: the terrain the party is in and what it does to a
 * Tracking roll, the illumination-level picker of the attack dialog, and the
 * In Plain Sight choices of a Vision roll. The figures are in
 * `rules/vision-corrections.ts`; the rolls that use them are in
 * `vision-corrections.ts`.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import {
  ILLUMINATION_LEVELS,
  ILLUMINATION_ORDER,
  PLAIN_SIGHT_BONUS,
  PLAIN_SIGHT_DETAIL_BONUS,
  TERRAIN_ORDER,
  illuminationPenalty,
  trackingModifier,
  type TerrainType,
} from "../rules/vision-corrections.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Vision.${key}`, data) : game.i18n.localize(`GWORLD.Vision.${key}`);

/** The world settings: the terrain the party is in, and how the ground lies (the Tracking footnote). */
export const TERRAIN_KEY = "currentTerrain";
export const SURFACE_KEY = "terrainSurface";

/** How the ground lies where the table's footnote makes a difference (p. 573). */
export type TerrainSurface = "firm" | "loose" | "looseWindy";

/** Registers the two settings. Called once, at init, with the other world settings. */
export function registerTerrainSettings(): void {
  game.settings.register(SYSTEM_ID, TERRAIN_KEY, {
    name: "GWORLD.Vision.Setting.Terrain",
    hint: "GWORLD.Vision.Setting.TerrainHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    choices: { "": "GWORLD.Vision.Terrain_generic", ...Object.fromEntries(TERRAIN_ORDER.map((key) => [key, `GWORLD.Vision.Terrain_${key}`])) },
  });
  game.settings.register(SYSTEM_ID, SURFACE_KEY, {
    name: "GWORLD.Vision.Setting.Surface",
    hint: "GWORLD.Vision.Setting.SurfaceHint",
    scope: "world",
    config: true,
    type: String,
    default: "firm",
    choices: {
      firm: "GWORLD.Vision.Surface_firm",
      loose: "GWORLD.Vision.Surface_loose",
      looseWindy: "GWORLD.Vision.Surface_looseWindy",
    },
  });
}

/** The terrain the GM set, or null where none is. */
export function currentTerrain(): { terrain: TerrainType; surface: TerrainSurface } | null {
  try {
    const terrain = String(game.settings.get(SYSTEM_ID, TERRAIN_KEY) ?? "");
    if (!(TERRAIN_ORDER as readonly string[]).includes(terrain)) return null;
    const surface = String(game.settings.get(SYSTEM_ID, SURFACE_KEY) ?? "firm");
    return { terrain: terrain as TerrainType, surface: surface === "loose" || surface === "looseWindy" ? surface : "firm" };
  } catch {
    // Asked before the settings are registered: no terrain is set.
    return null;
  }
}

/** Whether a skill is Tracking (p. 226), whatever its specialty or tech level. */
export function isTrackingSkill(skill: string | undefined): boolean {
  return /^tracking\b/i.test(String(skill ?? "").trim());
}

/**
 * The line the terrain puts on a Tracking roll (p. 573), or none: with
 * Terrain Types Redux on and a terrain set, -2 in Arctic, Desert, Island/Beach
 * and Mountain, -4 in Swampland, and 0 in loose snow or sand without wind or
 * water.
 */
export function trackingTerrainLines(skill: string | undefined): Array<{ label: string; value: number; key: string }> {
  if (!isRuleOn("terrainTypes") || !isTrackingSkill(skill)) return [];
  const set = currentTerrain();
  if (!set) return [];
  const value = trackingModifier(set.terrain, { loose: set.surface !== "firm", windy: set.surface === "looseWindy" });
  if (value === 0) return [];
  return [{ label: L("TrackingTerrain", { terrain: game.i18n.localize(`GWORLD.Vision.Terrain_${set.terrain}`) }), value, key: "terrain" }];
}

// -- the illumination picker of the attack dialog (p. 574) --------------------

const row = (content: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">${content}</label>`;

/** The picker's options: the named levels with their penalties, and none. */
function levelOptions(): string {
  const options = ILLUMINATION_ORDER.map((key) => {
    const level = ILLUMINATION_LEVELS[key]!;
    return `<option value="${key}">${L(`Level_${key}`)} (${level.penalty})</option>`;
  });
  return `<option value="">${L("LevelNone")}</option>${options.join("")}`;
}

/**
 * The fields that turn a named level of light into the darkness the dialog
 * already asks for: the level, its flicker (-1 to -3) and whether the eyes
 * have adapted (p. 574).
 */
export function illuminationFields(): string {
  return [
    row(`<span>${L("Light")}</span><select name="light" style="width:180px">${levelOptions()}</select>`),
    row(`<span>${L("Flicker")}</span><input type="number" name="flicker" value="0" min="0" max="3" step="1" style="width:90px">`),
    `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="unadapted"><span>${L("Unadapted")}</span></label>`,
  ].join("");
}

/** What the picker's fields come to, as a penalty of 0 to -10, or null where no level is chosen. */
export function readIllumination(form: HTMLElement | null): { level: string; penalty: number } | null {
  const level = form?.querySelector<HTMLSelectElement>('select[name="light"]')?.value ?? "";
  if (!level || !(level in ILLUMINATION_LEVELS)) return null;
  const flicker = Number(form?.querySelector<HTMLInputElement>('input[name="flicker"]')?.value ?? 0) || 0;
  const unadapted = form?.querySelector<HTMLInputElement>('input[name="unadapted"]')?.checked ?? false;
  return { level, penalty: illuminationPenalty({ level, flicker, unadapted }) };
}

/**
 * Keeps the dialog's Darkness field in step with the picker: a level of -1 to
 * -9 is that darkness, and total darkness (-10) is the "nothing at all" sight
 * rather than a darkness of its own, since the field stops at 9.
 */
export function wireIllumination(root: HTMLElement): void {
  const form = root.closest<HTMLElement>(".application") ?? root;
  const apply = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !["light", "flicker", "unadapted"].includes(String((target as HTMLInputElement).name))) return;
    const chosen = readIllumination(form);
    const darkness = form.querySelector<HTMLInputElement>('input[name="darkness"]');
    const sight = form.querySelector<HTMLSelectElement>('select[name="sight"]');
    if (!chosen || !darkness) return;
    const total = chosen.penalty <= -10;
    darkness.value = String(total ? 0 : Math.min(9, -chosen.penalty));
    if (sight) {
      if (total) sight.value = "blind";
      else if (sight.value === "blind") sight.value = "clear";
    }
    darkness.dispatchEvent(new Event("change", { bubbles: true }));
  };
  root.addEventListener("change", apply);
}

// -- the Vision roll's prompt: In Plain Sight (p. 574) ------------------------

/**
 * The fields a Vision roll's modifier prompt adds: In Plain Sight (+10, or
 * +20 for details of a target already located), and the level of light.
 * Never offered on an attack, or a Quick Contest against a concealment skill.
 */
export function visionPromptFields(): string {
  return [
    row(`<span>${L("PlainSight")}</span><select name="plainSight" style="width:220px">
      <option value="0">${L("PlainSightNone")}</option>
      <option value="${PLAIN_SIGHT_BONUS}">${L("PlainSightBonus", { bonus: PLAIN_SIGHT_BONUS })}</option>
      <option value="${PLAIN_SIGHT_DETAIL_BONUS}">${L("PlainSightDetail", { bonus: PLAIN_SIGHT_DETAIL_BONUS })}</option>
    </select>`),
    illuminationFields(),
    `<p class="ihint" style="margin:0">${L("PlainSightHint")}</p>`,
  ].join("");
}

/** The lines a Vision roll's prompt chose: plain sight and the light. */
export function readVisionPrompt(form: HTMLElement | null): Array<{ label: string; value: number; key: string }> {
  const lines: Array<{ label: string; value: number; key: string }> = [];
  const sight = Number(form?.querySelector<HTMLSelectElement>('select[name="plainSight"]')?.value ?? 0) || 0;
  if (sight === PLAIN_SIGHT_BONUS || sight === PLAIN_SIGHT_DETAIL_BONUS) {
    lines.push({ label: L(sight === PLAIN_SIGHT_DETAIL_BONUS ? "PlainSightDetailLine" : "PlainSightLine"), value: sight, key: "plainSight" });
  }
  const light = readIllumination(form);
  if (light && light.penalty !== 0) lines.push({ label: L("LightLine", { level: L(`Level_${light.level}`) }), value: light.penalty, key: "illumination" });
  return lines;
}

// -- a shot from concealment (pp. 574-575) ------------------------------------

/** The attacker's flag: whether a shot from concealment has already given them away. */
export const CONCEALMENT_KEY = "concealment";

/** What a shot from concealment means for its card: whether it is the attacker's first. */
export interface ConcealedShot {
  first: boolean;
}

/** Whether an earlier shot from concealment has already revealed this attacker. */
export function concealmentRevealed(actor: any): boolean {
  const state = actor?.getFlag?.(SYSTEM_ID, CONCEALMENT_KEY) as { revealed?: boolean } | undefined;
  return state?.revealed === true;
}

/** The ranged dialog's box, shown only where Vision Rolls in Combat is on. */
export function concealmentField(actor?: any): string {
  if (!isRuleOn("visionRollsInCombat")) return "";
  const key = concealmentRevealed(actor) ? "ConcealedAgain" : "Concealed";
  return `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="concealed"><span>${L(key)}</span></label>`;
}

/** Whether the box is ticked. */
export function readConcealed(form: HTMLElement | null): boolean {
  return form?.querySelector<HTMLInputElement>('input[name="concealed"]')?.checked ?? false;
}

/**
 * A shot from concealment is being made: the first from an unrevealed
 * attacker is a surprise (no active defense), and it reveals them, so every
 * later one is met with a Vision roll without the +10. The attacker's flag
 * keeps the state until `hideAttacker` clears it.
 */
export async function noteConcealedShot(actor: any): Promise<ConcealedShot> {
  const first = !concealmentRevealed(actor);
  if (first && actor?.isOwner && typeof actor.setFlag === "function") {
    await actor.setFlag(SYSTEM_ID, CONCEALMENT_KEY, { revealed: true });
  }
  return { first };
}

/** The attacker is hidden again (the GM's call): their next shot from concealment is a surprise once more. */
export async function hideAttacker(actor: any): Promise<void> {
  if (typeof actor?.unsetFlag === "function") await actor.unsetFlag(SYSTEM_ID, CONCEALMENT_KEY);
}
