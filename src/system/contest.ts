/**
 * Rolling a Quick Contest between two characters and reporting it.
 *
 * The rules for one have been in `src/rules/success.ts` all along; what was
 * missing was a way to actually run one, which needs two rolls and one card
 * rather than two cards and a comparison done in someone's head.
 *
 * Both sides are rolled here rather than each being asked in turn. A contest is
 * over in a second -- two people lunging for the same gun -- so there is no
 * moment between the rolls in which anyone decides anything, and asking twice
 * would only add clicks.
 */

import { SYSTEM_ID } from "./constants.js";
import { quickContest, resolveSuccess } from "../rules/success.js";

const CONTEST_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/contest.hbs`;

/** One competitor. */
export interface ContestSide {
  actor: any;
  /** The score being rolled against, before modifiers. */
  base: number;
  modifiers?: Array<{ label: string; value: number }>;
}

/**
 * Rolls both sides and posts the result.
 *
 * Returns which side won, so a caller can act on it -- an evade that succeeds
 * lets the mover past, and one that fails does not.
 */
export async function rollQuickContest(options: {
  label: string;
  first: ContestSide;
  second: ContestSide;
}): Promise<ReturnType<typeof quickContest>> {
  const rollSide = async (side: ContestSide) => {
    const modifiers = (side.modifiers ?? []).filter((m) => m.value !== 0);
    const effective = side.base + modifiers.reduce((sum, m) => sum + m.value, 0);

    const roll = new Roll("3d6");
    await roll.evaluate();
    const dice = roll.dice[0]?.results.filter((r) => r.active !== false).map((r) => r.result) ?? [];
    const outcome = resolveSuccess(roll.total, effective, dice);

    return { side, roll, dice, effective, outcome, modifiers };
  };

  const first = await rollSide(options.first);
  const second = await rollSide(options.second);
  const result = quickContest(first.outcome, second.outcome);

  const describe = (outcome: { success: boolean; margin: number }) =>
    game.i18n.format(outcome.success ? "GWORLD.Contest.Success" : "GWORLD.Contest.Failure", {
      margin: outcome.margin,
    });

  const winner =
    result.outcome === "first"
      ? String(options.first.actor?.name ?? "")
      : result.outcome === "second"
        ? String(options.second.actor?.name ?? "")
        : "";

  const content = await foundry.applications.handlebars.renderTemplate(CONTEST_TEMPLATE, {
    label: options.label,
    sides: [first, second].map((side) => ({
      name: String(side.side.actor?.name ?? ""),
      effective: side.effective,
      roll: side.roll.total,
      dice: side.dice,
      modifiers: side.modifiers,
      outcome: describe(side.outcome),
    })),
    result:
      result.outcome === "tie"
        ? game.i18n.localize("GWORLD.Contest.Tie")
        : game.i18n.format("GWORLD.Contest.Wins", {
            winner,
            margin: result.marginOfVictory,
          }),
    resultClass: result.outcome === "tie" ? "" : "success",
  });

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [first.roll, second.roll],
  });

  return result;
}
