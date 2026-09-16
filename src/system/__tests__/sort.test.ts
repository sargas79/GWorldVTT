import { describe, expect, it } from "vitest";

import { byName, sortedByName, sortedByNameOf } from "../sort.js";

describe("byName", () => {
  it("orders by name, ignoring case", () => {
    const names = sortedByName([{ name: "stealth" }, { name: "Acrobatics" }, { name: "Brawling" }]).map((e) => e.name);
    expect(names).toEqual(["Acrobatics", "Brawling", "stealth"]);
  });

  it("reads digits as numbers, so level 10 follows level 2", () => {
    const names = sortedByName([{ name: "Acute Vision 10" }, { name: "Acute Vision 2" }]).map((e) => e.name);
    expect(names).toEqual(["Acute Vision 2", "Acute Vision 10"]);
  });

  it("keeps two entries of one name in a stable order by id", () => {
    const ids = sortedByName([{ name: "Enemy", id: "b" }, { name: "Enemy", id: "a" }]).map((e) => e.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("treats a missing name as blank rather than failing", () => {
    expect(byName({}, { name: "A" })).toBeLessThan(0);
  });

  it("leaves the list it was given as it was", () => {
    const list = [{ name: "B" }, { name: "A" }];
    sortedByName(list);
    expect(list.map((e) => e.name)).toEqual(["B", "A"]);
  });

  it("sorts wrapped entries by what they wrap", () => {
    const wrapped = [{ item: { name: "Leather Armor" } }, { item: { name: "Helmet" } }];
    expect(sortedByNameOf(wrapped, (w) => w.item).map((w) => w.item.name)).toEqual(["Helmet", "Leather Armor"]);
  });
});
