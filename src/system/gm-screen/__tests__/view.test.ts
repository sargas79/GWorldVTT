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
      last: new Map([["hitLocations", { row: "skull", total: 4 }]]),
    }) as any;
    expect(view.activeLabel).toBe("Wounds");
    expect(view.activePosition).toBe("2 of 8");
    const wounds = view.tabs.find((t: any) => t.id === "wounds");
    expect(wounds.active).toBe(true);
    expect(wounds.sections.find((s: any) => s.id === "shock").collapsed).toBe(true);
    const locations = wounds.sections.find((s: any) => s.id === "hitLocations");
    expect(locations).toMatchObject({ last: 4, diceLabel: "3d" });
    const fright = view.tabs
      .find((t: any) => t.id === "checks")
      .sections.find((s: any) => s.id === "frightChecks");
    expect(fright.diceLabel).toBe("3d + MoF");
    const slot = view.tabs
      .find((t: any) => t.id === "checks")
      .sections.find((s: any) => s.id === "aweConfusion");
    expect(slot.slotText).toContain("Awe and Confusion");
  });
});
