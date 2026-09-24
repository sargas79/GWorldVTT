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
import { afterQuickContest, procedureRoll, resolveContestScores } from "./procedure-extensions.js";
import { postRefusal, successRollMessageMode } from "./roll.js";

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
  /**
   * The item the side rolls with, where there is one (since 1.136.0): on a
   * disarm, the attacker's weapon and the foe's weapon struck at. It reaches
   * the side's `gworld.successRollModifiers` context and the contest
   * resolvers, so a rule that turns on the weapon held can find it.
   */
  item?: any;
}

/** One side of a contest once its conditions and the modules have had their say, before any dice. */
function prepareSide(side: ContestSide, label = "", opponent: any = null, tags: readonly string[] = [], refusable = false) {
  const given = side.modifiers ?? [];
  // What the side's conditions and the modules add to its roll: since 1.30.0
  // they also see who is on the other side, and what sort of contest it is;
  // since 1.144.0 the bonuses held for it come too, and where the caller
  // will act on it a listener may refuse the side.
  const hooked = procedureRoll({ actor: side.actor, label, kind: "contest", skill: side.note ?? "", base: side.base, tags: ["contest", ...tags], modifiers: [...given], opponent, ...(side.item ? { item: side.item } : {}) }, { refusable });
  const modifiers = [...given, ...hooked.added].filter((m) => m.value !== 0);
  const effective = side.base + modifiers.reduce((sum, m) => sum + m.value, 0);
  return { side, label, effective, modifiers, refusal: hooked.refusal, spend: hooked.spend };
}

type PreparedSide = ReturnType<typeof prepareSide>;

/** Rolls one side of a contest against its own effective score. */
async function rollPrepared(prepared: PreparedSide) {
  const { side, effective, modifiers } = prepared;
  const roll = new Roll("3d6");
  await roll.evaluate();
  await prepared.spend();
  const dice = roll.dice[0]?.results.filter((r) => r.active !== false).map((r) => r.result) ?? [];
  const outcome = resolveSuccess(roll.total, effective, dice);

  return { side, roll, dice, effective, outcome, modifiers };
}

/** Rolls one side of a contest that can't be refused. */
async function rollSide(side: ContestSide, label = "", opponent: any = null, tags: readonly string[] = []) {
  return rollPrepared(prepareSide(side, label, opponent, tags));
}

type RolledSide = Awaited<ReturnType<typeof rollSide>>;

/**
 * A contest that was not rolled (since API 1.144.0): a
 * `gworld.successRollModifiers` listener refused one side's roll, and
 * `reason` is its. Only a caller that passed `returnRefusal` gets one; the
 * sides' contexts carry `refusal` only then.
 */
export interface ContestRefusal {
  refused: true;
  reason: string;
  /** The side refused. */
  side: "first" | "second";
}

/**
 * The refusal of whichever side a listener refused, first side first, told
 * as `roll.success` tells one: a warning, and a card in the contest's message
 * mode with the listener's reason. Null where both sides may roll.
 */
async function refusedContest(sides: readonly [PreparedSide, PreparedSide], visibility: ContestVisibility): Promise<ContestRefusal | null> {
  const index = sides.findIndex((s) => s.refusal !== null);
  if (index < 0) return null;
  const refused = sides[index]!;
  const reason = refused.refusal!;
  ui.notifications?.warn(reason);
  const totalModifier = refused.modifiers.reduce((sum, m) => sum + m.value, 0);
  await postRefusal({
    actor: refused.side.actor, base: refused.side.base, label: refused.label, kind: "contest",
    ...(visibility.rollMode !== undefined ? { rollMode: visibility.rollMode } : {}),
    ...(visibility.secret !== undefined ? { secret: visibility.secret } : {}),
  }, { reason, modifiers: refused.modifiers, totalModifier, effective: refused.effective });
  return { refused: true, reason, side: index === 0 ? "first" : "second" };
}

/** How each side's roll reads on the card. */
function describeSide(outcome: { success: boolean; margin: number }): string {
  return game.i18n.format(
    outcome.success ? "GWORLD.Contest.Success" : "GWORLD.Contest.Failure",
    { margin: outcome.margin },
  );
}

/** Posts the two-roll card both kinds of contest share. */
/**
 * Who sees a contest's card (since API 1.111.0): a `rollMode`, or `secret`
 * for a roll the GM makes in secret (Campaigns p. 494), read as a success
 * roll's are.
 */
export interface ContestVisibility {
  rollMode?: string;
  secret?: boolean;
}

/** What a Quick Contest is asked to roll. */
export interface QuickContestOptions extends ContestVisibility {
  label: string;
  first: ContestSide;
  second: ContestSide;
  /** What the contest is for, e.g. `disarm` (since 1.30.0): passed to the resolvers and the sides' rolls. */
  tags?: string[];
  /**
   * True to let a `gworld.successRollModifiers` listener refuse a side (since
   * API 1.144.0): the sides' contexts carry `refusal`, and a refused contest
   * rolls no dice and resolves to a {@link ContestRefusal}. Left out, no side
   * can be refused.
   */
  returnRefusal?: boolean;
}

/** What a Regular Contest is asked to roll. */
export interface RegularContestOptions extends ContestVisibility {
  label: string;
  first: ContestSide;
  second: ContestSide;
  /**
   * What the contest is for (since API 1.144.0): passed to the sides' rolls
   * beside `contest` and `regularContest`.
   */
  tags?: string[];
  /** As a Quick Contest's (since API 1.144.0). */
  returnRefusal?: boolean;
}

/** How a Regular Contest came out: the winner, or null where it went unsettled. */
export interface RegularContestResult {
  outcome: "first" | "second" | null;
  exchanges: number;
}

async function postContest(options: {
  label: string;
  /** What kind of roll this is, shown in the card's header. */
  kind: string;
  sides: RolledSide[];
  result: string;
  resultClass: string;
  /** The system's flags for the card, where it records what was rolled. */
  flags?: Record<string, unknown>;
} & ContestVisibility): Promise<string> {
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

  const messageMode = successRollMessageMode(options);
  const message = await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: options.sides.map((side) => side.roll),
    ...(options.flags ? { flags: { [SYSTEM_ID]: options.flags } } : {}),
  }, messageMode ? { messageMode } : {});
  return String((message as any)?.id ?? "");
}

/**
 * What a Quick Contest's card records of it (since API 1.143.0), under
 * `flags.gworld.quickContest`: what it was for, who won and by how much, and
 * each side's actor, item and effective score. The GM's client reads it to
 * tell a won disarm from a claimed one (see `held-weapons.ts`).
 */
export interface QuickContestRecord {
  tags: string[];
  outcome: "first" | "second" | "tie";
  marginOfVictory: number;
  first: { actorUuid: string; itemUuid: string; effective: number };
  second: { actorUuid: string; itemUuid: string; effective: number };
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
  // A module's resolver may propose what each side rolls against.
  const scores = resolveContestScores({ label: options.label, first: options.feinter, second: options.defender, tags: ["feint"] });
  const feinter = await rollSide({ ...options.feinter, ...scores.first }, "", options.defender.actor ?? null, ["feint"]);
  const defender = await rollSide({ ...options.defender, ...scores.second }, "", options.feinter.actor ?? null, ["feint"]);
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
export async function rollRegularContest(options: RegularContestOptions & { returnRefusal: true }): Promise<RegularContestResult | ContestRefusal>;
export async function rollRegularContest(options: RegularContestOptions): Promise<RegularContestResult>;
export async function rollRegularContest(options: RegularContestOptions): Promise<RegularContestResult | ContestRefusal> {
  // Each side's roll passes through `gworld.successRollModifiers` as a Quick
  // Contest's does, tagged `contest` and `regularContest`, and takes the
  // bonuses held for it (since API 1.144.0): once for the whole contest,
  // since its exchanges are one struggle, and used up by it.
  const tags = ["regularContest", ...(options.tags ?? [])];
  const refusable = options.returnRefusal === true;
  const sides = [
    prepareSide(options.first, options.label, options.second.actor ?? null, tags, refusable),
    prepareSide(options.second, options.label, options.first.actor ?? null, tags, refusable),
  ] as const;
  const refused = await refusedContest(sides, options);
  if (refused) return refused;
  const [firstSide, secondSide] = sides;

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
    first: firstSide.effective,
    second: secondSide.effective,
    roll,
    maxRounds: MAX_EXCHANGES,
  });
  await firstSide.spend();
  await secondSide.spend();

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
    given: [firstSide.effective, secondSide.effective],
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

  // A contest the GM rolls in secret, or one a module whispers (since API 1.111.0).
  const messageMode = successRollMessageMode(options);
  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  }, messageMode ? { messageMode } : {});

  return { outcome: contest.outcome, exchanges: contest.rounds.length };
}

export async function rollQuickContest(options: QuickContestOptions & { returnRefusal: true }): Promise<(ReturnType<typeof quickContest> & { messageId: string }) | ContestRefusal>;
export async function rollQuickContest(options: QuickContestOptions): Promise<ReturnType<typeof quickContest> & { messageId: string }>;
export async function rollQuickContest(options: QuickContestOptions): Promise<(ReturnType<typeof quickContest> & { messageId: string }) | ContestRefusal> {
  const tags = ["quickContest", ...(options.tags ?? [])];
  // A module's resolver may propose what each side rolls against.
  const scores = resolveContestScores({ label: options.label, first: options.first, second: options.second, tags });
  // Both sides are heard before either rolls, so a refused side leaves no
  // dice on the table (since API 1.144.0).
  const refusable = options.returnRefusal === true;
  const sides = [
    prepareSide({ ...options.first, ...scores.first }, options.label, options.second.actor ?? null, tags, refusable),
    prepareSide({ ...options.second, ...scores.second }, options.label, options.first.actor ?? null, tags, refusable),
  ] as const;
  const refused = await refusedContest(sides, options);
  if (refused) return refused;
  const first = await rollPrepared(sides[0]);
  const second = await rollPrepared(sides[1]);
  const result = quickContest(first.outcome, second.outcome);

  const winner =
    result.outcome === "first"
      ? String(options.first.actor?.name ?? "")
      : result.outcome === "second"
        ? String(options.second.actor?.name ?? "")
        : "";

  const recordSide = (side: RolledSide) => ({
    actorUuid: String(side.side.actor?.uuid ?? ""),
    itemUuid: String(side.side.item?.uuid ?? ""),
    effective: side.effective,
  });
  const record: QuickContestRecord = {
    tags,
    outcome: result.outcome,
    marginOfVictory: result.marginOfVictory,
    first: recordSide(first),
    second: recordSide(second),
  };

  const messageId = await postContest({
    label: options.label,
    kind: game.i18n.localize("GWORLD.Contest.QuickContest"),
    flags: { quickContest: record },
    ...(options.rollMode !== undefined ? { rollMode: options.rollMode } : {}),
    ...(options.secret !== undefined ? { secret: options.secret } : {}),
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

  // And the modules hear who won (since 1.37.0).
  const report = (side: RolledSide) => ({ actor: side.side.actor ?? null, base: side.side.base, effective: side.effective, outcome: side.outcome, item: side.side.item ?? null });
  afterQuickContest({ label: options.label, tags, first: report(first), second: report(second), outcome: result.outcome, marginOfVictory: result.marginOfVictory });

  // The card it was posted on (since API 1.143.0), which a won disarm names
  // when it asks the GM's client to knock the weapon away.
  return { ...result, messageId };
}
