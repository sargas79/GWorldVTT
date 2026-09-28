import { afterEach, describe, expect, it } from "vitest";

import { explosionLine } from "../malfunctions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
});

// The i18n stand-in answers with the key and its data, so the test can see which line the card would show.
function words(): void {
  globals.game = {
    i18n: {
      localize: (key: string) => key,
      format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}`,
    },
  };
}

const musket = { id: "musket", name: "Musket", system: { rangedModes: [{ explosive: false }] } };
const bazooka = { id: "bazooka", name: "Rocket launcher", system: { rangedModes: [{ explosive: true }] } };
const grenade = { id: "frag", name: "Fragmentation grenade", system: { rangedModes: [{ explosive: false }] } };
const actor = { system: { derived: { ranged: [{ itemId: "bazooka", modeIndex: 0, damage: "6d×2", damageType: "cr" }] } } };

// Revised p. 407: a TL3 or TL4 firearm blows up for 1d+2 [2d] cr ex; a grenade or a weapon that fires an
// explosive warhead does its usual explosive damage instead.
describe("what a blown-up weapon does to its gunner", () => {
  it("does the fixed damage for a plain firearm", () => {
    words();
    expect(explosionLine(musket, 0, 3)).toBe("GWORLD.Malfunction.Exploded");
    expect(explosionLine(musket, 0, 4)).toBe("GWORLD.Malfunction.Exploded");
  });

  it("does its usual explosive damage for a weapon that fires an explosive warhead", () => {
    words();
    expect(explosionLine(bazooka, 0, 4, actor)).toContain("GWORLD.Malfunction.ExplodedUsualWith");
    expect(explosionLine(bazooka, 0, 4, actor)).toContain("cr ex");
    expect(explosionLine(bazooka, 0, 4)).toBe("GWORLD.Malfunction.ExplodedUsual");
  });

  it("does its usual explosive damage for a grenade", () => {
    words();
    expect(explosionLine(grenade, 0, 4)).toBe("GWORLD.Malfunction.ExplodedUsual");
  });
});
