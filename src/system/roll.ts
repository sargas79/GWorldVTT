/**
 * Rolling and chat output.
 *
 * The dice go through Foundry's Roll class so that dice-animation modules and
 * the roll log behave normally; the *interpretation* — success, margin, and
 * critical status — comes from the pure rules engine, which is the only place
 * those rules are defined.
 */

import { SYSTEM_ID } from "./constants.js";
import { resolveDefense, resolveSuccess, type SuccessRollResult } from "../rules/success.js";
import { computeInjury } from "../rules/damage.js";
import { parseDiceAdds } from "../rules/dice.js";
import type { DamageType } from "../rules/types.js";

const CHAT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;
const DAMAGE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-roll.hbs`;

export interface RollModifier {
  label: string;
  value: number;
}

export interface SuccessRollOptions {
  actor: any;
  /** The unmodified target number, e.g. a skill level or defense score. */
  base: number;
  label: string;
  /** What kind of roll this is; defense rolls use the defense success rules. */
  kind?: "skill" | "attribute" | "attack" | "defense";
  modifiers?: RollModifier[];
}

/**
 * Rolls 3d6 against a target number and posts the result to chat.
 *
 * Returns the resolved outcome so callers can chain on it (an attack that hits
 * going on to roll damage, for instance).
 */
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult> {
  const { actor, base, label, kind = "skill", modifiers = [] } = options;

  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const effective = base + totalModifier;

  const roll = new Roll("3d6");
  await roll.evaluate();

  const outcome =
    kind === "defense"
      ? resolveDefense(roll.total, effective, dieResults(roll))
      : resolveSuccess(roll.total, effective, dieResults(roll));

  const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
    label,
    kind,
    base,
    modifiers: modifiers.filter((m) => m.value !== 0),
    totalModifier,
    effective,
    outcome,
    resultLabel: describeOutcome(outcome, kind),
    resultClass: outcomeClass(outcome),
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return outcome;
}

export interface DamageRollOptions {
  actor: any;
  label: string;
  /** A dice+adds formula such as "1d+3". */
  formula: string;
  damageType: DamageType;
  armorDivisor?: number;
}

/**
 * Rolls damage and posts it to chat with the wounding modifier shown.
 *
 * Applying it to a target needs that target's DR, so the card carries the
 * numbers a GM needs rather than guessing at whom it hit.
 */
export async function rollDamage(options: DamageRollOptions): Promise<number> {
  const { actor, label, formula, damageType, armorDivisor = 1 } = options;

  const parsed = parseDiceAdds(formula);
  if (!parsed) {
    ui.notifications?.warn(`Could not parse damage formula "${formula}".`);
    return 0;
  }

  const roll = new Roll(`${parsed.dice}d6 + ${parsed.adds}`);
  await roll.evaluate();

  // Basic damage floors at 0 for crushing, 1 for everything else.
  const basicDamage = Math.max(damageType === "cr" ? 0 : 1, roll.total);

  // Shown against DR 0 so the card states raw injury; the GM subtracts real DR.
  const undefended = computeInjury({ basicDamage, dr: 0, type: damageType });

  const content = await foundry.applications.handlebars.renderTemplate(DAMAGE_TEMPLATE, {
    label,
    formula,
    damageType,
    armorDivisor,
    basicDamage,
    woundingModifier: undefended.woundingModifier,
    injuryIfUnarmored: undefended.injury,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return basicDamage;
}

/**
 * Asks for a situational modifier before rolling.
 *
 * Returns null when the dialog is dismissed, which cancels the roll — distinct
 * from returning 0, which rolls unmodified.
 */
export async function promptForModifier(): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("GWORLD.Chat.ModifierTitle") },
    content: `<div class="gworld">
      <label style="display:flex;align-items:center;gap:8px">
        <span>${game.i18n.localize("GWORLD.Chat.Modifier")}</span>
        <input type="number" name="modifier" value="0" step="1" autofocus style="width:80px">
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const input = button
          .closest<HTMLElement>(".application")
          ?.querySelector<HTMLInputElement>('input[name="modifier"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });

  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  const dice = roll.dice?.[0]?.results ?? [];
  return dice.map((r: { result: number }) => r.result);
}

function describeOutcome(outcome: SuccessRollResult, kind: string): string {
  const key = outcome.criticalSuccess
    ? "CriticalSuccess"
    : outcome.criticalFailure
      ? "CriticalFailure"
      : outcome.success
        ? "Success"
        : "Failure";

  const base = game.i18n.localize(`GWORLD.Roll.${key}`);
  if (outcome.criticalSuccess || outcome.criticalFailure) return base;

  const marginKey = outcome.success ? "MarginOfSuccess" : "MarginOfFailure";
  // GURPS Lite defines no critical results for active defenses.
  const suffix = kind === "defense" ? "" : ` — ${game.i18n.localize(`GWORLD.Roll.${marginKey}`)} ${outcome.margin}`;
  return `${base}${suffix}`;
}

function outcomeClass(outcome: SuccessRollResult): string {
  if (outcome.criticalSuccess) return "crit-success";
  if (outcome.criticalFailure) return "crit-failure";
  return outcome.success ? "success" : "failure";
}
