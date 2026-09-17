import { describe, expect, it } from "vitest";

import { templateFromItem } from "../character-templates.js";

/** A template names the book and page it is printed on, so the player knows where to read it. */
describe("a template's source reference", () => {
  const item = (reference: string, toTemplate?: () => object) => ({
    type: "template",
    name: "Techie",
    system: { kind: "character", statedCost: 400, entries: [], choices: [], features: [], tabooTraits: [], reference, ...(toTemplate ? { toTemplate } : {}) },
  });

  it("carries the item's reference", () => {
    expect(templateFromItem(item("Champions pp. 18-19"))?.reference).toBe("Champions pp. 18-19");
  });

  it("leaves it out when the item has none", () => {
    expect(templateFromItem(item(""))).not.toHaveProperty("reference");
  });
});
