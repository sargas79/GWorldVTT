import { describe, expect, it } from "vitest";

import {
  emptySketch,
  levelOnSheet,
  pointsForLevel,
  rolledAttributes,
  sketchActorSystem,
  sketchAttributeScore,
  sketchPoints,
  skillItemData,
  skillLines,
  trivialSkillLevel,
  type NpcSketch,
} from "../quick-npc.js";

/** Dai Blackthorn's card (Campaigns p. 569), the skills written as levels. */
function dai(): NpcSketch {
  return {
    ...emptySketch(),
    name: "Dai Blackthorn",
    appearance: "Short; Honest face",
    attributes: { ST: 8, DX: 15, IQ: 12, HT: 12 },
    secondary: { hp: 2, will: 0, per: 3, fp: -2, basicSpeed: 0.25, basicMove: 0 },
    skills: [
      { name: "Knife", attribute: "DX", difficulty: "E", level: 17 },
      { name: "Acrobatics", attribute: "DX", difficulty: "H", level: 15 },
      { name: "Body Sense", attribute: "DX", difficulty: "H", level: 16 },
    ],
  };
}

describe("a skill written as a level (Campaigns p. 569)", () => {
  it("prices the level off the attribute the skill uses", () => {
    expect(pointsForLevel(17, 15, "E")).toBe(4); // DX+2, Easy
    expect(pointsForLevel(15, 15, "H")).toBe(4); // DX+0, Hard
    expect(pointsForLevel(16, 15, "H")).toBe(8); // DX+1, Hard
    expect(pointsForLevel(13, 12, "A")).toBe(4); // IQ+1, Average
  });

  it("costs the one point when the level is below what a point buys", () => {
    expect(pointsForLevel(8, 12, "A")).toBe(1);
    expect(pointsForLevel(5, 12, "VH")).toBe(1);
  });

  it("shows the level the sheet will show, which is the written one when it can be bought exactly", () => {
    const sketch = dai();
    expect(levelOnSheet(sketch.skills[0]!, sketch)).toBe(17);
    expect(levelOnSheet({ name: "Climbing", attribute: "DX", difficulty: "A", level: 9 }, sketch)).toBe(14);
  });

  it("bases a Will or Per skill on the sketch's Will or Per", () => {
    const sketch = dai();
    expect(sketchAttributeScore(sketch, "Per")).toBe(15);
    expect(sketchAttributeScore(sketch, "Will")).toBe(12);
    expect(skillItemData({ name: "Observation", attribute: "Per", difficulty: "A", level: 16 }, sketch).system.points).toBe(4);
  });

  it("writes the skills as the card does", () => {
    expect(skillLines(dai())).toEqual(["Acrobatics-15", "Body Sense-16", "Knife-17"]);
  });
});

describe("a trivial NPC's skill (Campaigns p. 502)", () => {
  it("is the dice as they fell", () => {
    expect(trivialSkillLevel([3, 4, 5])).toBe(12);
  });

  it("rolls each attribute on the spot (Revised p. 502)", () => {
    const rolls = [9, 11, 10, 12];
    expect(rolledAttributes(() => rolls.shift() ?? 0)).toEqual({ ST: 9, DX: 11, IQ: 10, HT: 12 });
  });
});

describe("the sketch as an actor", () => {
  it("keys the numbers and words as the NPC data model does", () => {
    const system = sketchActorSystem({ ...dai(), groupSize: 3, tactics: "Runs when hurt", cannonFodder: true, notes: "p. 569" });
    expect(system).toEqual({
      attributes: { ST: 8, DX: 15, IQ: 12, HT: 12 },
      purchased: { hp: 2, will: 0, per: 3, fp: -2, basicSpeed: 0.25, basicMove: 0 },
      groupSize: 3,
      tactics: "Runs when hurt",
      cannonFodder: true,
      details: { appearance: "Short; Honest face", notes: "p. 569" },
    });
  });

  it("adds up the points the sheet will show", () => {
    const sketch = { ...dai(), traits: [{ name: "Danger Sense", points: 15 }, { name: "Overconfidence", points: -5 }] };
    // ST 8 [-20], DX 15 [100], IQ 12 [40], HT 12 [20]; HP+2 [4], Per+3 [15], FP-2 [-6], Speed+0.25 [5];
    // traits 10; Knife 4, Acrobatics 4, Body Sense 8.
    expect(sketchPoints(sketch)).toBe(-20 + 100 + 40 + 20 + 4 + 15 - 6 + 5 + 10 + 16);
  });
});
