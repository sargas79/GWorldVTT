import { describe, expect, it } from "vitest";

import { jobRollLevel } from "../life.js";

/** What a job is rolled against: a skill the character has, or an attribute (Campaigns p. 516). */
describe("a job's roll", () => {
  const actor = {
    items: [{ type: "skill", name: "Merchant", system: { derived: { level: 12 } } }],
    system: { derived: { attributes: { ST: 10, DX: 11, IQ: 13, HT: 12 }, will: 14, per: 9 } },
  };

  it("reads a skill the character has", () => {
    expect(jobRollLevel(actor, "Merchant")).toBe(12);
    expect(jobRollLevel(actor, "Acting")).toBeNull();
  });

  it("reads an attribute, Will and Per included", () => {
    expect(jobRollLevel(actor, "IQ")).toBe(13);
    expect(jobRollLevel(actor, "Will")).toBe(14);
    expect(jobRollLevel(actor, "Per")).toBe(9);
  });
});
