/**
 * The GM Screen as the add-on API offers it (since 1.156.0): opening it,
 * rolling on its tables, and adding a module's own tables, lists and tabs.
 *
 * The window registers how it opens at init, so the API doesn't load the
 * window's code to describe itself.
 */

import {
  registerGmScreenRuleBlock,
  registerGmScreenTab,
  registerGmScreenTable,
} from "./registry.js";
import { rollOnSection } from "./roll.js";

export interface GmScreenFocus {
  tab?: string;
  section?: string;
}

let opener: ((focus: GmScreenFocus) => Promise<unknown>) | null = null;

/** Called by the window at init: how the screen is opened. */
export function setGmScreenOpener(open: (focus: GmScreenFocus) => Promise<unknown>): void {
  opener = open;
}

/** Opens the screen, at a tab, or at a section on it. Resolves to whether it opened. */
async function open(where?: string | GmScreenFocus): Promise<boolean> {
  if (!opener) return false;
  const focus = typeof where === "string" ? { tab: where } : (where ?? {});
  return Boolean(await opener(focus));
}

export const gmScreenApi = Object.freeze({
  open,
  roll: rollOnSection,
  registerTable: registerGmScreenTable,
  registerRuleBlock: registerGmScreenRuleBlock,
  registerTab: registerGmScreenTab,
});
