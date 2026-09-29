/**
 * More maneuvers (Basic Set Revised pp. 575-576): a slam under All-Out Attack,
 * All-Out Concentrate, Mental Defense, Committed Attack and Defensive Attack.
 * Figures are in `rules/more-maneuvers.ts`. The choices each maneuver asks for
 * are maneuver options on the sheet, kept as flags like a module's; the lines
 * they put on the attack, the damage, the defenses and the casting roll are
 * read from those choices here.
 */

import { isRuleOn } from "./optional-rules.js";
import { registerManeuverOption, chosenManeuverOptions } from "./procedure-extensions.js";
import type { AttackEffect } from "./combat-extensions.js";
import {
  ADDENDUM_MANEUVERS,
  ADDENDUM_MANEUVER_ORDER,
  ALL_OUT_CONCENTRATE_BONUS,
  COMMITTED_DEFENSE_PENALTY,
  DEFENSIVE_GRAPPLE_BONUS,
  MENTAL_DEFENSE_BONUS,
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
    input: select(["parry", "block", "sameWeapon"], "Benefit"), available: () => isRuleOn("defensiveAttack"),
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
  return defensive(actor) && defensiveAllowsSameWeaponParry(String(chosen(actor, "defensiveBenefit") ?? ""));
}

/** The line All-Out Concentrate adds to a skill or spell roll (the concentrated task; the GM says which). */
export function allOutConcentrateLines(actor: any, kind: string): Line[] {
  if (maneuverOf(actor) !== "allOutConcentrate" || !isRuleOn("allOutConcentrate") || kind !== "skill") return [];
  return [{ label: game.i18n.localize("GWORLD.Maneuver.allOutConcentrate"), value: ALL_OUT_CONCENTRATE_BONUS }];
}

/** The line Mental Defense adds to a roll to resist a supernatural attack. */
export function mentalDefenseLines(actor: any, tags: readonly string[]): Line[] {
  if (maneuverOf(actor) !== "allOutDefense" || !isRuleOn("mentalDefense") || !tags.includes("resist")) return [];
  if (!isChecked(chosen(actor, "mentalDefense"))) return [];
  return [{ label: L("MentalDefenseLine"), value: MENTAL_DEFENSE_BONUS }];
}

export { ADDENDUM_MANEUVERS };
