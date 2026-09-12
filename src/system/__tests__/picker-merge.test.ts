import { describe, expect, it } from "vitest";

import { amountKind, levelCeiling, planAddition, previewCost } from "../picker-merge.js";

const acuteHearing = {
  type: "trait",
  name: "Acute Hearing",
  system: { category: "advantage", points: 0, pointsPerLevel: 2, levels: 0, costTable: [], maxLevels: 0 },
};
const wealth = {
  type: "trait",
  name: "Wealth",
  system: { category: "advantage", points: 0, pointsPerLevel: 0, levels: 0, costTable: [10, 20, 30, 50, 75], maxLevels: 0 },
};
const combatReflexes = {
  type: "trait",
  name: "Combat Reflexes",
  system: { category: "advantage", points: 15, pointsPerLevel: 0, levels: 0, costTable: [], maxLevels: 0 },
};
const broadsword = {
  type: "skill",
  name: "Broadsword",
  system: { attribute: "DX", difficulty: "A", points: 0 },
};
const rope = { type: "equipment", name: "Rope, 3/4\"", system: { quantity: 1, weight: 5 } };

describe("amountKind", () => {
  it("asks for levels of a levelled trait and nothing of a flat one", () => {
    expect(amountKind(acuteHearing)).toBe("levels");
    expect(amountKind(wealth)).toBe("levels");
    expect(amountKind(combatReflexes)).toBeNull();
  });

  it("asks for points of a skill", () => {
    expect(amountKind(broadsword)).toBe("points");
    expect(amountKind(rope)).toBeNull();
  });
});

describe("previewCost", () => {
  it("prices levels as the trait would", () => {
    expect(previewCost(acuteHearing, 3)).toBe(6);
    expect(previewCost(wealth, 4)).toBe(50);
  });

  it("prices a skill at what was typed", () => {
    expect(previewCost(broadsword, 4)).toBe(4);
    expect(previewCost(rope, 4)).toBeNull();
  });
});

describe("levelCeiling", () => {
  it("stops a tabled trait at the last step it prices", () => {
    expect(levelCeiling(wealth)).toBe(5);
    expect(levelCeiling(acuteHearing)).toBeNull();
  });
});

describe("planAddition", () => {
  /**
   * The reason the module exists: a second Acute Hearing is another level of
   * the first, not another item.
   */
  it("raises a levelled trait the character already has", () => {
    const plan = planAddition({
      source: acuteHearing,
      existing: [{ id: "abc", ...acuteHearing, system: { ...acuteHearing.system, levels: 2 } }],
      chosen: { levels: 1 },
    });
    expect(plan).toEqual({
      action: "update",
      itemId: "abc",
      changes: { "system.levels": 3 },
      moved: { what: "levels", from: 2, to: 3 },
    });
  });

  it("does not raise a tabled trait past its table", () => {
    const plan = planAddition({
      source: wealth,
      existing: [{ id: "w", ...wealth, system: { ...wealth.system, levels: 4 } }],
      chosen: { levels: 3 },
    });
    expect(plan.action).toBe("update");
    if (plan.action === "update") expect(plan.changes["system.levels"]).toBe(5);
  });

  it("creates a levelled trait at the chosen level, one by default", () => {
    const one = planAddition({ source: acuteHearing, existing: [] });
    expect(one.action).toBe("create");
    if (one.action === "create") expect((one.data.system as any).levels).toBe(1);

    const three = planAddition({ source: acuteHearing, existing: [], chosen: { levels: 3 } });
    if (three.action === "create") expect((three.data.system as any).levels).toBe(3);
  });

  /** A skill with no points is not known; nobody chooses a skill to not know it. */
  it("creates a skill with a point in it unless told otherwise", () => {
    const plan = planAddition({ source: broadsword, existing: [] });
    if (plan.action === "create") expect((plan.data.system as any).points).toBe(1);

    const four = planAddition({ source: broadsword, existing: [], chosen: { points: 4 } });
    if (four.action === "create") expect((four.data.system as any).points).toBe(4);
  });

  it("adds points to a skill the character already has", () => {
    const plan = planAddition({
      source: broadsword,
      existing: [{ id: "s", ...broadsword, system: { ...broadsword.system, points: 2 } }],
      chosen: { points: 2 },
    });
    expect(plan).toMatchObject({ action: "update", itemId: "s", changes: { "system.points": 4 } });
  });

  it("matches a skill whether or not its name carries /TL", () => {
    const guns = { type: "skill", name: "Guns/TL (Pistol)", system: { points: 0 } };
    const plan = planAddition({
      source: guns,
      existing: [{ id: "g", type: "skill", name: "Guns (Pistol)", system: { points: 1 } }],
      chosen: { points: 1 },
    });
    expect(plan.action).toBe("update");
  });

  it("makes a second rope one more rope", () => {
    const plan = planAddition({
      source: rope,
      existing: [{ id: "r", ...rope }],
    });
    expect(plan).toMatchObject({ action: "update", changes: { "system.quantity": 2 } });
  });

  it("adds a flat trait, armour or a language as a fresh copy", () => {
    const again = planAddition({
      source: combatReflexes,
      existing: [{ id: "c", ...combatReflexes }],
    });
    expect(again.action).toBe("create");
  });

  it("does not match across types", () => {
    const plan = planAddition({
      source: broadsword,
      existing: [{ id: "x", type: "technique", name: "Broadsword", system: { points: 1 } }],
    });
    expect(plan.action).toBe("create");
  });
});

describe("adding a spell", () => {
  /** A spell is bought with points, like a skill, and merges by name like one. */
  it("asks for points, and raises a spell the character already has", () => {
    const source = { type: "spell", name: "Fireball", system: { points: 0, colleges: ["Fire"] } };
    expect(amountKind(source)).toBe("points");
    const plan = planAddition({
      source,
      existing: [{ id: "f1", type: "spell", name: "fireball", system: { points: 2 } }],
      chosen: { points: 2 },
    });
    expect(plan).toMatchObject({ action: "update", itemId: "f1", changes: { "system.points": 4 } });
  });

  it("creates a new spell with the chosen points", () => {
    const plan = planAddition({
      source: { type: "spell", name: "Fireball", system: { points: 0 } },
      existing: [],
      chosen: { points: 1 },
    });
    expect(plan).toMatchObject({ action: "create", data: { system: { points: 1 } } });
  });
});
