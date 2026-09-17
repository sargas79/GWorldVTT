/**
 * Where an add-on module changes what happens inside the system's own
 * procedures, rather than adding procedures beside them.
 *
 *   - **Maneuver options:** choices on the system's maneuvers (a Move, a Wait,
 *     an All-Out Attack), made on the sheet, which may change the attack or
 *     the defense and may offer a response the Wait panel triggers.
 *   - **Success rolls and contests:** modifiers on any success roll, told
 *     what kind of roll it is; a hearing after it; and resolvers that propose
 *     the score each side of a Quick Contest rolls.
 *   - **Attack sequences:** how many attacks a maneuver yields this turn, and
 *     whether each picks its own target.
 *   - **Derived attack modes:** attacks worked out when the sheet is drawn
 *     rather than stored on the weapon.
 *   - **Grapple actions:** buttons on the grapple panel.
 *   - **Conditions:** a label, modifiers on rolls, and a duration in turns,
 *     rounds or seconds, applied to an actor and cleared when it runs out.
 *   - **Combat lifecycle, bleeding and technique defaults:** hooks.
 *
 * Every callback a module gives is guarded: one that throws is logged and the
 * roll, the sheet or the turn goes on without it.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  callCombatHook,
  getCombatState,
  allOutAttackOptionEffect,
  maneuverInfo,
  mergeAttackEffects,
  setCombatState,
  type AttackContext,
  type AttackEffect,
  type OptionInput,
} from "./combat-extensions.js";

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

function validNames(module: unknown, key: unknown, label: unknown): string | null {
  if (typeof module !== "string" || !IDENTIFIER.test(module)) return "the module id is missing or malformed";
  if (typeof key !== "string" || !IDENTIFIER.test(key)) return "the key is missing or malformed";
  if (typeof label !== "string" || !label.trim()) return "it has no label";
  return null;
}

interface ModifierLine {
  label: string;
  value: number;
}

function isLine(line: unknown): line is ModifierLine {
  const l = line as ModifierLine;
  return typeof l?.label === "string" && typeof l?.value === "number" && Number.isFinite(l.value);
}

/** The hooks this module fires, by name. */
export const PROCEDURE_HOOKS = Object.freeze({
  /** Before any success roll: `{ actor, label, kind, skill, base, tags, modifiers }`; push to `modifiers`. */
  successRollModifiers: "gworld.successRollModifiers",
  /** After a success roll is posted: `{ actor, label, kind, skill, tags, outcome }`. */
  afterSuccessRoll: "gworld.afterSuccessRoll",
  /** A resistance roll that failed (since 1.49.0): `{ actor, attacker, item, mode, label, margin, effects }`; push to `effects`. */
  afflictionEffect: "gworld.afflictionEffect",
  /** When a maneuver's attacks are worked out: `{ actor, maneuver, option, count, pickTargets }`, mutable. */
  attackSequence: "gworld.attackSequence",
  grappleMove: "gworld.grappleMove",
  /** Before a break free, takedown, pin or choke contest (since 1.34.0): `{ move, actor, foe, grapple, first, second, winner }`, mutable. */
  grappleContest: "gworld.grappleContest",
  /** After one (since 1.34.0): `{ move, actor, foe, grapple, outcome, marginOfVictory }`. */
  afterGrappleContest: "gworld.afterGrappleContest",
  /** After any Quick Contest is rolled (since 1.37.0): `{ label, tags, first, second, outcome, marginOfVictory }`. */
  afterQuickContest: "gworld.afterQuickContest",
  /** Once a knockdown roll is applied (since 1.39.0): `{ actor, outcome, result, previousPosture }`. */
  afterKnockdown: "gworld.afterKnockdown",
  /** After a roll to stay conscious (since 1.43.0): `{ actor, outcome, previousPosture }`. */
  afterConsciousnessRoll: "gworld.afterConsciousnessRoll",
  /** When a combat starts: `(combat)`. */
  combatStart: "gworld.combatStart",
  /** When a combatant's turn starts: `(combat, combatant)`. */
  turnStart: "gworld.turnStart",
  /** When a combatant's turn ends: `(combat, combatant)`. */
  turnEnd: "gworld.turnEnd",
  /** Before a bleeding roll: `{ actor, intervalSeconds, modifier }`, mutable. */
  bleedingSchedule: "gworld.bleedingSchedule",
  /** Before a First Aid attempt (since 1.36.0): `{ healer, patient, refusal, stopsBleeding }`, mutable. */
  firstAid: "gworld.firstAid",
  /** While a technique's defaults are read: `{ actor, item, defaults }`; push `{ from, skill, modifier }`. */
  techniqueDefaults: "gworld.techniqueDefaults",
  /** After a feint is rolled: `{ feinter, foe, result, record }`; set `record: false` to take the result over. */
  feintResult: "gworld.feintResult",
  /**
   * After a poison or illness cycle (since 1.57.0): `{ actor, poison, source, resisted, margin,
   * criticalFailure, hpLost, fpLost, hpLostToPoison, symptomsNow, effectMinutes, finished }`.
   */
  poisonCycle: "gworld.poisonCycle",
  /**
   * Before a mortal wound check's card is posted (since 1.63.0): `{ actor, traumaMaintenance, minutes, label }`.
   * Set `minutes` (a day is 1440) and a `label` for care that changes how often the check comes round.
   */
  mortalWoundInterval: "gworld.mortalWoundInterval",
  /**
   * Before a dose of radiation is added (since 1.63.0): `{ actor, rads, protectionFactor, sources }`.
   * `rads` is mutable; push a label to `sources` to say why it changed.
   */
  radiationDose: "gworld.radiationDose",
  /**
   * Before a roll to detect somebody or something (since 1.63.0): a sense roll,
   * or a detection skill such as Observation, Search or Tracking.
   * `{ observer, subject, sense, skill, tags, modifiers }`; push to `modifiers`.
   * `subject` is the actor looked for, or null; `sense` is `vision`, `hearing`,
   * `tasteSmell`, `touch`, or blank where the roll names none.
   */
  detectionModifiers: "gworld.detectionModifiers",
});

/**
 * Tells the listeners how a feint went. Returns whether the system should
 * record it as a feint against the foe's next defenses.
 */
export function feintResultRecorded(context: { feinter: any; foe: any; result: unknown }): boolean {
  const hooked = callCombatHook(PROCEDURE_HOOKS.feintResult, { ...context, record: true });
  return hooked.record !== false;
}

// ── maneuver options ───────────────────────────────────────────────────────

/** What a maneuver option can see. */
export interface ManeuverOptionContext {
  actor: any;
  maneuver: string;
  /** Every maneuver option's current value on this actor, by `<module>.<key>`. */
  chosen: Record<string, unknown>;
}

export interface ManeuverOptionRegistration {
  module: string;
  key: string;
  /** The maneuver it belongs to: a system maneuver's key, or a registered one's. */
  maneuver: string;
  label: string;
  /** The control. Defaults to a checkbox. */
  input?: OptionInput;
  /** Whether it is offered to this actor. Defaults to always. */
  available?: (actor: any) => boolean;
  /** Why it can't be chosen right now, or null. Shown on the disabled control. */
  refuse?: (context: ManeuverOptionContext) => string | null;
  /** What it does to an attack made while it is chosen. */
  attack?: (context: AttackContext, value: unknown) => AttackEffect | null;
  /** Lines on the actor's own defense rolls while it is chosen. */
  defense?: (context: { actor: any; defense: string }, value: unknown) => ModifierLine[] | null;
  /** A response the Wait panel offers while the option is chosen, triggered with a button. */
  response?: { label: string; trigger: (actor: any, value: unknown) => unknown };
}

interface ManeuverOption {
  id: string;
  maneuver: string;
  label: string;
  input: OptionInput;
  available: (actor: any) => boolean;
  refuse: (context: ManeuverOptionContext) => string | null;
  attack: ManeuverOptionRegistration["attack"] | null;
  defense: ManeuverOptionRegistration["defense"] | null;
  response: ManeuverOptionRegistration["response"] | null;
}

const maneuverOptions: ManeuverOption[] = [];

/** Where an actor's choices of maneuver options are kept. */
export const MANEUVER_OPTIONS_FLAG = "maneuverOptions";

/** Registers an option on a maneuver. Returns its `<module>.<key>`, or null. */
export function registerManeuverOption(registration: ManeuverOptionRegistration): string | null {
  const r = registration ?? ({} as ManeuverOptionRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `maneuver option ${id}`;
  const bad = validNames(r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.maneuver !== "string" || !r.maneuver) return refuse(what, "it names no maneuver");
  if (r.response && (typeof r.response.label !== "string" || typeof r.response.trigger !== "function")) {
    return refuse(what, "its response needs a label and a trigger function");
  }
  if (maneuverOptions.some((o) => o.id === id)) return refuse(what, "that key is already registered");
  maneuverOptions.push({
    id,
    maneuver: r.maneuver,
    label: r.label.trim(),
    input: r.input ?? { type: "checkbox" },
    available: typeof r.available === "function" ? r.available : () => true,
    refuse: typeof r.refuse === "function" ? r.refuse : () => null,
    attack: typeof r.attack === "function" ? r.attack : null,
    defense: typeof r.defense === "function" ? r.defense : null,
    response: r.response ?? null,
  });
  return id;
}

/**
 * An actor's stored choices of maneuver options, by `<module>.<key>`. They are
 * stored nested, module then key, since Foundry expands a dotted key in a flag.
 */
export function chosenManeuverOptions(actor: any): Record<string, unknown> {
  const stored = actor?.getFlag?.(SYSTEM_ID, MANEUVER_OPTIONS_FLAG);
  const out: Record<string, unknown> = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [module, entries] of Object.entries(stored as Record<string, unknown>)) {
    if (!entries || typeof entries !== "object") continue;
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) out[`${module}.${key}`] = value;
  }
  return out;
}

/** Whether a stored value counts as chosen: a ticked box, a non-zero number, a picked value. */
function isChosen(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== "";
}

/** The options offered on this actor's current maneuver, each with its value and any refusal. */
export function maneuverOptionsFor(actor: any): Array<{ id: string; label: string; input: OptionInput; value: unknown; refused: string | null; response: string | null }> {
  const maneuver = String(actor?.system?.maneuver ?? "");
  const chosen = chosenManeuverOptions(actor);
  const context: ManeuverOptionContext = { actor, maneuver, chosen };
  return maneuverOptions
    .filter((o) => o.maneuver === maneuver && safely(`maneuver option ${o.id}`, () => o.available(actor) === true, false))
    .map((o) => ({
      id: o.id,
      label: o.label,
      input: o.input,
      value: chosen[o.id],
      refused: safely(`maneuver option ${o.id}`, () => o.refuse(context), null),
      response: o.response && isChosen(chosen[o.id]) ? o.response.label : null,
    }));
}

/** The options in force: offered on the current maneuver, chosen, and not refused. */
function optionsInForce(actor: any): Array<{ option: ManeuverOption; value: unknown }> {
  const offered = new Map(maneuverOptionsFor(actor).map((o) => [o.id, o]));
  return maneuverOptions
    .filter((o) => {
      const shown = offered.get(o.id);
      return shown && !shown.refused && isChosen(shown.value);
    })
    .map((option) => ({ option, value: offered.get(option.id)!.value }));
}

/** Stores a choice of a maneuver option, if it is offered and not refused. */
export async function chooseManeuverOption(actor: any, id: string, value: unknown): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const offered = maneuverOptionsFor(actor).find((o) => o.id === id);
  if (!offered || (offered.refused && isChosen(value))) return false;
  await actor.setFlag(SYSTEM_ID, `${MANEUVER_OPTIONS_FLAG}.${id}`, value);
  return true;
}

/** What the chosen options on the attacker's maneuver do to an attack. */
export function maneuverOptionAttackEffect(context: AttackContext): ReturnType<typeof mergeAttackEffects> {
  const effects: AttackEffect[] = [];
  // A module's All-Out Attack option, where the attacker took one.
  const allOut = allOutAttackOptionEffect(context);
  if (allOut) effects.push(allOut);
  for (const { option, value } of optionsInForce(context.actor)) {
    if (!option.attack) continue;
    const effect = safely(`maneuver option ${option.id}`, () => option.attack!(context, value), null);
    if (effect) effects.push(effect);
  }
  return mergeAttackEffects(effects);
}

/** The lines the chosen options on the defender's maneuver put on a defense roll. */
export function maneuverOptionDefenseLines(actor: any, defense: string): ModifierLine[] {
  const lines: ModifierLine[] = [];
  for (const { option, value } of optionsInForce(actor)) {
    if (!option.defense) continue;
    lines.push(...(safely(`maneuver option ${option.id}`, () => option.defense!({ actor, defense }, value), null) ?? []).filter(isLine));
  }
  return lines;
}

/** Triggers the response of a chosen option, from the Wait panel. */
export async function triggerManeuverResponse(actor: any, id: string): Promise<void> {
  if (!actor?.isOwner) return;
  const entry = optionsInForce(actor).find((o) => o.option.id === id);
  if (!entry?.option.response) return;
  try {
    await entry.option.response.trigger(actor, entry.value);
  } catch (error) {
    console.warn(`gworld | maneuver response ${id} failed`, error);
  }
}

/** The form control for a maneuver option, as the combat tab draws it. */
export function maneuverOptionControl(option: { id: string; label: string; input: OptionInput; value: unknown; refused: string | null }, editable: boolean): string {
  const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
  const disabled = !editable || option.refused ? " disabled" : "";
  const title = option.refused ? ` title="${esc(option.refused)}"` : "";
  const name = `data-maneuver-option="${esc(option.id)}"`;
  if (option.input.type === "number") {
    const min = option.input.min !== undefined ? ` min="${option.input.min}"` : "";
    const max = option.input.max !== undefined ? ` max="${option.input.max}"` : "";
    return `<label class="maneuver-option"${title}><span>${esc(option.label)}</span> <input type="number" ${name} value="${esc(Number(option.value) || 0)}"${min}${max} step="1" style="width:56px"${disabled}></label>`;
  }
  if (option.input.type === "select") {
    const choices = option.input.choices.map((c) => `<option value="${esc(c.value)}"${c.value === option.value ? " selected" : ""}>${esc(c.label)}</option>`).join("");
    return `<label class="maneuver-option"${title}><span>${esc(option.label)}</span> <select ${name}${disabled}><option value=""></option>${choices}</select></label>`;
  }
  return `<label class="maneuver-option"${title}><input type="checkbox" ${name}${isChosen(option.value) ? " checked" : ""}${disabled}> <span>${esc(option.label)}</span></label>`;
}

// ── success rolls and contests ─────────────────────────────────────────────

/** What a success roll is, for the listeners that change it. */
export interface SuccessRollContext {
  actor: any;
  label: string;
  /** `skill`, `attribute`, `attack`, `defense`, or what the caller said. */
  kind: string;
  /** The skill rolled against, where there is one. */
  skill: string;
  base: number;
  /** What sort of roll it is beyond its kind: `fastDraw`, `fright`, `knockdown`, `teaching`, `contest`, a defense's name... */
  tags: string[];
  modifiers: ModifierLine[];
  /** For a side of a contest, the actor on the other side (since 1.30.0). */
  opponent?: any;
  /** The actor looked for, on a roll to detect them (since 1.63.0). */
  subject?: any;
  /**
   * What the roll is being made against, where it is an attack (since 1.49.0).
   * On a resistance roll this is what the attacker did: a module can read the
   * weapon, how far off it was fired, and what the armour was worth, none of
   * which the roll itself carries.
   */
  attack?: ResistedAttack;
}

/** The attack a resistance roll is made against (since 1.49.0). */
export interface ResistedAttack {
  /** Whoever made it. */
  attacker: any;
  /** The item it came from, where the roll knows it. */
  item: any;
  /** Which of that item's modes: `{ index, ranged }`. */
  mode: { index: number; ranged: boolean; derived?: string } | null;
  /** Yards between the two, or null where there is nothing on a map to measure. */
  distanceYards: number | null;
  /** The mode's 1/2D range in yards, 0 for one without. */
  halfDamageRange: number;
  /** The target's DR at the location struck, where the attack met any. */
  dr: number;
  /** Whether that DR counted at all: false for an attack that got past it. */
  drCounted: boolean;
}

/** The tags a roll carries for what its skill is, beside the ones its caller gave. */
export function successRollTags(options: { kind?: string | undefined; skill?: string | undefined; tags?: string[] | undefined }): string[] {
  const tags = new Set<string>((options.tags ?? []).filter((t) => typeof t === "string" && t));
  if (options.kind) tags.add(options.kind);
  const skill = String(options.skill ?? "").trim().toLowerCase();
  if (skill.startsWith("fast-draw")) tags.add("fastDraw");
  if (skill === "teaching") tags.add("teaching");
  // A roll to find something (since 1.63.0): a sense, or a skill whose use is looking.
  const detectionSkill = DETECTION_SKILLS[skill.replace(/\s*\(.*\)$/, "")];
  if (detectionSkill !== undefined) {
    tags.add("detection");
    if (detectionSkill) tags.add(detectionSkill);
  }
  if (SENSE_TAGS.some((sense) => tags.has(sense))) tags.add("detection");
  return [...tags];
}

/**
 * The modifiers a success roll gets from outside its caller: the actor's
 * timed conditions, the chosen options on a defender's maneuver, and the
 * `gworld.successRollModifiers` listeners. Returns only the added lines.
 */
export function successRollModifiers(context: SuccessRollContext): ModifierLine[] {
  const before = context.modifiers.length;
  const ctx: SuccessRollContext = { ...context, tags: [...context.tags], modifiers: [...context.modifiers] };
  ctx.modifiers.push(...conditionModifiers(ctx.actor, ctx.kind, ctx.tags));
  if (ctx.tags.includes("detection")) ctx.modifiers.push(...detectionModifiers(ctx));
  if (ctx.kind === "defense") {
    for (const defense of ["dodge", "parry", "block"]) {
      if (ctx.tags.includes(defense)) ctx.modifiers.push(...maneuverOptionDefenseLines(ctx.actor, defense));
    }
  }
  callCombatHook(PROCEDURE_HOOKS.successRollModifiers, ctx);
  return ctx.modifiers.slice(before).filter(isLine);
}

/** Tells the listeners how a success roll went. */
export function afterSuccessRoll(context: Omit<SuccessRollContext, "modifiers" | "base"> & { outcome: unknown }): void {
  callCombatHook(PROCEDURE_HOOKS.afterSuccessRoll, context);
}

/** One side of a Quick Contest as `gworld.afterQuickContest` sees it. */
export interface QuickContestSideResult {
  actor: any;
  base: number;
  effective: number;
  outcome: unknown;
}

/** Tells the listeners who won a Quick Contest (since 1.37.0). */
export function afterQuickContest(context: {
  label: string;
  tags: readonly string[];
  first: QuickContestSideResult;
  second: QuickContestSideResult;
  outcome: string;
  marginOfVictory: number;
}): void {
  callCombatHook(PROCEDURE_HOOKS.afterQuickContest, { ...context, tags: [...context.tags] });
}

/** What a contest resolver can see. */
export interface ContestResolverContext {
  label: string;
  first: { actor: any; base: number; note?: string };
  second: { actor: any; base: number; note?: string };
  tags: string[];
}

export interface ContestResolverRegistration {
  module: string;
  key: string;
  label: string;
  /** Whether it has a say in this contest. */
  applies: (context: ContestResolverContext) => boolean;
  /** The score each side rolls instead, with what it is. Leave a side out to keep its score. */
  resolve: (context: ContestResolverContext) => { first?: { base: number; note?: string }; second?: { base: number; note?: string } } | null;
}

const contestResolvers: Array<{ id: string; label: string; applies: ContestResolverRegistration["applies"]; resolve: ContestResolverRegistration["resolve"] }> = [];

/** Registers a resolver for the Quick Contests the system offers. Returns its `<module>.<key>`, or null. */
export function registerContestResolver(registration: ContestResolverRegistration): string | null {
  const r = registration ?? ({} as ContestResolverRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `contest resolver ${id}`;
  const bad = validNames(r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.applies !== "function" || typeof r.resolve !== "function") return refuse(what, "it needs applies and resolve functions");
  if (contestResolvers.some((c) => c.id === id)) return refuse(what, "that key is already registered");
  contestResolvers.push({ id, label: r.label.trim(), applies: r.applies, resolve: r.resolve });
  return id;
}

/** The scores a Quick Contest's sides roll, after the first resolver that applies has had its say. */
export function resolveContestScores(context: ContestResolverContext): { first: { base: number; note?: string }; second: { base: number; note?: string }; resolver: string | null } {
  const out = { first: { base: context.first.base, ...(context.first.note ? { note: context.first.note } : {}) }, second: { base: context.second.base, ...(context.second.note ? { note: context.second.note } : {}) }, resolver: null as string | null };
  for (const resolver of contestResolvers) {
    if (!safely(`contest resolver ${resolver.id}`, () => resolver.applies(context) === true, false)) continue;
    const proposed = safely(`contest resolver ${resolver.id}`, () => resolver.resolve(context), null);
    if (!proposed) continue;
    for (const side of ["first", "second"] as const) {
      const p = proposed[side];
      if (p && typeof p.base === "number" && Number.isFinite(p.base)) out[side] = { base: p.base, ...(p.note ? { note: String(p.note) } : {}) };
    }
    out.resolver = resolver.label;
    break;
  }
  return out;
}

// ── attack sequences ───────────────────────────────────────────────────────

/**
 * Asks the modules whether one of the system's grapple moves may be made
 * (since 1.23.0). Returns the refusal a listener gave, or null.
 */
export function grappleMoveRefusal(actor: any, foe: any, move: "breakFree" | "takedown" | "pin" | "choke"): string | null {
  return grappleMoveRules(actor, foe, move).refusal;
}

/** What the modules say about a grapple move: a refusal, and (since 1.35.0) whether its requirements are waived. */
export function grappleMoveRules(actor: any, foe: any, move: "breakFree" | "takedown" | "pin" | "choke"): { refusal: string | null; waiveRequirements: boolean } {
  const context = callCombatHook(PROCEDURE_HOOKS.grappleMove, { actor, foe, move, refusal: null as string | null, waiveRequirements: false });
  return {
    refusal: typeof context.refusal === "string" && context.refusal.trim() ? context.refusal.trim() : null,
    waiveRequirements: context.waiveRequirements === true,
  };
}

/** How a maneuver's attacks go this turn. */
export interface AttackSequence {
  count: number;
  /** Whether each attack picks its own target when it is rolled. */
  pickTargets: boolean;
  /** Attacks already made this turn. */
  made: number;
}

/** The attacks this actor's maneuver yields this turn, after the listeners. */
export function attackSequenceFor(actor: any): AttackSequence {
  const maneuver = String(actor?.system?.maneuver ?? "");
  const option = maneuver === "allOutAttack" ? String(actor?.system?.allOutAttackOption ?? "determined") : String(actor?.system?.maneuverOption ?? "");
  const base = maneuverInfo(maneuver).attacks ? (maneuver === "allOutAttack" && option === "double" ? 2 : 1) : 0;
  const context = callCombatHook(PROCEDURE_HOOKS.attackSequence, { actor, maneuver, option, count: base, pickTargets: false });
  return {
    count: Math.max(0, Math.floor(Number(context.count) || 0)),
    pickTargets: context.pickTargets === true,
    made: Math.max(0, Number(getCombatState(actor, SYSTEM_ID, "attacksMade")) || 0),
  };
}

/** Counts an attack made this turn. */
export async function recordAttackMade(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const made = Math.max(0, Number(getCombatState(actor, SYSTEM_ID, "attacksMade")) || 0);
  await setCombatState(actor, SYSTEM_ID, "attacksMade", made + 1, "turn");
}

/**
 * The tokens an attack in a sequence may be aimed at: the scene's tokens
 * other than the attacker's own, as `{ actor, document }` so the attack card
 * can record them as it records targeted tokens.
 */
export function attackTargetCandidates(actor: any): Array<{ actor: any; document: any; name: string }> {
  const scene = (game as any).scenes?.viewed ?? (game as any).scenes?.active;
  return [...(scene?.tokens ?? [])]
    .filter((token: any) => token?.actor && token.actor.id !== actor?.id)
    .map((token: any) => ({ actor: token.actor, document: token, name: String(token.name ?? token.actor.name ?? "") }));
}

// ── derived attack modes ───────────────────────────────────────────────────

export interface DerivedAttackModeRegistration {
  module: string;
  key: string;
  label: string;
  /** `melee` or `ranged`: the table it is listed in. */
  kind: "melee" | "ranged";
  /**
   * An attack the character has itself rather than one of their weapons (since
   * 1.35.0): `applies` and `mode` are called once per character, with a null
   * item, and the row has none.
   */
  self?: boolean;
  /** Whether this item has the mode for this actor. */
  applies: (item: any, actor: any) => boolean;
  /**
   * The mode, as the attack table reads a row: at least `mode`, `skillName`,
   * `skillLevel`, `damage` and `damageType`; ranged modes also `accuracy`,
   * `range`, `halfDamageRange` and `maxRange`. `helpers.skillLevel(name)`
   * reads a skill's level as the system has worked it out. Since 1.21.0,
   * `helpers.rows(item)` gives copies of the item's own rows, after the
   * `gworld.weaponAttacks` listeners, and `helpers.damage(base, modifier)`
   * thrust (`"thr"`) or swing (`"sw"`) damage at the actor's striking ST.
   */
  mode: (item: any, actor: any, helpers: DerivedModeHelpers) => Record<string, unknown> | null;
}

/** What a derived mode may read while it is worked out. */
export interface DerivedModeHelpers {
  skillLevel: (name: string) => number | null;
  rows?: (item: any) => { melee: Array<Record<string, unknown>>; ranged: Array<Record<string, unknown>> };
  damage?: (base: "thr" | "sw", modifier: number) => string;
  /** The character's Basic Lift, Lifting ST included (since 1.29.0). */
  basicLift?: number;
  /** ST, DX, IQ, HT, Will or Per as this preparation worked them out, or null (since 1.30.0). */
  attribute?: (key: string) => number | null;
}

const derivedModes: Array<{ id: string; label: string; kind: "melee" | "ranged"; self: boolean; applies: DerivedAttackModeRegistration["applies"]; mode: DerivedAttackModeRegistration["mode"] }> = [];

/** Registers an attack mode worked out when the sheet is drawn. Returns its `<module>.<key>`, or null. */
export function registerDerivedAttackMode(registration: DerivedAttackModeRegistration): string | null {
  const r = registration ?? ({} as DerivedAttackModeRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `derived attack mode ${id}`;
  const bad = validNames(r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (r.kind !== "melee" && r.kind !== "ranged") return refuse(what, 'kind must be "melee" or "ranged"');
  if (typeof r.applies !== "function" || typeof r.mode !== "function") return refuse(what, "it needs applies and mode functions");
  if (derivedModes.some((m) => m.id === id)) return refuse(what, "that key is already registered");
  derivedModes.push({ id, label: r.label.trim(), kind: r.kind, self: r.self === true, applies: r.applies, mode: r.mode });
  return id;
}

/** The rows a table gets from the derived modes, over the defaults a row needs. */
export function derivedAttackRows(
  kind: "melee" | "ranged",
  items: any[],
  actor: any,
  helpers: DerivedModeHelpers,
  defaults: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (derivedModes.length === 0) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of derivedModes.filter((m) => m.kind === kind)) {
    for (const item of entry.self ? [null] : items) {
      if (!safely(`derived attack mode ${entry.id}`, () => entry.applies(item, actor) === true, false)) continue;
      const mode = safely(`derived attack mode ${entry.id}`, () => entry.mode(item, actor, helpers), null);
      if (!mode || typeof mode !== "object") continue;
      rows.push({
        ...defaults,
        itemId: String(item?.id ?? ""),
        modeIndex: -1,
        name: item ? String(item.name ?? "") : entry.label,
        mode: entry.label,
        ...mode,
        derivedMode: entry.id,
        ...(entry.self ? { natural: true } : {}),
      });
    }
  }
  return rows;
}

// ── grapple actions ────────────────────────────────────────────────────────

export interface GrappleActionRegistration {
  module: string;
  key: string;
  label: string;
  /** Whether the button is offered, given the grapple as this actor holds it (`holding` true for the grappler). */
  applies?: (grapple: { holding: boolean; pinned: boolean; hands: number; hitLocation: string }, actor: any) => boolean;
  /** What pressing it does. `foe` is the other side of the grapple, where it can be found. */
  run: (context: { actor: any; foe: any; grapple: Record<string, unknown> }) => unknown;
}

const grappleActions: Array<{ id: string; label: string; applies: NonNullable<GrappleActionRegistration["applies"]>; run: GrappleActionRegistration["run"] }> = [];

/** Registers a button on the grapple panel. Returns its `<module>.<key>`, or null. */
export function registerGrappleAction(registration: GrappleActionRegistration): string | null {
  const r = registration ?? ({} as GrappleActionRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `grapple action ${id}`;
  const bad = validNames(r.module, r.key, r.label);
  if (bad) return refuse(what, bad);
  if (typeof r.run !== "function") return refuse(what, "it has no run function");
  if (grappleActions.some((a) => a.id === id)) return refuse(what, "that key is already registered");
  grappleActions.push({ id, label: r.label.trim(), applies: typeof r.applies === "function" ? r.applies : () => true, run: r.run });
  return id;
}

/** The grapple actions offered to this actor in this grapple. */
export function grappleActionsFor(actor: any, grapple: { holding: boolean; pinned: boolean; hands: number; hitLocation: string } | null): Array<{ id: string; label: string }> {
  if (!grapple) return [];
  return grappleActions
    .filter((a) => safely(`grapple action ${a.id}`, () => a.applies(grapple, actor) === true, false))
    .map((a) => ({ id: a.id, label: a.label }));
}

/** Runs a grapple action for this actor. */
export async function runGrappleAction(actor: any, id: string, grapple: any): Promise<void> {
  if (!actor?.isOwner || !grapple) return;
  const action = grappleActions.find((a) => a.id === id);
  if (!action || !safely(`grapple action ${id}`, () => action.applies(grapple, actor) === true, false)) return;
  const foe = grapple.foe ? await fromUuid(grapple.foe).catch(() => null) : null;
  try {
    await action.run({ actor, foe, grapple: { ...grapple } });
  } catch (error) {
    console.warn(`gworld | grapple action ${id} failed`, error);
  }
}

// ── conditions ─────────────────────────────────────────────────────────────

/** A modifier a condition puts on rolls; `rolls` limits it to kinds or tags of roll. */
export interface ConditionModifier extends ModifierLine {
  rolls?: string[];
}

export interface ConditionApplication {
  /** The module that applies it; left out for a condition of the system's own. */
  module?: string;
  key: string;
  label?: string;
  effects?: { modifiers?: ConditionModifier[] };
  /** How long it lasts. Left out: until removed. */
  duration?: { turns?: number; rounds?: number; seconds?: number };
}

/** A timed condition as the actor carries it. */
export interface StoredCondition {
  id: string;
  label: string;
  modifiers: ConditionModifier[];
  /** The actor's turns left, counted down at the start of each of them. */
  turnsLeft: number | null;
  /** The combat round it ends at the start of. */
  untilRound: number | null;
  /** The world time it ends at. */
  untilTime: number | null;
  /** Whether it is one of the system's token conditions, set alongside. */
  system: boolean;
}

/** How this module reaches the system's token conditions, handed in so it needn't import them. */
export interface ConditionHooks {
  setSystemCondition: (actor: any, id: string, active: boolean) => Promise<void>;
  /** A system condition's name, or null for an id that isn't one. */
  systemConditionLabel: (id: string) => string | null;
}

/** Where timed conditions are kept on an actor. */
export const CONDITIONS_FLAG = "timedConditions";

/** The timed conditions on an actor. */
export function activeConditions(actor: any): StoredCondition[] {
  const stored = actor?.getFlag?.(SYSTEM_ID, CONDITIONS_FLAG);
  return Array.isArray(stored) ? stored.filter((c) => c && typeof c.id === "string") : [];
}

/** The lines an actor's conditions put on a roll of this kind, with these tags. */
export function conditionModifiers(actor: any, kind: string, tags: string[] = []): ModifierLine[] {
  const lines: ModifierLine[] = [];
  for (const condition of activeConditions(actor)) {
    for (const m of condition.modifiers ?? []) {
      if (!isLine(m)) continue;
      if (Array.isArray(m.rolls) && m.rolls.length > 0 && !m.rolls.some((r) => r === kind || tags.includes(r))) continue;
      lines.push({ label: m.label ? `${condition.label}: ${m.label}` : condition.label, value: m.value });
    }
  }
  return lines;
}

/**
 * Applies a condition to an actor: a module's own, or one of the system's
 * token conditions by its id, with modifiers and a duration either way.
 * Applying it again replaces it.
 */
export async function applyCondition(
  actor: any,
  application: ConditionApplication,
  hooks: ConditionHooks,
): Promise<string | null> {
  const a = application ?? ({} as ConditionApplication);
  if (!actor?.isOwner) return null;
  if (typeof a.key !== "string" || !IDENTIFIER.test(a.key)) return null;
  if (a.module !== undefined && (typeof a.module !== "string" || !IDENTIFIER.test(a.module))) return null;
  const system = a.module === undefined;
  const systemLabel = system ? hooks.systemConditionLabel(a.key) : null;
  if (system && systemLabel === null) return null;
  const id = system ? a.key : `${a.module}.${a.key}`;
  const combat = (game as any).combat;
  const turns = Number(a.duration?.turns);
  const rounds = Number(a.duration?.rounds);
  const seconds = Number(a.duration?.seconds);
  const entry: StoredCondition = {
    id,
    label: String(a.label ?? systemLabel ?? a.key),
    modifiers: (a.effects?.modifiers ?? [])
      .filter((m): m is ConditionModifier => isLine(m))
      .map((m) => ({ label: m.label, value: m.value, ...(Array.isArray(m.rolls) ? { rolls: m.rolls.map(String) } : {}) })),
    turnsLeft: Number.isFinite(turns) && turns > 0 ? Math.floor(turns) : null,
    untilRound: Number.isFinite(rounds) && rounds > 0 && combat?.started ? Number(combat.round) + Math.floor(rounds) : null,
    untilTime: Number.isFinite(seconds) && seconds > 0 ? (Number((game as any).time?.worldTime) || 0) + seconds : null,
    system,
  };
  const others = activeConditions(actor).filter((c) => c.id !== id);
  await actor.setFlag(SYSTEM_ID, CONDITIONS_FLAG, [...others, entry]);
  if (system) await hooks.setSystemCondition(actor, a.key, true);
  return id;
}

/** Removes a condition by the id `applyCondition` returned. */
export async function removeCondition(actor: any, id: string, hooks: Pick<ConditionHooks, "setSystemCondition">): Promise<void> {
  if (!actor?.isOwner) return;
  const current = activeConditions(actor);
  const gone = current.find((c) => c.id === id);
  if (!gone) return;
  await actor.setFlag(SYSTEM_ID, CONDITIONS_FLAG, current.filter((c) => c.id !== id));
  if (gone.system) await hooks.setSystemCondition(actor, gone.id, false);
}

/** Which conditions a boundary ends: a new round, a world time, or the start of the actor's own turn. */
export function expiringConditions(
  conditions: StoredCondition[],
  at: { round?: number; time?: number; ownTurnStarted?: boolean },
): { kept: StoredCondition[]; ended: StoredCondition[] } {
  const kept: StoredCondition[] = [];
  const ended: StoredCondition[] = [];
  for (const condition of conditions) {
    const next = { ...condition };
    if (at.ownTurnStarted && next.turnsLeft !== null) next.turnsLeft -= 1;
    const over =
      (next.turnsLeft !== null && next.turnsLeft <= 0) ||
      (next.untilRound !== null && at.round !== undefined && at.round >= next.untilRound) ||
      (next.untilTime !== null && at.time !== undefined && at.time >= next.untilTime);
    (over ? ended : kept).push(next);
  }
  return { kept, ended };
}

async function expireConditions(actor: any, at: { round?: number; time?: number; ownTurnStarted?: boolean }, setSystemCondition: (actor: any, id: string, active: boolean) => Promise<void>): Promise<void> {
  if (!actor?.isOwner) return;
  const current = activeConditions(actor);
  if (current.length === 0) return;
  const { kept, ended } = expiringConditions(current, at);
  const counted = at.ownTurnStarted === true && current.some((c) => c.turnsLeft !== null);
  if (ended.length === 0 && !counted) return;
  await actor.setFlag(SYSTEM_ID, CONDITIONS_FLAG, kept);
  for (const condition of ended) {
    if (condition.system) await setSystemCondition(actor, condition.id, false);
  }
}

// ── bleeding ───────────────────────────────────────────────────────────────

/** How often a wound bleeds and at what modifier, after the listeners. */
/** What the modules say about a First Aid attempt (since 1.36.0): a refusal, and whether success stops the bleeding. */
export function firstAidRules(healer: any, patient: any): { refusal: string | null; stopsBleeding: boolean } {
  const context = callCombatHook(PROCEDURE_HOOKS.firstAid, { healer, patient, refusal: null as string | null, stopsBleeding: true });
  return {
    refusal: typeof context.refusal === "string" && context.refusal.trim() ? context.refusal.trim() : null,
    stopsBleeding: context.stopsBleeding !== false,
  };
}

export function bleedingSchedule(actor: any, modifier: number): { intervalSeconds: number; modifier: number } {
  const context = callCombatHook(PROCEDURE_HOOKS.bleedingSchedule, { actor, intervalSeconds: 60, modifier });
  return {
    intervalSeconds: Math.max(1, Number(context.intervalSeconds) || 60),
    modifier: Number.isFinite(Number(context.modifier)) ? Number(context.modifier) : modifier,
  };
}

// ── technique defaults ─────────────────────────────────────────────────────

/** A technique's defaults, with any the listeners offered in addition. */
export function techniqueDefaultsWithHooks<T extends { from: string; skill: string; modifier: number }>(actor: any, item: any, defaults: T[]): Array<{ from: string; skill: string; modifier: number }> {
  const context = callCombatHook(PROCEDURE_HOOKS.techniqueDefaults, { actor, item, defaults: [...defaults] as Array<{ from: string; skill: string; modifier: number }> });
  return context.defaults.filter((d) => d && typeof d.from === "string" && typeof d.skill === "string" && Number.isFinite(Number(d.modifier)))
    .map((d) => ({ from: d.from, skill: d.skill, modifier: Number(d.modifier) || 0 }));
}

// ── the combat lifecycle ───────────────────────────────────────────────────

/**
 * Fires the combat lifecycle hooks on every client, and clears timed
 * conditions on the GM's.
 */
export function registerProcedureHooks(setSystemCondition: (actor: any, id: string, active: boolean) => Promise<void>): void {
  Hooks.on("updateCombat", (combat: any, changed: any) => {
    const turned = "turn" in (changed ?? {}) || "round" in (changed ?? {});
    if (!turned) return;
    const previous = combat?.previous?.combatantId ? combat.combatants?.get?.(combat.previous.combatantId) : null;
    if (Number(changed?.round) === 1 && !(Number(combat?.previous?.round) > 0)) Hooks.callAll(PROCEDURE_HOOKS.combatStart, combat);
    if (previous && previous.id !== combat?.combatant?.id) Hooks.callAll(PROCEDURE_HOOKS.turnEnd, combat, previous);
    if (combat?.combatant) Hooks.callAll(PROCEDURE_HOOKS.turnStart, combat, combat.combatant);

    if (!game.user?.isGM) return;
    const round = Number(combat?.round) || 0;
    for (const combatant of combat?.combatants ?? []) {
      void expireConditions(combatant.actor, { round, ownTurnStarted: combatant.id === combat?.combatant?.id }, setSystemCondition);
    }
  });
  Hooks.on("updateWorldTime", (worldTime: number) => {
    if (!game.user?.isGM) return;
    for (const actor of (game as any).actors ?? []) {
      if (activeConditions(actor).some((c) => c.untilTime !== null)) void expireConditions(actor, { time: worldTime }, setSystemCondition);
    }
  });
}

/** The four senses a Perception roll is made by (Characters p. 358), as roll tags (since 1.63.0). */
export const SENSE_TAGS = Object.freeze(["vision", "hearing", "tasteSmell", "touch"] as const);

/** Skills used to find things, and the sense each is made by where it is one. */
const DETECTION_SKILLS: Record<string, string> = {
  observation: "vision",
  search: "",
  tracking: "",
};

/**
 * What `gworld.detectionModifiers` listeners add to a roll to detect somebody
 * (since 1.63.0). Returns only the added lines.
 */
export function detectionModifiers(context: Pick<SuccessRollContext, "actor" | "skill" | "tags"> & { subject?: any }): ModifierLine[] {
  const sense = SENSE_TAGS.find((s) => context.tags.includes(s)) ?? "";
  const ctx = callCombatHook(PROCEDURE_HOOKS.detectionModifiers, {
    observer: context.actor,
    subject: context.subject ?? null,
    sense,
    skill: context.skill,
    tags: [...context.tags],
    modifiers: [] as ModifierLine[],
  });
  return (Array.isArray(ctx.modifiers) ? ctx.modifiers : []).filter(isLine);
}
