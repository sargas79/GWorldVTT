import { describe, expect, it } from "vitest";

import {
  alternativeBilling,
  alternativeSets,
  alternativeUsable,
  fifthCost,
  pointPoweredCeiling,
  pointPoweredCost,
  pointPoweredUse,
  swapAlternative,
  wildcardBonus,
  type AlternativeMember,
} from "../alternative-abilities.js";
import { reactionSources } from "../social.js";

const member = (id: string, cost: number, extra: Partial<AlternativeMember> = {}): AlternativeMember => ({
  id, group: "levitate", slots: 1, cost, ...extra,
});

/** Basic Set Revised p. 324. */
describe("Alternative Abilities", () => {
  it("bills the dearest at full price and the rest a fifth, rounded up (Jocko: 36 + 4 + 4)", () => {
    const billed = alternativeBilling([member("sj", 18), member("flight", 36), member("wal", 18)]);
    expect([billed.get("flight"), billed.get("sj"), billed.get("wal")]).toEqual([36, 4, 4]);
  });

  it("charges full price for as many as there are slots", () => {
    const billed = alternativeBilling([member("dr", 20, { slots: 2 }), member("sealed", 15), member("slip", 10)]);
    expect([billed.get("dr"), billed.get("sealed"), billed.get("slip")]).toEqual([20, 15, 2]);
  });

  it("leaves a trait in no set, and one that pays points back, as it is", () => {
    const billed = alternativeBilling([{ id: "a", group: "", slots: 1, cost: 30 }, member("b", -10), member("c", 20)]);
    expect([billed.get("a"), billed.get("b"), billed.get("c")]).toEqual([30, -10, 20]);
  });

  it("keeps sets apart by name, ignoring case", () => {
    const billed = alternativeBilling([member("a", 10, { group: "Ray" }), member("b", 10, { group: " ray " }), member("c", 10, { group: "Other" })]);
    expect([billed.get("a"), billed.get("b"), billed.get("c")]).toEqual([10, 2, 10]);
  });

  it("rounds a fifth up", () => {
    expect(fifthCost(18)).toBe(4);
    expect(fifthCost(5)).toBe(1);
    expect(fifthCost(-18)).toBe(-4);
  });

  it("turns the whole set off when any ability is disabled", () => {
    const members = [member("a", 10, { active: true }), member("b", 10, { disabled: true })];
    const [set] = alternativeSets(members);
    expect(set!.disabled).toBe(true);
    expect(set!.active).toEqual([]);
    expect(alternativeUsable(members[0]!, [set!])).toBe(false);
  });

  it("uses only an ability in a slot, and never more than the slots", () => {
    const members = [member("a", 10, { active: true }), member("b", 10, { active: true }), member("c", 10)];
    const [set] = alternativeSets(members);
    expect(set!.active).toEqual(["a"]);
    expect(alternativeUsable(members[2]!, [set!])).toBe(false);
    expect(alternativeUsable({ id: "x", group: "", slots: 1, cost: 5 }, [set!])).toBe(true);
  });

  it("swaps into an empty slot with a Ready, and out of a full one with a Ready", () => {
    expect(swapAlternative([member("a", 10), member("b", 10)], "a")).toEqual({ ok: true, action: "ready", replaces: null });
    expect(swapAlternative([member("a", 10, { active: true }), member("b", 10)], "b")).toEqual({ ok: true, action: "ready", replaces: "a" });
  });

  it("swaps free from one attack to another", () => {
    const result = swapAlternative([member("a", 10, { active: true, attack: true }), member("b", 10, { attack: true })], "b");
    expect(result).toEqual({ ok: true, action: "free", replaces: "a" });
    expect(swapAlternative([member("a", 10, { active: true }), member("b", 10, { attack: true })], "b")).toMatchObject({ action: "ready" });
  });

  it("refuses a swap for a disabled set, a frozen slot or an ability already on", () => {
    expect(swapAlternative([member("a", 10, { disabled: true }), member("b", 10)], "b")).toEqual({ ok: false, reason: "disabled" });
    expect(swapAlternative([member("a", 10, { active: true, frozen: true }), member("b", 10)], "b")).toEqual({ ok: false, reason: "frozen" });
    expect(swapAlternative([member("a", 10, { active: true })], "a")).toEqual({ ok: false, reason: "already" });
  });

  it("swaps around a frozen slot when there are two", () => {
    const members = [member("a", 10, { slots: 2, active: true, frozen: true }), member("b", 10, { active: true }), member("c", 10)];
    expect(swapAlternative(members, "c")).toMatchObject({ ok: true, replaces: "b" });
  });

  it("leaves a trait in no set alone", () => {
    expect(swapAlternative([{ id: "a", group: "", slots: 1, cost: 5 }], "a")).toEqual({ ok: true, action: "none", replaces: null });
  });
});

/** Basic Set Revised p. 325. */
describe("Character point-powered abilities", () => {
  it("cost a fifth, rounded up", () => {
    expect(pointPoweredCost(50)).toBe(10);
    expect(pointPoweredCost(23)).toBe(5);
  });

  it("price a use at 1, 2, or 3 up to the ability's cost", () => {
    expect(pointPoweredUse("perfect", { cost: 10 })).toBe(1);
    expect(pointPoweredUse("believable", { cost: 10 })).toBe(2);
    expect(pointPoweredUse("showing", { cost: 10, disruption: 7 })).toBe(7);
    expect(pointPoweredUse("showing", { cost: 10, disruption: 40 })).toBe(10);
    expect(pointPoweredUse("showing", { cost: 1, disruption: 1 })).toBe(3);
    expect(pointPoweredCeiling(10)).toBe(10);
    expect(pointPoweredCeiling(1)).toBe(3);
  });
});

/** Basic Set Revised p. 333. */
describe("Wildcard bonuses", () => {
  it("is the positive relative level", () => {
    expect(wildcardBonus({ relativeLevel: 4, category: "noSkill" })).toBe(4);
    expect(wildcardBonus({ relativeLevel: 0, category: "noSkill" })).toBe(0);
    expect(wildcardBonus({ relativeLevel: -2, category: "noSkill" })).toBe(0);
  });

  it("is halved, rounded up, under three dice, on active defenses, and where the GM says", () => {
    expect(wildcardBonus({ relativeLevel: 5, category: "noSkill", dice: 1 })).toBe(3);
    expect(wildcardBonus({ relativeLevel: 5, category: "resist", activeDefense: true })).toBe(3);
    expect(wildcardBonus({ relativeLevel: 4, category: "accuracy", halve: true })).toBe(2);
    expect(wildcardBonus({ relativeLevel: 5, category: "noSkill", dice: 3 })).toBe(5);
  });

  it("never stacks with itself", () => {
    expect(wildcardBonus({ relativeLevel: 5, category: "damage", applied: ["accuracy"] })).toBe(0);
  });
});

/** Basic Set Revised pp. 324-325. */
describe("Alternative benefits for Talents", () => {
  it("gives no reaction bonus to a Talent flagged as having none", () => {
    expect(reactionSources([{ name: "Healer", levels: 2 }])).toHaveLength(1);
    expect(reactionSources([{ name: "Healer", levels: 2, noReactionBonus: true }])).toHaveLength(0);
  });

  it("keeps a bonus the GM typed onto the flagged Talent", () => {
    expect(reactionSources([{ name: "Healer", levels: 2, noReactionBonus: true, reactionModifier: 1 }])).toHaveLength(1);
  });
});
