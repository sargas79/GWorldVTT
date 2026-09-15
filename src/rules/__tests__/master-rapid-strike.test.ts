import { describe, expect, it } from "vitest";

import { RAPID_STRIKE_PENALTY, halvesRapidStrike, rapidStrikePenalty } from "../attack-options.js";
import { flurryOfBlowsPenalty } from "../extra-effort.js";
import { weaponMasterDefault } from "../weapon-master.js";

/**
 * A master's Rapid Strike (GURPS Basic Set: Characters pp. 93, 99): Trained By
 * A Master halves the penalty with unarmed and Melee Weapon skills; Weapon
 * Master with a weapon of its class, never at default.
 */
describe("rapidStrikePenalty", () => {
  it("is -6, or -3 for a master", () => {
    expect(rapidStrikePenalty(false)).toBe(RAPID_STRIKE_PENALTY);
    expect(rapidStrikePenalty(true)).toBe(-3);
  });

  it("is halved again by Flurry of Blows, in the fighter's favour", () => {
    expect(flurryOfBlowsPenalty(rapidStrikePenalty(false))).toBe(-3);
    expect(flurryOfBlowsPenalty(rapidStrikePenalty(true))).toBe(-1);
  });
});

describe("halvesRapidStrike", () => {
  const nobody = { trainedByAMaster: false, weaponMaster: false };

  it("halves it for a Weapon Master's weapon, whatever the skill", () => {
    expect(halvesRapidStrike({ ...nobody, skill: "Broadsword", weaponMaster: true })).toBe(true);
    expect(halvesRapidStrike({ ...nobody, skill: "Shield", weaponMaster: true })).toBe(true);
  });

  it("halves it for Trained By A Master with unarmed and Melee Weapon skills", () => {
    const master = { ...nobody, trainedByAMaster: true };
    expect(halvesRapidStrike({ ...master, skill: "Karate" })).toBe(true);
    expect(halvesRapidStrike({ ...master, skill: "Brawling" })).toBe(true);
    expect(halvesRapidStrike({ ...master, skill: "Judo" })).toBe(true);
    expect(halvesRapidStrike({ ...master, skill: "Broadsword" })).toBe(true);
    expect(halvesRapidStrike({ ...master, skill: "Two-Handed Axe/Mace" })).toBe(true);
  });

  it("leaves Trained By A Master's other skills, and anyone else, at the full penalty", () => {
    const master = { ...nobody, trainedByAMaster: true };
    expect(halvesRapidStrike({ ...master, skill: "Shield" })).toBe(false);
    expect(halvesRapidStrike({ ...master, skill: "DX" })).toBe(false);
    expect(halvesRapidStrike({ ...nobody, skill: "Karate" })).toBe(false);
  });
});

describe("weaponMasterDefault", () => {
  it("is DX-1, DX-2 or DX-3 for an Easy, Average or Hard DX skill", () => {
    expect(weaponMasterDefault({ attribute: "DX", difficulty: "E", dx: 12 })).toBe(11);
    expect(weaponMasterDefault({ attribute: "DX", difficulty: "A", dx: 12 })).toBe(10);
    expect(weaponMasterDefault({ attribute: "DX", difficulty: "H", dx: 12 })).toBe(9);
  });

  it("gives nothing for a skill on another attribute or of another difficulty", () => {
    expect(weaponMasterDefault({ attribute: "IQ", difficulty: "A", dx: 12 })).toBe(null);
    expect(weaponMasterDefault({ attribute: "DX", difficulty: "VH", dx: 12 })).toBe(null);
    expect(weaponMasterDefault({ attribute: "DX", difficulty: "", dx: 12 })).toBe(null);
  });
});
