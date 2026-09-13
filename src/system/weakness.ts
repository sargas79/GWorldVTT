/**
 * Exposure to a Weakness (GURPS Basic Set: Characters p. 161).
 *
 * The trait's own row on the traits tab offers it: how long the character was
 * exposed -- a turn in the sun, a minute in the holy water -- and, for a
 * Variable Weakness, whether something shielded them or the source was
 * intense. The dice come off HP, or FP for Fatigue Only, "regardless of your
 * DR or defensive advantages", so nothing between the source and the
 * character is consulted.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { weaknessDice, weaknessOf, type WeaknessIntensity } from "../rules/weakness.js";

const WEAKNESS_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/weakness.hbs`;

const L = (key: string) => game.i18n.localize(`GWORLD.Weakness.${key}`);

/** Asks how long, and how strong, then applies what that costs. */
export async function exposeToWeakness(actor: any, item: any): Promise<void> {
  if (!actor?.isOwner) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }));
    return;
  }
  const weakness = weaknessOf({
    name: String(item?.name ?? ""),
    levels: Number(item?.system?.levels ?? 1),
    modifiers: ((item?.system?.modifiers ?? []) as Array<{ name?: string }>).map((m) => String(m.name ?? "")),
  });
  if (!weakness) return;

  const intensities: WeaknessIntensity[] = ["normal", "shielded", "intense"];
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;justify-content:space-between;gap:8px">
        <span>${L("MinutesPrompt")}</span>
        <input type="number" name="minutes" value="${weakness.intervalMinutes}" min="0" step="1" style="width:90px" autofocus>
      </label>
      ${weakness.variable
        ? `<label style="display:flex;justify-content:space-between;gap:8px">
            <span>${L("IntensityPrompt")}</span>
            <select name="intensity">${intensities
              .map((i) => `<option value="${i}">${L(`Intensity.${i}`)}</option>`)
              .join("")}</select>
          </label>`
        : ""}
    </div>`,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const minutes = Number(form?.querySelector<HTMLInputElement>('input[name="minutes"]')?.value ?? 0);
        const intensity = (form?.querySelector<HTMLSelectElement>('select[name="intensity"]')?.value ?? "normal") as WeaknessIntensity;
        return { minutes: Number.isFinite(minutes) ? minutes : 0, intensity };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object") return;
  const { minutes, intensity } = answer as { minutes: number; intensity: WeaknessIntensity };

  const diceCount = weaknessDice(weakness, minutes, intensity);
  const pool = weakness.fatigue ? actor.system?.fp : actor.system?.hp;
  const previous = Number(pool?.value) || 0;
  const max = Number(pool?.max) || 0;

  let dice: number[] = [];
  let total = 0;
  let roll: any = null;
  if (diceCount > 0) {
    roll = new Roll(`${diceCount}d6`);
    await roll.evaluate();
    dice = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
    total = roll.total;
    await actor.update({ [weakness.fatigue ? "system.fp.value" : "system.hp.value"]: previous - total });
    await syncHealthConditions(actor);
  }

  const content = await foundry.applications.handlebars.renderTemplate(WEAKNESS_TEMPLATE, {
    name: String(actor.name ?? ""),
    source: weakness.source || String(item.name),
    minutes,
    interval: weakness.intervalMinutes,
    intensityLabel: weakness.variable && intensity !== "normal" ? L(`Intensity.${intensity}`) : "",
    diceCount,
    dice,
    total,
    fatigue: weakness.fatigue,
    previous,
    now: previous - total,
    max,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    ...(roll ? { rolls: [roll] } : {}),
  });
}
