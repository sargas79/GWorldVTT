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
import { regularContest } from "../rules/contests.js";
import { resolveFeint, type FeintResult } from "../rules/maneuvers.js";
import { quickContest, resolveSuccess } from "../rules/success.js";

const CONTEST_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/contest.hbs`;
const REGULAR_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/regular-contest.hbs`;

/**
 * How many exchanges a Regular Contest is rolled out for before it is handed
 * back to the GM.
 *
 * The rule has no limit -- "eventually, one character succeeds when the other
 * fails" -- and with balanced scores it usually takes a handful. A contest that
 * has gone twenty exchanges is one the GM should be narrating.
 */
const MAX_EXCHANGES = 20;

/** One competitor. */
export interface ContestSide {
  actor: any;
  /** The score being rolled against, before modifiers. */
  base: number;
  modifiers?: Array<{ label: string; value: number }>;
  /**
   * What that score is -- "Broadsword", "DX". Shown beside the target number
   * where the rule lets a side pick from several things, so the card says
   * which one was picked.
   */
  note?: string;
}

/** Rolls one side of a contest against its own effective score. */
async function rollSide(side: ContestSide) {
  const modifiers = (side.modifiers ?? []).filter((m) => m.value !== 0);
  const effective = side.base + modifiers.reduce((sum, m) => sum + m.value, 0);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = roll.dice[0]?.results.filter((r) => r.active !== false).map((r) => r.result) ?? [];
  const outcome = resolveSuccess(roll.total, effective, dice);

  return { side, roll, dice, effective, outcome, modifiers };
}

type RolledSide = Awaited<ReturnType<typeof rollSide>>;

/** How each side's roll reads on the card. */
function describeSide(outcome: { success: boolean; margin: number }): string {
  return game.i18n.format(
    outcome.success ? "GWORLD.Contest.Success" : "GWORLD.Contest.Failure",
    { margin: outcome.margin },
  );
}

/** Posts the two-roll card both kinds of contest share. */
async function postContest(options: {
  label: string;
  /** What kind of roll this is, shown in the card's header. */
  kind: string;
  sides: RolledSide[];
  result: string;
  resultClass: string;
}): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(CONTEST_TEMPLATE, {
    label: options.label,
    kind: options.kind,
    sides: options.sides.map((side) => ({
      name: String(side.side.actor?.name ?? ""),
      note: side.side.note ?? "",
      effective: side.effective,
      roll: side.roll.total,
      dice: side.dice,
      modifiers: side.modifiers,
      outcome: describeSide(side.outcome),
    })),
    result: options.result,
    resultClass: options.resultClass,
  });

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: options.sides.map((side) => side.roll),
  });
}

/**
 * Rolls a Feint and reports what it bought (GURPS Basic Set: Campaigns p. 365).
 *
 * Not a Quick Contest, though it looks like one: a feinter who fails their own
 * roll gains nothing however badly the foe rolls, and when the foe fails, the
 * penalty is the feinter's own margin rather than the two added together.
 * `resolveFeint` is where that lives; this only rolls and says so.
 */
export async function rollFeint(options: {
  label: string;
  feinter: ContestSide;
  defender: ContestSide;
}): Promise<FeintResult> {
  const feinter = await rollSide(options.feinter);
  const defender = await rollSide(options.defender);
  const result = resolveFeint(feinter.outcome, defender.outcome);

  await postContest({
    label: options.label,
    kind: game.i18n.localize("GWORLD.Feint.Action"),
    sides: [feinter, defender],
    result: result.success
      ? game.i18n.format("GWORLD.Feint.Landed", {
          foe: String(options.defender.actor?.name ?? ""),
          penalty: result.defensePenalty,
        })
      : game.i18n.localize("GWORLD.Feint.Failed"),
    resultClass: result.success ? "success" : "",
  });

  return result;
}

/**
 * Rolls both sides and posts the result.
 *
 * Returns which side won, so a caller can act on it -- an evade that succeeds
 * lets the mover past, and one that fails does not.
 */
/**
 * Rolls a Regular Contest and posts every exchange (Campaigns p. 349).
 *
 * Both sides roll again and again; nothing is settled while both succeed or
 * both fail. The scores are balanced first, because two contestants at 5 spend
 * a dozen exchanges failing together and two at 17 spend a dozen succeeding
 * together, and the book moves both to where the dice can decide.
 *
 * Every roll goes to chat, so the exchanges can be seen rather than summarised:
 * an arm-wrestling match that went nine rounds is worth watching.
 */
export async function rollRegularContest(options: {
  label: string;
  first: ContestSide;
  second: ContestSide;
}): Promise<{ outcome: "first" | "second" | null; exchanges: number }> {
  const scoreOf = (side: ContestSide) =>
    side.base + (side.modifiers ?? []).reduce((sum, m) => sum + m.value, 0);

  // Every 3d the contest asks for is a real Foundry roll, kept so the whole
  // exchange can go on the message rather than only its totals.
  const rolls: any[] = [];
  const roll = async () => {
    const made = new Roll("3d6");
    await made.evaluate();
    rolls.push(made);
    return made.total;
  };

  const contest = await regularContest({
    first: scoreOf(options.first),
    second: scoreOf(options.second),
    roll,
    maxRounds: MAX_EXCHANGES,
  });

  const names = [
    String(options.first.actor?.name ?? ""),
    String(options.second.actor?.name ?? ""),
  ];

  const content = await foundry.applications.handlebars.renderTemplate(REGULAR_TEMPLATE, {
    label: options.label,
    kind: game.i18n.localize("GWORLD.Contest.Regular"),
    names,
    scores: contest.scores,
    // What each side rolled at, and what they would have rolled at, so a player
    // can watch the balancing rule happen rather than wonder at the number.
    given: [scoreOf(options.first), scoreOf(options.second)],
    rounds: contest.rounds.map((round, index) => ({
      number: index + 1,
      first: { roll: round.first.roll, success: round.first.success },
      second: { roll: round.second.roll, success: round.second.success },
      settled: round.outcome !== null,
    })),
    result:
      contest.outcome === null
        ? game.i18n.format("GWORLD.Contest.Unsettled", { exchanges: contest.rounds.length })
        : game.i18n.format("GWORLD.Contest.WonAfter", {
            winner: contest.outcome === "first" ? names[0] : names[1],
            exchanges: contest.rounds.length,
          }),
    resultClass: contest.outcome === null ? "" : "success",
  });

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });

  return { outcome: contest.outcome, exchanges: contest.rounds.length };
}

export async function rollQuickContest(options: {
  label: string;
  first: ContestSide;
  second: ContestSide;
}): Promise<ReturnType<typeof quickContest>> {
  const first = await rollSide(options.first);
  const second = await rollSide(options.second);
  const result = quickContest(first.outcome, second.outcome);

  const winner =
    result.outcome === "first"
      ? String(options.first.actor?.name ?? "")
      : result.outcome === "second"
        ? String(options.second.actor?.name ?? "")
        : "";

  await postContest({
    label: options.label,
    kind: game.i18n.localize("GWORLD.Contest.QuickContest"),
    sides: [first, second],
    result:
      result.outcome === "tie"
        ? game.i18n.localize("GWORLD.Contest.Tie")
        : game.i18n.format("GWORLD.Contest.Wins", {
            winner,
            margin: result.marginOfVictory,
          }),
    resultClass: result.outcome === "tie" ? "" : "success",
  });

  return result;
}
