/**
 * No Nuisance Rolls (Basic Set Revised p. 329): a perk that exempts its owner
 * from the rolls of one background task done between adventure scenes -- a
 * month at the job, a day's march -- provided every score involved is 16+.
 *
 * A procedure that rolls such a task asks here first. The perk's specialty
 * names the task; the procedure gives the words it goes by and the scores
 * the roll would be made against.
 */

import { noPerks, nuisancePerkFor, nuisanceRollsWaived } from "../rules/addendum-perks.js";

/** What a waived task reports: the perk's task, for the card to name. */
export interface NuisanceWaiver {
  task: string;
}

/**
 * The perk that waives this task's rolls, or null. `names` are the task's
 * names (a job's title and skill, "hiking"); `scores` the levels the roll
 * would be made against, every one of which must be 16 or better.
 */
export function nuisanceWaiver(actor: any, names: readonly string[], scores: ReadonlyArray<number>): NuisanceWaiver | null {
  const perks = actor?.system?.derived?.perks ?? noPerks();
  const task = nuisancePerkFor(perks, names);
  if (task === null || !nuisanceRollsWaived(scores)) return null;
  return { task };
}
