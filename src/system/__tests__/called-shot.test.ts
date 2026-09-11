import { describe, expect, it } from "vitest";

import { resolveDamageAgainst, type IncomingDamage } from "../damage.js";
import { parseShot, shotOptions, UNAIMED } from "../called-shot.js";

const globals = globalThis as Record<string, unknown>;

/** `shotOptions` localizes each label, which needs the one Foundry global. */
globals.game = { i18n: { localize: (key: string) => key } };

function actor(dr: number) {
  return {
    name: "Target",
    system: { hp: { value: 12, max: 12 }, fp: { value: 10, max: 10 }, attributes: { ST: 10 } },
    items: [
      { type: "armor", system: { dr, locations: ["torso", "skull"], equipped: true } },
    ],
  };
}

const blow = (options: Partial<IncomingDamage> = {}) =>
  ({
    basicDamage: 10,
    type: "imp",
    armorDivisor: 1,
    hitLocation: "torso",
    ...options,
  }) as IncomingDamage;

describe("what an attack may be aimed at", () => {
  it("offers every location an impaling weapon can reach", () => {
    const options = shotOptions("imp");
    const values = options.map((o) => o.value);
    expect(values).toContain("torso");
    expect(values).toContain("skull");
    expect(values).toContain("vitals");
  });

  /** A swung axe cannot be put through somebody's eye. */
  it("leaves out what a crushing blow cannot target", () => {
    const values = shotOptions("cr").map((o) => o.value);
    expect(values).not.toContain("eye");
    expect(values).not.toContain("vitals");
  });

  it("carries each location's own penalty", () => {
    const options = shotOptions("imp");
    expect(options.find((o) => o.value === "torso")?.penalty).toBe(0);
    expect(options.find((o) => o.value === "skull")?.penalty).toBe(-7);
    expect(options.find((o) => o.value === "eye")?.penalty).toBe(-9);
  });

  /** "a piercing, impaling, or tight-beam burning attack" may go for a chink. */
  it("offers the chinks only to something that can slip into one", () => {
    expect(shotOptions("imp").map((o) => o.value)).toContain("chink:torso");
    expect(shotOptions("cut").map((o) => o.value)).not.toContain("chink:torso");
    expect(shotOptions("burn").map((o) => o.value)).not.toContain("chink:torso");
    expect(shotOptions("burn", true).map((o) => o.value)).toContain("chink:torso");
  });

  it("prices a chink at -8 on the torso and -10 elsewhere", () => {
    const options = shotOptions("pi");
    expect(options.find((o) => o.value === "chink:torso")?.penalty).toBe(-8);
    expect(options.find((o) => o.value === "chink:other")?.penalty).toBe(-10);
  });
});

describe("reading a chosen shot back", () => {
  it("treats the torso as no aim at all", () => {
    expect(parseShot(UNAIMED)).toBeNull();
    expect(parseShot("")).toBeNull();
  });

  it("reads an ordinary location", () => {
    expect(parseShot("skull")).toEqual({ hitLocation: "skull", chink: false });
  });

  it("reads a chink, and where it was aimed", () => {
    expect(parseShot("chink:torso")).toEqual({ hitLocation: "torso", chink: true });
    expect(parseShot("chink:other")).toEqual({ hitLocation: "skull", chink: true });
  });
});

describe("a blow that found a chink (Campaigns p. 400)", () => {
  /** "If you hit, halve DR." */
  it("meets half the armour", () => {
    const plain = resolveDamageAgainst(actor(8), blow());
    const chink = resolveDamageAgainst(actor(8), blow({ chink: true }));
    expect(plain.effectiveDr).toBe(8);
    expect(chink.effectiveDr).toBe(4);
  });

  it("rounds the halving down", () => {
    expect(resolveDamageAgainst(actor(7), blow({ chink: true })).effectiveDr).toBe(3);
  });

  /** "This is cumulative with any armor divisors." */
  it("halves what is left after an armour divisor", () => {
    const shot = blow({ chink: true, armorDivisor: 2 });
    // DR 8 halved by the chink is 4, and the divisor takes that to 2.
    expect(resolveDamageAgainst(actor(8), shot).effectiveDr).toBe(2);
  });

  /**
   * Natural DR is not armour with gaps in it -- "joints or weak points in a
   * suit of armor" -- so the skull's own DR is not halved by finding one.
   */
  it("does not halve the DR a body has of its own", () => {
    const skull = blow({ chink: true, hitLocation: "skull", type: "imp" });
    // DR 8 armour halved to 4, plus the skull's own 2, which the chink misses.
    expect(resolveDamageAgainst(actor(8), skull).effectiveDr).toBe(6);
  });
});
