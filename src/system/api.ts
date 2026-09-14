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
import { rollQuickContest, rollRegularContest } from "./contest.js";
import { activeRules, isRuleOn } from "./optional-rules.js";
import { REGISTER_RULES_HOOK, isAddonRuleKey, namespacedRuleKey, registerRule, registerRuleGroup } from "./rule-registry.js";
import { rollDamage, rollSuccess } from "./roll.js";

/**
 * The API's version. Raise the minor part when something is added, the major
 * part when something changes or goes. Independent of the system's version.
 */
export const API_VERSION = "1.0.0";

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
};

/** Reads an item's worked-out values. */
const items = {
  /** Everything the system worked out for an item this preparation, or null. Read-only. */
  derived(item: any): Record<string, any> | null {
    return (item?.system?.derived as Record<string, any> | undefined) ?? null;
  },
};

/** The API object, as `game.gworld.api` holds it. */
export interface GWorldApi {
  readonly version: string;
  /** The pure GURPS rules: dice, success rolls, contests, damage, hit locations, maneuvers, skills, costs. */
  readonly rules: typeof rules;
  /** Rule groups and switches (see the README's "A module's own rules"). */
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
  /** Rolls posted to chat through the system's own cards. */
  readonly roll: {
    readonly success: typeof rollSuccess;
    readonly damage: typeof rollDamage;
    readonly quickContest: typeof rollQuickContest;
    readonly regularContest: typeof rollRegularContest;
  };
  readonly actors: typeof actors;
  readonly items: typeof items;
  /** The hooks the API fires, by name. */
  readonly hooks: { readonly registerRules: string; readonly ready: string };
  /** Whether this API satisfies a semver range, as a module's manifest would declare it. */
  readonly satisfies: (range: string) => boolean;
}

/** Builds the frozen API object. */
export function createApi(): GWorldApi {
  return Object.freeze({
    version: API_VERSION,
    rules,
    registry: Object.freeze({ registerRuleGroup, registerRule, namespacedRuleKey, isAddonRuleKey, isRuleOn, activeRules }),
    roll: Object.freeze({ success: rollSuccess, damage: rollDamage, quickContest: rollQuickContest, regularContest: rollRegularContest }),
    actors: Object.freeze(actors),
    items: Object.freeze(items),
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
