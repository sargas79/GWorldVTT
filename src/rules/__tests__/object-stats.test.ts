import { describe, expect, it } from "vitest";

import { settleObjectStats, weaponObjectStats } from "../breakage.js";

describe("a weapon's or shield's DR, HP and HT as an object (Campaigns pp. 483-484)", () => {
  it("gives a gun composite DR, machine HP and HT 10", () => {
    expect(weaponObjectStats({ material: "" as never, skill: "Guns (Pistol)", firearm: true, weightLbs: 2.5 }))
      .toEqual({ kind: "unliving", dr: 4, hp: 6, ht: 10 });
  });

  it("gives a sword solid-metal DR, solid HP and HT 12", () => {
    expect(weaponObjectStats({ material: "" as never, skill: "Broadsword", firearm: false, weightLbs: 3 }))
      .toEqual({ kind: "homogenous", dr: 6, hp: 12, ht: 12 });
  });

  it("takes a shield's own DR and HP, at HT 12", () => {
    expect(weaponObjectStats({ material: "" as never, skill: "Shield", firearm: false, weightLbs: 15, shield: { dr: 7, hp: 40 } }))
      .toEqual({ kind: "homogenous", dr: 7, hp: 40, ht: 12 });
  });
});

describe("object stats a module changed", () => {
  const base = { kind: "unliving" as const, dr: 4, hp: 6, ht: 10 };

  it("keeps what the module set, rounded and never below 0", () => {
    expect(settleObjectStats(base, { dr: 8, hp: 6.6, ht: -2, notes: ["Rugged: +2 HT", "", 3, "  Cheap  "] }))
      .toEqual({ kind: "unliving", dr: 8, hp: 7, ht: 0, notes: ["Rugged: +2 HT", "Cheap"] });
  });

  it("falls back to the book's figures for anything that isn't a number", () => {
    expect(settleObjectStats(base, { dr: "8", hp: Number.NaN, ht: undefined, notes: "no" }))
      .toEqual({ ...base, notes: [] });
  });
});
