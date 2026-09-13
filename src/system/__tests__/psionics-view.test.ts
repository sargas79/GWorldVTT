import { describe, expect, it } from "vitest";

import { describePowers, unpoweredAbilities } from "../psionics.js";
import { psionicsOf } from "../../rules/psionics.js";

/** What the sheet tells a player about psionic powers (Characters pp. 254-255). */
describe("describePowers", () => {
  it("names the Talent that helps a power", () => {
    const [telepathy] = describePowers(
      psionicsOf([{ name: "Mind Reading", modifiers: ["Telepathy"] }]),
    );
    expect(telepathy?.talentName).toBe("Telepathy Talent");
    expect(telepathy?.needsModifier).toBe(true);
  });

  it("tells a latent what the power could become", () => {
    const [latent] = describePowers(psionicsOf([{ name: "ESP Talent", levels: 2 }]));
    expect(latent?.latent).toBe(true);
    expect(latent?.couldManifest.length).toBeGreaterThan(0);
  });

  it("lists nothing to become for a power already manifest", () => {
    const [held] = describePowers(psionicsOf([{ name: "Mind Reading", modifiers: ["Telepathy"] }]));
    expect(held?.couldManifest).toEqual([]);
  });

  it("flags a Talent past level four as needing the GM's permission", () => {
    const [four] = describePowers(psionicsOf([{ name: "ESP Talent", levels: 4 }]));
    const [five] = describePowers(psionicsOf([{ name: "ESP Talent", levels: 5 }]));
    expect(four?.talentNeedsPermission).toBe(false);
    expect(five?.talentNeedsPermission).toBe(true);
    // "Most Talents cost 5 points/level."
    expect(five?.talentPoints).toBe(25);
  });
});

describe("unpoweredAbilities", () => {
  it("catches a psi ability bought without its power modifier", () => {
    expect(unpoweredAbilities([{ name: "Mind Reading" }])).toEqual([
      { trait: "Mind Reading", power: "telepathy" },
    ]);
  });

  it("leaves the same ability alone once the modifier is on it", () => {
    expect(unpoweredAbilities([{ name: "Mind Reading", modifiers: ["Telepathy"] }])).toEqual([]);
  });

  it("ignores advantages that are no power's ability", () => {
    expect(unpoweredAbilities([{ name: "Combat Reflexes" }, { name: "Toughness" }])).toEqual([]);
  });
});
