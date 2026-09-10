/**
 * Rolling and chat output.
 *
 * The dice go through Foundry's Roll class so that dice-animation modules and
 * the roll log behave normally; the *interpretation* — success, margin, and
 * critical status — comes from the pure rules engine, which is the only place
 * those rules are defined.
 */

import { SYSTEM_ID } from "./constants.js";
import { canAttempt, resolveDefense, resolveSuccess, type SuccessRollResult } from "../rules/success.js";
import { applyDamageFloor, computeInjury } from "../rules/damage.js";
import { parseDiceAdds, toRollFormula } from "../rules/dice.js";
import type { DamageType } from "../rules/types.js";

const CHAT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/success-roll.hbs`;
const DAMAGE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/damage-roll.hbs`;

/** What rules a roll is judged by; only defenses skip the minimum-3 check. */
export type RollKind = "skill" | "attribute" | "attack" | "defense";

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
  kind?: RollKind;
  modifiers?: RollModifier[];
}

/**
 * Rolls 3d6 against a target number and posts the result to chat.
 *
 * Returns the resolved outcome so callers can chain on it (an attack that hits
 * going on to roll damage, for instance).
 */
export async function rollSuccess(options: SuccessRollOptions): Promise<SuccessRollResult | null> {
  const { actor, base, label, kind = "skill", modifiers = [] } = options;

  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const effective = base + totalModifier;

  // A roll at effective skill below 3 may not be attempted at all, and only
  // active defenses are exempt (GURPS Lite p. 2). Without this check a rolled
  // 3 or 4 would report success, since those always succeed once rolled.
  if (kind !== "defense" && !canAttempt(effective)) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Roll.TooLowToAttempt", { label, effective }),
    );
    return null;
  }

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
  modifiers?: RollModifier[];
}

/**
 * Rolls damage and posts it to chat with the wounding modifier shown.
 *
 * Applying it to a target needs that target's DR, so the card carries the
 * numbers a GM needs rather than guessing at whom it hit.
 */
export async function rollDamage(options: DamageRollOptions): Promise<number> {
  const { actor, label, formula, damageType, armorDivisor = 1, modifiers = [] } = options;

  const parsed = parseDiceAdds(formula);
  if (!parsed) {
    ui.notifications?.warn(`Could not parse damage formula "${formula}".`);
    return 0;
  }

  const bonus = modifiers.reduce((sum, m) => sum + m.value, 0);
  const roll = new Roll(toRollFormula({ dice: parsed.dice, adds: parsed.adds + bonus }));
  await roll.evaluate();

  // The floor lives in the rules engine; duplicating it here would let chat
  // damage drift from the rules if it ever changes.
  const basicDamage = applyDamageFloor(roll.total, damageType);

  // Shown against DR 0 so the card states raw injury; the GM subtracts real DR.
  const undefended = computeInjury({ basicDamage, dr: 0, type: damageType });

  const content = await foundry.applications.handlebars.renderTemplate(DAMAGE_TEMPLATE, {
    label,
    formula,
    damageType,
    armorDivisor,
    // A divisor of 1 is the ordinary case and is not worth a line on the card.
    // Anything else is, in both directions: above 1 it divides the target's DR,
    // below 1 it multiplies it, and a stake at (0.5) doubling DR matters to the
    // GM every bit as much as a beam weapon halving it.
    hasArmorDivisor: armorDivisor !== 1,
    modifiers: modifiers.filter((m) => m.value !== 0),
    basicDamage,
    woundingModifier: undefended.woundingModifier,
    injuryIfUnarmored: undefended.injury,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
    // Carried on the message so the card can still apply the blow later: the
    // roll is over, but who it lands on is decided afterwards, and re-reading
    // the numbers out of the rendered HTML would be parsing our own output.
    flags: {
      [SYSTEM_ID]: {
        damage: { basicDamage, damageType, armorDivisor, label },
      },
    },
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

/**
 * Handles a click on any element carrying the roll dataset.
 *
 * Shared by the character and NPC sheets so both route through chat and behave
 * identically — an NPC's Dodge should roll exactly like a PC's.
 */
export async function handleRollAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<void> {
  const { rollType, rollLabel, rollTarget } = target.dataset;
  const base = Number(rollTarget);
  if (!Number.isFinite(base)) return;

  const modifiers = await maybePromptModifiers(event);
  if (modifiers === null) return;

  await rollSuccess({
    actor,
    base,
    label: rollLabel ?? rollType ?? "Roll",
    kind: rollKind(rollType),
    modifiers,
  });
}

/** Handles a click on any element carrying the damage dataset. */
export async function handleDamageAction(
  actor: any,
  event: Event,
  target: HTMLElement,
): Promise<void> {
  const { damageFormula, damageType, damageLabel, armorDivisor } = target.dataset;
  if (!damageFormula || !damageType) return;

  const modifiers = await maybePromptModifiers(event);
  if (modifiers === null) return;

  await rollDamage({
    actor,
    label: damageLabel ?? "Damage",
    formula: damageFormula,
    damageType: damageType as DamageType,
    armorDivisor: Number(armorDivisor) || 1,
    modifiers,
  });
}

/** Maps a roll's data-roll-type to the rules the roll should be judged by. */
function rollKind(rollType: string | undefined): RollKind {
  if (rollType === "dodge" || rollType === "parry" || rollType === "block") return "defense";
  if (rollType === "attribute") return "attribute";
  if (rollType === "attack") return "attack";
  return "skill";
}

/**
 * Shift-click asks for a situational modifier. Returns null when the prompt is
 * dismissed, meaning the caller should abandon the roll entirely.
 */
async function maybePromptModifiers(event: Event): Promise<RollModifier[] | null> {
  if (!(event as MouseEvent).shiftKey) return [];

  const value = await promptForModifier();
  if (value === null) return null;
  if (value === 0) return [];
  return [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value }];
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
