import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assembleScreen } from "../assemble.js";
import { screenView, tableView } from "../view.js";
import { englishContext } from "./i18n.js";

describe("the screen as the template draws it", () => {
  it("pins a wide table's first columns and puts a module's badge beside the name", () => {
    const view = tableView({
      kind: "table",
      columns: ["Roll", "Location", "To hit"],
      rows: [{ cells: ["—", "Jaw", "-6"], depth: 1, source: "Deep Anatomy" }],
      pinned: 2,
      centered: [2],
      groups: [
        { label: "", span: 2 },
        { label: "To hit", span: 1 },
      ],
    });
    expect(view.scrolls).toBe(true);
    expect(view.head.map((h) => h.cls)).toEqual(["gs-pin gs-pin-0", "gs-pin gs-pin-1", "gs-c"]);
    expect(view.groups![0]!.cls).toBe("gs-pin gs-pin-group");
    const cells = view.body[0]!.cells;
    expect(cells[1]).toMatchObject({ badge: "Deep Anatomy", sub: true });
    expect(cells[0]!.badge).toBeNull();
    expect(view.body[0]!.search).toBe("— jaw -6");
  });

  it("marks the tab showing, what is folded and the last roll", () => {
    const context = englishContext();
    const tabs = assembleScreen(context, { isGM: true });
    const view = screenView(tabs, {
      t: context.t,
      active: "wounds",
      readOnly: false,
      query: "",
      collapsed: { shock: true },
      last: new Map([
        ["hitLocations", { row: "skull", total: 4 }],
        ["reactions", { row: "disastrous", total: 0 }],
      ]),
    }) as any;
    expect(view.activeLabel).toBe("Wounds");
    expect(view.activePosition).toBe("3 of 9");
    const wounds = view.tabs.find((t: any) => t.id === "wounds");
    expect(wounds.active).toBe(true);
    expect(wounds.sections.find((s: any) => s.id === "shock").collapsed).toBe(true);
    const locations = wounds.sections.find((s: any) => s.id === "hitLocations");
    expect(locations).toMatchObject({ last: 4, diceLabel: "3d" });
    const fright = view.tabs
      .find((t: any) => t.id === "checks")
      .sections.find((s: any) => s.id === "frightChecks");
    expect(fright.diceLabel).toBe("3d + MoF");
    // A Disastrous reaction of 0 is still a roll to show.
    const reactions = view.tabs
      .find((t: any) => t.id === "checks")
      .sections.find((s: any) => s.id === "reactions");
    expect(reactions).toMatchObject({ last: 0, hasLast: true });
    const slot = view.tabs
      .find((t: any) => t.id === "checks")
      .sections.find((s: any) => s.id === "aweConfusion");
    expect(slot.slotText).toContain("Awe and Confusion");
  });
});

describe("the window's buttons", () => {
  it("never use an action ApplicationV2 keeps for itself", () => {
    // ApplicationV2 handles data-action="tab" (and close, minimize,
    // toggleControls) itself, so a button of the screen's own with one of
    // those names does nothing: the tab strip once did exactly that.
    const template = readFileSync(
      resolve(import.meta.dirname, "../../../../templates/apps/gm-screen.hbs"),
      "utf8",
    );
    const actions = [...template.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
    expect(actions).toContain("showTab");
    for (const reserved of ["tab", "close", "minimize", "toggleControls"])
      expect(actions).not.toContain(reserved);
  });

  it("puts the critical tables on a tab of their own, first", () => {
    const context = englishContext();
    const tabs = assembleScreen(context, { isGM: true });
    expect(tabs.map((t) => t.id).slice(0, 2)).toEqual(["criticals", "tables"]);
    expect(tabs[0]!.sections.map((s) => s.id)).toEqual([
      "criticalHit",
      "criticalHeadBlow",
      "criticalMiss",
      "unarmedCriticalMiss",
    ]);
    expect(tabs[1]!.sections.map((s) => s.id)).toEqual([
      "attributeSkillLevels",
      "thrownDamage",
      "throwingDistance",
      "coverDr",
    ]);
  });
});

describe("the generic roll", () => {
  it("is a 3d6 button in the bar, for the GM only", () => {
    const template = readFileSync(
      resolve(import.meta.dirname, "../../../../templates/apps/gm-screen.hbs"),
      "utf8",
    );
    const bar = template.slice(
      template.indexOf('<div class="gs-bar">'),
      template.indexOf('<div class="gs-body">'),
    );
    expect(bar).toMatch(
      /\{\{#if isGM\}\}\s*<div class="gs-generic">[\s\S]*data-action="rollGeneric"[\s\S]*\{\{\/if\}\}/,
    );
  });
});
