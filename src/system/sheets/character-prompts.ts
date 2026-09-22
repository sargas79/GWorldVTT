/**
 * The dialogs the character sheet asks its questions through, and the small
 * helpers they share.
 *
 * Kept out of the sheet's own file, which is long enough without them.
 */

import { tacticalOnScene } from "../settings.js";
import { isRuleOn } from "../optional-rules.js";
import { attackArc } from "../../rules/tactical.js";
import { type Entanglement } from "../entangling.js";
import { type Victim } from "../unarmed-techniques.js";
import { canParryLiquid } from "../../rules/dirty-tricks.js";
import { pressureAtDepth } from "../../rules/pressure.js";
import { type InventionPlan } from "../invention.js";
import type { DrugKind } from "../../rules/intoxication.js";
import type { InventionGrade } from "../../rules/invention.js";
import type { UnarmedTechnique } from "../../rules/unarmed-techniques.js";
import type { ResuscitationCause } from "../../rules/medicine.js";
import type { Limbs } from "../../rules/entangling.js";
import type { CollisionAngle } from "../../rules/collisions.js";
import type { DamageType } from "../../rules/types.js";
import { VEHICLE_ARCS, type VehicleArc, type VehicleLocation } from "../../rules/vehicle-combat.js";
import { culturePenalty, languagePenalty, type Comprehension } from "../../rules/languages.js";
import type { StudyMethod } from "../../rules/study.js";
import {
  choiceMetElsewhere,
  choiceSatisfied,
  entriesInGroup,
  requiredEntries,
  templateCost,
  type Template,
  type TemplateEntry,
} from "../../rules/templates.js";
import { REACTIONS, type Reaction } from "../../rules/reactions.js";
import type { CoverKind } from "../../rules/overpenetration.js";
import {
  CONTAGION_MODIFIERS,
  DISEASE_EXAMPLES,
  GENERIC_DELAY_SECONDS,
  GENERIC_INTERVAL_SECONDS,
  diseaseNamed,
  type Disease,
  type Exposure,
  type WoundDirt,
} from "../../rules/disease.js";
import { POISON_EXAMPLES, poisonNamed, type Poison, type Treatment } from "../../rules/poison.js";
import { offeredPoisons, registeredPoison } from "../poison-registry.js";
import { weaponTargetsFor } from "../weapon-damage.js";
import { attackDirection, facingOf } from "../hex.js";
import { SYSTEM_ID } from "../constants.js";
import { attributeOf } from "../attributes.js";
import { supersededCollections } from "../compendium-sources.js";
import type { AcidContact, AcidLanding } from "../../rules/acid.js";
import type { AtmosphereHazard, HazardStrength } from "../../rules/atmosphere.js";
import type { PressureSupport } from "../../rules/pressure.js";
import { unconditionalReaction, type ReactionSource } from "../../rules/social.js";
import { currentTargets } from "../targets.js";

/**
 * Which way the mover is coming at the foe, for the evade modifiers.
 *
 * Only a hex grid can say: approaching from a side or from behind is a fact
 * about facing, and a square or gridless scene has none. Everywhere else the
 * approach is taken as head-on, which is the version of the rule that asks
 * least and claims least.
 */
export async function approachTo(mover: any, foeToken: any): Promise<"front" | "side" | "back"> {
  const foeDocument = foeToken?.document ?? foeToken;
  const gridType = foeDocument?.parent?.grid?.type;
  if (!tacticalOnScene(gridType)) return "front";

  const moverToken = mover?.getActiveTokens?.()?.[0]?.document;
  if (!moverToken) return "front";

  const from = attackDirection(moverToken, foeDocument, gridType);
  if (from === null) return "front";
  return attackArc(facingOf(foeDocument, gridType), from).arc;
}

/**
 * Asks how much more is being asked of the body, and why.
 *
 * Returns null when the dialog is dismissed, which cancels the attempt.
 */
export async function promptForExtraEffort(): Promise<{
  percentIncrease: number;
  motivated: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.ExtraEffort.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Percent")}</span>
        <input type="number" name="percent" value="10" min="0" step="5" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="motivated">
        <span>${L("MotivatedHint")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          percentIncrease:
            Number(form?.querySelector<HTMLInputElement>('input[name="percent"]')?.value ?? 0) || 0,
          motivated:
            form?.querySelector<HTMLInputElement>('input[name="motivated"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * A number from the derived block, or a fallback when there is none.
 *
 * `|| fallback` will not do: a Climbing of 0 is a real score for someone with
 * DX 5, and would be silently replaced by it.
 */
/** Runs a module's availability check, reading a check that throws as "not offered". */
export function safeAvailable(check: () => boolean): boolean {
  try {
    return check() === true;
  } catch (error) {
    console.warn("gworld | a module's availability check failed", error);
    return false;
  }
}

export function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Asks how far, onto what, and how well.
 *
 * Returns null when the dialog is dismissed, which cancels the fall -- nobody
 * hits the ground by accident here.
 */
export async function promptForFall(): Promise<{
  yards: number;
  surface: "hard" | "soft";
  controlled: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Fall.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Yards")}</span>
        <input type="number" name="yards" value="1" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Onto")}</span>
        <select name="surface" style="width:120px">
          <option value="hard">${L("Surface.hard")}</option>
          <option value="soft">${L("Surface.soft")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="controlled">
        <span>${L("ControlledHint")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          yards:
            Number(form?.querySelector<HTMLInputElement>('input[name="yards"]')?.value ?? 0) || 0,
          surface:
            form?.querySelector<HTMLSelectElement>('select[name="surface"]')?.value === "soft"
              ? "soft"
              : "hard",
          controlled:
            form?.querySelector<HTMLInputElement>('input[name="controlled"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what the weather is doing (Campaigns pp. 430, 434).
 *
 * The two halves ask different things -- a wind matters in the cold and not in
 * the heat, and what somebody is wearing matters the other way round -- but
 * they are one dialog, because "which way is it killing me" is the first
 * question and the rest follows from it.
 */
export async function promptForWeather(
  /** What the character's worn gear counts as, where a module says (since API 1.76.0): picked to start with. */
  worn: { clothing: string; label: string } | null = null,
): Promise<{
  heat: boolean;
  temperatureF: number;
  clothing: "light" | "winter" | "arctic" | "heatedSuit";
  wetClothes: boolean;
  windMph: number;
  modifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Weather.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Kind")}</span>
        <select name="kind" style="width:220px">
          <option value="heat">${L("HeatOption")}</option>
          <option value="cold">${L("ColdOption")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Temperature")}</span>
        <input type="number" name="degrees" value="95" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Clothing")}</span>
        <select name="clothing" style="width:220px">
          ${["light", "winter", "arctic", "heatedSuit"].map((c) =>
            `<option value="${c}"${worn?.clothing === c ? " selected" : ""}>${L(`Clothing_${c}`)}</option>`).join("")}
        </select>
      </label>
      ${worn ? `<p class="ihint" style="margin:0">${game.i18n.format("GWORLD.Weather.WornHint", {
        clothing: L(`Clothing_${worn.clothing}`),
        label: foundry.utils.escapeHTML(worn.label),
      })}</p>` : ""}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Wind")}</span>
        <input type="number" name="wind" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="wet">
        <span>${L("Wet")}</span>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "";
        const chosen = (name: string) =>
          form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";

        return {
          heat: chosen("kind") !== "cold",
          temperatureF: Number(value("degrees")) || 0,
          clothing: chosen("clothing") || "light",
          wetClothes: form?.querySelector<HTMLInputElement>('input[name="wet"]')?.checked ?? false,
          windMph: Number(value("wind")) || 0,
          modifier: Number(value("modifier")) || 0,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks how the day's rations went (Campaigns p. 426).
 *
 * How much water a day needs depends on where it was spent, so the climate is
 * asked alongside what was actually drunk.
 */
export async function promptForRations(): Promise<{
  mealsMissed: number;
  climate: "temperate" | "hot" | "desert";
  quartsDrunk: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Weather.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Deprivation") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Meals")}</span>
        <input type="number" name="meals" value="0" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Climate")}</span>
        <select name="climate" style="width:220px">
          <option value="temperate">${L("Climate_temperate")}</option>
          <option value="hot">${L("Climate_hot")}</option>
          <option value="desert">${L("Climate_desert")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Quarts")}</span>
        <input type="number" name="quarts" value="2" min="0" step="0.5" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          mealsMissed:
            Number(form?.querySelector<HTMLInputElement>('input[name="meals"]')?.value ?? 0) || 0,
          climate:
            form?.querySelector<HTMLSelectElement>('select[name="climate"]')?.value || "temperate",
          quartsDrunk:
            Number(form?.querySelector<HTMLInputElement>('input[name="quarts"]')?.value ?? 0) || 0,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what somebody has been given, and how much of it (Campaigns pp. 437-438).
 *
 * The named poisons are offered because they are the ones with numbers already
 * worked out; anything else is six fields, which is all a poison is.
 */
export async function promptForPoison(): Promise<{ poison: Poison; doublings: number } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Poison.${key}`);

  // The Basic Set's named poisons, then any a module registered (since 1.57.0).
  const options = [
    ...POISON_EXAMPLES.map((poison) => `<option value="${poison.name}">${poison.name}</option>`),
    ...offeredPoisons().map((poison) => `<option value="${poison.source}">${foundry.utils.escapeHTML(poison.label)}</option>`),
  ].join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Which")}</span>
        <select name="poison" style="width:200px">
          ${options}
          <option value="">${L("Custom")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Dose")}</span>
        <select name="dose" style="width:200px">
          <option value="-1">${L("Dose_-1")}</option>
          <option value="0" selected>${L("Dose_0")}</option>
          <option value="1">${L("Dose_1")}</option>
          <option value="2">${L("Dose_2")}</option>
        </select>
      </label>
      <hr>
      <p class="ihint">${L("Custom")}</p>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Name")}</span>
        <input type="text" name="name" value="" style="width:200px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Resistance")}</span>
        <input type="number" name="resistance" value="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="resistible" checked>
        <span>${L("Resistible")}</span>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Damage")}</span>
        <select name="damage" style="width:200px">
          <option value="toxic">${L("Damage_toxic")}</option>
          <option value="fatigue">${L("Damage_fatigue")}</option>
          <option value="none">${L("Damage_none")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Dice")}</span>
        <input type="number" name="dice" value="1" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("DelayField")}</span>
        <input type="number" name="delay" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Interval")}</span>
        <input type="number" name="interval" value="3600" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Cycles")}</span>
        <input type="number" name="cycles" value="1" min="1" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: L("Dosed"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const field = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "";
        const chosen = (name: string) =>
          form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;

        const doublings = Number(chosen("dose")) || 0;
        const named = poisonNamed(chosen("poison")) ?? registeredPoison(chosen("poison"));
        if (named) return { poison: named, doublings };

        const resistible = ticked("resistible");
        return {
          poison: {
            name: field("name") || game.i18n.localize("GWORLD.Poison.Title"),
            delivery: [],
            delaySeconds: Number(field("delay")) || 0,
            resistanceModifier: resistible ? Number(field("resistance")) || 0 : null,
            damage: (chosen("damage") || "toxic") as Poison["damage"],
            dice: Number(field("dice")) || 0,
            adds: 0,
            intervalSeconds: Number(field("interval")) || 0,
            cycles: Math.max(1, Number(field("cycles")) || 1),
          } satisfies Poison,
          doublings,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks which treatment was tried against a dose (Campaigns p. 439). */
export async function promptForTreatment(treater: any): Promise<{
  treatment: Treatment;
  antidoteBonus: number;
  skillLevel: number | null;
} | null> {
  // The treater's best of First Aid and Physician, to start the field at; the
  // victim treating themselves is the ordinary case, and a friend's figure can
  // be typed over it.
  const firstAid = treater?.system?.skillLevelByName?.("First Aid") ?? null;
  const physician = treater?.system?.skillLevelByName?.("Physician") ?? null;
  const best = [firstAid, physician].filter((v): v is number => typeof v === "number");
  const skillStart = best.length ? Math.max(...best) : "";
  const L = (key: string) => game.i18n.localize(`GWORLD.Poison.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Treat") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Treatment")}</span>
        <select name="treatment" style="width:240px">
          <option value="suckWound">${L("Treatment_suckWound")}</option>
          <option value="induceVomiting">${L("Treatment_induceVomiting")}</option>
          <option value="medical">${L("Treatment_medical")}</option>
          <option value="antidote">${L("Treatment_antidote")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("AntidoteBonus")}</span>
        <input type="number" name="antidote" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px"
             title="${L("TreaterSkillHint")}">
        <span>${L("TreaterSkill")}</span>
        <input type="number" name="skill" value="${skillStart}" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: L("Treat"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          treatment: (form?.querySelector<HTMLSelectElement>('select[name="treatment"]')?.value ??
            "medical") as Treatment,
          antidoteBonus:
            Number(form?.querySelector<HTMLInputElement>('input[name="antidote"]')?.value ?? 0) || 0,
          // Blank is nobody with the skill, which is a failed treatment, not a zero.
          skillLevel: (() => {
            const raw = form?.querySelector<HTMLInputElement>('input[name="skill"]')?.value ?? "";
            return raw.trim() === "" ? null : Number(raw) || 0;
          })(),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks how the hour at the tavern went (Campaigns p. 439). */
export async function promptForDrinks(): Promise<{
  drinks: number;
  emptyStomach: boolean;
  recentlyEaten: boolean;
  tolerance: boolean;
  intolerance: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Drink.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Drinks")}</span>
        <input type="number" name="drinks" value="1" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Stomach")}</span>
        <select name="stomach" style="width:220px">
          <option value="normal">${L("Stomach_normal")}</option>
          <option value="empty">${L("Stomach_empty")}</option>
          <option value="fed">${L("Stomach_fed")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="tolerance">
        <span>${L("Tolerance")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="intolerance">
        <span>${L("Intolerance")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        const stomach = form?.querySelector<HTMLSelectElement>('select[name="stomach"]')?.value;

        return {
          drinks:
            Number(form?.querySelector<HTMLInputElement>('input[name="drinks"]')?.value ?? 0) || 0,
          emptyStomach: stomach === "empty",
          recentlyEaten: stomach === "fed",
          tolerance: ticked("tolerance"),
          intolerance: ticked("intolerance"),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what is going round and how close they got (Campaigns pp. 442-443).
 *
 * The two illustrations the book works through are offered as starting points,
 * because a disease is four numbers and those are two sets that are known to
 * add up to something playable.
 */
export async function promptForDisease(): Promise<{
  disease: Disease;
  exposures: Exposure[];
  modifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Illness.${key}`);

  const diseases = DISEASE_EXAMPLES.map(
    (disease) => `<option value="${disease.name}">${disease.name}</option>`,
  ).join("");
  const contacts = (Object.keys(CONTAGION_MODIFIERS) as Exposure[])
    .map((key) => `<option value="${key}">${L(`Exposure_${key}`)}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Which")}</span>
        <select name="disease" style="width:220px">
          ${diseases}
          <option value="">${L("Custom")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Exposure")}</span>
        <select name="exposure" style="width:280px">
          ${contacts}
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
      <hr>
      <p class="ihint">${L("Custom")}</p>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Name")}</span>
        <input type="text" name="name" value="" style="width:200px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Virulence")}</span>
        <input type="number" name="virulence" value="-2" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Damage")}</span>
        <input type="number" name="damage" value="1" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Delay")}</span>
        <input type="number" name="delay" value="${GENERIC_DELAY_SECONDS}" min="0" step="1" style="width:110px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Interval")}</span>
        <input type="number" name="interval" value="${GENERIC_INTERVAL_SECONDS}" min="0" step="1" style="width:110px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Cycles")}</span>
        <input type="number" name="cycles" value="6" min="1" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const field = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "";
        const chosen = (name: string) =>
          form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";

        const exposures = [chosen("exposure") as Exposure];
        const modifier = Number(field("modifier")) || 0;
        const named = diseaseNamed(chosen("disease"));
        if (named) return { disease: named, exposures, modifier };

        return {
          disease: {
            name: field("name") || game.i18n.localize("GWORLD.Illness.Title"),
            vector: "contact",
            resistanceModifier: Number(field("virulence")) || 0,
            delaySeconds: Number(field("delay")) || 0,
            dice: 0,
            adds: Math.max(0, Number(field("damage")) || 0),
            intervalSeconds: Number(field("interval")) || 0,
            cycles: Math.max(1, Number(field("cycles")) || 1),
          } satisfies Disease,
          exposures,
          modifier,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks what got into the wound (Campaigns p. 444). */
export async function promptForInfection(): Promise<{
  dirt: WoundDirt[];
  antibiotics: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Illness.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Infection") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="dung">
        <span>${L("Dirt_dung")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="special">
        <span>${L("Dirt_specialInfection")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="antibiotics">
        <span>${L("Antibiotic")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;

        const dirt: WoundDirt[] = [];
        if (ticked("dung")) dirt.push("dung");
        if (ticked("special")) dirt.push("specialInfection");
        if (dirt.length === 0) dirt.push("clean");

        return { dirt, antibiotics: ticked("antibiotics") };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** A weapon the scatter prompt offers, with what it fills in (since API 1.72.0). */
export interface ScatterWeapon {
  label: string;
  fragmentationDice: number;
  /** The row always scatters by the square of the margin. */
  squared: boolean;
}

/** Asks how badly the grenade was thrown (Campaigns p. 414). */
export async function promptForScatter(weapons: ScatterWeapon[] = []): Promise<{
  margin: number;
  distanceYards: number;
  dodged: boolean;
  unseen: boolean;
  squared: boolean;
  fragmentationDice: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Scatter.${key}`);
  const esc = (text: string) => foundry.utils.escapeHTML(text);

  // The character's explosive and area weapons, so the fragments and whether
  // the miss is squared come from the row rather than from memory.
  const picker = weapons.length > 0
    ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Weapon")}</span>
        <select name="weapon" style="max-width:220px">
          <option value="">&mdash;</option>
          ${weapons.map((w, i) => `<option value="${i}">${esc(w.label)}</option>`).join("")}
        </select>
      </label>`
    : "";

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${picker}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Margin")}</span>
        <input type="number" name="margin" value="1" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Distance")}</span>
        <input type="number" name="distance" value="10" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Fragmentation")}</span>
        <input type="number" name="fragmentation" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="dodged">
        <span>${L("Dodged")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="unseen">
        <span>${L("Unseen")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        const picked = weapons[Number(form?.querySelector<HTMLSelectElement>('select[name="weapon"]')?.value ?? "")];
        return {
          margin: num("margin"),
          distanceYards: num("distance"),
          fragmentationDice: num("fragmentation"),
          dodged: ticked("dodged"),
          unseen: ticked("unseen"),
          squared: picked?.squared === true,
        };
      },
    },
    render: (_event: Event, dialog: any) => {
      // Choosing a weapon fills in its fragments and ticks the squared miss.
      const form: HTMLElement | null = dialog?.element ?? dialog ?? null;
      const select = form?.querySelector<HTMLSelectElement>('select[name="weapon"]');
      select?.addEventListener("change", () => {
        const picked = weapons[Number(select.value)];
        if (!picked) return;
        const dice = form?.querySelector<HTMLInputElement>('input[name="fragmentation"]');
        if (dice) dice.value = String(picked.fragmentationDice);
        const unseen = form?.querySelector<HTMLInputElement>('input[name="unseen"]');
        if (unseen && picked.squared) unseen.checked = true;
      });
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** A weapon the overpenetration prompt offers, with what it fills in (since API 1.73.0). */
export interface OverpenetrationWeapon {
  label: string;
  damageType: string;
  armorDivisor: number;
  /** The row refuses overpenetration whatever its damage type. */
  refused: boolean;
}

/** Asks what the shot went through and what is behind it (Campaigns p. 408). */
export async function promptForOverpenetration(weapons: OverpenetrationWeapon[] = []): Promise<{
  basicDamage: number;
  coverDr: number;
  coverHp: number;
  coverKind: CoverKind;
  armorDivisor: number;
  behindDr: number;
  damageType: string;
  tightBeam: boolean;
  /** The weapon picked refuses overpenetration (since API 1.73.0). */
  refused: boolean;
  /** Its label, blank where none was picked. */
  weapon: string;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Overpenetration.${key}`);
  const esc = (text: string) => foundry.utils.escapeHTML(text);
  const types = ["pi-", "pi", "pi+", "pi++", "imp", "burn", "cr", "cut"];

  // The character's ranged rows, so the type, the divisor and whether the row
  // refuses to go through come from the weapon rather than from memory.
  const picker = weapons.length > 0
    ? `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Weapon")}</span>
        <select name="weapon" style="max-width:220px">
          <option value="">&mdash;</option>
          ${weapons.map((w, i) => `<option value="${i}">${esc(w.label)}</option>`).join("")}
        </select>
      </label>`
    : "";
  const pickedFrom = (form: HTMLElement | null | undefined) => {
    const value = form?.querySelector<HTMLSelectElement>('select[name="weapon"]')?.value ?? "";
    return value === "" ? null : (weapons[Number(value)] ?? null);
  };

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${picker}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("BasicDamage")}</span>
        <input type="number" name="damage" value="0" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("DamageType")}</span>
        <select name="damageType" style="width:120px">
          ${types.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="tightBeam"><span>${L("TightBeam")}</span>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Kind")}</span>
        <select name="kind" style="width:180px">
          <option value="flesh">${L("Kind_flesh")}</option>
          <option value="unliving">${L("Kind_unliving")}</option>
          <option value="homogenous">${L("Kind_homogenous")}</option>
          <option value="thinSlab">${L("Kind_thinSlab")}</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("CoverDrField")}</span>
        <input type="number" name="coverDr" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("CoverHp")}</span>
        <input type="number" name="coverHp" value="10" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Divisor")}</span>
        <input type="number" name="divisor" value="1" min="1" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("BehindDr")}</span>
        <input type="number" name="behindDr" value="0" min="0" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        return {
          basicDamage: num("damage"),
          coverDr: num("coverDr"),
          coverHp: num("coverHp"),
          coverKind: (form?.querySelector<HTMLSelectElement>('select[name="kind"]')?.value ??
            "flesh") as CoverKind,
          armorDivisor: Math.max(1, num("divisor")),
          behindDr: num("behindDr"),
          damageType: form?.querySelector<HTMLSelectElement>('select[name="damageType"]')?.value ?? "pi",
          tightBeam: form?.querySelector<HTMLInputElement>('input[name="tightBeam"]')?.checked ?? false,
          refused: pickedFrom(form)?.refused === true,
          weapon: pickedFrom(form)?.label ?? "",
        };
      },
    },
    render: (_event: Event, dialog: any) => {
      // Choosing a weapon fills in its damage type and armour divisor.
      const form: HTMLElement | null = dialog?.element ?? dialog ?? null;
      const select = form?.querySelector<HTMLSelectElement>('select[name="weapon"]');
      select?.addEventListener("change", () => {
        const picked = pickedFrom(form);
        if (!picked) return;
        const type = form?.querySelector<HTMLSelectElement>('select[name="damageType"]');
        if (type && types.includes(picked.damageType)) type.value = picked.damageType;
        const divisor = form?.querySelector<HTMLInputElement>('input[name="divisor"]');
        if (divisor) divisor.value = String(Math.max(1, picked.armorDivisor || 1));
      });
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Who is listening for a shot, and what they are listening through (Campaigns p. 411). */
export async function promptForHearing(): Promise<{
  silencer: "none" | "typical" | "best";
  loudness: number;
  upClose: boolean;
  inPlainSight: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Hearing.${key}`);
  const silencers: Array<[string, string]> = (["none", "typical", "best"] as const).map((k) => [k, L(`Silencer.${k}`)]);
  return hazardPrompt(
    L("Title"),
    hazardSelect("silencer", L("SilencerLabel"), silencers) +
      hazardField("loudness", L("Loudness"), 0, 'min="-4" max="4"') +
      hazardCheck("upClose", L("UpClose")) +
      hazardCheck("inPlainSight", L("InPlainSight")),
    (form) => ({
      silencer: (str(form, "silencer") || "none") as "none" | "typical" | "best",
      loudness: Math.max(-4, Math.min(4, num(form, "loudness"))),
      upClose: ticked(form, "upClose"),
      inPlainSight: ticked(form, "inPlainSight"),
    }),
  );
}

/** A flame against a material (Campaigns p. 433). */
export async function promptForAlight(): Promise<{
  material: "superFlammable" | "highlyFlammable" | "flammable" | "resistant" | "highlyResistant" | "nonflammable";
  flameDamagePerSecond: number;
  seconds: number;
} | null> {
  const kinds = ["superFlammable", "highlyFlammable", "flammable", "resistant", "highlyResistant", "nonflammable"] as const;
  const materials: Array<[string, string]> = kinds.map((k) => [k, HZ(`Flammability.${k}`)]);
  return hazardPrompt(
    HZ("SetAlight"),
    hazardSelect("material", HZ("MaterialLabel"), materials) +
      hazardField("damage", HZ("FlameDamage"), 1, 'min="0"') +
      hazardField("seconds", HZ("ContactSeconds"), 10, 'min="0"'),
    (form) => ({
      material: (str(form, "material") || "flammable") as (typeof kinds)[number],
      flameDamagePerSecond: num(form, "damage"),
      seconds: num(form, "seconds"),
    }),
  );
}

/** Asks how the splash landed (Campaigns p. 405). */
export async function promptForSplash(): Promise<{
  hit: boolean;
  criticalHit: boolean;
  defended: boolean;
  parried: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Splash.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="ihint">${game.i18n.format("GWORLD.Splash.Thrown", {
        acc: 1,
        max: 3,
        face: -5,
      })}</p>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="hit" checked>
        <span>${L("Hit")}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="critical">
        <span>${L("Critical")}</span>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Defended")}</span>
        <select name="defense" style="width:150px">
          <option value="none">${L("DefenseNone")}</option>
          <option value="dodge">${L("DefenseDodge")}</option>
          <option value="block">${L("DefenseBlock")}</option>
          <option value="parry">${L("DefenseParry")}</option>
        </select>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        // "It is impossible to parry a liquid" (p. 405): a parry was tried and
        // did nothing, which is the same as not defending at all.
        const defense = form?.querySelector<HTMLSelectElement>('select[name="defense"]')?.value ?? "none";
        return {
          hit: ticked("hit"),
          criticalHit: ticked("critical"),
          defended: defense !== "none" && (defense !== "parry" || canParryLiquid()),
          parried: defense === "parry",
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what colours an NPC's first impression (Campaigns p. 494).
 *
 * The best and worst cases are asked because a predetermined reaction is the
 * commonest thing a GM has written down about an NPC -- "a street gang might
 * have a -5 reaction to anybody" -- and applying it by hand afterwards means
 * remembering it at the moment the dice land.
 */
/** What the sheet says about the languages spoken, or null when the rule is off. */
export function socialBackgroundOf(actor: any): SocialBackground | null {
  if (!isRuleOn("socialBackground")) return null;
  return {
    languages: (actor?.system?.derived?.languages ?? []).map((lang: any) => ({
      name: String(lang.name ?? ""),
      spoken: String(lang.spoken ?? "none") as Comprehension,
    })),
    adaptable: actor?.system?.derived?.culturallyAdaptable === true,
  };
}

export async function promptForReaction(sources: ReactionSource[]): Promise<{
  modifier: number;
  best: Reaction | null;
  worst: Reaction | null;
  open: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Reaction.${key}`);

  // What the sheet already says: the modifiers that always apply are added
  // up and filled in, and the ones that apply only to some people -- a
  // Reputation among those who know it -- are offered as boxes, unticked.
  const always = unconditionalReaction(sources);
  const alwaysList = sources
    .filter((s) => s.condition === "")
    .map((s) => `${s.label} ${s.value >= 0 ? "+" : "−"}${Math.abs(s.value)}`)
    .join(", ");
  const conditional = sources
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.condition !== "")
    .map(
      (s) => `<label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="source-${s.i}" data-value="${s.value}">
        <span>${s.label} ${s.value >= 0 ? "+" : "−"}${Math.abs(s.value)}: ${L(`When.${s.condition}`)}</span>
      </label>`,
    )
    .join("");
  const bands = (selected: string) =>
    [`<option value="">${L("Unbounded")}</option>`]
      .concat(
        REACTIONS.map(
          (band) =>
            `<option value="${band}"${band === selected ? " selected" : ""}>${L(band)}</option>`,
        ),
      )
      .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Modifier")}</span>
        <input type="number" name="modifier" value="${always}" step="1" autofocus style="width:90px">
      </label>
      ${alwaysList ? `<p class="ihint" style="margin:0">${L("FromTraits")}: ${alwaysList}</p>` : ""}
      ${conditional}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Best")}</span>
        <select name="best" style="width:150px">${bands("")}</select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Worst")}</span>
        <select name="worst" style="width:150px">${bands("")}</select>
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="open">
        <span>${L("Open")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const chosen = (name: string) =>
          form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        // The boxes ticked are the conditional modifiers that apply today.
        let ticked = 0;
        form?.querySelectorAll<HTMLInputElement>('input[name^="source-"]').forEach((box) => {
          if (box.checked) ticked += Number(box.dataset.value) || 0;
        });

        return {
          modifier:
            (Number(form?.querySelector<HTMLInputElement>('input[name="modifier"]')?.value ?? 0) || 0) +
            ticked,
          best: (chosen("best") || null) as Reaction | null,
          worst: (chosen("worst") || null) as Reaction | null,
          open: form?.querySelector<HTMLInputElement>('input[name="open"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks what was studied, for how long, and how (Characters p. 292). */
export async function promptForStudy(
  skills: Array<{ id: string; name: string; banked: number }>,
): Promise<{ skillId: string; hours: number; method: StudyMethod } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Life.${key}`);
  const options = skills
    .map(
      (skill) =>
        `<option value="${skill.id}">${skill.name}${skill.banked ? ` (${game.i18n.format("GWORLD.Life.BankedShort", { hours: skill.banked })})` : ""}</option>`,
    )
    .join("");
  const methods = (["education", "intensive", "selfTeaching", "onTheJob"] as const)
    .map((m) => `<option value="${m}">${L(`Method.${m}`)}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Study") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Skill")}</span>
        <select name="skill" style="width:200px">${options}</select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Hours")}</span>
        <input type="number" name="hours" value="200" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("How")}</span>
        <select name="method" style="width:200px">${methods}</select>
      </label>
      <p class="ihint" style="margin:0">${L("StudyHint")}</p>
    </div>`,
    ok: {
      label: L("Study"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          skillId: form?.querySelector<HTMLSelectElement>('select[name="skill"]')?.value ?? "",
          hours: Number(form?.querySelector<HTMLInputElement>('input[name="hours"]')?.value ?? 0) || 0,
          method: (form?.querySelector<HTMLSelectElement>('select[name="method"]')?.value ?? "education") as StudyMethod,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" && (result as { skillId: string }).skillId
    ? (result as never)
    : null;
}

export const HZ = (key: string) => game.i18n.localize(`GWORLD.Hazard.${key}`);

/** A number field for the hazard prompts. */
export function hazardField(name: string, label: string, value: string | number, extra = ""): string {
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${label}</span>
      <input type="number" name="${name}" value="${value}" step="1" ${extra} style="width:90px">
    </label>`;
}

export function hazardSelect(name: string, label: string, options: Array<[string, string]>): string {
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${label}</span>
      <select name="${name}" style="width:180px">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
    </label>`;
}

export function hazardCheck(name: string, label: string): string {
  return `<label style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" name="${name}"><span>${label}</span>
    </label>`;
}

/** Runs one of the hazard prompts and reads its form back. */
export async function hazardPrompt<T>(title: string, content: string, read: (form: HTMLElement | null) => T): Promise<T | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">${content}</div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")),
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as T) : null;
}

export const num = (form: HTMLElement | null, name: string) =>
  Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
export const str = (form: HTMLElement | null, name: string) =>
  form?.querySelector<HTMLSelectElement | HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
export const ticked = (form: HTMLElement | null, name: string) =>
  form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;

/**
 * Whoever is being treated: the one token that is targeted.
 *
 * A doctor treats one patient at a time, and a roll made against two people at
 * once would be a roll nobody could act on.
 */
export function onePatient(): any {
  const targets = currentTargets();
  if (targets.length !== 1) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Recovery.OnePatient"));
    return null;
  }
  return targets[0]?.actor ?? null;
}

/** What the operation is, and what it is being done with (Campaigns p. 424). */
export async function promptForSurgery(): Promise<{
  anesthetic: boolean;
  repairingCrippled: boolean;
  equipmentQuality: number;
  modifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Recovery.${key}`);
  return hazardPrompt(
    L("Surgery"),
    hazardCheck("anesthetic", L("Anesthetic")) +
      hazardCheck("crippled", L("RepairCrippled")) +
      hazardField("tools", L("ToolQuality"), 0) +
      hazardField("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), 0) +
      `<p class="ihint" style="margin:0">${L("SurgeryHint")}</p>`,
    (form) => ({
      anesthetic: ticked(form, "anesthetic"),
      repairingCrippled: ticked(form, "crippled"),
      equipmentQuality: num(form, "tools"),
      modifier: num(form, "modifier"),
    }),
  );
}

/** Why they need reviving, and whether CPR is known (Campaigns p. 425). */
export async function promptForResuscitation(): Promise<{
  cause: ResuscitationCause;
  cpr: boolean;
  modifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Recovery.${key}`);
  const causes: Array<[string, string]> = (["drowning", "asphyxiation", "heartAttack"] as const)
    .map((k) => [k, L(`Cause.${k}`)]);
  return hazardPrompt(
    L("Resuscitate"),
    hazardSelect("cause", L("CauseLabel"), causes) +
      hazardCheck("cpr", L("Cpr")) +
      hazardField("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), 0) +
      `<p class="ihint" style="margin:0">${L("ResuscitateHint")}</p>`,
    (form) => ({
      cause: str(form, "cause") as ResuscitationCause,
      cpr: ticked(form, "cpr"),
      modifier: num(form, "modifier"),
    }),
  );
}

/** What is holding them, and what they have to get out with (pp. 410-411). */
export async function promptForEscape(current: Entanglement, currentWhere: string, wasRunning: boolean): Promise<{
  entanglement: Entanglement;
  limbs: Limbs;
  oneHanded: boolean;
  where: string;
  running: boolean;
} | null> {
  const kinds: Array<[string, string]> = (["net", "smallNet", "bolas", "lariat"] as const)
    .map((k) => [k, game.i18n.localize(`GWORLD.Entangled.What.${k}`)]);
  const limbs: Array<[string, string]> = (["hands", "paws", "hooves"] as const)
    .map((k) => [k, game.i18n.localize(`GWORLD.Entangled.Limbs.${k}`)]);
  const wheres: Array<[string, string]> = (["torso", "arm", "hand", "weapon", "leg", "foot", "neck"] as const)
    .map((k) => [k, game.i18n.localize(`GWORLD.Entangled.WhereOptions.${k}`)]);
  return hazardPrompt(
    game.i18n.localize("GWORLD.Entangled.Escape"),
    hazardSelect("kind", game.i18n.localize("GWORLD.Entangled.Caught"), kinds)
      .replace(`value="${current}"`, `value="${current}" selected`) +
      hazardSelect("limbs", game.i18n.localize("GWORLD.Entangled.LimbsLabel"), limbs) +
      // Where it caught them decides what it is doing to them (p. 410).
      hazardSelect("where", game.i18n.localize("GWORLD.Entangled.Where"), wheres)
        .replace(`value="${currentWhere || "torso"}"`, `value="${currentWhere || "torso"}" selected`) +
      hazardCheck("running", game.i18n.localize("GWORLD.Entangled.Running"))
        .replace('name="running"', `name="running"${wasRunning ? " checked" : ""}`) +
      hazardCheck("oneHanded", game.i18n.localize("GWORLD.Entangled.OneHanded")) +
      `<p class="ihint" style="margin:0">${game.i18n.localize("GWORLD.Entangled.EscapeHint")}</p>`,
    (form) => ({
      entanglement: str(form, "kind") as Entanglement,
      limbs: str(form, "limbs") as Limbs,
      oneHanded: ticked(form, "oneHanded"),
      where: str(form, "where"),
      running: ticked(form, "running"),
    }),
  );
}

/**
 * Which unarmed technique, and what the victim brings to it (pp. 403-404).
 *
 * A hold is resisted by the higher of the victim's ST and HT, and gets through
 * their rigid armour and hide but not their flexible armour -- none of which
 * the attacker's sheet can know -- so it is asked, pre-filled from the one
 * targeted token where there is one.
 */
export async function promptForTechnique(target: any): Promise<{
  technique: UnarmedTechnique;
  victim: Victim;
  location: string;
  crippled: boolean;
  clumsiness: number;
} | null> {
  const T = (key: string) => game.i18n.localize(`GWORLD.Technique.${key}`);
  const techniques: Array<[string, string]> = (
    ["armLock", "chokeHold", "elbowStrike", "neckSnap", "piercingStrike"] as const
  ).map((k) => [k, T(`Name.${k}`)]);
  const locations: Array<[string, string]> = (["neck", "arm", "leg"] as const)
    .map((k) => [k, T(`Locations.${k}`)]);
  const st = Number(target?.system?.attributes?.ST ?? 10) || 10;
  const ht = Number(target?.system?.attributes?.HT ?? 10) || 10;

  return hazardPrompt(
    T("Title"),
    hazardSelect("technique", T("Which"), techniques) +
      hazardField("victimSt", T("VictimSt"), st) +
      hazardField("victimHt", T("VictimHt"), ht) +
      hazardField("naturalDr", T("NaturalDr"), 0, 'min="0"') +
      hazardCheck("toughSkin", T("ToughSkin")) +
      hazardField("rigidDr", T("RigidDr"), 0, 'min="0"') +
      hazardField("flexibleDr", T("FlexibleDr"), 0, 'min="0"') +
      hazardSelect("location", T("Location"), locations) +
      hazardCheck("crippled", T("Crippled")) +
      hazardField("clumsiness", T("Clumsiness"), 0, 'min="0" max="3"'),
    (form) => ({
      technique: str(form, "technique") as UnarmedTechnique,
      victim: {
        st: num(form, "victimSt"),
        ht: num(form, "victimHt"),
        naturalDr: num(form, "naturalDr"),
        toughSkin: ticked(form, "toughSkin"),
        rigidDr: num(form, "rigidDr"),
        flexibleDr: num(form, "flexibleDr"),
      },
      location: str(form, "location"),
      crippled: ticked(form, "crippled"),
      clumsiness: num(form, "clumsiness"),
    }),
  );
}

/** What is being invented, and which of the two rolls to make (pp. 472-474). */
export async function promptForInvention(tl: number): Promise<{
  stage: "concept" | "prototype";
  plan: InventionPlan;
} | null> {
  const I = (key: string) => game.i18n.localize(`GWORLD.Invention.${key}`);
  const opts = (group: string, keys: readonly string[]): Array<[string, string]> =>
    keys.map((k) => [k, I(`${group}.${k}`)]);

  return hazardPrompt(
    I("Title"),
    hazardSelect("stage", I("Stage"), opts("Stages", ["concept", "prototype"])) +
      hazardField("skill", I("Skill"), 12) +
      hazardSelect("basis", I("Basis"), opts("Bases", ["price", "software", "grade"])) +
      hazardField("retail", I("Retail"), 100, 'min="0"') +
      hazardField("complexity", I("Complexity"), 0, 'min="0"') +
      hazardSelect("grade", I("GradeLabel"), opts("Grade", ["simple", "average", "complex", "amazing"])) +
      hazardField("inventorTl", I("InventorTl"), tl) +
      hazardField("inventionTl", I("InventionTl"), tl) +
      hazardCheck("workingModel", I("WorkingModel")) +
      hazardCheck("knownToExist", I("KnownToExist")) +
      hazardField("variant", I("Variant"), 0, 'min="0" max="5"') +
      hazardCheck("newTechnology", I("NewTechnology")) +
      hazardField("wellDescribed", I("WellDescribed"), 0, 'min="0" max="2"') +
      hazardField("assistants", I("Assistants"), 0, 'min="0"') +
      hazardField("poorTools", I("PoorTools"), 0, 'min="0" max="10"') +
      hazardField("people", I("People"), 1, 'min="1"') +
      hazardCheck("reusingFacilities", I("ReusingFacilities")) +
      hazardField("computer", I("Computer"), 0, 'min="0"'),
    (form) => ({
      stage: str(form, "stage") as "concept" | "prototype",
      plan: {
        basis: str(form, "basis") as InventionPlan["basis"],
        retail: num(form, "retail"),
        complexity: num(form, "complexity"),
        grade: str(form, "grade") as InventionGrade,
        inventorTl: num(form, "inventorTl"),
        inventionTl: num(form, "inventionTl"),
        workingModel: ticked(form, "workingModel"),
        knownToExist: ticked(form, "knownToExist"),
        variant: num(form, "variant"),
        newTechnology: ticked(form, "newTechnology"),
        wellDescribed: num(form, "wellDescribed"),
        skill: num(form, "skill"),
        assistants: num(form, "assistants"),
        poorTools: num(form, "poorTools"),
        people: Math.max(1, num(form, "people")),
        reusingFacilities: ticked(form, "reusingFacilities"),
        computer: num(form, "computer"),
      },
    }),
  );
}

/** Which depressant, how much of it, and whether there was drink too (p. 441). */
export async function promptForDepressant(): Promise<{ drug: DrugKind; doses: number; anyAlcohol: boolean } | null> {
  const D = (key: string) => game.i18n.localize(`GWORLD.Drug.${key}`);
  const kinds: Array<[string, string]> = (["sedative", "painkiller", "heroin"] as const)
    .map((k) => [k, D(`Kind.${k}`)]);
  return hazardPrompt(
    D("Depressant"),
    hazardSelect("drug", D("Which"), kinds) +
      hazardField("doses", D("Doses"), 1, 'min="1"') +
      hazardCheck("anyAlcohol", D("AnyAlcohol")),
    (form) => ({
      drug: str(form, "drug") as DrugKind,
      doses: Math.max(1, num(form, "doses")),
      anyAlcohol: ticked(form, "anyAlcohol"),
    }),
  );
}

/** Which kind of dependency, and whether the drug is to hand (p. 440). */
export async function promptForWithdrawal(): Promise<{ psychological: boolean; drugAvailable: boolean } | null> {
  const D = (key: string) => game.i18n.localize(`GWORLD.Drug.${key}`);
  return hazardPrompt(
    D("Withdrawal"),
    hazardCheck("psychological", D("Psychological")) + hazardCheck("drugAvailable", D("DrugAvailable")),
    (form) => ({ psychological: ticked(form, "psychological"), drugAvailable: ticked(form, "drugAvailable") }),
  );
}

/** How a thrown Molotov cocktail met its target (Campaigns p. 411). */
export async function promptForMolotov(): Promise<{
  defense: "dodge" | "block" | "none";
  targetDr: number;
  malfunctioned: boolean;
  sealed: boolean;
} | null> {
  const defenses: Array<[string, string]> = (["none", "dodge", "block"] as const)
    .map((k) => [k, game.i18n.localize(`GWORLD.Molotov.DefenseOptions.${k}`)]);
  return hazardPrompt(
    game.i18n.localize("GWORLD.Molotov.Throw"),
    hazardSelect("defense", game.i18n.localize("GWORLD.Molotov.Defense"), defenses) +
      hazardField("targetDr", game.i18n.localize("GWORLD.Molotov.TargetDr"), 0, 'min="0"') +
      hazardCheck("malfunctioned", game.i18n.localize("GWORLD.Molotov.Malfunctioned")) +
      hazardCheck("sealed", game.i18n.localize("GWORLD.Molotov.Sealed")),
    (form) => ({
      defense: str(form, "defense") as "dodge" | "block" | "none",
      targetDr: num(form, "targetDr"),
      malfunctioned: ticked(form, "malfunctioned"),
      sealed: ticked(form, "sealed"),
    }),
  );
}

/** How much is overhead, and what the walls are made of (Campaigns p. 484). */
/** A building and what has been done to it (Campaigns pp. 484, 558). */
export async function promptForBuilding(): Promise<{
  squareFeet: number;
  frame: "wood" | "brick" | "stone";
  construction: "shoddy" | "sound" | "quakeResistant";
  damageTaken: number;
  failedDisabling: boolean;
} | null> {
  const frames: Array<[string, string]> = (["wood", "brick", "stone"] as const).map((k) => [k, HZ(`Frame.${k}`)]);
  const builds: Array<[string, string]> = (["sound", "shoddy", "quakeResistant"] as const).map((k) => [k, HZ(`Construction.${k}`)]);
  return hazardPrompt(
    HZ("Building"),
    hazardField("squareFeet", HZ("SquareFeet"), 1000, 'min="0"') +
      hazardSelect("frame", HZ("FrameLabel"), frames) +
      hazardSelect("construction", HZ("ConstructionLabel"), builds) +
      hazardField("damageTaken", HZ("DamageTaken"), 0, 'min="0"') +
      hazardCheck("failedDisabling", HZ("FailedDisabling")),
    (form) => ({
      squareFeet: num(form, "squareFeet"),
      frame: (str(form, "frame") || "wood") as "wood" | "brick" | "stone",
      construction: (str(form, "construction") || "sound") as "shoddy" | "sound" | "quakeResistant",
      damageTaken: num(form, "damageTaken"),
      failedDisabling: ticked(form, "failedDisabling"),
    }),
  );
}

export async function promptForCollapse(): Promise<{
  storiesOverhead: number;
  wallDr: number;
  diving: boolean;
} | null> {
  return hazardPrompt(
    HZ("Collapse"),
    hazardField("stories", HZ("StoriesOverhead"), 1, 'min="0"') +
      hazardField("wallDr", HZ("WallDr"), 2, 'min="0"') +
      hazardCheck("diving", HZ("DiveForCover")) +
      `<p class="ihint" style="margin:0">${HZ("CollapseHint")}</p>`,
    (form) => ({
      storiesOverhead: num(form, "stories"),
      wallDr: num(form, "wallDr"),
      diving: ticked(form, "diving"),
    }),
  );
}

/** How the acid was met, and where it landed (Campaigns p. 428). */
export async function promptForAcid(): Promise<{ contact: AcidContact; landing: AcidLanding } | null> {
  const contacts: Array<[string, string]> = (["splashed", "immersed", "swallowed"] as const)
    .map((k) => [k, HZ(`AcidContact.${k}`)]);
  const landings: Array<[string, string]> = (["body", "face", "eyes"] as const)
    .map((k) => [k, HZ(`AcidLanding.${k}`)]);
  return hazardPrompt(
    HZ("Acid"),
    hazardSelect("contact", HZ("AcidContactLabel"), contacts) +
      hazardSelect("landing", HZ("AcidLandingLabel"), landings) +
      `<p class="ihint" style="margin:0">${HZ("AcidHint")}</p>`,
    (form) => ({
      contact: str(form, "contact") as AcidContact,
      landing: str(form, "landing") as AcidLanding,
    }),
  );
}

/** How thick the air is and what is wrong with it (Campaigns p. 429). */
export async function promptForAir(): Promise<{
  atmospheres: number;
  hazard: AtmosphereHazard | "none";
  strength: HazardStrength;
  hpLostToAir: number;
  exertion: "none" | "mild" | "heavy";
} | null> {
  const exertions: Array<[string, string]> = (["mild", "none", "heavy"] as const)
    .map((k) => [k, HZ(`Exertion.${k}`)]);
  const hazards: Array<[string, string]> = (["none", "corrosive", "toxic", "suffocating"] as const)
    .map((k) => [k, HZ(`AirHazard.${k}`)]);
  const strengths: Array<[string, string]> = (["trace", "lethal", "mostly"] as const)
    .map((k) => [k, HZ(`AirStrength.${k}`)]);
  return hazardPrompt(
    HZ("BadAir"),
    `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${HZ("Atmospheres")}</span>
        <input type="number" name="atm" value="1" step="0.01" min="0" style="width:90px">
      </label>` +
      hazardSelect("hazard", HZ("AirHazardLabel"), hazards) +
      hazardSelect("strength", HZ("AirStrengthLabel"), strengths) +
      hazardField("hpLostToAir", HZ("HpLostToAir"), 0, 'min="0"') +
      hazardSelect("exertion", HZ("ExertionLabel"), exertions) +
      `<p class="ihint" style="margin:0">${HZ("BadAirHint")}</p>`,
    (form) => ({
      atmospheres: num(form, "atm"),
      hazard: str(form, "hazard") as AtmosphereHazard | "none",
      strength: str(form, "strength") as HazardStrength,
      hpLostToAir: num(form, "hpLostToAir"),
      exertion: (str(form, "exertion") || "mild") as "none" | "mild" | "heavy",
    }),
  );
}

/** How deep, and what Pressure Support they have (Campaigns p. 435). */
export async function promptForPressure(): Promise<{
  atmospheres: number;
  support: PressureSupport;
  ascending: boolean;
  explosive: boolean;
  minutes: number;
} | null> {
  const supports: Array<[string, string]> = (["0", "1", "2", "3"] as const)
    .map((k) => [k, HZ(`PressureSupport.${k}`)]);
  return hazardPrompt(
    HZ("Pressure"),
    `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${HZ("Atmospheres")}</span>
        <input type="number" name="atm" value="1" step="0.5" min="0" style="width:90px">
      </label>` +
      hazardField("depth", HZ("DepthFeet"), 0, 'min="0"') +
      hazardField("minutes", HZ("MinutesAtDepth"), 0, 'min="0"') +
      hazardSelect("support", HZ("PressureSupportLabel"), supports) +
      hazardCheck("ascending", HZ("Ascending")) +
      hazardCheck("explosive", HZ("Explosive")) +
      `<p class="ihint" style="margin:0">${HZ("PressureHint")}</p>`,
    (form) => ({
      // A depth of water, where given, is what the pressure is read off: "about
      // 33' underwater" is 2 atm, counting the air above it.
      atmospheres: num(form, "depth") > 0 ? pressureAtDepth(num(form, "depth")) : num(form, "atm"),
      support: Number(str(form, "support") || 0) as PressureSupport,
      ascending: ticked(form, "ascending"),
      explosive: ticked(form, "explosive"),
      minutes: num(form, "minutes"),
    }),
  );
}

/** How hard, from what gravity, and how they were sitting (Campaigns p. 434). */
export async function promptForAcceleration(): Promise<{
  gForce: number;
  homeGravity: number;
  braced: boolean;
  inverted: boolean;
} | null> {
  return hazardPrompt(
    HZ("Acceleration"),
    `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${HZ("GForce")}</span>
        <input type="number" name="g" value="3" step="0.5" min="0" style="width:90px">
      </label>` +
      `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${HZ("HomeGravity")}</span>
        <input type="number" name="home" value="1" step="0.1" min="0" style="width:90px">
      </label>` +
      hazardCheck("braced", HZ("Braced")) +
      hazardCheck("inverted", HZ("Inverted")) +
      `<p class="ihint" style="margin:0">${HZ("AccelerationHint")}</p>`,
    (form) => ({
      gForce: num(form, "g"),
      homeGravity: num(form, "home"),
      braced: ticked(form, "braced"),
      inverted: ticked(form, "inverted"),
    }),
  );
}

/** The sea or free fall, and whether they are prone to either (pp. 434, 436). */
export async function promptForMotionSickness(): Promise<{
  kind: "sea" | "freeFall";
  motionSickness: boolean;
  spaceSickness: boolean;
} | null> {
  const kinds: Array<[string, string]> = (["sea", "freeFall"] as const)
    .map((k) => [k, HZ(`MotionKind.${k}`)]);
  return hazardPrompt(
    HZ("MotionSickness"),
    hazardSelect("kind", HZ("MotionKindLabel"), kinds) +
      hazardCheck("motionSickness", HZ("HasMotionSickness")) +
      hazardCheck("spaceSickness", HZ("HasSpaceSickness")) +
      `<p class="ihint" style="margin:0">${HZ("MotionHint")}</p>`,
    (form) => ({
      kind: str(form, "kind") as "sea" | "freeFall",
      motionSickness: ticked(form, "motionSickness"),
      spaceSickness: ticked(form, "spaceSickness"),
    }),
  );
}

export async function promptForStayingUp(): Promise<{ hoursAwake: number; missedSleepHours: number } | null> {
  return hazardPrompt(
    HZ("Sleep"),
    hazardField("awake", HZ("HoursAwake"), 20, 'min="0"') +
      hazardField("missed", HZ("MissedSleep"), 0, 'min="0"') +
      `<p class="ihint" style="margin:0">${HZ("SleepHint")}</p>`,
    (form) => ({ hoursAwake: num(form, "awake"), missedSleepHours: num(form, "missed") }),
  );
}

export async function promptForHike(): Promise<{
  hours: number; terrain: "veryBad" | "bad" | "average" | "good";
  weather: "fair" | "rain" | "snow" | "deepSnow" | "ice"; hot: boolean; modifier: number;
} | null> {
  const terrains: Array<[string, string]> = (["average", "good", "bad", "veryBad"] as const).map((k) => [k, HZ(`Terrain.${k}`)]);
  const weathers: Array<[string, string]> = (["fair", "rain", "snow", "deepSnow", "ice"] as const).map((k) => [k, HZ(`Weather.${k}`)]);
  return hazardPrompt(
    HZ("Hike"),
    hazardField("hours", HZ("HoursMarched"), 8, 'min="0"') +
      hazardSelect("terrain", HZ("TerrainLabel"), terrains) +
      hazardSelect("weather", HZ("WeatherLabel"), weathers) +
      hazardCheck("hot", HZ("HotDay")) +
      hazardField("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), 0),
    (form) => ({
      hours: num(form, "hours"),
      terrain: (str(form, "terrain") || "average") as "veryBad" | "bad" | "average" | "good",
      weather: (str(form, "weather") || "fair") as "fair" | "rain" | "snow" | "deepSnow" | "ice",
      hot: ticked(form, "hot"),
      modifier: num(form, "modifier"),
    }),
  );
}

export async function promptForCollision(): Promise<{
  objectHp: number; objectVelocity: number; ownVelocity: number; angle: CollisionAngle;
  sharp: DamageType | null; objectSm: number | null;
} | null> {
  const angles: Array<[string, string]> = (["side", "headOn", "rearEnd"] as const).map((k) => [k, HZ(`Angle.${k}`)]);
  const shapes: Array<[string, string]> = [["", HZ("Blunt")], ["cut", HZ("Sharp.cut")], ["imp", HZ("Sharp.imp")], ["pi", HZ("Sharp.pi")]];
  return hazardPrompt(
    HZ("Collision"),
    hazardField("hp", HZ("ObjectHp"), 10, 'min="0"') +
      hazardField("velocity", HZ("ObjectVelocity"), 5, 'min="0"') +
      hazardField("own", HZ("OwnVelocity"), 0, 'min="0"') +
      hazardSelect("angle", HZ("AngleLabel"), angles) +
      hazardSelect("shape", HZ("Shape"), shapes) +
      hazardField("sm", HZ("ObjectSm"), 0) +
      `<p class="ihint" style="margin:0">${HZ("CollisionHint")}</p>`,
    (form) => ({
      objectHp: num(form, "hp"),
      objectVelocity: num(form, "velocity"),
      ownVelocity: num(form, "own"),
      angle: (str(form, "angle") || "side") as CollisionAngle,
      sharp: (str(form, "shape") || null) as DamageType | null,
      objectSm: num(form, "sm"),
    }),
  );
}

export async function promptForShock(): Promise<{
  kind: "nonlethal" | "lethal" | "localized"; modifier: number; continuous: boolean; formula: string; metalArmor: boolean;
} | null> {
  const kinds: Array<[string, string]> = (["nonlethal", "lethal", "localized"] as const).map((k) => [k, HZ(`ShockKind.${k}`)]);
  return hazardPrompt(
    HZ("Shock"),
    hazardSelect("kind", HZ("ShockKindLabel"), kinds) +
      hazardField("modifier", HZ("ShockModifier"), 0) +
      hazardCheck("continuous", HZ("Continuous")) +
      `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${HZ("ShockFormula")}</span>
        <input type="text" name="formula" value="1d-3" style="width:90px">
      </label>` +
      hazardCheck("metal", HZ("MetalArmor")) +
      `<p class="ihint" style="margin:0">${HZ("ShockHint")}</p>`,
    (form) => ({
      kind: (str(form, "kind") || "nonlethal") as "nonlethal" | "lethal" | "localized",
      modifier: num(form, "modifier"),
      continuous: ticked(form, "continuous"),
      formula: str(form, "formula"),
      metalArmor: ticked(form, "metal"),
    }),
  );
}

export async function promptForFire(): Promise<{ exposure: "partTurn" | "fullTurn" | "intense"; seconds: number } | null> {
  const exposures: Array<[string, string]> = (["partTurn", "fullTurn", "intense"] as const).map((k) => [k, HZ(`Exposure.${k}`)]);
  return hazardPrompt(
    HZ("Fire"),
    hazardSelect("exposure", HZ("ExposureLabel"), exposures) +
      hazardField("seconds", HZ("Seconds"), 1, 'min="1" max="60"'),
    (form) => ({
      exposure: (str(form, "exposure") || "partTurn") as "partTurn" | "fullTurn" | "intense",
      seconds: num(form, "seconds"),
    }),
  );
}

export async function promptForCatchingFire(): Promise<{ basicBurningDamage: number; tightBeam: boolean } | null> {
  return hazardPrompt(
    HZ("CatchFire"),
    hazardField("damage", HZ("BasicBurning"), 3, 'min="0"') +
      hazardCheck("beam", HZ("TightBeam")),
    (form) => ({ basicBurningDamage: num(form, "damage"), tightBeam: ticked(form, "beam") }),
  );
}

export async function promptForRadiation(): Promise<{ rads: number; protectionFactor: number; modifier: number } | null> {
  return hazardPrompt(
    HZ("Radiation"),
    hazardField("rads", HZ("Rads"), 10, 'min="0"') +
      hazardField("pf", HZ("ProtectionFactor"), 1, 'min="1"') +
      hazardField("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), 0) +
      `<p class="ihint" style="margin:0">${HZ("RadiationHint")}</p>`,
    (form) => ({ rads: num(form, "rads"), protectionFactor: Math.max(1, num(form, "pf")), modifier: num(form, "modifier") }),
  );
}

/** A vehicle's stat line as the tables print it: ST/HP, Hnd/SR, HT, Move, DR. */
export function vehicleNotes(item: any): string {
  const v = item.system?.vehicle ?? {};
  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
  return `${v.stHp ?? 0} · Hnd/SR ${signed(Number(v.handling) || 0)}/${v.stability ?? 0} · HT ${v.ht ?? 10} · Move ${v.acceleration ?? 0}/${v.topSpeed ?? 0} · DR ${v.dr ?? 0}${v.skill ? ` · ${v.skill}` : ""}`;
}

/** Asks what a trample is at, and whether it is the automatic kind (p. 404). */
export async function promptForTrample(): Promise<{ modifier: number; overrun: boolean } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Trample.${key}`);
  return hazardPrompt(
    L("Title"),
    hazardField("modifier", game.i18n.localize("GWORLD.Chat.Modifier"), 0) +
      hazardCheck("overrun", L("Overrun")) +
      `<p class="ihint" style="margin:0">${L("Hint")}</p>`,
    (form) => ({ modifier: num(form, "modifier"), overrun: ticked(form, "overrun") }),
  );
}

/** Asks what was swung at the swarm this turn (p. 461). */
export async function promptForFightingOffSwarm(): Promise<{ weaponDamage: number; shield: boolean; stomp: boolean } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Swarm.${key}`);
  return hazardPrompt(
    L("FightOff"),
    hazardField("weapon", L("WeaponDamage"), 0, 'min="0"') +
      hazardCheck("shield", L("Shield")) +
      hazardCheck("stomp", L("Stomp")) +
      `<p class="ihint" style="margin:0">${L("FightOffHint")}</p>`,
    (form) => ({ weaponDamage: num(form, "weapon"), shield: ticked(form, "shield"), stomp: ticked(form, "stomp") }),
  );
}

/** The armour divisors the vehicle prompt offers, in the order a table reaches for them. */
const VEHICLE_DIVISORS: readonly string[] = ["1", "2", "3", "5", "10", "100", "0.5", "0.2", "0.1", "ignores"];

/**
 * Asks what hit the vehicle, where, from which side, and how many are aboard
 * (pp. 462, 554-555). The damage is basic damage by default, and the
 * vehicle's DR at the spot comes off it; a table that has already worked out
 * what got through can say so instead.
 */
export async function promptForVehicleHit(options: {
  /** How many are aboard, to start the field at. */
  aboard?: number;
  /** The locations this vehicle has, to offer as an aimed shot. */
  locations?: readonly string[];
} = {}): Promise<{
  damage?: number;
  penetrating?: number;
  armorDivisor: number;
  ignoresDr: boolean;
  location: VehicleLocation | null;
  arc: VehicleArc | null;
  occupants: number;
  damageType: DamageType;
  tightBeam: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Vehicle.${key}`);
  const types: Array<[string, string]> = VEHICLE_DAMAGE_TYPES.map((t) => [t, t]);
  const divisors: Array<[string, string]> = VEHICLE_DIVISORS.map((d) => [
    d,
    d === "1" ? L("DivisorNone") : d === "ignores" ? L("DivisorIgnores") : `(${d})`,
  ]);
  const locations: Array<[string, string]> = [["", L("RandomLocation")]].concat(
    (options.locations ?? []).map((key) => [key, L(`Location.${key}`)] as [string, string]),
  ) as Array<[string, string]>;
  const arcs: Array<[string, string]> = [["", L("Arc.none")]].concat(
    VEHICLE_ARCS.map((arc) => [arc, L(`Arc.${arc}`)] as [string, string]),
  ) as Array<[string, string]>;
  return hazardPrompt(
    L("ShotAt"),
    hazardField("damage", L("ShotDamage"), 0, 'min="0"') +
      hazardSelect("damageIs", L("DamageIs"), [["basic", L("DamageIsBasic")], ["penetrating", L("DamageIsPenetrating")]]) +
      hazardSelect("divisor", L("ArmorDivisor"), divisors) +
      hazardSelect("damageType", L("DamageType"), types) +
      hazardCheck("tightBeam", L("TightBeam")) +
      hazardSelect("location", L("AimedAt"), locations) +
      hazardSelect("arc", L("ArcLabel"), arcs) +
      hazardField("occupants", L("Aboard"), Math.max(0, Math.floor(options.aboard ?? 1)), 'min="0"') +
      `<p class="ihint" style="margin:0">${L("ShotAtHint")}</p>`,
    (form) => {
      const amount = Math.max(0, num(form, "damage"));
      const divisor = str(form, "divisor");
      const alreadyThrough = str(form, "damageIs") === "penetrating";
      return {
        ...(alreadyThrough ? { penetrating: amount } : { damage: amount }),
        armorDivisor: divisor === "ignores" ? 1 : Number(divisor) || 1,
        ignoresDr: divisor === "ignores",
        location: (str(form, "location") || null) as VehicleLocation | null,
        arc: (str(form, "arc") || null) as VehicleArc | null,
        occupants: num(form, "occupants"),
        damageType: (str(form, "damageType") || "cr") as DamageType,
        tightBeam: ticked(form, "tightBeam"),
      };
    },
  );
}

/** The damage types a hit on a vehicle can be, in the order the table lists them. */
export const VEHICLE_DAMAGE_TYPES: readonly DamageType[] = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn", "cor", "tox", "fat"];

/** The languages and manners a social roll is made in (Characters pp. 23-24). */
export interface SocialBackground {
  languages: Array<{ name: string; spoken: Comprehension }>;
  adaptable: boolean;
}

/** The markup for the language select and the culture box, or nothing when the rule is off. */
export function socialBackgroundFields(background: SocialBackground | null): string {
  if (!background) return "";
  const L = (key: string) => game.i18n.localize(`GWORLD.Life.${key}`);
  const languages = [`<option value="">${L("NoLanguage")}</option>`]
    .concat(
      background.languages.map(
        (lang) =>
          `<option value="${lang.spoken}">${lang.name} (${game.i18n.localize(`GWORLD.Language.${lang.spoken}`)})</option>`,
      ),
    )
    .join("");
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${L("LanguageUsed")}</span>
      <select name="language" style="width:200px">${languages}</select>
    </label>
    <label style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" name="unfamiliar">
      <span>${background.adaptable ? L("UnfamiliarAdaptable") : L("Unfamiliar")}</span>
    </label>`;
}

/** What the language chosen and the culture ticked cost (Characters pp. 23-24). */
export function socialBackgroundPenalty(form: HTMLElement | null, background: SocialBackground | null): number {
  if (!background || !form) return 0;
  const spoken = form.querySelector<HTMLSelectElement>('select[name="language"]')?.value ?? "";
  const language = spoken ? (languagePenalty(spoken as Comprehension) ?? 0) : 0;
  const unfamiliar = form.querySelector<HTMLInputElement>('input[name="unfamiliar"]')?.checked ?? false;
  return language + culturePenalty(unfamiliar, background.adaptable ? [{ name: "Cultural Adaptability" }] : []);
}

/** Asks which Influence skill is being tried, and how (Campaigns p. 359). */
export async function promptForInfluence(
  skills: Array<{ name: string; level: number }>,
  background: SocialBackground | null = null,
): Promise<{
  skill: string;
  skillLevel: number;
  modifier: number;
  specious: boolean;
  reactionModifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Reaction.${key}`);

  const options = skills
    .map((skill) => `<option value="${skill.name}">${skill.name} ${skill.level}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Influence") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Skill")}</span>
        <select name="skill" style="width:200px">${options}</select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Modifier")}</span>
        <input type="number" name="reaction" value="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="specious">
        <span>${L("Specious")}</span>
      </label>
      ${socialBackgroundFields(background)}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const name = form?.querySelector<HTMLSelectElement>('select[name="skill"]')?.value ?? "";
        return {
          skill: name,
          skillLevel: skills.find((skill) => skill.name === name)?.level ?? 4,
          // The language spoken and the culture it is spoken in come off the
          // Influence roll (Characters pp. 23-24).
          modifier:
            (Number(form?.querySelector<HTMLInputElement>('input[name="modifier"]')?.value ?? 0) || 0) +
            socialBackgroundPenalty(form, background),
          reactionModifier:
            Number(form?.querySelector<HTMLInputElement>('input[name="reaction"]')?.value ?? 0) || 0,
          specious:
            form?.querySelector<HTMLInputElement>('input[name="specious"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks what went wrong in the saddle (Campaigns p. 397). */
export async function promptForStayOn(): Promise<{
  stunned: boolean;
  knockbackYards: number;
  saddleAndStirrups: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Mounted.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("StayOn") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="stunned">
        <span>${L("Stunned")}</span>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("KnockbackYards")}</span>
        <input type="number" name="knockback" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="saddle" checked>
        <span>${L("Saddle")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        return {
          stunned: ticked("stunned"),
          knockbackYards:
            Number(form?.querySelector<HTMLInputElement>('input[name="knockback"]')?.value ?? 0) || 0,
          saddleAndStirrups: ticked("saddle"),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** A turn in the air: how far across and up, and what the flyer can do (Campaigns p. 397). */
export async function promptForFlying(): Promise<{
  horizontal: number;
  vertical: number;
  topAirspeed: number;
  canHover: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Mounted.${key}`);
  return hazardPrompt(
    L("Flying"),
    hazardField("horizontal", L("Horizontal"), 0, 'min="0"') +
      hazardField("vertical", L("Vertical"), 0, 'min="0"') +
      hazardField("topAirspeed", L("TopAirspeed"), 10, 'min="0"') +
      hazardCheck("hover", L("CanHover")),
    (form) => ({
      horizontal: num(form, "horizontal"),
      vertical: num(form, "vertical"),
      topAirspeed: num(form, "topAirspeed"),
      canHover: ticked(form, "hover"),
    }),
  );
}

/** Asks what is being attempted at speed (Campaigns p. 395). */
export async function promptForEnvelope(): Promise<{
  velocity: number;
  deceleration: number;
  turning: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Mounted.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Envelope") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Velocity")}</span>
        <input type="number" name="velocity" value="10" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Deceleration")}</span>
        <input type="number" name="deceleration" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="turning">
        <span>${L("Turn")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        return {
          velocity: num("velocity"),
          deceleration: num("deceleration"),
          turning: form?.querySelector<HTMLInputElement>('input[name="turning"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks what has been knocked down, and by how much (Campaigns p. 421). */
export async function promptForPenalties(current: {
  ST: number;
  DX: number;
  IQ: number;
  HT: number;
}): Promise<{ ST: number; DX: number; IQ: number; HT: number } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Penalties.${key}`);
  const field = (key: "ST" | "DX" | "IQ" | "HT") => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize(`GWORLD.Attribute.${key}`)}</span>
        <input type="number" name="${key}" value="${current[key]}" max="0" step="1" style="width:90px">
      </label>`;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${field("ST")}${field("DX")}${field("IQ")}${field("HT")}
      <p class="ihint">${L("Explain")}</p>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Math.min(
            0,
            Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0,
          );
        return { ST: num("ST"), DX: num("DX"), IQ: num("IQ"), HT: num("HT") };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Shows what a template will do and asks for the choices it leaves open
 * (Characters p. 258).
 *
 * Everything ungrouped is listed rather than offered: those are the traits that
 * make the template what it is, and for a racial template they are not optional
 * at all. Each choice group gets its options as checkboxes, with what the group
 * asks for stated above them, because "select two skills from" is a rule the
 * player is meant to be able to see themselves keeping.
 */
/** A group's running total as its heading shows it. */
function pickedText(kind: string, value: number): string {
  return game.i18n.format(kind === "count" ? "GWORLD.Template.PickedCount" : "GWORLD.Template.PickedPoints", { value });
}

export async function chooseTemplateOptions(
  template: Template,
): Promise<TemplateEntry[] | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Template.${key}`);
  const escape = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));

  const line = (entry: TemplateEntry) =>
    `${escape(entry.name)}${entry.note ? ` <span class="gc-mod">${escape(entry.note)}</span>` : ""}` +
    ` <span class="gc-mod">[${entry.points}]</span>`;

  const required = requiredEntries(template);
  // A template can offer well over a hundred options, so every list folds:
  // what everybody gets starts closed, and each group shows how much has been
  // picked from it while it is closed.
  const requiredList = required.length
    ? `<details class="isub tpl-fold">
         <summary class="isub-head">${L("Required")} <span class="gc-mod">(${required.length})</span></summary>
         <ul style="margin:0;padding-left:18px">
           ${required.map((entry) => `<li>${line(entry)}</li>`).join("")}
         </ul>
       </details>`
    : "";

  // The first group there is something to tick in starts open.
  const firstWithOptions = template.choices.findIndex((group) => !choiceMetElsewhere(template, group) && entriesInGroup(template, group.id).length > 0);
  const groups = template.choices
    .map((group, groupIndex) => {
      const options = entriesInGroup(template, group.id)
        .map(
          (entry, index) => `
            <label style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" name="pick" data-group="${groupIndex}"
                     value="${escape(entry.name)}" data-entry="${index}">
              <span>${line(entry)}</span>
            </label>`,
        )
        .join("");

      // A group with nothing to tick is met apart from this dialog: a lens or a
      // racial template taken as well, or points raising something on the sheet.
      const asks = choiceMetElsewhere(template, group)
        ? game.i18n.format("GWORLD.Template.ChosenElsewhere", { points: group.required })
        : group.kind === "count"
          ? game.i18n.format("GWORLD.Template.PickCount", { count: group.required })
          : game.i18n.format("GWORLD.Template.PickPoints", { points: group.required });

      return `<details class="isub tpl-fold" data-group-fold="${groupIndex}" ${groupIndex === firstWithOptions ? "open" : ""}>
                <summary class="isub-head">${escape(group.label)}
                  <span class="gc-mod" data-picked="${groupIndex}" data-kind="${group.kind}">${pickedText(group.kind, 0)}</span>
                </summary>
                <p class="ihint">${asks}</p>
                ${options}
              </details>`;
    })
    .join("");

  const modifiers = [
    ...Object.entries(template.attributes).map(([key, value]) => `${key} ${value}`),
    ...Object.entries(template.secondary).map(([key, value]) => `${key} ${value}`),
    ...(template.sizeModifier ? [`SM ${template.sizeModifier}`] : []),
  ].join(", ");

  // Keep each group's count in step with its ticks.
  const hook = Hooks.on("renderDialogV2", (_app: unknown, element: HTMLElement) => {
    const root: HTMLElement | undefined = element instanceof HTMLElement ? element : (element as any)?.[0];
    if (!root?.querySelector?.("[data-group-fold]")) return;
    Hooks.off("renderDialogV2", hook);
    const recount = () => {
      for (const [groupIndex, group] of template.choices.entries()) {
        const ticked = [...root.querySelectorAll<HTMLInputElement>(`input[name="pick"][data-group="${groupIndex}"]`)].filter((box) => box.checked);
        const entries = entriesInGroup(template, group.id);
        const value = group.kind === "count" ? ticked.length : ticked.reduce((sum, box) => sum + (Number(entries[Number(box.dataset.entry)]?.points) || 0), 0);
        const badge = root.querySelector<HTMLElement>(`[data-picked="${groupIndex}"]`);
        if (badge) badge.textContent = pickedText(group.kind, value);
      }
    };
    root?.addEventListener("change", recount);
  });

  // The window is a fixed height and Foundry's content wrapper clips what
  // does not fit, so a template with a hundred options used to lose its
  // lower groups and its Apply button behind the frame. The class gives the
  // options a scroller of their own (styles/gworld.css, .tpl-options), with
  // the buttons kept below it.
  const result = await foundry.applications.api.DialogV2.prompt({
    classes: ["gworld-template-options"],
    window: { title: `${template.name} — ${templateCost(template)} ${L("Points")}` },
    position: { width: 560, height: Math.min(760, Math.round((globalThis as any).innerHeight * 0.85) || 760) },
    content: `<div class="gworld tpl-options">
      <p class="ihint">${L(template.kind === "racial" ? "racial" : "character")}${
        modifiers ? ` · ${escape(modifiers)}` : ""
      }${template.reference ? ` · ${escape(template.reference)}` : ""}</p>
      ${requiredList}
      ${groups}
      ${
        template.features.length
          ? `<p class="ihint">${L("Features")}: ${escape(template.features.join(", "))}</p>`
          : ""
      }
      ${
        template.tabooTraits.length
          ? `<p class="ihint">${L("Taboo")}: ${escape(template.tabooTraits.join(", "))}</p>`
          : ""
      }
    </div>`,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const picks: TemplateEntry[] = [];
        const byGroup: TemplateEntry[][] = template.choices.map(() => []);

        for (const box of form?.querySelectorAll<HTMLInputElement>('input[name="pick"]') ?? []) {
          if (!box.checked) continue;
          const groupIndex = Number(box.dataset.group);
          const group = template.choices[groupIndex];
          const entry = entriesInGroup(template, group?.id ?? "")[Number(box.dataset.entry)];
          if (!entry) continue;
          picks.push(entry);
          byGroup[groupIndex]?.push(entry);
        }

        return { picks, byGroup };
      },
    },
    rejectClose: false,
  });
  Hooks.off("renderDialogV2", hook);

  if (!result || typeof result !== "object") return null;
  const { picks, byGroup } = result as { picks: TemplateEntry[]; byGroup: TemplateEntry[][] };

  // A group short of its requirement is worth saying out loud, but not worth
  // refusing: "character templates are not rules", and a GM may have said so.
  // Each pick counts toward the group it was ticked in, since the same option
  // can be offered in two.
  for (const [index, group] of template.choices.entries()) {
    if (choiceMetElsewhere(template, group)) continue;
    if (!choiceSatisfied({ group, picks: byGroup[index] ?? [] })) {
      ui.notifications?.warn(
        game.i18n.format("GWORLD.Template.Short", { group: group.label }),
      );
    }
  }

  return picks;
}

/**
 * Asks which template to apply.
 *
 * Looks in the world's items and in every compendium the user can read, since
 * a table's own templates and the shipped ones are equally likely to be wanted.
 */
export async function pickTemplateItem(): Promise<any | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Template.${key}`);

  const found: Array<{ uuid: string; name: string; kind: string; cost: number; source?: string }> = [];

  for (const item of game.items ?? []) {
    if (item.type === "template") {
      found.push({
        uuid: item.uuid,
        name: item.name,
        kind: item.system?.kind ?? "character",
        cost: item.system?.derived?.cost ?? item.system?.statedCost ?? 0,
      });
    }
  }

  // A system pack a module's copy of its book supersedes would list every
  // template twice.
  const superseded = supersededCollections();
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || superseded.has(String(pack.collection))) continue;
    for (const entry of pack.index ?? []) {
      if (entry.type !== "template") continue;
      found.push({
        uuid: `Compendium.${pack.collection}.${entry._id}`,
        name: entry.name,
        kind: "character",
        cost: 0,
        source: String(pack.metadata?.flags?.[SYSTEM_ID]?.bookTitle ?? pack.title ?? pack.collection),
      });
    }
  }

  if (found.length === 0) {
    ui.notifications?.warn(L("NoneFound"));
    return null;
  }

  found.sort((a, b) => a.name.localeCompare(b.name));

  // Two books may each have a template of the same name -- a Vampire here and
  // another there -- so where a name comes up more than once, its book says
  // which is which.
  const named = new Map<string, number>();
  for (const entry of found) named.set(entry.name, (named.get(entry.name) ?? 0) + 1);
  const options = found
    .map(
      (entry) =>
        `<option value="${entry.uuid}">${foundry.utils.escapeHTML(entry.name)}${
          (named.get(entry.name) ?? 0) > 1 && entry.source ? ` (${foundry.utils.escapeHTML(entry.source)})` : ""
        }${
          entry.cost ? ` — ${entry.cost}` : ""
        }</option>`,
    )
    .join("");

  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Choose") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Title")}</span>
        <select name="template" style="width:260px">${options}</select>
      </label>
    </div>`,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) =>
        button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>(
          'select[name="template"]',
        )?.value ?? "",
    },
    rejectClose: false,
  });

  return typeof chosen === "string" && chosen ? await fromUuid(chosen) : null;
}

/**
 * Asks what the session was worth, and what for.
 *
 * Returns null when the dialog is dismissed, which awards nothing.
 */
export async function promptForAward(suggestedSession = ""): Promise<{ points: number; note: string; session: string } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Points.${key}`);
  const esc = foundry.utils.escapeHTML;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AwardTitle") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("AwardPoints")}</span>
        <input type="number" name="points" value="3" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("AwardNote")}</span>
        <input type="text" name="note" value="" style="width:180px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("AwardSession")}</span>
        <input type="text" name="session" value="${esc(suggestedSession)}" style="width:180px">
      </label>
    </div>`,
    ok: {
      label: L("Award"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          points:
            Number(form?.querySelector<HTMLInputElement>('input[name="points"]')?.value ?? 0) || 0,
          note: String(
            form?.querySelector<HTMLInputElement>('input[name="note"]')?.value ?? "",
          ).trim(),
          session: String(
            form?.querySelector<HTMLInputElement>('input[name="session"]')?.value ?? "",
          ).trim(),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what the disarm turns on.
 *
 * None of it is on either sheet: whether the weapon in hand is a fencing one,
 * whether it is a jitte or a whip, and whether the foe has both hands on
 * theirs are facts about this moment rather than about the characters.
 */
export async function promptForDisarm(actor: any, foe: any): Promise<{
  aim: "disarm" | "break";
  itemId: string;
  fencingWeapon: boolean;
  jitteOrWhip: boolean;
  foeTwoHanded: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Disarm.${key}`);
  const B = (key: string) => game.i18n.localize(`GWORLD.Breakage.${key}`);
  const check = (name: string, label: string) => `
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="${name}">
        <span>${label}</span>
      </label>`;

  // "State whether you are striking to disarm or to break the weapon"
  // (Campaigns p. 400) -- and which weapon, where the foe holds more than
  // one, since the penalty to hit is the weapon's size.
  const weapons = weaponTargetsFor(actor, foe);
  const breaking = isRuleOn("weaponBreakage");
  const weaponOptions = weapons
    .map((w) => `<option value="${w.id}">${foundry.utils.escapeHTML(w.name)} (${w.penalty})</option>`)
    .join("");
  const row = (label: string, control: string) => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span>${control}
      </label>`;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      ${breaking ? row(B("Aim"), `<select name="aim" style="width:200px">
        <option value="disarm">${B("AimDisarm")}</option>
        <option value="break">${B("AimBreak")}</option>
      </select>`) : ""}
      ${weapons.length ? row(B("Weapon"), `<select name="weapon" style="width:200px">${weaponOptions}</select>`) : ""}
      ${check("fencing", L("Fencing"))}
      ${check("jitte", L("JitteOption"))}
      ${check("twoHanded", L("TwoHandedOption"))}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const ticked = (name: string) =>
          form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
        const chosen = (name: string) => form?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        return {
          aim: chosen("aim") === "break" ? "break" : "disarm",
          itemId: chosen("weapon"),
          fencingWeapon: ticked("fencing"),
          jitteOrWhip: ticked("jitte"),
          foeTwoHanded: ticked("twoHanded"),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks what kind of grapple this is: how many hands, and what they take hold of.
 *
 * Both change what follows -- two hands are a far better grip than one, and only
 * a hold on the neck can be turned into a choke.
 */
export async function promptForGrapple(): Promise<{
  hands: number;
  hitLocation: string;
  modifier: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Grapple.${key}`);

  // The parts worth taking hold of, rather than every location: you grab an arm
  // to disarm somebody, a leg to trip them, a neck to strangle them.
  const parts = ["torso", "arm", "leg", "neck", "hand"];
  const options = parts
    .map((part) => `<option value="${part}">${game.i18n.localize(`GWORLD.HitLocation.${part}`)}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Hands")}</span>
        <input type="number" name="hands" value="2" min="1" max="6" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Where")}</span>
        <select name="where" style="width:120px">${options}</select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" style="width:90px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        return {
          hands: Math.max(1, num("hands")),
          hitLocation:
            form?.querySelector<HTMLSelectElement>('select[name="where"]')?.value ?? "torso",
          modifier: num("modifier"),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks how long the rest was, and whether there was food.
 *
 * The meal is asked rather than inferred from the clock: "the GM may allow you
 * to regain one extra FP if you eat a decent meal while resting" is their call,
 * and a long rest is not the same thing as a fed one.
 */
export async function promptForRest(): Promise<{ minutes: number; meal: boolean } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Recovery.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Rest") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Minutes")}</span>
        <input type="number" name="minutes" value="10" min="0" step="10" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" name="meal">
        <span>${L("MealHint")}</span>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          minutes:
            Number(form?.querySelector<HTMLInputElement>('input[name="minutes"]')?.value ?? 0) || 0,
          meal: form?.querySelector<HTMLInputElement>('input[name="meal"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * Asks the user to pick one of a list.
 *
 * Returns null when the dialog is dismissed, which cancels whatever asked.
 */
export async function promptForChoice(options: {
  title: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}): Promise<string | null> {
  const list = options.options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: options.title },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${options.label}</span>
        <select name="choice" style="min-width:160px">${list}</select>
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) =>
        button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLSelectElement>('select[name="choice"]')?.value ?? "",
    },
    rejectClose: false,
  });

  return typeof result === "string" && result ? result : null;
}

/** The attributes a contest can be rolled on, in the order the dialog lists them. */
export const CONTEST_ATTRIBUTES = ["ST", "DX", "IQ", "HT", "Will", "Per"] as const;

/**
 * Asks what is being contested, and which kind of contest it is.
 *
 * Returns null when the dialog is dismissed, which cancels the contest.
 */
export async function promptForContest(): Promise<{
  attribute: string;
  yours: number;
  theirs: number;
  regular: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Contest.${key}`);
  const options = CONTEST_ATTRIBUTES.map((key) => `<option value="${key}">${key}</option>`).join("");

  // Only offered where the table is playing it; a Quick Contest is core.
  const kindField = isRuleOn("regularContests")
    ? `<label style="display:flex;align-items:center;gap:8px">
         <input type="checkbox" name="regular">
         <span>${L("RegularHint")}</span>
       </label>`
    : "";

  const number = (name: string, label: string) => `
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span>
        <input type="number" name="${name}" value="0" step="1" style="width:90px">
      </label>`;

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Attribute")}</span>
        <select name="attribute" style="width:90px">${options}</select>
      </label>
      ${number("yours", L("YourModifier"))}
      ${number("theirs", L("TheirModifier"))}
      ${kindField}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        return {
          attribute: form?.querySelector<HTMLSelectElement>('select[name="attribute"]')?.value ?? "ST",
          yours: num("yours"),
          theirs: num("theirs"),
          regular: form?.querySelector<HTMLInputElement>('input[name="regular"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/**
 * The score an affliction is resisted with.
 *
 * Will and Per are secondary characteristics and are derived rather than
 * stored, so they are read from the derived block; the four attributes are read
 * from the sheet.
 */
export function resistanceScore(actor: any, attribute: string): number {
  if (attribute === "Will") return Number(actor?.system?.derived?.will ?? 10);
  if (attribute === "Per") return Number(actor?.system?.derived?.per ?? 10);
  return attributeOf(actor, attribute);
}

/** Normalises a defense into the shape the card template renders. */
export function toCard(defense: { total: number; source: string; math: string } | null) {
  return defense
    ? { total: defense.total, source: defense.source, math: defense.math, available: true }
    : { total: 0, source: "", math: "", available: false };
}

/** A one-line summary of a weapon's attack modes, for the inventory Notes column. */
export function describeModes(item: any): string {
  const melee = item.system.meleeModes?.length ?? 0;
  const ranged = item.system.rangedModes?.length ?? 0;
  if (!melee && !ranged) return "";
  const parts: string[] = [];
  if (melee) parts.push(`${melee} melee`);
  if (ranged) parts.push(`${ranged} ranged`);
  return parts.join(", ");
}
