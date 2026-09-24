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
import { procedureRoll, reactionModifiers } from "./procedure-extensions.js";

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

/** The label and sign of a line, as the card lists it. */
function lineText(line: { label: string; value: number }): string {
  return `${line.label} ${line.value >= 0 ? "+" : "−"}${Math.abs(line.value)}`;
}

/**
 * A reaction roll (p. 494).
 *
 * The actor is whoever is being reacted *to* -- the party's face, usually --
 * because that is whose modifiers apply and whose name belongs on the card.
 * "Many factors can influence a reaction roll" (p. 559), and the ones a module
 * knows of -- gear, a status, a uniform -- come from the
 * `gworld.reactionModifiers` listeners (since API 1.76.0), told who reacts
 * where the roll knows.
 */
export async function rollReaction(options: {
  actor: any;
  modifier: number;
  best?: Reaction | null;
  worst?: Reaction | null;
  /** Shown openly instead of whispered, for a table that prefers it that way. */
  open?: boolean;
  /** Whoever is reacting, where there is somebody on the map to name (since API 1.76.0). */
  reactor?: any;
}): Promise<Reaction> {
  const lines = reactionModifiers({
    actor: options.actor,
    reactor: options.reactor ?? null,
    tags: ["reaction"],
    modifier: options.modifier,
  });
  const added = lines.reduce((sum, line) => sum + line.value, 0);

  const roll = new Roll("3d6");
  await roll.evaluate();

  const result = reactionRoll({
    rolled: roll.total,
    modifier: options.modifier + added,
    ...(options.best === undefined ? {} : { best: options.best }),
    ...(options.worst === undefined ? {} : { worst: options.worst }),
  });

  await post(
    options.actor,
    {
      reaction: true,
      dice: dieResults(roll),
      rolled: result.rolled,
      // The modifier asked for; the modules' lines are listed after it.
      modifier: options.modifier,
      lines: lines.map(lineText),
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
 *
 * Since API 1.95.0 both sides pass through `gworld.successRollModifiers` as
 * the sides of any Quick Contest do, tagged `contest`, `quickContest` and
 * `influence`, each with the other as `opponent`: the influencer's side with
 * `skill` the Influence skill, the subject's with `skill` blank and the tag
 * `will`. Their lines go into the two targets and onto the card.
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
  // "+1 per level to Influence rolls" (Characters p. 41).
  const charisma = Number(options.actor?.system?.derived?.charismaInfluence) || 0;
  const given = options.skillLevel + options.modifier + charisma;
  // What the sides' conditions and the modules add: an interpreter's earpiece,
  // a drug that saps the will (since API 1.95.0).
  const contestLabel = game.i18n.localize("GWORLD.Reaction.Influence");
  const tags = ["contest", "quickContest", "influence"];
  // Each side's held bonuses count too, used up once the dice are rolled (since API 1.144.0).
  const mySide = procedureRoll({
    actor: options.actor, label: contestLabel, kind: "contest", skill: String(options.skill), base: given,
    tags: [...tags], modifiers: [], opponent: options.subject ?? null,
  });
  const theirSide = procedureRoll({
    actor: options.subject, label: contestLabel, kind: "contest", skill: "", base: will,
    tags: [...tags, "will"], modifiers: [], opponent: options.actor ?? null,
  });
  const mine = mySide.added.filter((line) => line.value !== 0);
  const theirs = theirSide.added.filter((line) => line.value !== 0);
  const skill = given + mine.reduce((sum, line) => sum + line.value, 0);
  const resisted = will + theirs.reduce((sum, line) => sum + line.value, 0);

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
    const ours = new Roll("3d6");
    const against = new Roll("3d6");
    await ours.evaluate();
    await against.evaluate();
    rolls.push(ours, against);
    await mySide.spend();
    await theirSide.spend();

    const contest = quickContest(
      resolveSuccess(ours.total, skill, dieResults(ours)),
      resolveSuccess(against.total, resisted, dieResults(against)),
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
    // The modules' reaction modifiers count on this roll as on any other (API 1.76.0).
    const added = reactionModifiers({
      actor: options.actor,
      reactor: options.subject ?? null,
      tags: ["reaction", "influence", "diplomacy"],
      modifier: options.reactionModifier ?? 0,
    }).reduce((sum, line) => sum + line.value, 0);
    const second = new Roll("3d6");
    await second.evaluate();
    rolls.push(second);
    fallback = reactionRoll({
      rolled: second.total,
      modifier: (options.reactionModifier ?? 0) + added,
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
      target: skill,
      will: resisted,
      // The listeners' lines on each side (since API 1.95.0).
      lines: mine.map(lineText),
      willLines: theirs.map(lineText),
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
