/**
 * What the character sheet does, apart from how it is laid out.
 *
 * Every action -- a roll, a grapple, a hazard, an award -- and the context the
 * sheet's sections are drawn from. The layout, its tabs and its view state
 * are GWorldCharacterSheetV2's, which extends this class and is the sheet
 * that is registered; this one is never opened on its own. It keeps its name
 * so the `renderGWorldCharacterSheet` hook a module listens to still fires.
 */

import { clearZenShot, rollZenSkill, zenSkillsOf } from "../zen.js";
import { chooseTechniqueSkill, isOpenTechniqueData } from "../open-techniques.js";
import { customItemData, customKindKey } from "../picker-merge.js";
import { rememberFocus, restoreFocus, type RememberedFocus } from "../focus-memory.js";
import { techniqueDefaultLabel } from "../item-summary.js";
import { CharacterBuilder } from "../apps/character-builder.js";
import { combatStyle } from "../settings.js";
import { activeRules, isRuleOn } from "../optional-rules.js";
import { mayRaiseToSuppress } from "../suppression-fire.js";
import { legalityClassOf, legalityNote } from "../legality.js";
import { currentTemperature, dayWeather, setTemperature } from "../weather.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  evadeModifier,
  opportunityFirePenalty,
} from "../../rules/attack-options.js";
import { slamOrShove } from "../slam.js";
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
import { crippledParts, healCrippled } from "../crippling.js";
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
import { monthlyPay } from "../../rules/wealth.js";
import { parseDiceAdds } from "../../rules/dice.js";
import { aimableLocations, locationsOf } from "../../rules/vehicle-combat.js";
import {
  payCostOfLiving,
  rollAging,
  studySkill,
  workAMonth,
  adjustCash,
  jobRollLevel,
  JOB_ATTRIBUTES,
} from "../life.js";
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
import { breakFreeFromBinding, checkBottles, throwMolotov, tryToEscape, type Entanglement } from "../entangling.js";
import { useTechnique } from "../unarmed-techniques.js";
import { resolveSuccess as rollOutcome } from "../../rules/success.js";
import { isStepPostureChange, reachablePostures } from "../../rules/posture.js";
import { affectsSecondary } from "../../rules/attribute-penalties.js";
import { canMoveWhileGrappled } from "../../rules/grappling.js";
import { rollInvention } from "../invention.js";
import { describePowers, unpoweredAbilities } from "../psionics.js";
import { stimulantWearsOff, takeDepressant, takeStimulant, withdrawalRoll } from "../drugs.js";
import { attendPatient, operate, resuscitate } from "../recovery.js";
import {
  stayAwake,
  struckBy,
} from "../hazards.js";
import type { DamageType } from "../../rules/types.js";
import type { HitLocation } from "../../rules/hit-locations.js";
import { wornDrAt } from "../../rules/armor.js";
import { flyingTurn, rollPushingTheEnvelope, rollStayOn } from "../mounted.js";
import { rollThrow } from "../throwing.js";
import { summariseDescription } from "../description-summary.js";
import {
  applyTemplateToActor,
  confirmAndRemoveTemplate,
  templateFromItem,
} from "../character-templates.js";
import { INFLUENCE_SKILLS } from "../../rules/reactions.js";
import { reactionProfile } from "../sheet-v2/reactions.js";
import { rollDisarm } from "../disarm.js";
import { rollStrikeToBreak, weaponTargetsFor } from "../weapon-damage.js";
import { buyAmmunition, chooseAndLoad, reloadWeapon } from "../ammunition.js";
import { clearMalfunction } from "../malfunctions.js";
import { freeStuckWeapon, letGoOfStuckWeapon, setStuckWeapon } from "../picks.js";
import { buyMore } from "../shopping.js";
import { clothingCost } from "../../rules/wealth.js";
import {
  beginGrapple,
  endGrapple,
  grapplingSkill,
  grappleOf,
  grapplesOf,
  rollBreakFree,
  rollChoke,
  rollPin,
  rollTakedown,
} from "../grappling.js";
import { grappleSizeBonus } from "../../rules/size.js";
import { rollStunRecovery } from "../knockdown.js";
import { applyFirstAid, regenerate, restForADay, restForFatigue, tryToWake } from "../recovery.js";
import { isFrightResistance, rollFrightCheck, rollFrightCheckOutcome } from "../fright.js";
import { drMetByAttack, traitsOf, wornArmor } from "../damage.js";
import { afflictionDrBonus } from "../../rules/affliction-resistance.js";
import { applyAfflictionEffects } from "../afflictions.js";
import { feintDefenseScore, recordFeint } from "../feint.js";
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
  runSpellAction,
  strikeWithMelee,
  throwMissile,
} from "../held-spells.js";
import { castFromItem, enchantItem } from "../enchanting.js";
import { type MagicStyle } from "../../rules/magic.js";
import { GEAR_GROUPS, gearGroupOf } from "../gear-groups.js";
import { ENCUMBRANCE_TIERS, encumberedMove } from "../../rules/encumbrance.js";
import {
  BASIC_SPEED_STEP,
  basicSpeedPointCost,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { MANEUVER_ORDER } from "../../rules/maneuvers.js";
import { allOutAttackOptionsFor, feintModifiers, registeredHitLocation, registeredManeuvers } from "../combat-extensions.js";
import { evaluateBonusFor } from "../evaluate.js";
import { setCondition } from "../conditions.js";
import { bindSectionListeners, decorateItemRows, renderSections, runRowAction } from "../sheet-extensions.js";
import { byName, sortedByName } from "../sort.js";
import { clampedLevels, steppedLevels, steppedPoints, type StepDirection } from "../advancement.js";
import {
  activeConditions,
  recoveryHold,
  attackSequenceFor,
  chooseManeuverOption,
  feintResultRecorded,
  grappleActionsFor,
  maneuverOptionControl,
  maneuverOptionsFor,
  removeCondition,
  runGrappleAction,
  triggerManeuverResponse,
  firstAidRules,
  registeredInfluenceSkills,
  wornClothing,
} from "../procedure-extensions.js";
import { normalizeSkillName } from "../../rules/skills.js";
import { effectiveCost, effectiveWeight, itemSectionsFor, registeredItemType, runItemTypeAction, tabHasAddonSections } from "../data-extensions.js";
import { registeredTabsShownOn } from "../sheet-tabs.js";
import { openCampaignTerms } from "../campaign.js";
import { DRESS_STATES } from "../../rules/cinematic.js";
import { awardsNewestFirst, nextSessionLabel, type PointAward } from "../../rules/character-points.js";
import { exposeToWeakness } from "../weakness.js";
import { requestGuidance } from "../bonus-points.js";
import { activeSpellActionsFor, anyPointPools, registeredPointPools } from "../roll-extensions.js";
import { SENSES } from "../../rules/senses.js";
import {
  handleDamageAction,
  handleRollAction,
  promptForNumber,
  beyondHalfDamage,
  yardsBetween,
  rollSuccess,
} from "../roll.js";
import { currentTargets, targetedTokens } from "../targets.js";
import type { Attribute, Posture } from "../../rules/types.js";

import {
  approachTo,
  promptForExtraEffort,
  safeAvailable,
  numberOr,
  promptForFall,
  promptForWeather,
  promptForRations,
  promptForPoison,
  promptForTreatment,
  promptForDrinks,
  promptForDisease,
  promptForInfection,
  promptForScatter,
  promptForOverpenetration,
  promptForHearing,
  promptForAlight,
  promptForSplash,
  socialBackgroundOf,
  promptForReaction,
  promptForStudy,
  hazardField,
  hazardCheck,
  hazardPrompt,
  num,
  ticked,
  onePatient,
  promptForSurgery,
  promptForResuscitation,
  promptForEscape,
  promptForTechnique,
  promptForInvention,
  promptForDepressant,
  promptForWithdrawal,
  promptForMolotov,
  promptForBuilding,
  promptForCollapse,
  promptForAcid,
  promptForAir,
  promptForPressure,
  promptForAcceleration,
  promptForMotionSickness,
  promptForStayingUp,
  promptForHike,
  promptForCollision,
  promptForShock,
  promptForFire,
  promptForCatchingFire,
  promptForRadiation,
  vehicleNotes,
  promptForTrample,
  promptForFightingOffSwarm,
  promptForVehicleHit,
  promptForInfluence,
  promptForStayOn,
  promptForFlying,
  promptForEnvelope,
  promptForPenalties,
  chooseTemplateOptions,
  pickTemplateItem,
  promptForAward,
  promptForDisarm,
  promptForGrapple,
  promptForRest,
  promptForChoice,
  promptForContest,
  resistanceScore,
  toCard,
  describeModes,
} from "./character-prompts.js";
import { reportRefusedDrop } from "./drop-errors.js";
import { templateGrants } from "../sheet-v2/template-grants.js";
import { boughtForScore } from "../sheet-v2/builder-attributes.js";
export { chooseTemplateOptions, pickTemplateItem } from "./character-prompts.js";
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
 * What a job can be rolled against (Campaigns p. 516): the character's
 * skills at their levels, then the attributes. The job's current choice is
 * kept even when the character no longer has that skill.
 */
export function jobSkillOptions(actor: any): Array<{ value: string; label: string; selected: boolean; group: string }> {
  const current = String(actor?.system?.job?.skill ?? "");
  const skills = [...(actor?.items ?? [])]
    .filter((item: any) => item.type === "skill")
    .map((item: any) => ({ name: String(item.name), level: item.system?.derived?.level }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const options: Array<{ value: string; label: string; selected: boolean; group: string }> = [];
  for (const skill of skills) {
    options.push({ value: skill.name, label: typeof skill.level === "number" ? `${skill.name}-${skill.level}` : skill.name, selected: skill.name === current, group: "skill" });
  }
  const derived = actor?.system?.derived ?? {};
  for (const key of JOB_ATTRIBUTES) {
    const value = key === "Will" ? derived.will : key === "Per" ? derived.per : derived.attributes?.[key];
    options.push({ value: key, label: typeof value === "number" ? `${key} ${value}` : key, selected: key === current, group: "attribute" });
  }
  if (current && !options.some((o) => o.selected)) {
    options.unshift({ value: current, label: game.i18n.format("GWORLD.Life.JobSkillMissing", { skill: current }), selected: true, group: "skill" });
  }
  return options;
}

/** The month's money in and out (Characters pp. 26, 265; Campaigns p. 517). */
export function monthlyBudget(wealth: Record<string, any>): { lines: Array<{ label: string; amount: string; good: boolean }>; net: number; netText: string } {
  const lines: Array<{ label: string; amount: string; good: boolean }> = [];
  const add = (key: string, value: number, sign: 1 | -1) => {
    if (!value) return;
    lines.push({ label: game.i18n.localize(key), amount: `${sign > 0 ? "+" : "-"}$${value}`, good: sign > 0 });
  };
  const pay = Number(wealth.jobPay) || 0;
  const income = Number(wealth.independentIncome) || 0;
  const living = Number(wealth.costOfLiving) || 0;
  const debt = Number(wealth.debt) || 0;
  add("GWORLD.Life.BudgetJob", pay, 1);
  add("GWORLD.Life.BudgetIncome", income, 1);
  add("GWORLD.Life.CostOfLiving", living, -1);
  add("GWORLD.Life.BudgetDebt", debt, -1);
  const net = pay + income - living - debt;
  return { lines, net, netText: `${net < 0 ? "-" : "+"}$${Math.abs(net)}` };
}

/** How long a condition's recovery rolls are held, for its chip (since API 1.89.0); blank where they are not. */
function heldFor(actor: any, id: string): string {
  const held = recoveryHold(actor, id);
  if (!held) return "";
  if (held.until === null) return game.i18n.localize("GWORLD.Condition.RecoveryHeld");
  const seconds = Math.max(0, Math.ceil(held.until - (Number((game as any).time?.worldTime) || 0)));
  return game.i18n.format("GWORLD.Condition.RecoveryHeldFor", { seconds });
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
      addonItemAction: GWorldCharacterSheet.#onAddonItemAction,
      addonRowAction: GWorldCharacterSheet.#onAddonRowAction,
      activeSpellAction: GWorldCharacterSheet.#onActiveSpellAction,
      maneuverResponse: GWorldCharacterSheet.#onManeuverResponse,
      grappleAction: GWorldCharacterSheet.#onGrappleAction,
      removeTimedCondition: GWorldCharacterSheet.#onRemoveTimedCondition,
      rollZen: GWorldCharacterSheet.#onRollZen,
      clearZen: GWorldCharacterSheet.#onClearZen,
      browseCompendium: GWorldCharacterSheet.#onBrowseCompendium,
      openBuilder: GWorldCharacterSheet.#onOpenBuilder,
      awardPoints: GWorldCharacterSheet.#onAwardPoints,
      openCampaign: GWorldCharacterSheet.#onOpenCampaign,
      deleteAward: GWorldCharacterSheet.#onDeleteAward,
      slam: GWorldCharacterSheet.#onSlam,
      shove: GWorldCharacterSheet.#onShove,
      affliction: GWorldCharacterSheet.#onAffliction,
      weaknessExposure: GWorldCharacterSheet.#onWeaknessExposure,
      selfControlRoll: GWorldCharacterSheet.#onSelfControlRoll,
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
      healCrippled: GWorldCharacterSheet.#onHealCrippled,
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
      stepField: GWorldCharacterSheet.#onStepField,
      editItem: GWorldCharacterSheet.#onEditItem,
      chooseTechniqueSkill: GWorldCharacterSheet.#onChooseTechniqueSkill,
      showSummary: GWorldCharacterSheet.#onShowSummary,
      deleteItem: GWorldCharacterSheet.#onDeleteItem,
      toggleEquipped: GWorldCharacterSheet.#onToggleEquipped,
      toggleSkillOrder: GWorldCharacterSheet.#onToggleSkillOrder,
      readyWeapon: GWorldCharacterSheet.#onReadyWeapon,
      reloadWeapon: GWorldCharacterSheet.#onReloadWeapon,
      clearMalfunction: GWorldCharacterSheet.#onClearMalfunction,
      freeStuckWeapon: GWorldCharacterSheet.#onFreeStuckWeapon,
      letGoOfStuckWeapon: GWorldCharacterSheet.#onLetGoOfStuckWeapon,
      retrieveStuckWeapon: GWorldCharacterSheet.#onRetrieveStuckWeapon,
      loadAmmunition: GWorldCharacterSheet.#onLoadAmmunition,
      buyAmmunition: GWorldCharacterSheet.#onBuyAmmunition,
      buyItem: GWorldCharacterSheet.#onBuyItem,
      regenerate: GWorldCharacterSheet.#onRegenerate,
      study: GWorldCharacterSheet.#onStudy,
      workMonth: GWorldCharacterSheet.#onWorkMonth,
      payLiving: GWorldCharacterSheet.#onPayLiving,
      adjustCash: GWorldCharacterSheet.#onAdjustCash,
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
      jumpOutOfVehicle: GWorldCharacterSheet.#onJumpOutOfVehicle,
      shotAtVehicle: GWorldCharacterSheet.#onShotAtVehicle,
      trample: GWorldCharacterSheet.#onTrample,
      fightOffSwarm: GWorldCharacterSheet.#onFightOffSwarm,
      castSpell: GWorldCharacterSheet.#onCastSpell,
      requestGuidance: GWorldCharacterSheet.#onRequestGuidance,
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
  #templateReferences = new Map<string, string>();
  #templateStatedCosts = new Map<string, number | null>();

  /**
   * What an applied template gave the character, as lines each with its price
   * -- the scores it set or granted, and the items it added or raised that are
   * still on the sheet -- and what it all came to (#631).
   */
  #templateGrants(record: any): { lines: string[]; total: number; asWritten: number } {
    const label = (key: string) => {
      const known: Record<string, string> = { hp: "HP", fp: "FP", will: "Will", per: "Per", basicSpeed: "Basic Speed", basicMove: "Basic Move", sm: "SM" };
      return known[key] ?? key;
    };
    const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
    // Stored as paths ("attributes.ST"), which Foundry keeps nested.
    const grants = templateGrants(
      {
        ...record,
        written: foundry.utils.flattenObject(record?.written ?? {}),
        previous: foundry.utils.flattenObject(record?.previous ?? {}),
      },
      (id) => {
        const item = this.actor.items.get(id);
        if (!item) return undefined;
        const system = item.system ?? {};
        return {
          name: String(item.name),
          total: system.totalPoints ?? system.points,
          points: system.points,
          levels: system.levels,
          pointsPerLevel: system.pointsPerLevel,
        };
      },
    );
    const lines = grants.lines.map((line) => {
      const price = line.cost === null ? "" : ` [${line.cost}]`;
      switch (line.kind) {
        case "attribute":
        case "secondary":
          return `${label(line.key ?? "")} ${line.score ?? signed(line.change ?? 0)}${price}`;
        case "modifiers":
          return `${game.i18n.localize("GWORLD.Template.ModifiersLine")}${price}`;
        case "raised":
          return `${game.i18n.format("GWORLD.Template.RaisedLine", { name: line.name ?? "" })}${price}`;
        default:
          return `${line.name ?? ""}${price}`;
      }
    });
    return { lines, total: grants.total, asWritten: grants.asWritten };
  }

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
          this.#templateReferences.set(uuid, String((document as any)?.system?.reference ?? ""));
          const stated = Number((document as any)?.system?.statedCost);
          this.#templateStatedCosts.set(uuid, document && Number.isFinite(stated) ? stated : null);
        }
        html = this.#templateDescriptions.get(uuid) ?? "";
      }
      const key = `template:${index}:${uuid}`;
      const grants = this.#templateGrants(record);
      // What the template says it costs, beside what it came to, so the two
      // can be checked against each other. A character template taken on top
      // of another is combined with it (p. 259) and was never going to cost
      // what it says on its own, so it is not compared.
      const statedCost = uuid ? this.#templateStatedCosts.get(uuid) ?? null : null;
      const stacked = record?.kind === "character" &&
        applied.slice(0, index).some((earlier) => earlier?.kind === "character");
      rows.push({
        ...record,
        index,
        grants: grants.lines,
        total: grants.total,
        statedCost: statedCost !== null && !stacked && statedCost !== grants.asWritten ? statedCost : null,
        reference: String(record?.reference ?? "") || (uuid ? this.#templateReferences.get(uuid) ?? "" : ""),
        descriptionHtml: html,
        descriptionKey: key,
        description: { ...summariseDescription(html), open: this.#openDescriptions.has(key) },
      });
    }
    // Each row keeps the index it is stored at, which removing it addresses.
    return rows.sort(byName);
  }

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
    if (!isRuleOn("magic") && !tabHasAddonSections(this.actor, "magic")) delete parts.magic;
    return parts;
  }

  /**
   * The attribute boxes carry the score the character has, under
   * `attributeScore.<KEY>`; what is stored is the bought figure, which moves
   * by as much as the score was moved (#631).
   */
  override _processFormData(event: Event | null, form: HTMLFormElement, formData: object): object {
    const data = super._processFormData(event, form, formData) as Record<string, any>;
    const scores = data.attributeScore;
    delete data.attributeScore;
    if (scores && typeof scores === "object") {
      const system = this.actor.system;
      for (const key of ATTRIBUTE_KEYS) {
        if (!(key in scores)) continue;
        const bought = boughtForScore({
          entered: scores[key],
          bought: system.attributes?.[key],
          score: system.derived?.attributes?.[key],
        });
        if (bought === null) continue;
        data.system ??= {};
        data.system.attributes ??= {};
        data.system.attributes[key] = bought;
      }
    }
    return data;
  }

  override _prepareTabs(group: string): Record<string, any> {
    const tabs = super._prepareTabs(group) as Record<string, any>;
    // The tab is the Basic Set's spells, or what an add-on module shows there.
    if (group === "primary" && !isRuleOn("magic") && !tabHasAddonSections(this.actor, "magic")) delete tabs.magic;
    return tabs;
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = this.actor;
    const system = actor.system;
    const derived = system.derived;
    const items = this.groupItems();

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

    const appliedTemplates = await this.#appliedTemplateRows(derived.templates ?? []);

    return {
      ...context,
      actor,
      system,
      derived,
      items,
      appliedTemplates,
      // The levels a language is known at, for its row's two selects (p. 24).
      comprehensionLevels: Object.fromEntries(
        ["none", "broken", "accented", "native"].map((level) => [level, `GWORLD.Language.${level}`]),
      ),
      // What the templates came to, row by row, for the section's heading.
      templatesTotal: appliedTemplates.reduce((sum: number, row: any) => sum + (Number(row.total) || 0), 0),
      torsoDr: torso ?? null,
      editable: this.isEditable,
      limited: actor.limited,
      isOwner: actor.isOwner,
      isGM: game.user?.isGM === true,
      // Spending points on outcomes, and the pools add-on modules registered for it.
      pointSpending: {
        inPlay: anyPointPools(),
        pools: registeredPointPools(actor, "buySuccess"),
      },
      // Controls edited in place carry ids built from this, so the redraw
      // that follows every edit can put focus back where it was.
      sheetId: this.id,

      // The box shows the score the character has; the bought figure the
      // ledger bills, and what traits and a racial template add, are the
      // breakdown beneath it (#585, #631). Typing a score moves the bought
      // figure by the same amount -- see _processFormData.
      attributeCards: ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Attribute.${key}`),
        value: system.attributes[key],
        effective: derived.attributes?.[key] ?? system.attributes[key],
        raised: (derived.attributes?.[key] ?? system.attributes[key]) !== system.attributes[key],
        bonus: derived.attributeBonuses?.[key] ?? 0,
        // What a racial template granted (Characters p. 261), unbilled.
        racial: Number(system.racial?.[key]) || 0,
        // What add-on modules add, each with its label.
        addonLines: (derived.extensionBonuses?.attributes ?? []).filter((line: { attribute: string }) => line.attribute === key),
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
      // "Final effective weight pulled, after all modifiers, cannot exceed
      // 15xBL" (Campaigns p. 353).
      maxDrag: maximumDrag(Number(derived.basicLift) || 0),

      hands: (["right", "left"] as const).map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Tactical.${key}`),
        selected: (system.handedness ?? "right") === key,
      })),

      secondaryCells: this.secondaryCells(system, derived),
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
      maneuvers: [
        ...MANEUVER_ORDER.map((key) => ({
          key,
          label: game.i18n.localize(`GWORLD.Maneuver.${key}`),
          selected: system.maneuver === key,
        })),
        // A module's maneuvers, where it offers them to this character -- and
        // the one they are on, even if it no longer would, so the select says
        // what is actually stored.
        ...registeredManeuvers()
          .filter((m) => system.maneuver === m.key || safeAvailable(() => m.available(this.actor)))
          .map((m) => ({ key: m.key, label: game.i18n.localize(m.label), selected: system.maneuver === m.key })),
      ],
      // Options modules offer on the system's maneuvers, drawn as their controls.
      addonManeuverOptions: maneuverOptionsFor(actor).map((o) => ({ ...o, control: maneuverOptionControl(o, this.isEditable) })),
      // How many attacks the maneuver yields this turn, where a module made it more than one.
      attackSequence: (() => {
        const sequence = attackSequenceFor(actor);
        return { ...sequence, shown: sequence.count > 1 };
      })(),
      // Timed conditions, with what they do and how long is left.
      timedConditions: activeConditions(actor).map((c) => ({
        id: c.id,
        label: c.label,
        effects: c.modifiers.map((m) => `${m.value >= 0 ? "+" : ""}${m.value} ${m.label}`).join(", "),
        remaining: c.turnsLeft !== null
          ? game.i18n.format("GWORLD.Condition.TurnsLeft", { turns: c.turnsLeft })
          : c.untilRound !== null
            ? game.i18n.format("GWORLD.Condition.UntilRound", { round: c.untilRound })
            : c.untilTime !== null
              ? game.i18n.format("GWORLD.Condition.SecondsLeft", { seconds: Math.max(0, Math.round(c.untilTime - (Number((game as any).time?.worldTime) || 0))) })
              : heldFor(actor, c.id),
      })),
      // The choice a module's maneuver asks for, where it asks for one.
      maneuverOptions: (registeredManeuvers().find((m) => m.key === system.maneuver)?.options ?? []).map((o) => ({
        key: o.key,
        label: game.i18n.localize(o.label),
        selected: system.maneuverOption === o.key,
      })),
      // How much they are wearing, for Bulletproof Nudity (Campaigns p. 417).
      dressStates: DRESS_STATES.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Cinematic.DressState.${key}`),
        selected: (system.dress?.state ?? "clothed") === key,
      })),
      // The powers, ready to read: the book's name for each, what its Talent
      // is worth, whether this is a latent, and what a roll to use it is
      // against (Characters pp. 254-255).
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
      // Parts crippled for a while (Campaigns p. 422; API 1.114.0), healed ones left out.
      crippled: crippledParts(this.actor).map((part) => ({
        id: part.id,
        label: part.label || (registeredHitLocation(part.location)
          ? game.i18n.localize(registeredHitLocation(part.location)!.label)
          : game.i18n.localize(`GWORLD.HitLocation.${part.location}`)),
        duration: game.i18n.localize(`GWORLD.Dying.${part.duration}`),
        heals: part.healsAt !== null
          ? game.i18n.format("GWORLD.Crippled.HealsIn", { days: Math.max(0, Math.ceil((part.healsAt - (Number(game.time?.worldTime) || 0)) / 86400)) })
          : "",
      })),
      // Caught in something, and how far through getting out they are.
      entangled: {
        caught: this.actor.statuses?.has?.("entangled") === true,
        kind: system.entangled?.kind ?? "",
        successes: system.entangled?.successes ?? 0,
        needed: 3,
        mustBeCut: system.entangled?.mustBeCut === true,
        // A Binding is one Quick Contest against its ST, not a tally (Characters p. 40).
        binding: system.entangled?.kind === "binding"
          ? { st: Number(system.entangled.st) || 0, label: String(system.entangled.label || game.i18n.localize("GWORLD.Entangled.What.binding")) }
          : null,
      },
      // Shown while evaluating, and on the turn after, when the bonus is spent.
      isEvaluating: system.maneuver === "evaluate" || Number(system.evaluateTurns ?? 0) > 0,
      isAiming: system.maneuver === "aim",
      // Shown while concentrating, and on the turn after, when a zen skill is rolled.
      isConcentrating: system.maneuver === "concentrate" || Number(system.concentrateTurns ?? 0) > 0,
      // The zen skills known (Characters p. 228): each rolled from here, at
      // what the turns concentrated give it, and said to be ready once it succeeds.
      zenSkills: zenSkillsOf(this.actor).map((zen) => ({
        id: zen.id, skill: zen.skill, level: zen.level, modifier: zen.modifier, ready: zen.ready, covers: zen.covers.join(", "),
      })),
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
      grappledCannotMove: grapplesOf(this.actor).some((grapple) => {
        if (grapple.holding) return false;
        const foe: any = fromUuidSync(grapple.foe);
        if (!foe) return false;
        return !canMoveWhileGrappled(
          Number(system.attributes?.ST ?? 10) || 10,
          Number(foe.system?.attributes?.ST ?? 10) || 10,
        );
      }),
      aoaOptions: [
        ...(["determined", "double", "feint", "strong", "suppression"] as const)
          // Suppression Fire wants a weapon of RoF 5+ (Campaigns p. 409), or one
          // a module's attack option may raise to it (since 1.83.0); it
          // stays listed where it is already chosen.
          .filter((key) => key !== "suppression" || system.allOutAttackOption === "suppression" ||
            (isRuleOn("rapidFire") && (system.derived?.ranged ?? []).some((row: any) => mayRaiseToSuppress(actor, actor.items?.get?.(row.itemId) ?? null, row))))
          .map((key) => ({
            key,
            label: `GWORLD.Maneuver.AllOutAttackOption.${key}`,
          })),
        // And any a module offers this fighter.
        ...allOutAttackOptionsFor(actor),
      ].map((o) => ({ ...o, selected: (system.allOutAttackOption ?? "determined") === o.key })),
      aodIncreased: system.allOutDefenseOption === "increased",
      aodTargets: (["dodge", "parry", "block"] as const).map((key) => ({
        key,
        label: `GWORLD.Secondary.${key === "dodge" ? "Dodge" : key === "parry" ? "Parry" : "Block"}`,
        selected: system.allOutDefenseTarget === key,
      })),

      // The templates section follows the three trait groups on the same tab,
      // so its number follows theirs rather than being written twice.
      templateSectionNum: "04",

      // What the character has without having bought it: a sealed suit, a
      // filtered mask, whatever a module grants. Each says what granted it,
      // so an effect nobody paid for is never unexplained.
      grantedEffects: (derived.traitEffectSources ?? []).map(
        (line: { effect: string; label: string; value?: number }) => {
          // A module may grant an effect the system has no name for, and
          // Foundry hands a missing key back unchanged. Showing the key is
          // worse than showing the effect as the module spelled it.
          const key = `GWORLD.Granted.${line.effect}`;
          const name = game.i18n.localize(key);
          return {
            label: line.label,
            name: name === key ? line.effect : name,
            value: typeof line.value === "number" ? line.value : null,
          };
        },
      ),

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
      // Every grapple this character is in (since 1.45.0), each with its own
      // buttons: what a grapple allows is entirely different depending on which
      // end of it they are, and a fighter can be at both ends at once.
      grapples: grapplesOf(this.actor).map((held) => ({
        foe: held.foe,
        foeName: String((fromUuidSync(held.foe) as any)?.name ?? ""),
        holding: held.holding,
        pinned: held.pinned,
        hands: held.hands,
        byTheNeck: held.hitLocation === "neck",
        actions: grappleActionsFor(this.actor, held),
      })),

      // Tactical combat, when the world is using it. Movement points are the
      // character's Move after encumbrance, and what each hex costs depends on
      // the direction travelled and the posture held.
      tactical: tacticalPanel(system, derived),

      // What people make of this character before anybody rolls: the social
      // traits added up, and the conditional ones named. The same sources the
      // reaction dialog offers.
      reactionProfile: reactionProfile(derived.reactions ?? []),

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
      // The levels of Wealth a job can pay at (Campaigns p. 517), with what each pays here.
      jobLevels: (["poor", "struggling", "average", "comfortable", "wealthy", "veryWealthy", "filthyRich"] as const).map((key) => ({
        key,
        label: game.i18n.format("GWORLD.Life.JobLevelPays", {
          level: game.i18n.localize(`GWORLD.Life.Wealth.${key}`),
          amount: monthlyPay(Number(system.tl) || 0, key),
        }),
        selected: (system.job?.level ?? "average") === key,
      })),
      // What the job can be rolled against: the character's skills, at their
      // levels, then the attributes, for work that needs no skill.
      jobSkills: jobSkillOptions(this.actor),
      // The month's money: what comes in and what goes out.
      monthlyBudget: monthlyBudget(derived.wealth ?? {}),

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

      encumbranceTiers: this.encumbranceTiers(derived),
      gearGroups: this.gearGroups(items),

      magic: this.magicPanel(derived, items.spellGroups, system.activeSpells ?? []),

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
  /**
   * Where the focus was when this render started.
   *
   * The sheet submits on change, so an edited attribute re-renders the sheet
   * and the render replaces whatever `Tab` has just moved to. Protected rather
   * than private so GWorldCharacterSheetV2, which extends this one, shares it.
   */
  protected focusMemory: RememberedFocus | null = null;

  override async _preRender(context: object, options: object): Promise<void> {
    await super._preRender(context, options);
    // Read before the DOM is replaced, and deliberately whatever is focused
    // now rather than whatever was edited: on `Tab` the browser has already
    // moved to the next field, and that is the one to land on.
    this.focusMemory = rememberFocus(this.element, document.activeElement);
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    // Put the caret back where the render took it from, unless the player has
    // since started typing somewhere else.
    restoreFocus(this.element, this.focusMemory, {
      active: document.activeElement,
      body: document.body,
    });
    this.focusMemory = null;

    // What add-on modules put on the sheet: their sections' listeners and
    // their buttons on item rows, for whoever owns the character.
    bindSectionListeners(this.element, this.actor, this);
    decorateItemRows(this.element, this.actor);
    // A module's maneuver option is saved as it is chosen, outside the form.
    for (const control of this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-maneuver-option]")) {
      control.addEventListener("change", () => {
        const value = control instanceof HTMLInputElement && control.type === "checkbox"
          ? control.checked
          : control instanceof HTMLInputElement && control.type === "number"
            ? Number(control.value) || 0
            : control.value;
        void chooseManeuverOption(this.actor, String(control.dataset.maneuverOption), value);
      });
    }

    // Points and levels are edited in place. They are the numbers a character
    // is actually built out of, and having to open each item's own sheet to
    // change one made spending points a chore rather than the point.
    //
    // Registered before the skill filter, which returns early on tabs that do
    // not have one.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-field]")) {
      input.addEventListener("change", () => {
        const item = this.itemFrom(input);
        const field = input.dataset.itemField;
        if (!item || !field) return;

        // Levels stop where the book stops, typed as well as stepped: the
        // buttons already refuse to pass the cap, and the box must too.
        if (field === "system.levels") {
          const next = clampedLevels(item, input.value);
          if (next === Number(item.system?.levels ?? 0)) void this.render();
          else void item.update({ [field]: next });
          return;
        }

        const value = Math.round(Number(input.value));
        if (input.value.trim() === "" || !Number.isFinite(value)) {
          // A field cleared or typed into nonsense is put back rather than
          // written, so a stray keystroke cannot silently zero a skill.
          // Number("") is 0, so the blank is checked on its own.
          void this.render();
          return;
        }
        void item.update({ [field]: Math.max(0, value) });
      });
    }

    // A language's levels, and whether it is the native one, set in its row
    // rather than on its own sheet (#635).
    for (const select of this.element.querySelectorAll<HTMLSelectElement>("select[data-item-choice]")) {
      select.addEventListener("change", () => {
        const item = this.itemFrom(select);
        const field = select.dataset.itemChoice;
        if (item && field) void item.update({ [field]: select.value });
      });
    }
    for (const box of this.element.querySelectorAll<HTMLInputElement>("input[data-item-flag]")) {
      box.addEventListener("change", () => {
        const item = this.itemFrom(box);
        const field = box.dataset.itemFlag;
        if (item && field) void item.update({ [field]: box.checked });
      });
    }

    // A name the player writes in the row: a quirk's or a perk's, a custom
    // trait's, or a language's. Blank is not a name, so an emptied field is put back.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-text]")) {
      input.addEventListener("change", () => {
        const item = this.itemFrom(input);
        const field = input.dataset.itemText;
        if (!item || !field) return;
        const value = input.value.trim();
        if (!value && field === "name") {
          void this.render();
          return;
        }
        void item.update({ [field]: value });
      });
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
    this.wireFilter(".gworld-spell-filter", "magic");

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
  protected wireFilter(selector: string, tab: string): void {
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
  protected magicPanel(derived: any, groups: ReturnType<typeof groupSpells<any>>, activeSpells: any[]) {
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
        // What add-on modules offer for a spell still going.
        addonActions: activeSpellActionsFor(this.actor, spell),
      })),
    };
  }

  /** Casts the spell whose row was clicked (Characters pp. 235-239). */
  static async #onCastSpell(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (item) await castSpell(this.actor, item);
  }

  /** Asks the GM for a piece of player guidance (Campaigns p. 347). */
  static async #onRequestGuidance(this: GWorldCharacterSheet) {
    await requestGuidance(this.actor);
  }

  #activeSpellId(target: HTMLElement): string | null {
    return target.closest<HTMLElement>("[data-spell-id]")?.dataset.spellId ?? null;
  }

  static async #onMaintainSpell(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = this.#activeSpellId(target);
    if (id) await maintainSpell(this.actor, id);
  }

  /** A button an add-on module put on a running spell's row. */
  static async #onActiveSpellAction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = this.#activeSpellId(target);
    const action = target.dataset.activeSpellAction;
    if (id && action) await runSpellAction(this.actor, id, action);
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
    const item = this.itemFrom(target);
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
    // The lists of item types add-on modules registered for this tab, under any
    // of the names that show here, and the sections they registered for it,
    // rendered from their templates.
    const shown = registeredTabsShownOn(partId);
    partContext.addonSections = shown.length ? itemSectionsFor(this.actor, shown) : [];
    partContext.addonSheetSections = shown.length
      ? await renderSections("character", shown, this.actor, this)
      : { start: [], end: [] };
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
  protected secondaryCells(system: any, derived: any) {
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
      // Will and Per are rolled against as often as any attribute, so they
      // carry a die here; the rest are figures, not rolls.
      basedOn: key === "will" ? "Will" : key === "per" ? "Per" : "",
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

  /** The five encumbrance tiers with this character's limits and resulting Move. */
  protected encumbranceTiers(derived: any) {
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
  protected gearGroups(items: { carried: any[]; armor: any[]; shields: any[] }) {
    // Clothing is priced as a share of the wearer's monthly cost of living
    // rather than at a figure of its own (Characters p. 266), so the row
    // shows what it costs this character.
    const status = Number(this.actor.system?.derived?.wealth?.status ?? 0) || 0;
    const priceOf = (item: any): number => {
      const share = Number(item.system?.costOfLivingPercent ?? 0) || 0;
      return share > 0 ? clothingCost(share, status) : effectiveCost(item);
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
      weight: effectiveWeight(item) * (item.system.quantity ?? 1),
      cost: priceOf(item) * (item.system.quantity ?? 1),
      equipped: Boolean(item.system.equipped),
      equippable: equippable || Boolean(item.system.meleeModes?.length || item.system.rangedModes?.length),
      notes: item.system.category === "vehicle" ? vehicleNotes(item) : notes,
      vehicle: item.system.category === "vehicle" && isRuleOn("vehicles"),
      // Its Legality Class, and what carrying it here takes under the
      // campaign's Control Rating (Characters p. 267, Campaigns p. 507).
      legality: legalityNote(legalityClassOf(item)),
    })).sort(byName);

    return GEAR_GROUPS.map((key) => ({
      key,
      label: `GWORLD.Gear.Group.${key}`,
      rows: rows.filter((row) => row.group === key),
    })).filter((group) => group.rows.length > 0);
  }

  /** Splits embedded items into the buckets each tab renders. */
  protected groupItems() {
    const actor = this.actor;
    // Every list is read by name, so everything is handed out in that order.
    const all = sortedByName<any>(actor.items);
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
        // A resolved level of 0 or below is still a valid level, but Handlebars
        // reads it as false, so the template needs an explicit flag.
        .map((t: any) => ({
          item: t,
          resolved: t.system.derived?.level !== null,
          // Written for a kind of skill, and not yet given one.
          open: isOpenTechniqueData(t),
          // The default it is bought off -- the best of several where it has
          // them -- as the book writes it: "Judo Parry-1", "ST-4".
          defaultLabel: techniqueDefaultLabel({
            from: t.system.derived?.defaultFrom ?? t.system.defaultFrom ?? "skill",
            skill: t.system.derived?.defaultSkill ?? t.system.prerequisite ?? "",
            modifier: Number(t.system.derived?.defaultModifier ?? t.system.defaultModifier) || 0,
          }),
        })),
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

  /** Opens where the campaign's terms are set: the settings for the GM, the party for a player. */
  static async #onOpenCampaign(this: GWorldCharacterSheet) {
    await openCampaignTerms(this.actor);
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
    const item = this.itemFrom(target);
    if (!item) return;
    await this.stepPoints(item, target.dataset.step === "down" ? "down" : "up");
  }

  /**
   * Moves an item's points one step up or down its cost table, the one place
   * a stepper on the sheet and the Progression tab's upgrades write from.
   */
  protected async stepPoints(item: any, direction: StepDirection): Promise<void> {
    const current = Number(item.system?.points ?? 0);

    // A technique is not a skill and does not use the Skill Cost Table: it
    // costs a point per level, so stepping it along the table would jump from
    // 2 to 4 and skip a level that can be bought.
    // A wildcard skill walks the same table at three times each figure, so
    // the stepper is told the difficulty rather than assuming the printed one.
    // A spell walks whichever table its style says: the Skill Cost Table for
    // a standard mage, a point at a time for a ritual one (p. 242).
    const next = steppedPoints(item, direction);
    if (next === current) return;

    await item.update({ "system.points": next });
  }

  /**
   * Steps a number box one notch up or down, within the limits the box
   * itself states, and then submits it as if typed: the same path a typed
   * figure takes, so the sheet writes one thing whichever way it moved.
   */
  static #onStepField(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const input = target.parentElement?.querySelector<HTMLInputElement>('input[type="number"]');
    if (!input || input.disabled) return;
    if (target.dataset.step === "down") input.stepDown();
    else input.stepUp();
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
    const item = this.itemFrom(target);
    if (!item) return;
    await this.stepLevels(item, target.dataset.step === "down" ? "down" : "up");
  }

  /** Moves a levelled trait one level up or down, stopping where the book stops. */
  protected async stepLevels(item: any, direction: StepDirection): Promise<void> {
    const next = steppedLevels(item, direction);
    if (next === Number(item.system?.levels ?? 0)) return;

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
      // So a module can tell an evade from other contests (since 1.37.0).
      tags: ["evade"],
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

    // The row the feint was made from, and what a module's rules put on it (API 1.28.0).
    const row = target.closest<HTMLElement>("[data-item-id]");
    const item = row?.dataset.itemId ? this.actor.items.get(row.dataset.itemId) ?? null : null;
    const modeIndex = Number(row?.dataset.modeIndex);
    const ranged = row?.dataset.ranged === "1";
    const mode = row && row.dataset.modeIndex !== undefined && Number.isInteger(modeIndex)
      ? { index: modeIndex, ranged, ...(row.dataset.derivedMode ? { derived: row.dataset.derivedMode } : {}) }
      : null;
    const added = feintModifiers({ actor: this.actor, foe, item, mode, ranged });
    if (added.refusal) {
      ui.notifications?.warn(added.refusal);
      return;
    }
    const evaluated = evaluateBonusFor(this.actor);

    const defense = feintDefenseScore(foe);
    const result = await rollFeint({
      label: game.i18n.format("GWORLD.Feint.Label", {
        weapon: target.dataset.rollLabel ?? "",
        foe: String(foe.name),
      }),
      // A Feint takes what Evaluate maneuvers before it earned (Campaigns p. 364).
      feinter: { actor: this.actor, base, modifiers: [...(evaluated ? [{ label: game.i18n.localize("GWORLD.Maneuver.evaluate"), value: evaluated }] : []), ...added.modifiers] },
      // Naming what they rolled against matters here: the rule lets them roll
      // their best of several things, and the card should say which it was.
      defender: { actor: foe, base: defense.score, note: defense.source },
    });

    // A module may take the result over; otherwise it is the Basic Set's feint.
    const record = feintResultRecorded({ feinter: this.actor, foe, result });
    if (result.success && record) {
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

    // The climb's own modifier and the encumbrance come as lines keyed
    // `climbKind` and `encumbrance`, and the roll is tagged `climbing` and
    // `climb-<kind>`, so gear can find and change them (since API 1.103.0).
    await rollSuccess({
      actor: this.actor,
      base: numberOr(feats?.climbing?.skill, 5),
      label: `${game.i18n.localize("GWORLD.Feats.Climbing")} — ${game.i18n.localize(`GWORLD.Feats.Climb.${chosen}`)} (${speeds})`,
      skill: "Climbing",
      tags: ["climbing", `climb-${chosen}`],
      modifiers: [
        {
          label: game.i18n.localize(`GWORLD.Feats.Climb.${chosen}`),
          value: climbingModifier(chosen, 0),
          key: "climbKind",
        },
        ...(encumbrance > 0
          ? [{ label: game.i18n.localize("GWORLD.Field.Encumbrance"), value: -encumbrance, key: "encumbrance" }]
          : []),
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

    // A module's rules may refuse this, or say a bandage won't stop this bleeding (API 1.36.0).
    const rules = firstAidRules(this.actor, patient);
    if (rules.refusal) {
      ui.notifications?.warn(rules.refusal);
      return;
    }

    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Recovery.FirstAid"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;

    // At the tech level a listener set, where one did (API 1.109.0; Campaigns p. 424).
    const restored = await applyFirstAid({ healer: this.actor, patient, modifier, techLevel: rules.techLevel });

    // "someone who is wounded but receives a successful First Aid roll ... loses
    // no HP to bleeding. A later roll will prevent further HP loss."
    if (restored > 0 && rules.stopsBleeding) await stopBleeding(patient);
    else if (restored > 0 && patient.statuses?.has?.("bleeding")) {
      ui.notifications?.info(game.i18n.format("GWORLD.Recovery.StillBleeding", { patient: String(patient.name ?? "") }));
    }
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
      // Tagged for the modules' modifiers (API 1.35.0).
      tags: ["grapple", String(asked.hitLocation ?? "torso")],
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

    const asked = await promptForDisarm(this.actor, foe);
    if (!asked) return;
    const target = asked.itemId ? weaponTargetsFor(this.actor, foe).find((w) => w.id === asked.itemId) ?? null : null;

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

    if (target && !target.canDisarm) {
      ui.notifications?.warn(game.i18n.format("GWORLD.Disarm.CannotDisarm", { weapon: target.name }));
      return;
    }
    const { fencingWeapon, jitteOrWhip, foeTwoHanded } = asked;
    await rollDisarm({ actor: this.actor, foe, fencingWeapon, jitteOrWhip, foeTwoHanded, target });
  }

  /** Which grapple a button on the grapple panel belongs to (since 1.45.0). */
  static #grappleFoe(target: HTMLElement): string | undefined {
    return target.closest<HTMLElement>("[data-grapple-foe]")?.dataset.grappleFoe ?? undefined;
  }

  /** Tries to get loose (Campaigns p. 371). */
  static async #onBreakFree(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await rollBreakFree({ actor: this.actor, foe: GWorldCharacterSheet.#grappleFoe(target) });
  }

  /** Bears a standing foe to the ground (Campaigns p. 370). */
  static async #onTakedown(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await rollTakedown({ actor: this.actor, foe: GWorldCharacterSheet.#grappleFoe(target) });
  }

  /** Pins a foe already on the ground (Campaigns p. 370). */
  static async #onPin(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await rollPin({ actor: this.actor, foe: GWorldCharacterSheet.#grappleFoe(target) });
  }

  /** Chokes a foe held by the neck (Campaigns p. 370). */
  static async #onChoke(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await rollChoke({ actor: this.actor, foe: GWorldCharacterSheet.#grappleFoe(target) });
  }

  /** Lets go of one foe, which is a free action on your own turn. */
  static async #onRelease(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await endGrapple(this.actor, GWorldCharacterSheet.#grappleFoe(target));
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

    // The rows a miss can scatter from: anything that goes off or covers an
    // area, and anything whose miss is always squared (since API 1.72.0).
    const rows: any[] = [...(this.actor.system?.derived?.ranged ?? []), ...(this.actor.system?.derived?.melee ?? [])];
    const weapons = rows
      .filter((row) => row?.explosive || row?.areaAttack || row?.scatterSquared)
      .map((row) => ({
        label: [row.name, row.mode].filter(Boolean).join(" "),
        fragmentationDice: parseDiceAdds(String(row.fragmentation ?? ""))?.dice ?? 0,
        squared: row.scatterSquared === true,
      }));
    const asked = await promptForScatter(weapons);
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

    // The character's ranged rows, each with whether it refuses to go through
    // (since API 1.73.0).
    const weapons = [...(this.actor.system?.derived?.ranged ?? [])]
      .filter((row: any) => row && !row.affliction)
      .map((row: any) => ({
        label: [row.name, row.mode].filter(Boolean).join(" "),
        damageType: String(row.damageType ?? ""),
        armorDivisor: Number(row.armorDivisor) || 1,
        refused: row.noOverpenetration === true,
        tightBeam: row.tightBeam === true,
      }));
    const asked = await promptForOverpenetration(weapons);
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

    // Whoever is reacting, where one token is targeted: the modules' reaction
    // modifiers may turn on who they are (API 1.76.0).
    const targets = targetedTokens();
    const reactor = targets.length === 1 ? targets[0]?.actor ?? null : null;
    await rollReaction({ actor: this.actor, ...asked, ...(reactor ? { reactor } : {}) });
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
    const skills: Array<{ name: string; level: number; group: "influence" | "other" }> = INFLUENCE_SKILLS.map((name) => ({
      name,
      level: this.actor.system?.derived?.influence?.[name] ?? 4,
      group: "influence" as const,
    }));
    // A module's Influence skills, and any other skill the character has,
    // which the GM may allow "in certain situations" -- Law before a judge --
    // at -1 to -10 for an inappropriate one, which is the modifier's to say
    // (p. 359; since API 1.103.0).
    const listed = new Set(skills.map((s) => normalizeSkillName(s.name)));
    const levelOf = (name: string) => {
      const found = this.actor.items.find((i: any) => i.type === "skill" && normalizeSkillName(String(i.name ?? "")) === normalizeSkillName(name));
      const level = found?.system?.derived?.level;
      return typeof level === "number" ? level : null;
    };
    for (const entry of registeredInfluenceSkills(this.actor, levelOf)) {
      if (listed.has(normalizeSkillName(entry.name))) continue;
      listed.add(normalizeSkillName(entry.name));
      skills.push({ name: entry.name, level: entry.level, group: "influence" });
    }
    const others = this.actor.items
      .filter((i: any) => i.type === "skill" && typeof i.system?.derived?.level === "number" && !listed.has(normalizeSkillName(String(i.name ?? ""))))
      .map((i: any) => ({ name: String(i.name), level: Number(i.system.derived.level), group: "other" as const }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    skills.push(...others);

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
    // A technique for "any Melee Weapon skill" asks which skill it is for
    // before it is made (Characters p. 230). One already on this actor is only
    // being moved, and goes the ordinary way.
    if (item?.type === "technique" && item.parent !== this.actor && isOpenTechniqueData(item)) {
      if (!this.actor.isOwner) return null;
      const data = item.toObject();
      delete data._id;
      const chosen = await chooseTechniqueSkill(this.actor, data);
      if (!chosen) return null;
      return this.actor.createEmbeddedDocuments("Item", [chosen]);
    }
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

    // A module may say what the character's worn gear is worth against the
    // cold (API 1.76.0); the GM can still pick otherwise.
    // The dialog starts on the day's temperature where the GM set one, and
    // the GM may keep what they type as the day's (API 1.138.0), so the next
    // battle or march is fought in the same weather.
    const asked = await promptForWeather(wornClothing(this.actor), {
      temperatureF: currentTemperature(),
      mayKeep: game.user?.isGM === true,
    });
    if (!asked) return;

    const { keepTemperature, ...weather } = asked;
    if (keepTemperature) await setTemperature(weather.temperatureF);
    await rollExposure({ actor: this.actor, ...weather });
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
  static async #onHealCrippled(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.id;
    if (id) await healCrippled(this.actor, id);
  }

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
    // A stun applied as a mental one rolls IQ of itself (since API 1.104.0).
    await rollStunRecovery({ actor: this.actor, ...((event as MouseEvent).shiftKey ? { mental: true } : {}) });
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
  /** Exposure to a Weakness, from the trait's own row (Characters p. 161). */
  static async #onWeaknessExposure(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (item) await exposeToWeakness(this.actor, item);
  }

  /**
   * A self-control roll (Characters pp. 120-121): "roll 3d. If you roll less
   * than or equal to your self-control number, you resist your disadvantage."
   * Tagged `selfControl`, so an affliction's penalty and the modules' lines
   * apply, and the modules hear how it went.
   */
  static async #onSelfControlRoll(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    const number = Number(item?.system?.selfControl);
    if (!item || !Number.isFinite(number) || number <= 0) return;
    const outcome = await rollSuccess({
      actor: this.actor,
      base: number,
      label: game.i18n.format("GWORLD.Trait.SelfControlLabel", { trait: String(item.name ?? "") }),
      kind: "selfControl",
      skill: String(item.name ?? ""),
    });
    if (outcome) {
      ui.notifications?.info(game.i18n.format(outcome.success ? "GWORLD.Trait.Resisted" : "GWORLD.Trait.GaveIn", { name: String(this.actor.name ?? ""), trait: String(item.name ?? "") }));
    }
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
    // What forced the roll, for the modules that read it (since 1.49.0).
    const item = target.dataset.itemId ? (this.actor.items?.get?.(target.dataset.itemId) ?? null) : null;
    // A derived mode says which it is, so a roll it forced isn't taken for one
    // the item's own mode at that index forced (#409).
    const mode = target.dataset.modeIndex
      ? {
          index: Number(target.dataset.modeIndex) || 0,
          ranged: target.dataset.modeRanged === "1",
          ...(target.dataset.derivedMode ? { derived: String(target.dataset.derivedMode) } : {}),
        }
      : null;
    const hitLocation = (target.dataset.hitLocation ?? "torso") as HitLocation;
    const damageType = (target.dataset.damageType ?? "cr") as DamageType;

    const targets = currentTargets();
    if (targets.length === 0) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Affliction.NoTarget"));
      return;
    }
    // An area affliction's centre (since API 1.63.0): this user's latest
    // template on the map, or else the first target.
    const centre = target.dataset.areaAttack === "1" ? areaCentre(targets) : null;

    // One roll each: an affliction is resisted individually, and two people
    // caught by the same stun gun do not share a roll.
    const seen = new Set<string>();
    for (const token of targets) {
      const victim = token?.actor;
      if (!victim) continue;
      const key = String(victim.uuid ?? victim.id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      const yards = yardsBetween(shooter, token);
      const fromCentre = centre ? yardsBetween(centre, token) : null;
      const distance = fromCentre === null ? {} : { distance: fromCentre };
      // What the victim's armour was worth against the attack that forced the
      // roll. An affliction is not damage, so none of it is subtracted here.
      const drHere = wornDrAt(wornArmor(victim), hitLocation, damageType);
      // "The victim gets a bonus equal to his DR" -- worn and his own, as the
      // attack's armour divisor leaves it -- unless DR does nothing against
      // the attack: a cosmic divisor, a Malediction, or a follow-up (p. 35;
      // since API 1.105.0). The other modifiers that get past DR are named
      // nowhere on the row, and a module drops the line for them.
      const met = drMetByAttack(victim, {
        hitLocation,
        damageType,
        armorDivisor: Number(target.dataset.armorDivisor) || 1,
        ignoresDr: target.dataset.ignoresDr === "1" || target.dataset.followUp === "1",
        ...(typeof item?.uuid === "string" ? { itemUuid: item.uuid } : {}),
        mode,
      });
      const drBonus = afflictionDrBonus(met);

      // An affliction resisted with a Fright Check rather than an attribute (since API 1.63.0).
      if (isFrightResistance(attribute)) {
        const fright = await rollFrightCheckOutcome({
          actor: victim,
          modifier,
          tags: ["resist", "affliction"],
          attack: { attacker: this.actor, item, mode, distanceYards: yards, halfDamageRange, dr: drHere, drCounted: drBonus > 0, drBonus, ...distance },
        });
        if (fright && !fright.success) {
          await applyAfflictionEffects({ actor: victim, attacker: this.actor, item, mode, label, margin: fright.margin, frightEffect: fright.effect, ...distance });
        }
        continue;
      }

      const outcome = await rollSuccess({
        actor: victim,
        base: resistanceScore(victim, attribute),
        label: game.i18n.format("GWORLD.Affliction.Label", {
          label,
          resist: `${attribute}${modifier || ""}`,
        }),
        kind: "attribute",
        // A resistance roll is its own kind of roll, and a module may have
        // something to say to all of them or to this one (since 1.49.0).
        tags: ["resist", "affliction"],
        attack: {
          attacker: this.actor,
          item,
          mode,
          distanceYards: yards,
          halfDamageRange,
          dr: drHere,
          drCounted: drBonus > 0,
          drBonus,
          ...distance,
        },
        modifiers: [
          ...(modifier === 0 ? [] : [{ label: game.i18n.localize("GWORLD.Affliction.Short"), value: modifier }]),
          ...(drBonus > 0 ? [{ key: "afflictionDr", label: game.i18n.localize("GWORLD.Affliction.DrBonus"), value: drBonus }] : []),
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

      // A roll that failed is an effect somebody now has. Which one is the
      // GM's from the card for the Basic Set's own afflictions; a module may
      // name its own instead, or beside it (since 1.49.0).
      if (outcome && !outcome.success) {
        await applyAfflictionEffects({
          actor: victim,
          attacker: this.actor,
          item,
          mode,
          label,
          margin: outcome.margin,
          ...distance,
        });
      }
    }
  }

  /**
   * Slams into someone (GURPS Basic Set: Campaigns pp. 371-372): a slam,
   * flying tackle, pounce or shield rush, or a module's own, rolled to hit
   * before anyone's damage.
   */
  static async #onSlam(this: GWorldCharacterSheet) {
    await slamOrShove(this.actor, "slam");
  }

  /** Shoves someone (Campaigns p. 372): knockback, and never injury. */
  static async #onShove(this: GWorldCharacterSheet) {
    await slamOrShove(this.actor, "shove");
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
    const stored = (this.actor.system as { points?: { awards?: PointAward[] } }).points?.awards ?? [];
    const asked = await promptForAward(nextSessionLabel(stored, (n) => game.i18n.format("GWORLD.Points.SessionN", { n })));
    if (!asked || asked.points === 0) return;

    const awards: PointAward[] = [
      ...stored,
      { points: asked.points, note: asked.note, at: Date.now(), session: asked.session },
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

    // An Add button can make something the list doesn't have, as what it adds.
    const customType = target.dataset.customType;
    const customCategory = target.dataset.customCategory;
    await CompendiumPicker.open({
      actor: this.actor,
      types,
      ...(categories.length > 0 ? { categories } : {}),
      title: game.i18n.localize(target.dataset.browseTitle ?? "GWORLD.Picker.Title"),
      ...(customType ? { custom: { itemType: customType, ...(customCategory ? { category: customCategory } : {}) } } : {}),
    });
  }

  static async #onCreateItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const type = target.dataset.itemType;
    if (!type) return;
    // A module's type is named by its manifest's localization when it has one,
    // and by the heading it registered when it doesn't.
    const typeKey = `TYPES.Item.${type}`;
    const label = !game.i18n.has(typeKey) && registeredItemType(type) ? registeredItemType(type)!.label : game.i18n.localize(typeKey);
    // The button under Disadvantages makes a disadvantage: the category is
    // part of what was asked for, not something to set afterwards.
    const category = target.dataset.category;
    const custom = { itemType: type, ...(category ? { category } : {}) };
    // Named for what it is -- "New quirk" -- as the picker names its custom
    // entries, rather than "New Trait" for every category alike.
    const kind = category ? game.i18n.localize(customKindKey(custom)).toLowerCase() : label;
    // The same defaults the picker's custom entries get, from one place: a
    // quirk is -1 and a perk 1, and building them here as well is how this
    // button used to make quirks that cost nothing.
    const firstLanguage = type === "language" && !this.actor.items.some((item: any) => item.type === "language");
    const name = firstLanguage
      ? game.i18n.localize("GWORLD.Language.FirstName")
      : game.i18n.format("GWORLD.Picker.NewCustom", { kind });
    const data = customItemData(custom, name, { firstLanguage });
    await this.actor.createEmbeddedDocuments("Item", [data]);
  }

  /**
   * Picks the skill for an open technique already on the sheet -- one made
   * with the New button, or brought in some other way that did not ask.
   */
  static async #onChooseTechniqueSkill(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item || !isOpenTechniqueData(item)) return;
    const chosen = await chooseTechniqueSkill(this.actor, item.toObject());
    if (!chosen) return;
    await item.update({ name: chosen.name, "system.prerequisite": chosen.system.prerequisite });
  }

  /** A row button an add-on module gave its item type. */
  static async #onAddonItemAction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const itemId = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const key = target.dataset.addonAction;
    if (itemId && key) await runItemTypeAction(this.actor, itemId, key);
  }

  /** A response a module's option on the Wait maneuver holds ready. */
  static async #onManeuverResponse(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.optionId;
    if (id) await triggerManeuverResponse(this.actor, id);
  }

  /** A module's button on the grapple panel. */
  static async #onGrappleAction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.grappleAction;
    if (id) await runGrappleAction(this.actor, id, grappleOf(this.actor, GWorldCharacterSheet.#grappleFoe(target)));
  }

  /** Takes a timed condition off before it runs out. */
  static async #onRollZen(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    await rollZenSkill(this.actor, target.dataset.zenId ?? "zenArchery");
  }

  static async #onClearZen(this: GWorldCharacterSheet) {
    await clearZenShot(this.actor);
  }

  static async #onRemoveTimedCondition(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const id = target.dataset.conditionId;
    if (id) await removeCondition(this.actor, id, { setSystemCondition: setCondition });
  }

  /** A button an add-on module put on the row of one of the system's items. */
  static async #onAddonRowAction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const itemId = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const id = target.dataset.addonRowAction;
    if (itemId && id) await runRowAction(this.actor, itemId, id);
  }

  static async #onEditItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
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
    const item = this.itemFrom(target);
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
    // The setting's own change handler redraws every open sheet, this one included.
    await game.settings.set(SYSTEM_ID, SKILL_ORDER, otherOrder(current));
  }

  /**
   * Brings an unready weapon back up (Campaigns p. 366).
   *
   * A Ready maneuver, so the maneuver is set as well as the flag cleared: it
   * is the turn's action, not a free one.
   */
  static async #onReadyWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await item.update({ "system.unready": false });
    await this.actor.update({ "system.maneuver": "ready" });
  }

  /** Tries to pull a stuck weapon free: a Ready maneuver and a ST roll (Campaigns p. 405). */
  static async #onFreeStuckWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (item) await freeStuckWeapon(this.actor, item);
  }

  /** Lets go of a stuck weapon, a free action; it stays in the foe (Campaigns p. 405). */
  static async #onLetGoOfStuckWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (item) await letGoOfStuckWeapon(this.actor, item);
  }

  /** Takes a weapon back out of the foe it was left in, once the fight allows (Campaigns p. 405). */
  static async #onRetrieveStuckWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (item) await setStuckWeapon(item, null);
  }

  /** Reloads a ranged weapon, for the Ready maneuvers its column lists (Campaigns p. 373). */
  static async #onReloadWeapon(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await reloadWeapon(this.actor, item, Number(target.dataset.modeIndex) || 0);
  }

  /** Tries to clear a weapon's malfunction (Campaigns p. 407). */
  static async #onClearMalfunction(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await clearMalfunction(this.actor, item);
  }

  /** Loads a weapon from a box of rounds the character carries (Characters p. 278). */
  static async #onLoadAmmunition(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await chooseAndLoad(this.actor, item, Number(target.dataset.modeIndex) || 0);
  }

  /** Buys a box of rounds that fit the weapon, priced by the book's rule (Characters p. 278). */
  static async #onBuyAmmunition(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await buyAmmunition(this.actor, item, Number(target.dataset.modeIndex) || 0);
  }

  /**
   * Buys more of something already carried, out of the cash on the sheet
   * (Characters pp. 25-27): rations eaten, a rope left behind, arrows shot
   * away. The gear that was there when the character was written up was paid
   * for out of starting wealth and is not charged again.
   */
  static async #onBuyItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item) return;
    await buyMore(this.actor, item);
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
    const job = (this.actor.system as any)?.job ?? {};
    const level = jobRollLevel(this.actor, String(job.skill ?? ""));
    if (!job.title || level === null) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Life.NoJob"));
      return;
    }
    const pay = Number((this.actor.system as any)?.derived?.wealth?.jobPay) || 0;
    const escape = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
    // What the month is rolled against and pays, before anything is rolled;
    // the modifier can go below zero, for a hard month.
    const modifier = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("GWORLD.Life.WorkMonth") },
      content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
        <p class="ihint">${escape(game.i18n.format("GWORLD.Life.WorkSummary", { title: job.title, skill: job.skill, level, amount: pay, kind: game.i18n.localize(`GWORLD.Life.JobKind.${job.kind === "freelance" ? "freelance" : "wage"}`) }))}</p>
        <label style="display:flex;align-items:center;gap:8px">
          <span>${escape(game.i18n.localize("GWORLD.Chat.Modifier"))}</span>
          <input type="number" name="modifier" value="0" step="1" autofocus style="width:80px">
        </label>
      </div>`,
      ok: {
        label: game.i18n.localize("GWORLD.Life.WorkMonth"),
        callback: (_event: Event, button: HTMLElement) =>
          Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="modifier"]')?.value) || 0,
      },
      rejectClose: false,
    });
    if (modifier === null || modifier === undefined) return;
    await workAMonth({ actor: this.actor, modifier: Number(modifier) || 0 });
  }

  /** Money in or out of the cash, with what for (Characters p. 26). */
  static async #onAdjustCash(this: GWorldCharacterSheet) {
    const escape = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
    const asked = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("GWORLD.Life.AdjustCash") },
      content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
        <p class="ihint">${escape(game.i18n.format("GWORLD.Life.CashNow", { amount: Number((this.actor.system as any)?.money) || 0 }))}</p>
        <label style="display:flex;align-items:center;gap:8px">
          <span>${escape(game.i18n.localize("GWORLD.Life.CashAmount"))}</span>
          <input type="number" name="amount" value="0" step="1" autofocus style="width:110px">
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <span>${escape(game.i18n.localize("GWORLD.Life.CashNote"))}</span>
          <input type="text" name="note" placeholder="${escape(game.i18n.localize("GWORLD.Life.CashNotePlaceholder"))}" style="flex:1">
        </label>
      </div>`,
      ok: {
        label: game.i18n.localize("GWORLD.Life.AdjustCash"),
        callback: (_event: Event, button: HTMLElement) => {
          const form = button.closest<HTMLElement>(".application");
          return {
            amount: Number(form?.querySelector<HTMLInputElement>('input[name="amount"]')?.value) || 0,
            note: String(form?.querySelector<HTMLInputElement>('input[name="note"]')?.value ?? "").trim(),
          };
        },
      },
      rejectClose: false,
    });
    if (!asked || typeof asked !== "object") return;
    await adjustCash({ actor: this.actor, ...(asked as { amount: number; note: string }) });
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
    // A hot day is ticked where the day's temperature makes it one for this
    // marcher (API 1.138.0); the GM can still untick it.
    const asked = await promptForHike(dayWeather(this.actor).hot);
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
    if (held.kind === "binding") {
      await breakFreeFromBinding(this.actor);
      return;
    }
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
    const item = this.itemFrom(target);
    if (!item) return;
    const vehicle = item.system?.vehicle ?? {};
    const powered = Number(vehicle.stHp) > 0 && Number(vehicle.acceleration) > 0;
    const asked = await promptForVehicleHit({ aboard: 1, locations: aimableLocations(locationsOf(String(vehicle.locations ?? "")), powered) });
    if (!asked) return;
    await shootAtVehicle({ actor: this.actor, vehicle: item, ...asked });
  }

  /** A control roll for the vehicle on this row (Campaigns p. 466). */
  static async #onControlVehicle(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("vehicles")) return;
    const item = this.itemFrom(target);
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
    const item = this.itemFrom(target);
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
    const item = this.itemFrom(target);
    if (!item) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }

  protected itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  /** A drop that fails says why, rather than doing nothing. */
  override async _onDrop(event: DragEvent): Promise<void> {
    await reportRefusedDrop(event, () => super._onDrop(event));
  }
}

/**
 * Where an area attack is centred, as something `yardsBetween` can measure
 * from: the last template this user placed on the scene, or the first target.
 */
function areaCentre(targets: any[]): { center: { x: number; y: number } } | null {
  const templates: any[] = (globalThis as any).canvas?.templates?.placeables ?? [];
  const mine = templates.filter((t) => t?.document?.author?.id === game.user?.id || t?.document?.user?.id === game.user?.id);
  const last = mine[mine.length - 1]?.document;
  if (last && Number.isFinite(last.x) && Number.isFinite(last.y)) return { center: { x: last.x, y: last.y } };
  const first = targets[0];
  return first?.center ? { center: first.center } : null;
}
