import { afterEach, describe, expect, it, vi } from "vitest";

import { clearRegisteredPoisons, offeredPoisons, registerPoison, registeredPoison } from "../poison-registry.js";
import { activePoisons, advancePoison, dosePoison } from "../poison.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  clearRegisteredPoisons();
  vi.restoreAllMocks();
});

const agent = {
  delivery: ["contact" as const],
  delaySeconds: 0,
  resistanceModifier: -6,
  damage: "toxic" as const,
  dice: 1,
  adds: 0,
  intervalSeconds: 60,
  cycles: 6,
  reference: "Some Book p. 1",
};

/** A character whose flags and HP the dose machinery writes to. */
function victim(ht = 10) {
  const flags: Record<string, unknown> = {};
  return {
    name: "Victim",
    isOwner: true,
    system: { hp: { value: 12, max: 12 }, fp: { value: 10, max: 10 }, derived: { attributes: { HT: ht } }, sm: 0 },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
    },
  };
}

/** Foundry, as far as a dose and a cycle reach: dice that always come up as given. */
function foundryWith(faces: number[]) {
  const create = vi.fn(async (data: unknown) => data);
  const calls: Array<[string, any]> = [];
  globals.ChatMessage = { implementation: { create, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { randomID: () => "dose1", escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async () => "<div></div>" } } };
  globals.game = { i18n: { localize: (key: string) => (key === "BOOK.Agent" ? "Nerve Agent" : key), format: (key: string) => key } };
  globals.Hooks = { call: (event: string, context: any) => { calls.push([event, context]); return true; }, callAll: (event: string, context: any) => { calls.push([event, context]); return true; } };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const count = Number(/^(\d+)d6$/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { create, calls };
}

/** What a module's poisons do in the system (sargas79/GWorldVTT#453). */
describe("a module's poisons", () => {
  it("are offered by label while available, and dosed under their source", () => {
    foundryWith([3]);
    let on = false;
    expect(registerPoison({ module: "book", key: "nerveAgent", label: "BOOK.Agent", poison: agent, available: () => on })).toBe("book.nerveAgent");
    expect(registerPoison({ module: "", key: "x", label: "X", poison: agent })).toBe(null);
    expect(offeredPoisons()).toEqual([]);
    on = true;
    expect(offeredPoisons()).toEqual([{ source: "book.nerveAgent", label: "Nerve Agent" }]);
    expect(registeredPoison("book.nerveAgent")).toMatchObject({ name: "Nerve Agent", source: "book.nerveAgent", resistanceModifier: -6, cycles: 6 });
    expect(registeredPoison("book.missing")).toBe(null);
  });

  it("carry their source onto the dose, and tell the cycle hook how it went", async () => {
    const { calls } = foundryWith([6, 6, 5, 4]);
    registerPoison({ module: "book", key: "nerveAgent", label: "BOOK.Agent", poison: agent });
    const actor = victim(10);
    const dose = await dosePoison({ actor, poison: registeredPoison("book.nerveAgent")! });
    expect(dose?.source).toBe("book.nerveAgent");
    expect(activePoisons(actor)[0]?.source).toBe("book.nerveAgent");

    // HT 10-6 = 4 against 6+6+5 = 17: failed by 13; then 1d6 = 4 toxic.
    const lost = await advancePoison({ actor, id: dose!.id });
    expect(lost).toBe(4);
    const cycle = calls.find(([event]) => event === PROCEDURE_HOOKS.poisonCycle)?.[1];
    expect(cycle).toMatchObject({
      actor,
      source: "book.nerveAgent",
      resisted: false,
      margin: 13,
      criticalFailure: true,
      hpLost: 4,
      fpLost: 0,
      hpLostToPoison: 4,
      symptomsNow: ["1/3"],
      effectMinutes: null,
      finished: false,
    });
    expect(cycle.poison.cyclesSuffered).toBe(1);
  });

  it("says a system poison has no source", async () => {
    const { calls } = foundryWith([1, 1, 1]);
    const actor = victim(12);
    const dose = await dosePoison({ actor, poison: { name: "Sleeper", ...agent, resistanceModifier: 0, damage: "none", dice: 0 } });
    await advancePoison({ actor, id: dose!.id });
    const cycle = calls.find(([event]) => event === PROCEDURE_HOOKS.poisonCycle)?.[1];
    expect(cycle).toMatchObject({ source: null, resisted: true, hpLost: 0, finished: true });
  });
});
