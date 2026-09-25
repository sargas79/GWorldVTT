import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { englishContext } from "./i18n.js";

/**
 * What modules add to the GM Screen: tables, lists and tabs of their own, the
 * places the Basic Set leaves for them, and their hit locations, maneuvers and
 * extra effort in the system's own tables. Each test loads the registries
 * fresh, since they hold what was registered.
 */

async function load() {
  vi.resetModules();
  const registry = await import("../registry.js");
  const assemble = await import("../assemble.js");
  const combat = await import("../../combat-extensions.js");
  return { ...registry, ...assemble, ...combat };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe("a module's tables and tabs", () => {
  it("fills a slot the Basic Set leaves, where the slot is, for everyone", async () => {
    const api = await load();
    const id = api.registerGmScreenTable({
      module: "test-addon",
      key: "awe",
      slot: "aweConfusion",
      title: "Awe Checks",
      cite: "Test Book p. 1",
      columns: ["Roll", "Effect"],
      rows: [
        ["4-5", "Stunned"],
        ["6+", "Awed"],
      ],
      roll: { formula: "3d6", ask: "margin", rowFor: (total) => (total <= 5 ? 0 : 1) },
    });
    expect(id).toBe("test-addon.awe");
    for (const isGM of [true, false]) {
      const checks = api
        .assembleScreen(englishContext(), { isGM })
        .find((tab) => tab.id === "checks")!;
      const ids = checks.sections.map((s) => s.id);
      expect(ids).toEqual(["frightChecks", "test-addon.awe", "fallingCollisions", "reactions"]);
      const awe = checks.sections.find((s) => s.id === "test-addon.awe")!;
      expect(awe.source).toBe("Module test-addon");
      expect(awe.roll).toEqual({ formula: "3d6", ask: "margin" });
    }
    expect(api.rollSpec("test-addon.awe")!.rowFor(9)).toBe("1");
  });

  it("puts a list after the section it names, and on a tab of the module's own", async () => {
    const api = await load();
    expect(api.registerGmScreenTab({ module: "test-addon", key: "chases", label: "Chases" })).toBe(
      "test-addon.chases",
    );
    api.registerGmScreenRuleBlock({
      module: "test-addon",
      key: "moves",
      tab: "test-addon.chases",
      title: "Chase moves",
      items: [{ term: "Sprint", text: "+2" }],
    });
    api.registerGmScreenRuleBlock({
      module: "test-addon",
      key: "stun",
      tab: "wounds",
      after: "hitLocations",
      title: "Stun more",
      items: () => [{ term: "Dazed", text: "-2" }],
      gmOnly: true,
    });
    const gm = api.assembleScreen(englishContext(), { isGM: true });
    expect(gm.at(-1)!.id).toBe("test-addon.chases");
    expect(gm.at(-1)!.sections[0]!.parts[0]!.content).toEqual({
      kind: "rules",
      items: [{ term: "Sprint", text: "+2" }],
    });
    expect(gm.find((t) => t.id === "wounds")!.sections.map((s) => s.id)).toEqual([
      "hitLocations",
      "test-addon.stun",
      "shock",
      "knockback",
      "majorWound",
      "knockdownStunning",
      "effectsOfStun",
      "cripplingInjury",
      "mortalWounds",
      "bleeding",
    ]);
    const player = api.assembleScreen(englishContext(), {
      isGM: false,
      hiddenTabs: ["test-addon.chases"],
    });
    expect(player.some((t) => t.id === "test-addon.chases")).toBe(false);
    expect(
      player.find((t) => t.id === "wounds")!.sections.some((s) => s.id === "test-addon.stun"),
    ).toBe(false);
  });

  it("refuses what it can't place, and says why", async () => {
    const api = await load();
    expect(
      api.registerGmScreenTable({
        module: "",
        key: "x",
        tab: "tables",
        title: "X",
        columns: [],
        rows: [],
      }),
    ).toBeNull();
    expect(
      api.registerGmScreenTable({
        module: "test-addon",
        key: "x",
        tab: "nowhere",
        title: "X",
        columns: [],
        rows: [],
      }),
    ).toBeNull();
    expect(
      api.registerGmScreenTable({
        module: "test-addon",
        key: "x",
        slot: "criticalHit",
        title: "X",
        columns: [],
        rows: [],
      }),
    ).toBeNull();
    expect(
      api.registerGmScreenTable({
        module: "test-addon",
        key: "x",
        tab: "tables",
        title: "",
        columns: [],
        rows: [],
      }),
    ).toBeNull();
    expect(
      api.registerGmScreenRuleBlock({
        module: "test-addon",
        key: "x",
        tab: "tables",
        title: "X",
        items: "no" as never,
      }),
    ).toBeNull();
    expect(api.registerGmScreenTab({ module: "test-addon", key: "t", label: "" })).toBeNull();
    expect(
      api.registerGmScreenTable({
        module: "test-addon",
        key: "ok",
        tab: "tables",
        title: "OK",
        columns: ["A"],
        rows: [["1"]],
      }),
    ).toBe("test-addon.ok");
    expect(
      api.registerGmScreenTable({
        module: "test-addon",
        key: "ok",
        tab: "tables",
        title: "OK",
        columns: ["A"],
        rows: [["1"]],
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(7);
  });

  it("costs a broken module its own card, not the screen", async () => {
    const api = await load();
    api.registerGmScreenTable({
      module: "test-addon",
      key: "broken",
      tab: "tables",
      title: "Broken",
      columns: ["A"],
      rows: () => {
        throw new Error("no");
      },
    });
    const tables = api
      .assembleScreen(englishContext(), { isGM: true })
      .find((t) => t.id === "tables")!;
    expect(tables.sections.some((s) => s.id === "test-addon.broken")).toBe(false);
    expect(tables.sections.some((s) => s.id === "coverDr")).toBe(true);
  });
});

describe("the modules' additions to the Basic Set's tables", () => {
  it("lists a registered hit location under its parent, with its own figures and its module", async () => {
    const api = await load();
    api.registerHitLocation({
      module: "test-addon",
      key: "jaw",
      label: "Jaw",
      parent: "face",
      penalty: -6,
      damageTypes: ["cr", "cut"],
      cripplingDivisor: 4,
      knockdown: -1,
    });
    const section = api.buildSection(api.sectionDef("hitLocations")!, englishContext())!;
    const table = section.parts[0]!.content;
    if (table.kind !== "table") throw new Error("not a table");
    const faceAt = table.rows.findIndex((r) => r.key === "face");
    const jaw = table.rows[faceAt + 1]!;
    expect(jaw.depth).toBe(1);
    expect(jaw.source).toBe("Module test-addon");
    expect(jaw.cells.slice(0, 3)).toEqual(["—", "Jaw", "-6"]);
    expect(jaw.cells.at(-3)).toBe("-6");
    expect(jaw.cells.at(-2)).toBe("> HP/4");
    expect(jaw.cells.at(-1)).toContain("cr, cut only");
  });

  it("lists registered maneuvers and extra effort in their tables", async () => {
    const api = await load();
    api.registerManeuver({
      module: "test-addon",
      key: "lunge",
      label: "Lunge",
      movement: "step",
      defense: "none",
      attacks: true,
    } as never);
    api.registerExtraEffort({
      module: "test-addon",
      key: "surge",
      label: "Surge",
      kind: "offense",
      fp: 2,
      apply: () => null,
    });
    const maneuvers = api.buildSection(api.sectionDef("maneuvers")!, englishContext())!.parts[0]!
      .content;
    const effort = api.buildSection(api.sectionDef("extraEffort")!, englishContext())!.parts[0]!
      .content;
    if (maneuvers.kind !== "table" || effort.kind !== "table") throw new Error("not tables");
    expect(maneuvers.rows.at(-1)).toMatchObject({
      source: "Module test-addon",
      cells: ["Lunge", "Step", "None", ""],
    });
    expect(effort.rows.at(-1)).toMatchObject({
      source: "Module test-addon",
      cells: ["Surge", "2 FP", "An attack option."],
    });
  });
});

describe("placing and rolling, at the edges", () => {
  it("still shows sections that name each other in a ring, and refuses one that follows itself", async () => {
    const api = await load();
    expect(
      api.registerGmScreenRuleBlock({
        module: "test-addon",
        key: "self",
        tab: "tables",
        after: "test-addon.self",
        title: "Self",
        items: [],
      }),
    ).toBeNull();
    api.registerGmScreenRuleBlock({
      module: "test-addon",
      key: "a",
      tab: "tables",
      after: "test-addon.b",
      title: "A",
      items: [],
    });
    api.registerGmScreenRuleBlock({
      module: "test-addon",
      key: "b",
      tab: "tables",
      after: "test-addon.a",
      title: "B",
      items: [],
    });
    const ids = api
      .assembleScreen(englishContext(), { isGM: true })
      .find((t) => t.id === "tables")!
      .sections.map((s) => s.id);
    expect(ids.slice(-2).sort()).toEqual(["test-addon.a", "test-addon.b"]);
  });

  it("lets a player roll only on what the screen shows them", async () => {
    vi.resetModules();
    const { mayRollOn } = await import("../roll.js");
    const globals = globalThis as Record<string, unknown>;
    const settings: Record<string, unknown> = {
      gmScreenPlayers: true,
      gmScreenHiddenTabs: ["combat"],
    };
    globals.game = {
      user: { isGM: false },
      settings: { get: (_s: string, key: string) => settings[key] },
    };
    try {
      expect(mayRollOn({ tab: "tables" })).toBe(true);
      expect(mayRollOn({ tab: "combat" })).toBe(false);
      expect(mayRollOn({ tab: "tables", gmOnly: true })).toBe(false);
      settings.gmScreenPlayers = false;
      expect(mayRollOn({ tab: "tables" })).toBe(false);
      (globals.game as any).user.isGM = true;
      expect(mayRollOn({ tab: "combat", gmOnly: true })).toBe(true);
    } finally {
      delete globals.game;
    }
  });
});
