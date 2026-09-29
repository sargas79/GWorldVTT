/**
 * More maneuvers (Basic Set Revised pp. 575-576): a slam under All-Out Attack,
 * All-Out Concentrate, Mental Defense, Committed Attack and Defensive Attack.
 * Figures are in `rules/more-maneuvers.ts`. The choices each maneuver asks for
 * are maneuver options on the sheet, kept as flags like a module's; the lines
 * they put on the attack, the damage, the defenses and the casting roll are
 * read from those choices here.
 */

import { isRuleOn } from "./optional-rules.js";
import { rapidRecoveryDeclared } from "./combat-extras.js";
import { PROCEDURE_HOOKS, registerManeuverOption, chosenManeuverOptions, recordAttackMade } from "./procedure-extensions.js";
import { getCombatState, setCombatState, type AttackEffect } from "./combat-extensions.js";
import { SYSTEM_ID } from "./constants.js";
import { HEROIC_CHARGE_FALL_PENALTY } from "../rules/extra-effort-extras.js";
import type { MovementAllowance } from "../rules/maneuvers.js";
import { extrasThisRound } from "./combat-extras.js";
import {
  ADDENDUM_MANEUVERS,
  ADDENDUM_MANEUVER_ORDER,
  ALL_OUT_CONCENTRATE_BONUS,
  COMMITTED_DEFENSE_PENALTY,
  DEFENSIVE_GRAPPLE_BONUS,
  DEFENSIVE_KICK_BALANCE,
  MENTAL_DEFENSE_BONUS,
  allOutConcentrateApplies,
  concentrationRunAfterTurn,
  maneuverSteps,
  slamAllowsAttackBefore,
  allOutMaySlam,
  allOutSlamMovement,
  committedDamageBonus,
  committedRefuses,
  committedToHit,
  defensiveAllowsSameWeaponParry,
  defensiveDamagePenalty,
  defensiveDefenseBonus,
  isAddendumManeuver,
  type AddendumManeuver,
} from "../rules/more-maneuvers.js";

const MODULE = "gworld";
const OPTION_PREFIX = `${MODULE}.`;

const L = (key: string) => game.i18n.localize(`GWORLD.MoreManeuvers.${key}`);

interface Line { label: string; value: number }

/** The switch a maneuver is offered under. */
const SWITCH: Record<AddendumManeuver, string> = {
  committedAttack: "committedAttack",
  defensiveAttack: "defensiveAttack",
  allOutConcentrate: "allOutConcentrate",
};

/** Whether the maneuver is offered: its switch is on. */
export function addendumManeuverOn(key: string): boolean {
  return isAddendumManeuver(key) && isRuleOn(SWITCH[key]);
}

/** The addendum's maneuvers a sheet offers, and the one already chosen even if its switch went off. */
export function moreManeuverChoices(current: string): Array<{ key: string; label: string; selected: boolean }> {
  return ADDENDUM_MANEUVER_ORDER
    .filter((key) => key === current || addendumManeuverOn(key))
    .map((key) => ({ key, label: game.i18n.localize(`GWORLD.Maneuver.${key}`), selected: current === key }));
}

const maneuverOf = (actor: any): string => String(actor?.system?.maneuver ?? "");
const chosen = (actor: any, key: string): unknown => chosenManeuverOptions(actor)[`${OPTION_PREFIX}${key}`];
const isChecked = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";

/** Whether the actor is on Committed Attack, and the switch is on. */
const committed = (actor: any) => maneuverOf(actor) === "committedAttack" && isRuleOn("committedAttack");
const defensive = (actor: any) => maneuverOf(actor) === "defensiveAttack" && isRuleOn("defensiveAttack");

/** The maneuver options: the choices each asks for, drawn on the combat tab. */
export function registerMoreManeuvers(): void {
  const select = (choices: string[], group: string) => ({
    type: "select" as const,
    choices: choices.map((value) => ({ value, label: L(`${group}.${value}`) })),
  });
  registerManeuverOption({
    module: MODULE, key: "slam", maneuver: "allOutAttack", label: L("Slam"),
    available: () => isRuleOn("allOutSlams"),
    refuse: ({ actor }) => (allOutMaySlam(String(actor?.system?.allOutAttackOption ?? "determined")) ? null : L("SlamRefused")),
  });
  registerManeuverOption({
    module: MODULE, key: "committedKind", maneuver: "committedAttack", label: L("CommittedKind"),
    input: select(["determined", "strong"], "Kind"), available: () => isRuleOn("committedAttack"),
  });
  registerManeuverOption({
    module: MODULE, key: "committedStep", maneuver: "committedAttack", label: L("SecondStep"),
    available: () => isRuleOn("committedAttack"),
  });
  registerManeuverOption({
    module: MODULE, key: "committedWith", maneuver: "committedAttack", label: L("CommittedWith"),
    input: select(["hand", "shield", "kick"], "With"), available: () => isRuleOn("committedAttack"),
  });
  registerManeuverOption({
    module: MODULE, key: "defensiveBenefit", maneuver: "defensiveAttack", label: L("DefensiveBenefit"),
    input: select(["parry", "block", "sameWeapon", "kick"], "Benefit"), available: () => isRuleOn("defensiveAttack"),
  });
  registerManeuverOption({
    module: MODULE, key: "mentalDefense", maneuver: "allOutDefense", label: L("MentalDefense"),
    available: () => isRuleOn("mentalDefense"),
  });
}

/** Whether an All-Out Attack the actor made may move a full Move: a slam. */
export function slamMovement(actor: any, maneuver: string, option: string): "full" | null {
  if (maneuver !== "allOutAttack" || !isRuleOn("allOutSlams") || !isChecked(chosen(actor, "slam"))) return null;
  const opt = option || String(actor?.system?.allOutAttackOption ?? "determined");
  return allOutSlamMovement(opt).movement === "full" ? "full" : null;
}

/** What the maneuver does to the attack: Committed's to-hit and Defensive's grapple bonus for the foe. */
export function moreManeuverAttackEffect(context: { actor: any; ranged: boolean; damageType: string }): AttackEffect | null {
  const { actor } = context;
  if (committed(actor)) {
    const kind = String(chosen(actor, "committedKind") ?? "");
    const modifiers: Line[] = [];
    if (kind === "determined") modifiers.push({ label: L("DeterminedLine"), value: committedToHit(kind, false) });
    if (isChecked(chosen(actor, "committedStep"))) modifiers.push({ label: L("SecondStepLine"), value: committedToHit("", true) });
    return modifiers.length ? { modifiers } : null;
  }
  // Under Defensive Attack a grab or grapple, which does no damage, is defended at +1.
  if (defensive(actor) && !context.ranged && !context.damageType) {
    return { defenseModifiers: [{ label: L("GrappleLine"), value: DEFENSIVE_GRAPPLE_BONUS }] };
  }
  return null;
}

/** The damage line Committed (Strong) or Defensive puts on a melee blow. */
export function moreManeuverDamageLines(actor: any, dice: number, melee: boolean, stBased: boolean): Line[] {
  if (!melee) return [];
  if (committed(actor)) {
    const value = committedDamageBonus(String(chosen(actor, "committedKind") ?? ""), dice, stBased);
    return value ? [{ label: game.i18n.localize("GWORLD.Maneuver.committedAttack"), value }] : [];
  }
  if (defensive(actor)) return [{ label: game.i18n.localize("GWORLD.Maneuver.defensiveAttack"), value: defensiveDamagePenalty(dice) }];
  return [];
}

/** The lines the defender's own maneuver puts on a defense roll. */
export function moreManeuverDefenseLines(actor: any, defense: string): Line[] {
  const lines: Line[] = [];
  if (committed(actor)) lines.push({ label: game.i18n.localize("GWORLD.Maneuver.committedAttack"), value: COMMITTED_DEFENSE_PENALTY });
  if (defensive(actor)) {
    const bonus = defensiveDefenseBonus(String(chosen(actor, "defensiveBenefit") ?? ""), defense);
    if (bonus) lines.push({ label: game.i18n.localize("GWORLD.Maneuver.defensiveAttack"), value: bonus });
  }
  return lines;
}

/** Why a Committed Attack rules a defense out, or null. Retreat is never allowed. */
export function committedRefusal(actor: any, defense: "dodge" | "parry" | "block" | "retreat"): string | null {
  if (!committed(actor)) return null;
  if (defense === "retreat") return L("NoRetreat");
  return committedRefuses(String(chosen(actor, "committedWith") ?? ""), defense) ? L(`Refuses.${defense}`) : null;
}

/** Whether the actor may parry again with an unbalanced weapon it attacked with (Defensive Attack). */
export function allowsSameWeaponParry(actor: any): boolean {
  // Rapid Recovery, declared before the first parry, does as much (Revised p. 571).
  if (rapidRecoveryDeclared(actor)) return true;
  return defensive(actor) && defensiveAllowsSameWeaponParry(String(chosen(actor, "defensiveBenefit") ?? ""));
}

/** Where an actor's run of concentrating turns is kept: true while every one was All-Out Concentrate. */
const CONCENTRATION_FLAG = "allOutConcentrationRun";

/**
 * The line All-Out Concentrate adds to a skill or spell roll (the concentrated
 * task; the GM says which), only while the task has been All-Out Concentrate
 * the entire time (p. 575). A roll to keep concentrating through a distraction
 * is tagged `distraction` and takes it on the maneuver alone.
 */
export function allOutConcentrateLines(actor: any, kind: string, tags: readonly string[] = []): Line[] {
  if (maneuverOf(actor) !== "allOutConcentrate" || !isRuleOn("allOutConcentrate") || kind !== "skill") return [];
  const run = actor?.getFlag?.(SYSTEM_ID, CONCENTRATION_FLAG);
  const applies = allOutConcentrateApplies({
    maneuver: maneuverOf(actor),
    allOutSoFar: typeof run === "boolean" ? run : null,
    distraction: tags.includes("distraction"),
  });
  return applies ? [{ label: game.i18n.localize("GWORLD.Maneuver.allOutConcentrate"), value: ALL_OUT_CONCENTRATE_BONUS }] : [];
}

/** Keeps the run of concentrating turns as each combatant's turn ends. The GM's client writes it. */
export function registerConcentrationRun(): void {
  Hooks.on(PROCEDURE_HOOKS.turnEnd, (_combat: unknown, combatant: any) => {
    if (!game.user?.isGM) return;
    const actor = combatant?.actor;
    if (!actor?.isOwner || typeof actor.getFlag !== "function") return;
    const before = actor.getFlag(SYSTEM_ID, CONCENTRATION_FLAG);
    const after = concentrationRunAfterTurn(typeof before === "boolean" ? before : null, maneuverOf(actor));
    if (after === null) {
      if (before !== undefined) void actor.unsetFlag(SYSTEM_ID, CONCENTRATION_FLAG);
    } else if (after !== before) {
      void actor.setFlag(SYSTEM_ID, CONCENTRATION_FLAG, after);
    }
  });
}

/**
 * The steps the actor's maneuver allows: one, Committed Attack's second when
 * it takes it, and a Giant Step declared this round (Revised pp. 571, 576).
 */
export function stepsFor(actor: any, movement: MovementAllowance): number {
  return maneuverSteps({
    movement,
    secondStep: committed(actor) && isChecked(chosen(actor, "committedStep")),
    giantStep: extrasThisRound(actor).includes("giantStep"),
  });
}

/** Whether the actor is on an All-Out Attack (Double) that slams (p. 575). */
function doubleSlam(actor: any): boolean {
  return maneuverOf(actor) === "allOutAttack" && isRuleOn("allOutSlams") && isChecked(chosen(actor, "slam"))
    && slamAllowsAttackBefore(String(actor?.system?.allOutAttackOption ?? "determined"));
}

/** Why a slam is refused: a Double slams once, not twice (p. 575). */
export function slamRefusal(actor: any): string | null {
  return doubleSlam(actor) && getCombatState(actor, SYSTEM_ID, "slamMade") === true ? L("SlamTwice") : null;
}

/** Why an attack is refused: after the slam of a Double there is no other attack to make before it (p. 575). */
export function attackAfterSlamRefusal(actor: any): string | null {
  return doubleSlam(actor) && getCombatState(actor, SYSTEM_ID, "slamMade") === true ? L("AttackAfterSlam") : null;
}

/** A slam is one of a Double's two attacks: counted, and remembered so no attack follows it. */
export async function noteSlam(actor: any): Promise<void> {
  if (!doubleSlam(actor) || !(game as { combat?: { started?: boolean } }).combat?.started) return;
  await setCombatState(actor, SYSTEM_ID, "slamMade", true, "turn");
  await recordAttackMade(actor);
}

/**
 * The lines on a roll to avoid falling or tripping, tagged `fall` (a DX roll
 * from the roll dialog, or a module's): +2 for a kick under Defensive Attack
 * (p. 576), and -2 after a Heroic Charge, whose defensive drawbacks still apply
 * (p. 571).
 */
export function fallRollLines(actor: any, tags: readonly string[]): Line[] {
  if (!tags.includes("fall")) return [];
  const lines: Line[] = [];
  if (defensive(actor) && String(chosen(actor, "defensiveBenefit") ?? "") === "kick") {
    lines.push({ label: L("KickBalanceLine"), value: DEFENSIVE_KICK_BALANCE });
  }
  if (isRuleOn("extraEffort") && extrasThisRound(actor).includes("heroicCharge")) {
    lines.push({ label: game.i18n.localize("GWORLD.ExtraEffort.HeroicChargeFall"), value: HEROIC_CHARGE_FALL_PENALTY });
  }
  return lines;
}

/** The line Mental Defense adds to a roll to resist a supernatural attack. */
export function mentalDefenseLines(actor: any, tags: readonly string[]): Line[] {
  if (maneuverOf(actor) !== "allOutDefense" || !isRuleOn("mentalDefense") || !tags.includes("resist")) return [];
  if (!isChecked(chosen(actor, "mentalDefense"))) return [];
  return [{ label: L("MentalDefenseLine"), value: MENTAL_DEFENSE_BONUS }];
}

export { ADDENDUM_MANEUVERS };
