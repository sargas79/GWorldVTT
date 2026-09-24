import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OPTIONAL_RULES_KEY } from "../optional-rules.js";

/**
 * The rules page read-only for players (sargas79/GWorldVTT#794): a switch
 * such as Modifying Dice + Adds changes the figures on a player's sheet, so
 * the player can see which rules are on, but only the GM can change them.
 */

const globals = globalThis as Record<string, unknown>;

/** Just enough of ApplicationV2 for the page's own logic: its options and its render. */
class FakeApplication {
  static DEFAULT_OPTIONS: Record<string, unknown> = {};
  options: Record<string, unknown>;
  rendered = false;
  renders = 0;
  closed = false;
  fronted = false;
  constructor(options: Record<string, unknown> = {}) {
    this.options = { ...(this.constructor as any).DEFAULT_OPTIONS, ...options };
  }
  async render() {
    this.rendered = true;
    this.renders += 1;
    return this;
  }
  async close() {
    this.closed = true;
  }
  bringToFront() {
    this.fronted = true;
  }
}

const instances = new Map<string, unknown>();
globals.foundry = {
  applications: {
    api: { ApplicationV2: FakeApplication, HandlebarsApplicationMixin: (base: unknown) => base },
    instances,
  },
};

let RulesSettings: any;
beforeAll(async () => {
  ({ RulesSettings } = await import("../apps/rules-settings.js"));
});

/** A world with Modifying Dice + Adds on, seen by a GM or a player; every write kept. */
function worldAs(isGM: boolean) {
  const writes: Array<[string, unknown]> = [];
  globals.game = {
    user: { isGM },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    packs: [],
    modules: new Map(),
    settings: {
      get: (_system: string, key: string) => (key === OPTIONAL_RULES_KEY ? { modifyingDiceAdds: true } : undefined),
      set: async (_system: string, key: string, value: unknown) => {
        writes.push([key, value]);
        return value;
      },
    },
  };
  globals.ui = { notifications: { info: vi.fn(), warn: vi.fn() }, windows: {} };
  return { writes };
}

afterEach(() => {
  delete globals.game;
  delete globals.ui;
  instances.clear();
});

/** A rule's row in the page's context. */
function ruleIn(context: any, key: string) {
  return context.groups.flatMap((group: any) => group.rules).find((rule: any) => rule.key === key);
}

describe("the rules page for a player", () => {
  it("is read-only for anyone but a GM, and editable for the GM", () => {
    worldAs(false);
    expect(new RulesSettings().readOnly).toBe(true);
    worldAs(true);
    expect(new RulesSettings().readOnly).toBe(false);
  });

  it("can be asked for read-only, or not, whoever opens it", () => {
    worldAs(true);
    expect(new RulesSettings({ readOnly: true }).readOnly).toBe(true);
    worldAs(false);
    expect(new RulesSettings({ readOnly: false }).readOnly).toBe(false);
  });

  it("shows a player the rules as they stand, opening on the rules in play", async () => {
    worldAs(false);
    const context = await new RulesSettings()._prepareContext();
    expect(context).toMatchObject({ readOnly: true, inPlayOnly: true, dirty: false });
    expect(ruleIn(context, "modifyingDiceAdds")?.enabled).toBe(true);
  });

  it("saves nothing, and changes nothing, from a player's page", async () => {
    const { writes } = worldAs(false);
    const page = new RulesSettings();
    const { save, allOn, allOff, restore } = RulesSettings.DEFAULT_OPTIONS.actions;
    for (const action of [allOff, allOn, restore]) await action.call(page);
    await save.call(page);
    expect(writes).toEqual([]);
    expect(page.closed).toBe(false);
    const context = await page._prepareContext();
    expect(context.dirty).toBe(false);
    expect(ruleIn(context, "modifyingDiceAdds")?.enabled).toBe(true);
  });

  it("still saves the GM's changes", async () => {
    const { writes } = worldAs(true);
    const page = new RulesSettings();
    const { save, allOff } = RulesSettings.DEFAULT_OPTIONS.actions;
    await allOff.call(page);
    expect((await page._prepareContext()).dirty).toBe(true);
    await save.call(page);
    expect(writes).toHaveLength(1);
    expect((writes[0]?.[1] as Record<string, boolean>).modifyingDiceAdds).toBe(false);
  });

  it("opens the page, or brings forward the one already open", async () => {
    worldAs(false);
    await RulesSettings.open();
    const page = new RulesSettings();
    instances.set(RulesSettings.DEFAULT_OPTIONS.id, page);
    await RulesSettings.open();
    expect(page.renders).toBe(1);
    expect(page.fronted).toBe(true);
  });

  it("draws a player's switches disabled, without the bulk buttons or Save", () => {
    const template = readFileSync(resolve(import.meta.dirname, "../../../templates/apps/rules-settings.hbs"), "utf8");
    expect(template).toMatch(/\{\{#if \(or rule\.pending @root\.readOnly\)\}\}disabled/);
    expect(template).toMatch(/\{\{#if readOnly\}\}[\s\S]*name="in-play-only"[\s\S]*\{\{else\}\}[\s\S]*data-action="allOn"[\s\S]*\{\{\/if\}\}/);
    expect(template).toMatch(/\{\{#unless readOnly\}\}[\s\S]*data-action="save"[\s\S]*\{\{\/unless\}\}/);
  });
});
