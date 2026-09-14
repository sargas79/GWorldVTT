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
import { legalityNote } from "../legality.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  evadeModifier,
  opportunityFirePenalty,
  slamDamage,
  slamOutcome,
} from "../../rules/attack-options.js";
import { attackArc } from "../../rules/tactical.js";
import {
  CLIMBS,
  climb,
  climbingModifier,
  swimmingModifier,
  liftingSkillCapacity,
  maximumDrag,
} from "../../rules/physical.js";
import { rollFeint, rollQuickContest, rollRegularContest } from "../contest.js";
import { rollExtraEffort } from "../extra-effort.js";
import { rollFall } from "../falling.js";
import { rollBleeding, stopBleeding } from "../bleeding.js";
import { rollCripplingDuration, rollMortalWound } from "../dying.js";
import { catchBreath, rollSuffocation } from "../suffocation.js";
import {
  applyDeprivation,
  rollExposure,
  restFromHunger,
} from "../environment.js";
import { activePoisons, advancePoison, clearPoison, dosePoison, treatPoison, treatIllness } from "../poison.js";
import { drinkForAnHour, drinkingState, hangoverRoll, soberUpRoll } from "../intoxication.js";
import { checkInfection, exposeToDisease } from "../disease.js";
import {
  checkOverpenetration,
  rollScatter,
  splashInTheFace,
  hearTheShot,
} from "../gunplay.js";
import { rollInfluence, rollReaction } from "../reactions.js";
import { payCostOfLiving, rollAging, studySkill, workAMonth } from "../life.js";
import { trample } from "../trampling.js";
import { fightOffSwarm } from "../swarms.js";
import {
  accelerate,
  breatheBadAir,
  buildingCollapse,
  damageBuilding,
  burn,
  catchFire,
  controlVehicle,
  crushingPressure,
  decompress,
  hike,
  irradiate,
  jumpOutOfVehicle,
  motionSickness,
  shock,
  shootAtVehicle,
  sleepFor,
  splashAcid,
  setAlight,
} from "../hazards.js";
import { checkBottles, throwMolotov, tryToEscape, type Entanglement } from "../entangling.js";
import { useTechnique, type Victim } from "../unarmed-techniques.js";
import { canParryLiquid } from "../../rules/dirty-tricks.js";
import { resolveSuccess as rollOutcome } from "../../rules/success.js";
import { pressureAtDepth } from "../../rules/pressure.js";
import { isStepPostureChange, postureMove, reachablePostures } from "../../rules/posture.js";
import { affectsSecondary } from "../../rules/attribute-penalties.js";
import { canMoveWhileGrappled } from "../../rules/grappling.js";
import { formatDiceAdds } from "../../rules/dice.js";
import { rollInvention, type InventionPlan } from "../invention.js";
import { describePowers, unpoweredAbilities } from "../psionics.js";
import { stimulantWearsOff, takeDepressant, takeStimulant, withdrawalRoll } from "../drugs.js";
import type { DrugKind } from "../../rules/intoxication.js";
import type { InventionGrade } from "../../rules/invention.js";
import type { UnarmedTechnique } from "../../rules/unarmed-techniques.js";
import { attendPatient, operate, resuscitate } from "../recovery.js";
import type { ResuscitationCause } from "../../rules/medicine.js";
import type { Limbs } from "../../rules/entangling.js";
import {
  stayAwake,
  struckBy,
} from "../hazards.js";
import type { CollisionAngle } from "../../rules/collisions.js";
import type { DamageType } from "../../rules/types.js";
import { culturePenalty, languagePenalty, type Comprehension } from "../../rules/languages.js";
import type { StudyMethod } from "../../rules/study.js";
import { flyingTurn, rollPushingTheEnvelope, rollStayOn } from "../mounted.js";
import { rollThrow } from "../throwing.js";
import { summariseDescription } from "../description-summary.js";
import {
  applyTemplateToActor,
  confirmAndRemoveTemplate,
  templateFromItem,
} from "../character-templates.js";
import {
  choiceMetElsewhere,
  choiceSatisfied,
  entriesInGroup,
  requiredEntries,
  templateCost,
  type Template,
  type TemplateEntry,
} from "../../rules/templates.js";
import { INFLUENCE_SKILLS, REACTIONS, type Reaction } from "../../rules/reactions.js";
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
import { rollDisarm } from "../disarm.js";
import { rollStrikeToBreak, weaponsInHand } from "../weapon-damage.js";
import { reloadWeapon } from "../ammunition.js";
import { clothingCost } from "../../rules/wealth.js";
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
import { grappleSizeBonus } from "../../rules/size.js";
import { rollStunRecovery } from "../knockdown.js";
import { applyFirstAid, regenerate, restForADay, restForFatigue, tryToWake } from "../recovery.js";
import { rollFrightCheck } from "../fright.js";
import { traitsOf } from "../damage.js";
import { feintDefenseScore, recordFeint } from "../feint.js";
import { attackDirection, facingOf } from "../hex.js";
import { facingChangeAtEndOfMove, facingChangeCost, hexMovementCost } from "../../rules/tactical.js";
import { CompendiumPicker } from "../apps/compendium-picker.js";
import { SYSTEM_ID } from "../constants.js";
import { SKILL_ORDER } from "../settings.js";
import { attributeOf } from "../attributes.js";
import { asSkillOrder, groupSkills, otherOrder } from "../skill-groups.js";
import { groupSpells } from "../spell-groups.js";
import {
  castSpell,
  describeActiveSpell,
  describeMana,
  dropSpell,
  maintainSpell,
  promptForMana,
  rollKeepConcentration,
  toggleConcentrating,
} from "../casting.js";
import {
  describeHeld,
  dissipateSpell,
  enlargeMissile,
  heldSpell,
  injuredWhileHolding,
  strikeWithMelee,
  throwMissile,
} from "../held-spells.js";
import { castFromItem, enchantItem } from "../enchanting.js";
import { nextSpellPoints, previousSpellPoints, type MagicStyle } from "../../rules/magic.js";
import { GEAR_GROUPS, gearGroupOf, type GearGroup } from "../gear-groups.js";
import { ENCUMBRANCE_TIERS, encumberedMove } from "../../rules/encumbrance.js";
import {
  BASIC_SPEED_STEP,
  basicSpeedPointCost,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { MANEUVER_ORDER } from "../../rules/maneuvers.js";
import { DRESS_STATES } from "../../rules/cinematic.js";
import type { AcidContact, AcidLanding } from "../../rules/acid.js";
import type { AtmosphereHazard, HazardStrength } from "../../rules/atmosphere.js";
import type { PressureSupport } from "../../rules/pressure.js";
import {
  nextSkillPoints,
  nextTechniquePoints,
  previousSkillPoints,
  previousTechniquePoints,
} from "../../rules/skills.js";
import { nextTraitLevel, previousTraitLevel } from "../../rules/traits.js";
import { awardsNewestFirst, type PointAward } from "../../rules/character-points.js";
import { isReadTrait } from "../../rules/trait-effects.js";
import { weaknessOf } from "../../rules/weakness.js";
import { exposeToWeakness } from "../weakness.js";
import { cancelRitual, describeRitualInEffect, extendRitual, startRitualCasting, triggerRitual } from "../ritual-casting.js";
import { requestGuidance, startNewSession } from "../bonus-points.js";
import { applyHolyContact } from "../holy.js";
import { unconditionalReaction, type ReactionSource } from "../../rules/social.js";
import { SENSES } from "../../rules/senses.js";
import {
  handleDamageAction,
  handleRollAction,
  promptForNumber,
  beyondHalfDamage,
  yardsBetween,
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
    // "Each hex-side of facing change costs one movement point" mid-move
    // (p. 387): a 60-degree turn, a 120, and turning right round.
    turnCosts: [1, 2, 3].map((sides) => facingChangeCost(0, sides as 0 | 1 | 2 | 3 | 4 | 5)),
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
function withLevels(trait: any, openDescriptions: ReadonlySet<string> = new Set()) {
  const system = trait.system ?? {};
  const table: number[] = system.costTable ?? [];
  const description = summariseDescription(system.description);
  return {
    id: trait.id,
    name: trait.name,
    system,
    levelled: Boolean(system.pointsPerLevel) || table.length > 0,
    levelName: system.levelName ?? null,
    // The first line, and whether the rest is folded under it. Which folds
    // are open is remembered on the sheet, since every edit redraws it.
    description: {
      ...description,
      open: openDescriptions.has(String(trait.id)),
    },
    // Most traits are the GM's to adjudicate; a couple of dozen say something
    // exact that this system applies on its own. Which is which is worth a
    // badge -- a player who buys Combat Reflexes should be able to see that
    // the +1 is already in their Dodge.
    applied: isReadTrait(String(trait.name ?? ""), system.talentSkills ?? []),
    // A Weakness offers exposure to its source from its own row (p. 161).
    weakness: weaknessOf({ name: String(trait.name ?? "") }) !== null,
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
 * Asks what the weather is doing (Campaigns pp. 430, 434).
 *
 * The two halves ask different things -- a wind matters in the cold and not in
 * the heat, and what somebody is wearing matters the other way round -- but
 * they are one dialog, because "which way is it killing me" is the first
 * question and the rest follows from it.
 */
async function promptForWeather(): Promise<{
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
          <option value="light">${L("Clothing_light")}</option>
          <option value="winter">${L("Clothing_winter")}</option>
          <option value="arctic">${L("Clothing_arctic")}</option>
          <option value="heatedSuit">${L("Clothing_heatedSuit")}</option>
        </select>
      </label>
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
async function promptForRations(): Promise<{
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
async function promptForPoison(): Promise<{ poison: Poison; doublings: number } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Poison.${key}`);

  const options = POISON_EXAMPLES.map(
    (poison) => `<option value="${poison.name}">${poison.name}</option>`,
  ).join("");

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
        const named = poisonNamed(chosen("poison"));
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
async function promptForTreatment(treater: any): Promise<{
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
async function promptForDrinks(): Promise<{
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
async function promptForDisease(): Promise<{
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
async function promptForInfection(): Promise<{
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

/** Asks how badly the grenade was thrown (Campaigns p. 414). */
async function promptForScatter(): Promise<{
  margin: number;
  distanceYards: number;
  dodged: boolean;
  unseen: boolean;
  fragmentationDice: number;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Scatter.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
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
        return {
          margin: num("margin"),
          distanceYards: num("distance"),
          fragmentationDice: num("fragmentation"),
          dodged: ticked("dodged"),
          unseen: ticked("unseen"),
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Asks what the shot went through and what is behind it (Campaigns p. 408). */
async function promptForOverpenetration(): Promise<{
  basicDamage: number;
  coverDr: number;
  coverHp: number;
  coverKind: CoverKind;
  armorDivisor: number;
  behindDr: number;
  damageType: string;
  tightBeam: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Overpenetration.${key}`);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("BasicDamage")}</span>
        <input type="number" name="damage" value="0" min="0" step="1" autofocus style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("DamageType")}</span>
        <select name="damageType" style="width:120px">
          ${["pi-", "pi", "pi+", "pi++", "imp", "burn", "cr", "cut"].map((t) => `<option value="${t}">${t}</option>`).join("")}
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
        };
      },
    },
    rejectClose: false,
  });

  return result && typeof result === "object" ? (result as never) : null;
}

/** Who is listening for a shot, and what they are listening through (Campaigns p. 411). */
async function promptForHearing(): Promise<{
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
async function promptForAlight(): Promise<{
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
async function promptForSplash(): Promise<{
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
function socialBackgroundOf(actor: any): SocialBackground | null {
  if (!isRuleOn("socialBackground")) return null;
  return {
    languages: (actor?.system?.derived?.languages ?? []).map((lang: any) => ({
      name: String(lang.name ?? ""),
      spoken: String(lang.spoken ?? "none") as Comprehension,
    })),
    adaptable: actor?.system?.derived?.culturallyAdaptable === true,
  };
}

async function promptForReaction(sources: ReactionSource[]): Promise<{
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
async function promptForStudy(
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

const HZ = (key: string) => game.i18n.localize(`GWORLD.Hazard.${key}`);

/** A number field for the hazard prompts. */
function hazardField(name: string, label: string, value: string | number, extra = ""): string {
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${label}</span>
      <input type="number" name="${name}" value="${value}" step="1" ${extra} style="width:90px">
    </label>`;
}

function hazardSelect(name: string, label: string, options: Array<[string, string]>): string {
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${label}</span>
      <select name="${name}" style="width:180px">${options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
    </label>`;
}

function hazardCheck(name: string, label: string): string {
  return `<label style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" name="${name}"><span>${label}</span>
    </label>`;
}

/** Runs one of the hazard prompts and reads its form back. */
async function hazardPrompt<T>(title: string, content: string, read: (form: HTMLElement | null) => T): Promise<T | null> {
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

const num = (form: HTMLElement | null, name: string) =>
  Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
const str = (form: HTMLElement | null, name: string) =>
  form?.querySelector<HTMLSelectElement | HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
const ticked = (form: HTMLElement | null, name: string) =>
  form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;

/**
 * Whoever is being treated: the one token that is targeted.
 *
 * A doctor treats one patient at a time, and a roll made against two people at
 * once would be a roll nobody could act on.
 */
function onePatient(): any {
  const targets = currentTargets();
  if (targets.length !== 1) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Recovery.OnePatient"));
    return null;
  }
  return targets[0]?.actor ?? null;
}

/** What the operation is, and what it is being done with (Campaigns p. 424). */
async function promptForSurgery(): Promise<{
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
async function promptForResuscitation(): Promise<{
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
async function promptForEscape(current: Entanglement, currentWhere: string, wasRunning: boolean): Promise<{
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
async function promptForTechnique(target: any): Promise<{
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
async function promptForInvention(tl: number): Promise<{
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
async function promptForDepressant(): Promise<{ drug: DrugKind; doses: number; anyAlcohol: boolean } | null> {
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
async function promptForWithdrawal(): Promise<{ psychological: boolean; drugAvailable: boolean } | null> {
  const D = (key: string) => game.i18n.localize(`GWORLD.Drug.${key}`);
  return hazardPrompt(
    D("Withdrawal"),
    hazardCheck("psychological", D("Psychological")) + hazardCheck("drugAvailable", D("DrugAvailable")),
    (form) => ({ psychological: ticked(form, "psychological"), drugAvailable: ticked(form, "drugAvailable") }),
  );
}

/** How a thrown Molotov cocktail met its target (Campaigns p. 411). */
async function promptForMolotov(): Promise<{
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
async function promptForBuilding(): Promise<{
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

async function promptForCollapse(): Promise<{
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
async function promptForAcid(): Promise<{ contact: AcidContact; landing: AcidLanding } | null> {
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
async function promptForAir(): Promise<{
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
async function promptForPressure(): Promise<{
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
async function promptForAcceleration(): Promise<{
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
async function promptForMotionSickness(): Promise<{
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

async function promptForStayingUp(): Promise<{ hoursAwake: number; missedSleepHours: number } | null> {
  return hazardPrompt(
    HZ("Sleep"),
    hazardField("awake", HZ("HoursAwake"), 20, 'min="0"') +
      hazardField("missed", HZ("MissedSleep"), 0, 'min="0"') +
      `<p class="ihint" style="margin:0">${HZ("SleepHint")}</p>`,
    (form) => ({ hoursAwake: num(form, "awake"), missedSleepHours: num(form, "missed") }),
  );
}

async function promptForHike(): Promise<{
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

async function promptForCollision(): Promise<{
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

async function promptForShock(): Promise<{
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

async function promptForFire(): Promise<{ exposure: "partTurn" | "fullTurn" | "intense"; seconds: number } | null> {
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

async function promptForCatchingFire(): Promise<{ basicBurningDamage: number; tightBeam: boolean } | null> {
  return hazardPrompt(
    HZ("CatchFire"),
    hazardField("damage", HZ("BasicBurning"), 3, 'min="0"') +
      hazardCheck("beam", HZ("TightBeam")),
    (form) => ({ basicBurningDamage: num(form, "damage"), tightBeam: ticked(form, "beam") }),
  );
}

async function promptForRadiation(): Promise<{ rads: number; protectionFactor: number; modifier: number } | null> {
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
function vehicleNotes(item: any): string {
  const v = item.system?.vehicle ?? {};
  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
  return `${v.stHp ?? 0} · Hnd/SR ${signed(Number(v.handling) || 0)}/${v.stability ?? 0} · HT ${v.ht ?? 10} · Move ${v.acceleration ?? 0}/${v.topSpeed ?? 0} · DR ${v.dr ?? 0}${v.skill ? ` · ${v.skill}` : ""}`;
}

/** Asks what a trample is at, and whether it is the automatic kind (p. 404). */
async function promptForTrample(): Promise<{ modifier: number; overrun: boolean } | null> {
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
async function promptForFightingOffSwarm(): Promise<{ weaponDamage: number; shield: boolean; stomp: boolean } | null> {
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

/** Asks how much got through the vehicle, and how many are aboard (pp. 554-555). */
async function promptForVehicleHit(): Promise<{
  penetrating: number;
  occupants: number;
  damageType: DamageType;
  tightBeam: boolean;
} | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Vehicle.${key}`);
  const types: Array<[string, string]> = VEHICLE_DAMAGE_TYPES.map((t) => [t, t]);
  return hazardPrompt(
    L("ShotAt"),
    hazardField("damage", L("Penetrating"), 0, 'min="0"') +
      hazardSelect("damageType", L("DamageType"), types) +
      hazardCheck("tightBeam", L("TightBeam")) +
      hazardField("occupants", L("Aboard"), 1, 'min="0"') +
      `<p class="ihint" style="margin:0">${L("ShotAtHint")}</p>`,
    (form) => ({
      penetrating: num(form, "damage"),
      occupants: num(form, "occupants"),
      damageType: (str(form, "damageType") || "cr") as DamageType,
      tightBeam: ticked(form, "tightBeam"),
    }),
  );
}

/** The damage types a hit on a vehicle can be, in the order the table lists them. */
const VEHICLE_DAMAGE_TYPES: readonly DamageType[] = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn", "cor", "tox", "fat"];

/** The languages and manners a social roll is made in (Characters pp. 23-24). */
interface SocialBackground {
  languages: Array<{ name: string; spoken: Comprehension }>;
  adaptable: boolean;
}

/** The markup for the language select and the culture box, or nothing when the rule is off. */
function socialBackgroundFields(background: SocialBackground | null): string {
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
function socialBackgroundPenalty(form: HTMLElement | null, background: SocialBackground | null): number {
  if (!background || !form) return 0;
  const spoken = form.querySelector<HTMLSelectElement>('select[name="language"]')?.value ?? "";
  const language = spoken ? (languagePenalty(spoken as Comprehension) ?? 0) : 0;
  const unfamiliar = form.querySelector<HTMLInputElement>('input[name="unfamiliar"]')?.checked ?? false;
  return language + culturePenalty(unfamiliar, background.adaptable ? [{ name: "Cultural Adaptability" }] : []);
}

/** Asks which Influence skill is being tried, and how (Campaigns p. 359). */
async function promptForInfluence(
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
async function promptForStayOn(): Promise<{
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
async function promptForFlying(): Promise<{
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
async function promptForEnvelope(): Promise<{
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
async function promptForPenalties(current: {
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
export async function chooseTemplateOptions(
  template: Template,
): Promise<TemplateEntry[] | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Template.${key}`);
  const escape = (text: string) => foundry.utils.escapeHTML(String(text ?? ""));

  const line = (entry: TemplateEntry) =>
    `${escape(entry.name)}${entry.note ? ` <span class="gc-mod">${escape(entry.note)}</span>` : ""}` +
    ` <span class="gc-mod">[${entry.points}]</span>`;

  const required = requiredEntries(template);
  const requiredList = required.length
    ? `<div class="isub">
         <div class="isub-head">${L("Required")}</div>
         <ul style="margin:0;padding-left:18px">
           ${required.map((entry) => `<li>${line(entry)}</li>`).join("")}
         </ul>
       </div>`
    : "";

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

      return `<div class="isub">
                <div class="isub-head">${escape(group.label)}</div>
                <p class="ihint">${asks}</p>
                ${options}
              </div>`;
    })
    .join("");

  const modifiers = [
    ...Object.entries(template.attributes).map(([key, value]) => `${key} ${value}`),
    ...Object.entries(template.secondary).map(([key, value]) => `${key} ${value}`),
    ...(template.sizeModifier ? [`SM ${template.sizeModifier}`] : []),
  ].join(", ");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${template.name} — ${templateCost(template)} ${L("Points")}` },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="ihint">${L(template.kind === "racial" ? "racial" : "character")}${
        modifiers ? ` · ${escape(modifiers)}` : ""
      }</p>
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

  const found: Array<{ uuid: string; name: string; kind: string; cost: number }> = [];

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

  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item") continue;
    for (const entry of pack.index ?? []) {
      if (entry.type !== "template") continue;
      found.push({
        uuid: `Compendium.${pack.collection}.${entry._id}`,
        name: entry.name,
        kind: "character",
        cost: 0,
      });
    }
  }

  if (found.length === 0) {
    ui.notifications?.warn(L("NoneFound"));
    return null;
  }

  found.sort((a, b) => a.name.localeCompare(b.name));

  const options = found
    .map(
      (entry) =>
        `<option value="${entry.uuid}">${foundry.utils.escapeHTML(entry.name)}${
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
 * Asks what the disarm turns on.
 *
 * None of it is on either sheet: whether the weapon in hand is a fencing one,
 * whether it is a jitte or a whip, and whether the foe has both hands on
 * theirs are facts about this moment rather than about the characters.
 */
async function promptForDisarm(foe: any): Promise<{
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
  const weapons = weaponsInHand(foe);
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
  return attributeOf(actor, attribute);
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
      weaknessExposure: GWorldCharacterSheet.#onWeaknessExposure,
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
      mortalWound: GWorldCharacterSheet.#onMortalWound,
      cripplingDuration: GWorldCharacterSheet.#onCripplingDuration,
      suffocate: GWorldCharacterSheet.#onSuffocate,
      catchBreath: GWorldCharacterSheet.#onCatchBreath,
      exposure: GWorldCharacterSheet.#onExposure,
      rations: GWorldCharacterSheet.#onRations,
      restFromHunger: GWorldCharacterSheet.#onRestFromHunger,
      setAlight: GWorldCharacterSheet.#onSetAlight,
      liftingRoll: GWorldCharacterSheet.#onLiftingRoll,
      poison: GWorldCharacterSheet.#onPoison,
      poisonCycle: GWorldCharacterSheet.#onPoisonCycle,
      poisonTreat: GWorldCharacterSheet.#onPoisonTreat,
      poisonClear: GWorldCharacterSheet.#onPoisonClear,
      drink: GWorldCharacterSheet.#onDrink,
      soberUp: GWorldCharacterSheet.#onSoberUp,
      hangover: GWorldCharacterSheet.#onHangover,
      illness: GWorldCharacterSheet.#onIllness,
      infection: GWorldCharacterSheet.#onInfection,
      scatter: GWorldCharacterSheet.#onScatter,
      overpenetration: GWorldCharacterSheet.#onOverpenetration,
      hearTheShot: GWorldCharacterSheet.#onHearTheShot,
      splash: GWorldCharacterSheet.#onSplash,
      reaction: GWorldCharacterSheet.#onReaction,
      influence: GWorldCharacterSheet.#onInfluence,
      toggleMounted: GWorldCharacterSheet.#onToggleMounted,
      stayOn: GWorldCharacterSheet.#onStayOn,
      pushEnvelope: GWorldCharacterSheet.#onPushEnvelope,
      flying: GWorldCharacterSheet.#onFlying,
      attributePenalties: GWorldCharacterSheet.#onAttributePenalties,
      applyTemplate: GWorldCharacterSheet.#onApplyTemplate,
      removeTemplate: GWorldCharacterSheet.#onRemoveTemplate,
      openTemplate: GWorldCharacterSheet.#onOpenTemplate,
      shakeOffStun: GWorldCharacterSheet.#onShakeOffStun,
      grapple: GWorldCharacterSheet.#onGrapple,
      disarm: GWorldCharacterSheet.#onDisarm,
      breakFree: GWorldCharacterSheet.#onBreakFree,
      takedown: GWorldCharacterSheet.#onTakedown,
      pin: GWorldCharacterSheet.#onPin,
      choke: GWorldCharacterSheet.#onChoke,
      releaseGrapple: GWorldCharacterSheet.#onRelease,
      stepPoints: GWorldCharacterSheet.#onStepPoints,
      stepLevels: GWorldCharacterSheet.#onStepLevels,
      editItem: GWorldCharacterSheet.#onEditItem,
      showSummary: GWorldCharacterSheet.#onShowSummary,
      deleteItem: GWorldCharacterSheet.#onDeleteItem,
      toggleEquipped: GWorldCharacterSheet.#onToggleEquipped,
      toggleSkillOrder: GWorldCharacterSheet.#onToggleSkillOrder,
      readyWeapon: GWorldCharacterSheet.#onReadyWeapon,
      reloadWeapon: GWorldCharacterSheet.#onReloadWeapon,
      regenerate: GWorldCharacterSheet.#onRegenerate,
      study: GWorldCharacterSheet.#onStudy,
      workMonth: GWorldCharacterSheet.#onWorkMonth,
      payLiving: GWorldCharacterSheet.#onPayLiving,
      agingRoll: GWorldCharacterSheet.#onAgingRoll,
      stayAwake: GWorldCharacterSheet.#onStayAwake,
      sleep: GWorldCharacterSheet.#onSleep,
      hike: GWorldCharacterSheet.#onHike,
      struckBy: GWorldCharacterSheet.#onStruckBy,
      shock: GWorldCharacterSheet.#onShock,
      burn: GWorldCharacterSheet.#onBurn,
      catchFire: GWorldCharacterSheet.#onCatchFire,
      irradiate: GWorldCharacterSheet.#onIrradiate,
      attendPatient: GWorldCharacterSheet.#onAttendPatient,
      operate: GWorldCharacterSheet.#onOperate,
      resuscitate: GWorldCharacterSheet.#onResuscitate,
      tryToEscape: GWorldCharacterSheet.#onEscapeEntanglement,
      throwMolotov: GWorldCharacterSheet.#onThrowMolotov,
      unarmedTechnique: GWorldCharacterSheet.#onUnarmedTechnique,
      invent: GWorldCharacterSheet.#onInvent,
      stimulant: GWorldCharacterSheet.#onStimulant,
      stimulantWearsOff: GWorldCharacterSheet.#onStimulantWearsOff,
      depressant: GWorldCharacterSheet.#onDepressant,
      withdrawal: GWorldCharacterSheet.#onWithdrawal,
      checkBottles: GWorldCharacterSheet.#onCheckBottles,
      buildingCollapse: GWorldCharacterSheet.#onCollapse,
      damageBuilding: GWorldCharacterSheet.#onDamageBuilding,
      splashAcid: GWorldCharacterSheet.#onAcid,
      breatheBadAir: GWorldCharacterSheet.#onBadAir,
      crushingPressure: GWorldCharacterSheet.#onPressure,
      accelerate: GWorldCharacterSheet.#onAcceleration,
      motionSickness: GWorldCharacterSheet.#onMotionSickness,
      controlVehicle: GWorldCharacterSheet.#onControlVehicle,
      topOffReserve: GWorldCharacterSheet.#onTopOffReserve,
      holyContact: GWorldCharacterSheet.#onHolyContact,
      jumpOutOfVehicle: GWorldCharacterSheet.#onJumpOutOfVehicle,
      shotAtVehicle: GWorldCharacterSheet.#onShotAtVehicle,
      trample: GWorldCharacterSheet.#onTrample,
      fightOffSwarm: GWorldCharacterSheet.#onFightOffSwarm,
      castSpell: GWorldCharacterSheet.#onCastSpell,
      castRitual: GWorldCharacterSheet.#onCastRitual,
      requestGuidance: GWorldCharacterSheet.#onRequestGuidance,
      newSession: GWorldCharacterSheet.#onNewSession,
      extendRitual: GWorldCharacterSheet.#onExtendRitual,
      triggerRitual: GWorldCharacterSheet.#onTriggerRitual,
      cancelRitual: GWorldCharacterSheet.#onCancelRitual,
      maintainSpell: GWorldCharacterSheet.#onMaintainSpell,
      dropSpell: GWorldCharacterSheet.#onDropSpell,
      toggleConcentrating: GWorldCharacterSheet.#onToggleConcentrating,
      keepConcentration: GWorldCharacterSheet.#onKeepConcentration,
      changeMana: GWorldCharacterSheet.#onChangeMana,
      enlargeMissile: GWorldCharacterSheet.#onEnlargeMissile,
      throwMissile: GWorldCharacterSheet.#onThrowMissile,
      strikeMelee: GWorldCharacterSheet.#onStrikeMelee,
      dissipateSpell: GWorldCharacterSheet.#onDissipateSpell,
      heldInjury: GWorldCharacterSheet.#onHeldInjury,
      castFromItem: GWorldCharacterSheet.#onCastFromItem,
      enchantItem: GWorldCharacterSheet.#onEnchantItem,
    },
  };

  /** Which kind of gear the Gear tab is showing, or "" for all of it. */
  #gearFilter: GearGroup | "" = "";

  /**
   * The trait descriptions unfolded on this sheet, by item id. On the sheet
   * rather than the actor: which fold is open is not a fact about the
   * character, and a redraw after every edit would otherwise close it.
   */
  #openDescriptions = new Set<string>();

  /**
   * Applied templates' descriptions, by uuid.
   *
   * The record on the actor keeps a template's name and what it did, not its
   * text, which lives on the compendium document. Reading that document is
   * asynchronous and every edit redraws the sheet, so each is read once.
   */
  #templateDescriptions = new Map<string, string>();

  /** What the traits tab shows for each applied template, its description included. */
  async #appliedTemplateRows(applied: any[]): Promise<object[]> {
    const rows = [];
    for (const [index, record] of applied.entries()) {
      const uuid = String(record?.uuid ?? "");
      let html = "";
      if (uuid) {
        if (!this.#templateDescriptions.has(uuid)) {
          const document = await fromUuid(uuid).catch(() => null);
          this.#templateDescriptions.set(uuid, String((document as any)?.system?.description ?? ""));
        }
        html = this.#templateDescriptions.get(uuid) ?? "";
      }
      const key = `template:${index}:${uuid}`;
      rows.push({
        ...record,
        index,
        descriptionHtml: html,
        descriptionKey: key,
        description: { ...summariseDescription(html), open: this.#openDescriptions.has(key) },
      });
    }
    return rows;
  }

  static override PARTS = {
    header: { template: `${TEMPLATE_ROOT}/header.hbs` },
    nav: { template: `${TEMPLATE_ROOT}/nav.hbs` },
    attributes: { template: `${TEMPLATE_ROOT}/tab-attributes.hbs`, scrollable: [""] },
    skills: { template: `${TEMPLATE_ROOT}/tab-skills.hbs`, scrollable: [""] },
    magic: { template: `${TEMPLATE_ROOT}/tab-magic.hbs`, scrollable: [""] },
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
        { id: "magic" },
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
    const parts = super._configureRenderParts(options) as Record<string, unknown>;
    // A campaign without magic has no Magic tab: the rule being off means
    // the chapter was never written, and a tab for it would be a tab for
    // nothing.
    if (!isRuleOn("magic")) delete parts.magic;
    return parts;
  }

  override _prepareTabs(group: string): Record<string, any> {
    const tabs = super._prepareTabs(group) as Record<string, any>;
    // The tab is magic of either kind: the Basic Set's spells, or Ritual Path
    // Magic's Paths (Monster Hunters 1 pp. 32-39).
    if (group === "primary" && !isRuleOn("magic") && !isRuleOn("ritualPathMagic")) delete tabs.magic;
    return tabs;
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

    const skillOrder = asSkillOrder(game.settings.get(SYSTEM_ID, SKILL_ORDER));
    const appliedTemplates = await this.#appliedTemplateRows(derived.templates ?? []);

    return {
      ...context,
      actor,
      system,
      derived,
      items,
      appliedTemplates,
      torsoDr: torso ?? null,
      editable: this.isEditable,
      limited: actor.limited,
      isOwner: actor.isOwner,
      isGM: game.user?.isGM === true,
      // Controls edited in place carry ids built from this, so the redraw
      // that follows every edit can put focus back where it was.
      sheetId: this.id,
      skillOrderAlphabetical: skillOrder === "alphabetical",

      // The input edits the bought figure; what traits add is shown beside it,
      // with the figure the rest of the sheet actually uses.
      attributeCards: ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Attribute.${key}`),
        value: system.attributes[key],
        effective: derived.attributes?.[key] ?? system.attributes[key],
        bonus: derived.attributeBonuses?.[key] ?? 0,
        // The score is what the sheet shows and what points were paid for; the
        // roll target is what you actually roll against: the score with what
        // traits add, or half of it for the ST of somebody very tired
        // (Campaigns p. 426).
        rollTarget:
          key === "ST"
            ? (system.derived?.fatigue?.strength ?? derived.attributes?.[key] ?? system.attributes[key])
            : (derived.attributes?.[key] ?? system.attributes[key]),
        weakened: key === "ST" && system.derived?.fatigue?.veryTired === true,
        cost: (system.attributes[key] - 10) * (key === "DX" || key === "IQ" ? 20 : 10),
      })),

      // Getting from one posture to another is not always one maneuver
      // (Campaigns p. 364): from lying down a character must "rise to a
      // crawling, kneeling, or sitting posture first"; kneeling and standing
      // trade for the step of any maneuver; and "crouching does not require a
      // Change Posture maneuver". Each option says which it is from here.
      postures: POSTURES.map((key) => {
        const from = (system.posture ?? "standing") as Posture;
        const note = key === from
          ? ""
          : key === "crouching" && from === "standing"
            ? game.i18n.localize("GWORLD.Posture.Free")
            : isStepPostureChange(from, key)
              ? game.i18n.localize("GWORLD.Posture.AStep")
              : reachablePostures(from).includes(key)
                ? ""
                : game.i18n.localize("GWORLD.Posture.TwoManeuvers");
        return {
          key,
          label: note
            ? `${game.i18n.localize(`GWORLD.Posture.${key}`)} (${note})`
            : game.i18n.localize(`GWORLD.Posture.${key}`),
          selected: system.posture === key,
        };
      }),
      // What the posture leaves of Move, dropping fractions: two-thirds
      // crouching, a third kneeling or crawling, none sitting, a yard lying down.
      postureMove: postureMove(Number(derived.encumbrance?.move ?? 0) || 0, (system.posture ?? "standing") as Posture),
      postureMoveShown: (system.posture ?? "standing") !== "standing",
      // "Final effective weight pulled, after all modifiers, cannot exceed
      // 15xBL" (Campaigns p. 353).
      maxDrag: maximumDrag(Number(derived.basicLift) || 0),

      hands: (["right", "left"] as const).map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Tactical.${key}`),
        selected: (system.handedness ?? "right") === key,
      })),

      secondaryCells: this.#secondaryCells(system, derived),
      // The four senses as Perception rolls, after Acute Senses and the rest
      // (Characters pp. 35, 124, 129, 138). A missing sense has no die.
      senseCells: SENSES.map((sense) => {
        const found = (derived.senses ?? []).find((s: any) => s.sense === sense);
        return {
          key: sense,
          label: game.i18n.localize(`GWORLD.Senses.${sense}`),
          score: found?.score ?? null,
          modifier: found?.modifier ?? 0,
          missing: found ? found.score === null : false,
        };
      }),
      maneuvers: MANEUVER_ORDER.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Maneuver.${key}`),
        selected: system.maneuver === key,
      })),
      // How much they are wearing, for Bulletproof Nudity (Campaigns p. 417).
      dressStates: DRESS_STATES.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Cinematic.DressState.${key}`),
        selected: (system.dress?.state ?? "clothed") === key,
      })),
      // The powers, ready to read: the book's name for each, what its Talent
      // is worth, whether this is a latent, and what a roll to use it is
      // against (Characters pp. 254-255; Monster Hunters 1 p. 40).
      psionics: describePowers(system.derived?.powers ?? [], {
        IQ: Number(derived.attributes?.IQ ?? system.attributes?.IQ ?? 10),
        will: Number(derived.will ?? 10),
        per: Number(derived.per ?? 10),
      }).map((held) => {
        const label = held.psi ? game.i18n.localize(`GWORLD.Psi.Power.${held.psi}`) : held.name;
        return {
          ...held,
          label,
          signed: held.talent > 0 ? `+${held.talent}` : String(held.talent),
          couldManifestText: held.couldManifest.join(", "),
          rollButtons: (["IQ", "Will", "Per"] as const).map((key) => ({
            key,
            target: held.rolls[key],
            label: game.i18n.format("GWORLD.Psi.UseRoll", { power: label, attribute: key }),
          })),
        };
      }),
      // A psi ability's name with no power modifier on it: not psionic, and
      // almost never what the player meant (Characters p. 254).
      unpoweredPsi: unpoweredAbilities(
        this.actor.items
          .filter((item: any) => item.type === "trait")
          .map((item: any) => ({
            name: String(item.name ?? ""),
            levels: Number(item.system?.levels ?? 0),
            modifiers: ((item.system?.modifiers ?? []) as Array<{ name?: string }>).map((m) => String(m.name ?? "")),
            power: String(item.system?.power ?? ""),
          })),
      ).map((u) => ({ ...u, powerLabel: game.i18n.localize(`GWORLD.Psi.Power.${u.power}`) })),
      // Caught in something, and how far through getting out they are.
      entangled: {
        caught: this.actor.statuses?.has?.("entangled") === true,
        kind: system.entangled?.kind ?? "",
        successes: system.entangled?.successes ?? 0,
        needed: 3,
        mustBeCut: system.entangled?.mustBeCut === true,
      },
      isEvaluating: system.maneuver === "evaluate",
      isAiming: system.maneuver === "aim",
      isWaiting: system.maneuver === "wait",
      // The area covered only matters if opportunity fire is being played.
      showOpportunityFire: system.maneuver === "wait" && isRuleOn("opportunityFire"),
      // What covering that much ground will cost when the shot is finally
      // taken, shown while the area is still being chosen.
      waitPenalty: system.wait?.coveringLine
        ? OPPORTUNITY_LINE_PENALTY
        : opportunityFirePenalty(Number(system.wait?.hexesWatched ?? 1)),
      isAllOutDefense: system.maneuver === "allOutDefense" || system.conditions.allOutDefense,
      isAllOutAttack: system.maneuver === "allOutAttack",
      // "If you have been grappled, you cannot take a Move maneuver unless you
      // have at least twice your foe's ST" (p. 371).
      grappledCannotMove: (() => {
        const grapple = grappleOf(this.actor);
        if (!grapple || grapple.holding) return false;
        const foe: any = fromUuidSync(grapple.foe);
        if (!foe) return false;
        return !canMoveWhileGrappled(
          Number(system.attributes?.ST ?? 10) || 10,
          Number(foe.system?.attributes?.ST ?? 10) || 10,
        );
      })(),
      aoaOptions: (["determined", "double", "feint", "strong", "suppression"] as const).map((key) => ({
        key,
        label: `GWORLD.Maneuver.AllOutAttackOption.${key}`,
        selected: (system.allOutAttackOption ?? "determined") === key,
      })),
      aodIncreased: system.allOutDefenseOption === "increased",
      aodTargets: (["dodge", "parry", "block"] as const).map((key) => ({
        key,
        label: `GWORLD.Secondary.${key === "dodge" ? "Dodge" : key === "parry" ? "Parry" : "Block"}`,
        selected: system.allOutDefenseTarget === key,
      })),

      pointsWarning: this.#pointsWarning(derived),

      // The templates section follows the three trait groups on the same tab,
      // so its number follows theirs rather than being written twice.
      templateSectionNum: "04",

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
          traits: items.advantages.map((trait: any) => withLevels(trait, this.#openDescriptions)),
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
          traits: items.disadvantages.map((trait: any) => withLevels(trait, this.#openDescriptions)),
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
          traits: items.quirks.map((trait: any) => withLevels(trait, this.#openDescriptions)),
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

      // A fixed wage, or freelance work paid by the margin (Campaigns p. 516).
      jobKinds: (["wage", "freelance"] as const).map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Life.JobKind.${key}`),
        selected: (system.job?.kind ?? "wage") === key,
      })),
      // The levels of Wealth a job can pay at (Campaigns p. 517).
      jobLevels: (["poor", "struggling", "average", "comfortable", "wealthy", "veryWealthy", "filthyRich"] as const).map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Life.Wealth.${key}`),
        selected: (system.job?.level ?? "average") === key,
      })),

      // "-2 DX, -1 IQ" for the button, or nothing at all when nothing is down.
      penaltiesShowing: (["ST", "DX", "IQ", "HT"] as const)
        .filter((key) => Number(system.attributePenalties?.[key]) < 0)
        .map((key) => `${system.attributePenalties[key]} ${key}`)
        .join(", "),

      // What is still working on this character. Both are flags rather than
      // system data: they are a state the GM advances, not a number a player
      // edits, and neither belongs in the template's editable fields.
      poisons: activePoisons(actor).map((dose) => ({
        ...dose,
        left: Math.max(0, dose.cycles - dose.cyclesSuffered),
      })),
      drinking: drinkingState(actor),

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
      gearGroups: this.#gearGroups(items),

      skillSummary: {
        count: items.skillGroups.reduce(
          (n, g) => n + g.rows.filter((row) => row.trained).length,
          0,
        ),
      },

      magic: this.#magicPanel(derived, items.spellGroups, system.activeSpells ?? []),

      // An NPC is edited here too, and has a few fields a character does not:
      // how many are in the scene, how they fight, and whether they are a swarm.
      npc: actor.type === "npc"
        ? {
            // Only where this sheet was opened from the one-pane NPC sheet,
            // which is then still the actor's own sheet to go back to.
            canShowSummary: actor.sheet !== this,
            cannonFodderInPlay: isRuleOn("cannonFodder"),
            swarmKinds: { tiny: "GWORLD.Swarm.Kind.tiny", large: "GWORLD.Swarm.Kind.large" },
            damageTypes: Object.fromEntries(
              ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn", "cor", "fat", "tox"]
                .map((t) => [t, `GWORLD.DamageType.${t}`]),
            ),
          }
        : null,

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

    // The gear filter shows one kind of gear at a time. Not a form field, and
    // remembered on the sheet rather than the actor: which part of the
    // inventory someone is looking at is not a fact about the character.
    const gearFilter = this.element.querySelector<HTMLSelectElement>("select[data-gear-filter]");
    if (gearFilter) {
      const applyGearFilter = () => {
        const wanted = gearFilter.value;
        for (const group of this.element.querySelectorAll<HTMLElement>("[data-gear-group]")) {
          group.hidden = wanted !== "" && group.dataset.gearGroup !== wanted;
        }
      };
      gearFilter.addEventListener("change", () => {
        this.#gearFilter = (GEAR_GROUPS as readonly string[]).includes(gearFilter.value)
          ? (gearFilter.value as GearGroup)
          : "";
        applyGearFilter();
      });
      applyGearFilter();
    }

    // The Combat tab's posture chip is a select without a form name, since the
    // Attributes tab already submits system.posture and a form cannot carry
    // the same name twice. It writes the actor directly instead.
    const posture = this.element.querySelector<HTMLSelectElement>("select[data-posture-select]");
    posture?.addEventListener("change", () => {
      if (!POSTURES.includes(posture.value as Posture)) return;
      void this.actor.update({ "system.posture": posture.value });
    });

    // The same filter serves the Skills tab and the Magic tab: a hundred
    // spells across two dozen colleges wants finding by name as much as six
    // hundred skills do.
    this.#wireFilter(".gworld-skill-filter", "skills");
    this.#wireFilter(".gworld-spell-filter", "magic");

    // A long trait description is folded to its first line. Which ones are
    // open is kept on the sheet so a level stepped on the same tab does not
    // fold everything back up.
    for (const fold of this.element.querySelectorAll<HTMLDetailsElement>("details[data-description-for]")) {
      fold.addEventListener("toggle", () => {
        const id = fold.dataset.descriptionFor;
        if (!id) return;
        if (fold.open) this.#openDescriptions.add(id);
        else this.#openDescriptions.delete(id);
      });
    }
  }

  /** Narrows one tab's tables to the rows whose name contains what was typed. */
  #wireFilter(selector: string, tab: string): void {
    const filter = this.element.querySelector<HTMLInputElement>(selector);
    if (!filter) return;

    const apply = () => {
      const needle = filter.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll<HTMLElement>(`[data-tab='${tab}'] tbody tr`)) {
        const name = row.querySelector(".wname")?.textContent?.toLowerCase() ?? "";
        row.hidden = needle.length > 0 && !name.includes(needle);
      }
      // A group whose rows are all hidden should not leave a stray header.
      for (const group of this.element.querySelectorAll<HTMLElement>(`[data-tab='${tab}'] .isec`)) {
        const rows = [...group.querySelectorAll<HTMLElement>("tbody tr")];
        group.hidden = rows.length > 0 && rows.every((r) => r.hidden);
      }
    };

    filter.addEventListener("input", apply);
    apply();
  }

  /**
   * The Magic tab's header and rows (Characters pp. 235, 242).
   *
   * Each row carries the book's own wording for cost, time and duration --
   * "1 to Magery", "sec. = cost" -- because the numbers alone cannot say
   * those. What the sheet can decide, it marks: a spell whose prerequisites
   * are not met, one on a character with no Magery, a ritual spell with no
   * college skill to be read off.
   */
  #magicPanel(derived: any, groups: ReturnType<typeof groupSpells<any>>, activeSpells: any[]) {
    const magic = derived.magic ?? {};
    const style: MagicStyle = magic.style ?? "standard";
    const L = (key: string) => game.i18n.localize(`GWORLD.Spell.${key}`);

    const mageryLabel = (() => {
      if (style === "ritual") {
        return magic.ritualMagery === null || magic.ritualMagery === undefined
          ? L("NoRitualMagery")
          : `${L("RitualMagery")} ${magic.ritualMagery}`;
      }
      return magic.standardMagery === null || magic.standardMagery === undefined
        ? L("NoMagery")
        : `${L("Magery")} ${magic.standardMagery}`;
    })();

    const rows = groups.map((group) => ({
      college: group.college,
      rows: group.rows.map((row) => {
        const item = row.spell.item;
        const sys = item.system ?? {};
        const d = sys.derived ?? {};
        const classes: string[] = sys.classes ?? [];
        const relative = (() => {
          if (style === "ritual") {
            if (!d.collegeSkill) return "—";
            const offset = -Number(sys.prerequisiteCount ?? 0) + Number(d.levels ?? 0);
            return `${d.collegeSkill}${offset >= 0 ? "+" : ""}${offset}`;
          }
          const rel = d.relativeLevel;
          if (rel === null || rel === undefined) return "—";
          return `IQ${rel >= 0 ? "+" : ""}${rel}`;
        })();
        return {
          spell: row.spell,
          known: row.known,
          rollable: row.rollable,
          otherColleges: row.otherColleges,
          veryHard: sys.difficulty === "VH",
          classes: classes.map((c) => L(`Class.${c}`)).join(" / "),
          resisted: String(sys.resistedBy ?? ""),
          energy: String(sys.energy?.text ?? "") || "—",
          time: String(sys.castingTime?.text ?? "") || "—",
          duration: String(sys.duration?.text ?? "") || "—",
          mageryRequired: Number(sys.mageryRequired ?? 0),
          needsMagery: Boolean(d.needsMagery),
          missing: (d.missing ?? []) as string[],
          missingText: `${L("MissingHint")} ${((d.missing ?? []) as string[]).join("; ")}`,
          cappedByCollege: Boolean(d.cappedByCollege),
          noCollegeSkill: style === "ritual" && !d.collegeSkill,
          relative,
        };
      }),
    }));

    return {
      style,
      mageryLabel,
      magicResistance: Number(magic.magicResistance ?? 0),
      styleOptions: (["auto", "standard", "ritual"] as const).map((key) => ({
        key,
        label: L(`Style${key.charAt(0).toUpperCase()}${key.slice(1)}`),
        selected: (magic.preference ?? "auto") === key,
      })),
      styleHint: L(style === "ritual" ? "RitualHint" : "StandardHint"),
      groups: rows,
      // Rituals of Ritual Path Magic, by name: their cost as written down, and
      // the Path the character rolls for each (Monster Hunters 1 pp. 33-35).
      ritualsInEffect: ((this.actor.system?.ritualPath?.active ?? []) as any[]).map((entry) => {
        const described = describeRitualInEffect(entry);
        return {
          ...entry,
          ...described,
          extendable: !entry.conditional && !described.expired && entry.originalSeconds > 0 && Boolean(this.actor.items.get(entry.itemId)),
          cancelLabel: entry.conditional ? "GWORLD.RitualCast.Remove" : described.expired ? "GWORLD.RitualCast.Clear" : "",
        };
      }),
      rituals: (this.actor.items.filter((i: any) => i.type === "ritual") as any[])
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((item) => {
          const d = item.system?.derived ?? {};
          return {
            id: item.id,
            name: item.name,
            effects: d.effects || "—",
            energy: d.cost?.total ?? 0,
            durationConflict: Boolean(d.cost?.durationConflict),
            skill: d.skill?.name ?? "",
            penalty: Number(d.skill?.penalty ?? 0),
            level: d.skill?.level ?? null,
            castable: d.skill?.level !== null && d.skill?.level !== undefined,
          };
        }),
      count: groups.reduce((n, g) => n + g.rows.filter((r) => r.known).length, 0),
      // Where the casting happens, and what is already running (pp. 235, 238).
      mana: describeMana(),
      // What is in the hand, waiting to be thrown or struck with (pp. 240-241).
      held: (() => {
        const held = heldSpell(this.actor);
        return held ? describeHeld(held) : null;
      })(),
      // The magic items carried, with what each does here (Campaigns pp. 480-482).
      items: ((magic.items ?? []) as any[]).map((entry) => ({
        ...entry,
        effects: [
          entry.magic.accuracy ? `${game.i18n.localize("GWORLD.Enchant.Effect.Accuracy")} +${entry.magic.accuracy}` : "",
          entry.magic.puissance ? `${game.i18n.localize("GWORLD.Enchant.Effect.Puissance")} +${entry.magic.puissance}` : "",
          entry.magic.fortify ? `${game.i18n.localize("GWORLD.Enchant.Effect.Fortify")} +${entry.magic.fortify}` : "",
          entry.magic.deflect ? `${game.i18n.localize("GWORLD.Enchant.Effect.Deflect")} +${entry.magic.deflect}` : "",
          entry.magic.powerReduction ? `${game.i18n.localize("GWORLD.Enchant.Effect.Power")} ${entry.magic.powerReduction}` : "",
          entry.magic.staff ? game.i18n.localize("GWORLD.Enchant.Effect.Staff") : "",
        ].filter(Boolean),
      })),
      // Whether this character can enchant at all: Enchant known at 15, or
      // 20 in low mana (Campaigns p. 481).
      canEnchant: isRuleOn("magicItems") && (() => {
        const enchant = this.actor.items.find((i: any) => i.type === "spell" && /^enchant$/i.test(String(i.name ?? "").trim()));
        const level = enchant?.system?.derived?.level;
        return typeof level === "number" && level >= 15;
      })(),
      active: activeSpells.map((spell: any) => ({
        ...spell,
        ...describeActiveSpell(spell),
        canMaintain: spell.maintainCost !== null && spell.maintainCost !== undefined,
      })),
    };
  }

  /** Casts the spell whose row was clicked (Characters pp. 235-239). */
  static async #onCastSpell(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await castSpell(this.actor, item);
  }

  /** Asks the GM for a piece of player guidance (Monster Hunters 1 p. 31). */
  static async #onRequestGuidance(this: GWorldCharacterSheet) {
    await requestGuidance(this.actor);
  }

  /** The GM starts a session for this character: points refreshed (pp. 23, 28). */
  static async #onNewSession(this: GWorldCharacterSheet) {
    await startNewSession([this.actor]);
  }

  /** Starts working a ritual: its casting card (Monster Hunters 1 pp. 35-37). */
  static async #onCastRitual(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (item) await startRitualCasting(this.actor, item);
  }

  /** The ritual in effect a row stands for. */
  #activeRitualId(target: HTMLElement): string {
    return target.closest<HTMLElement>("[data-active-id]")?.dataset.activeId ?? "";
  }

  /** Extends a ritual in effect by casting again for the added duration (p. 37). */
  static async #onExtendRitual(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await extendRitual(this.actor, this.#activeRitualId(target));
  }

  /** A conditional ritual's condition is met (p. 38). */
  static async #onTriggerRitual(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await triggerRitual(this.actor, this.#activeRitualId(target), game.i18n.localize("GWORLD.RitualCast.ConditionMet"));
  }

  /** Cancels a ritual in effect, or has the GM remove a hanging one (p. 37). */
  static async #onCancelRitual(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await cancelRitual(this.actor, this.#activeRitualId(target));
  }

  #activeSpellId(target: HTMLElement): string | null {
    return target.closest<HTMLElement>("[data-spell-id]")?.dataset.spellId ?? null;
  }

  static async #onMaintainSpell(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = this.#activeSpellId(target);
    if (id) await maintainSpell(this.actor, id);
  }

  static async #onDropSpell(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = this.#activeSpellId(target);
    if (id) await dropSpell(this.actor, id);
  }

  static async #onToggleConcentrating(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = this.#activeSpellId(target);
    if (id) await toggleConcentrating(this.actor, id);
  }

  /** Will-3 to keep casting through a distraction (p. 236). */
  static async #onKeepConcentration(this: GWorldCharacterSheet) {
    await rollKeepConcentration(this.actor);
  }

  /** The GM sets the mana here and the campaign's default (p. 235). */
  static async #onChangeMana(this: GWorldCharacterSheet) {
    await promptForMana();
  }

  /* ── a spell in the hand (Characters pp. 240-241) ─────────────────────── */

  static async #onEnlargeMissile(this: GWorldCharacterSheet) {
    await enlargeMissile(this.actor);
  }

  static async #onThrowMissile(this: GWorldCharacterSheet, event: Event) {
    await throwMissile(this.actor, event);
  }

  static async #onStrikeMelee(this: GWorldCharacterSheet, event: Event) {
    await strikeWithMelee(this.actor, event);
  }

  static async #onDissipateSpell(this: GWorldCharacterSheet) {
    await dissipateSpell(this.actor);
  }

  static async #onHeldInjury(this: GWorldCharacterSheet) {
    await injuredWhileHolding(this.actor);
  }

  /* ── magic items (Campaigns pp. 480-482) ──────────────────────────────── */

  static async #onCastFromItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    const index = Number(target.dataset.enchantmentIndex);
    if (item && Number.isInteger(index)) await castFromItem(this.actor, item, index);
  }

  static async #onEnchantItem(this: GWorldCharacterSheet) {
    await enchantItem(this.actor);
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

    // "IQ penalties apply equally to Will and Per. However, there are no other
    // effects on secondary characteristics" (p. 421). So Will and Per say what
    // a lowered IQ is taking off them, and nothing else does.
    const iqPenalty = Number(derived.attributePenalties?.intelligence ?? 0) || 0;
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
      lowered: affectsSecondary(key) ? iqPenalty : 0,
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
        // No Dodge at all on a turn that forfeited every defense -- All-Out
        // Attack -- where the derived figure is null rather than a number.
        // Reading .total off it took the whole sheet down with it.
        key: "dodge", label: L("Dodge"), value: derived.defenses?.dodge?.total ?? "—",
        derivation: derived.defenses?.dodge ? "= Move + 3" : game.i18n.localize("GWORLD.Secondary.NoDefense"),
        editable: false, cost: 0, granted: 0, purchased: 0, step: 1,
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
   * as a single inventory rather than three -- shown under the kind of thing
   * each is, so a hardsuit, a laser sight and a week of rations are not one
   * undifferentiated run.
   */
  #gearGroups(items: { carried: any[]; armor: any[]; shields: any[] }) {
    // Clothing is priced as a share of the wearer's monthly cost of living
    // rather than at a figure of its own (Characters p. 266), so the row
    // shows what it costs this character.
    const status = Number(this.actor.system?.derived?.wealth?.status ?? 0) || 0;
    const priceOf = (item: any): number => {
      const share = Number(item.system?.costOfLivingPercent ?? 0) || 0;
      return share > 0 ? clothingCost(share, status) : Number(item.system?.cost ?? 0) || 0;
    };
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
    ].map(({ item, notes, equippable }) => ({
      id: item.id,
      name: item.name,
      group: gearGroupOf(item),
      quantity: item.system.quantity ?? 1,
      weight: (item.system.weight ?? 0) * (item.system.quantity ?? 1),
      cost: priceOf(item) * (item.system.quantity ?? 1),
      equipped: Boolean(item.system.equipped),
      equippable: equippable || Boolean(item.system.meleeModes?.length || item.system.rangedModes?.length),
      notes: item.system.category === "vehicle" ? vehicleNotes(item) : notes,
      vehicle: item.system.category === "vehicle" && isRuleOn("vehicles"),
      // Holy water and a significant symbol touch a demon without a blow
      // (Monster Hunters 1 pp. 51, 57).
      holy: Boolean(item.system.holy) && isRuleOn("holyAttacks"),
      // Its Legality Class, and what carrying it here takes under the
      // campaign's Control Rating (Characters p. 267, Campaigns p. 507).
      legality: legalityNote(item.system.lc ?? null),
    })).sort((a, b) => a.name.localeCompare(b.name));

    return GEAR_GROUPS.map((key) => ({
      key,
      label: `GWORLD.Gear.Group.${key}`,
      selected: this.#gearFilter === key,
      rows: rows.filter((row) => row.group === key),
    })).filter((group) => group.rows.length > 0);
  }

  /** Splits embedded items into the buckets each tab renders. */
  #groupItems() {
    const actor = this.actor;
    const all = [...actor.items];
    const byType = (type: string) => all.filter((i: any) => i.type === type);

    // Skills group by controlling attribute, matching the printed sheet, or
    // run as one alphabetical list when the user prefers that. Either way an
    // untrained skill sits with the rest, marked, rather than under a heading
    // of its own.
    const skillGroups = groupSkills(
      byType("skill").map((item: any) => ({
        id: String(item.id),
        name: String(item.name ?? ""),
        attribute: item.system.attribute,
        points: Number(item.system.points ?? 0),
        level: item.system.derived?.level ?? null,
        hasDefault: Boolean(item.system.derived?.hasDefault),
        item,
      })),
      {
        order: asSkillOrder(game.settings.get(SYSTEM_ID, SKILL_ORDER)),
        scores: {
          ...actor.system.attributes,
          Will: actor.system.derived.will,
          Per: actor.system.derived.per,
        },
      },
    );

    const equipment = byType("equipment");

    // Spells by college, as the book's list is and a grimoire would be.
    const spellGroups = groupSpells(
      byType("spell").map((item: any) => ({
        id: String(item.id),
        name: String(item.name ?? ""),
        colleges: (item.system.colleges ?? []) as string[],
        points: Number(item.system.points ?? 0),
        level: item.system.derived?.level ?? null,
        item,
      })),
    );

    return {
      skillGroups,
      spellGroups,
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
    // A wildcard skill walks the same table at three times each figure, so
    // the stepper is told the difficulty rather than assuming the printed one.
    // A spell walks whichever table its style says: the Skill Cost Table for
    // a standard mage, a point at a time for a ritual one (p. 242).
    const difficulty = item.system?.difficulty;
    const next = item.type === "technique"
      ? (down
          ? previousTechniquePoints(current, difficulty === "H" ? "H" : "A")
          : nextTechniquePoints(current, difficulty === "H" ? "H" : "A"))
      : item.type === "spell"
        ? (down
            ? previousSpellPoints(current, difficulty, item.system?.derived?.style ?? "standard")
            : nextSpellPoints(current, difficulty, item.system?.derived?.style ?? "standard"))
        : (down ? previousSkillPoints(current, difficulty) : nextSkillPoints(current, difficulty));
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
        base: attributeOf(this.actor, "DX"),
        modifiers: [{ label: game.i18n.localize("GWORLD.Evade.Action"), value: modifier }],
      },
      second: { actor: foe, base: attributeOf(foe, "DX") },
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

    await rollThrow({ actor: this.actor, weight });
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
    const base = skill?.level ?? attributeOf(this.actor, "DX");

    // "+1 to hit when you grapple per +1 SM advantage you have over your
    // target" (Campaigns p. 402) -- which the sheet knows without being asked.
    const sizeBonus = grappleSizeBonus(
      Number(this.actor.system?.sm) || 0,
      Number(victim.system?.sm) || 0,
    );

    const modifiers = [
      ...(sizeBonus !== 0
        ? [{ label: game.i18n.localize("GWORLD.Field.SizeModifier"), value: sizeBonus }]
        : []),
      ...(asked.modifier !== 0
        ? [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value: asked.modifier }]
        : []),
    ];

    const outcome = await rollSuccess({
      actor: this.actor,
      base,
      kind: "attack",
      label: game.i18n.format("GWORLD.Grapple.Label", {
        skill: skill?.name ?? "DX",
        foe: String(victim.name),
      }),
      modifiers,
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

  /**
   * Strikes at a foe's weapon to knock it away (Campaigns pp. 400-401).
   *
   * Two rolls: the strike, which they may defend against on the usual card,
   * and then the Quick Contest that decides whether the weapon actually comes
   * loose. What the contest turns on -- a fencing weapon, a jitte, their
   * two-handed grip -- is asked, because none of it is on either sheet.
   */
  static async #onDisarm(this: GWorldCharacterSheet) {
    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Disarm.OneTarget"));
      return;
    }

    const foe = targets[0]?.actor;
    if (!foe) return;

    const asked = await promptForDisarm(foe);
    if (!asked) return;

    // Striking to break (p. 401) is the attacker's own best blow at the
    // weapon; the sheet's melee list is where that blow is.
    if (asked.aim === "break") {
      if (!asked.itemId) {
        ui.notifications?.warn(game.i18n.localize("GWORLD.Breakage.NoWeaponToStrike"));
        return;
      }
      const melee: any[] = this.actor.system?.derived?.melee ?? [];
      const best = melee
        .filter((a) => a.damageRollable && typeof a.skillLevel === "number" && a.usable && !a.unready)
        .sort((a, b) => b.skillLevel - a.skillLevel)[0];
      if (!best) {
        ui.notifications?.warn(game.i18n.localize("GWORLD.Disarm.NoWeapon"));
        return;
      }
      await rollStrikeToBreak({
        actor: this.actor,
        foe,
        itemId: asked.itemId,
        attack: {
          name: String(best.name),
          skillLevel: Number(best.skillLevel),
          damage: String(best.damage),
          damageType: best.damageType,
          armorDivisor: Number(best.armorDivisor ?? 1) || 1,
        },
      });
      return;
    }

    const { fencingWeapon, jitteOrWhip, foeTwoHanded } = asked;
    await rollDisarm({ actor: this.actor, foe, fencingWeapon, jitteOrWhip, foeTwoHanded });
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
   * Time without air (Campaigns p. 436).
   *
   * Advanced a span at a time, because how long somebody was under is the GM's
   * to say. Choking and drowning cost differently: no air at all is a point of
   * fatigue a second, while drowning costs one only on the five-second Swimming
   * rolls that are missed.
   */
  static async #onSuffocate(this: GWorldCharacterSheet) {
    const asked = await promptForChoice({
      title: game.i18n.localize("GWORLD.Air.Title"),
      label: game.i18n.localize("GWORLD.Air.Kind"),
      options: [
        { value: "none", label: game.i18n.localize("GWORLD.Air.None") },
        { value: "drowning", label: game.i18n.localize("GWORLD.Air.Water") },
      ],
    });
    if (!asked) return;

    const seconds = await promptForNumber({
      title: game.i18n.localize("GWORLD.Air.Title"),
      label: game.i18n.localize("GWORLD.Air.Seconds"),
      initial: 5,
    });
    if (seconds === null || seconds <= 0) return;

    await rollSuffocation({
      actor: this.actor,
      seconds,
      air: asked === "drowning" ? "drowning" : "none",
    });
  }

  /** Gets air again, which stops the clock (Campaigns p. 436). */
  static async #onCatchBreath(this: GWorldCharacterSheet) {
    await catchBreath(this.actor);
  }

  /**
   * Gives this character a dose of something (Campaigns pp. 437-438).
   *
   * The dose goes onto the sheet rather than resolving at once: a poison with a
   * delay has not done anything yet, and one with cycles is not finished for
   * hours. Advancing it is a separate press, once the time has passed.
   */
  static async #onPoison(this: GWorldCharacterSheet) {
    if (!isRuleOn("poison")) return;

    const asked = await promptForPoison();
    if (!asked) return;

    await dosePoison({ actor: this.actor, poison: asked.poison, doublings: asked.doublings });
    this.render();
  }

  /** Advances one dose by one cycle (Campaigns p. 438). */
  static async #onPoisonCycle(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.poison;
    if (!id) return;

    await advancePoison({ actor: this.actor, id });
    this.render();
  }

  /** Notes a treatment against one dose (Campaigns p. 439). */
  static async #onPoisonTreat(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.poison;
    if (!id) return;

    // An illness is treated with antibiotics and a physician's care, not by
    // sucking a wound or inducing vomiting (p. 443).
    const dose = activePoisons(this.actor).find((d) => d.id === id);
    if (dose?.illness) {
      const I = (key: string) => game.i18n.localize(`GWORLD.Illness.${key}`);
      const asked = await hazardPrompt(
        I("Treat"),
        hazardCheck("antibiotics", I("Antibiotics")) +
          hazardCheck("resistant", I("DrugResistant")) +
          hazardField("physician", I("PhysicianBonus"), 0, 'min="0"'),
        (form) => ({
          antibiotics: ticked(form, "antibiotics"),
          drugResistant: ticked(form, "resistant"),
          physicianBonus: num(form, "physician"),
        }),
      );
      if (!asked) return;
      await treatIllness({ actor: this.actor, id, ...asked });
      this.render();
      return;
    }

    const asked = await promptForTreatment(this.actor);
    if (!asked) return;

    await treatPoison({ actor: this.actor, id, ...asked });
    this.render();
  }

  /** Takes a dose off the sheet, for a GM who has decided it is over. */
  static async #onPoisonClear(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.poison;
    if (!id) return;

    await clearPoison(this.actor, id);
    this.render();
  }

  /**
   * An hour at the tavern (Campaigns p. 439).
   *
   * One roll per hour, against the higher of HT and Carousing, and the extra
   * rolls a bad one calls for are made with it.
   */
  static async #onDrink(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;

    const asked = await promptForDrinks();
    if (!asked) return;

    await drinkForAnHour({ actor: this.actor, ...asked });
    this.render();
  }

  /** One roll towards sober (Campaigns p. 439). */
  static async #onSoberUp(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;

    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Drink.Sobering"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;

    await soberUpRoll({ actor: this.actor, modifier });
    this.render();
  }

  /** The roll on stopping, for whether tomorrow hurts (Campaigns p. 439). */
  static async #onHangover(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;

    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Drink.Hangover"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;

    await hangoverRoll({ actor: this.actor, modifier });
    this.render();
  }

  /**
   * A day spent where something is going round (Campaigns p. 443).
   *
   * One HT roll, modified by the disease's own virulence and by the closest
   * contact they had. Catching it puts it on the same list as a poison, since
   * from there it behaves like one.
   */
  static async #onIllness(this: GWorldCharacterSheet) {
    if (!isRuleOn("disease")) return;

    const asked = await promptForDisease();
    if (!asked) return;

    await exposeToDisease({ actor: this.actor, ...asked });
    this.render();
  }

  /** Whether an untreated wound goes bad (Campaigns p. 444). */
  static async #onInfection(this: GWorldCharacterSheet) {
    if (!isRuleOn("disease")) return;

    const asked = await promptForInfection();
    if (!asked) return;

    await checkInfection({ actor: this.actor, ...asked });
    this.render();
  }

  /**
   * Where a missed grenade landed (Campaigns p. 414).
   *
   * The margin is asked rather than remembered: the attack card that missed is
   * already posted, and reaching back into it to find the margin would be a
   * worse guess than the number the GM is looking at.
   */
  static async #onScatter(this: GWorldCharacterSheet) {
    if (!isRuleOn("scatter")) return;

    const asked = await promptForScatter();
    if (!asked) return;

    await rollScatter({ actor: this.actor, ...asked });
  }

  /** Whether the shot came out the other side (Campaigns p. 408). */
  /**
   * Whether the targeted token hears this character's shot (Campaigns p. 411),
   * or this character hears one when nobody is targeted.
   */
  static async #onHearTheShot(this: GWorldCharacterSheet) {
    const asked = await promptForHearing();
    if (!asked) return;
    const listener = targetedTokens()[0]?.actor ?? this.actor;
    await hearTheShot({ actor: this.actor, listener, ...asked });
  }

  static async #onOverpenetration(this: GWorldCharacterSheet) {
    if (!isRuleOn("overpenetration")) return;

    const asked = await promptForOverpenetration();
    if (!asked) return;

    await checkOverpenetration({ actor: this.actor, ...asked });
  }


  /**
   * What an NPC makes of this character (Campaigns p. 494).
   *
   * Whispered to the GM by default: "they don't know, for instance, whether
   * that friendly-looking old farmer is giving them straight advice or sending
   * them into a trap."
   */
  static async #onReaction(this: GWorldCharacterSheet) {
    if (!isRuleOn("reactions")) return;

    const asked = await promptForReaction(this.actor.system?.derived?.reactions ?? []);
    if (!asked) return;

    await rollReaction({ actor: this.actor, ...asked });
  }

  /**
   * Talking somebody round (Campaigns p. 359).
   *
   * The skills offered are the ones this character actually has, at the levels
   * they have them: an Influence roll is a Quick Contest, and a skill nobody
   * bought is not one of the six the book names.
   */
  static async #onInfluence(this: GWorldCharacterSheet) {
    if (!isRuleOn("reactions")) return;

    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Reaction.OneTarget"));
      return;
    }

    const subject = targets[0]?.actor;
    if (!subject) return;

    // Every Influence skill, whether or not it was bought: an unbought one
    // defaults, and which default applies is the skill's own business.
    const skills = INFLUENCE_SKILLS.map((name) => ({
      name,
      level: this.actor.system?.derived?.influence?.[name] ?? 4,
    }));

    const asked = await promptForInfluence(skills, socialBackgroundOf(this.actor));
    if (!asked) return;

    await rollInfluence({ actor: this.actor, subject, ...asked });
  }


  /**
   * Gets on or off (Campaigns p. 397).
   *
   * Mounted is a state rather than an action because of what it changes: every
   * active defense is capped by Riding while it is set, so it has to be
   * somewhere the defense scores can read it.
   */
  static async #onToggleMounted(this: GWorldCharacterSheet) {
    if (!isRuleOn("mountedCombat")) return;
    await this.actor.update({ "system.mounted": !this.actor.system?.mounted });
  }

  /** The Riding roll after something went wrong (Campaigns p. 397). */
  static async #onStayOn(this: GWorldCharacterSheet) {
    if (!isRuleOn("mountedCombat")) return;

    const asked = await promptForStayOn();
    if (!asked) return;

    await rollStayOn({ actor: this.actor, ...asked });
  }

  /** A turn in the air (Campaigns p. 397). */
  static async #onFlying(this: GWorldCharacterSheet) {
    if (!isRuleOn("highSpeed")) return;
    const asked = await promptForFlying();
    if (!asked) return;
    await flyingTurn({ actor: this.actor, ...asked });
  }

  /** A stop or a turn sharper than the rules allow (Campaigns p. 395). */
  static async #onPushEnvelope(this: GWorldCharacterSheet) {
    if (!isRuleOn("highSpeed")) return;

    const asked = await promptForEnvelope();
    if (!asked) return;

    await rollPushingTheEnvelope({ actor: this.actor, ...asked });
  }

  /**
   * Records what has been knocked down for a while (Campaigns p. 421).
   *
   * Written to the sheet rather than rolled, because it stays there: a penalty
   * from shock or an affliction lasts until something takes it away, and every
   * skill roll in between should already know about it.
   */
  static async #onAttributePenalties(this: GWorldCharacterSheet) {
    const current = this.actor.system?.attributePenalties ?? { ST: 0, DX: 0, IQ: 0, HT: 0 };
    const asked = await promptForPenalties(current);
    if (!asked) return;

    await this.actor.update({ "system.attributePenalties": asked });
  }


  /**
   * A template dropped on the sheet (Characters p. 258).
   *
   * A template is not a thing a character owns, so dropping one must not leave
   * an item behind: it is a set of instructions to carry out once. Everything
   * else drops as it always did.
   */
  override async _onDropItem(event: DragEvent, item: any): Promise<unknown> {
    if (item?.type !== "template") return super._onDropItem(event, item);

    const template = templateFromItem(item);
    if (!template) return null;

    const picks = await chooseTemplateOptions(template);
    if (picks === null) return null;

    await applyTemplateToActor({
      actor: this.actor,
      template,
      uuid: item.uuid ?? "",
      picks,
    });
    this.render();
    return null;
  }

  /**
   * Picks a template out of the world and applies it.
   *
   * The drop is the natural gesture and this is the one for people who would
   * rather not go looking for the compendium first.
   */
  static async #onApplyTemplate(this: GWorldCharacterSheet) {
    const chosen = await pickTemplateItem();
    if (!chosen) return;

    const template = templateFromItem(chosen);
    if (!template) return;

    const picks = await chooseTemplateOptions(template);
    if (picks === null) return;

    await applyTemplateToActor({
      actor: this.actor,
      template,
      uuid: chosen.uuid ?? "",
      picks,
    });
    this.render();
  }

  /** Takes a template back off, with what it added. */
  static async #onRemoveTemplate(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    if (await confirmAndRemoveTemplate(this.actor, index)) this.render();
  }

  /** Opens the template this character was built from, to read it again. */
  static async #onOpenTemplate(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const document = await fromUuid(uuid);
    (document as { sheet?: { render: (force: boolean) => void } })?.sheet?.render(true);
  }

  /** A drink in somebody's face (Campaigns p. 405). */
  static async #onSplash(this: GWorldCharacterSheet) {
    if (!isRuleOn("dirtyTricks")) return;

    const targets = targetedTokens();
    if (targets.length !== 1) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Splash.OneTarget"));
      return;
    }

    const victim = targets[0]?.actor;
    if (!victim) return;

    const asked = await promptForSplash();
    if (!asked) return;

    await splashInTheFace({ actor: this.actor, victim, ...asked });
  }

  /**
   * A spell of weather nobody was dressed for (Campaigns pp. 430, 434).
   *
   * One roll for one interval -- half an hour of heat, or as little as ten
   * minutes of a strong wind. How many of those passed is the GM's to say, so
   * this rolls one and can be pressed again.
   */
  static async #onExposure(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;

    const asked = await promptForWeather();
    if (!asked) return;

    await rollExposure({ actor: this.actor, ...asked });
  }

  /**
   * A day of going short (Campaigns p. 426).
   *
   * No roll: hunger and thirst are not something a character can be good at.
   */
  static async #onRations(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;

    const asked = await promptForRations();
    if (!asked) return;

    await applyDeprivation({ actor: this.actor, ...asked });
  }

  /** A flame held against something, and whether it catches (p. 433). */
  static async #onSetAlight(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForAlight();
    if (!asked) return;
    await setAlight({ actor: this.actor, ...asked });
  }

  /**
   * A Lifting roll for one heavy lift (Campaigns p. 353): success "increases
   * your Basic Lift by 5% times your margin of success for the purpose of
   * picking up heavy objects".
   */
  static async #onLiftingRoll(this: GWorldCharacterSheet) {
    const skill = this.actor.system?.derived?.feats?.lifting?.skill;
    const basicLift = Number(this.actor.system?.derived?.basicLift) || 0;
    if (typeof skill !== "number") {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Feats.NoLifting"));
      return;
    }
    const roll = new Roll("3d6");
    await roll.evaluate();
    const dice = (roll.dice[0]?.results ?? []).map((r: { result: number }) => r.result);
    const outcome = rollOutcome(roll.total, skill, dice);
    const lift = outcome.success ? liftingSkillCapacity(basicLift, outcome.margin) : basicLift;
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${game.i18n.localize("GWORLD.Feats.LiftingRoll")}</span>
        <span class="gc-target">${game.i18n.localize("GWORLD.Chat.Target")} ${skill}</span></div>
        <div class="gc-dice">${dice.map((d: number) => `<span class="gc-die">${d}</span>`).join("")}<span class="gc-total">${roll.total}</span></div>
        <div class="gc-result ${outcome.success ? "success" : "failure"}">${game.i18n.format("GWORLD.Feats.LiftedAs", {
          lift: Math.round(lift * 10) / 10, base: basicLift,
        })}</div></div>`,
      rolls: [roll],
    });
  }

  /** Days of rest and full meals, which is the only cure for going hungry (p. 426). */
  static async #onRestFromHunger(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const days = await promptForNumber({
      title: game.i18n.localize("GWORLD.Weather.RestTitle"),
      label: game.i18n.localize("GWORLD.Weather.RestDays"),
      initial: 1,
    });
    if (days === null) return;
    await restFromHunger({ actor: this.actor, days });
  }

  /**
   * The half-hourly roll a mortally wounded character makes (Campaigns p. 423).
   *
   * A caregiver's Physician skill can stand in for their HT at TL6+, which is
   * asked for rather than looked up: whoever is keeping them alive is not
   * necessarily anybody whose sheet is open.
   */
  static async #onMortalWound(this: GWorldCharacterSheet) {
    const physician = await promptForNumber({
      title: game.i18n.localize("GWORLD.Dying.MortalWound"),
      label: game.i18n.localize("GWORLD.Dying.PhysicianSkill"),
      initial: 0,
    });
    if (physician === null) return;

    await rollMortalWound({
      actor: this.actor,
      physician: physician > 0 ? physician : null,
      traumaMaintenance: physician > 0,
    });
  }

  /**
   * How serious a crippling injury turned out to be (Campaigns p. 422).
   *
   * "For battlefield injuries, roll at the end of combat" -- so it is a button
   * pressed afterwards rather than something a blow decides on the spot.
   */
  static async #onCripplingDuration(this: GWorldCharacterSheet) {
    const tl = await promptForNumber({
      title: game.i18n.localize("GWORLD.Dying.Crippling"),
      label: game.i18n.localize("GWORLD.Dying.TreatedAt"),
      initial: 0,
    });
    if (tl === null) return;

    await rollCripplingDuration({ actor: this.actor, treatedAtTl: tl > 0 ? tl : null });
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
  /** "The GM should assume that mages 'top themselves off' during any downtime" (Monster Hunters 1 p. 36). */
  static async #onTopOffReserve(this: GWorldCharacterSheet) {
    const max = Number(this.actor.system?.derived?.ritualPath?.reserve?.max ?? 0) || 0;
    await this.actor.update({ "system.ritualPath.manaReserve": max });
  }

  /** Holy contact with whoever is targeted, from a holy item's row (Monster Hunters 1 p. 51). */
  static async #onHolyContact(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    const targets = currentTargets();
    if (!item || targets.length === 0) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Holy.NoTarget"));
      return;
    }
    const seen = new Set<string>();
    let touched = 0;
    for (const token of targets) {
      const victim = token?.actor;
      const key = String(victim?.uuid ?? "");
      if (!victim || seen.has(key)) continue;
      seen.add(key);
      if (await applyHolyContact(victim, String(item.name))) touched++;
    }
    if (touched === 0) ui.notifications?.info(game.i18n.localize("GWORLD.Holy.NoEffect"));
  }

  /** Exposure to a Weakness, from the trait's own row (Characters p. 161). */
  static async #onWeaknessExposure(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (item) await exposeToWeakness(this.actor, item);
  }

  static async #onAffliction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("afflictions")) return;
    const attribute = target.dataset.resist ?? "";
    if (!attribute) return;
    const modifier = Number(target.dataset.resistModifier) || 0;
    const label = target.dataset.afflictionLabel ?? "";
    // A ranged affliction past its 1/2D is resisted at +3 (Characters p. 270).
    const halfDamageRange = Number(target.dataset.halfDamageRange) || 0;
    const shooter = this.actor.getActiveTokens?.()?.[0];

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
        modifiers: [
          ...(modifier === 0 ? [] : [{ label: game.i18n.localize("GWORLD.Affliction.Short"), value: modifier }]),
          // "Those that require a HT roll to resist are resisted at +3" past 1/2D.
          ...(beyondHalfDamage({ rangeYards: yardsBetween(shooter, token) ?? 0, halfDamageRange })
            ? [{ label: game.i18n.localize("GWORLD.Affliction.PastHalfDamage"), value: 3 }]
            : []),
        ],
        // A roll that fails is a condition somebody now has, and the card is
        // where it is handed out (Campaigns pp. 428-429).
        affliction: {
          uuid: String(victim.uuid ?? ""),
          name: String(victim.name ?? ""),
          label,
        },
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

    // "You and your foe each inflict dice of crushing damage on the other
    // equal to (HP x velocity)/100" (p. 371) -- both of them, and who falls
    // down is decided by comparing the two. With a target on the map both are
    // rolled; with none, only the slammer's, as before.
    const mine = slamDamage(hp, velocity);
    const dealt = await rollDamage({
      actor: this.actor,
      label: game.i18n.format("GWORLD.Slam.Label", { yards: velocity }),
      formula: formatDiceAdds({ dice: mine.dice, adds: mine.modifier }),
      damageType: "cr",
    });

    const foe = targetedTokens()[0]?.actor ?? null;
    if (!foe) return;
    const theirs = slamDamage(Number(foe.system?.hp?.max ?? 0), velocity);
    const taken = await rollDamage({
      actor: foe,
      label: game.i18n.format("GWORLD.Slam.Back", { name: String(foe.name ?? ""), yards: velocity }),
      formula: formatDiceAdds({ dice: theirs.dice, adds: theirs.modifier }),
      damageType: "cr",
    });

    const outcome = slamOutcome(dealt, taken);
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${game.i18n.localize("GWORLD.Slam.Title")}</span></div>
        <div class="gc-result">${game.i18n.format(`GWORLD.Slam.Outcome.${outcome}`, {
          slammer: String(this.actor.name ?? ""),
          foe: String(foe.name ?? ""),
          dealt,
          taken,
        })}</div></div>`,
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
    // The button under Disadvantages makes a disadvantage: the category is
    // part of what was asked for, not something to set afterwards.
    const category = target.dataset.category;
    const data: Record<string, unknown> = { name: `New ${label}`, type };
    if (category) data.system = { category };
    await this.actor.createEmbeddedDocuments("Item", [data]);
  }

  static async #onEditItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    item?.sheet?.render({ force: true });
  }

  /** From editing an NPC back to the one-pane sheet it was opened from. */
  static async #onShowSummary(this: GWorldCharacterSheet) {
    const summary = this.actor.sheet;
    if (!summary || summary === this) return;
    await summary.render({ force: true });
    await this.close();
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

  /**
   * Flips the Skills tab between the printed sheet's order and one
   * alphabetical list. A client setting, because it is a way of reading the
   * sheet rather than a fact about the character.
   */
  static async #onToggleSkillOrder(this: GWorldCharacterSheet) {
    const current = asSkillOrder(game.settings.get(SYSTEM_ID, SKILL_ORDER));
    await game.settings.set(SYSTEM_ID, SKILL_ORDER, otherOrder(current));
    await this.render();
  }

  /**
   * Brings an unready weapon back up (Campaigns p. 366).
   *
   * A Ready maneuver, so the maneuver is set as well as the flag cleared: it
   * is the turn's action, not a free one.
   */
  static async #onReadyWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    await item.update({ "system.unready": false });
    await this.actor.update({ "system.maneuver": "ready" });
  }

  /** Reloads a ranged weapon, for the Ready maneuvers its column lists (Campaigns p. 373). */
  static async #onReloadWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    await reloadWeapon(this.actor, item, Number(target.dataset.modeIndex) || 0);
  }

  /**
   * Heals by Regeneration (Characters p. 80) for however long has passed,
   * which is the GM's to say.
   */
  static async #onRegenerate(this: GWorldCharacterSheet) {
    const minutes = await promptForNumber({
      title: game.i18n.localize("GWORLD.Recovery.Regeneration"),
      label: game.i18n.localize("GWORLD.Recovery.RegenerationMinutes"),
      initial: 10,
    });
    if (minutes === null || minutes <= 0) return;
    await regenerate({ actor: this.actor, seconds: minutes * 60 });
  }

  /**
   * Hours with a teacher, a book or the job (Characters p. 292).
   *
   * The skills offered are the ones on the sheet: study improves a skill the
   * character already has some of, and a new one is added first.
   */
  static async #onStudy(this: GWorldCharacterSheet) {
    if (!isRuleOn("study")) return;
    const skills = [...this.actor.items]
      .filter((item: any) => item.type === "skill")
      .map((item: any) => ({ id: String(item.id), name: String(item.name), banked: Number(item.system?.studyHours) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (skills.length === 0) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Life.NoSkills"));
      return;
    }
    const asked = await promptForStudy(skills);
    if (!asked) return;
    await studySkill({ actor: this.actor, ...asked });
  }

  /** A month at the job (Campaigns p. 517). */
  static async #onWorkMonth(this: GWorldCharacterSheet) {
    if (!isRuleOn("jobs")) return;
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Life.Job"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;
    await workAMonth({ actor: this.actor, modifier });
  }

  /** The month's cost of living, out of the money on the sheet (Characters p. 265). */
  static async #onPayLiving(this: GWorldCharacterSheet) {
    if (!isRuleOn("jobs")) return;
    const months = await promptForNumber({
      title: game.i18n.localize("GWORLD.Life.CostOfLiving"),
      label: game.i18n.localize("GWORLD.Life.Months"),
      initial: 1,
    });
    if (months === null || months <= 0) return;
    await payCostOfLiving({ actor: this.actor, months });
  }

  /** A year older (Campaigns p. 444). */
  static async #onAgingRoll(this: GWorldCharacterSheet) {
    if (!isRuleOn("aging")) return;
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Life.Aging"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;
    await rollAging({ actor: this.actor, modifier });
  }

  /** A night without enough sleep, or too long a day (Campaigns p. 427). */
  static async #onStayAwake(this: GWorldCharacterSheet) {
    if (!isRuleOn("sleep")) return;
    const asked = await promptForStayingUp();
    if (!asked) return;
    await stayAwake({ actor: this.actor, ...asked });
  }

  /** Sleep, which is the only way back from missed sleep (Campaigns p. 427). */
  static async #onSleep(this: GWorldCharacterSheet) {
    if (!isRuleOn("sleep")) return;
    const hours = await promptForNumber({
      title: game.i18n.localize("GWORLD.Hazard.Sleep"),
      label: game.i18n.localize("GWORLD.Hazard.HoursSlept"),
      initial: 8,
    });
    if (hours === null || hours <= 0) return;
    await sleepFor({ actor: this.actor, hours });
  }

  /** A day on the road (Campaigns pp. 351, 426). */
  static async #onHike(this: GWorldCharacterSheet) {
    if (!isRuleOn("hiking")) return;
    const asked = await promptForHike();
    if (!asked) return;
    await hike({ actor: this.actor, ...asked });
  }

  /** Struck by something moving (Campaigns pp. 430-432). */
  static async #onStruckBy(this: GWorldCharacterSheet) {
    if (!isRuleOn("collisions")) return;
    const asked = await promptForCollision();
    if (!asked) return;
    await struckBy({ actor: this.actor, ...asked });
  }

  /** A shock (Campaigns pp. 432-433). */
  static async #onShock(this: GWorldCharacterSheet) {
    if (!isRuleOn("electricity")) return;
    const asked = await promptForShock();
    if (!asked) return;
    await shock({ actor: this.actor, ...asked });
  }

  /** Seconds in the flames (Campaigns p. 433). */
  static async #onBurn(this: GWorldCharacterSheet) {
    if (!isRuleOn("fire")) return;
    const asked = await promptForFire();
    if (!asked) return;
    await burn({ actor: this.actor, ...asked });
  }

  /** Whether a blow of burning damage set the clothes alight (Campaigns p. 434). */
  static async #onCatchFire(this: GWorldCharacterSheet) {
    if (!isRuleOn("fire")) return;
    const asked = await promptForCatchingFire();
    if (!asked) return;
    await catchFire({ actor: this.actor, ...asked });
  }

  /** A dose of rads (Campaigns pp. 435-436). */
  static async #onIrradiate(this: GWorldCharacterSheet) {
    if (!isRuleOn("radiation")) return;
    const asked = await promptForRadiation();
    if (!asked) return;
    await irradiate({ actor: this.actor, ...asked });
  }

  /** Underfoot (Campaigns p. 404). */
  static async #onTrample(this: GWorldCharacterSheet) {
    if (!isRuleOn("trampling")) return;
    const asked = await promptForTrample();
    if (!asked) return;
    await trample({ actor: this.actor, ...asked });
  }

  /** Beating a swarm off for a turn (Campaigns p. 461). */
  static async #onFightOffSwarm(this: GWorldCharacterSheet) {
    if (!isRuleOn("swarms")) return;
    const asked = await promptForFightingOffSwarm();
    if (!asked) return;
    await fightOffSwarm({ actor: this.actor, ...asked });
  }

  /**
   * A physician's rounds (Campaigns p. 424).
   *
   * The healer is whoever's sheet this is; the patient is who they are
   * looking at, which is what targeting a token means everywhere else here.
   */
  static async #onAttendPatient(this: GWorldCharacterSheet) {
    const patient = onePatient();
    if (!patient) return;
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Recovery.Attend"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;
    await attendPatient({ healer: this.actor, patient, modifier });
  }

  /** An operation (Campaigns p. 424). */
  static async #onOperate(this: GWorldCharacterSheet) {
    const patient = onePatient();
    if (!patient) return;
    const asked = await promptForSurgery();
    if (!asked) return;
    await operate({ surgeon: this.actor, patient, ...asked });
  }

  /** A minute on a drowned man's chest (Campaigns p. 425). */
  static async #onResuscitate(this: GWorldCharacterSheet) {
    const patient = onePatient();
    if (!patient) return;
    const asked = await promptForResuscitation();
    if (!asked) return;
    await resuscitate({ healer: this.actor, patient, ...asked });
  }

  /**
   * One attempt to get out of a net or a bolas (Campaigns pp. 410-411).
   *
   * What is holding them, and whether they have a hand free, are the two
   * things the roll turns on and the two the sheet cannot know.
   */
  static async #onEscapeEntanglement(this: GWorldCharacterSheet) {
    const held = this.actor.system.entangled ?? {};
    const asked = await promptForEscape(
      (held.kind || "net") as Entanglement,
      String(held.where ?? ""),
      Boolean(held.running),
    );
    if (!asked) return;
    await tryToEscape({ actor: this.actor, ...asked });
  }

  /** An arm lock, a choke, an elbow, a neck snap or a Karate point strike (pp. 403-404). */
  static async #onUnarmedTechnique(this: GWorldCharacterSheet) {
    const target = targetedTokens()[0]?.actor ?? null;
    const asked = await promptForTechnique(target);
    if (!asked) return;
    await useTechnique({ actor: this.actor, ...asked });
  }

  /** A Concept or Prototype roll for something being invented (pp. 472-474). */
  static async #onInvent(this: GWorldCharacterSheet) {
    const asked = await promptForInvention(Number(this.actor.system?.tl) || 3);
    if (!asked) return;
    await rollInvention({ actor: this.actor, ...asked });
  }

  /** A dose of a stimulant, and the HT roll a second one in a day calls for (p. 440). */
  static async #onStimulant(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;
    const doses = await promptForNumber({
      title: game.i18n.localize("GWORLD.Drug.Stimulant"),
      label: game.i18n.localize("GWORLD.Drug.DosesToday"),
      initial: 1,
    });
    if (doses === null) return;
    await takeStimulant({ actor: this.actor, dosesToday: doses });
  }

  /** The stimulant wearing off: twice the FP it restored, taken back (p. 440). */
  static async #onStimulantWearsOff(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;
    const fp = await promptForNumber({
      title: game.i18n.localize("GWORLD.Drug.StimulantWearsOff"),
      label: game.i18n.localize("GWORLD.Drug.FpRestored"),
      initial: 0,
    });
    if (fp === null) return;
    await stimulantWearsOff(this.actor, fp);
  }

  /** A depressant, and the overdose that comes of more than one (p. 441). */
  static async #onDepressant(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;
    const asked = await promptForDepressant();
    if (!asked) return;
    await takeDepressant({ actor: this.actor, ...asked });
  }

  /** One day of trying to give a drug up (p. 440). */
  static async #onWithdrawal(this: GWorldCharacterSheet) {
    if (!isRuleOn("intoxication")) return;
    const asked = await promptForWithdrawal();
    if (!asked) return;
    await withdrawalRoll({ actor: this.actor, ...asked });
  }

  /** A Molotov cocktail thrown at somebody (Campaigns p. 411). */
  static async #onThrowMolotov(this: GWorldCharacterSheet) {
    const asked = await promptForMolotov();
    if (!asked) return;
    await throwMolotov({ actor: this.actor, ...asked });
  }

  /** A fall with bottles on the belt, each of which may break (p. 411). */
  static async #onCheckBottles(this: GWorldCharacterSheet) {
    const bottles = await promptForNumber({
      title: game.i18n.localize("GWORLD.Molotov.CheckBottles"),
      label: game.i18n.localize("GWORLD.Molotov.Bottles"),
      initial: 1,
    });
    if (bottles === null) return;
    await checkBottles(this.actor, bottles);
  }

  /** A building coming down on them (Campaigns p. 484). */
  static async #onDamageBuilding(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForBuilding();
    if (!asked) return;
    await damageBuilding({ actor: this.actor, ...asked });
  }

  static async #onCollapse(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForCollapse();
    if (!asked) return;
    await buildingCollapse({ actor: this.actor, ...asked });
  }

  /** A splash, a bath or a mouthful of acid (Campaigns p. 428). */
  static async #onAcid(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForAcid();
    if (!asked) return;
    await splashAcid({ actor: this.actor, ...asked });
  }

  /** Air too thin to breathe, or made of the wrong thing (Campaigns p. 429). */
  static async #onBadAir(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForAir();
    if (!asked) return;
    await breatheBadAir({ actor: this.actor, ...asked });
  }

  /**
   * Depth, and coming back up from it (Campaigns p. 435).
   *
   * One control for both, because they are the same dive: going down risks
   * being crushed, and coming up risks the bends.
   */
  static async #onPressure(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForPressure();
    if (!asked) return;
    if (asked.ascending || asked.explosive) {
      await decompress({
        actor: this.actor,
        atmospheres: asked.atmospheres,
        explosive: asked.explosive,
        // Both were asked and then dropped: a diver with Pressure Support 1
        // rolled for the bends coming up from 3 atm, which that support removes.
        support: asked.support,
        minutes: asked.minutes,
      });
      return;
    }
    await crushingPressure({
      actor: this.actor,
      atmospheres: asked.atmospheres,
      support: asked.support,
    });
  }

  /** A sudden acceleration (Campaigns p. 434). */
  static async #onAcceleration(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForAcceleration();
    if (!asked) return;
    await accelerate({ actor: this.actor, ...asked });
  }

  /** A day at sea, or the first hour of free fall (Campaigns pp. 434, 436). */
  static async #onMotionSickness(this: GWorldCharacterSheet) {
    if (!isRuleOn("exposure")) return;
    const asked = await promptForMotionSickness();
    if (!asked) return;
    await motionSickness({ actor: this.actor, ...asked });
  }

  /** Where a shot at this vehicle landed, and who inside it caught something (Campaigns pp. 554-555). */
  static async #onShotAtVehicle(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("vehicles")) return;
    const item = this.#itemFrom(target);
    if (!item) return;
    const asked = await promptForVehicleHit();
    if (!asked) return;
    await shootAtVehicle({ actor: this.actor, vehicle: item, ...asked });
  }

  /** A control roll for the vehicle on this row (Campaigns p. 466). */
  static async #onControlVehicle(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("vehicles")) return;
    const item = this.#itemFrom(target);
    if (!item) return;
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Hazard.Control"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;
    await controlVehicle({ actor: this.actor, vehicle: item, modifier });
  }

  /** Jumping or falling from a moving vehicle (Campaigns p. 467). */
  static async #onJumpOutOfVehicle(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("vehicleManeuvers")) return;
    const item = this.#itemFrom(target);
    if (!item) return;
    // The vehicle's top speed is what the sheet knows; how fast it was
    // actually going is the table's to say.
    const speed = await promptForNumber({
      title: game.i18n.localize("GWORLD.Hazard.JumpOut"),
      label: game.i18n.localize("GWORLD.Hazard.JumpSpeed"),
      initial: Math.round(Number(item.system?.vehicle?.topSpeed) || 0),
    });
    if (speed === null) return;
    await jumpOutOfVehicle({ actor: this.actor, vehicle: item, speed });
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
