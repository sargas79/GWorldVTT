import { describe, expect, it } from "vitest";

import { firstTechLevel, firstTlLabel, skillAvailableAt, TL_CARET } from "../skill-availability.js";

describe("Tech Level and Skill Availability (Revised p. 341)", () => {
  it("reads the book's rows by skill and specialty", () => {
    expect(firstTechLevel("Accounting")).toBe(1);
    expect(firstTechLevel("Alchemy/TL")).toBe(2);
    expect(firstTechLevel("Armoury/TL (Small Arms)")).toBe(3);
    expect(firstTechLevel("Engineer/TL (Small Arms)")).toBe(4);
    expect(firstTechLevel("Physics/TL")).toBe(5);
    expect(firstTechLevel("Computer Programming/TL")).toBe(7);
    expect(firstTechLevel("Computer Hacking/TL")).toBe(8);
    expect(firstTechLevel("Armoury/TL (Battlesuits)")).toBe(9);
    expect(firstTechLevel("Armoury/TL (Force Shields)")).toBe(TL_CARET);
  });

  it("shares Electronics Operation/Repair rows between both skills", () => {
    expect(firstTechLevel("Electronics Operation/TL (Communications)")).toBe(5);
    expect(firstTechLevel("Electronics Repair/TL (Communications)")).toBe(5);
    expect(firstTechLevel("Electronics Operation/TL (Sonar)")).toBe(7);
    expect(firstTechLevel("Electronics Repair/TL (Computers)")).toBe(7);
    expect(firstTechLevel("Electronics Operation/TL (Computers)")).toBeNull();
    expect(firstTechLevel("Electronics Operation/TL (Temporal)")).toBe(TL_CARET);
  });

  it("takes the specialty over the whole skill, and the TL0 exceptions", () => {
    expect(firstTechLevel("Astronomy/TL")).toBe(1);
    expect(firstTechLevel("Astronomy/TL (Observational)")).toBe(0);
    expect(firstTechLevel("Surgery/TL")).toBe(1);
    expect(firstTechLevel("Surgery/TL (Trauma Surgery)")).toBe(0);
    expect(firstTechLevel("Biology/TL (Earthlike)")).toBe(5);
  });

  it("says nothing of a skill the list does not cover", () => {
    expect(firstTechLevel("Broadsword")).toBeNull();
    expect(firstTechLevel("Mechanic/TL (Nanomachines)")).toBeNull();
    expect(firstTechLevel("Engineer/TL (Vehicle)")).toBeNull();
  });

  it("prefers a recorded first TL", () => {
    expect(firstTechLevel("Broadsword", 3)).toBe(3);
    expect(firstTechLevel("Physics/TL", 6)).toBe(6);
  });

  it("warns only when the TL is known and below the first", () => {
    expect(skillAvailableAt("Physics/TL", 4)).toBe(false);
    expect(skillAvailableAt("Physics/TL", 5)).toBe(true);
    expect(skillAvailableAt("Physics/TL", null)).toBe(true);
    expect(skillAvailableAt("Broadsword", 0)).toBe(true);
    expect(skillAvailableAt("Armoury/TL (Force Shields)", 11)).toBe(false);
  });

  it("labels TL^", () => {
    expect(firstTlLabel(7)).toBe("TL7");
    expect(firstTlLabel(TL_CARET)).toBe("TL^");
  });
});
