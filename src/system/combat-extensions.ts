/**
 * Where an add-on module plugs into combat.
 *
 * The Basic Set's maneuvers, attack options and defenses are written into the
 * system. A module that plays another book's combat rules adds to them from
 * here, and only from here:
 *
 *   - **Maneuvers**, with the same movement and defense allowances the
 *     system's own carry, and an optional choice made with the maneuver.
 *   - **Attack options** and **extra-effort options**, shown in the attack
 *     dialog: each can change the roll, the defender's rolls, the damage, and
 *     what counts as a critical.
 *   - **Defense options**, shown on the defense card beside Retreat, and
 *     **defenses** of a module's own, which it resolves itself.
 *   - **Hit locations**, offered in the attack dialog and on the damage card,
 *     each built on one of the Basic Set's locations with what it changes.
 *   - **Hooks** on the attack, defense and damage rolls, on a blow about to
 *     land and one that has landed, on the odds of a parrying weapon breaking,
 *     and on a random hit location.
 *   - **State** a module keeps per combatant (cleared at a turn, round or
 *     combat boundary) and per weapon.
 *
 * Every registration names its module, and every key is stored as
 * `<module>.<key>`, as rule keys are. The system never asks which modules are
 * there: whatever is registered is offered where its `available` check says,
 * and nothing else changes.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  MANEUVERS,
  MANEUVER_ORDER,
  type DefenseAllowance,
  type Maneuver,
  type MovementAllowance,
} from "../rules/maneuvers.js";
import { ACROBATIC_DEFENSES_PER_TURN } from "../rules/defenses.js";
import { HIT_LOCATIONS, type HitLocation } from "../rules/hit-locations.js";
import type { DamageType } from "../rules/types.js";

/** A modifier line, as the roll cards show it. */
export interface ModifierLine {
  label: string;
  value: number;
}

export type DefenseKey = "dodge" | "parry" | "block";

/** The hooks this module fires, by name. */
export const COMBAT_HOOKS = Object.freeze({
  /** Before an attack roll: `{ actor, item, mode, rollType, ranged, modifiers, defensePenalty, dataset, skillCap, calledShot, targets, refusal, rangeYards, minRange, spraying }`, mutable (`rangeYards` and `minRange` since 1.69.0, `spraying` since 1.70.0). */
  attackModifiers: "gworld.attackModifiers",
  /** The defense card's choices for a defender: `{ defender, attack, delivery, damageType, choices, retreat, feverish, acrobatic }`, mutable. */
  defenseChoices: "gworld.defenseChoices",
  /** The arc an attack arrives from, before the card works out the defenses (since 1.38.0): `{ defender, attacker, arc, side }`, mutable. */
  attackArc: "gworld.attackArc",
  /** The weapons a character's best parry is picked from: `{ actor, attackedThisTurn, candidates }`, mutable. */
  parryWeapons: "gworld.parryWeapons",
  /** Before a defense roll: `{ defender, defense, attack, modifiers, deception, attacker }`, mutable. */
  defenseModifiers: "gworld.defenseModifiers",
  /** Before a damage roll: `{ actor, item, mode, label, formula, damageType, modifiers, distanceYards }`, mutable (`distanceYards` since 1.69.0). */
  damageModifiers: "gworld.damageModifiers",
  /** A blow about to be worked out against a target: `{ actor, item, mode, damage }`, the damage mutable. */
  injury: "gworld.injury",
  /** A blow that has been applied: `{ actor, item, mode, damage, result }`. */
  afterDamage: "gworld.afterDamage",
  /** Before a heavy-parry breakage roll: `{ defender, item, attackWeapon, breakage }`, `breakage` mutable. */
  breakageOdds: "gworld.breakageOdds",
  /** A random hit location: `{ roll, location, addonLocation, actor }`, the locations mutable. */
  randomHitLocation: "gworld.randomHitLocation",
  /** An item's attack rows once worked out: `{ actor, item, rows, damageAt, rangeAt, addToDamage }`, the rows mutable. */
  weaponAttacks: "gworld.weaponAttacks",
  /** Before an equipment failure roll: `{ actor, item, target, modifiers }`; push lines to `modifiers`. */
  equipmentFailure: "gworld.equipmentFailure",
  /** A character's maneuver allowances as their data is prepared: `{ actor, maneuver, option, movement, defense }`, the allowances mutable. */
  maneuverAllowances: "gworld.maneuverAllowances",
  /** Before the melee attack dialog: `{ actor, item, maneuver, rapidStrike, deceptiveAttack }`, each `{ available, refusal }`. */
  meleeAttackOptions: "gworld.meleeAttackOptions",
  /** Before a feint is rolled (since 1.28.0): `{ actor, foe, item, mode, ranged, modifiers, refusal }`, mutable. */
  feintModifiers: "gworld.feintModifiers",
  /** What may be struck at on a foe (since 1.31.0): `{ actor, foe, targets }`, the targets mutable. */
  weaponTargets: "gworld.weaponTargets",
  /** An unarmed blow applied to a target (since 1.32.0): `{ attacker, target, part, hitLocation, addonLocation, dr, basicDamage, minimumDr, applies }`, mutable. */
  hurtingYourself: "gworld.hurtingYourself",
  /** Before a blow's DR is added up (since 1.48.0): `{ actor, item, mode, hitLocation, damageType, basicDamage, ignoresDr, arc, lines }`, the lines mutable (`ignoresDr` since 1.55.0, `arc` since 1.56.0). */
  armorDr: "gworld.armorDr",
  /** Where a ranged mode's capacity and reload time are read (since 1.54.0): `{ actor, item, modeIndex, mode, entry }`, the entry mutable. */
  shotsEntry: "gworld.shotsEntry",
  /** After an attack that spent shots (since 1.71.0): `{ actor, item, modeIndex, mode, shots, fired, extra, wasted, kind, targets }`. */
  afterShots: "gworld.afterShots",
  /** A malfunction rolled on the table (since 1.71.0): `{ actor, item, modeIndex, attackRoll, roll, techLevel, revolver, kind, label, repair, fires, clears, explodes, jams }`, the result mutable. */
  malfunction: "gworld.malfunction",
  /** Before an attempt to clear a malfunction (since 1.71.0): `{ actor, item, modeIndex, malfunction, rolls, readyManeuvers, hours, needsBothHands, criticalFailure, modifiers, aids, refusal }`, mutable. */
  clearMalfunction: "gworld.clearMalfunction",
});

/** One piece of worn armour as `gworld.armorDr` hands it to a listener. */
export interface ArmorDrLine {
  /**
   * The part of the piece's DR that still counts against an attack that
   * ignores DR (since 1.55.0): 0 for none, which is every piece unless a
   * listener says otherwise.
   */
  againstIgnoresDr?: number;
  /** What the piece is called. */
  label: string;
  /** The DR it offers against this blow, which a listener may change. */
  dr: number;
  /** Whether it counts at all: set false to refuse a piece against this attack. */
  applies: boolean;
  /** True for a Force Field, which meets the blow before the rest (Characters p. 47). */
  forceField: boolean;
  /** True for flexible armour, which blunt trauma is read against. */
  flexible: boolean;
  /** Levels of Hardened on the piece, which a listener may change. */
  hardened: number;
  /** Why a listener changed it, shown beside the figure. */
  reason?: string;
  /**
   * The id of the armour item on the actor (since 1.56.0), so a listener can
   * read the piece's own data. Absent on a line a listener added itself.
   */
  itemId?: string;
}

// ── an item's attack rows ──────────────────────────────────────────────────

/** What a row was worked out from, before grade, material and ammunition. */
export interface WeaponRowBasis {
  st: number;
  damage: string;
  damageType: string;
  armorDivisor: number;
  halfDamageRange: number;
  maxRange: number;
  /** The mode's minimum range in yards, zero for none (since 1.69.0). */
  minRange: number;
  accuracy: number;
  malfunction: number | null;
}

/** One of an item's attack rows, as `gworld.weaponAttacks` hands it to a listener. */
export interface WeaponRowEntry {
  kind: "melee" | "ranged";
  /** The stored mode, read-only. */
  mode: any;
  /** The derived row, which a listener may change. */
  row: any;
  basis: WeaponRowBasis;
}

/** The row fields a listener may change. */
const WEAPON_ROW_FIELDS = [
  "skillLevel", "damage", "damageType", "armorDivisor", "halfDamageRange", "maxRange", "minRange", "accuracy",
  "malfunction", "projectiles", "rateOfFire", "minSt", "material", "holy", "notes", "followUp", "reach", "parry", "twoHanded",
  "feint", "skillName", "readiesAfterAttack", "affliction", "afflictionAttribute", "afflictionModifier",
  "recoil", "noSprayingFire", "noSuppressionFire",
] as const;

/**
 * Lets modules change an item's attack rows once they are worked out, then
 * makes the rows whole again: the range text and whether the damage can be
 * rolled follow the figures, and notes and a follow-up are kept only in the
 * shape the Combat tab reads. Every row starts with a `notes` list to push to.
 *
 * Foundry logs a listener's error and goes on to the next; where the hooks are
 * called without that guard, an error puts the rows back as they were.
 */
export function adjustWeaponAttacks(options: {
  actor: any;
  item: any;
  rows: WeaponRowEntry[];
  damageAt: (entry: WeaponRowEntry, st: number) => string;
  rangeAt: (entry: WeaponRowEntry, st: number) => { halfDamageRange: number; maxRange: number };
  addToDamage: (formula: string, bonus: number) => string;
  isRollable: (entry: WeaponRowEntry) => boolean;
  /** The actor's level in a skill as this preparation worked it out, or null (since 1.30.0). */
  skillLevel?: (name: string) => number | null;
}): void {
  if (options.rows.length === 0) return;
  for (const entry of options.rows) {
    if (!Array.isArray(entry.row.notes)) entry.row.notes = [];
    if (entry.row.followUp === undefined) entry.row.followUp = null;
    // Whether the row offers a Feint (since 1.28.0): melee rows do, ranged ones don't.
    if (typeof entry.row.feint !== "boolean") entry.row.feint = entry.kind === "melee";
  }
  const before = options.rows.map((entry) => Object.fromEntries(WEAPON_ROW_FIELDS.map((key) => [key, entry.row[key]])));
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(COMBAT_HOOKS.weaponAttacks, {
      actor: options.actor,
      item: options.item,
      rows: options.rows,
      damageAt: options.damageAt,
      rangeAt: options.rangeAt,
      addToDamage: options.addToDamage,
      skillLevel: options.skillLevel ?? (() => null),
    });
  } catch (error) {
    console.warn(`gworld | a ${COMBAT_HOOKS.weaponAttacks} listener failed`, error);
    options.rows.forEach((entry, index) => Object.assign(entry.row, before[index]));
    return;
  }
  options.rows.forEach((entry, index) => {
    const row = entry.row;
    if (entry.kind === "ranged") {
      const half = Math.max(0, Math.round(Number(row.halfDamageRange) || 0));
      const max = Math.max(0, Math.round(Number(row.maxRange) || 0));
      // The least distance the row can hit at (since 1.69.0), in yards; the
      // attack is refused inside it. Zero for none.
      const min = Math.max(0, Number(row.minRange) || 0);
      Object.assign(row, { halfDamageRange: half, maxRange: max, minRange: min, range: half ? `${half} / ${max}` : String(max) });
      // Recoil a whole number, 0 for none, and whether the row may spray or
      // suppress its fire (since 1.70.0).
      row.recoil = Math.max(0, Math.floor(Number(row.recoil) || 0));
      row.noSprayingFire = row.noSprayingFire === true;
      row.noSuppressionFire = row.noSuppressionFire === true;
    }
    // Reach is text, Parry a whole number or none, and two-handed a flag (since 1.21.0).
    row.reach = typeof row.reach === "string" ? row.reach : String(row.reach ?? "");
    row.parry = row.parry === null || row.parry === undefined || !Number.isFinite(Number(row.parry)) ? null : Math.round(Number(row.parry));
    // A Parry moved up or down moves the weapon's parry modifier with it, so the
    // defense worked out from the weapon's skill agrees with the row.
    const was = before[index]?.parry;
    if (typeof was === "number" && row.parry !== null && row.parry !== was) {
      row.parryModifier = (Number(row.parryModifier) || 0) + (row.parry - was);
    }
    row.twoHanded = row.twoHanded === true;
    row.feint = row.feint === true;
    // The skill a row names, and whether attacking leaves it unready (since 1.30.0).
    row.skillName = typeof row.skillName === "string" ? row.skillName : String(row.skillName ?? "");
    row.readiesAfterAttack = row.readiesAfterAttack === true;
    row.notes = (Array.isArray(row.notes) ? row.notes : [])
      .filter((n: any) => typeof n?.label === "string" && n.label.trim())
      .map((n: any) => ({ label: String(n.label), hint: String(n.hint ?? "") }));
    const follow = row.followUp;
    // A second attack that lands with this one (Characters p. 106), kept in
    // the shape the Combat tab and the damage card read. An affliction's
    // resistance roll is the one case where the second line is not damage.
    row.followUp = follow && typeof follow.damage === "string" && follow.damage.trim()
      ? {
          damage: follow.damage,
          damageType: String(follow.damageType ?? "cr"),
          explosive: Boolean(follow.explosive),
          armorDivisor: Number(follow.armorDivisor) > 0 ? Number(follow.armorDivisor) : 1,
          ...(follow.affliction
            ? {
                affliction: true,
                afflictionAttribute: String(follow.afflictionAttribute ?? ""),
                afflictionModifier: Math.min(0, Math.floor(Number(follow.afflictionModifier) || 0)),
              }
            : {}),
          ...(typeof follow.fragmentation === "string" && follow.fragmentation.trim()
            ? { fragmentation: follow.fragmentation.trim() }
            : {}),
          ...(follow.followUp ? { followUp: true } : {}),
          ...(follow.label ? { label: String(follow.label) } : {}),
        }
      : null;
    // Whether the row is an affliction, what resists it and at what (since
    // 1.55.0). A row that is not one resists with nothing.
    row.affliction = row.affliction === true;
    row.afflictionAttribute = row.affliction ? String(row.afflictionAttribute ?? "") : "";
    row.afflictionModifier = row.affliction ? Math.floor(Number(row.afflictionModifier) || 0) : 0;
    row.damageRollable = options.isRollable(entry);
  });
}

/** What `gworld.feintModifiers` hands a listener, and what it may change. */
export interface FeintContext {
  actor: any;
  foe: any;
  item: any;
  mode: { index: number; ranged: boolean; derived?: string } | null;
  ranged: boolean;
  modifiers: ModifierLine[];
  refusal: string | null;
}

/** Runs the feint hook: the lines modules put on the feinter's roll, and why it can't be made, if it can't. */
export function feintModifiers(context: Omit<FeintContext, "modifiers" | "refusal">): { modifiers: ModifierLine[]; refusal: string | null } {
  const hooked = callCombatHook(COMBAT_HOOKS.feintModifiers, { ...context, modifiers: [] as ModifierLine[], refusal: null as string | null });
  const modifiers = (hooked.modifiers ?? []).filter((m) => typeof m?.label === "string" && typeof m.value === "number" && Number.isFinite(m.value));
  const refusal = typeof hooked.refusal === "string" && hooked.refusal.trim() ? hooked.refusal.trim() : null;
  return { modifiers, refusal };
}

/** Runs the equipment failure hook: the target, and the lines modules added to it. */
export function equipmentFailureModifiers(actor: any, item: any, target: number): { target: number; modifiers: ModifierLine[] } {
  const context = callCombatHook(COMBAT_HOOKS.equipmentFailure, { actor, item, target, modifiers: [] as ModifierLine[] });
  const modifiers = (context.modifiers ?? []).filter((m) => typeof m?.label === "string" && typeof m.value === "number" && Number.isFinite(m.value));
  return { target: target + modifiers.reduce((sum, m) => sum + m.value, 0), modifiers };
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

function checkNames(what: string, module: unknown, key: unknown, label: unknown): string | null {
  if (typeof module !== "string" || !IDENTIFIER.test(module)) return "the module id is missing or malformed";
  if (typeof key !== "string" || !IDENTIFIER.test(key)) return "the key is missing or malformed";
  if (typeof label !== "string" || !label.trim()) return "it has no label";
  void what;
  return null;
}

// ── maneuvers ──────────────────────────────────────────────────────────────

export interface ManeuverRegistration {
  module: string;
  key: string;
  /** A localization key or plain text. */
  label: string;
  movement: MovementAllowance;
  defense: DefenseAllowance;
  /** True when the maneuver itself makes an attack. */
  attacks: boolean;
  /** Choices made with the maneuver, stored in `system.maneuverOption`. */
  options?: Array<{ key: string; label: string }>;
  /** Whether the maneuver is offered to this actor right now (e.g. "my switch is on"). Defaults to always. */
  available?: (actor: any) => boolean;
}

export interface AddonManeuver {
  /** `<module>.<key>`, as stored in `system.maneuver`. */
  key: string;
  module: string;
  label: string;
  movement: MovementAllowance;
  defense: DefenseAllowance;
  attacks: boolean;
  options: Array<{ key: string; label: string }>;
  available: (actor: any) => boolean;
}

const maneuvers = new Map<string, AddonManeuver>();

const MOVEMENTS: readonly MovementAllowance[] = ["none", "step", "half", "full"];
const DEFENSES: readonly DefenseAllowance[] = ["any", "none", "dodgeAndBlockOnly"];

/** Registers a maneuver. Returns its `<module>.<key>`, or null. */
export function registerManeuver(registration: ManeuverRegistration): string | null {
  const r = registration ?? ({} as ManeuverRegistration);
  const what = `maneuver ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (!MOVEMENTS.includes(r.movement)) return refuse(what, `movement must be one of ${MOVEMENTS.join(", ")}`);
  if (!DEFENSES.includes(r.defense)) return refuse(what, `defense must be one of ${DEFENSES.join(", ")}`);
  const key = `${r.module}.${r.key}`;
  if (maneuvers.has(key)) return refuse(what, "that key is already registered");
  maneuvers.set(key, {
    key,
    module: r.module,
    label: r.label.trim(),
    movement: r.movement,
    defense: r.defense,
    attacks: r.attacks === true,
    options: (r.options ?? [])
      .filter((o) => typeof o?.key === "string" && typeof o?.label === "string")
      .map((o) => ({ key: o.key, label: o.label })),
    available: typeof r.available === "function" ? r.available : () => true,
  });
  return key;
}

export function registeredManeuvers(): AddonManeuver[] {
  return [...maneuvers.values()];
}

/** Every value `system.maneuver` may hold: the system's maneuvers and the registered ones. */
export function maneuverKeys(): string[] {
  return [...MANEUVER_ORDER, ...maneuvers.keys()];
}

/** What a maneuver allows, for the system's own and registered ones alike. Unknown keys read as Do Nothing. */
export function maneuverInfo(key: string): { key: string; label: string; movement: MovementAllowance; defense: DefenseAllowance; attacks: boolean } {
  const own = MANEUVERS[key as Maneuver];
  if (own) return { key: own.key, label: own.label, movement: own.movement, defense: own.defense, attacks: own.attacks };
  const added = maneuvers.get(key);
  if (added) return { key, label: added.label, movement: added.movement, defense: added.defense, attacks: added.attacks };
  return { ...MANEUVERS.doNothing, key: "doNothing" };
}

/** Whether a maneuver permits any active defense. */
/**
 * A maneuver's movement and defenses for this actor, after the modules'
 * listeners: the maneuver's own, changed by `gworld.maneuverAllowances`.
 */
export function maneuverAllowancesFor(actor: any, maneuver: string, option: string): { movement: MovementAllowance; defense: DefenseAllowance } {
  const info = maneuverInfo(maneuver);
  const hooked = callCombatHook(COMBAT_HOOKS.maneuverAllowances, { actor, maneuver, option, movement: info.movement, defense: info.defense });
  return {
    movement: MOVEMENTS.includes(hooked.movement) ? hooked.movement : info.movement,
    defense: DEFENSES.includes(hooked.defense) ? hooked.defense : info.defense,
  };
}

export function maneuverAllowsDefense(key: string): boolean {
  return maneuverInfo(key).defense !== "none";
}

/** Whether a maneuver permits a parry. */
export function maneuverAllowsParry(key: string): boolean {
  return maneuverInfo(key).defense === "any";
}

// ── All-Out Attack options ─────────────────────────────────────────────────

/** A registered option's stored value: `<module>.<key>`. */
export const MODULE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface AllOutAttackOptionRegistration {
  module: string;
  key: string;
  /** A localization key or plain text. */
  label: string;
  /** What the option does to an attack made on it. It carries no Basic Set bonus. */
  attack?: (context: AttackContext) => AttackEffect | null;
  /** Whether it is offered to this actor. Defaults to always. */
  available?: (actor: any) => boolean;
}

const allOutAttackOptions = new Map<string, { key: string; label: string; attack: AllOutAttackOptionRegistration["attack"] | null; available: (actor: any) => boolean }>();

/** Registers an option for All-Out Attack, beside Determined, Double, Feint and Strong. Returns its `<module>.<key>`, or null. */
export function registerAllOutAttackOption(registration: AllOutAttackOptionRegistration): string | null {
  const r = registration ?? ({} as AllOutAttackOptionRegistration);
  const what = `All-Out Attack option ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  const key = `${r.module}.${r.key}`;
  if (allOutAttackOptions.has(key)) return refuse(what, "that key is already registered");
  allOutAttackOptions.set(key, {
    key,
    label: r.label.trim(),
    attack: typeof r.attack === "function" ? r.attack : null,
    available: typeof r.available === "function" ? r.available : () => true,
  });
  return key;
}

/** The registered All-Out Attack options offered to this actor. */
export function allOutAttackOptionsFor(actor: any): Array<{ key: string; label: string }> {
  return [...allOutAttackOptions.values()]
    .filter((o) => {
      try {
        return o.available(actor) === true;
      } catch (error) {
        console.warn(`gworld | All-Out Attack option ${o.key} failed`, error);
        return false;
      }
    })
    .map(({ key, label }) => ({ key, label }));
}

/** What the attacker's registered All-Out Attack option does to this attack, or null. */
export function allOutAttackOptionEffect(context: AttackContext): AttackEffect | null {
  if (String(context.actor?.system?.maneuver ?? "") !== "allOutAttack") return null;
  const option = allOutAttackOptions.get(String(context.actor?.system?.allOutAttackOption ?? ""));
  if (!option?.attack || !allOutAttackOptionsFor(context.actor).some((o) => o.key === option.key)) return null;
  try {
    return option.attack(context);
  } catch (error) {
    console.warn(`gworld | All-Out Attack option ${option.key} failed`, error);
    return null;
  }
}

/**
 * The line that holds an attack to a cap on effective skill, or null where it
 * is already within it: Move and Attack's 9 in melee (Characters p. 365).
 */
export function skillCapLine(base: number, modifiers: ReadonlyArray<{ value: number }>, cap: number | null, label: string): ModifierLine | null {
  if (cap === null || !Number.isFinite(cap)) return null;
  const effective = base + modifiers.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
  return effective > cap ? { label, value: cap - effective } : null;
}

// ── attack options and extra effort ────────────────────────────────────────

/** What an attack option can see. */
export interface AttackContext {
  actor: any;
  /** The weapon item, where the attack is made with one. */
  item: any | null;
  ranged: boolean;
  damageType: string;
  /** The reach column, e.g. "C, 1". Blank at range. */
  reach: string;
  /** Skill before the dialog's modifiers. */
  effectiveSkill: number;
  /** The attacker's maneuver key. */
  maneuver: string;
  /** Tokens the attacker has targeted. */
  targets: any[];
  /** The options already ticked or filled in this dialog, by `<module>.<key>`. */
  chosen: Record<string, unknown>;
}

/** What an option does to the attack. Every part is optional. */
export interface AttackEffect {
  /** Lines on the attack roll. */
  modifiers?: ModifierLine[];
  /** Lines on the defender's rolls against this attack; `defenses` limits which ones. */
  defenseModifiers?: Array<ModifierLine & { defenses?: DefenseKey[] }>;
  /** Lines on the damage roll that follows. */
  damageModifiers?: ModifierLine[];
  /** Yards of reach added, shown on the card. */
  reachBonus?: number;
  /** The skill a critical is judged against, where it differs from the roll's. */
  criticalSkill?: number;
  /** FP spent before the roll. */
  fatigue?: number;
  /**
   * Shots spent beyond the one an attack takes (since 1.50.0): a setting that
   * empties the cell faster. The attack is refused where the weapon has fewer
   * left than the shot needs.
   */
  shots?: number;
  /**
   * The Malf. number for this attack alone (Campaigns p. 407), for a setting
   * that makes the weapon likelier to jam (since 1.50.0). The strictest of
   * the chosen options and the weapon's own is the one that counts.
   */
  malfunction?: number;
  /**
   * What the Rate of Fire is multiplied by (Campaigns p. 408): 0.5 for a
   * setting that halves it (since 1.50.0). Never below one shot.
   */
  rateOfFireMultiplier?: number;
  /**
   * The Rate of Fire this attack is fired at in place of the weapon's (since
   * 1.70.0), above it or below; `rateOfFireMultiplier` then applies to it.
   * Where several options set one, the highest counts.
   */
  rateOfFire?: number;
  /**
   * The Recoil this attack's hits are counted with in place of the weapon's
   * (Campaigns p. 373; since 1.70.0). Where several options set one, the
   * highest counts.
   */
  recoil?: number;
  /** Added to the Recoil, after `recoil` (since 1.70.0); the sum is never below 1. */
  recoilModifier?: number;
  /** Anything worth saying on the card. */
  notes?: string[];
}

export type OptionInput =
  | { type: "checkbox" }
  | { type: "number"; min?: number; max?: number }
  | { type: "select"; choices: Array<{ value: string; label: string }> };

export interface AttackOptionRegistration {
  module: string;
  key: string;
  label: string;
  /** Which attacks it is offered on. Defaults to "any". */
  attack?: "melee" | "ranged" | "any";
  /** The control. Defaults to a checkbox. */
  input?: OptionInput;
  /** Whether it is offered at all. */
  available?: (context: AttackContext) => boolean;
  /** Why it can't be chosen right now, or null. Shown on the disabled control. */
  refuse?: (context: AttackContext) => string | null;
  /** What choosing it does. `value` is true, a number, or the selected value. */
  apply: (context: AttackContext, value: unknown) => AttackEffect | null;
}

export interface ExtraEffortRegistration {
  module: string;
  key: string;
  label: string;
  /** Offensive options go in the attack dialog, defensive ones on the defense card. */
  kind: "offense" | "defense";
  /** FP it costs. */
  fp: number;
  available?: (context: any) => boolean;
  refuse?: (context: any) => string | null;
  apply: (context: any) => AttackEffect | DefenseEffect | null;
}

interface AddonAttackOption {
  key: string;
  module: string;
  label: string;
  attack: "melee" | "ranged" | "any";
  input: OptionInput;
  available: (context: AttackContext) => boolean;
  refuse: (context: AttackContext) => string | null;
  apply: (context: AttackContext, value: unknown) => AttackEffect | null;
  /** FP, for an extra-effort option. */
  fp: number;
}

const attackOptions = new Map<string, AddonAttackOption>();

/** Registers an attack option. Returns its `<module>.<key>`, or null. */
export function registerAttackOption(registration: AttackOptionRegistration): string | null {
  const r = registration ?? ({} as AttackOptionRegistration);
  const what = `attack option ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.apply !== "function") return refuse(what, "it has no apply function");
  const key = `${r.module}.${r.key}`;
  if (attackOptions.has(key)) return refuse(what, "that key is already registered");
  attackOptions.set(key, {
    key,
    module: r.module,
    label: r.label.trim(),
    attack: r.attack ?? "any",
    input: r.input ?? { type: "checkbox" },
    available: typeof r.available === "function" ? r.available : () => true,
    refuse: typeof r.refuse === "function" ? r.refuse : () => null,
    apply: r.apply,
    fp: 0,
  });
  return key;
}

// ── defense options ────────────────────────────────────────────────────────

/** What a defense option can see. */
export interface DefenseContext {
  defender: any;
  defense: DefenseKey;
  /** The attack's label. */
  attack: string;
  damageType: string;
  delivery: string;
  /** Whether the defender ticked Retreat. */
  retreating: boolean;
  /** The options already ticked on this row, by `<module>.<key>`, with their values. */
  chosen: Record<string, unknown>;
  /** Since 1.25.0: the attacking actor, or null. */
  attacker?: any;
  /** Since 1.25.0: the attack's weapon, as the attack recorded it, or null. */
  attackWeapon?: Record<string, unknown> | null;
  /** Since 1.25.0: the arc the attack came from, or null outside tactical combat. */
  arc?: string | null;
  /** Since 1.25.0: the weapon a parry would be made with, or null. */
  parryWeapon?: DefenseParryWeapon | null;
  /** Since 1.25.0: where the attack was aimed (or where a miss by 1 landed), or null. */
  calledShot?: { hitLocation: string; addonLocation: string | null } | null;
  /** Since 1.25.0: this turn's defenses so far. */
  defenseCounts?: { parries: number; blocks: number; dodges: number };
}

export interface DefenseEffect {
  modifiers?: ModifierLine[];
  fatigue?: number;
  notes?: string[];
}

export interface DefenseOptionRegistration {
  module: string;
  key: string;
  label: string;
  /** Which defenses it applies to. Defaults to all three. */
  defenses?: DefenseKey[];
  /** The control on the card (since 1.25.0). Defaults to a checkbox. */
  input?: OptionInput;
  available?: (context: DefenseContext) => boolean;
  refuse?: (context: DefenseContext) => string | null;
  /** What choosing it does. `value` is true, a number, or the selected value. */
  apply: (context: DefenseContext, value?: unknown) => DefenseEffect | null;
  /** Called after the defense is rolled, with its outcome and the option's value. */
  after?: (context: DefenseContext, outcome: { success: boolean; margin: number } | null, value?: unknown) => void | Promise<void>;
}

interface AddonDefenseOption {
  key: string;
  module: string;
  label: string;
  defenses: DefenseKey[];
  input: OptionInput;
  available: (context: DefenseContext) => boolean;
  refuse: (context: DefenseContext) => string | null;
  apply: (context: DefenseContext, value?: unknown) => DefenseEffect | null;
  after: (context: DefenseContext, outcome: { success: boolean; margin: number } | null, value?: unknown) => void | Promise<void>;
  fp: number;
}

const defenseOptions = new Map<string, AddonDefenseOption>();
const ALL_DEFENSES: DefenseKey[] = ["dodge", "parry", "block"];

/** Registers a defense option. Returns its `<module>.<key>`, or null. */
export function registerDefenseOption(registration: DefenseOptionRegistration): string | null {
  const r = registration ?? ({} as DefenseOptionRegistration);
  const what = `defense option ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.apply !== "function") return refuse(what, "it has no apply function");
  const key = `${r.module}.${r.key}`;
  if (defenseOptions.has(key)) return refuse(what, "that key is already registered");
  defenseOptions.set(key, {
    key,
    module: r.module,
    label: r.label.trim(),
    defenses: (r.defenses ?? ALL_DEFENSES).filter((d) => ALL_DEFENSES.includes(d)),
    input: r.input ?? { type: "checkbox" },
    available: typeof r.available === "function" ? r.available : () => true,
    refuse: typeof r.refuse === "function" ? r.refuse : () => null,
    apply: r.apply,
    after: typeof r.after === "function" ? r.after : () => undefined,
    fp: 0,
  });
  return key;
}

// ── a module's own defenses ────────────────────────────────────────────────

/** One way to defend a module offers a defender: a button on the defense card. */
export interface ModuleDefenseChoice {
  id: string;
  label: string;
  hint?: string;
}

export interface DefenseRegistration {
  module: string;
  key: string;
  label: string;
  /** The ways this defender may defend with it against this attack (its label). None, and no button shows. */
  choices: (defender: any, attack: string) => ModuleDefenseChoice[];
  /** Resolves the defense and posts its result. */
  run: (context: { defender: any; attack: string; choice: ModuleDefenseChoice; message: any }) => unknown;
}

const defenses = new Map<string, Required<DefenseRegistration> & { id: string }>();

/** Registers a defense a module resolves itself. Returns its `<module>.<key>`, or null. */
export function registerDefense(registration: DefenseRegistration): string | null {
  const r = registration ?? ({} as DefenseRegistration);
  const what = `defense ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.choices !== "function") return refuse(what, "it has no choices function");
  if (typeof r.run !== "function") return refuse(what, "it has no run function");
  const id = `${r.module}.${r.key}`;
  if (defenses.has(id)) return refuse(what, "that key is already registered");
  defenses.set(id, { ...r, label: r.label.trim(), id });
  return id;
}

/** The module defenses a defender is offered against an attack, each with how to run it. */
export function moduleDefensesFor(defender: any, attack: string): Array<ModuleDefenseChoice & { defense: string; run: (message: any) => Promise<void> }> {
  const out: Array<ModuleDefenseChoice & { defense: string; run: (message: any) => Promise<void> }> = [];
  for (const defense of defenses.values()) {
    let choices: ModuleDefenseChoice[] = [];
    try {
      const listed = defense.choices(defender, attack);
      choices = Array.isArray(listed) ? listed : [];
    } catch (error) {
      console.warn(`gworld | defense ${defense.id} failed to list its choices`, error);
    }
    for (const choice of choices) {
      if (typeof choice?.id !== "string" || typeof choice.label !== "string" || !choice.label.trim()) continue;
      out.push({
        id: choice.id,
        label: choice.label,
        ...(typeof choice.hint === "string" ? { hint: choice.hint } : {}),
        defense: defense.id,
        run: async (message: any) => {
          try {
            await defense.run({ defender, attack, choice, message });
          } catch (error) {
            console.warn(`gworld | defense ${defense.id} failed`, error);
          }
        },
      });
    }
  }
  return out;
}

/** Registers an extra-effort option: an attack or defense option that costs FP. Returns its key, or null. */
export function registerExtraEffort(registration: ExtraEffortRegistration): string | null {
  const r = registration ?? ({} as ExtraEffortRegistration);
  const what = `extra effort ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (r.kind !== "offense" && r.kind !== "defense") return refuse(what, "kind must be offense or defense");
  if (!Number.isFinite(r.fp) || r.fp < 0) return refuse(what, "fp must be a number of 0 or more");
  if (typeof r.apply !== "function") return refuse(what, "it has no apply function");
  const key = `${r.module}.${r.key}`;
  if (attackOptions.has(key) || defenseOptions.has(key)) return refuse(what, "that key is already registered");
  const available = typeof r.available === "function" ? r.available : () => true;
  const refusal = typeof r.refuse === "function" ? r.refuse : () => null;
  const label = `${r.label.trim()} (${r.fp} FP)`;
  if (r.kind === "offense") {
    attackOptions.set(key, {
      key, module: r.module, label, attack: "any", input: { type: "checkbox" },
      available, refuse: refusal, fp: r.fp,
      apply: (context) => {
        const effect = (r.apply(context) ?? {}) as AttackEffect;
        return { ...effect, fatigue: (effect.fatigue ?? 0) + r.fp };
      },
    });
  } else {
    defenseOptions.set(key, {
      key, module: r.module, label, defenses: ALL_DEFENSES, input: { type: "checkbox" },
      available, refuse: refusal, fp: r.fp, after: () => undefined,
      apply: (context) => {
        const effect = (r.apply(context) ?? {}) as DefenseEffect;
        return { ...effect, fatigue: (effect.fatigue ?? 0) + r.fp };
      },
    });
  }
  return key;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function localized(text: string): string {
  const out = (globalThis as { game?: any }).game?.i18n?.localize?.(text);
  return typeof out === "string" ? out : text;
}

/** The registered attack options offered on this attack. */
export function attackOptionsFor(context: AttackContext): AddonAttackOption[] {
  return [...attackOptions.values()].filter((option) => {
    if (option.attack === "melee" && context.ranged) return false;
    if (option.attack === "ranged" && !context.ranged) return false;
    try {
      return option.available(context) === true;
    } catch (error) {
      console.warn(`gworld | attack option ${option.key} failed its availability check`, error);
      return false;
    }
  });
}

/** The dialog controls for the registered attack options. Names are `addon:<key>`. */
export function attackOptionFields(context: AttackContext): string {
  return attackOptionsFor(context)
    .map((option) => {
      const name = `addon:${option.key}`;
      const label = escapeHtml(localized(option.label));
      let why: string | null = null;
      try {
        why = option.refuse(context);
      } catch (error) {
        console.warn(`gworld | attack option ${option.key} failed its refusal check`, error);
      }
      const disabled = why ? ` disabled title="${escapeHtml(localized(why))}"` : "";
      if (option.input.type === "number") {
        const min = option.input.min !== undefined ? ` min="${option.input.min}"` : "";
        const max = option.input.max !== undefined ? ` max="${option.input.max}"` : "";
        return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px" data-addon-option="${option.key}">
          <span>${label}</span><input type="number" name="${name}" value="0" step="1"${min}${max} style="width:90px"${disabled}></label>`;
      }
      if (option.input.type === "select") {
        const choices = option.input.choices
          .map((c) => `<option value="${escapeHtml(c.value)}">${escapeHtml(localized(c.label))}</option>`)
          .join("");
        return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px" data-addon-option="${option.key}">
          <span>${label}</span><select name="${name}" style="width:150px"${disabled}>${choices}</select></label>`;
      }
      return `<label style="display:flex;align-items:center;gap:8px" data-addon-option="${option.key}">
        <input type="checkbox" name="${name}"${disabled}><span>${label}</span></label>`;
    })
    .join("");
}

/** Reads the registered options' values out of a dialog. Unticked checkboxes and zeroes are left out. */
export function readAttackOptionValues(form: ParentNode | null | undefined, context: AttackContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!form) return values;
  for (const option of attackOptionsFor(context)) {
    const control = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="addon:${CSS.escape(option.key)}"]`);
    if (!control || control.disabled) continue;
    if (option.input.type === "checkbox") {
      if ((control as HTMLInputElement).checked) values[option.key] = true;
    } else if (option.input.type === "number") {
      const n = Number(control.value) || 0;
      if (n !== 0) values[option.key] = n;
    } else if (control.value) {
      values[option.key] = control.value;
    }
  }
  return values;
}

/** Merges effects in order. */
export function mergeAttackEffects(effects: AttackEffect[]): Required<Omit<AttackEffect, "criticalSkill" | "malfunction" | "rateOfFire" | "recoil">> & { criticalSkill: number | null; malfunction: number | null; rateOfFire: number | null; recoil: number | null } {
  const out = {
    modifiers: [] as ModifierLine[],
    defenseModifiers: [] as Array<ModifierLine & { defenses?: DefenseKey[] }>,
    damageModifiers: [] as ModifierLine[],
    reachBonus: 0,
    criticalSkill: null as number | null,
    fatigue: 0,
    shots: 0,
    malfunction: null as number | null,
    rateOfFireMultiplier: 1,
    rateOfFire: null as number | null,
    recoil: null as number | null,
    recoilModifier: 0,
    notes: [] as string[],
  };
  for (const effect of effects) {
    out.modifiers.push(...(effect.modifiers ?? []).filter(isLine));
    out.defenseModifiers.push(...(effect.defenseModifiers ?? []).filter(isLine));
    out.damageModifiers.push(...(effect.damageModifiers ?? []).filter(isLine));
    out.reachBonus += Number(effect.reachBonus) || 0;
    if (typeof effect.criticalSkill === "number" && Number.isFinite(effect.criticalSkill)) out.criticalSkill = effect.criticalSkill;
    out.fatigue += Math.max(0, Number(effect.fatigue) || 0);
    out.shots += Math.max(0, Math.floor(Number(effect.shots) || 0));
    // Two settings that both make the weapon likelier to jam do not add: the
    // strictest Malf. is the one the attack is rolled against.
    if (typeof effect.malfunction === "number" && Number.isFinite(effect.malfunction)) {
      const asked = Math.max(3, Math.min(18, Math.floor(effect.malfunction)));
      out.malfunction = out.malfunction === null ? asked : Math.min(out.malfunction, asked);
    }
    // Two that each halve the rate of fire quarter it, which is what
    // multiplying them means.
    if (typeof effect.rateOfFireMultiplier === "number" && effect.rateOfFireMultiplier > 0 && Number.isFinite(effect.rateOfFireMultiplier)) {
      out.rateOfFireMultiplier *= effect.rateOfFireMultiplier;
    }
    // A Rate of Fire or a Recoil set by two options: the higher is taken.
    if (typeof effect.rateOfFire === "number" && Number.isFinite(effect.rateOfFire) && effect.rateOfFire >= 1) {
      out.rateOfFire = Math.max(out.rateOfFire ?? 0, Math.floor(effect.rateOfFire));
    }
    if (typeof effect.recoil === "number" && Number.isFinite(effect.recoil) && effect.recoil >= 1) {
      out.recoil = Math.max(out.recoil ?? 0, Math.floor(effect.recoil));
    }
    out.recoilModifier += Math.floor(Number(effect.recoilModifier) || 0);
    out.notes.push(...(effect.notes ?? []).filter((n) => typeof n === "string"));
  }
  return out;
}

function isLine(line: unknown): line is ModifierLine {
  const l = line as ModifierLine;
  return typeof l?.label === "string" && typeof l?.value === "number" && Number.isFinite(l.value);
}

/**
 * Applies the chosen options. An option refused for this attack is skipped
 * even if its control was somehow submitted.
 */
export function applyAttackOptions(context: AttackContext, values: Record<string, unknown>): ReturnType<typeof mergeAttackEffects> {
  const effects: AttackEffect[] = [];
  const withChoices = { ...context, chosen: { ...values } };
  for (const option of attackOptionsFor(withChoices)) {
    if (!(option.key in values)) continue;
    if (option.refuse(withChoices)) continue;
    try {
      const effect = option.apply(withChoices, values[option.key]);
      if (effect) effects.push(effect);
    } catch (error) {
      console.warn(`gworld | attack option ${option.key} failed`, error);
    }
  }
  return mergeAttackEffects(effects);
}

/** The registered defense options offered for this defense. */
export function defenseOptionsFor(context: DefenseContext): AddonDefenseOption[] {
  return [...defenseOptions.values()].filter((option) => {
    if (!option.defenses.includes(context.defense)) return false;
    try {
      return option.available(context) === true;
    } catch (error) {
      console.warn(`gworld | defense option ${option.key} failed its availability check`, error);
      return false;
    }
  });
}

/** Every registered defense option offered for any of the three defenses. */
export function anyDefenseOptions(context: Omit<DefenseContext, "defense">): AddonDefenseOption[] {
  const seen = new Map<string, AddonDefenseOption>();
  for (const defense of ALL_DEFENSES) {
    for (const option of defenseOptionsFor({ ...context, defense })) seen.set(option.key, option);
  }
  return [...seen.values()];
}

/**
 * Applies the chosen defense options to one defense: a list of ticked keys, or
 * (since 1.25.0) each key with its value.
 */
export function applyDefenseOptions(context: DefenseContext, ticked: string[] | Record<string, unknown>): {
  modifiers: ModifierLine[];
  fatigue: number;
  notes: string[];
  chosen: AddonDefenseOption[];
} {
  const out = { modifiers: [] as ModifierLine[], fatigue: 0, notes: [] as string[], chosen: [] as AddonDefenseOption[] };
  const values: Record<string, unknown> = Array.isArray(ticked) ? Object.fromEntries(ticked.map((k) => [k, true])) : { ...ticked };
  const withChoices = { ...context, chosen: values };
  for (const option of defenseOptionsFor(withChoices)) {
    if (!(option.key in values)) continue;
    if (option.refuse(withChoices)) continue;
    try {
      const effect = option.apply(withChoices, values[option.key]);
      if (!effect) continue;
      out.modifiers.push(...(effect.modifiers ?? []).filter(isLine));
      out.fatigue += Math.max(0, Number(effect.fatigue) || 0);
      out.notes.push(...(effect.notes ?? []).filter((n) => typeof n === "string"));
      out.chosen.push(option);
    } catch (error) {
      console.warn(`gworld | defense option ${option.key} failed`, error);
    }
  }
  return out;
}

/** The lines an attack's registered options put on one of the defender's rolls. */
export function defenseModifiersFor(
  lines: Array<ModifierLine & { defenses?: DefenseKey[] }> | undefined,
  defense: DefenseKey,
): ModifierLine[] {
  return (lines ?? [])
    .filter((line) => isLine(line) && (!line.defenses || line.defenses.length === 0 || line.defenses.includes(defense)))
    .map((line) => ({ label: line.label, value: line.value }));
}

/**
 * The hook a mutable context goes through. Listeners may push to its arrays or
 * change its numbers; one that throws is logged and the roll goes on.
 */
// ── which defenses and which weapons ─────────────────────────────────────

/** One of the system's three defenses as `gworld.defenseChoices` sees it. */
export interface HookedDefenseChoice {
  key: DefenseKey;
  available: boolean;
  /** Why a listener refused it, shown on the refused button. */
  refusal: string | null;
}

/** Retreat or Feverish Defense, as `gworld.defenseChoices` sees it. */
export interface HookedDefenseToggle {
  available: boolean;
  refusal: string | null;
}

/** An acrobatic defense (since 1.38.0): which defenses may be acrobatic, and how many a turn (null for no limit). */
export interface HookedAcrobatic extends HookedDefenseToggle {
  defenses: DefenseKey[];
  perTurn: number | null;
}

const DEFENSE_KEYS: readonly DefenseKey[] = ["dodge", "parry", "block"];

/**
 * The arc an attack arrives from once a module has had its say (since 1.38.0):
 * `front`, `side` or `back`, and `left` or `right` for a side attack.
 * Anything else a listener sets is ignored.
 */
export function hookedAttackArc<A extends string, S extends string | null>(context: { defender: any; attacker: any; arc: A; side: S }): { arc: A; side: S } {
  const hooked = callCombatHook(COMBAT_HOOKS.attackArc, { defender: context.defender, attacker: context.attacker, arc: context.arc as string, side: context.side as string | null });
  const arc = ["front", "side", "back"].includes(String(hooked.arc)) ? (hooked.arc as A) : context.arc;
  const side = hooked.side === null || ["left", "right"].includes(String(hooked.side)) ? (hooked.side as S) : context.side;
  return { arc, side };
}

/**
 * What modules refuse on a defender's card: any of the three defenses,
 * Retreat and Feverish Defense, each with the text to show. Only refusals are
 * taken; a listener can't offer what the system refused.
 */
export function moduleDefenseRefusals(context: {
  defender: any;
  /** The attacking actor, or null (since 1.39.0). */
  attacker?: any;
  attack: string;
  delivery: string;
  damageType: string;
  choices: Array<{ key: DefenseKey; available: boolean }>;
  /** The arc the attack came from, or null outside tactical combat (since 1.21.0). */
  arc?: string | null;
  /** The attacking weapon, as the attack recorded it (since 1.21.0). */
  attackWeapon?: Record<string, unknown> | null;
  /** The weapon a parry would be made with (since 1.21.0). */
  parryWeapon?: DefenseParryWeapon | null;
  /** This turn's defenses so far (since 1.24.0), and acrobatic defenses (since 1.38.0). */
  defenseCounts?: { parries: number; blocks: number; dodges: number; acrobatic?: number };
}): {
  choices: Map<DefenseKey, string>;
  retreat: string | null;
  feverish: string | null;
  parriesFlail: boolean;
  blockAgain: boolean;
  acrobatic: { refusal: string | null; defenses: DefenseKey[]; perTurn: number | null };
  bareHandedParry: boolean;
} {
  const parryWeapon = context.parryWeapon ? { ...context.parryWeapon } : null;
  const hooked = callCombatHook(COMBAT_HOOKS.defenseChoices, {
    defender: context.defender,
    attacker: context.attacker ?? null,
    attack: context.attack,
    delivery: context.delivery,
    damageType: context.damageType,
    choices: context.choices.map((c): HookedDefenseChoice => ({ key: c.key, available: c.available, refusal: null })),
    retreat: { available: true, refusal: null } as HookedDefenseToggle,
    feverish: { available: true, refusal: null } as HookedDefenseToggle,
    arc: context.arc ?? null,
    attackWeapon: context.attackWeapon ? { ...context.attackWeapon } : null,
    parryWeapon,
    defenseCounts: { acrobatic: 0, ...(context.defenseCounts ?? { parries: 0, blocks: 0, dodges: 0 }) },
    blockAgain: false,
    acrobatic: { available: true, refusal: null, defenses: ["dodge"], perTurn: ACROBATIC_DEFENSES_PER_TURN } as HookedAcrobatic,
    // Since 1.43.0: a listener may offer a bare-handed parry beside the weapon's.
    bareHandedParry: { available: false },
  });
  const text = (refusal: unknown) => (typeof refusal === "string" && refusal.trim() ? refusal.trim() : "");
  const choices = new Map<DefenseKey, string>();
  for (const choice of hooked.choices ?? []) {
    const was = context.choices.find((c) => c.key === choice?.key);
    if (was?.available && choice.available === false) choices.set(was.key, text(choice.refusal));
  }
  return {
    choices,
    retreat: hooked.retreat?.available === false ? text(hooked.retreat.refusal) : null,
    feverish: hooked.feverish?.available === false ? text(hooked.feverish.refusal) : null,
    parriesFlail: parryWeapon?.parriesFlail === true,
    blockAgain: hooked.blockAgain === true,
    acrobatic: {
      refusal: hooked.acrobatic?.available === false ? text(hooked.acrobatic.refusal) : null,
      defenses: Array.isArray(hooked.acrobatic?.defenses) ? DEFENSE_KEYS.filter((key) => hooked.acrobatic.defenses.includes(key)) : ["dodge"],
      perTurn: hooked.acrobatic?.perTurn === null ? null : Number.isFinite(Number(hooked.acrobatic?.perTurn)) ? Math.max(0, Math.floor(Number(hooked.acrobatic.perTurn))) : ACROBATIC_DEFENSES_PER_TURN,
    },
    bareHandedParry: hooked.bareHandedParry?.available === true,
  };
}

/** The weapon a parry is made with, as the defense hooks see it (since 1.21.0). */
export interface DefenseParryWeapon {
  itemId: string;
  twoHanded: boolean;
  natural: boolean;
  skill: string;
  isFencing: boolean;
  /** Whether it may parry a flail. A `gworld.defenseChoices` listener may set it. */
  parriesFlail?: boolean;
}

/** A weapon a best parry may be picked from, as `gworld.parryWeapons` sees it. */
export interface ParryCandidate {
  itemId: string;
  modeIndex: number;
  name: string;
  unbalanced: boolean;
  /** Left out: an unbalanced weapon on a turn it attacked, or whatever a listener says. */
  excluded: boolean;
  reason: string;
}

/**
 * The attack rows a best parry may be picked from. An unbalanced weapon is
 * left out on a turn its wielder attacked, and a module may leave out others
 * or let an unbalanced one back in.
 */
export function parryWeaponRows<T extends { itemId?: string; modeIndex?: number; name?: string; unbalanced?: boolean }>(
  actor: any,
  rows: readonly T[],
  attackedThisTurn: boolean,
): T[] {
  const candidates: ParryCandidate[] = rows.map((row) => ({
    itemId: String(row.itemId ?? ""),
    modeIndex: Number(row.modeIndex ?? 0) || 0,
    name: String(row.name ?? ""),
    unbalanced: Boolean(row.unbalanced),
    excluded: attackedThisTurn && Boolean(row.unbalanced),
    reason: attackedThisTurn && row.unbalanced ? "unbalanced" : "",
  }));
  const hooked = callCombatHook(COMBAT_HOOKS.parryWeapons, { actor, attackedThisTurn, candidates });
  return rows.filter((_row, index) => hooked.candidates?.[index]?.excluded !== true);
}

export function callCombatHook<T extends object>(hook: string, context: T): T {
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(hook, context);
  } catch (error) {
    console.warn(`gworld | a ${hook} listener failed`, error);
  }
  return context;
}

// ── hit locations ──────────────────────────────────────────────────────────

export interface HitLocationRegistration {
  module: string;
  key: string;
  label: string;
  /** The Basic Set location it is part of: its armour, critical table and anything not overridden come from there. */
  parent: HitLocation;
  /** The to-hit penalty for aiming at it. */
  penalty: number;
  /** Damage types that may aim at it. Empty or missing: any. */
  damageTypes?: DamageType[];
  /** The wounding modifier for a damage type, or null to use the parent's. */
  wounding?: (type: DamageType) => number | null;
  /**
   * Crippled above max HP divided by this (2 for a limb, 3 for an extremity).
   * Null: can't be crippled. Missing: as the parent.
   */
  cripplingDivisor?: number | null;
  /** DR the location adds, on top of the parent's. */
  extraDr?: number;
  /** Added to the knockdown roll's modifier. */
  knockdown?: number;
  /** Whether it is offered right now (e.g. "my switch is on"). */
  available?: (context: { actor?: any; damageType?: string }) => boolean;
  /**
   * Where an attack aimed at it that misses by 1 lands (since 1.22.0): a Basic
   * Set location or a registered `<module>.<key>`, or null for nowhere. Missing:
   * the parent's rule.
   */
  missFallback?: string | null;
  /** The arcs it may be aimed from (since 1.22.0). Missing: any the parent allows. */
  arcs?: Array<"front" | "side" | "back">;
  /** Added to the knockdown modifier for a damage type (since 1.22.0). */
  knockdownFor?: (type: DamageType) => number;
  /** Any shock calls for a knockdown roll, not only a major wound (since 1.22.0). */
  shockKnockdown?: boolean;
  /** A major wound's knockdown penalty in place of the parent's (since 1.22.0). */
  majorWoundKnockdown?: number;
}

export interface AddonHitLocation {
  key: string;
  module: string;
  label: string;
  parent: HitLocation;
  penalty: number;
  damageTypes: DamageType[];
  wounding: (type: DamageType) => number | null;
  cripplingDivisor: number | null | undefined;
  extraDr: number;
  knockdown: number;
  available: (context: { actor?: any; damageType?: string }) => boolean;
  missFallback: string | null | undefined;
  arcs: Array<"front" | "side" | "back"> | null;
  knockdownFor: (type: DamageType) => number;
  shockKnockdown: boolean;
  majorWoundKnockdown: number | null;
}

const hitLocations = new Map<string, AddonHitLocation>();

/** The value a dialog and the damage card use for a registered location. */
export const ADDON_LOCATION_PREFIX = "addon:";

/** Registers a hit location. Returns its `<module>.<key>`, or null. */
export function registerHitLocation(registration: HitLocationRegistration): string | null {
  const r = registration ?? ({} as HitLocationRegistration);
  const what = `hit location ${r.module}.${r.key}`;
  const bad = checkNames(what, r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (!HIT_LOCATIONS[r.parent]) return refuse(what, `parent must be one of the Basic Set's locations`);
  if (!Number.isFinite(r.penalty)) return refuse(what, "its penalty is not a number");
  if (r.cripplingDivisor !== undefined && r.cripplingDivisor !== null && !(r.cripplingDivisor > 0)) {
    return refuse(what, "cripplingDivisor must be above 0, null or left out");
  }
  const key = `${r.module}.${r.key}`;
  if (hitLocations.has(key)) return refuse(what, "that key is already registered");
  hitLocations.set(key, {
    key,
    module: r.module,
    label: r.label.trim(),
    parent: r.parent,
    penalty: r.penalty,
    damageTypes: Array.isArray(r.damageTypes) ? [...r.damageTypes] : [],
    wounding: typeof r.wounding === "function" ? r.wounding : () => null,
    cripplingDivisor: r.cripplingDivisor,
    extraDr: Number(r.extraDr) || 0,
    knockdown: Number(r.knockdown) || 0,
    available: typeof r.available === "function" ? r.available : () => true,
    missFallback: r.missFallback === undefined ? undefined : r.missFallback === null ? null : String(r.missFallback),
    arcs: Array.isArray(r.arcs) ? r.arcs.filter((arc) => arc === "front" || arc === "side" || arc === "back") : null,
    knockdownFor: typeof r.knockdownFor === "function" ? r.knockdownFor : () => 0,
    shockKnockdown: r.shockKnockdown === true,
    majorWoundKnockdown: typeof r.majorWoundKnockdown === "number" && Number.isFinite(r.majorWoundKnockdown) ? r.majorWoundKnockdown : null,
  });
  return key;
}

/**
 * Where an aimed attack that misses by 1 lands (Campaigns p. 552): a Basic Set
 * eye, skull, face, groin, neck or vitals shot lands on the torso, and a
 * registered location says for itself or takes its parent's rule. Null for a
 * miss that is simply a miss.
 */
export function missFallbackFor(shot: { hitLocation: HitLocation; addonLocation?: string | null }, basicSetFallback: (location: HitLocation) => boolean): { hitLocation: HitLocation; addonLocation: string | null } | null {
  const added = shot.addonLocation ? hitLocations.get(shot.addonLocation) : undefined;
  if (added && added.missFallback !== undefined) {
    if (added.missFallback === null) return null;
    const registered = hitLocations.get(added.missFallback);
    if (registered) return { hitLocation: registered.parent, addonLocation: registered.key };
    return HIT_LOCATIONS[added.missFallback as HitLocation] ? { hitLocation: added.missFallback as HitLocation, addonLocation: null } : null;
  }
  return basicSetFallback(shot.hitLocation) ? { hitLocation: "torso", addonLocation: null } : null;
}

/** Whether a registered location may be aimed at from an arc; true when it names none, or the arc is unknown. */
export function registeredLocationAllowsArc(addonLocation: string | null | undefined, arc: "front" | "side" | "back" | null): boolean {
  const added = addonLocation ? hitLocations.get(addonLocation) : undefined;
  return !added?.arcs || arc === null || added.arcs.includes(arc);
}

export function registeredHitLocation(key: string): AddonHitLocation | undefined {
  return hitLocations.get(key);
}

/** The registered locations offered for this attack. */
export function hitLocationsFor(context: { actor?: any; damageType?: string }): AddonHitLocation[] {
  return [...hitLocations.values()].filter((location) => {
    if (context.damageType && location.damageTypes.length > 0 && !location.damageTypes.includes(context.damageType as DamageType)) return false;
    try {
      return location.available(context) === true;
    } catch (error) {
      console.warn(`gworld | hit location ${location.key} failed its availability check`, error);
      return false;
    }
  });
}

/** Reads a dialog or card value: a Basic Set location, or a registered one with its parent. */
export function readLocationValue(value: string): { hitLocation: HitLocation; addonLocation: string | null } | null {
  if (value.startsWith(ADDON_LOCATION_PREFIX)) {
    const added = hitLocations.get(value.slice(ADDON_LOCATION_PREFIX.length));
    return added ? { hitLocation: added.parent, addonLocation: added.key } : null;
  }
  return HIT_LOCATIONS[value as HitLocation] ? { hitLocation: value as HitLocation, addonLocation: null } : null;
}

/**
 * What a registered location changes about a blow: a wounding modifier to use
 * instead of the parent's, the crippling threshold, extra DR and knockdown.
 */
export function locationOverrides(addonLocation: string | null | undefined, type: DamageType, maxHp: number): {
  woundingModifier: number | null;
  cripplingThreshold: number | null | undefined;
  extraDr: number;
  knockdown: number;
  shockKnockdown: boolean;
  majorWoundKnockdown: number | null;
} | null {
  const added = addonLocation ? hitLocations.get(addonLocation) : undefined;
  if (!added) return null;
  let wounding: number | null = null;
  try {
    const value = added.wounding(type);
    wounding = typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch (error) {
    console.warn(`gworld | hit location ${added.key} failed its wounding check`, error);
  }
  return {
    woundingModifier: wounding,
    cripplingThreshold: added.cripplingDivisor === undefined ? undefined : added.cripplingDivisor === null ? null : maxHp / added.cripplingDivisor,
    extraDr: added.extraDr,
    knockdown: added.knockdown + (() => {
      try {
        return Number(added.knockdownFor(type)) || 0;
      } catch (error) {
        console.warn(`gworld | hit location ${added.key} failed its knockdown check`, error);
        return 0;
      }
    })(),
    shockKnockdown: added.shockKnockdown,
    majorWoundKnockdown: added.majorWoundKnockdown,
  };
}

/** Runs the random-hit-location hook over a location rolled on the Basic Set's table. */
export function randomLocationWithHooks(
  roll: number,
  location: HitLocation,
  actor?: any,
  known: { damageType?: string | null; arc?: "front" | "side" | "back" | null } = {},
): { hitLocation: HitLocation; addonLocation: string | null } {
  const context = callCombatHook(COMBAT_HOOKS.randomHitLocation, {
    roll,
    location,
    addonLocation: null as string | null,
    actor,
    // Since 1.22.0: what the caller knows about the blow, and a die of the
    // system's own for a listener's sub-roll.
    damageType: known.damageType ?? null,
    arc: known.arc ?? null,
    d6: () => {
      const uniform = (globalThis as { CONFIG?: { Dice?: { randomUniform?: () => number } } }).CONFIG?.Dice?.randomUniform ?? Math.random;
      return Math.min(6, Math.max(1, Math.ceil((1 - uniform()) * 6)));
    },
  });
  const added = context.addonLocation ? hitLocations.get(context.addonLocation) : undefined;
  if (added) return { hitLocation: added.parent, addonLocation: added.key };
  return { hitLocation: HIT_LOCATIONS[context.location] ? context.location : location, addonLocation: null };
}

// ── state kept by modules ──────────────────────────────────────────────────

export type StateLifetime = "turn" | "round" | "combat";

const STATE_FLAG = "combatState";
const WEAPON_STATE_FLAG = "weaponState";

/** A module's per-combatant value, or undefined. Kept on the actor. */
export function getCombatState(actor: any, module: string, key: string): unknown {
  const entry = actor?.getFlag?.(SYSTEM_ID, `${STATE_FLAG}.${module}.${key}`);
  return entry && typeof entry === "object" && "value" in entry ? entry.value : undefined;
}

/** Stores a module's per-combatant value, cleared at the end of the actor's turn, the round, or the combat. */
export async function setCombatState(actor: any, module: string, key: string, value: unknown, lifetime: StateLifetime = "combat"): Promise<void> {
  if (!actor?.isOwner || !IDENTIFIER.test(module) || !IDENTIFIER.test(key)) return;
  await actor.setFlag(SYSTEM_ID, `${STATE_FLAG}.${module}.${key}`, { value, lifetime });
}

/** Removes a module's per-combatant value. */
export async function clearCombatState(actor: any, module: string, key: string): Promise<void> {
  if (!actor?.isOwner) return;
  const current = actor.getFlag?.(SYSTEM_ID, STATE_FLAG)?.[module];
  if (current && key in current) await actor.unsetFlag(SYSTEM_ID, `${STATE_FLAG}.${module}.${key}`);
}

/** The state entries of one actor that a boundary clears, as flag paths to unset. */
export function expiringState(state: Record<string, Record<string, { lifetime?: string }>> | null | undefined, lifetimes: StateLifetime[]): string[] {
  const paths: string[] = [];
  for (const [module, entries] of Object.entries(state ?? {})) {
    for (const [key, entry] of Object.entries(entries ?? {})) {
      if (lifetimes.includes((entry?.lifetime ?? "combat") as StateLifetime)) paths.push(`${STATE_FLAG}.${module}.${key}`);
    }
  }
  return paths;
}

async function expire(actor: any, lifetimes: StateLifetime[]): Promise<void> {
  if (!actor?.isOwner) return;
  for (const path of expiringState(actor.getFlag?.(SYSTEM_ID, STATE_FLAG), lifetimes)) {
    await actor.unsetFlag(SYSTEM_ID, path);
  }
}

/**
 * Clears module state at combat boundaries. Only the GM clears, so the work is
 * done once rather than by every client.
 */
export function registerCombatStateHooks(): void {
  Hooks.on("updateCombat", (combat: any, changed: any) => {
    if (!game.user?.isGM) return;
    if ("round" in (changed ?? {})) {
      for (const combatant of combat?.combatants ?? []) void expire(combatant.actor, ["round", "turn"]);
      return;
    }
    if ("turn" in (changed ?? {})) {
      // The turn that just began is the one whose earlier turn-long state is over.
      void expire(combat?.combatant?.actor, ["turn"]);
    }
  });
  Hooks.on("deleteCombat", (combat: any) => {
    if (!game.user?.isGM) return;
    for (const combatant of combat?.combatants ?? []) void expire(combatant.actor, ["turn", "round", "combat"]);
  });
}

/** A module's state on a weapon, or an empty object. */
export function getWeaponState(item: any, module: string): Record<string, unknown> {
  const state = item?.getFlag?.(SYSTEM_ID, `${WEAPON_STATE_FLAG}.${module}`);
  return state && typeof state === "object" ? { ...state } : {};
}

/** Merges into a module's state on a weapon. */
export async function setWeaponState(item: any, module: string, patch: Record<string, unknown>): Promise<void> {
  if (!item?.isOwner || !IDENTIFIER.test(module) || !patch || typeof patch !== "object") return;
  await item.setFlag(SYSTEM_ID, `${WEAPON_STATE_FLAG}.${module}`, { ...getWeaponState(item, module), ...patch });
}

/** What the API exposes. */
export const combatApi = Object.freeze({
  registerManeuver,
  registerAllOutAttackOption,
  registerAttackOption,
  registerDefenseOption,
  registerDefense,
  registerExtraEffort,
  registerHitLocation,
  getCombatState,
  setCombatState,
  clearCombatState,
  getWeaponState,
  setWeaponState,
  hooks: COMBAT_HOOKS,
});
