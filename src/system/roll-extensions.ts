/**
 * Where an add-on module joins the procedures around a roll.
 *
 *   - **Point pools:** pools a character can spend from where the system
 *     spends points on outcomes -- buying a roll up, a flesh wound, a piece
 *     of guidance -- listed beside unspent character points.
 *   - **Energy sources:** where a spell's energy can come from besides the
 *     caster's FP and HP, offered in the casting dialog.
 *   - **Spell attacks:** how a spell that isn't a Missile or Melee spell, but
 *     whose record declares an attack, delivers it once it is cast.
 *   - **Running-spell actions:** buttons on a spell being kept up, for what
 *     it goes on doing after the casting.
 *
 * Every callback a module gives is guarded: one that throws is logged, and
 * the roll or the casting goes on as if the module had offered nothing.
 */

import type { SuccessRollResult } from "../rules/success.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

function safely<T>(what: string, run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    console.warn(`gworld | ${what} failed`, error);
    return fallback;
  }
}

async function safelyAsync<T>(what: string, run: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.warn(`gworld | ${what} failed`, error);
    return fallback;
  }
}

function validKey(module: unknown, key: unknown): boolean {
  return typeof module === "string" && IDENTIFIER.test(module) && typeof key === "string" && IDENTIFIER.test(key);
}

/** A number a module gave, or the fallback when it isn't a finite one. */
function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// ── point pools ────────────────────────────────────────────────────────────

/** What points are being spent on. */
export type PointPoolUse = "buySuccess" | "fleshWound" | "guidance";

/** One pool a module offers a character: its points, and whether the GM must agree to its use. */
export interface PointPool {
  /** The pool's id within the registration, e.g. a skill's name for a pool tied to one skill. */
  id: string;
  label: string;
  available: number;
  gmCheck?: boolean;
}

export interface PointPoolRegistration {
  module: string;
  key: string;
  label: string;
  /**
   * Whether the pool is in play at all -- typically "is my switch on". While
   * no registered pool is available, points aren't spent on outcomes. Defaults
   * to always.
   */
  available?: () => boolean;
  /**
   * The pools this character has that may pay for `use`. `roll.skill` names
   * the skill of a roll being bought up. Return none that can't pay.
   */
  pools: (actor: any, use: PointPoolUse, roll: { skill?: string }) => PointPool[];
  /** A last word before paying: true, or the reason it can't. */
  canPay?: (context: { actor: any; pool: PointPool; use: PointPoolUse; roll: { skill?: string }; cost: number }) => true | string;
  /** Takes `cost` points from the pool. False when nothing was taken. */
  pay: (context: { actor: any; pool: PointPool; cost: number; note: string }) => boolean | Promise<boolean>;
}

interface PointPoolEntry extends Required<Omit<PointPoolRegistration, "canPay" | "available">> {
  id: string;
  canPay: NonNullable<PointPoolRegistration["canPay"]> | null;
  available: () => boolean;
}

const pointPools: PointPoolEntry[] = [];

/** Registers a pool of points. Returns its `<module>.<key>`, or null. */
export function registerPointPool(registration: PointPoolRegistration): string | null {
  const r = registration ?? ({} as PointPoolRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `point pool ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.pools !== "function" || typeof r.pay !== "function") return refuse(what, "it needs pools and pay functions");
  if (pointPools.some((p) => p.id === id)) return refuse(what, "that key is already registered");
  pointPools.push({
    id, module: r.module, key: r.key, label: r.label.trim(), pools: r.pools, pay: r.pay,
    canPay: typeof r.canPay === "function" ? r.canPay : null,
    available: typeof r.available === "function" ? r.available : () => true,
  });
  return id;
}

/** The registered pools that are in play. */
function availablePools(): PointPoolEntry[] {
  return pointPools.filter((entry) => safely(`point pool ${entry.id}`, () => entry.available() === true, false));
}

/** Whether any registered pool is in play, which is what puts spending points on outcomes in play. */
export function anyPointPools(): boolean {
  return availablePools().length > 0;
}

/** The registered pools this character may spend from for a use, each with the registration it belongs to. */
export function registeredPointPools(actor: any, use: PointPoolUse, roll: { skill?: string } = {}): Array<PointPool & { registration: string; gmCheck: boolean }> {
  return availablePools().flatMap((entry) =>
    safely(`point pool ${entry.id}`, () => entry.pools(actor, use, roll), [] as PointPool[])
      .filter((pool) => pool && typeof pool.id === "string" && typeof pool.label === "string")
      .map((pool) => ({
        id: pool.id,
        label: pool.label,
        available: Math.max(0, finite(pool.available, 0)),
        gmCheck: pool.gmCheck === true,
        registration: entry.id,
      })));
}

/**
 * Pays from a registered pool, after its `canPay` check. False, with the
 * reason shown, where it refused or took nothing.
 */
export async function payFromPointPool(
  actor: any,
  source: { pool: string; id: string },
  cost: number,
  note: string,
  use: PointPoolUse,
  roll: { skill?: string } = {},
): Promise<boolean> {
  const entry = pointPools.find((p) => p.id === source.pool);
  const pool = entry ? registeredPointPools(actor, use, roll).find((p) => p.registration === entry.id && p.id === source.id) : undefined;
  if (!entry || !pool) return false;
  const verdict = entry.canPay ? safely(`point pool ${entry.id}`, () => entry.canPay!({ actor, pool, use, roll, cost }), "") : true;
  if (verdict !== true) {
    if (verdict) ui.notifications?.warn(String(verdict));
    return false;
  }
  return (await safelyAsync(`point pool ${entry.id}`, () => entry.pay({ actor, pool, cost, note }), false)) === true;
}

// ── energy sources ─────────────────────────────────────────────────────────

/** One source of energy a module offers for a spell. */
export interface EnergySource {
  id: string;
  label: string;
  /** What the source holds, in its own points. */
  available: number;
  /** Its points spent per point of energy. Defaults to 1. */
  multiplier?: number;
}

/** How a spell is being cast, as energy sources are told. */
export interface CastingContext {
  /** The magic item the spell is cast through, or null for a spell the caster knows. */
  castThrough: { itemId: string; itemName: string } | null;
}

const OWN_CASTING: CastingContext = Object.freeze({ castThrough: null });

export interface EnergySourceRegistration {
  module: string;
  key: string;
  label: string;
  /** The sources this caster could draw on for this spell, cast this way. */
  sources: (actor: any, spell: any, casting: CastingContext) => EnergySource[];
  /** Whether a source may pay for this much energy: true, or the reason it can't. */
  canPay?: (context: { actor: any; spell: any; source: EnergySource; energy: number; castThrough: CastingContext["castThrough"] }) => true | string;
  /** Takes `points` of the source's own points. False when nothing was taken. */
  pay: (context: { actor: any; spell: any; source: EnergySource; points: number; energy: number; castThrough: CastingContext["castThrough"] }) => boolean | Promise<boolean>;
}

interface EnergySourceEntry extends Required<Omit<EnergySourceRegistration, "canPay">> {
  id: string;
  canPay: NonNullable<EnergySourceRegistration["canPay"]> | null;
}

const energySources: EnergySourceEntry[] = [];

/** Registers a source of energy for spells. Returns its `<module>.<key>`, or null. */
export function registerEnergySource(registration: EnergySourceRegistration): string | null {
  const r = registration ?? ({} as EnergySourceRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `energy source ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.sources !== "function" || typeof r.pay !== "function") return refuse(what, "it needs sources and pay functions");
  if (energySources.some((s) => s.id === id)) return refuse(what, "that key is already registered");
  energySources.push({
    id, module: r.module, key: r.key, label: r.label.trim(), sources: r.sources, pay: r.pay,
    canPay: typeof r.canPay === "function" ? r.canPay : null,
  });
  return id;
}

/** A source as the casting dialog offers it. */
export interface EnergySourceOption {
  /** `<registration>|<source id>`, the dialog's value. */
  value: string;
  registration: string;
  source: EnergySource & { multiplier: number };
  label: string;
}

/** The energy sources this caster could draw on for this spell, cast this way. */
export function energySourcesFor(actor: any, spell: any, casting: CastingContext = OWN_CASTING): EnergySourceOption[] {
  return energySources.flatMap((entry) =>
    safely(`energy source ${entry.id}`, () => entry.sources(actor, spell, casting), [] as EnergySource[])
      .filter((source) => source && typeof source.id === "string" && typeof source.label === "string")
      .map((source) => {
        const multiplier = Math.max(0.01, finite(source.multiplier, 1));
        const normalised = { ...source, available: Math.max(0, finite(source.available, 0)), multiplier };
        return {
          value: `${entry.id}|${source.id}`,
          registration: entry.id,
          source: normalised,
          label: `${source.label} (${normalised.available}${multiplier !== 1 ? `, ×${multiplier}` : ""})`,
        };
      }));
}

/** How much of `owed` energy a source can cover, and the source points that takes. */
export function energyCovered(option: Pick<EnergySourceOption, "source">, owed: number): { energy: number; points: number } {
  const { available, multiplier } = option.source;
  const energy = Math.max(0, Math.min(Math.floor(owed), Math.floor(available / multiplier)));
  return { energy, points: Math.ceil(energy * multiplier) };
}

/**
 * Draws a spell's energy from a source, as much of `owed` as it can cover.
 * Returns the energy covered; the caster pays the rest.
 */
export async function drawEnergy(
  actor: any, spell: any, value: string, owed: number, casting: CastingContext = OWN_CASTING,
): Promise<{ energy: number; points: number; label: string }> {
  const none = { energy: 0, points: 0, label: "" };
  const { castThrough } = casting;
  const option = energySourcesFor(actor, spell, casting).find((o) => o.value === value);
  const entry = option ? energySources.find((s) => s.id === option.registration) : undefined;
  if (!option || !entry || owed <= 0) return none;
  const covered = energyCovered(option, owed);
  if (covered.energy <= 0) return none;
  const verdict = entry.canPay
    ? safely(`energy source ${entry.id}`, () => entry.canPay!({ actor, spell, source: option.source, energy: covered.energy, castThrough }), "")
    : true;
  if (verdict !== true) {
    if (verdict) ui.notifications?.warn(String(verdict));
    return none;
  }
  const paid = await safelyAsync(`energy source ${entry.id}`, () => entry.pay({ actor, spell, source: option.source, points: covered.points, energy: covered.energy, castThrough }), false);
  return paid === true ? { ...covered, label: option.source.label } : none;
}

// ── spell attacks ──────────────────────────────────────────────────────────

/** What a spell attack behavior is handed once the spell is cast. */
export interface SpellAttackContext {
  actor: any;
  spell: any;
  outcome: SuccessRollResult;
  /** Energy put into the spell, which its damage scales with. */
  energy: number;
  /** The spell's declared attack: skill, damage per energy, damage type, ranges, area. */
  attack: Record<string, any>;
  /** The damage the energy buys, as dice, or blank. */
  damage: string;
  /** The actors of the targeted tokens. */
  targets: any[];
  /**
   * Rolls an attack with the spell against the declared skill (or `skill`),
   * through the system's attack card, and rolls the damage on a hit.
   */
  rollAttack: (options?: { skill?: number; label?: string; ranged?: boolean; noParry?: boolean }) => Promise<SuccessRollResult | null>;
  /**
   * Rolls the spell's damage straight away, for an area the defender can't
   * defend against. `halfDamage` halves the basic damage, as for 1/2D.
   */
  rollDamage: (options?: { label?: string; formula?: string; halfDamage?: boolean }) => Promise<void>;
}

export interface SpellAttackRegistration {
  module: string;
  key: string;
  label: string;
  /** For a spell whose `attack.behavior` doesn't name it: whether it takes this spell. */
  applies?: (spell: any) => boolean;
  cast: (context: SpellAttackContext) => unknown;
}

const spellAttacks: Array<{ id: string; label: string; applies: ((spell: any) => boolean) | null; cast: SpellAttackRegistration["cast"] }> = [];

/** Registers how a declared spell attack is delivered. Returns its `<module>.<key>`, or null. */
export function registerSpellAttack(registration: SpellAttackRegistration): string | null {
  const r = registration ?? ({} as SpellAttackRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `spell attack ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.cast !== "function") return refuse(what, "it has no cast function");
  if (spellAttacks.some((a) => a.id === id)) return refuse(what, "that key is already registered");
  spellAttacks.push({ id, label: r.label.trim(), applies: typeof r.applies === "function" ? r.applies : null, cast: r.cast });
  return id;
}

/**
 * The behavior that delivers a spell's attack: the one its `attack.behavior`
 * names, else the first whose `applies` takes it. None for a Missile or Melee
 * spell, which the system delivers itself, or a spell with no attack.
 */
export function spellAttackFor(spell: any): { id: string; label: string; cast: SpellAttackRegistration["cast"] } | null {
  const classes: string[] = spell?.system?.classes ?? [];
  if (classes.includes("missile") || classes.includes("melee")) return null;
  const attack = spell?.system?.attack ?? {};
  const named = String(attack.behavior ?? "");
  if (named) return spellAttacks.find((a) => a.id === named) ?? null;
  if (!attack.damage && !attack.area) return null;
  return spellAttacks.find((a) => a.applies && safely(`spell attack ${a.id}`, () => a.applies!(spell) === true, false)) ?? null;
}

/** Hands a cast spell to its attack behavior. */
export async function deliverSpellAttack(behavior: { id: string; cast: SpellAttackRegistration["cast"] }, context: SpellAttackContext): Promise<void> {
  await safelyAsync(`spell attack ${behavior.id}`, () => behavior.cast(context), undefined);
}

// ── running-spell actions ──────────────────────────────────────────────────

/** What a running-spell action is handed. */
export interface ActiveSpellActionContext {
  actor: any;
  /** The spell item, or null where it is gone from the character. */
  spell: any;
  /** The running-spell entry. */
  active: Record<string, any>;
  /** Energy put into the casting: the entry's, or its cost on an older entry. */
  energy: number;
  rollAttack: SpellAttackContext["rollAttack"];
  rollDamage: SpellAttackContext["rollDamage"];
}

export interface ActiveSpellActionRegistration {
  module: string;
  key: string;
  label: string;
  hint?: string;
  /** Whether the row of this running spell shows the button. */
  visible?: (context: { actor: any; spell: any; active: Record<string, any> }) => boolean;
  run: (context: ActiveSpellActionContext) => unknown;
}

const activeSpellActions: Array<{ id: string; label: string; hint: string; visible: ActiveSpellActionRegistration["visible"] | null; run: ActiveSpellActionRegistration["run"] }> = [];

/** Registers a button on running spells' rows. Returns its `<module>.<key>`, or null. */
export function registerActiveSpellAction(registration: ActiveSpellActionRegistration): string | null {
  const r = registration ?? ({} as ActiveSpellActionRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `running-spell action ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.run !== "function") return refuse(what, "it has no run function");
  if (activeSpellActions.some((a) => a.id === id)) return refuse(what, "that key is already registered");
  activeSpellActions.push({
    id, label: r.label.trim(), hint: typeof r.hint === "string" ? r.hint : "",
    visible: typeof r.visible === "function" ? r.visible : null, run: r.run,
  });
  return id;
}

/** The buttons a running spell's row shows, for a user who owns the character. */
export function activeSpellActionsFor(actor: any, active: Record<string, any>): Array<{ id: string; label: string; hint: string }> {
  if (!actor?.isOwner || !active) return [];
  const spell = actor.items?.get?.(active.itemId) ?? null;
  return activeSpellActions
    .filter((a) => !a.visible || safely(`running-spell action ${a.id}`, () => a.visible!({ actor, spell, active }) === true, false))
    .map(({ id, label, hint }) => ({ id, label, hint }));
}

/** Runs a running-spell action with the context the caller built. */
export async function runActiveSpellAction(id: string, context: ActiveSpellActionContext): Promise<void> {
  const action = activeSpellActions.find((a) => a.id === id);
  if (!action || !context.actor?.isOwner) return;
  if (action.visible && !safely(`running-spell action ${id}`, () => action.visible!({ actor: context.actor, spell: context.spell, active: context.active }) === true, false)) return;
  await safelyAsync(`running-spell action ${id}`, () => action.run(context), undefined);
}

/** What the API exposes. */
export const pointsApi = Object.freeze({ registerPointPool });
export const magicApi = Object.freeze({ registerEnergySource, registerSpellAttack, registerActiveSpellAction });
