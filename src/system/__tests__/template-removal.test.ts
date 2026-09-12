import { describe, expect, it } from "vitest";

import { needsReview, planTemplateRemoval, type RemovalItem } from "../template-removal.js";

const items = (...list: RemovalItem[]) => new Map(list.map((item) => [item.id, item]));

const record = {
  name: "Knight",
  itemIds: ["a", "b", "c"],
  previous: { "attributes.ST": 10, "attributes.DX": 10 },
  written: { "attributes.ST": 13, "attributes.DX": 12 },
  at: 1000,
};

describe("planTemplateRemoval", () => {
  it("removes what is still there and counts what is already gone", () => {
    const plan = planTemplateRemoval(
      record,
      items({ id: "a", name: "Combat Reflexes" }, { id: "c", name: "Broadsword" }),
      () => undefined,
    );
    expect(plan.present.map((i) => i.name)).toEqual(["Combat Reflexes", "Broadsword"]);
    expect(plan.missing).toBe(1);
  });

  it("names the items changed after the template was applied", () => {
    const plan = planTemplateRemoval(
      record,
      items(
        { id: "a", name: "Combat Reflexes", modifiedTime: 900 },
        { id: "b", name: "Status", modifiedTime: 5000 },
      ),
      () => undefined,
    );
    expect(plan.edited.map((i) => i.name)).toEqual(["Status"]);
    expect(needsReview(plan)).toBe(true);
  });

  it("puts back a number still reading what the template wrote", () => {
    const now: Record<string, number> = { "attributes.ST": 13, "attributes.DX": 12 };
    const plan = planTemplateRemoval(record, items(), (path) => now[path]);
    expect(plan.restore).toEqual({ "attributes.ST": 10, "attributes.DX": 10 });
    expect(plan.kept).toEqual([]);
    expect(needsReview(plan)).toBe(false);
  });

  it("leaves alone a number the player changed since", () => {
    const now: Record<string, number> = { "attributes.ST": 14, "attributes.DX": 12 };
    const plan = planTemplateRemoval(record, items(), (path) => now[path]);
    expect(plan.restore).toEqual({ "attributes.DX": 10 });
    expect(plan.kept).toEqual([{ path: "attributes.ST", value: 14 }]);
    expect(needsReview(plan)).toBe(true);
  });

  /**
   * Records made before the template wrote down what it set cannot tell a
   * player's change from their own, so they restore everything, as they
   * always did, and flag no edits.
   */
  it("restores everything for a record that kept no written values", () => {
    const old = { name: "Knight", itemIds: ["a"], previous: { "attributes.ST": 10 } };
    const plan = planTemplateRemoval(
      old,
      items({ id: "a", name: "Combat Reflexes", modifiedTime: 99999 }),
      () => 14,
    );
    expect(plan.restore).toEqual({ "attributes.ST": 10 });
    expect(plan.kept).toEqual([]);
    expect(plan.edited).toEqual([]);
  });
});
