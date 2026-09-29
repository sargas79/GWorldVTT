/**
 * The combat options of extra effort (Basic Set Revised p. 571): Giant Step,
 * Great Lunge, Heroic Charge and Rapid Recovery, beside Flurry of Blows,
 * Mighty Blows and Feverish Defense, and the cap of one "offensive" and one
 * "defensive" option a turn. The figures are in `rules/extra-effort-extras.ts`.
 *
 * The three offensive options are attack options under module `gworld`, chosen
 * in the attack dialog and paid with the roll; Rapid Recovery is declared on
 * the sheet before the first parry, since it decides which weapons may parry.
 * What each round holds is kept on the actor, keyed to the round it was used
 * in, so the cap lapses on its own when the next round begins.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { registerAttackOption, registerExtraEffort } from "./combat-extensions.js";
import { spendFatigue } from "./extra-effort.js";
import {
  COMBAT_EXTRA_FP,
  FATIGUE_TRADE_MAX,
  fatigueForSkillBonus,
  GIANT_STEP_CRITICAL_LIMB,
  GIANT_STEP_STEPS,
  GREAT_LUNGE_REACH,
  HEROIC_CHARGE_TO_HIT,
  extrasAdded,
  extrasHeld,
  extrasRefused,
  giantStepAllowed,
  greatLungeAllowed,
  heroicChargeAllowed,
  rapidRecoveryAllowed,
  type CombatExtra,
  type ExtrasRecord,
} from "../rules/extra-effort-extras.js";

const MODULE = "gworld";
const RECORD_FLAG = "extrasThisRound";
const RAPID_FLAG = "rapidRecovery";
/** Where Rapid Recovery is kept outside a battle, which has no rounds to end it. */
const NO_COMBAT = "noCombat";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.ExtraEffort.${key}`, data) : game.i18n.localize(`GWORLD.ExtraEffort.${key}`);

/** The battle's current round as a key, or null where there is no battle under way. */
export function roundKey(): string | null {
  const combat = (globalThis as { game?: { combat?: { id?: string; started?: boolean; round?: number } } }).game?.combat;
  return combat?.started ? `${combat.id ?? ""}:${Number(combat.round) || 0}` : null;
}

/** The combat options an actor has used this round. */
export function extrasThisRound(actor: any): CombatExtra[] {
  return extrasHeld(actor?.getFlag?.(SYSTEM_ID, RECORD_FLAG) as ExtrasRecord | undefined, roundKey());
}

/**
 * Why the cap refuses these options this round, or null: "no more than one
 * offensive and one defensive per turn" (p. 571). Nothing is tracked outside
 * a battle.
 */
export function extrasCapRefusal(actor: any, wanted: readonly CombatExtra[]): string | null {
  if (roundKey() === null) return null;
  const over = extrasRefused(extrasThisRound(actor), wanted);
  return over.length === 0 ? null : L("OverCap", { extra: over.map((extra) => L(`Extra.${extra}`)).join(", ") });
}

/** Remembers the options an actor used this round, for the cap. */
export async function recordExtras(actor: any, extras: readonly CombatExtra[]): Promise<void> {
  const round = roundKey();
  if (round === null || extras.length === 0 || !actor?.isOwner) return;
  const record = actor.getFlag?.(SYSTEM_ID, RECORD_FLAG) as ExtrasRecord | undefined;
  await actor.setFlag(SYSTEM_ID, RECORD_FLAG, extrasAdded(record, round, extras));
}

/** The combat options among a set of attack option values, by key: `{ "gworld.giantStep": true }` and the like. */
export function extrasOfOptions(values: Record<string, unknown> | null | undefined): CombatExtra[] {
  const found: CombatExtra[] = [];
  for (const key of ["giantStep", "greatLunge", "heroicCharge"] as const) {
    if (values?.[`${MODULE}.${key}`]) found.push(key);
  }
  return found;
}

/** Whether Rapid Recovery was declared this round, so a weapon that attacked may parry. */
export function rapidRecoveryDeclared(actor: any): boolean {
  if (!isRuleOn("extraEffort")) return false;
  return actor?.getFlag?.(SYSTEM_ID, RAPID_FLAG) === (roundKey() ?? NO_COMBAT);
}

/** Whether the actor has a weapon that attacked and may now be recovered: what Rapid Recovery is for. */
export function mayRapidRecover(actor: any): boolean {
  const maneuver = String(actor?.system?.maneuver ?? "");
  const rows: any[] = actor?.system?.derived?.melee ?? [];
  const unbalanced = rows.some((row) => row?.unbalanced === true) && actor?.system?.conditions?.attackedThisTurn === true;
  return rapidRecoveryAllowed({ maneuver, unbalanced });
}

/**
 * Declares Rapid Recovery (p. 571): 1 FP, before the first parry, and until
 * this round ends the weapon that attacked may parry, at the usual penalties.
 * Returns whether it was declared.
 */
export async function declareRapidRecovery(actor: any): Promise<boolean> {
  if (!isRuleOn("extraEffort") || !actor?.isOwner) return false;
  if (rapidRecoveryDeclared(actor)) return true;
  if (!mayRapidRecover(actor)) {
    ui.notifications?.warn(L("RapidRecoveryNotNow"));
    return false;
  }
  const refusal = extrasCapRefusal(actor, ["rapidRecovery"]);
  if (refusal) {
    ui.notifications?.warn(refusal);
    return false;
  }
  if (!(await spendFatigue(actor, COMBAT_EXTRA_FP, L("Extra.rapidRecovery")))) return false;
  await actor.setFlag(SYSTEM_ID, RAPID_FLAG, roundKey() ?? NO_COMBAT);
  await recordExtras(actor, ["rapidRecovery"]);
  return true;
}

/**
 * Giant Step, Great Lunge and Heroic Charge as attack options, and the listener
 * that lifts Move and Attack's cap for a Heroic Charge. Called once on ready.
 */
export function registerCombatExtras(): void {
  const capped = (extra: CombatExtra) => (context: { actor: any }) => extrasCapRefusal(context.actor, [extra]);
  registerExtraEffort({
    module: MODULE, key: "giantStep", label: L("Extra.giantStep"), kind: "offense", fp: COMBAT_EXTRA_FP,
    available: (context) => isRuleOn("extraEffort") && giantStepAllowed(context.maneuver),
    refuse: capped("giantStep"),
    apply: () => ({ notes: [L("GiantStepNote", { steps: GIANT_STEP_STEPS, limb: GIANT_STEP_CRITICAL_LIMB })] }),
  });
  registerExtraEffort({
    module: MODULE, key: "greatLunge", label: L("Extra.greatLunge"), kind: "offense", fp: COMBAT_EXTRA_FP,
    available: (context) => isRuleOn("extraEffort") && context.ranged !== true && greatLungeAllowed(context.maneuver),
    refuse: capped("greatLunge"),
    apply: () => ({ reachBonus: GREAT_LUNGE_REACH, notes: [L("GreatLungeNote", { reach: GREAT_LUNGE_REACH })] }),
  });
  registerExtraEffort({
    module: MODULE, key: "heroicCharge", label: L("Extra.heroicCharge"), kind: "offense", fp: COMBAT_EXTRA_FP,
    available: (context) => isRuleOn("extraEffort") && heroicChargeAllowed(context.maneuver),
    refuse: capped("heroicCharge"),
    apply: (context) => ({
      // A melee Move and Attack is at -4; a Heroic Charge takes that back.
      modifiers: context.ranged ? [] : [{ label: L("Extra.heroicCharge"), value: HEROIC_CHARGE_TO_HIT }],
      notes: [L("HeroicChargeNote")],
    }),
  });
  // Trading Fatigue for Skill, on an attack where the GM allows it (p. 572): a
  // spinner in the attack dialog, 1 FP per +1 up to +4, paid with the roll.
  registerAttackOption({
    module: MODULE, key: "fatigueTrade", label: L("TradeAttackSpinner", { max: FATIGUE_TRADE_MAX }), attack: "any",
    input: { type: "number", min: 0, max: FATIGUE_TRADE_MAX },
    available: () => isRuleOn("fatigueForSkill"),
    apply: (_context, value) => {
      const bonus = fatigueForSkillBonus(Number(value) || 0);
      return bonus > 0 ? { modifiers: [{ label: L("TradeSkillLine"), value: bonus }], fatigue: bonus } : null;
    },
  });
  // Its cap of 9 goes too, in melee (p. 571); the defensive drawbacks stay.
  Hooks.on("gworld.attackModifiers", (context: { options?: Record<string, unknown>; ranged?: boolean; skillCap?: number | null }) => {
    if (context?.options?.[`${MODULE}.heroicCharge`]) context.skillCap = null;
  });
}
