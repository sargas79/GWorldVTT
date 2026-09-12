import { describe, expect, it } from "vitest";

import { defenseChoices } from "../defense-choices.js";

const dodge = { total: 9 };
const parry = { total: 11, skillName: "Rapier", isFencing: true };
const block = { total: 10, skillName: "Shield" };

describe("defenseChoices", () => {
  /**
   * The point of the module: every defense is named on the card whether or
   * not it can be rolled, so a fighter with only a Dodge button can see that
   * Parry and Block are absent for a reason and not by oversight.
   */
  it("always lists all three, in the sheet's order", () => {
    const choices = defenseChoices({ defenses: { dodge } });
    expect(choices.map((c) => c.key)).toEqual(["dodge", "parry", "block"]);
    expect(choices.map((c) => c.available)).toEqual([true, false, false]);
  });

  it("says why a missing parry or block is missing", () => {
    const [, noParry, noBlock] = defenseChoices({ defenses: { dodge } });
    expect(noParry?.reason).toBe("noParry");
    expect(noBlock?.reason).toBe("noBlock");
  });

  it("blames the maneuver when the sheet says the maneuver forbids it", () => {
    const choices = defenseChoices({
      defenses: { dodge: null, parry: null, block: null },
      maneuver: { defenseAvailable: false, parryAvailable: false },
    });
    expect(choices.every((c) => c.reason === "maneuver")).toBe(true);

    const [, parryOnly] = defenseChoices({
      defenses: { dodge, parry: null, block },
      maneuver: { defenseAvailable: true, parryAvailable: false },
    });
    expect(parryOnly?.reason).toBe("maneuver");
  });

  it("shows the score after the arc and any deception", () => {
    const choices = defenseChoices({
      defenses: { dodge, parry, block },
      arc: {
        helpless: false, canDodge: true, canParry: true, canBlock: true, modifier: -2, parryModifier: -1,
      },
      deception: -1,
    });
    expect(choices.map((c) => c.shown)).toEqual([9 - 2 - 1, 11 - 2 - 1 - 1, 10 - 2 - 1]);
    // The roll itself is made against the unmodified score, with the arc as a
    // named modifier, so both travel separately.
    expect(choices[1]?.total).toBe(11);
    expect(choices[1]?.arcPenalty).toBe(-3);
  });

  it("refuses everything to a defender attacked from behind", () => {
    const choices = defenseChoices({
      defenses: { dodge, parry, block },
      arc: {
        helpless: true, canDodge: false, canParry: false, canBlock: false, modifier: 0, parryModifier: 0,
      },
    });
    expect(choices.every((c) => !c.available && c.reason === "helpless")).toBe(true);
  });

  it("refuses only the side the arc rules out", () => {
    const choices = defenseChoices({
      defenses: { dodge, parry, block },
      arc: {
        helpless: false, canDodge: true, canParry: true, canBlock: false, modifier: -2, parryModifier: 0,
      },
    });
    expect(choices.map((c) => c.reason)).toEqual([null, null, "arc"]);
  });

  it("carries the skill through, for the retreat bonus that depends on it", () => {
    const [, withRapier] = defenseChoices({ defenses: { dodge, parry, block } });
    expect(withRapier?.skillName).toBe("Rapier");
    expect(withRapier?.isFencing).toBe(true);
  });
});
