import { describe, expect, it } from "vitest";

import { reactionProfile } from "../sheet-v2/reactions.js";
import { reactionSources } from "../../rules/social.js";

describe("the profile's reaction modifiers", () => {
  it("adds up what everyone applies and lists the rest (pp. 21, 26, 41)", () => {
    const profile = reactionProfile(
      reactionSources([
        { name: "Appearance", levels: 2 }, // Beautiful: +2 from everyone, +4 from those attracted
        { name: "Charisma", levels: 1 },
        { name: "Reputation", levels: 2 },
      ]),
    );

    expect(profile.total).toBe(3);
    expect(profile.always).toEqual([
      { label: "Appearance", value: 2 },
      { label: "Charisma", value: 1 },
    ]);
    expect(profile.conditional).toEqual([
      { label: "Appearance", value: 2, condition: "attracted" },
      { label: "Reputation", value: 2, condition: "knowing" },
    ]);
  });

  it("counts a penalty against the total (p. 22)", () => {
    const profile = reactionProfile(
      reactionSources([
        { name: "Appearance (Disadvantage)", levels: 2 }, // Ugly, -2
        { name: "Odious Personal Habit", levels: 1 },
      ]),
    );

    expect(profile.total).toBe(-3);
    expect(profile.conditional).toEqual([]);
  });

  it("says nothing at all for a character with no social traits", () => {
    expect(reactionProfile([])).toEqual({ total: 0, always: [], conditional: [] });
  });
});
