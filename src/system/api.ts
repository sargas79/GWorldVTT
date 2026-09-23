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
import { normalizeSkillName } from "../rules/skills.js";
import { incompatibleModules, satisfiesApiRange } from "./api-version.js";
import { combatApi } from "./combat-extensions.js";
import { loadInstantly, refundShots } from "./ammunition.js";
import { clearMalfunction, malfunctionOf, setMalfunction } from "./malfunctions.js";
import { registerSlam } from "./slam.js";
import { beginGrapple, endGrapple, grappleOf, grapplesOf, updateGrapple } from "./grappling.js";
import { dataApi } from "./data-extensions.js";
import { chatApi, sheetsApi } from "./sheet-extensions.js";
import { magicApi, pointsApi } from "./roll-extensions.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { migrationApi } from "./migration.js";
import { takeInjury, type InjuryTaken } from "./damage.js";
import { stopBleeding } from "./bleeding.js";
import { activePoisons, advancePoison, clearPoison, dosePoison, treatIllness, treatPoison, type ActivePoison } from "./poison.js";
import { applyFirstAid, attendPatient, operate, resuscitate } from "./recovery.js";
import { rollMortalWound } from "./dying.js";
import type { Poison, Treatment } from "../rules/poison.js";
import type { ResuscitationCause } from "../rules/medicine.js";
import type { ControlRating } from "../rules/legality.js";
import { currentControlRating } from "./legality.js";
import { undoKnockdown } from "./knockdown.js";
import { isUndoable, undoDamage, type DamageTransaction, type UndoOutcome } from "./damage-undo.js";
import { carriedAmmunitionFor, loadAmmunition } from "./ammunition.js";
import { randomLocationWithHooks } from "./combat-extensions.js";
import { irradiate, shock, shootAtVehicle } from "./hazards.js";
import { detonateCharge } from "./demolition.js";
import { equipmentUseLines } from "./tech-level.js";
import { addArea, listAreas, removeArea } from "./modifier-areas.js";
import { rollFrightCheck } from "./fright.js";
import { spendUnspentPoints } from "./bonus-points.js";
import {
  PROCEDURE_HOOKS,
  activeConditions,
  applyCondition,
  attackSequenceFor,
  registerContestResolver,
  registerDerivedAttackMode,
  registerGrappleAction,
  registerManeuverOption,
  removeCondition,
  type ConditionApplication,
} from "./procedure-extensions.js";
import { rollQuickContest, rollRegularContest } from "./contest.js";
import { activeRules, isRuleOn } from "./optional-rules.js";
import { REGISTER_RULES_HOOK, isAddonRuleKey, namespacedRuleKey, registerRule, registerRuleGroup } from "./rule-registry.js";
import { rollDamage, rollSuccess } from "./roll.js";
import { postResistance } from "./spell-resistance.js";
import { manaLevel } from "./casting.js";
import { PARTY_CHANGED_HOOK, addMembers, membersOf, partyOf, removeMember } from "./party.js";
import { CAMPAIGN_CHANGED_HOOK, actorCampaignTerms, worldCampaignTerms } from "./campaign.js";

/**
 * The API's version. Raise the minor part when something is added, the major
 * part when something changes or goes. Independent of the system's version.
 */
export const API_VERSION = "1.84.0";

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
    const wanted = normalizeSkillName(name);
    for (const item of actor.items ?? []) {
      if (item?.type !== "skill") continue;
      if (normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
      const level = item.system?.derived?.level;
      return typeof level === "number" ? level : null;
    }
    return null;
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

  /** Removes a condition by the id `applyCondition` returned (since 1.5.0). */
  removeCondition(actor: any, id: string): Promise<void> {
    return removeCondition(actor, id, { setSystemCondition: setCondition });
  },

  /** The timed conditions on an actor (since 1.5.0). */
  conditions(actor: any) {
    return activeConditions(actor);
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
   * `label` names who treats on the card. Returns the HP it moved.
   */
  firstAid(options: { healer: any; patient: any; skill?: number; techLevel?: number; label?: string; modifier?: number }): Promise<number> {
    return applyFirstAid({ ...options, modifier: options.modifier ?? 0 });
  },

  /** A physician's rounds on a patient (p. 424, since 1.60.0); the roll is tagged `physician`. */
  attendPatient(options: { healer: any; patient: any; skill?: number; label?: string; modifier?: number }): Promise<void> {
    return attendPatient({ ...options, modifier: options.modifier ?? 0 });
  },

  /** An operation (p. 424, since 1.60.0); the roll is tagged `surgery`. */
  operate(options: { surgeon: any; patient: any; skill?: number; techLevel?: number; anesthetic?: boolean; repairingCrippled?: boolean; equipmentQuality?: number; label?: string; modifier?: number }): Promise<void> {
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
  /** Facts about the campaign world (since 1.77.0): its Control Rating, and its terms since 1.82.0. */
  readonly world: typeof worldApi;
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
 * from 1.79.0 a shot at a vehicle.
 */
const hazardsApi = Object.freeze({ shock, irradiate, detonate: detonateCharge, shootAtVehicle });

/** The areas namespace (since 1.63.0): smoke, fog, a field that blinds a sense. */
const areasApi = Object.freeze({ add: addArea, remove: removeArea, list: listAreas });

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
});

/** Builds the frozen API object. */
export function createApi(): GWorldApi {
  return Object.freeze({
    version: API_VERSION,
    rules,
    registry: Object.freeze({ registerRuleGroup, registerRule, namespacedRuleKey, isAddonRuleKey, isRuleOn, activeRules }),
    roll: Object.freeze({ hitLocation: rollHitLocation, frightCheck: (actor: any, modifier = 0) => rollFrightCheck({ actor, modifier: Number(modifier) || 0 }), success: rollSuccess, damage: rollDamage, quickContest: rollQuickContest, regularContest: rollRegularContest, registerContestResolver, equipmentUse: equipmentUseLines }),
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
