import { describe, expect, it } from "vitest";

import { describePowers, unpoweredAbilities } from "../psionics.js";
import { powersOf } from "../../rules/powers.js";

const scores = { IQ: 12, will: 13, per: 11 };

/** What the sheet tells a player about powers (Characters pp. 254-255). */
describe("describePowers", () => {
  it("names the Talent that helps a power", () => {
    const [telepathy] = describePowers(
      powersOf([{ name: "Mind Reading", modifiers: ["Telepathy"] }]),
      scores,
    );
    expect(telepathy?.talentName).toBe("Telepathy Talent");
    expect(telepathy?.needsModifier).toBe(true);
  });

  it("tells a latent what the power could become", () => {
    const [latent] = describePowers(powersOf([{ name: "ESP Talent", levels: 2 }]), scores);
    expect(latent?.latent).toBe(true);
    expect(latent?.couldManifest.length).toBeGreaterThan(0);
  });

  it("lists nothing to become for a power already manifest", () => {
    const [held] = describePowers(powersOf([{ name: "Mind Reading", modifiers: ["Telepathy"] }]), scores);
    expect(held?.couldManifest).toEqual([]);
  });

  it("flags a Talent past level four as needing the GM's permission", () => {
    const [four] = describePowers(powersOf([{ name: "ESP Talent", levels: 4 }]), scores);
    const [five] = describePowers(powersOf([{ name: "ESP Talent", levels: 5 }]), scores);
    expect(four?.talentNeedsPermission).toBe(false);
    expect(five?.talentNeedsPermission).toBe(true);
    // "Most Talents cost 5 points/level."
    expect(five?.talentPoints).toBe(25);
  });

  // A book's own power, its Talent up to six levels as its entry allows,
  // and every roll to use it at the Talent's bonus.
  it("describes a book's own power, with the rolls to use it", () => {
    const [mysticism] = describePowers(
      powersOf([
        { name: "MYS: Turn Evil", power: "Mysticism" },
        { name: "Mysticism Talent", levels: 5, power: "Mysticism", powerTalent: true, maxLevels: 6 },
      ]),
      scores,
    );
    expect(mysticism).toMatchObject({
      psi: null,
      name: "Mysticism",
      talentName: "Mysticism Talent",
      needsModifier: false,
      couldManifest: [],
      talentNeedsPermission: false,
      talentCap: 6,
      rolls: { IQ: 17, Will: 18, Per: 16 },
    });
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

  it("leaves it alone when its entry names the power it belongs to", () => {
    expect(unpoweredAbilities([{ name: "Mind Reading", power: "Telepathy" }])).toEqual([]);
  });

  it("ignores advantages that are no power's ability", () => {
    expect(unpoweredAbilities([{ name: "Combat Reflexes" }, { name: "Toughness" }])).toEqual([]);
  });
});
