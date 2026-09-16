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
import { loadInstantly } from "./ammunition.js";
import { registerSlam } from "./slam.js";
import { beginGrapple, endGrapple, grappleOf, grapplesOf, updateGrapple } from "./grappling.js";
import { dataApi } from "./data-extensions.js";
import { chatApi, sheetsApi } from "./sheet-extensions.js";
import { magicApi, pointsApi } from "./roll-extensions.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { migrationApi } from "./migration.js";
import { takeInjury, type InjuryTaken } from "./damage.js";
import { stopBleeding } from "./bleeding.js";
import { undoKnockdown } from "./knockdown.js";
import { randomLocationWithHooks } from "./combat-extensions.js";
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

/**
 * The API's version. Raise the minor part when something is added, the major
 * part when something changes or goes. Independent of the system's version.
 */
export const API_VERSION = "1.53.0";

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

  /** Takes back a knockdown's stun, fall and unconsciousness, and restores a posture (since 1.39.0). */
  undoKnockdown(actor: any, options: { posture?: string } = {}): Promise<boolean> {
    return undoKnockdown(actor, options);
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
  /** The hooks the API fires, by name. */
  readonly hooks: { readonly registerRules: string; readonly ready: string };
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

/** The points namespace: point pools, and from 1.39.0 charging a character's unspent points. */
const points = Object.freeze({ ...pointsApi, spendUnspent: spendUnspentPoints });

/** The magic namespace: energy sources and spell attacks, and from 1.9.0 resistance cards. */
const magic = Object.freeze({ ...magicApi, postResistance, manaLevel });

/** Builds the frozen API object. */
export function createApi(): GWorldApi {
  return Object.freeze({
    version: API_VERSION,
    rules,
    registry: Object.freeze({ registerRuleGroup, registerRule, namespacedRuleKey, isAddonRuleKey, isRuleOn, activeRules }),
    roll: Object.freeze({ hitLocation: rollHitLocation, frightCheck: (actor: any, modifier = 0) => rollFrightCheck({ actor, modifier: Number(modifier) || 0 }), success: rollSuccess, damage: rollDamage, quickContest: rollQuickContest, regularContest: rollRegularContest, registerContestResolver }),
    actors: Object.freeze(actors),
    items: Object.freeze(items),
    combat,
    data: dataApi,
    sheets: sheetsApi,
    points,
    magic,
    migration: migrationApi,
    chat: chatApi,
    hooks: Object.freeze({ registerRules: REGISTER_RULES_HOOK, ready: READY_HOOK }),
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
