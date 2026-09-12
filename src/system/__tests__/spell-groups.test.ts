import { describe, expect, it } from "vitest";

import { groupSpells } from "../spell-groups.js";

const spells = [
  { id: "1", name: "Shape Fire", colleges: ["Fire"], points: 1, level: 12 },
  { id: "2", name: "Ignite Fire", colleges: ["Fire"], points: 2, level: 13 },
  { id: "3", name: "Deflect Missile", colleges: ["Movement", "Protection & Warning"], points: 0, level: null },
  { id: "4", name: "Seek Water", colleges: ["Water"], points: 0, level: 10 },
  { id: "5", name: "Homebrew", colleges: [], points: 1, level: 11 },
];

describe("groupSpells", () => {
  it("files spells by college, colleges and spells alike in alphabetical order", () => {
    const groups = groupSpells(spells);
    expect(groups.map((g) => g.college)).toEqual(["Fire", "Movement", "Water", ""]);
    expect(groups[0]?.rows.map((r) => r.spell.name)).toEqual(["Ignite Fire", "Shape Fire"]);
  });

  /** A spell of two colleges is listed once, under the first, with the rest beside it. */
  it("lists a spell of two colleges once, naming the others", () => {
    const groups = groupSpells(spells);
    const movement = groups.find((g) => g.college === "Movement");
    expect(movement?.rows).toHaveLength(1);
    expect(movement?.rows[0]?.otherColleges).toEqual(["Protection & Warning"]);
    expect(groups.find((g) => g.college === "Protection & Warning")).toBeUndefined();
  });

  /** "you must have at least one point" -- a spell without one is written down, not known. */
  it("marks a spell known once a point is in it, and rollable whenever it has a level", () => {
    const [fire, , water] = groupSpells(spells);
    expect(fire?.rows.find((r) => r.spell.name === "Shape Fire")).toMatchObject({ known: true, rollable: true });
    // A ritual mage casts at default: no points, yet a level.
    expect(water?.rows[0]).toMatchObject({ known: false, rollable: true });
  });

  it("gathers spells with no college last", () => {
    const groups = groupSpells(spells);
    expect(groups[groups.length - 1]?.college).toBe("");
    expect(groups[groups.length - 1]?.rows[0]?.spell.name).toBe("Homebrew");
  });

  it("shows nothing for a character with no spells", () => {
    expect(groupSpells([])).toEqual([]);
  });
});
