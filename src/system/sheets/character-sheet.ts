/**
 * The character sheet.
 *
 * Six tabs behind a persistent header, built on ApplicationV2 with one
 * Handlebars part per tab. Foundry's `changeTab` toggles `.active` on the
 * rendered sections rather than re-rendering, so every part is present in the
 * DOM at once and CSS controls visibility.
 */

import { CharacterBuilder } from "../apps/character-builder.js";
import { combatStyle, tacticalOnScene } from "../settings.js";
import { activeRules, isRuleOn } from "../optional-rules.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  evadeModifier,
  opportunityFirePenalty,
  slamDamage,
} from "../../rules/attack-options.js";
import { attackArc } from "../../rules/tactical.js";
import {
  CLIMBS,
  climb,
  climbingModifier,
  swimmingModifier,
  throwingDistance,
  thrownDamage,
} from "../../rules/physical.js";
import { parseDiceAdds, formatDiceAdds } from "../../rules/dice.js";
import { rollFeint, rollQuickContest, rollRegularContest } from "../contest.js";
import { rollExtraEffort } from "../extra-effort.js";
import { rollFall } from "../falling.js";
import { rollBleeding, stopBleeding } from "../bleeding.js";
import {
  beginGrapple,
  endGrapple,
  grapplingSkill,
  grappleOf,
  rollBreakFree,
  rollChoke,
  rollPin,
  rollTakedown,
} from "../grappling.js";
import { rollStunRecovery } from "../knockdown.js";
import { applyFirstAid, restForADay, restForFatigue, tryToWake } from "../recovery.js";
import { rollFrightCheck } from "../fright.js";
import { traitsOf } from "../damage.js";
import { feintDefenseScore, recordFeint } from "../feint.js";
import { attackDirection, facingOf } from "../hex.js";
import { facingChangeAtEndOfMove, hexMovementCost } from "../../rules/tactical.js";
import { CompendiumPicker } from "../apps/compendium-picker.js";
import { SYSTEM_ID } from "../constants.js";
import { ENCUMBRANCE_TIERS, encumberedMove } from "../../rules/encumbrance.js";
import {
  BASIC_SPEED_STEP,
  basicSpeedPointCost,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { MANEUVER_ORDER } from "../../rules/maneuvers.js";
import {
  nextSkillPoints,
  nextTechniquePoints,
  previousSkillPoints,
  previousTechniquePoints,
} from "../../rules/skills.js";
import { nextTraitLevel, previousTraitLevel } from "../../rules/traits.js";
import { awardsNewestFirst, type PointAward } from "../../rules/character-points.js";
import { isReadTrait } from "../../rules/trait-effects.js";
import {
  handleDamageAction,
  handleRollAction,
  promptForNumber,
  rollDamage,
  rollSuccess,
} from "../roll.js";
import { currentTargets, targetedTokens } from "../targets.js";
import type { Attribute, Posture } from "../../rules/types.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;

const ATTRIBUTE_KEYS: Attribute[] = ["ST", "DX", "IQ", "HT"];

const POSTURES: Posture[] = ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"];

/** Conditions the Combat tab exposes as toggle chips. */
const CONDITIONS = [
  { key: "allOutDefense", label: "GWORLD.Condition.AllOutDefense" },
  { key: "stunned", label: "GWORLD.Condition.Stunned" },
  { key: "blindToAttacker", label: "GWORLD.Condition.BlindToAttacker" },
  { key: "attackedThisTurn", label: "GWORLD.Condition.AttackedThisTurn" },
  { key: "closeCombat", label: "GWORLD.Condition.CloseCombat" },
] as const;

/**
 * What the Combat tab shows about movement when the table is playing tactical
 * combat (GURPS Basic Set: Campaigns p. 387).
 *
 * Returns null when the world is on basic combat, where none of this applies
 * and the panel should not be there at all. The scene's grid is not consulted:
 * a GM reading a character sheet is not necessarily looking at a map, and the
 * costs are worth knowing either way.
 */
function tacticalPanel(system: any, derived: any) {
  if (combatStyle() !== "tactical") return null;

  const posture = system.posture ?? "standing";
  const points = derived.encumbrance?.move ?? 0;
  const cost = (direction: "forward" | "sideways" | "backward") =>
    hexMovementCost({ direction, posture });

  return {
    points,
    forward: cost("forward"),
    sideways: cost("sideways"),
    backward: cost("backward"),
    // Sitting cannot move and lying down spends everything to shift one hex,
    // neither of which is a per-hex figure that could be listed.
    immobile: cost("forward") === null,
    // Turning mid-move costs a point per hex-side; at the end it is free, and
    // unrestricted if no more than half the points were spent.
    facingFree: facingChangeAtEndOfMove({
      movementPointsSpent: 0,
      movementPointsAvailable: points,
    }),
    handedness: system.handedness ?? "right",
  };
}

/**
 * A trait, with what the sheet needs to show its levels.
 *
 * Levelled means priced per level or from a table -- Acute Hearing at 2 a
 * level, Wealth at 10/20/30/50/75. A flat advantage has no levels to buy, and
 * offering a box for them would only invite typing into one that does nothing.
 */
function withLevels(trait: any) {
  const system = trait.system ?? {};
  const table: number[] = system.costTable ?? [];
  return {
    id: trait.id,
    name: trait.name,
    system,
    levelled: Boolean(system.pointsPerLevel) || table.length > 0,
    levelName: system.levelName ?? null,
    // Most traits are the GM's to adjudicate; a couple of dozen say something
    // exact that this system applies on its own. Which is which is worth a
    // badge -- a player who buys Combat Reflexes should be able to see that
    // the +1 is already in their Dodge.
    applied: isReadTrait(String(trait.name ?? "")),
  };
}

/**
 * Which way the mover is coming at the foe, for the evade modifiers.
 *
 * Only a hex grid can say: approaching from a side or from behind is a fact
 * about facing, and a square or gridless scene has none. Everywhere else the
 * approach is taken as head-on, which is the version of the rule that asks
 * least and claims least.
 */
async function approachTo(mover: any, foeToken: any): Promise<"front" | "side" | "back"> {
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
async function promptForExtraEffort(): Promise<{
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
function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Asks how far, onto what, and how well.
 *
 * Returns null when the dialog is dismissed, which cancels the fall -- nobody
 * hits the ground by accident here.
 */
async function promptForFall(): Promise<{
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
 * Asks what the session was worth, and what for.
 *
 * Returns null when the dialog is dismissed, which awards nothing.
 */
async function promptForAward(): Promise<{ points: number; note: string } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Points.${key}`);

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
async function promptForGrapple(): Promise<{
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
async function promptForRest(): Promise<{ minutes: number; meal: boolean } | null> {
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
async function promptForChoice(options: {
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

/** Posts what a thrown object does, since nothing is rolled for it. */
async function postThrow(options: {
  actor: any;
  weight: number;
  basicLift: number;
  distance: number | null;
  damage: string;
}): Promise<void> {
  const { actor, weight, basicLift, distance, damage } = options;

  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/throw.hbs`,
    {
      name: String(actor?.name ?? ""),
      weight,
      basicLift,
      // Null means it is past a two-handed lift, which is not a short throw but
      // no throw at all.
      tooHeavy: distance === null,
      distance: distance === null ? 0 : Math.round(distance * 10) / 10,
      damage,
    },
  );

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
}

/** The attributes a contest can be rolled on, in the order the dialog lists them. */
const CONTEST_ATTRIBUTES = ["ST", "DX", "IQ", "HT", "Will", "Per"] as const;

/**
 * Asks what is being contested, and which kind of contest it is.
 *
 * Returns null when the dialog is dismissed, which cancels the contest.
 */
async function promptForContest(): Promise<{
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
function resistanceScore(actor: any, attribute: string): number {
  if (attribute === "Will") return Number(actor?.system?.derived?.will ?? 10);
  if (attribute === "Per") return Number(actor?.system?.derived?.per ?? 10);
  return Number(actor?.system?.attributes?.[attribute] ?? 10);
}

/** Normalises a defense into the shape the card template renders. */
function toCard(defense: { total: number; source: string; math: string } | null) {
  return defense
    ? { total: defense.total, source: defense.source, math: defense.math, available: true }
    : { total: 0, source: "", math: "", available: false };
}

/** A one-line summary of a weapon's attack modes, for the inventory Notes column. */
function describeModes(item: any): string {
  const melee = item.system.meleeModes?.length ?? 0;
  const ranged = item.system.rangedModes?.length ?? 0;
  if (!melee && !ranged) return "";
  const parts: string[] = [];
  if (melee) parts.push(`${melee} melee`);
  if (ranged) parts.push(`${ranged} ranged`);
  return parts.join(", ");
}

export class GWorldCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "actor", "character"],
    // 900 was taller than a 1366x768 laptop can show, so the foot of every tab
    // was off the bottom of the screen with no way to reach it. Each tab now
    // scrolls inside the window instead, and the window fits.
    position: { width: 760, height: 700 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      roll: GWorldCharacterSheet.#onRoll,
      rollDamage: GWorldCharacterSheet.#onRollDamage,
      toggleCondition: GWorldCharacterSheet.#onToggleCondition,
      createItem: GWorldCharacterSheet.#onCreateItem,
      browseCompendium: GWorldCharacterSheet.#onBrowseCompendium,
      openBuilder: GWorldCharacterSheet.#onOpenBuilder,
      awardPoints: GWorldCharacterSheet.#onAwardPoints,
      deleteAward: GWorldCharacterSheet.#onDeleteAward,
      slam: GWorldCharacterSheet.#onSlam,
      affliction: GWorldCharacterSheet.#onAffliction,
      evade: GWorldCharacterSheet.#onEvade,
      feint: GWorldCharacterSheet.#onFeint,
      contest: GWorldCharacterSheet.#onContest,
      frightCheck: GWorldCharacterSheet.#onFrightCheck,
      extraEffort: GWorldCharacterSheet.#onExtraEffort,
      climb: GWorldCharacterSheet.#onClimb,
      swim: GWorldCharacterSheet.#onSwim,
      throwObject: GWorldCharacterSheet.#onThrow,
      fall: GWorldCharacterSheet.#onFall,
      rest: GWorldCharacterSheet.#onRest,
      restDay: GWorldCharacterSheet.#onRestDay,
      firstAid: GWorldCharacterSheet.#onFirstAid,
      wake: GWorldCharacterSheet.#onWake,
      bleed: GWorldCharacterSheet.#onBleed,
      shakeOffStun: GWorldCharacterSheet.#onShakeOffStun,
      grapple: GWorldCharacterSheet.#onGrapple,
      breakFree: GWorldCharacterSheet.#onBreakFree,
      takedown: GWorldCharacterSheet.#onTakedown,
      pin: GWorldCharacterSheet.#onPin,
      choke: GWorldCharacterSheet.#onChoke,
      releaseGrapple: GWorldCharacterSheet.#onRelease,
      stepPoints: GWorldCharacterSheet.#onStepPoints,
      stepLevels: GWorldCharacterSheet.#onStepLevels,
      editItem: GWorldCharacterSheet.#onEditItem,
      deleteItem: GWorldCharacterSheet.#onDeleteItem,
      toggleEquipped: GWorldCharacterSheet.#onToggleEquipped,
    },
  };

  static override PARTS = {
    header: { template: `${TEMPLATE_ROOT}/header.hbs` },
    nav: { template: `${TEMPLATE_ROOT}/nav.hbs` },
    attributes: { template: `${TEMPLATE_ROOT}/tab-attributes.hbs`, scrollable: [""] },
    skills: { template: `${TEMPLATE_ROOT}/tab-skills.hbs`, scrollable: [""] },
    traits: { template: `${TEMPLATE_ROOT}/tab-traits.hbs`, scrollable: [""] },
    combat: { template: `${TEMPLATE_ROOT}/tab-combat.hbs`, scrollable: [""] },
    body: { template: `${TEMPLATE_ROOT}/tab-body.hbs`, scrollable: [""] },
    gear: { template: `${TEMPLATE_ROOT}/tab-gear.hbs`, scrollable: [""] },
    description: { template: `${TEMPLATE_ROOT}/tab-description.hbs`, scrollable: [""] },
  };

  static override TABS = {
    primary: {
      initial: "attributes",
      labelPrefix: "GWORLD.Tab",
      tabs: [
        { id: "attributes" },
        { id: "skills" },
        { id: "traits" },
        { id: "combat" },
        { id: "body" },
        { id: "gear" },
        { id: "description" },
      ],
    },
  };

  /** A limited-permission observer sees only the public description. */
  static LIMITED_PARTS = {
    limited: { template: `${TEMPLATE_ROOT}/limited.hbs` },
  };

  override _configureRenderParts(options: object): Record<string, unknown> {
    if (this.document.limited) return foundry.utils.deepClone(GWorldCharacterSheet.LIMITED_PARTS);
    return super._configureRenderParts(options);
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = this.actor;
    const system = actor.system;
    const derived = system.derived;
    const items = this.#groupItems();

    const enrich = (html: string) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
        relativeTo: actor,
        secrets: actor.isOwner,
      });

    // The header carries DR on every tab, so it has to say when that figure is
    // not the whole story: a ballistic vest stopping 12 from a bullet and 5 from
    // a club must not read as a flat 12 wherever the GM happens to be looking.
    const torso = (derived.hitLocations ?? []).find((l: any) => l.key === "torso");

    // Read once: every index handed to the template has to point into the
    // same list that removing an award will write back.
    const stored: PointAward[] = derived.points.awards ?? [];

    return {
      ...context,
      actor,
      system,
      derived,
      items,
      torsoDr: torso ?? null,
      editable: this.isEditable,
      limited: actor.limited,
      isOwner: actor.isOwner,

      attributeCards: ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Attribute.${key}`),
        value: system.attributes[key],
        cost: (system.attributes[key] - 10) * (key === "DX" || key === "IQ" ? 20 : 10),
      })),

      postures: POSTURES.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Posture.${key}`),
        selected: system.posture === key,
      })),

      hands: (["right", "left"] as const).map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Tactical.${key}`),
        selected: (system.handedness ?? "right") === key,
      })),

      secondaryCells: this.#secondaryCells(system, derived),
      maneuvers: MANEUVER_ORDER.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Maneuver.${key}`),
        selected: system.maneuver === key,
      })),
      isEvaluating: system.maneuver === "evaluate",
      isWaiting: system.maneuver === "wait",
      // The area covered only matters if opportunity fire is being played.
      showOpportunityFire: system.maneuver === "wait" && isRuleOn("opportunityFire"),
      // What covering that much ground will cost when the shot is finally
      // taken, shown while the area is still being chosen.
      waitPenalty: system.wait?.coveringLine
        ? OPPORTUNITY_LINE_PENALTY
        : opportunityFirePenalty(Number(system.wait?.hexesWatched ?? 1)),
      isAllOutDefense: system.maneuver === "allOutDefense" || system.conditions.allOutDefense,
      aodIncreased: system.allOutDefenseOption === "increased",
      aodTargets: (["dodge", "parry", "block"] as const).map((key) => ({
        key,
        label: `GWORLD.Secondary.${key === "dodge" ? "Dodge" : key === "parry" ? "Parry" : "Block"}`,
        selected: system.allOutDefenseTarget === key,
      })),

      pointsWarning: this.#pointsWarning(derived),

      // A trait is levelled if it is priced per level or from a table. Only
      // those get a levels field: a flat 15-point advantage has nothing to
      // buy, and a box that can only read zero invites being typed into.
      traitGroups: [
        {
          num: "01",
          label: "GWORLD.Points.Advantages",
          addLabel: "GWORLD.Action.AddAdvantage",
          category: "advantage",
          categories: "advantage,perk",
          browseTitle: "GWORLD.Picker.Advantages",
          total: derived.points.advantages,
          negative: false,
          traits: items.advantages.map(withLevels),
        },
        {
          num: "02",
          label: "GWORLD.Points.Disadvantages",
          addLabel: "GWORLD.Action.AddDisadvantage",
          category: "disadvantage",
          categories: "disadvantage,quirk",
          browseTitle: "GWORLD.Picker.Disadvantages",
          total: derived.points.disadvantages,
          negative: true,
          traits: items.disadvantages.map(withLevels),
        },
        {
          num: "03",
          label: "GWORLD.Points.Quirks",
          addLabel: "GWORLD.Action.AddQuirk",
          category: "quirk",
          categories: "quirk",
          browseTitle: "GWORLD.Picker.Quirks",
          total: derived.points.quirks,
          negative: true,
          traits: items.quirks.map(withLevels),
        },
      ],
      disadvantageOverLimit: derived.points.disadvantageTotal > derived.points.disadvantageLimit,
      // Spending past the budget is not forbidden -- a GM may allow it, and a
      // character part-way through being built is over and under by turns --
      // so it is flagged rather than blocked.
      overBudget: derived.points.overBudget,

      // The award log, newest first, which is the order a log is read in.
      // Each row carries its index in the *stored* order, because that is what
      // removing one has to address and the order shown here is not it.
      awards: awardsNewestFirst(stored).map((award) => ({
        ...award,
        index: stored.indexOf(award),
        when: award.at ? new Date(award.at).toLocaleDateString() : "",
      })),

      // The grapple this character is in, if any: what it allows is entirely
      // different depending on which end of it they are.
      grapple: (() => {
        const held = grappleOf(this.actor);
        if (!held) return null;
        return {
          holding: held.holding,
          pinned: held.pinned,
          hands: held.hands,
          byTheNeck: held.hitLocation === "neck",
        };
      })(),

      // Tactical combat, when the world is using it. Movement points are the
      // character's Move after encumbrance, and what each hex costs depends on
      // the direction travelled and the posture held.
      tactical: tacticalPanel(system, derived),

      // Which rules the table is playing. A control for a rule that is off is
      // not disabled, it is absent: there is nothing to explain about a rule
      // nobody is using.
      rules: activeRules(),

      conditionChips: CONDITIONS.map(({ key, label }) => ({
        key,
        label,
        active: Boolean(system.conditions[key]),
      })),

      defenseCards: [
        { key: "dodge", label: "GWORLD.Secondary.Dodge", ...toCard(derived.defenses.dodge) },
        { key: "parry", label: "GWORLD.Secondary.Parry", ...toCard(derived.defenses.parry) },
        { key: "block", label: "GWORLD.Secondary.Block", ...toCard(derived.defenses.block) },
      ],

      encumbranceTiers: this.#encumbranceTiers(derived),
      carriedRows: this.#carriedRows(items),

      skillSummary: { count: items.skillGroups.reduce((n, g) => n + g.skills.length, 0) },

      biographyHTML: await enrich(system.details.biography ?? ""),
      notesHTML: await enrich(system.details.notes ?? ""),
    };
  }

  /**
   * Wires the skill filter. It is deliberately not a form field — a `name`
   * here would be submitted onto the actor on every keystroke.
   */
  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    // Points and levels are edited in place. They are the numbers a character
    // is actually built out of, and having to open each item's own sheet to
    // change one made spending points a chore rather than the point.
    //
    // Registered before the skill filter, which returns early on tabs that do
    // not have one.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-field]")) {
      input.addEventListener("change", () => {
        const item = this.#itemFrom(input);
        const field = input.dataset.itemField;
        if (!item || !field) return;

        const value = Math.round(Number(input.value));
        if (!Number.isFinite(value)) {
          // A field cleared or typed into nonsense is put back rather than
          // written, so a stray keystroke cannot silently zero a skill.
          void this.render();
          return;
        }
        void item.update({ [field]: Math.max(0, value) });
      });
    }

    const filter = this.element.querySelector<HTMLInputElement>(".gworld-skill-filter");
    if (!filter) return;

    const apply = () => {
      const needle = filter.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll<HTMLElement>("[data-tab='skills'] tbody tr")) {
        const name = row.querySelector(".wname")?.textContent?.toLowerCase() ?? "";
        row.hidden = needle.length > 0 && !name.includes(needle);
      }
      // A group whose rows are all hidden should not leave a stray header.
      for (const group of this.element.querySelectorAll<HTMLElement>("[data-tab='skills'] .isec")) {
        const rows = [...group.querySelectorAll<HTMLElement>("tbody tr")];
        group.hidden = rows.length > 0 && rows.every((r) => r.hidden);
      }
    };

    filter.addEventListener("input", apply);
    apply();
  }

  /**
   * Hands each tab part its own tab config, so the section can mark itself
   * active on first render. Without this every section renders inactive and
   * the sheet body comes up blank.
   */
  override async _preparePartContext(
    partId: string,
    context: Record<string, any>,
    options: object,
  ): Promise<Record<string, any>> {
    const partContext = (await super._preparePartContext(partId, context, options)) as Record<
      string,
      any
    >;
    if (partContext.tabs && partId in partContext.tabs) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  /**
   * The secondary-characteristics grid.
   *
   * Each Basic Set secondary can be bought above or sold below its
   * attribute-derived default, so the editable ones expose their adjustment and
   * what it costs. Basic Lift and Dodge stay read-only — they are computed, not
   * purchased.
   */
  #secondaryCells(system: any, derived: any) {
    const L = (key: string) => game.i18n.localize(`GWORLD.Secondary.${key}`);
    const p = system.purchased;
    const b = system.bonuses;

    const cell = (
      key: "hp" | "will" | "per" | "fp" | "basicMove",
      label: string,
      value: unknown,
      derivation: string,
    ) => ({
      key,
      label,
      value,
      purchased: p[key],
      granted: b[key],
      derivation,
      step: 1,
      editable: true,
      cost: secondaryPointCost(key, p[key]),
    });

    return [
      cell("hp", L("HP"), system.hp.max, "= ST"),
      cell("will", L("Will"), derived.will, "= IQ"),
      cell("per", L("Per"), derived.per, "= IQ"),
      cell("fp", L("FP"), system.fp.max, "= HT"),
      {
        key: "basicLift", label: L("BasicLift"), value: `${derived.basicLift} lb`,
        derivation: "= ST²/5", editable: false, cost: 0, granted: 0, purchased: 0, step: 1,
      },
      {
        key: "basicSpeed", label: L("BasicSpeed"), value: derived.basicSpeed.toFixed(2),
        purchased: p.basicSpeed, granted: b.basicSpeed, derivation: "= (DX+HT)/4",
        step: BASIC_SPEED_STEP, editable: true, cost: basicSpeedPointCost(p.basicSpeed),
      },
      cell("basicMove", L("BasicMove"), derived.basicMove, "= ⌊Speed⌋"),
      {
        key: "dodge", label: L("Dodge"), value: derived.defenses.dodge.total,
        derivation: "= Move + 3", editable: false, cost: 0, granted: 0, purchased: 0, step: 1,
      },
    ];
  }

  /** The advisory line under the points ledger. Warnings never block saving. */
  #pointsWarning(derived: any): { text: string; over: boolean } {
    const { remaining, disadvantageTotal, disadvantageLimit } = derived.points;
    const parts: string[] = [];
    let over = false;

    if (remaining > 0) {
      parts.push(game.i18n.format("GWORLD.Points.Unspent", { points: remaining }));
    } else if (remaining < 0) {
      parts.push(game.i18n.format("GWORLD.Points.Over", { points: Math.abs(remaining) }));
      over = true;
    } else {
      parts.push(game.i18n.localize("GWORLD.Points.Exact"));
    }

    parts.push(
      game.i18n.format("GWORLD.Points.DisadvantageStanding", {
        total: disadvantageTotal,
        limit: disadvantageLimit,
      }),
    );
    if (disadvantageTotal > disadvantageLimit) over = true;

    return { text: parts.join(" "), over };
  }

  /** The five encumbrance tiers with this character's limits and resulting Move. */
  #encumbranceTiers(derived: any) {
    const bl = derived.basicLift;
    return ENCUMBRANCE_TIERS.map((tier) => ({
      label: `GWORLD.Encumbrance.${tier.key}`,
      limit: Math.floor(bl * tier.basicLiftMultiple),
      move: encumberedMove(derived.basicMove, tier.level),
      active: derived.encumbrance.level === tier.level,
    }));
  }

  /**
   * Equipment, armor and shields share one carried list so weight and cost read
   * as a single inventory rather than three.
   */
  #carriedRows(items: { carried: any[]; armor: any[]; shields: any[] }) {
    const rows = [
      ...items.carried.map((i: any) => ({ item: i, notes: describeModes(i), equippable: false })),
      // Armour arrives wrapped with its coverage text for the protection card,
      // so the inventory has to reach through to the item itself.
      ...items.armor.map((a: any) => ({
        item: a.item,
        notes: `DR ${a.item.system.dr} — ${a.coverage}`,
        equippable: true,
      })),
      ...items.shields.map((i: any) => ({ item: i, notes: `DB ${i.system.db}`, equippable: true })),
    ];

    return rows.map(({ item, notes, equippable }) => ({
      id: item.id,
      name: item.name,
      quantity: item.system.quantity ?? 1,
      weight: (item.system.weight ?? 0) * (item.system.quantity ?? 1),
      cost: (item.system.cost ?? 0) * (item.system.quantity ?? 1),
      equipped: Boolean(item.system.equipped),
      equippable: equippable || Boolean(item.system.meleeModes?.length || item.system.rangedModes?.length),
      notes,
    }));
  }

  /** Splits embedded items into the buckets each tab renders. */
  #groupItems() {
    const actor = this.actor;
    const all = [...actor.items];
    const byType = (type: string) => all.filter((i: any) => i.type === type);

    const skills = byType("skill");
    const trained = skills.filter((s: any) => s.system.points > 0);
    const untrained = skills.filter((s: any) => s.system.points <= 0);

    // Skills group by controlling attribute, matching the printed sheet.
    const skillGroups = (["DX", "IQ", "HT", "ST", "Will", "Per"] as const)
      .map((attribute) => ({
        attribute,
        score:
          attribute === "Will"
            ? actor.system.derived.will
            : attribute === "Per"
              ? actor.system.derived.per
              : actor.system.attributes[attribute],
        skills: trained
          .filter((s: any) => s.system.attribute === attribute)
          .sort((a: any, b: any) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.skills.length > 0);

    const equipment = byType("equipment");

    return {
      skillGroups,
      untrainedSkills: untrained.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      advantages: byType("trait").filter((t: any) => ["advantage", "perk"].includes(t.system.category)),
      disadvantages: byType("trait").filter((t: any) => t.system.category === "disadvantage"),
      quirks: byType("trait").filter((t: any) => t.system.category === "quirk"),
      // The protection card used to call every piece whole-body, which was true
      // while the only armour came from GURPS Lite's full suits. The Basic Set
      // sells a torso piece and its sleeves separately, so the card has to say
      // what each one actually covers.
      armor: byType("armor").map((a: any) => ({
        item: a,
        coverage: (a.system.locations ?? []).length
          ? (a.system.locations as string[])
              .map((l) => game.i18n.localize(`GWORLD.HitLocation.${l}`))
              .join(", ")
          : game.i18n.localize("GWORLD.Item.WholeBody"),
      })),
      shields: byType("shield"),
      languages: byType("language"),
      techniques: byType("technique")
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        // A resolved level of 0 or below is still a valid level, but Handlebars
        // reads it as false, so the template needs an explicit flag.
        .map((t: any) => ({ item: t, resolved: t.system.derived?.level !== null })),
      carried: equipment.filter((i: any) => i.system.carried),
      stored: equipment.filter((i: any) => !i.system.carried),
    };
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  /**
   * Rolls 3d6 against the clicked target number and posts the result to chat.
   * Shift-click prompts for a situational modifier first.
   */
  static async #onRoll(this: GWorldCharacterSheet, event: Event, target: HTMLElement) {
    await handleRollAction(this.actor, event, target);
  }

  /** Rolls an attack mode's damage and posts it to chat. */
  static async #onRollDamage(this: GWorldCharacterSheet, event: Event, target: HTMLElement) {
    await handleDamageAction(this.actor, event, target);
  }

  static async #onToggleCondition(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const key = target.dataset.condition;
    if (!key) return;
    const current = foundry.utils.getProperty(this.actor, `system.conditions.${key}`);
    await this.actor.update({ [`system.conditions.${key}`]: !current });
  }

  /**
   * Steps a skill's points up or down the Skill Cost Table (GURPS Lite p. 12).
   *
   * Points come in steps -- 1, 2, 4, 8, then four at a time -- and the totals
   * between them buy nothing. Adding one would spend a character point for no
   * change to the level three times out of four, so this moves to the next
   * total that actually buys something.
   */
  static async #onStepPoints(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;

    const current = Number(item.system?.points ?? 0);
    const down = target.dataset.step === "down";

    // A technique is not a skill and does not use the Skill Cost Table: it
    // costs a point per level, so stepping it along the table would jump from
    // 2 to 4 and skip a level that can be bought.
    const step = item.type === "technique"
      ? (down ? previousTechniquePoints : nextTechniquePoints)
      : (down ? previousSkillPoints : nextSkillPoints);

    const next = step(current);
    if (next === current) return;

    await item.update({ "system.points": next });
  }

  /**
   * Steps a levelled trait up or down.
   *
   * Levels move one at a time -- unlike skill points, every level of a trait
   * buys something -- but they stop where the book stops: at the printed cap,
   * and at the last step a cost table prices, since past that there would be
   * no cost to charge.
   */
  static async #onStepLevels(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;

    const system = item.system ?? {};
    const trait = {
      levels: Number(system.levels ?? 0),
      maxLevels: Number(system.maxLevels ?? 0),
      costTable: (system.costTable ?? []) as number[],
    };

    const next =
      target.dataset.step === "down" ? previousTraitLevel(trait) : nextTraitLevel(trait);
    if (next === trait.levels) return;

    await item.update({ "system.levels": next });
  }

  /**
   * Tries to get past someone without knocking them down
   * (GURPS Basic Set: Campaigns p. 368).
   *
   * A Quick Contest of DX, modified by what the foe is doing: hard past someone
   * standing, easy past someone on the ground, and easier from a side or from
   * behind. Both sides are rolled at once, because a contest is over in a
   * second and nobody decides anything between the two rolls.
   */
  static async #onEvade(this: GWorldCharacterSheet) {
    if (!isRuleOn("evading")) return;
    // Targeted rather than selected, for the reason given under the Feint: the
    // mover usually has their own token selected, and evading yourself is not
    // a contest anyone meant to roll.
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Evade.OneTarget"));
      return;
    }

    const foeToken = targets[0];
    const foe = foeToken?.actor;
    if (!foe) return;

    const modifier = evadeModifier({
      foePosture: foe.system?.posture ?? "standing",
      approach: await approachTo(this.actor, foeToken),
    });

    const result = await rollQuickContest({
      label: game.i18n.format("GWORLD.Evade.Label", {
        mover: String(this.actor.name),
        foe: String(foe.name),
      }),
      first: {
        actor: this.actor,
        base: Number(this.actor.system?.attributes?.DX ?? 10),
        modifiers: [{ label: game.i18n.localize("GWORLD.Evade.Action"), value: modifier }],
      },
      second: { actor: foe, base: Number(foe.system?.attributes?.DX ?? 10) },
    });

    // "If you win, you evade him and are free to move on. If you lose or tie,
    // he got in your way and stopped you." A tie is not a draw here.
    ui.notifications?.info(
      result.outcome === "first"
        ? game.i18n.format("GWORLD.Evade.Past", { mover: String(this.actor.name) })
        : game.i18n.format("GWORLD.Evade.Stopped", { foe: String(foe.name) }),
    );
  }

  /**
   * Fakes an attack, so the next real one is harder to defend against
   * (GURPS Basic Set: Campaigns p. 365).
   *
   * The Feint itself is not an attack and does nothing on its own: what it buys
   * is a penalty to the foe's active defenses against this character's next
   * attack, which is recorded on the actor and spent when that attack is rolled.
   */
  static async #onFeint(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("feint")) return;

    const base = Number(target.dataset.rollTarget);
    if (!Number.isFinite(base)) return;

    // One foe, because a feint is aimed at a person: "your allies cannot take
    // advantage of your Feint", and neither can it be aimed at two people.
    //
    // Targeted, never merely selected: a feinter has their own token selected
    // far more often than not, and falling back to it would have them feinting
    // themselves.
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Feint.OneTarget"));
      return;
    }

    const foe = targets[0]?.actor;
    if (!foe) return;

    const defense = feintDefenseScore(foe);
    const result = await rollFeint({
      label: game.i18n.format("GWORLD.Feint.Label", {
        weapon: target.dataset.rollLabel ?? "",
        foe: String(foe.name),
      }),
      feinter: { actor: this.actor, base },
      // Naming what they rolled against matters here: the rule lets them roll
      // their best of several things, and the card should say which it was.
      defender: { actor: foe, base: defense.score, note: defense.source },
    });

    if (result.success) {
      await recordFeint(this.actor, String(foe.uuid), result.defensePenalty);
    }
  }

  /**
   * Pits this character against one other, at the same attribute
   * (GURPS Basic Set: Campaigns pp. 348-349).
   *
   * Both kinds of contest are here because the choice between them is the whole
   * question: a Quick Contest is settled in a second -- two people lunging for
   * the same gun -- and a Regular Contest is arm wrestling, which goes on until
   * somebody slips.
   */
  static async #onContest(this: GWorldCharacterSheet) {
    // Targeted rather than selected, for the reason given under the Feint.
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Contest.OneTarget"));
      return;
    }

    const foe = targets[0]?.actor;
    if (!foe) return;

    const asked = await promptForContest();
    if (!asked) return;

    // The same lookup an affliction resists with: Will and Per are derived
    // rather than stored, and the four attributes are read off the sheet.
    const score = (actor: any) => resistanceScore(actor, asked.attribute);
    const label = game.i18n.format("GWORLD.Contest.Label", {
      attribute: asked.attribute,
      first: String(this.actor.name),
      second: String(foe.name),
    });
    const modifier = (value: number) => (value === 0
      ? []
      : [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value }]);

    const first = { actor: this.actor, base: score(this.actor), modifiers: modifier(asked.yours) };
    const second = { actor: foe, base: score(foe), modifiers: modifier(asked.theirs) };

    if (asked.regular) await rollRegularContest({ label, first, second });
    else await rollQuickContest({ label, first, second });
  }

  /**
   * Rolls a Fright Check (GURPS Basic Set: Campaigns pp. 360-361).
   *
   * The modifier is asked rather than worked out: what a thing is worth to a
   * Fright Check is a judgement about that particular horrible thing -- how
   * grisly, how close, how dark, how alone -- and the sheet knows none of it.
   */
  static async #onFrightCheck(this: GWorldCharacterSheet) {
    if (!isRuleOn("frightChecks")) return;

    // Asked before the dialog rather than after it: someone who makes no Fright
    // Check should not be asked how frightening the thing was.
    if (traitsOf(this.actor).unfazeable) {
      ui.notifications?.info(
        game.i18n.format("GWORLD.Fright.Unfazeable", { name: String(this.actor.name) }),
      );
      return;
    }

    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Fright.Title"),
      label: game.i18n.localize("GWORLD.Fright.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;

    await rollFrightCheck({ actor: this.actor, modifier });
  }

  /**
   * Pushes past your usual limits at a physical task
   * (GURPS Basic Set: Campaigns pp. 356-357).
   *
   * This is the out-of-combat half: a Will roll at -1 per 5% asked, paid for in
   * fatigue whether it works or not. The combat half needs no button, because
   * it is chosen where it applies -- Mighty Blows and Flurry of Blows in the
   * melee attack dialog, Feverish Defense on the defense card.
   *
   * What the effort is *for* is not asked. The rule covers digging, hiking,
   * running, swimming, jumping, throwing and lifting, and each has its own
   * consequences on a critical failure; the roll is the same one every time.
   */
  static async #onExtraEffort(this: GWorldCharacterSheet) {
    if (!isRuleOn("extraEffort")) return;

    const asked = await promptForExtraEffort();
    if (asked === null) return;

    await rollExtraEffort({
      actor: this.actor,
      percentIncrease: asked.percentIncrease,
      motivated: asked.motivated,
    });
  }

  /**
   * Climbs something (GURPS Basic Set: Campaigns p. 349).
   *
   * "Make one roll to start the climb and another roll every five minutes. Any
   * failure means you fall." What is being climbed sets the modifier and the
   * speed, and encumbrance comes off on top of it -- "climbing while heavily
   * laden is a dangerous matter".
   *
   * A ladder needs no roll at all, and is offered anyway, for its speed.
   */
  static async #onClimb(this: GWorldCharacterSheet) {
    if (!isRuleOn("physicalActivities")) return;

    const chosen = await promptForChoice({
      title: game.i18n.localize("GWORLD.Feats.ClimbTitle"),
      label: game.i18n.localize("GWORLD.Feats.ClimbKind"),
      options: CLIMBS.map((row) => ({
        value: row.key,
        label: game.i18n.localize(`GWORLD.Feats.Climb.${row.key}`),
      })),
    });
    if (!chosen) return;

    const row = climb(chosen);
    const speeds = row
      ? game.i18n.format("GWORLD.Feats.ClimbSpeeds", { combat: row.combat, regular: row.regular })
      : "";

    // A ladder is not rolled for; saying so and giving the speed is the whole
    // answer, and a card reporting a roll nobody made would be worse.
    if (!row || row.modifier === null) {
      ui.notifications?.info(
        `${game.i18n.localize(`GWORLD.Feats.Climb.${chosen}`)} — ${game.i18n.localize("GWORLD.Feats.NoRoll")}. ${speeds}`,
      );
      return;
    }

    const feats = this.actor.system?.derived?.feats;
    const encumbrance = Number(this.actor.system?.derived?.encumbrance?.level) || 0;

    await rollSuccess({
      actor: this.actor,
      base: numberOr(feats?.climbing?.skill, 5),
      label: `${game.i18n.localize("GWORLD.Feats.Climbing")} — ${game.i18n.localize(`GWORLD.Feats.Climb.${chosen}`)} (${speeds})`,
      modifiers: [
        {
          label: game.i18n.localize("GWORLD.Feats.ClimbKind"),
          value: climbingModifier(chosen, encumbrance),
        },
      ],
    });
  }

  /**
   * Swims (GURPS Basic Set: Campaigns p. 354).
   *
   * Rolled "any time you enter water over your head", again every five minutes,
   * and on a failure you inhale water. The modifiers are what the sheet can
   * see: whether they meant to be in the water, and what they are carrying.
   */
  static async #onSwim(this: GWorldCharacterSheet) {
    if (!isRuleOn("physicalActivities")) return;

    const intentional = await promptForChoice({
      title: game.i18n.localize("GWORLD.Feats.SwimTitle"),
      label: game.i18n.localize("GWORLD.Feats.SwimEntry"),
      options: [
        { value: "yes", label: game.i18n.localize("GWORLD.Feats.SwimIntentional") },
        { value: "no", label: game.i18n.localize("GWORLD.Feats.SwimFell") },
      ],
    });
    if (!intentional) return;

    const feats = this.actor.system?.derived?.feats;
    const encumbrance = Number(this.actor.system?.derived?.encumbrance?.level) || 0;
    const modifier = swimmingModifier({
      intentional: intentional === "yes",
      encumbranceLevel: encumbrance,
    });

    await rollSuccess({
      actor: this.actor,
      base: numberOr(feats?.swimming?.skill, 6),
      label: game.i18n.format("GWORLD.Feats.SwimLabel", {
        move: numberOr(feats?.swimming?.move, 1),
      }),
      ...(modifier !== 0
        ? { modifiers: [{ label: game.i18n.localize("GWORLD.Feats.SwimTitle"), value: modifier }] }
        : {}),
    });
  }

  /**
   * Works out how far something can be thrown, and what it does when it lands
   * (GURPS Basic Set: Campaigns p. 355).
   *
   * No roll: this is the arithmetic the book tells you to skip until it
   * matters. Hitting with it is an ordinary attack roll afterwards.
   */
  static async #onThrow(this: GWorldCharacterSheet) {
    if (!isRuleOn("physicalActivities")) return;

    const weight = await promptForNumber({
      title: game.i18n.localize("GWORLD.Feats.ThrowTitle"),
      label: game.i18n.localize("GWORLD.Feats.ThrowWeight"),
      initial: 1,
    });
    if (weight === null) return;

    const feats = this.actor.system?.derived?.feats;
    const strength = Number(feats?.throwing?.strength) || 10;
    const basicLift = Number(feats?.throwing?.basicLift) || 0;

    const distance = throwingDistance({ strength, basicLift, weight });
    const thrust = parseDiceAdds(String(this.actor.system?.derived?.thrust ?? ""));
    const damage = thrust ? thrownDamage(thrust, weight, basicLift) : null;

    await postThrow({
      actor: this.actor,
      weight,
      basicLift,
      distance,
      damage: damage ? formatDiceAdds(damage) : "",
    });
  }

  /**
   * Drops this character (GURPS Basic Set: Campaigns pp. 430-431).
   *
   * A fall is a collision with the ground, so what it does depends on how far
   * they fell, what they landed on, and whether they landed properly. All three
   * are asked, because none of them is on the sheet.
   */
  static async #onFall(this: GWorldCharacterSheet) {
    const asked = await promptForFall();
    if (!asked) return;

    await rollFall({
      actor: this.actor,
      yardsFallen: asked.yards,
      surface: asked.surface,
      controlled: asked.controlled,
    });
  }

  /**
   * Rests quietly and gets some fatigue back (Campaigns p. 427).
   *
   * A point per ten minutes, and one more for a decent meal. There is no roll:
   * resting works, and the only question is for how long.
   */
  static async #onRest(this: GWorldCharacterSheet) {
    const asked = await promptForRest();
    if (!asked) return;

    await restForFatigue({ actor: this.actor, minutes: asked.minutes, meal: asked.meal });
  }

  /**
   * A day of rest and decent food (Campaigns p. 424).
   *
   * One HT roll for one hit point. The GM's modifier for how good or bad the
   * conditions were is asked, because only they know what they were.
   */
  static async #onRestDay(this: GWorldCharacterSheet) {
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Recovery.Daily"),
      label: game.i18n.localize("GWORLD.Recovery.Conditions"),
      initial: 0,
    });
    if (modifier === null) return;

    await restForADay({ actor: this.actor, modifier });
  }

  /**
   * Treats somebody else's wounds (Campaigns p. 424).
   *
   * This character is the medic and the target is the patient, so the roll is
   * made here and the hit points are written there.
   */
  static async #onFirstAid(this: GWorldCharacterSheet) {
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Recovery.OneTarget"));
      return;
    }

    const patient = targets[0]?.actor;
    if (!patient) return;

    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Recovery.FirstAid"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;

    const restored = await applyFirstAid({ healer: this.actor, patient, modifier });

    // "someone who is wounded but receives a successful First Aid roll ... loses
    // no HP to bleeding. A later roll will prevent further HP loss."
    if (restored > 0) await stopBleeding(patient);
  }

  /**
   * Takes hold of somebody (GURPS Basic Set: Campaigns p. 370).
   *
   * The attack roll is an ordinary one, against DX or the best of Judo,
   * Wrestling, Sumo Wrestling and Brawling. What it buys is a state: from here
   * the foe cannot walk away, and both sheets know it.
   */
  static async #onGrapple(this: GWorldCharacterSheet) {
    if (!isRuleOn("grappling")) return;

    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Grapple.OneTarget"));
      return;
    }

    const victim = targets[0]?.actor;
    if (!victim) return;

    const asked = await promptForGrapple();
    if (!asked) return;

    const skill = grapplingSkill(this.actor);
    const base = skill?.level ?? (Number(this.actor.system?.attributes?.DX) || 10);

    const outcome = await rollSuccess({
      actor: this.actor,
      base,
      kind: "attack",
      label: game.i18n.format("GWORLD.Grapple.Label", {
        skill: skill?.name ?? "DX",
        foe: String(victim.name),
      }),
      modifiers: asked.modifier === 0
        ? []
        : [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value: asked.modifier }],
    });

    // A grapple that missed is a missed attack and nothing more; the foe still
    // gets their defense, which is the ordinary defense card.
    if (!outcome?.success) return;

    await beginGrapple({
      grappler: this.actor,
      victim,
      hands: asked.hands,
      hitLocation: asked.hitLocation,
    });
  }

  /** Tries to get loose (Campaigns p. 371). */
  static async #onBreakFree(this: GWorldCharacterSheet) {
    await rollBreakFree({ actor: this.actor });
  }

  /** Bears a standing foe to the ground (Campaigns p. 370). */
  static async #onTakedown(this: GWorldCharacterSheet) {
    await rollTakedown({ actor: this.actor });
  }

  /** Pins a foe already on the ground (Campaigns p. 370). */
  static async #onPin(this: GWorldCharacterSheet) {
    await rollPin({ actor: this.actor });
  }

  /** Chokes a foe held by the neck (Campaigns p. 370). */
  static async #onChoke(this: GWorldCharacterSheet) {
    await rollChoke({ actor: this.actor });
  }

  /** Lets go, which is a free action on your own turn. */
  static async #onRelease(this: GWorldCharacterSheet) {
    await endGrapple(this.actor);
  }

  /**
   * A minute of bleeding (Campaigns p. 420).
   *
   * Rolled a minute at a time rather than run on a timer: how much time has
   * passed between one scene and the next is the GM's to say, not a clock's.
   */
  static async #onBleed(this: GWorldCharacterSheet) {
    if (!isRuleOn("bleeding")) return;
    await rollBleeding({ actor: this.actor });
  }

  /**
   * Shakes off stun at the end of a turn (Campaigns p. 420).
   *
   * A HT roll for the ordinary kind. Mental stun -- being surprised rather than
   * hurt -- asks IQ instead, which is what shift-clicking gets.
   */
  static async #onShakeOffStun(this: GWorldCharacterSheet, event: Event) {
    await rollStunRecovery({ actor: this.actor, mental: (event as MouseEvent).shiftKey });
  }

  /** Tries to come round (Campaigns p. 423). */
  static async #onWake(this: GWorldCharacterSheet) {
    await tryToWake({ actor: this.actor });
  }

  /**
   * Rolls an affliction's resistance for everyone it is being used on
   * (GURPS Basic Set: Characters p. 35).
   *
   * An affliction does no damage: the target rolls an attribute at a penalty
   * and something happens to them if they fail. What that something is lives in
   * the weapon's own notes, which the compendium does not carry, so this rolls
   * the resistance and leaves the effect to the GM.
   */
  static async #onAffliction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("afflictions")) return;
    const attribute = target.dataset.resist ?? "";
    if (!attribute) return;
    const modifier = Number(target.dataset.resistModifier) || 0;
    const label = target.dataset.afflictionLabel ?? "";

    const targets = currentTargets();
    if (targets.length === 0) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Affliction.NoTarget"));
      return;
    }

    // One roll each: an affliction is resisted individually, and two people
    // caught by the same stun gun do not share a roll.
    const seen = new Set<string>();
    for (const token of targets) {
      const victim = token?.actor;
      if (!victim) continue;
      const key = String(victim.uuid ?? victim.id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      await rollSuccess({
        actor: victim,
        base: resistanceScore(victim, attribute),
        label: game.i18n.format("GWORLD.Affliction.Label", {
          label,
          resist: `${attribute}${modifier || ""}`,
        }),
        kind: "attribute",
        modifiers: modifier === 0
          ? []
          : [{ label: game.i18n.localize("GWORLD.Affliction.Short"), value: modifier }],
      });
    }
  }

  /**
   * Slams into someone (GURPS Basic Set: Campaigns p. 371).
   *
   * Anyone can slam, so it is not an item on the sheet: it is a button, and
   * what it does depends entirely on how fast you were going. Both parties take
   * the damage, so the card is posted rather than applied.
   */
  static async #onSlam(this: GWorldCharacterSheet) {
    if (!isRuleOn("slams")) return;
    const hp = Number(this.actor.system?.hp?.max ?? 0);
    const velocity = await promptForNumber({
      title: game.i18n.localize("GWORLD.Slam.Title"),
      label: game.i18n.localize("GWORLD.Slam.Velocity"),
      initial: Number(this.actor.system?.derived?.encumbrance?.move ?? 1),
    });
    if (velocity === null) return;

    const { dice, modifier } = slamDamage(hp, velocity);
    await rollDamage({
      actor: this.actor,
      label: game.i18n.format("GWORLD.Slam.Label", { yards: velocity }),
      formula: modifier === 0 ? `${dice}d` : `${dice}d${modifier}`,
      damageType: "cr",
    });
  }

  /**
   * Awards points for a session (GURPS Basic Set: Campaigns pp. 292-294).
   *
   * Appended to the log rather than added to a running total: the point of
   * keeping earned points apart from starting ones is being able to say where
   * each of them came from, and a total nobody can explain is the thing a
   * ledger exists to prevent.
   */
  static async #onAwardPoints(this: GWorldCharacterSheet) {
    const asked = await promptForAward();
    if (!asked || asked.points === 0) return;

    const awards: PointAward[] = [
      ...((this.actor.system as { points?: { awards?: PointAward[] } }).points?.awards ?? []),
      { points: asked.points, note: asked.note, at: Date.now() },
    ];
    await this.actor.update({ "system.points.awards": awards });
  }

  /**
   * Takes one award back out of the log.
   *
   * A correction is usually better recorded as a negative award -- it keeps the
   * history -- but an award entered by mistake should be removable, and a log
   * nobody can correct is one people stop trusting.
   */
  static async #onDeleteAward(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;

    const awards: PointAward[] = [
      ...((this.actor.system as { points?: { awards?: PointAward[] } }).points?.awards ?? []),
    ];
    if (index >= awards.length) return;

    awards.splice(index, 1);
    await this.actor.update({ "system.points.awards": awards });
  }

  /**
   * Opens the guided builder.
   *
   * A second way in rather than a replacement: it walks the same edits this
   * sheet makes, in an order, with the points ledger always in view.
   */
  static async #onOpenBuilder(this: GWorldCharacterSheet) {
    await CharacterBuilder.open(this.actor);
  }

  /**
   * Opens the compendium picker, filtered to the types the button names.
   *
   * Beside the "new blank item" button rather than replacing it: making one up
   * is what you want for a house rule or a piece of loot, and finding one the
   * book already prices is what you want for everything else.
   */
  static async #onBrowseCompendium(
    this: GWorldCharacterSheet,
    _event: Event,
    target: HTMLElement,
  ) {
    const types = (target.dataset.itemTypes ?? "").split(",").filter(Boolean);
    if (types.length === 0) return;

    // Advantages and disadvantages are one item type, so the button says which
    // of them it wants. Without that, browsing from under Disadvantages offers
    // the whole 641 with the advantages mixed through them.
    const categories = (target.dataset.categories ?? "").split(",").filter(Boolean);

    await CompendiumPicker.open({
      actor: this.actor,
      types,
      ...(categories.length > 0 ? { categories } : {}),
      title: game.i18n.localize(target.dataset.browseTitle ?? "GWORLD.Picker.Title"),
    });
  }

  static async #onCreateItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const type = target.dataset.itemType;
    if (!type) return;
    const label = game.i18n.localize(`TYPES.Item.${type}`);
    await this.actor.createEmbeddedDocuments("Item", [{ name: `New ${label}`, type }]);
  }

  static async #onEditItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    item?.sheet?.render({ force: true });
  }

  static async #onDeleteItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("GWORLD.Prompt.DeleteItemTitle") },
      content: `<p>${game.i18n.format("GWORLD.Prompt.DeleteItem", { name: item.name })}</p>`,
    });
    if (confirmed) await item.delete();
  }

  static async #onToggleEquipped(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }

  #itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }
}
