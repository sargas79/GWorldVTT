/**
 * The character sheet's controls that change only what the sheet shows.
 *
 * Foundry disables every control of a sheet its viewer can't edit, so a
 * player observing somebody else's character could not pick a row, narrow a
 * list to its advantages, or open the Journal's background. These controls
 * write nothing to the character, so the sheet keeps them live for everyone
 * who can see it.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

/** The sheet's actions that show something without changing the character. */
export const VIEW_ACTIONS = [
  "v2Select",
  "v2Chip",
  "v2Location",
  "v2GearSort",
  "v2ProgressionMode",
  "v2JournalPane",
  "v2ShowLink",
  "v2OpenLink",
  "v2ViewPortrait",
  "v2ShowMessage",
] as const;

/** Every control a read-only sheet keeps live: the view actions, list search boxes and sort selects. */
export const VIEW_CONTROLS = [
  ...VIEW_ACTIONS.map((action) => `[data-action="${action}"]`),
  "input[data-v2-filter]",
  "select[data-v2-sort]",
].join(", ");
