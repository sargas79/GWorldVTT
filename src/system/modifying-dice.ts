/**
 * Modifying Dice + Adds (GURPS Basic Set: Characters p. 269), where the table
 * plays it.
 *
 * The conversion itself is pure and lives with the dice. What is here is the
 * one question the sheet, the chat card and a module all ask -- what does this
 * damage come to at this table -- so they cannot come to different answers.
 *
 * What an actor's data holds is never converted. The attack rows keep the
 * damage as worked out, because the bonuses added when the blow is struck
 * (All-Out Attack, Mighty Blows) are counted per die of that damage, not of
 * the dice a conversion made. The sheet shows the converted figure, and the
 * damage roll converts again once everything has been added.
 */

import { formatDiceAdds, modifyDiceAdds, parseDiceAdds } from "../rules/dice.js";
import { isRuleOn } from "./optional-rules.js";

/** The rule's key in the optional rules. */
export const MODIFYING_DICE_RULE = "modifyingDiceAdds";

/** A damage formula as worked out, and as the table rolls it. */
export interface NormalizedDamage {
  /** The formula as given, before any conversion. */
  raw: string;
  /** The formula to show and roll: the raw one where nothing changed. */
  normalized: string;
  /** Whether the rule turned any adds into dice. */
  converted: boolean;
}

/**
 * A damage formula converted by the rule where it is on.
 *
 * `ruleOn` defaults to the world's setting; a test or a module that wants the
 * conversion regardless can say. A formula that is not dice+adds -- "spec.",
 * a blank -- comes back as it was, since there is nothing to convert.
 */
export function normalizeDamage(formula: string, ruleOn: boolean = isRuleOn(MODIFYING_DICE_RULE)): NormalizedDamage {
  const raw = String(formula ?? "");
  const parsed = ruleOn ? parseDiceAdds(raw) : null;
  if (!parsed) return { raw, normalized: raw, converted: false };
  const modified = modifyDiceAdds(parsed);
  // Compared by the numbers rather than the text, so "1d+3" written
  // "1D + 3" is not reported as a conversion.
  const converted = modified.dice !== parsed.dice || modified.adds !== parsed.adds;
  return { raw, normalized: converted ? formatDiceAdds(modified) : raw, converted };
}

/** The damage to show on a sheet: {@link normalizeDamage}'s figure. */
export function shownDamage(formula: unknown): string {
  return typeof formula === "string" ? normalizeDamage(formula).normalized : String(formula ?? "");
}
