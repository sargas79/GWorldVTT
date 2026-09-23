/**
 * A drop on an actor sheet that fails says why.
 *
 * Foundry's drag-and-drop calls a sheet's drop handler without waiting on it,
 * so an error thrown while the dropped document is read -- a compendium record
 * the data model refuses, say -- ends as an unhandled rejection in the console
 * and the player sees nothing happen at all. Creating the document reports its
 * own validation errors; reading the one that was dropped does not.
 */

/**
 * The reason in a validation error, without the document class, its id and
 * the per-field repeats Foundry puts around it.
 */
export function refusalReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const first = message.split("\n")[0] ?? "";
  const reason = first.includes("validation errors:")
    ? first.slice(first.indexOf("validation errors:") + "validation errors:".length)
    : first.split("] ").pop() ?? first;
  return reason.trim() || message.trim();
}

/** The name of what was dropped, when it can be found without loading it. */
function droppedName(event: DragEvent): string | null {
  try {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (typeof data.uuid !== "string") return null;
    const name = fromUuidSync(data.uuid, { strict: false })?.name;
    return typeof name === "string" && name ? name : null;
  } catch {
    return null;
  }
}

/** Run a sheet's drop, and turn a failure into a notification. */
export async function reportRefusedDrop<T>(event: DragEvent, drop: () => Promise<T>): Promise<T | null> {
  try {
    return await drop();
  } catch (error) {
    console.error(error);
    const reason = refusalReason(error);
    const name = droppedName(event);
    ui.notifications?.error(
      name
        ? game.i18n.format("GWORLD.Item.DropRefusedNamed", { name, reason })
        : game.i18n.format("GWORLD.Item.DropRefused", { reason }),
    );
    return null;
  }
}
