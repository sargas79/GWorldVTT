/**
 * The public API for add-on modules: `game.gworld.api`.
 *
 * The system plays the Basic Set. Rules from any other book live in a module,
 * and a module reaches the system through this object and the hooks it
 * documents -- nothing else. That is the whole contract:
 *
 *   - **Stable.** What is here keeps working within a major version. Adding to
 *     it raises the minor version; changing or removing anything raises the
 *     major version. `version` says which.
 *   - **Exclusive.** The system's classes, sheets and data models are not part
 *     of the API. A module doesn't patch or subclass them, doesn't import the
 *     system's source at runtime, and writes only to its own Item and Actor
 *     types, its own `system.extensions.<module>` data, its own flags and
 *     settings, and its own registered rule keys. Anything else may change in
 *     any release.
 *   - **One-way.** The system knows no module. Everything a module brings
 *     arrives through registration, so the system behaves the same whichever
 *     modules are active.
 *
 * Lifecycle, in order:
 *
 *   1. `gworld.registerRules` (during `init`): register rule groups and switches.
 *   2. `setup`: rule registration closes.
 *   3. `gworld.ready` (after the system's own `ready` work): the world is loaded
 *      and every part of the API may be used.
 */

import * as rules from "../rules/index.js";
import { skillLevelOf } from "./skill-level.js";
import { incompatibleModules, satisfiesApiRange } from "./api-version.js";
import { combatApi } from "./combat-extensions.js";
import { clearZenShot, pendingZenShot, registerZenSkill, rollZenSkill, zenSkillsOf } from "./zen.js";
import { loadInstantly, refundShots } from "./ammunition.js";
import { clearMalfunction, malfunctionOf, setMalfunction } from "./malfunctions.js";
import { knockWeaponAway, setWeaponUnready, type HeldWeaponOptions, type KnockedAway, type UnreadyChanged } from "./held-weapons.js";
import { freeStuckWeapon, letGoOfStuckWeapon, setStuckWeapon, stuckWeaponOf } from "./picks.js";
import { registerSlam } from "./slam.js";
import { beginGrapple, endGrapple, grappleOf, grapplesOf, updateGrapple } from "./grappling.js";
import { dataApi } from "./data-extensions.js";
import { chatApi, sheetsApi } from "./sheet-extensions.js";
import { magicApi, pointsApi } from "./roll-extensions.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { migrationApi } from "./migration.js";
import { takeInjury, wearDr, type DrWorn, type InjuryTaken } from "./damage.js";
import { equipmentFailure, type EquipmentFailureResult } from "./repairs.js";
import { stopBleeding } from "./bleeding.js";
import { activePoisons, advancePoison, clearPoison, dosePoison, treatIllness, treatPoison, type ActivePoison } from "./poison.js";
import { attendPatient, giveFirstAid, operate, resuscitate } from "./recovery.js";
import { rollCripplingDuration, rollMortalWound } from "./dying.js";
import type { Poison, Treatment } from "../rules/poison.js";
import type { ResuscitationCause } from "../rules/medicine.js";
import type { ControlRating, LegalityClass } from "../rules/legality.js";
import { currentControlRating, legalityClassOf } from "./legality.js";
import { surprise, undoKnockdown } from "./knockdown.js";
import { rollFall } from "./falling.js";
import { restoreFatigue, spendFatigueFor } from "./fatigue.js";
import { changeTrait, type TraitChanged } from "./trait-change.js";
import { stopTowing, tow } from "./towing.js";
import { cripple, crippledParts, healCrippled, settleCrippling, type CrippledDuration, type CrippledPart } from "./crippling.js";
import type { CripplingDuration } from "../rules/mortal-wounds.js";
import type { Conveyance } from "../rules/towing.js";
import { bind, bindingOf, breakFreeFromBinding, unbind, type BindingBroken } from "./entangling.js";
import type { LandingSurface } from "../rules/falling.js";
import { isUndoable, undoDamage, type DamageTransaction, type UndoOutcome } from "./damage-undo.js";
import { carriedAmmunitionFor, loadAmmunition } from "./ammunition.js";
import { randomLocationWithHooks } from "./combat-extensions.js";
import {
  fragileCatchesFire, fragileExplodes, fragileKindsOf, irradiate, rollBrittleLimb, shock, shootAtVehicle, controlVehicle,
} from "./hazards.js";
import { detonateCharge } from "./demolition.js";
import { equipmentUseLines, familiarWith, setFamiliar } from "./tech-level.js";
import { addArea, listAreas, removeArea, tokensInArea } from "./modifier-areas.js";
import { darknessAt, litForOf, registerLightLevel, registerLitFor, setLitFor } from "./darkness.js";
import { rollFrightCheck } from "./fright.js";
import { spendUnspentPoints } from "./bonus-points.js";
import {
  PROCEDURE_HOOKS,
  activeConditions,
  applyCondition,
  attackSequenceFor,
  recoveryHold,
  registerContestResolver,
  registerDerivedAttackMode,
  registerInfluenceSkill,
  registerGrappleAction,
  registerManeuverOption,
  removeCondition,
  type ConditionApplication,
} from "./procedure-extensions.js";
import { rollQuickContest, rollRegularContest } from "./contest.js";
import { loseAim } from "./aim.js";
import { activeRules, isRuleOn } from "./optional-rules.js";
import { REGISTER_RULES_HOOK, isAddonRuleKey, namespacedRuleKey, registerRule, registerRuleGroup } from "./rule-registry.js";
import { rollDamage, rollSuccess } from "./roll.js";
import { postResistance } from "./spell-resistance.js";
import { manaLevel } from "./casting.js";
import { PARTY_CHANGED_HOOK, addMembers, membersOf, partyOf, removeMember } from "./party.js";
import { CAMPAIGN_CHANGED_HOOK, actorCampaignTerms, worldCampaignTerms } from "./campaign.js";
import { objectStats, type ItemObjectStats } from "./object-stats.js";
import { vehicleAboard } from "./vehicle-aboard.js";
import type { VehicleMedium } from "../rules/vehicle-combat.js";
import { dayWeather, setTemperature } from "./weather.js";
import { addPendingModifier, pendingModifiers, removePendingModifier, type PendingModifierRequest } from "./pending-modifiers.js";
import { applyItemDamage, type ItemDamaged } from "./item-damage.js";
import { normalizeDamage } from "./modifying-dice.js";
import { changeQuantity, type QuantityChanged } from "./item-quantity.js";

/**
 * The API's version. Raise the minor part when something is added, the major
 * part when something changes or goes. Independent of the system's version.
 */
export const API_VERSION = "1.143.0";

/** The hook fired once the system is ready, with the API. */
export const READY_HOOK = "gworld.ready";

type AttributeKey = "ST" | "DX" | "IQ" | "HT" | "Will" | "Per";

/** Reads a character's worked-out values without reaching into the data model. */
const actors = {
  /** Everything the system worked out for an actor this preparation, or null. Read-only. */
  derived(actor: any): Record<string, any> | null {
    return (actor?.system?.derived as Record<string, any> | undefined) ?? null;
  },

  /** An attribute or Will or Perception as the sheet shows it, traits included, or null. */
  attribute(actor: any, key: AttributeKey): number | null {
    const derived = actors.derived(actor);
    if (!derived) return null;
    if (key === "Will") return typeof derived.will === "number" ? derived.will : null;
    if (key === "Per") return typeof derived.per === "number" ? derived.per : null;
    const value = derived.attributes?.[key];
    return typeof value === "number" ? value : null;
  },

  /**
   * A skill's level by name, or null where the character doesn't have it. The
   * name is compared the way the sheet compares it, so "Guns (Pistol)" finds
   * "Guns/TL (Pistol)".
   */
  skillLevel(actor: any, name: string): number | null {
    if (!actor || !name) return null;
    return skillLevelOf(actor, name);
  },

  /** The active defenses as the sheet shows them, or null. */
  defenses(actor: any): Record<string, any> | null {
    return actors.derived(actor)?.defenses ?? null;
  },

  /** Basic Lift in pounds, or null. */
  basicLift(actor: any): number | null {
    const value = actors.derived(actor)?.basicLift;
    return typeof value === "number" ? value : null;
  },

  /** The encumbrance level and what it does to Move and Dodge, or null. */
  encumbrance(actor: any): Record<string, any> | null {
    return actors.derived(actor)?.encumbrance ?? null;
  },

  /**
   * Applies a condition (since 1.5.0): a module's own, or one of the system's
   * token conditions by its id, with modifiers on rolls and a duration.
   * Returns its id, or null where it couldn't be applied.
   */
  applyCondition(actor: any, application: ConditionApplication): Promise<string | null> {
    return applyCondition(actor, application, { setSystemCondition: setCondition, systemConditionLabel: conditionLabel });
  },

  /**
   * Whether the rolls to recover from a condition are withheld now (since
   * 1.89.0), as `applyCondition`'s `holdRecovery` holds them: `{ until }`, the
   * world time they may begin, or null while the condition lasts; null where
   * they may be rolled.
   */
  recoveryHold(actor: any, id: string): { until: number | null } | null {
    return recoveryHold(actor, id);
  },

  /** Removes a condition by the id `applyCondition` returned (since 1.5.0). */
  removeCondition(actor: any, id: string): Promise<void> {
    return removeCondition(actor, id, { setSystemCondition: setCondition });
  },

  /** The timed conditions on an actor (since 1.5.0). */
  conditions(actor: any) {
    return activeConditions(actor);
  },

  /**
   * Holds a bonus for the actor's next success roll that matches it (since
   * 1.132.0): `{ label, value, tags?, skill?, expires? }`. The roll takes its
   * line and uses it up; it lapses unused at `expires`, a world time. Returns
   * its id, or null where it can't be held.
   */
  addPendingModifier(actor: any, request: PendingModifierRequest): Promise<string | null> {
    return addPendingModifier(actor, request);
  },

  /** The bonuses held on an actor for rolls to come, lapsed ones left out (since 1.132.0). */
  pendingModifiers(actor: any) {
    return pendingModifiers(actor);
  },

  /** Takes a held bonus off unused, by the id `addPendingModifier` returned (since 1.132.0). */
  removePendingModifier(actor: any, id: string): Promise<boolean> {
    return removePendingModifier(actor, id);
  },

  /**
   * Takes injury, or fatigue with `fatigue: true`, off an actor outside a
   * damage card (since 1.8.0). The health conditions follow, and nothing is
   * posted. Returns the pool and what it went from and to, or null where this
   * user can't change the actor.
   */
  applyInjury(actor: any, options: { amount: number; fatigue?: boolean; label?: string }): Promise<InjuryTaken | null> {
    return takeInjury(actor, options);
  },

  /**
   * Gives FP back outside rest (Campaigns p. 427; since 1.104.0), never above
   * the actor's FP: `{ from, to, max, reason }`, or null for a user who can't
   * change the actor or an amount that isn't a positive number.
   */
  restoreFatigue(actor: any, fp: number, options: { reason?: string } = {}) {
    return restoreFatigue(actor, fp, options);
  },

  /**
   * Charges FP the way the system's own procedures do (Campaigns p. 426;
   * since 1.109.0): `gworld.fatigueCost` (told `reason`, `module` by default,
   * and `details`), Very Fit's halving where it is exertion (the default),
   * and the fatigue chart, injury past 0 FP and all, then since 1.138.0
   * `gworld.afterFatigue` with what it came to. Resolves to `{ fpLost,
   * hpLost, sources, fp, hp, status }`, or null for a user who can't change
   * the actor or an amount that isn't a positive number.
   */
  spendFatigue(actor: any, fp: number, options: { reason?: string; details?: Record<string, unknown>; exertion?: boolean } = {}) {
    return spendFatigueFor(actor, fp, options);
  },

  /**
   * Takes a character by surprise (Campaigns p. 393; since 1.104.0): mentally
   * stunned, recovered with IQ; total surprise freezes them for 1d seconds
   * first. Resolves to `{ kind, freezeSeconds }`, or null.
   */
  surprise(actor: any, options: { total?: boolean } = {}) {
    return surprise(actor, options);
  },

  /**
   * Holds a character in a Binding of the given ST (Characters p. 40; since
   * 1.107.0) until they win a Quick Contest of ST or Escape against it, on
   * the system's entangled state. `onBreak` is called in this client when it
   * ends; `gworld.bindingBroken` is heard everywhere. False where it couldn't.
   */
  bind(actor: any, options: { st: number; label?: string; source?: string; onBreak?: (broken: BindingBroken) => unknown }): Promise<boolean> {
    return bind(actor, options);
  },

  /** Takes a Binding off without a Contest (since 1.107.0). False where there was none. */
  unbind(actor: any): Promise<boolean> {
    return unbind(actor);
  },

  /** An actor's Binding, `{ st, label, source }`, or null (since 1.107.0). */
  binding(actor: any): { st: number; label: string; source: string } | null {
    return bindingOf(actor);
  },

  /**
   * Changes one of a character's traits, GM only (since 1.112.0): `level`
   * sets its levels within its cap, `replaceWith` swaps it for another trait
   * (a compendium name, or item data). Found by `id` or `name`. Since
   * 1.124.0, `add` gives the character a trait they haven't got (found as
   * `replaceWith` is) and `remove: true` takes one away. Resolves to
   * `{ itemId, from, to, replaced, added, removed }`, or null.
   */
  changeTrait(actor: any, options: { id?: string; name?: string; level?: number; replaceWith?: string | Record<string, any>; add?: string | Record<string, any>; remove?: boolean }): Promise<TraitChanged | null> {
    return changeTrait(actor, options);
  },

  /**
   * Pulls a load behind the character (Campaigns p. 353; since 1.113.0):
   * `weight` is the load and its conveyance together; its effective weight
   * counts toward encumbrance until `stopTowing`. Resolves to `{ effective,
   * limit, movable }`, or null.
   */
  tow(actor: any, options: { weight: number; conveyance?: Conveyance; smooth?: boolean; label?: string }) {
    return tow(actor, options);
  },

  /**
   * Cripples a part of a character for a while (Campaigns p. 422; since
   * 1.114.0): `temporary` until back at full HP, `lasting` for `months` (or
   * 1d months less `treatedAtTl`'s relief), `permanent` for good. Shown on
   * the sheet until it heals. Resolves to the part recorded, or null.
   * Since 1.129.0 the duration may be left `undecided` for `settleCrippling`,
   * and `injury: false` records a crippling no HP loss caused: a temporary
   * one then lasts until taken off, or for `seconds`. A crippled eye, arm or
   * hand works as One Eye, Blindness or One Arm while it lasts.
   */
  cripple(actor: any, location: string, options: { duration?: CrippledDuration; label?: string; months?: number; treatedAtTl?: number | null; injury?: boolean; seconds?: number } = {}): Promise<CrippledPart | null> {
    return cripple(actor, location, options);
  },

  /**
   * Settles how long an undecided crippling lasts (p. 422; since 1.129.0),
   * by id or location. With a `duration`, as the caller says; without one,
   * by the HT roll, posted to chat. Resolves to the part as settled, or null.
   */
  async settleCrippling(actor: any, which: string, options: { duration?: CripplingDuration; months?: number; treatedAtTl?: number | null; seconds?: number } = {}): Promise<CrippledPart | null> {
    if (options.duration !== undefined) return settleCrippling(actor, which, { ...options, duration: options.duration });
    return (await rollCripplingDuration({ actor, part: which, treatedAtTl: options.treatedAtTl ?? null, ...(options.seconds !== undefined ? { seconds: options.seconds } : {}) }))?.part ?? null;
  },

  /** The parts crippled now, healed ones left out (since 1.114.0). */
  crippled(actor: any): CrippledPart[] {
    return crippledParts(actor);
  },

  /** Takes a crippled part off, by id or location (since 1.114.0). False where there was none. */
  healCrippled(actor: any, which: string): Promise<boolean> {
    return healCrippled(actor, which);
  },

  /**
   * The vehicle a character is aboard (Campaigns pp. 467-469; since 1.141.0),
   * the same reading an attack from it uses: `{ vehicle, operator, moving,
   * medium }`, or null. Found by the character's place in a vehicle's crew,
   * among the world's vehicles and those that exist only as unlinked tokens.
   */
  vehicleAboard(actor: any): { vehicle: any; operator: boolean; moving: boolean; medium: VehicleMedium } | null {
    const aboard = vehicleAboard(actor);
    return aboard ? { vehicle: aboard.vehicle, operator: aboard.operator, moving: aboard.moving, medium: aboard.medium } : null;
  },

  /** Lets go of a pulled load (since 1.113.0). False where there was none. */
  stopTowing(actor: any): Promise<boolean> {
    return stopTowing(actor);
  },

  /** One attempt to break free of a Binding (since 1.107.0): "free", "held", or null. */
  breakFree(actor: any): Promise<"free" | "held" | null> {
    return breakFreeFromBinding(actor);
  },

  /** Ends an actor's bleeding and clears the condition (since 1.36.0), for a user who owns it. */
  stopBleeding(actor: any): Promise<void> {
    return stopBleeding(actor);
  },

  /**
   * Writes a dose onto a character (Campaigns pp. 437-438, since 1.57.0), as the sheet's
   * Poison button does: a registered poison from `data.registerPoison` or one built on the
   * spot. `doublings` is the dose: 1 double, -1 half. Null for a user who doesn't own it.
   */
  dosePoison(actor: any, poison: Poison, options: { doublings?: number } = {}): Promise<ActivePoison | null> {
    return dosePoison({ actor, poison, doublings: options.doublings ?? 0 });
  },

  /** The doses at work on a character (since 1.57.0). Read-only copies. */
  activePoisons(actor: any): ActivePoison[] {
    return activePoisons(actor).map((dose) => ({ ...dose }));
  },

  /**
   * Runs one cycle of a dose (since 1.57.0): the HT roll, the damage, the card, and
   * `gworld.poisonCycle`. Returns the HP and FP it cost.
   */
  advancePoison(actor: any, id: string): Promise<number> {
    return advancePoison({ actor, id });
  },

  /**
   * Treats a dose of poison (Campaigns p. 439, since 1.77.0), as the sheet's Treat button
   * does. `treatment` is one of the book's (`suckWound`, `induceVomiting`, `medical`,
   * `antidote`), or left out for a module's own: a drug or device whose `bonus` stands to
   * the HT rolls to resist, rolled for only where `skill` is given. `skill` stands in for the
   * treater's First Aid or Physician (the book's treatments fall back to `healer`'s better
   * of the two, and fail where nobody has either); `techLevel` for the TL medical procedures
   * are given at; `label` names the treatment on the card. Returns the bonus it gave: 0 for
   * a failed roll or an unknown dose. The best treatment stands; they don't add.
   */
  treatPoison(patient: any, id: string, options: { treatment?: Treatment; bonus?: number; skill?: number | null; healer?: any; techLevel?: number; label?: string; modifier?: number } = {}): Promise<number> {
    const treatment = options.treatment ?? null;
    const skillLevel = typeof options.skill === "number" ? options.skill : treatment && treatment !== "antidote" ? bestTreaterSkill(options.healer ?? patient) : null;
    return treatPoison({ actor: patient, id, treatment, antidoteBonus: options.bonus ?? 0, skillLevel, ...(typeof options.techLevel === "number" ? { techLevel: options.techLevel } : {}), ...(options.label ? { label: options.label } : {}), modifier: options.modifier ?? 0 });
  },

  /**
   * Treats an illness (Campaigns p. 443, since 1.77.0), as the sheet does: `antibiotics`
   * (+3 at TL6+, none against a `drugResistant` strain), a physician's care bonus, and a
   * module's own `bonus`, which add. `label` names the treatment on the card. Returns the
   * bonus it gave; the best course of treatment stands.
   */
  treatIllness(patient: any, id: string, options: { antibiotics?: boolean; drugResistant?: boolean; physicianBonus?: number; bonus?: number; techLevel?: number; label?: string } = {}): Promise<number> {
    return treatIllness({ actor: patient, id, antibiotics: options.antibiotics ?? false, drugResistant: options.drugResistant ?? false, physicianBonus: options.physicianBonus ?? 0, bonus: options.bonus ?? 0, ...(typeof options.techLevel === "number" ? { techLevel: options.techLevel } : {}), ...(options.label ? { label: options.label } : {}) });
  },

  /** Takes a dose off a character (since 1.57.0). */
  clearPoison(actor: any, id: string): Promise<void> {
    return clearPoison(actor, id);
  },

  /**
   * First Aid on a patient (Campaigns p. 424, since 1.60.0), as the sheet's button does.
   * `skill` and `techLevel` stand in for the healer's, for a device that treats on its own;
   * `label` names who treats on the card. Returns the HP it moved. Since 1.122.0 it runs
   * the button's whole attempt, so `gworld.firstAid` hears it: a listener may refuse it
   * (0) or change its tech level, and a success stops the bleeding unless one says not.
   */
  firstAid(options: { healer: any; patient: any; skill?: number; techLevel?: number; label?: string; modifier?: number }): Promise<number> {
    return giveFirstAid({ ...options, modifier: options.modifier ?? 0 });
  },

  /**
   * A physician's rounds on a patient (p. 424, since 1.60.0); the roll is tagged `physician`.
   * Since 1.142.0 `gworld.physicianRounds` hears it, as it hears the sheet's button: a
   * listener may refuse it, move it to another tech level or add lines to the card.
   * `techLevel` is the TL of the healer's Physician skill, or of `skill` where one is given.
   */
  attendPatient(options: { healer: any; patient: any; skill?: number; techLevel?: number; label?: string; modifier?: number }): Promise<void> {
    return attendPatient({ ...options, modifier: options.modifier ?? 0 });
  },

  /**
   * An operation (p. 424, since 1.60.0); the roll is tagged `surgery`. Since
   * 1.112.0 it resolves to the outcome -- `{ success, margin,
   * criticalSuccess, criticalFailure, roll, target, techLevel, ... }` -- or
   * null where the user can't change the patient, and fires
   * `gworld.afterSuccessRoll` tagged `surgery`.
   */
  operate(options: { surgeon: any; patient: any; skill?: number; techLevel?: number; anesthetic?: boolean; repairingCrippled?: boolean; equipmentQuality?: number; label?: string; modifier?: number }): ReturnType<typeof operate> {
    return operate({ ...options, anesthetic: options.anesthetic ?? true, repairingCrippled: options.repairingCrippled ?? false, equipmentQuality: options.equipmentQuality ?? 0, modifier: options.modifier ?? 0 });
  },

  /**
   * A mortally wounded character's check (p. 423, since 1.60.0), at the better of HT and a
   * caregiver's `physician`; `traumaMaintenance` makes it daily. Tagged `mortalWound`.
   */
  rollMortalWound(options: { actor: any; physician?: number | null; traumaMaintenance?: boolean; modifier?: number }): Promise<void> {
    return rollMortalWound(options);
  },

  /**
   * Resuscitation (Campaigns p. 425, since 1.77.0), as the sheet's button does: a minute's
   * Physician/TL7+ roll, or First Aid/TL7+ at -4 (-2 with `cpr` against drowning and
   * asphyxiation). `skill` stands in for the healer's, as `skillKind` (`physician`, the
   * default, or `firstAid`); `techLevel` for the skill's TL; `label` names who works on the
   * card. Tagged `resuscitation` and the cause. Success clears unconsciousness and a heart attack.
   */
  resuscitate(options: { healer: any; patient: any; cause?: ResuscitationCause; cpr?: boolean; skill?: number; skillKind?: "physician" | "firstAid"; techLevel?: number; label?: string; modifier?: number }): Promise<void> {
    return resuscitate({ ...options, cause: options.cause ?? "heartAttack", cpr: options.cpr ?? false, modifier: options.modifier ?? 0 });
  },

  /** Takes back a knockdown's stun, fall and unconsciousness, and restores a posture (since 1.39.0). */
  undoKnockdown(actor: any, options: { posture?: string } = {}): Promise<boolean> {
    return undoKnockdown(actor, options);
  },

  /**
   * Takes back one application of damage (since 1.66.0), given the record
   * `applyDamage` returned on its result.
   *
   * Refuses, rather than overwriting, where anything the application changed
   * has moved since; the outcome says which way. A module that applies damage
   * through its own path can keep the record and offer the same undo.
   */
  undoDamage(transaction: DamageTransaction): Promise<UndoOutcome> {
    return undoDamage(transaction);
  },

  /**
   * Loads a ranged weapon from a box of rounds the actor carries (since
   * 1.67.0): the rounds come off the box, what was in the weapon from
   * another box goes back to it, and the mode fires the box's kind. True
   * when something was loaded.
   */
  loadAmmunition(actor: any, weaponId: string, modeIndex: number, ammunitionId: string): Promise<boolean> {
    const weapon = actor?.items?.get(weaponId);
    const box = actor?.items?.get(ammunitionId);
    return weapon && box ? loadAmmunition(actor, weapon, Number(modeIndex) || 0, box) : Promise.resolve(false);
  },

  /** The carried ammunition that fits a weapon and has rounds left (since 1.67.0). */
  carriedAmmunitionFor(actor: any, weaponId: string, modeIndex = 0): any[] {
    const weapon = actor?.items?.get(weaponId);
    return weapon ? carriedAmmunitionFor(actor, weapon, Number(modeIndex) || 0) : [];
  },

  /** Whether a damage record still describes something worth undoing (since 1.66.0). */
  isUndoable(transaction: DamageTransaction | null | undefined): boolean {
    return isUndoable(transaction);
  },

  /**
   * Puts an actor in one of the system's postures (since 1.16.0), for a user
   * who owns it. Returns whether it did.
   */
  async setPosture(actor: any, posture: string): Promise<boolean> {
    const postures = ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"];
    if (!actor?.isOwner || !postures.includes(posture)) return false;
    if (actor.system?.posture !== posture) await actor.update({ "system.posture": posture });
    return true;
  },

  /**
   * Ends an actor's aim (Campaigns p. 364; since 1.87.0), for a rule of a
   * module's that spoils it: the turns, the target and the per-target bonuses
   * are cleared and the usual note is shown. `reason` is one of the system's
   * (`injured`, `defended`, `fired`, `moved`, the last silent) or the module's
   * own words, shown as given. True where there was an aim to lose.
   */
  loseAim(actor: any, reason = ""): Promise<boolean> {
    return loseAim(actor, String(reason ?? ""));
  },

  /**
   * Makes a character familiar with an item of this name (Characters p. 169;
   * since 1.102.0), or no longer: a weapon, a tool, a vehicle. Resolves to
   * whether they are familiar with it now, or null for an actor that keeps no
   * familiarities, a user who can't change it, or an empty name.
   */
  setFamiliar(actor: any, name: string, familiar = true): Promise<boolean | null> {
    return setFamiliar(actor, String(name ?? ""), familiar !== false);
  },

  /** Whether a character is familiar with an item of this name (since 1.102.0), or null for one that keeps no familiarities. */
  isFamiliar(actor: any, name: string): boolean | null {
    return familiarWith(actor, String(name ?? ""));
  },
};

/** The treater's better of First Aid and Physician, as the sheet's treatment dialog starts at, or null. */
function bestTreaterSkill(treater: any): number | null {
  const levels = [actors.skillLevel(treater, "First Aid"), actors.skillLevel(treater, "Physician")].filter((v): v is number => typeof v === "number");
  return levels.length ? Math.max(...levels) : null;
}

/** Reads an item's worked-out values. */
const items = {
  /** Everything the system worked out for an item this preparation, or null. Read-only. */
  derived(item: any): Record<string, any> | null {
    return (item?.system?.derived as Record<string, any> | undefined) ?? null;
  },

  /**
   * Loads up to `shots` into a ranged mode at once (since 1.28.0): no Ready
   * maneuver, no card. Returns the new count, or null where the mode keeps no
   * count or the user doesn't own the item.
   */
  load(item: any, modeIndex: number, shots: number): Promise<number | null> {
    return loadInstantly(item, modeIndex, shots);
  },

  /**
   * Gives a ranged mode back `shots` an attack took (since 1.83.0), for a
   * rule that says the attack fired nothing after all: up to its capacity,
   * across a shared magazine, and nothing where Infinite Ammunition kept the
   * count. Returns the new count, or null where the mode keeps no count or
   * the user doesn't own the item.
   */
  refundShots(item: any, modeIndex: number, shots: number): Promise<number | null> {
    return refundShots(item, modeIndex, shots);
  },

  /**
   * What put a weapon out of action (since 1.71.0): `{ kind, label,
   * modeIndex }`, or null where nothing did. `kind` is one of the Firearm
   * Malfunction Table's (`mechanical`, `misfire`, `stoppage`, `explosion`),
   * a module's own, or `destroyed`.
   */
  malfunction(item: any): { kind: string; label: string; modeIndex: number } | null {
    return malfunctionOf(item);
  },

  /**
   * Puts a weapon out of action with `{ kind, label?, modeIndex? }`, or back
   * in it with null (since 1.71.0), with no roll and no card. False where the
   * user doesn't own the item.
   */
  setMalfunction(item: any, malfunction: { kind: string; label?: string; modeIndex?: number } | null): Promise<boolean> {
    return setMalfunction(item, malfunction);
  },

  /**
   * Tries to clear a weapon's malfunction as its sheet button does (since
   * 1.71.0): the dialog, the roll and the card. Resolves to `cleared`,
   * `notYet`, `mechanical` or `destroyed`, or null where nothing was tried.
   */
  clearMalfunction(actor: any, item: any): Promise<"cleared" | "notYet" | "mechanical" | "destroyed" | null> {
    return clearMalfunction(actor, item);
  },

  /**
   * The foe a weapon is stuck in (since 1.105.0; Campaigns p. 405): `{ uuid,
   * name, forGood, held, modeIndex }`, or null for a weapon in hand. `forGood`
   * after a critical failure pulling it free; `held` false once let go of.
   */
  stuck(item: any): { uuid: string; name: string; forGood: boolean; held: boolean; modeIndex: number } | null {
    return stuckWeaponOf(item);
  },

  /**
   * Leaves a weapon stuck in a foe with `{ uuid?, name?, forGood?, held?,
   * modeIndex? }`, or frees it with null (since 1.105.0), with no roll and no
   * card. False where the user doesn't own the item.
   */
  setStuck(item: any, stuck: { uuid?: string; name?: string; forGood?: boolean; held?: boolean; modeIndex?: number } | null): Promise<boolean> {
    return setStuckWeapon(item, stuck);
  },

  /**
   * Tries to pull a stuck weapon free as its sheet button does (since
   * 1.105.0): a Ready maneuver, a ST roll tagged `stuckWeapon`, and the card.
   * Resolves to `freed`, `stuck` or `stuckForGood`, or null where nothing was
   * tried.
   */
  freeStuck(actor: any, item: any): Promise<"freed" | "stuck" | "stuckForGood" | null> {
    return freeStuckWeapon(actor, item);
  },

  /** Lets go of a stuck weapon, a free action; it stays in the foe (since 1.105.0). False where nothing was let go of. */
  letGoOfStuck(actor: any, item: any): Promise<boolean> {
    return letGoOfStuckWeapon(actor, item);
  },

  /**
   * A weapon's or shield's DR, HP and HT as an object (since 1.90.0):
   * `{ kind, dr, hp, ht, notes }`, `kind` being `unliving` or `homogenous`
   * (or `diffuse`, which a listener may set since 1.126.0), once
   * `gworld.objectStats` listeners have had their say. The figures breakage,
   * striking at the item, shield damage, repairs and `applyDamage` use.
   */
  objectStats(item: any): ItemObjectStats {
    return objectStats(item);
  },

  /**
   * Puts a blow on an item that keeps hit points (since 1.126.0; Campaigns
   * pp. 483-484) with `{ item, damage, type, armorDivisor?, label? }`: its DR
   * off, the rest turned into injury by its `kind`, `hpLost` raised, the HT
   * rolls at -1xHP and each multiple after it, and the card. Resolves to an
   * `ItemDamaged` (the injury, `hpLost` `from`/`to`, `state`, `rolls`,
   * `destroyed`), or null where the user doesn't own the item, it keeps or
   * has no hit points, the damage isn't 0 or more, or the type isn't one of
   * the Basic Set's other than `fat`.
   */
  applyDamage(options: { item: any; damage: number; type: string; armorDivisor?: number; label?: string }): Promise<ItemDamaged | null> {
    return applyItemDamage(options);
  },

  /**
   * An item's Legality Class, 0-4, or null for none (since 1.95.0): its
   * stored `lc` once `gworld.legalityClass` listeners have had their say, as
   * the Gear tab and the item sheet read it.
   */
  legalityClass(item: any): LegalityClass | null {
    return legalityClassOf(item);
  },

  /**
   * Gives a piece of armour back up to `points` of the ablative DR it has
   * spent (since 1.59.0): `drLost` goes down, never below 0. Returns the new
   * `drLost`, or null for an item that isn't armour or a user who doesn't own it.
   */
  async restoreDr(item: any, points: number): Promise<number | null> {
    if (item?.type !== "armor" || !item.isOwner) return null;
    const lost = Math.max(0, Math.floor(Number(item.system?.drLost) || 0));
    const restored = Math.max(0, Math.floor(Number(points) || 0));
    const next = Math.max(0, lost - restored);
    if (next !== lost) await item.update({ "system.drLost": next });
    return next;
  },

  /**
   * Wears `amount` points of DR off a piece of armour for good (since
   * 1.99.0; Characters p. 47), for a corrosive, a fire or a rule of the
   * module's: `drLost` goes up as ablative spending raises it, never past the
   * piece's DR -- at `location` where one is given, anywhere on it otherwise.
   * Returns `{ itemId, from, to, location, reason }` (`from`/`to` the lost DR
   * before and after), or null for an item that isn't armour, a user who
   * doesn't own it, an amount that isn't positive, or a location the piece
   * doesn't cover.
   */
  wearDr(item: any, amount: number, options: { location?: string; reason?: string } = {}): Promise<DrWorn | null> {
    return wearDr(item, amount, options);
  },

  /**
   * Adds `delta` to a stack of an item, or takes it off with a negative one
   * (since 1.123.0), for a module that makes, finds or uses up consumables.
   * Never below 0; weight and cost are per unit, so the totals follow.
   * Resolves to `{ from, to, reason }`, or null for an item with no
   * quantity, a user who doesn't own it, or a delta that isn't a number.
   */
  changeQuantity(item: any, delta: number, options: { reason?: string } = {}): Promise<QuantityChanged | null> {
    return changeQuantity(item, delta, options);
  },

  /**
   * Rolls an equipment failure roll for a thing (since 1.118.0; Campaigns p.
   * 485) with `{ actor?, item, modifier?, label?, apply? }`: 3d against the
   * item's HT (after missed maintenance) plus `modifier` and the
   * `gworld.equipmentFailure` lines, with the card. On a failure the thing
   * is marked down for a minor repair, on a critical failure for a major
   * one, unless `apply` is false. Resolves to `{ outcome, result, target,
   * roll, margin, applied }`, `outcome` being `success`, `failure` or
   * `criticalFailure`; null where the user doesn't own the item.
   */
  equipmentFailure(options: { actor?: any; item: any; modifier?: number; label?: string; apply?: boolean }): Promise<EquipmentFailureResult | null> {
    return equipmentFailure(options);
  },

  /**
   * Leaves a weapon unready, or readies it with false (since 1.136.0), with
   * no roll and no card: `system.unready`, as a swing that unreadies it sets.
   * Made through the active GM's client where the user doesn't own the item:
   * for a GM, the owner of the item's holder, or (since 1.143.0) the owner of
   * the `attacker` named who left it unready by a disarm they just won, whose
   * Quick Contest card is passed as `contest` (once per card). Returns
   * `{ itemId, unready, reason }`, or null for anything but equipment on an
   * actor, a user with no say over the change, or no GM connected.
   */
  setUnready(item: any, unready: boolean, options: HeldWeaponOptions = {}): Promise<UnreadyChanged | null> {
    return setWeaponUnready(item, unready, options);
  },

  /**
   * Knocks a weapon or shield out of its holder's hands (since 1.136.0), as a
   * won disarm does, with no roll and no card: no longer carried or equipped,
   * so on no attack list, until somebody picks it up by carrying it again.
   * Made through the active GM's client where the user doesn't own the item:
   * for a GM, the owner of the item's holder, or (since 1.143.0) the owner of
   * the `attacker` named who won the disarm whose Quick Contest card is
   * passed as `contest` (once per card). Returns `{ itemId, reason }`, or null
   * for anything but equipment or a shield on an actor, a user with no say
   * over the change, or no GM connected.
   */
  knockAway(item: any, options: HeldWeaponOptions = {}): Promise<KnockedAway | null> {
    return knockWeaponAway(item, options);
  },
};

/** The API object, as `game.gworld.api` holds it. */
export interface GWorldApi {
  readonly version: string;
  /** The pure GURPS rules: dice, success rolls, contests, damage, hit locations, maneuvers, skills, costs. */
  readonly rules: typeof rules;
  /** Rule groups and switches (see "A module's own rules" in docs/api.md). */
  readonly registry: {
    readonly registerRuleGroup: typeof registerRuleGroup;
    readonly registerRule: typeof registerRule;
    readonly namespacedRuleKey: typeof namespacedRuleKey;
    readonly isAddonRuleKey: typeof isAddonRuleKey;
    /** Whether a rule is in play: a system key, or a module's `<module>.<key>`. */
    readonly isRuleOn: typeof isRuleOn;
    /** Every rule's state, unimplemented ones forced off. */
    readonly activeRules: typeof activeRules;
  };
  /** Rolls posted to chat through the system's own cards, and resolvers for the contests it offers. */
  readonly roll: {
    /** A random hit location, with the modules' locations (since 1.43.0). */
    readonly hitLocation: typeof rollHitLocation;
    /** The system's Fright Check at a modifier (since 1.39.0). */
    readonly frightCheck: (actor: any, modifier?: number) => ReturnType<typeof rollFrightCheck>;
    readonly success: typeof rollSuccess;
    readonly damage: typeof rollDamage;
    readonly quickContest: typeof rollQuickContest;
    readonly regularContest: typeof rollRegularContest;
    readonly registerContestResolver: typeof registerContestResolver;
    /**
     * The lines using an item with a skill puts on a roll (since 1.75.0): its
     * TL against the skill's and the familiarity penalty (Characters pp. 168-169).
     */
    readonly equipmentUse: typeof equipmentUseLines;
    /**
     * A damage formula as the table rolls it (since 1.125.0): converted by
     * Modifying Dice + Adds (Characters p. 269) where that rule is on, with
     * the raw formula and whether anything changed.
     */
    readonly normalizeDamage: typeof normalizeDamage;
  };
  readonly actors: typeof actors;
  readonly items: typeof items;
  /**
   * Combat extension points (since 1.1.0): maneuvers, attack and defense
   * options, extra effort, hit locations, per-combatant and per-weapon state,
   * and the names of the combat hooks.
   */
  readonly combat: typeof combat;
  /** Data extension points (since 1.2.0): item types, extension fields, prices, technique kinds. */
  readonly data: typeof dataApi;
  /** Sheet extension points (since 1.3.0): sections, row actions, GM tools. */
  readonly sheets: typeof sheetsApi;
  /** Chat cards (since 1.3.0). */
  readonly chat: typeof chatApi;
  /** Point pools (since 1.4.0), and charging unspent points (since 1.39.0). */
  readonly points: typeof points;
  /** Energy sources and spell attacks (since 1.4.0), and resistance cards (since 1.9.0). */
  readonly magic: typeof magic;
  /** Moving world data from the system into a module (since 1.6.0). */
  readonly migration: typeof migrationApi;
  /** Hazards as the GM tool runs them (since 1.63.0): electrical shocks and radiation doses; demolition charges since 1.74.0. */
  readonly hazards: typeof hazardsApi;
  /** Areas on a scene that change rolls made in or through them (since 1.63.0). */
  readonly areas: typeof areasApi;
  /** The party an actor is in, its members and the campaign's terms (since 1.68.0). */
  readonly party: typeof partyApi;
  /** Facts about the campaign world (since 1.77.0): its Control Rating, its terms since 1.82.0, and the day's temperature since 1.138.0. */
  readonly world: typeof worldApi;
  /** Social rolls (since 1.103.0): the skills the Influence roll offers. */
  readonly social: typeof socialApi;
  /** The hooks the API fires, by name; `partyChanged` since 1.68.0, `campaignChanged` since 1.82.0. */
  readonly hooks: { readonly registerRules: string; readonly ready: string; readonly partyChanged: string; readonly campaignChanged: string };
  /** Whether this API satisfies a semver range, as a module's manifest would declare it. */
  readonly satisfies: (range: string) => boolean;
}

/**
 * The combat namespace: the extension points from 1.1.0, and from 1.5.0 the
 * options on the system's maneuvers, attack sequences, derived attack modes,
 * grapple actions, and the procedure hooks' names.
 */
const combat = Object.freeze({
  ...combatApi,
  registerManeuverOption,
  registerDerivedAttackMode,
  registerGrappleAction,
  registerSlam,
  // The grapple an actor is in, and changing it on both sides (since 1.34.0).
  // Since 1.45.0 a fighter may be in several: `grapples` is all of them, and
  // each of the others takes the foe whose grapple it means.
  grapple: grappleOf,
  grapples: grapplesOf,
  updateGrapple,
  beginGrapple,
  endGrapple,
  attackSequence: attackSequenceFor,
  // A skill of Zen Archery's shape for other weapons, rolling one, and the
  // success waiting for its shot (since 1.91.0; Characters p. 228).
  registerZenSkill,
  zenSkills: zenSkillsOf,
  rollZenSkill,
  zenShot: pendingZenShot,
  clearZenShot,
  hooks: Object.freeze({ ...combatApi.hooks, ...PROCEDURE_HOOKS }),
});

/**
 * Rolls a random hit location as the system does (since 1.43.0): 3d on the
 * table, then the modules' `gworld.randomHitLocation` listeners.
 */
async function rollHitLocation(options: { actor?: any; damageType?: string | null; arc?: "front" | "side" | "back" | null } = {}): Promise<{ hitLocation: string; addonLocation: string | null; roll: number }> {
  const dice = new Roll("3d6");
  await dice.evaluate();
  const total = Number(dice.total) || 10;
  const base = rules.randomHitLocation(total).location;
  const picked = randomLocationWithHooks(total, base, options.actor, { damageType: options.damageType ?? null, arc: options.arc ?? null });
  return { hitLocation: picked.hitLocation, addonLocation: picked.addonLocation, roll: total };
}

/**
 * The hazards namespace (since 1.63.0): an electrical shock and a dose of
 * radiation, as the GM tool runs them, from 1.74.0 a demolition charge, and
 * from 1.79.0 a shot at a vehicle, and from 1.93.0 what Fragile does. Since
 * 1.119.0 `shock` resolves to its `ShockOutcome`, and since 1.127.0 takes a
 * `source` and `tags` its hooks see.
 */
const hazardsApi = Object.freeze({
  /**
   * Drops a character as the sheet's Fall button does (Campaigns pp. 430-431;
   * since 1.104.0): `yards` fallen, `onto` `hard` (default) or `soft`,
   * `controlled` for a landing an Acrobatics roll made, and `modifiers` lines
   * added to the damage rolled. Resolves to the injury taken, or null.
   */
  fall(actor: any, options: { yards: number; onto?: LandingSurface; controlled?: boolean; modifiers?: Array<{ label: string; value: number }> }) {
    const o = options ?? ({} as { yards: number });
    return rollFall({
      actor, yardsFallen: Math.max(0, Number(o.yards) || 0), surface: o.onto === "soft" ? "soft" : "hard",
      controlled: o.controlled === true, ...(Array.isArray(o.modifiers) ? { modifiers: o.modifiers } : {}),
    });
  },
  shock, irradiate, detonate: detonateCharge, shootAtVehicle,
  // A vehicle control roll, with why it is made (since 1.115.0; Campaigns p. 466).
  controlVehicle: (options: { actor: any; vehicle: any; modifier?: number; reason?: string }) => controlVehicle({ ...options, modifier: Number(options?.modifier) || 0 }),
  fragileKinds: fragileKindsOf, fragileCatchesFire, fragileExplodes, brittleLimb: rollBrittleLimb,
});

/** The social namespace (since 1.103.0): a module's Influence skills (Campaigns p. 359). */
const socialApi = Object.freeze({ registerInfluenceSkill });

/**
 * The areas namespace (since 1.63.0): smoke, fog, a field that blinds a sense.
 * Cones, and `standsIn` for the tokens standing in an area, since 1.89.0;
 * `darknessAt`, the darkness at a token or a point, since 1.96.0; lights only
 * some can see (`registerLitFor`, `setLitFor`, `litFor`) since 1.100.0; a
 * module's own light on an area (`add`'s `light`) since 1.102.0; the darkness
 * a light leaves (`registerLightLevel`) since 1.116.0.
 */
const areasApi = Object.freeze({
  add: addArea, remove: removeArea, list: listAreas, standsIn: tokensInArea, darknessAt,
  registerLitFor, setLitFor, litFor: litForOf, registerLightLevel,
});

/** The points namespace: point pools, and from 1.39.0 charging a character's unspent points. */
const points = Object.freeze({ ...pointsApi, spendUnspent: spendUnspentPoints });

/** The magic namespace: energy sources and spell attacks, and from 1.9.0 resistance cards. */
const magic = Object.freeze({ ...magicApi, postResistance, manaLevel });

/**
 * The party namespace (since 1.68.0): which party an actor is in and its
 * members. `campaignTerms` is kept for modules written against it; since
 * 1.82.0 the terms are world settings (`world.campaignTerms`), and it gives
 * them for any player character, with its party or null.
 */
const partyApi = Object.freeze({ of: partyOf, membersOf, campaignTerms: actorCampaignTerms, addMembers, removeMember });

/**
 * The world namespace (since 1.77.0): the campaign's Control Rating (Campaigns
 * pp. 506-507), the world setting the Gear tab's legality notes read. `rating`
 * is 0-6, or null where none is set or the Legality Class rule is off;
 * `inPlay` is whether that rule is on.
 */
const worldApi = Object.freeze({
  controlRating(): { rating: ControlRating | null; inPlay: boolean } {
    return { rating: currentControlRating(), inPlay: isRuleOn("legalityClass") };
  },
  /**
   * The campaign's terms (since 1.82.0): starting points, disadvantage limit
   * and Tech Level as the GM set them for the world, null where left blank.
   */
  campaignTerms: worldCampaignTerms,
  /**
   * The day's weather (since 1.138.0; Campaigns pp. 426, 434):
   * `{ temperatureF, hot }`, the temperature in °F as the GM set it (null
   * where none is set) and whether it is a hot day -- for `actor` where one
   * is given, whose Temperature Tolerance counts, else for an ordinary human.
   */
  weather: (actor?: any) => dayWeather(actor),
  /**
   * Sets the day's temperature in °F, or clears it with null (since
   * 1.138.0). Only the GM may; resolves to whether it was set.
   */
  setTemperature: (temperatureF: number | null) => setTemperature(temperatureF),
});

/** Builds the frozen API object. */
export function createApi(): GWorldApi {
  return Object.freeze({
    version: API_VERSION,
    rules,
    registry: Object.freeze({ registerRuleGroup, registerRule, namespacedRuleKey, isAddonRuleKey, isRuleOn, activeRules }),
    roll: Object.freeze({ hitLocation: rollHitLocation, frightCheck: (actor: any, modifier = 0) => rollFrightCheck({ actor, modifier: Number(modifier) || 0 }), success: rollSuccess, damage: rollDamage, quickContest: rollQuickContest, regularContest: rollRegularContest, registerContestResolver, equipmentUse: equipmentUseLines, normalizeDamage }),
    actors: Object.freeze(actors),
    items: Object.freeze(items),
    combat,
    data: dataApi,
    sheets: sheetsApi,
    points,
    magic,
    migration: migrationApi,
    hazards: hazardsApi,
    areas: areasApi,
    chat: chatApi,
    party: partyApi,
    world: worldApi,
    social: socialApi,
    hooks: Object.freeze({ registerRules: REGISTER_RULES_HOOK, ready: READY_HOOK, partyChanged: PARTY_CHANGED_HOOK, campaignChanged: CAMPAIGN_CHANGED_HOOK }),
    satisfies: (range: string) => satisfiesApiRange(API_VERSION, range),
  });
}

/**
 * Tells the GM once, and plainly, about an active module that needs an API
 * this system doesn't provide. Its rules may be missing or broken, and the fix
 * is an update to one side or the other, not something to find by accident.
 */
export function warnIncompatibleModules(): void {
  if (!game.user?.isGM) return;
  const modules = [...((game.modules as Map<string, any> | undefined)?.values() ?? [])];
  for (const module of incompatibleModules(API_VERSION, modules)) {
    const message = game.i18n.format("GWORLD.Api.Incompatible", { module: module.title, range: module.range, version: API_VERSION });
    console.warn(`gworld | ${message}`);
    ui.notifications?.warn(message, { permanent: true });
  }
}
