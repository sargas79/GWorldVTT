/**
 * What people make of a character before anybody rolls (GURPS Basic Set:
 * Characters pp. 21-29, 41; Campaigns p. 494).
 *
 * The sheet already holds every reaction modifier a character has: Appearance,
 * Charisma, a Reputation, Status, an Odious Personal Habit. The Journal tab's
 * profile lists them beside the face they belong to, so a player can answer
 * "what do people make of me?" without opening the roll dialog.
 *
 * The modifiers that always apply are added up; the conditional ones are
 * listed rather than added, because only the table knows who is in the room.
 *
 * Kept apart from the sheet so it can be tested without Foundry: the labels
 * stay keys, and the template localizes them.
 */

import { unconditionalReaction, type ReactionSource } from "../../rules/social.js";

export interface ReactionProfile {
  /** The modifier everyone applies, as the roll dialog fills it in. */
  total: number;
  always: Array<{ label: string; value: number }>;
  /** Each with the condition key naming who applies it, for GWORLD.Reaction.When. */
  conditional: Array<{ label: string; value: number; condition: string }>;
}

export function reactionProfile(sources: readonly ReactionSource[]): ReactionProfile {
  return {
    total: unconditionalReaction(sources),
    always: sources
      .filter((source) => source.condition === "")
      .map((source) => ({ label: source.label, value: source.value })),
    conditional: sources
      .filter((source) => source.condition !== "")
      .map((source) => ({ label: source.label, value: source.value, condition: source.condition })),
  };
}
