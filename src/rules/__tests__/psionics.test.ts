import { describe, expect, it } from "vitest";

import {
  POWER_MODIFIER,
  PSI_POWERS,
  TALENT_COST_PER_LEVEL,
  TALENT_LEVEL_CAP,
  abilitiesOf,
  hasPowerModifier,
  isAbilityOf,
  powerOfAbility,
  powerOfTalent,
  psionicsOf,
  talentBonus,
  talentCost,
  talentFor,
} from "../psionics.js";

describe("the six powers (Characters pp. 254-255)", () => {
  it("carries all six, once", () => {
    expect(PSI_POWERS).toEqual([
      "antipsi", "esp", "psychicHealing", "psychokinesis", "telepathy", "teleportation",
    ]);
  });

  it("gives five of them a Talent and Antipsi none", () => {
    expect(talentFor("telepathy")).toBe("Telepathy Talent");
    expect(talentFor("psychokinesis")).toBe("PK Talent");
    // "There is no Antipsi Talent, since most of these abilities work passively."
    expect(talentFor("antipsi")).toBe(null);
  });

  it("gives five of them a power modifier and Antipsi none", () => {
    expect(POWER_MODIFIER).toBe(-10);
    expect(hasPowerModifier("esp")).toBe(true);
    // "Power Modifier: None, since Antipsi abilities cannot themselves be blocked!"
    expect(hasPowerModifier("antipsi")).toBe(false);
  });

  it("knows which advantages each power is built from", () => {
    expect(abilitiesOf("teleportation")).toContain("Warp");
    expect(abilitiesOf("esp")).toContain("Clairsentience");
    expect(abilitiesOf("antipsi")).toContain("Psi Static");
    expect(isAbilityOf("telepathy", "mind reading")).toBe(true);
    expect(isAbilityOf("telepathy", "Warp")).toBe(false);
  });

  it("reads a Talent's name back to its power", () => {
    expect(powerOfTalent("ESP Talent")).toBe("esp");
    expect(powerOfTalent("psychic healing talent")).toBe("psychicHealing");
    expect(powerOfTalent("Language Talent")).toBe(null);
  });
});

describe("what makes an advantage a psi ability (p. 255)", () => {
  it("is the power modifier, not the advantage", () => {
    // "An advantage with a power modifier becomes part of the associated power."
    expect(powerOfAbility({ name: "Telekinesis", modifiers: ["PK power modifier"] }))
      .toBe("psychokinesis");
    // The same advantage with nothing on it is a superpower or a gadget.
    expect(powerOfAbility({ name: "Telekinesis" })).toBe(null);
    expect(powerOfAbility({ name: "Telekinesis", modifiers: ["Cosmic"] })).toBe(null);
  });

  it("reads a power modifier however it is written", () => {
    expect(powerOfAbility({ name: "Warp", modifiers: ["Teleportation"] })).toBe("teleportation");
    expect(powerOfAbility({ name: "Probe", modifiers: ["Telepathy (power modifier)"] }))
      .toBe("telepathy");
    expect(powerOfAbility({ name: "Healing", modifiers: ["Psychic Healing"] }))
      .toBe("psychicHealing");
  });

  it("knows Antipsi by its abilities, since it has no modifier to look for", () => {
    expect(powerOfAbility({ name: "Psi Static" })).toBe("antipsi");
    expect(powerOfAbility({ name: "Neutralize" })).toBe("antipsi");
  });
});

describe("the powers a character holds (pp. 254-255)", () => {
  it("holds a power for having one of its abilities", () => {
    // "You possess a given power if you have at least one of its psi abilities."
    const held = psionicsOf([
      { name: "Mind Reading", modifiers: ["Telepathy"] },
      { name: "Telepathy Talent", levels: 2 },
    ]);
    expect(held).toEqual([
      { power: "telepathy", abilities: ["Mind Reading"], talent: 2, latent: false },
    ]);
  });

  it("calls somebody with a Talent and nothing else a latent", () => {
    // "You may also start with a Talent and no psi abilities. In that case,
    // you are a 'latent'."
    const held = psionicsOf([{ name: "ESP Talent", levels: 3 }]);
    expect(held).toEqual([{ power: "esp", abilities: [], talent: 3, latent: true }]);
  });

  it("holds an ability with no Talent, which is raw power and no flair", () => {
    const held = psionicsOf([{ name: "Warp", modifiers: ["Teleportation"] }]);
    expect(held).toEqual([
      { power: "teleportation", abilities: ["Warp"], talent: 0, latent: false },
    ]);
  });

  it("says nothing about a character with no psi at all", () => {
    expect(psionicsOf([{ name: "Combat Reflexes" }, { name: "Telekinesis" }])).toEqual([]);
  });

  it("keeps several powers apart, in the book's order", () => {
    const held = psionicsOf([
      { name: "Warp", modifiers: ["Teleportation"] },
      { name: "Psi Static" },
      { name: "Clairsentience", modifiers: ["ESP"] },
    ]);
    expect(held.map((h) => h.power)).toEqual(["antipsi", "esp", "teleportation"]);
  });
});

describe("what a Talent is worth (p. 255)", () => {
  it("gives its levels to any roll using that power", () => {
    // "Telepathy Talent 2 would give +2 to use any of your telepathic abilities."
    const held = psionicsOf([
      { name: "Mind Reading", modifiers: ["Telepathy"] },
      { name: "Telepathy Talent", levels: 2 },
      { name: "Warp", modifiers: ["Teleportation"] },
    ]);
    expect(talentBonus(held, "telepathy")).toBe(2);
    expect(talentBonus(held, "teleportation")).toBe(0);
    expect(talentBonus(held, "esp")).toBe(0);
  });

  it("costs five a level, and needs permission past four", () => {
    expect(TALENT_COST_PER_LEVEL).toBe(5);
    expect(TALENT_LEVEL_CAP).toBe(4);
    expect(talentCost(2)).toEqual({ points: 10, needsPermission: false });
    expect(talentCost(4)).toEqual({ points: 20, needsPermission: false });
    expect(talentCost(5)).toEqual({ points: 25, needsPermission: true });
  });
});
