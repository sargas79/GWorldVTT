/**
 * Rolling for what somebody thinks of you (GURPS Basic Set: Campaigns pp. 359, 494).
 *
 * Two ways to the same table. A reaction roll is the GM's, and is meant to be
 * secret -- "the GM should keep this roll secret from the players. They don't
 * know, for instance, whether that friendly-looking old farmer is giving them
 * straight advice or sending them into a trap" -- so its card is whispered.
 *
 * An Influence roll is the player's, and is a Quick Contest with a stated
 * outcome either way. That one is posted openly: everybody at the table saw
 * the attempt, whatever came of it.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  automaticInfluence,
  compareReactions,
  influenceResult,
  reactionRoll,
  type InfluenceSkill,
  type Reaction,
} from "../rules/reactions.js";
import { quickContest, resolveSuccess } from "../rules/success.js";

const REACTION_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/reaction.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/** The label for a band of the Reaction Table. */
function label(reaction: Reaction): string {
  return game.i18n.localize(`GWORLD.Reaction.${reaction}`);
}

async function post(
  actor: any,
  context: Record<string, unknown>,
  whisper: boolean,
): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(REACTION_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...context,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: (context.rolls as any[]) ?? [],
    // "The GM should keep this roll secret from the players." Whispering it to
    // the GMs is as secret as a chat log gets.
    ...(whisper
      ? { whisper: ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id) }
      : {}),
  });
}

/**
 * A reaction roll (p. 494).
 *
 * The actor is whoever is being reacted *to* -- the party's face, usually --
 * because that is whose modifiers apply and whose name belongs on the card.
 */
export async function rollReaction(options: {
  actor: any;
  modifier: number;
  best?: Reaction | null;
  worst?: Reaction | null;
  /** Shown openly instead of whispered, for a table that prefers it that way. */
  open?: boolean;
}): Promise<Reaction> {
  const roll = new Roll("3d6");
  await roll.evaluate();

  const result = reactionRoll({
    rolled: roll.total,
    modifier: options.modifier,
    ...(options.best === undefined ? {} : { best: options.best }),
    ...(options.worst === undefined ? {} : { worst: options.worst }),
  });

  await post(
    options.actor,
    {
      reaction: true,
      dice: dieResults(roll),
      rolled: result.rolled,
      modifier: result.modifier,
      total: result.total,
      band: label(result.reaction),
      bounded: result.bounded,
      rolls: [roll],
    },
    options.open !== true,
  );

  return result.reaction;
}

/**
 * An Influence roll (p. 359).
 *
 * A Quick Contest of the chosen skill against the subject's Will, with a stated
 * reaction either way -- and Diplomacy's second chance rolled here rather than
 * left to remember, since forgetting it is what makes Diplomacy look worse than
 * it is.
 */
export async function rollInfluence(options: {
  actor: any;
  subject: any;
  skill: InfluenceSkill;
  skillLevel: number;
  modifier: number;
  specious?: boolean;
  /** Reaction modifiers, which the second roll uses if Diplomacy calls for one. */
  reactionModifier?: number;
}): Promise<Reaction> {
  const will = Number(options.subject?.system?.derived?.will) || 10;

  // Some subjects settle it before the dice: Slave Mentality loses outright,
  // Unfazeable cannot be intimidated, and the Indomitable cannot be swayed.
  const settled = automaticInfluence({
    skill: options.skill,
    indomitable: options.subject?.system?.derived?.traitEffects?.indomitable === true,
    unfazeable: options.subject?.system?.derived?.traitEffects?.unfazeable === true,
    slaveMentality: options.subject?.system?.derived?.traitEffects?.slaveMentality === true,
  });

  const rolls: any[] = [];
  let won: boolean;

  if (settled === null) {
    const mine = new Roll("3d6");
    const theirs = new Roll("3d6");
    await mine.evaluate();
    await theirs.evaluate();
    rolls.push(mine, theirs);

    const contest = quickContest(
      resolveSuccess(mine.total, options.skillLevel + options.modifier, dieResults(mine)),
      resolveSuccess(theirs.total, will, dieResults(theirs)),
    );
    won = contest.outcome === "first";
  } else {
    won = settled;
  }

  const result = influenceResult({
    skill: options.skill,
    won,
    ...(options.specious === undefined ? {} : { specious: options.specious }),
  });

  // "If you used Diplomacy, the GM will also make a regular reaction roll and
  // use the better of the two reactions."
  let fallback: Reaction | null = null;
  if (result.rollsAnyway) {
    const second = new Roll("3d6");
    await second.evaluate();
    rolls.push(second);
    fallback = reactionRoll({
      rolled: second.total,
      modifier: options.reactionModifier ?? 0,
    }).reaction;
  }

  const better =
    fallback && compareReactions(fallback, result.reaction) > 0 ? fallback : result.reaction;

  await post(
    options.actor,
    {
      influence: true,
      skill: String(options.skill),
      subject: String(options.subject?.name ?? ""),
      target: options.skillLevel + options.modifier,
      will,
      settled: settled !== null,
      won,
      band: label(better),
      diplomacy: result.rollsAnyway,
      fallbackBand: fallback ? label(fallback) : "",
      usedFallback: better === fallback && fallback !== result.reaction,
      dice: rolls[0] ? dieResults(rolls[0]) : null,
      roll: rolls[0]?.total ?? null,
      rolls,
    },
    false,
  );

  return better;
}
