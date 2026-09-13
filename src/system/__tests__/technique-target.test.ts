import { describe, expect, it } from "vitest";

import { techniqueTarget } from "../unarmed-techniques.js";

/**
 * What an unarmed technique is rolled against by a particular character
 * (GURPS Basic Set: Campaigns pp. 403-404).
 */
const fighter = (skills: Record<string, number>) => ({
  system: { skillLevelByName: (name: string) => skills[name] ?? null },
});

describe("techniqueTarget", () => {
  it("rolls an elbow strike at Brawling-2 or Karate-2", () => {
    // "Roll against Brawling-2 or Karate-2 to hit."
    expect(techniqueTarget(fighter({ Brawling: 13 }), "elbowStrike")).toMatchObject({
      skill: "Brawling",
      target: 11,
    });
  });

  it("keeps the better skill after its own penalty, not the higher number", () => {
    // "roll against your Judo at -2 or Wrestling at -3." Wrestling 14 is 11;
    // Judo 13 is also 11, so a Judo of 14 wins at 12.
    const choke = techniqueTarget(fighter({ Judo: 14, Wrestling: 14 }), "chokeHold");
    expect(choke).toMatchObject({ skill: "Judo", target: 12 });
  });

  it("takes Wrestling when it comes out ahead even after the worse penalty", () => {
    const choke = techniqueTarget(fighter({ Judo: 10, Wrestling: 15 }), "chokeHold");
    expect(choke).toMatchObject({ skill: "Wrestling", target: 12 });
  });

  it("rolls a piercing strike at Karate-2 and nothing else", () => {
    expect(techniqueTarget(fighter({ Karate: 12, Brawling: 16 }), "piercingStrike")).toMatchObject({
      skill: "Karate",
      target: 10,
    });
  });

  it("gives no roll to somebody who knows none of the skills", () => {
    // The book gives these techniques no default.
    expect(techniqueTarget(fighter({ Brawling: 14 }), "chokeHold")).toBe(null);
  });
});
