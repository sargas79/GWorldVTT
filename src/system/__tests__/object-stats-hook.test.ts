import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

import { objectStats } from "../object-stats.js";
import { weaponFacts } from "../weapon-damage.js";
import { gearStatistics } from "../sheet-v2/gear-statistics.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

function listen(listener: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.objectStats") listener(context); } };
}

const pistol = {
  type: "equipment",
  name: "Pistol",
  actor: { name: "Owner" },
  system: { weight: 2.5, hpLost: 0, rangedModes: [{ skill: "Guns (Pistol)", damageType: "pi", malfunction: 17 }] },
};
const shield = { type: "shield", name: "Medium Shield", system: { db: 2, dr: 7, hp: 40, hpLost: 0 } };

describe("gworld.objectStats (sargas79/GWorldVTT#647)", () => {
  it("gives the book's figures when nobody listens", () => {
    expect(objectStats(pistol)).toEqual({ kind: "unliving", dr: 4, hp: 6, ht: 10, notes: [] });
  });

  it("hands the listener the item, its owner and the figures, and keeps what it changes", () => {
    const seen: any[] = [];
    listen((context) => {
      seen.push({ ...context });
      context.dr *= 2;
      context.ht += 2;
      context.notes.push("Rugged");
    });
    expect(objectStats(pistol)).toEqual({ kind: "unliving", dr: 8, hp: 6, ht: 12, notes: ["Rugged"] });
    expect(seen[0]).toMatchObject({ item: pistol, actor: pistol.actor, kind: "unliving", dr: 4, hp: 6, ht: 10 });
  });

  it("carries the changed figures into the breakage facts", () => {
    listen((context) => { context.dr = 10; context.hp = 3; });
    const facts = weaponFacts({ ...pistol, system: { ...pistol.system, hpLost: 3 } });
    expect(facts).toMatchObject({ dr: 10, hp: 3, ht: 10, condition: "disabled" });
  });

  it("covers a shield's own DR and HP, and the sheet's stat block shows them", () => {
    listen((context) => { if (context.item.type === "shield") context.hp = 20; });
    expect(objectStats(shield)).toMatchObject({ kind: "homogenous", dr: 7, hp: 20, ht: 12 });
    const block = gearStatistics({ ...shield, objectStats: objectStats(shield) }, [], (key) => key).blocks[0];
    expect(block?.lines.map((l) => l.value)).toContain("20");
  });

  it("changes nothing when a listener throws", () => {
    listen((context) => { context.dr = 99; throw new Error("boom"); });
    expect(objectStats(pistol)).toEqual({ kind: "unliving", dr: 4, hp: 6, ht: 10, notes: [] });
  });
});
