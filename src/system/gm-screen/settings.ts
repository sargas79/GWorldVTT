/** The GM Screen's settings: who may open it, what players see, and what each user left it showing. */

import { SYSTEM_ID } from "../constants.js";

/** World: players may open the screen, read-only. */
export const GM_SCREEN_PLAYERS = "gmScreenPlayers";
/** World: the tabs players don't see. */
export const GM_SCREEN_HIDDEN_TABS = "gmScreenHiddenTabs";
/** Client: the tab the screen was last left on. */
export const GM_SCREEN_TAB = "gmScreenTab";
/** Client: the sections this user folded. */
export const GM_SCREEN_COLLAPSED = "gmScreenCollapsed";

function read<T>(key: string, fallback: T): T {
  try {
    const value = (game as any).settings?.get(SYSTEM_ID, key);
    return value === undefined || value === null ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

export function playersMayOpen(): boolean {
  return read<unknown>(GM_SCREEN_PLAYERS, true) !== false;
}

export function hiddenTabs(): string[] {
  const value = read<unknown>(GM_SCREEN_HIDDEN_TABS, []);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export function lastTab(): string {
  return String(read(GM_SCREEN_TAB, "criticals") || "criticals");
}

export function collapsedSections(): Record<string, boolean> {
  const value = read<unknown>(GM_SCREEN_COLLAPSED, {});
  return value && typeof value === "object" ? { ...(value as Record<string, boolean>) } : {};
}

/** Whether this user may open the screen at all. */
export function mayOpen(): boolean {
  return (game as any).user?.isGM === true || playersMayOpen();
}

/** Saves a client setting, quietly: a preference that fails to save is not worth an error. */
export async function remember(key: string, value: unknown): Promise<void> {
  try {
    await (game as any).settings.set(SYSTEM_ID, key, value);
  } catch (error) {
    console.warn(`gworld | GM Screen could not save ${key}`, error);
  }
}
