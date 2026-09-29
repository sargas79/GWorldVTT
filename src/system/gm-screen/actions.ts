/**
 * What the buttons on a GM Screen card do, by section and button id: the
 * card's own list of actions (`GmSectionDef.actions`) names them, and the
 * window calls `runSectionAction` when one is clicked. Only the GM may.
 */

import { endScene, promptBad, rollUnstattedNpc } from "../task-rules.js";

const HANDLERS: Readonly<Record<string, () => Promise<unknown>>> = {
  "abstractDifficulty.set": promptBad,
  "abstractDifficulty.rollNpc": rollUnstattedNpc,
  "abstractDifficulty.endScene": () => endScene(),
};

/** Runs the handler a card button names. Resolves to whether there was one, and the user could run it. */
export async function runSectionAction(section: string, action: string): Promise<boolean> {
  const handler = HANDLERS[`${section}.${action}`];
  if (!handler || (game as any).user?.isGM !== true) return false;
  await handler();
  return true;
}

/** The ids of the actions a section has handlers for. */
export function sectionActionIds(section: string): string[] {
  return Object.keys(HANDLERS)
    .filter((key) => key.startsWith(`${section}.`))
    .map((key) => key.slice(section.length + 1));
}
