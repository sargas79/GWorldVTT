/**
 * Rolling a Fright Check and reading the table
 * (GURPS Basic Set: Campaigns pp. 360-361).
 *
 * Two rolls rather than one: a Will roll to keep your head, and -- when that
 * fails -- 3d plus the margin on the Fright Check Table, which is where the
 * interesting half lives. Both are posted on one card, because the second is
 * meaningless without the first.
 *
 * The traits that bear on it are read off the sheet: Combat Reflexes and
 * Fearlessness add, Combat Paralysis and Fearfulness subtract, and Unfazeable
 * makes no check at all. The rest of the long list of modifiers on p. 360 --
 * how grisly, how close, how dark, how alone -- is the GM's call about a
 * particular horrible thing, and is typed into the one modifier field.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  FRIGHT_CHECK_CEILING,
  frightCheckResult,
  frightCheckTotal,
  frightCheckWill,
} from "../rules/fright.js";
import { resolveSuccess } from "../rules/success.js";
import { traitsOf } from "./damage.js";

const FRIGHT_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/fright.hbs`;

/** The Will a Fright Check is rolled against, and whether the Rule of 14 bit. */
export function frightTarget(
  will: number,
  modifier: number,
  traitBonus = 0,
): {
  will: number;
  modifier: number;
  traitBonus: number;
  effective: number;
  capped: boolean;
} {
  const modified = will + modifier + traitBonus;
  const effective = frightCheckWill(modified);
  return { will, modifier, traitBonus, effective, capped: effective < modified };
}

/**
 * Rolls a Fright Check for one actor and posts what happened.
 *
 * Returns the table entry when the check failed, and null when it held, so a
 * caller can act on it.
 */
export async function rollFrightCheck(options: {
  actor: any;
  modifier: number;
}): Promise<{ effect: string; total: number } | null> {
  const { actor, modifier } = options;
  const traits = traitsOf(actor);

  // "Unfazeable characters don't make Fright Checks!" -- so none is made, and
  // saying so is the whole answer.
  if (traits.unfazeable) {
    ui.notifications?.info(
      game.i18n.format("GWORLD.Fright.Unfazeable", { name: String(actor?.name ?? "") }),
    );
    return null;
  }

  const target = frightTarget(
    Number(actor?.system?.derived?.will) || 10,
    modifier,
    traits.frightCheck,
  );

  const check = new Roll("3d6");
  await check.evaluate();
  const outcome = resolveSuccess(check.total, target.effective, dieResults(check));

  // The table is only consulted on a failure, so the second roll is only made
  // on one -- rolling it always would put an unused number in the log.
  const table = outcome.success ? null : new Roll("3d6");
  if (table) await table.evaluate();

  const total = table ? frightCheckTotal(table.total, outcome.margin) : 0;
  const entry = table ? frightCheckResult(total) : null;

  const content = await foundry.applications.handlebars.renderTemplate(FRIGHT_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...target,
    ceiling: FRIGHT_CHECK_CEILING,
    dice: dieResults(check),
    roll: check.total,
    success: outcome.success,
    margin: outcome.margin,
    result: entry
      ? {
          roll: table!.total,
          margin: outcome.margin,
          total,
          effect: game.i18n.localize(`GWORLD.Fright.Effect.${entry.effect}`),
          gmDecides: entry.gmDecides === true,
        }
      : null,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: table ? [check, table] : [check],
  });

  return entry ? { effect: entry.effect, total } : null;
}

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  const dice = roll.dice?.[0]?.results ?? [];
  return dice.map((r: { result: number }) => r.result);
}
