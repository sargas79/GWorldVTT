import { afterEach, describe, expect, it, vi } from "vitest";

import { irradiate } from "../hazards.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A module changing a dose of radiation before it's added (sargas79/GWorldVTT#490). */
describe("gworld.radiationDose (since 1.63.0)", () => {
  it("lets a listener halve the rads before shielding", async () => {
    const heard: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event === PROCEDURE_HOOKS.radiationDose) {
          heard.push({ rads: context.rads, protectionFactor: context.protectionFactor });
          context.rads /= 2;
          context.sources.push("A drug");
        }
        return true;
      },
    };
    globals.ChatMessage = { implementation: { create: async (d: any) => d, getSpeaker: () => ({}) } };
    globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
    globals.foundry = { applications: { handlebars: { renderTemplate: async () => "" } }, utils: { escapeHTML: (s: string) => s } };
    globals.game = { user: { isGM: true }, i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) } };
    globals.Roll = class { total = 10; dice = [{ results: [{ result: 3 }, { result: 3 }, { result: 4 }] }]; async evaluate() { return this; } };
    const update = vi.fn(async () => undefined);
    const actor = { isOwner: true, name: "Victim", system: { radiation: { dose: 0, at: 0 }, hp: { value: 10, max: 10 }, derived: { attributes: { HT: 10 } } }, items: [], update };
    await irradiate({ actor, rads: 100, protectionFactor: 1, modifier: 0 });
    expect(heard[0]).toEqual({ rads: 100, protectionFactor: 1 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ "system.radiation.dose": 50 }));
  });
});
