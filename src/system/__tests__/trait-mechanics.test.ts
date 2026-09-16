import { describe, expect, it } from "vitest";

import { mechanicFallbackLabel, mechanicsOf } from "../sheet-v2/trait-mechanics.js";

describe("what a trait does that the system applies", () => {
  it("lists Combat Reflexes' bonuses", () => {
    const paths = mechanicsOf({ name: "Combat Reflexes" });
    expect(paths.find((m) => m.path === "activeDefense")?.value).toBe(1);
    expect(paths.find((m) => m.path === "frightCheck")?.value).toBe(2);
  });

  it("reads levels", () => {
    expect(mechanicsOf({ name: "Night Vision", levels: 5 }).find((m) => m.path === "nightVision")?.value).toBe(5);
  });

  it("names a switched-on effect without a value", () => {
    expect(mechanicsOf({ name: "Ambidexterity" })).toContainEqual({ path: "ambidextrous", value: null });
  });

  it("has nothing for a trait the system does not read", () => {
    expect(mechanicsOf({ name: "Code of Honor (Professional)" })).toEqual([]);
  });

  it("turns a path into words when no string names it", () => {
    expect(mechanicFallbackLabel("acute.vision")).toBe("Acute vision");
    expect(mechanicFallbackLabel("fatigueRecoveryMultiplier")).toBe("Fatigue recovery multiplier");
  });
});
