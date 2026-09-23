import { describe, expect, it, vi } from "vitest";

import { skillEncumbrancePenalty } from "../../rules/physical.js";
import { registerInfluenceSkill, registeredInfluenceSkills } from "../procedure-extensions.js";
import { createApi } from "../api.js";

/** Rolls modules can reach and tell apart (sargas79/GWorldVTT#691). */

describe("skillEncumbrancePenalty", () => {
  it("takes the encumbrance level off Stealth (Characters p. 222), and nothing else", () => {
    expect(skillEncumbrancePenalty("Stealth", 2)).toBe(-2);
    expect(skillEncumbrancePenalty("stealth", 0)).toBe(0);
    expect(skillEncumbrancePenalty("Stealth/TL8", 3)).toBe(-3);
    expect(skillEncumbrancePenalty("Streetwise", 3)).toBe(0);
    expect(skillEncumbrancePenalty("Stealth", Number.NaN)).toBe(0);
  });
});

describe("social.registerInfluenceSkill", () => {
  it("registers a skill once under <module>.<key>, refusing a malformed one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registerInfluenceSkill({ module: "test-mod", key: "merchant", skill: "Merchant" })).toBe("test-mod.merchant");
    expect(registerInfluenceSkill({ module: "test-mod", key: "merchant", skill: "Merchant" })).toBeNull();
    expect(registerInfluenceSkill({ module: "test-mod", key: "blank", skill: " " })).toBeNull();
    expect(registerInfluenceSkill({ module: "", key: "law", skill: "Law" })).toBeNull();
    warn.mockRestore();
  });

  it("offers it at the character's level, or its own, where it applies", () => {
    registerInfluenceSkill({ module: "test-mod", key: "law", skill: "Law", applies: (actor) => actor?.judge === true, level: () => 9 });
    const levels: Record<string, number> = { Merchant: 13 };
    const offered = registeredInfluenceSkills({ judge: true }, (name) => levels[name] ?? null);
    expect(offered).toEqual([
      { id: "test-mod.merchant", name: "Merchant", level: 13 },
      { id: "test-mod.law", name: "Law", level: 9 },
    ]);
    // Without the skill, and where the module says no, nothing.
    expect(registeredInfluenceSkills({}, () => null)).toEqual([]);
  });

  it("is on the API under social", () => {
    expect(createApi().social.registerInfluenceSkill).toBe(registerInfluenceSkill);
  });
});
