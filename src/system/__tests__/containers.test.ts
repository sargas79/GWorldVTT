import { describe, expect, it } from "vitest";

import { canPutInside, capacityOf, containerIdOf, contentsOf, isContainer, nestRows } from "../containers.js";

/* Containers: gear kept inside a backpack, a pouch or a chest (GWorldVTT #864). */

const pack = { id: "pack", type: "equipment", system: { container: true, containerId: "" } };
const pouch = { id: "pouch", type: "equipment", system: { container: true, containerId: "pack" } };
const rope = { id: "rope", type: "equipment", system: { containerId: "pack" } };
const coins = { id: "coins", type: "equipment", system: { containerId: "pouch" } };
const vest = { id: "vest", type: "armor", system: { containerId: "" } };
const sword = { id: "sword", type: "equipment", system: { containerId: "rope" } };
const items = [pack, pouch, rope, coins, vest, sword];

describe("isContainer", () => {
  it("is equipment marked as a container", () => {
    expect(isContainer(pack)).toBe(true);
    expect(isContainer(rope)).toBe(false);
    expect(isContainer({ id: "x", type: "armor", system: { container: true } })).toBe(false);
  });
});

describe("containerIdOf", () => {
  it("gives the container an item is kept in", () => {
    expect(containerIdOf(items, "rope")).toBe("pack");
    expect(containerIdOf(items, "coins")).toBe("pouch");
    expect(containerIdOf(items, "pack")).toBeNull();
  });

  it("reads an item as loose where its container is not a container, or is gone", () => {
    expect(containerIdOf(items, "sword")).toBeNull();
    expect(containerIdOf([{ id: "a", type: "equipment", system: { containerId: "gone" } }], "a")).toBeNull();
  });

  it("reads a loop of containers as loose rather than hanging", () => {
    const loop = [
      { id: "a", type: "equipment", system: { container: true, containerId: "b" } },
      { id: "b", type: "equipment", system: { container: true, containerId: "a" } },
    ];
    expect(containerIdOf(loop, "a")).toBeNull();
    expect(contentsOf(loop, "a")).toEqual([]);
  });
});

describe("contentsOf", () => {
  it("finds everything inside, however deep", () => {
    expect(contentsOf(items, "pack").sort()).toEqual(["coins", "pouch", "rope"]);
    expect(contentsOf(items, "pouch")).toEqual(["coins"]);
    expect(contentsOf(items, "rope")).toEqual([]);
  });
});

describe("canPutInside", () => {
  it("puts gear, armour included, into a container", () => {
    expect(canPutInside(items, "vest", "pack")).toBe(true);
    expect(canPutInside(items, "rope", "pouch")).toBe(true);
  });

  it("does not put a container into itself or into something it holds", () => {
    expect(canPutInside(items, "pack", "pack")).toBe(false);
    expect(canPutInside(items, "pack", "pouch")).toBe(false);
  });

  it("puts nothing into what is not a container", () => {
    expect(canPutInside(items, "vest", "rope")).toBe(false);
  });
});

describe("nestRows", () => {
  const rows = [
    { id: "pack", weight: 3, cost: 60 },
    { id: "rope", weight: 1.5, cost: 1 },
    { id: "pouch", weight: 0.25, cost: 10 },
    { id: "coins", weight: 0.5, cost: 0 },
    { id: "vest", weight: 8, cost: 400 },
  ];
  const nested = nestRows(rows, (id) => containerIdOf(items, id));

  it("folds each row under its container and keeps the rest at the top in order", () => {
    expect(nested.map((r) => r.id)).toEqual(["pack", "vest"]);
    expect(nested[0]!.contents.map((r) => r.id)).toEqual(["rope", "pouch"]);
    expect(nested[0]!.contents[1]!.contents.map((r) => r.id)).toEqual(["coins"]);
  });

  it("adds up what is inside, however deep", () => {
    expect(nested[0]!.inside).toEqual({ weight: 2.25, cost: 11, count: 3 });
    expect(nested[1]!.inside).toEqual({ weight: 0, cost: 0, count: 0 });
  });

  it("leaves a row at the top where its container is not among the rows", () => {
    const loose = nestRows([{ id: "rope", weight: 1, cost: 1 }], (id) => containerIdOf(items, id));
    expect(loose.map((r) => r.id)).toEqual(["rope"]);
  });
});

describe("capacityOf", () => {
  it("says how full a container with a capacity is, and when it is over", () => {
    expect(capacityOf(10, 4.5)).toEqual({ used: 4.5, capacity: 10, over: false });
    expect(capacityOf(10, 12)).toEqual({ used: 12, capacity: 10, over: true });
  });

  it("gives nothing where there is no capacity", () => {
    expect(capacityOf(0, 5)).toBeNull();
  });
});
