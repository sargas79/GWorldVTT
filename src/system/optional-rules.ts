/**
 * The rules a table can turn on and off.
 *
 * GURPS is written to be played at several depths. A group that wants a fast
 * fight does not want a Fright Check every time something horrible walks in,
 * and one that wants the whole system does. The book says as much itself,
 * marking a good deal of chapters 10 to 13 as optional or as detail the GM may
 * skip.
 *
 * So each rule that is not part of the spine is registered here with the page
 * that defines it, and asked about at the point where it would apply. A rule
 * that is off behaves as though it had never been written: no penalty applied,
 * no control shown, nothing to explain.
 *
 * Everything lives in one stored object rather than thirty separate settings,
 * so the core settings list stays readable and the whole set can be handed
 * around as one blob.
 */

import { SYSTEM_ID } from "./constants.js";

export const OPTIONAL_RULES_KEY = "optionalRules";

/** One switchable rule. */
export interface OptionalRule {
  key: string;
  /** Where it lives in the book, shown beside the switch. */
  reference: string;
  /** On unless the table says otherwise. */
  default: boolean;
  /**
   * False for a rule this system does not yet read. It is still listed, greyed
   * out, so the page is a map of the ruleset rather than only of the parts
   * that happen to be finished -- but it cannot be switched on, because
   * switching it on would do nothing.
   */
  implemented?: boolean;
}

/** The groups the settings page shows, in the order it shows them. */
export const RULE_GROUPS = [
  { id: "combat", label: "GWORLD.Rules.Group.Combat" },
  { id: "injury", label: "GWORLD.Rules.Group.Injury" },
  { id: "rolls", label: "GWORLD.Rules.Group.Rolls" },
  { id: "activities", label: "GWORLD.Rules.Group.Activities" },
] as const;

export type RuleGroup = (typeof RULE_GROUPS)[number]["id"];

/**
 * Every rule that can be switched off, by group.
 *
 * A rule is only listed here if turning it off leaves a coherent game. The
 * spine -- success rolls, damage, DR, the active defenses -- is not optional
 * and is not here.
 */
export const OPTIONAL_RULES: Record<RuleGroup, OptionalRule[]> = {
  combat: [
    { key: "feint", reference: "Campaigns p. 365", default: true, implemented: false },
    { key: "deceptiveAttack", reference: "Campaigns p. 369", default: true },
    { key: "rapidStrike", reference: "Campaigns p. 370", default: true },
    { key: "retreat", reference: "Campaigns p. 377", default: true },
    { key: "rapidFire", reference: "Campaigns p. 373", default: true },
    { key: "opportunityFire", reference: "Campaigns p. 390", default: true },
    { key: "closeCombat", reference: "Campaigns p. 391", default: true },
    { key: "slams", reference: "Campaigns p. 371", default: true },
    { key: "evading", reference: "Campaigns p. 368", default: true },
  ],
  injury: [
    { key: "hitLocations", reference: "Campaigns p. 398", default: true },
    { key: "explosions", reference: "Campaigns p. 414", default: true },
    { key: "afflictions", reference: "Characters p. 35", default: true },
    { key: "knockback", reference: "Campaigns p. 378", default: true, implemented: false },
    { key: "criticalTables", reference: "Campaigns p. 556", default: true, implemented: false },
  ],
  rolls: [
    { key: "regularContests", reference: "Campaigns p. 349", default: true, implemented: false },
    { key: "frightChecks", reference: "Campaigns p. 360", default: true, implemented: false },
    { key: "extraEffort", reference: "Campaigns p. 356", default: true, implemented: false },
  ],
  activities: [
    { key: "physicalActivities", reference: "Campaigns pp. 349-355", default: true, implemented: false },
  ],
};

/** Whether the system actually reads a rule yet. */
export function isImplemented(key: string): boolean {
  for (const group of Object.values(OPTIONAL_RULES)) {
    const rule = group.find((r) => r.key === key);
    if (rule) return rule.implemented !== false;
  }
  return true;
}

/** Every rule key, flattened. */
export function allRuleKeys(): string[] {
  return Object.values(OPTIONAL_RULES).flatMap((group) => group.map((rule) => rule.key));
}

/** The defaults, as the stored object shape. */
export function defaultRuleState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const group of Object.values(OPTIONAL_RULES)) {
    for (const rule of group) state[rule.key] = rule.default;
  }
  return state;
}

/**
 * The stored state, filled in from the defaults.
 *
 * A key added by a later version is missing from a world saved by an earlier
 * one, and must read as its default rather than as off -- a new rule silently
 * disabled everywhere is the wrong way round.
 */
export function ruleState(): Record<string, boolean> {
  const state = defaultRuleState();

  // Asked before the settings are registered, or somewhere there is no Foundry
  // at all, this is the defaults. A rule that reads as off because the registry
  // was not ready yet would be a rule silently missing from a fight.
  const settings = (globalThis as { game?: { settings?: { get?: unknown } } }).game?.settings;
  if (typeof settings?.get !== "function") return state;

  const stored = (game.settings.get(SYSTEM_ID, OPTIONAL_RULES_KEY) ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(state)) {
    if (typeof stored[key] === "boolean") state[key] = stored[key];
  }
  return state;
}

/**
 * Whether one rule is in play.
 *
 * An unknown key reads as on. A rule asked about before it has been registered
 * here is a rule someone forgot to list, and quietly disabling it would be a
 * harder bug to find than the missing entry.
 */
export function isRuleOn(key: string): boolean {
  // A rule nothing reads is off whatever the stored state says. Flipping
  // `implemented` is then the single switch that brings one into play, rather
  // than something to remember alongside wiring it up.
  if (!isImplemented(key)) return false;
  const state = ruleState();
  return key in state ? state[key]! : true;
}
