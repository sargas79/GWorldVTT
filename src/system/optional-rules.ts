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
  { id: "magic", label: "GWORLD.Rules.Group.Magic" },
  { id: "equipment", label: "GWORLD.Rules.Group.Equipment" },
  { id: "cinematic", label: "GWORLD.Rules.Group.Cinematic" },
  { id: "monsterHunters", label: "GWORLD.Rules.Group.MonsterHunters" },
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
    { key: "feint", reference: "Campaigns p. 365", default: true },
    { key: "deceptiveAttack", reference: "Campaigns p. 369", default: true },
    { key: "rapidStrike", reference: "Campaigns p. 370", default: true },
    { key: "retreat", reference: "Campaigns p. 377", default: true },
    { key: "rapidFire", reference: "Campaigns p. 373", default: true },
    { key: "opportunityFire", reference: "Campaigns p. 390", default: true },
    { key: "closeCombat", reference: "Campaigns p. 391", default: true },
    { key: "slams", reference: "Campaigns p. 371", default: true },
    { key: "grappling", reference: "Campaigns p. 370", default: true },
    { key: "evading", reference: "Campaigns p. 368", default: true },
    { key: "malfunctions", reference: "Campaigns p. 407", default: true },
    { key: "dualWeaponAttack", reference: "Campaigns p. 417", default: true },
    { key: "scatter", reference: "Campaigns p. 414", default: true },
    { key: "mountedCombat", reference: "Campaigns pp. 396-397", default: true },
    { key: "highSpeed", reference: "Campaigns pp. 394-395", default: true },
    { key: "overpenetration", reference: "Campaigns p. 408", default: true },
    { key: "dirtyTricks", reference: "Campaigns p. 405", default: true },
    { key: "trampling", reference: "Campaigns p. 404", default: true },
    { key: "swarms", reference: "Campaigns p. 461", default: true },
  ],
  injury: [
    { key: "hitLocations", reference: "Campaigns p. 398", default: true },
    { key: "explosions", reference: "Campaigns p. 414", default: true },
    { key: "afflictions", reference: "Characters p. 35", default: true },
    { key: "knockback", reference: "Campaigns p. 378", default: true },
    { key: "criticalTables", reference: "Campaigns p. 556", default: true },
    { key: "knockdown", reference: "Campaigns p. 420", default: true },
    // "These rules add realism... but they also require extra record keeping,
    // so they are optional" -- the book's own words, and the reason this one
    // starts switched off.
    { key: "bleeding", reference: "Campaigns p. 420", default: false },
  ],
  rolls: [
    { key: "regularContests", reference: "Campaigns p. 349", default: true },
    { key: "frightChecks", reference: "Campaigns p. 360", default: true },
    { key: "extraEffort", reference: "Campaigns p. 356", default: true },
    { key: "reactions", reference: "Campaigns pp. 359, 494", default: true },
  ],
  activities: [
    { key: "physicalActivities", reference: "Campaigns pp. 349-355", default: true },
    // "The GM may ignore this entirely" is how the book opens the food section,
    // which is why the whole block is one switch rather than four.
    { key: "exposure", reference: "Campaigns pp. 426-435", default: true },
    { key: "poison", reference: "Campaigns pp. 437-439", default: true },
    { key: "intoxication", reference: "Campaigns pp. 439-441", default: true },
    { key: "disease", reference: "Campaigns pp. 442-444", default: true },
    { key: "battleFatigue", reference: "Campaigns p. 426", default: true },
    { key: "study", reference: "Characters p. 292", default: true },
    { key: "jobs", reference: "Campaigns pp. 516-518", default: true },
    { key: "aging", reference: "Campaigns p. 444", default: true },
    { key: "socialBackground", reference: "Characters pp. 23-24", default: true },
    { key: "sleep", reference: "Campaigns pp. 426-427", default: true },
    { key: "hiking", reference: "Campaigns pp. 351, 426", default: true },
    { key: "collisions", reference: "Campaigns pp. 430-432", default: true },
    { key: "electricity", reference: "Campaigns pp. 432-433", default: true },
    { key: "fire", reference: "Campaigns pp. 433-434", default: true },
    { key: "radiation", reference: "Campaigns pp. 435-436", default: true },
    { key: "vehicles", reference: "Campaigns pp. 462-468", default: true },
    // The vehicle moves on its operator's turn, and plows ahead without them.
    { key: "vehicleManeuvers", reference: "Campaigns p. 467", default: true },
  ],
  magic: [
    // The whole chapter. A campaign without magic has no Magic tab, no
    // spells offered, nothing to explain.
    { key: "magic", reference: "Characters pp. 234-253", default: true },
    { key: "manaLevels", reference: "Characters p. 235", default: true },
    { key: "magicRituals", reference: "Characters p. 237", default: true },
    { key: "criticalSpellFailure", reference: "Characters p. 236", default: true },
    { key: "maintainingSpells", reference: "Characters p. 238", default: true },
    { key: "spellDistraction", reference: "Characters p. 236", default: true },
    { key: "ruleOf16", reference: "Campaigns p. 349", default: true },
    { key: "magicItems", reference: "Campaigns pp. 480-482", default: true },
  ],
  equipment: [
    // "An item has a LC only if it is likely to be controlled", and what the
    // class means depends on the campaign's Control Rating.
    { key: "legalityClass", reference: "Characters p. 267", default: true },
    // Cheap, good, fine and very fine: what each costs and does.
    { key: "weaponQuality", reference: "Characters pp. 274-279", default: true },
    // "-1 to weapon skill per point of ST you lack", and the FP at the end.
    { key: "minimumSt", reference: "Characters p. 270", default: true },
    // Parrying heavy weapons, striking at weapons, the Broken Weapons table.
    { key: "weaponBreakage", reference: "Campaigns pp. 376, 400, 485", default: true },
    // Shots counted off, Ready maneuvers to put them back, crossbow cocking.
    { key: "reloading", reference: "Campaigns p. 373", default: true },
    // Hollow-point, armour-piercing, bodkin points, silver.
    { key: "ammunitionTypes", reference: "Characters pp. 276, 279", default: true },
    // The bruise a mace leaves through mail that stopped it.
    { key: "bluntTrauma", reference: "Campaigns p. 379", default: true },
    // A breastplate protects the front alone; a helmet costs the corner of the eye.
    { key: "frontArmor", reference: "Characters pp. 282-283", default: true },
    // Armour over armour: -1 to DX, and only over something flexible.
    { key: "layeredArmor", reference: "Characters p. 286", default: true },
    // A shield that turned the blow by its own width may have taken it.
    { key: "damageToShields", reference: "Campaigns p. 484", default: false },
    // What the tools of a trade are worth to the roll that uses them.
    { key: "equipmentModifiers", reference: "Campaigns p. 345", default: true },
    // Mending what is broken, and the sand that breaks it.
    { key: "repairs", reference: "Campaigns pp. 484-485", default: true },
  ],
  // "Shamelessly unrealistic and strictly optional, but can be fun in
  // larger-than-life games!" -- the book's own words, and the reason every one
  // of these starts switched off. The rest of the list is realism a table may
  // not want the bookkeeping for; this group is the opposite, and switching it
  // on is a decision about what kind of game is being played.
  cinematic: [
    // A blast that throws people about and hurts nobody.
    { key: "cinematicExplosions", reference: "Campaigns p. 417", default: false },
    // A bullet that shoves like a club, and leaves the mind reeling.
    { key: "cinematicKnockback", reference: "Campaigns p. 417", default: false },
    // A character point to make a wound a scratch.
    { key: "fleshWounds", reference: "Campaigns p. 417", default: false },
    // A point of fatigue and the next turn to undo a failed defense.
    { key: "tvActionViolence", reference: "Campaigns p. 417", default: false },
    // A defense bonus for wearing very little, and a Move bonus for nothing.
    { key: "bulletproofNudity", reference: "Campaigns p. 417", default: false },
    // A mook who never defends and drops at the first scratch.
    { key: "cannonFodder", reference: "Campaigns p. 417", default: false },
    // A magazine that never empties and a gun that never jams.
    { key: "infiniteAmmunition", reference: "Campaigns p. 417", default: false },
    // A hero fought one at a time, and never from behind.
    { key: "meleeEtiquette", reference: "Campaigns p. 417", default: false },
  ],
  // The rules GURPS Monster Hunters 1: Champions adds or changes. The book is
  // not the Basic Set, and a table that does not own it has no use for its
  // rules, so every one starts switched off: the book's text arrives with the
  // private content module, and these are what make its entries do something.
  monsterHunters: [
    // A Talent does not reach a wildcard skill.
    { key: "talentsSkipWildcards", reference: "Monster Hunters 1 p. 24", default: false },
    // Holy water and holy things burn demons and vampires, once a minute.
    { key: "holyAttacks", reference: "Monster Hunters 1 p. 51", default: false },
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
 * The stored state with every unimplemented rule forced off.
 *
 * What a sheet or a template asks is "is this in play", which is the same
 * question `isRuleOn` answers one key at a time. Handing the raw stored state
 * to a template would show a control for a rule that reads as on and does
 * nothing.
 */
export function activeRules(): Record<string, boolean> {
  const state = ruleState();
  for (const key of Object.keys(state)) {
    if (!isImplemented(key)) state[key] = false;
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
