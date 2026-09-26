import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { VIEW_ACTIONS, VIEW_CONTROLS } from "../sheet-v2/view-controls.js";

/*
 * The controls an observer keeps on a character sheet they can't edit
 * (GWorldVTT #859): each is a real action of the sheet, used by its
 * templates, and none of them writes to the character.
 */

const DIR = join(process.cwd(), "templates", "actor", "v2");
const templates = readdirSync(DIR)
  .filter((f) => f.endsWith(".hbs"))
  .map((f) => readFileSync(join(DIR, f), "utf8"))
  .join("\n");
const sheet = readFileSync(join(process.cwd(), "src", "system", "sheets", "character-sheet-v2.ts"), "utf8");

/** The body of the static handler an action is registered with. */
function handlerOf(action: string): string {
  const name = sheet.match(new RegExp(`\\b${action}: GWorldCharacterSheetV2\\.#(\\w+)`))?.[1];
  if (!name) return "";
  const start = sheet.search(new RegExp(`static (async )?#${name}\\(`));
  if (start < 0) return "";
  const next = sheet.indexOf("\n  static ", start + 1);
  return sheet.slice(start, next < 0 ? undefined : next);
}

describe("the sheet's view-only controls", () => {
  it.each(VIEW_ACTIONS)("%s is an action of the sheet used by its templates", (action) => {
    expect(handlerOf(action)).not.toBe("");
    expect(templates).toContain(`data-action="${action}"`);
  });

  it.each(VIEW_ACTIONS)("%s changes nothing on the character", (action) => {
    expect(handlerOf(action)).not.toMatch(/\.update\(|\.delete\(|\.create\(|isEditable/);
  });

  it("keeps the Traits chips, the Journal panes and the list search boxes live", () => {
    expect(VIEW_CONTROLS).toContain('[data-action="v2Chip"]');
    expect(VIEW_CONTROLS).toContain('[data-action="v2JournalPane"]');
    expect(VIEW_CONTROLS).toContain("input[data-v2-filter]");
    expect(VIEW_CONTROLS).toContain("select[data-v2-sort]");
  });

  it("does not keep a control that edits the character", () => {
    for (const action of ["deleteItem", "stepLevels", "v2RemoveLink", "v2CreateEntry", "v2EditPortrait", "v2Upgrade"]) {
      expect(VIEW_CONTROLS).not.toContain(`"${action}"`);
    }
  });
});
