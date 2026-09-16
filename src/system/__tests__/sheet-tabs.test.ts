import { describe, expect, it } from "vitest";

import { CLASSIC_TABS, NEW_SHEET_TABS, TAB_NAMES, isTabName, partShowing, registeredTabsShownOn } from "../sheet-tabs.js";

describe("the tab names a module may register against", () => {
  it("takes every classic tab name and every new one, each once", () => {
    for (const tab of [...CLASSIC_TABS, ...NEW_SHEET_TABS]) expect(isTabName(tab)).toBe(true);
    expect(new Set(TAB_NAMES).size).toBe(TAB_NAMES.length);
    expect(isTabName("header")).toBe(false);
    expect(isTabName(undefined)).toBe(false);
  });
});

describe("where each sheet shows what was registered", () => {
  /** A module written for the classic sheet must lose nothing on the new one. */
  it("shows every name on exactly one part of the new sheet", () => {
    for (const tab of TAB_NAMES) {
      const parts = NEW_SHEET_TABS.filter((part) => registeredTabsShownOn("new", part).includes(tab));
      expect(parts, tab).toHaveLength(1);
    }
  });

  it("shows every name on exactly one part of the classic sheet", () => {
    for (const tab of TAB_NAMES) {
      const parts = CLASSIC_TABS.filter((part) => registeredTabsShownOn("classic", part).includes(tab));
      expect(parts, tab).toHaveLength(1);
    }
  });

  it("folds the classic tabs into the new sheet's", () => {
    expect(partShowing("new", "attributes")).toBe("overview");
    expect(partShowing("new", "body")).toBe("combat");
    expect(partShowing("new", "gear")).toBe("inventory");
    expect(partShowing("new", "description")).toBe("journal");
    expect(partShowing("new", "skills")).toBe("skills");
    expect(partShowing("new", "magic")).toBe("magic");
  });

  it("puts the new sheet's names somewhere on the classic sheet", () => {
    expect(partShowing("classic", "inventory")).toBe("gear");
    expect(partShowing("classic", "journal")).toBe("description");
    expect(partShowing("classic", "overview")).toBe("attributes");
    expect(partShowing("classic", "progression")).toBe("attributes");
  });

  it("lists a part's own name before the ones folded into it", () => {
    expect(registeredTabsShownOn("new", "combat")).toEqual(["combat", "body"]);
    expect(registeredTabsShownOn("classic", "gear")).toEqual(["gear", "inventory"]);
  });

  it("has nothing for a part that is not a tab", () => {
    expect(registeredTabsShownOn("new", "header")).toEqual([]);
  });
});
