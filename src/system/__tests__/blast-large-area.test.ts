import { describe, expect, it } from "vitest";

import { resolveDamageAgainst, type IncomingDamage } from "../damage.js";

// A blast inside its victim (Campaigns p. 415) and a large-area injury
// (p. 400), worked out against worn armour (sargas79/GWorldVTT#595).

/** A soldier in a DR 6 vest and DR 4 helmet, with an unarmoured face, hands and feet. */
function soldier(extra: Record<string, unknown> = {}) {
  return {
    name: "Soldier",
    system: { hp: { value: 12, max: 12 }, fp: { value: 10, max: 10 }, attributes: { ST: 10 } },
    items: [
      { id: "vest", type: "armor", name: "Vest", system: { dr: 6, locations: ["torso", "vitals", "groin", "arm", "leg"], equipped: true, ...extra } },
      { id: "helmet", type: "armor", name: "Helmet", system: { dr: 4, locations: ["skull"], equipped: true } },
    ],
  };
}

const blow = (options: Partial<IncomingDamage> = {}) =>
  ({ basicDamage: 12, type: "cr", armorDivisor: 1, hitLocation: "torso", ...options }) as IncomingDamage;

describe("a blast inside its victim", () => {
  it("meets no DR at all and wounds the vitals at x3", () => {
    const result = resolveDamageAgainst(soldier(), blow({ basicDamage: 5, blastPlacement: "internal" }));
    expect(result.hitLocation).toBe("vitals");
    expect(result.effectiveDr).toBe(0);
    expect(result.penetrating).toBe(5);
    expect(result.woundingModifier).toBe(3);
    expect(result.injury).toBe(15);
    expect(result.blastPlacement).toBe("internal");
  });

  it("is not stepped down by Hardened armour, which it never meets", () => {
    const result = resolveDamageAgainst(soldier({ hardened: 2 }), blow({ basicDamage: 4, blastPlacement: "internal" }));
    expect(result.effectiveDr).toBe(0);
    expect(result.injury).toBe(12);
  });

  it("leaves a contact blast to the vest as usual", () => {
    const result = resolveDamageAgainst(soldier(), blow({ basicDamage: 18, blastPlacement: "contact" }));
    expect(result.hitLocation).toBe("torso");
    expect(result.effectiveDr).toBe(6);
    expect(result.injury).toBe(12);
    expect(result.blastPlacement).toBe("contact");
  });
});

describe("a large-area injury", () => {
  it("meets the average of the torso and the least protected location, as a torso hit", () => {
    // Torso 6, face 0: (6 + 0) / 2 = 3.
    const result = resolveDamageAgainst(soldier(), blow({ largeArea: true, hitLocation: "skull" }));
    expect(result.hitLocation).toBe("torso");
    expect(result.largeArea).toEqual({ dr: 3, leastProtected: "face" });
    expect(result.effectiveDr).toBe(3);
    expect(result.injury).toBe(9);
  });

  it("counts only the locations exposed to it", () => {
    // Torso 6 and a helmeted skull at 4 + 2: nothing below the torso.
    const result = resolveDamageAgainst(soldier(), blow({ largeArea: true, exposedLocations: ["torso", "skull", "arm"] }));
    expect(result.largeArea).toEqual({ dr: 6, leastProtected: "torso" });
    expect(result.effectiveDr).toBe(6);
  });

  it("is an ordinary hit on a single exposed location", () => {
    const result = resolveDamageAgainst(soldier(), blow({ largeArea: true, exposedLocations: ["face"] }));
    expect(result.hitLocation).toBe("face");
    expect(result.largeArea).toBeNull();
    expect(result.effectiveDr).toBe(0);
  });

  it("reads each location's DR against the attack's own type", () => {
    // Mail-like split: DR 6, but 4 against crushing, on every covered part.
    const mail = soldier({ drSplit: 4, drSplitAppliesTo: ["cr"] });
    const result = resolveDamageAgainst(mail, blow({ largeArea: true, exposedLocations: ["torso", "arm"] }));
    expect(result.largeArea?.dr).toBe(4);
  });

  it("changes nothing for a blow that is neither", () => {
    const result = resolveDamageAgainst(soldier(), blow());
    expect(result.largeArea).toBeNull();
    expect(result.blastPlacement).toBeNull();
    expect(result.effectiveDr).toBe(6);
  });
});
