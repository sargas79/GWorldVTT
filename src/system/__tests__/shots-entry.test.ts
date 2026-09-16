import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

import { reloadPlan, shotsReady } from "../ammunition.js";
import { shotsEntryFor } from "../shots-entry.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

/** A pistol holding 33 shots that reloads in 3 seconds, with 10 loaded. */
function pistol() {
  return { name: "Pistol", actor: null, system: { rangedModes: [{ shots: "33(3)", loaded: 10, skill: "Beam Weapons (Pistol)" }] } };
}

function listen(listener: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.shotsEntry") listener(context); } };
}

describe("gworld.shotsEntry (sargas79/GWorldVTT#403)", () => {
  it("reads the table's figures when nobody listens", () => {
    const entry = shotsEntryFor(pistol(), 0);
    expect(entry).toMatchObject({ capacity: 33, reloadSeconds: 3, perShot: false });
  });

  it("lets a listener change what the mode holds and how long it takes to reload", () => {
    listen((context) => {
      context.entry.capacity *= 5;
      context.entry.reloadSeconds = 5;
    });
    const item = pistol();
    expect(shotsEntryFor(item, 0)).toMatchObject({ capacity: 165, reloadSeconds: 5 });
    expect(reloadPlan(null, item, 0)).toMatchObject({ capacity: 165, loading: 155, seconds: 5 });
    expect(shotsReady(item, 0)).toBe(10);
  });

  it("names the item, the mode and its index", () => {
    const seen: any[] = [];
    listen((context) => seen.push(context));
    const item = pistol();
    shotsEntryFor(item, 0);
    expect(seen[0]).toMatchObject({ item, modeIndex: 0, mode: item.system.rangedModes[0] });
  });

  it("keeps the table's count where a listener writes something that isn't a number, and never goes below zero", () => {
    listen((context) => {
      context.entry.capacity = "lots";
      context.entry.reloadSeconds = -4;
    });
    expect(shotsEntryFor(pistol(), 0)).toMatchObject({ capacity: 33, reloadSeconds: 0 });
  });

  it("changes nothing when a listener throws", () => {
    globals.Hooks = { callAll: () => { throw new Error("boom"); } };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(shotsEntryFor(pistol(), 0)).toMatchObject({ capacity: 33, reloadSeconds: 3 });
  });

  it("never changes the stored column", () => {
    listen((context) => { context.entry.capacity = 99; });
    const item = pistol();
    shotsEntryFor(item, 0);
    expect(item.system.rangedModes[0]!.shots).toBe("33(3)");
  });
});
