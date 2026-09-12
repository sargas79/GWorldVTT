import { describe, expect, it } from "vitest";

import { chosenSources, defaultSources, type PackSummary } from "../compendium-sources.js";

const packs: PackSummary[] = [
  { collection: "gworld.skills", label: "GURPS Skills", packageType: "system", packageName: "gworld", documentName: "Item" },
  { collection: "gworld.equipment", label: "GURPS Equipment", packageType: "system", packageName: "gworld", documentName: "Item" },
  { collection: "world.house-rules", label: "House rules", packageType: "world", packageName: "test-world", documentName: "Item" },
  { collection: "some-module.gear", label: "More gear", packageType: "module", packageName: "some-module", documentName: "Item" },
  { collection: "world.npcs", label: "NPCs", packageType: "world", packageName: "test-world", documentName: "Actor" },
];

describe("defaultSources", () => {
  it("is the system's own Item packs and nothing else", () => {
    expect(defaultSources(packs, "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });
});

describe("chosenSources", () => {
  it("honours a setting that names packs which exist", () => {
    expect(chosenSources(packs, ["world.house-rules", "gworld.skills"], "gworld")).toEqual([
      "world.house-rules",
      "gworld.skills",
    ]);
  });

  it("drops packs that are no longer there", () => {
    expect(chosenSources(packs, ["world.gone", "some-module.gear"], "gworld")).toEqual([
      "some-module.gear",
    ]);
  });

  /**
   * A world configured for a pack that has since been uninstalled must not
   * come up with an empty picker: the book is the fallback.
   */
  it("falls back to the system's packs when nothing named exists", () => {
    expect(chosenSources(packs, ["world.gone"], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
    expect(chosenSources(packs, [], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
    expect(chosenSources(packs, "nonsense", "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });

  it("never offers a pack of the wrong document type", () => {
    expect(chosenSources(packs, ["world.npcs"], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });
});
