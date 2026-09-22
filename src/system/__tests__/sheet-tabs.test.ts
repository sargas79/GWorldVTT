import { describe, expect, it } from "vitest";

import { FOLDED_TABS, SHEET_TAB_IDS, TAB_NAMES, isTabName, partShowing, registeredTabsShownOn } from "../sheet-tabs.js";

describe("the tab names a module may register against", () => {
  it("takes every tab name and every classic one, each once", () => {
    for (const tab of [...SHEET_TAB_IDS, ...FOLDED_TABS]) expect(isTabName(tab)).toBe(true);
    expect(new Set(TAB_NAMES).size).toBe(TAB_NAMES.length);
    expect(isTabName("header")).toBe(false);
    expect(isTabName(undefined)).toBe(false);
  });
});

describe("where the sheet shows what was registered", () => {
  /** A module written for the classic sheet must lose nothing on this one. */
  it("shows every name on exactly one part of the sheet", () => {
    for (const tab of TAB_NAMES) {
      const parts = SHEET_TAB_IDS.filter((part) => registeredTabsShownOn(part).includes(tab));
      expect(parts, tab).toHaveLength(1);
    }
  });

  it("folds the classic tabs into the sheet's", () => {
    expect(partShowing("attributes")).toBe("overview");
    expect(partShowing("body")).toBe("combat");
    expect(partShowing("gear")).toBe("inventory");
    expect(partShowing("description")).toBe("journal");
    expect(partShowing("skills")).toBe("skills");
    expect(partShowing("magic")).toBe("magic");
  });

  it("lists a part's own name before the ones folded into it", () => {
    expect(registeredTabsShownOn("combat")).toEqual(["combat", "body"]);
    expect(registeredTabsShownOn("inventory")).toEqual(["gear", "inventory"]);
  });

  it("has nothing for a part that is not a tab", () => {
    expect(registeredTabsShownOn("header")).toEqual([]);
  });
});
