import { describe, expect, it } from "vitest";

import { canTargetFromArc, missByOneHitsTorso } from "../hit-locations.js";

describe("the Hit Location Table's notes (Campaigns p. 552)", () => {
  it("sends a miss by 1 at the eye, skull, face, groin, neck or vitals to the torso", () => {
    for (const location of ["eye", "skull", "face", "groin", "neck", "vitals"] as const) expect(missByOneHitsTorso(location)).toBe(true);
    for (const location of ["torso", "arm", "leg", "hand", "foot"] as const) expect(missByOneHitsTorso(location)).toBe(false);
  });

  it("lets the eye be aimed at from the front or sides only", () => {
    expect(canTargetFromArc("eye", "back")).toBe(false);
    expect(canTargetFromArc("eye", "side")).toBe(true);
    expect(canTargetFromArc("eye", null)).toBe(true);
    expect(canTargetFromArc("skull", "back")).toBe(true);
  });
});
