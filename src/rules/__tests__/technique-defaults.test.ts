import { describe, expect, it } from "vitest";

import { resolveTechniqueDefaults } from "../skills.js";

/** Techniques bought off a defense or an attribute (sargas79/GWorldVTT#195). */
describe("resolveTechniqueDefaults", () => {
  it("buys a Parry-1 technique up from the Parry it cannot exceed", () => {
    // Judo 14 parries at 10, and a technique defaults to that Parry-1.
    const at = (levels: number) => resolveTechniqueDefaults({ defaults: [{ base: 10, modifier: -1 }], levels });
    expect(at(0)).toMatchObject({ level: 9, levels: 0, cappedByPrerequisite: false, base: 10 });
    expect(at(1)).toMatchObject({ level: 10, levels: 1 });
    expect(at(3)).toMatchObject({ level: 10, cappedByPrerequisite: true });
  });

  it("takes the better of ST-4 and Wrestling-2", () => {
    const strong = resolveTechniqueDefaults({
      defaults: [{ base: 16, modifier: -4 }, { base: 11, modifier: -2 }],
      levels: 0,
      maxRelativeToPrerequisite: 3,
    });
    expect(strong).toMatchObject({ level: 12, index: 0 });
    const skilled = resolveTechniqueDefaults({
      defaults: [{ base: 10, modifier: -4 }, { base: 14, modifier: -2 }],
      levels: 0,
      maxRelativeToPrerequisite: 3,
    });
    expect(skilled).toMatchObject({ level: 12, index: 1 });
  });

  it("caps each default against its own base: Neck Snap cannot exceed ST+3", () => {
    const snap = resolveTechniqueDefaults({ defaults: [{ base: 12, modifier: -4 }], levels: 10, maxRelativeToPrerequisite: 3 });
    expect(snap).toMatchObject({ level: 15, cappedByPrerequisite: true });
  });

  it("passes over a default the character lacks, and is null with none", () => {
    expect(resolveTechniqueDefaults({ defaults: [{ base: null, modifier: 0 }, { base: 12, modifier: -2 }], levels: 0 }))
      .toMatchObject({ level: 10, index: 1 });
    expect(resolveTechniqueDefaults({ defaults: [{ base: null, modifier: 0 }], levels: 2 })).toBeNull();
  });
});
