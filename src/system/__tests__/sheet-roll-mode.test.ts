import { afterEach, describe, expect, it } from "vitest";

import {
  registerSheetRollModeHooks,
  setSheetRollMode,
  sheetModeForCard,
  sheetRollMode,
  sheetRollModeButtons,
  type SheetRollMode,
} from "../sheet-roll-mode.js";

/** Rolling from a sheet privately to the GM, or blind to the GM. */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["game", "Hooks"]) delete globals[key];
});

function withSettings(initial: Record<string, unknown> = {}) {
  let stored: unknown = initial;
  const hooks: Record<string, (...args: any[]) => unknown> = {};
  globals.game = {
    user: { id: "me" },
    i18n: { localize: (k: string) => k },
    settings: {
      get: () => stored,
      set: async (_scope: string, _key: string, value: unknown) => { stored = value; },
    },
  };
  globals.Hooks = { on: (name: string, fn: (...args: any[]) => unknown) => { hooks[name] = fn; } };
  return { hooks, stored: () => stored };
}

const chosen = (mode: SheetRollMode) => () => mode;

describe("which cards a sheet's roll visibility reaches", () => {
  it("puts a public card with dice, spoken by the actor, in the chosen mode", () => {
    expect(sheetModeForCard({ isRoll: true, whisper: [], blind: false, speakerActor: "a1" }, chosen("gm"))).toBe("gm");
    expect(sheetModeForCard({ isRoll: true, whisper: [], blind: false, speakerActor: "a1" }, chosen("blind"))).toBe("blind");
  });

  it("leaves a public choice, a card without dice and a card without an actor alone", () => {
    expect(sheetModeForCard({ isRoll: true, speakerActor: "a1" }, chosen("public"))).toBeNull();
    expect(sheetModeForCard({ isRoll: false, speakerActor: "a1" }, chosen("blind"))).toBeNull();
    expect(sheetModeForCard({ isRoll: true, speakerActor: null }, chosen("blind"))).toBeNull();
  });

  it("keeps a card that already chose who sees it", () => {
    expect(sheetModeForCard({ isRoll: true, speakerActor: "a1", whisper: ["gm"] }, chosen("blind"))).toBeNull();
    expect(sheetModeForCard({ isRoll: true, speakerActor: "a1", blind: true }, chosen("gm"))).toBeNull();
    expect(sheetModeForCard({ isRoll: true, speakerActor: "a1", requestedMode: "public" }, chosen("blind"))).toBeNull();
  });
});

describe("the choice, kept per actor for this user", () => {
  it("is public until chosen, and forgets a return to public", async () => {
    const { stored } = withSettings();
    expect(sheetRollMode("a1")).toBe("public");
    await setSheetRollMode("a1", "blind");
    await setSheetRollMode("a2", "gm");
    expect(sheetRollMode("a1")).toBe("blind");
    expect(sheetRollMode("a2")).toBe("gm");
    await setSheetRollMode("a1", "public");
    expect(stored()).toEqual({ a2: "gm" });
  });

  it("ignores a stored value that is not a mode", () => {
    withSettings({ a1: "whisper-to-the-cat" });
    expect(sheetRollMode("a1")).toBe("public");
  });

  it("marks the chosen mode among the sheet's buttons", () => {
    withSettings({ a1: "gm" });
    expect(sheetRollModeButtons("a1").map((b) => [b.mode, b.active])).toEqual([
      ["public", false], ["gm", true], ["blind", false],
    ]);
  });
});

describe("the chat hook", () => {
  it("applies the mode to this user's roll cards only", () => {
    const { hooks } = withSettings({ a1: "blind" });
    registerSheetRollModeHooks();
    const applied: string[] = [];
    const message = { isRoll: true, whisper: [], blind: false, speaker: { actor: "a1" }, applyMode: (m: string) => applied.push(m) };
    hooks.preCreateChatMessage!(message, {}, {}, "me");
    hooks.preCreateChatMessage!(message, {}, {}, "someone-else");
    hooks.preCreateChatMessage!(message, {}, { messageMode: "public" }, "me");
    expect(applied).toEqual(["blind"]);
  });
});
