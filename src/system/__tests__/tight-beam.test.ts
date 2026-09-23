import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shotOptions } from "../called-shot.js";
import { resolveDamageAgainst, type IncomingDamage } from "../damage.js";
import { weaponFromDataset } from "../roll.js";
import { parseDamage } from "../../../tools/parse-gdf.mjs";

/** Tight-beam burning on modes and damage cards (sargas79/GWorldVTT#676). */

const globals = globalThis as Record<string, unknown>;
globals.game = { i18n: { localize: (key: string) => key } };

function target() {
  return {
    name: "Target",
    system: { hp: { value: 20, max: 20 }, fp: { value: 10, max: 10 }, attributes: { ST: 10 } },
    items: [],
  };
}

const blow = (options: Partial<IncomingDamage> = {}) =>
  ({ basicDamage: 6, type: "burn", armorDivisor: 1, hitLocation: "vitals", ...options }) as IncomingDamage;

describe("a tight-beam burn's called shots (Campaigns p. 399)", () => {
  it("may be aimed at the eye and the vitals, where another burn may not", () => {
    const beam = shotOptions("burn", true).map((o) => o.value);
    const torch = shotOptions("burn", false).map((o) => o.value);
    expect(beam).toEqual(expect.arrayContaining(["eye", "vitals", "chink:torso"]));
    expect(torch).not.toContain("eye");
    expect(torch).not.toContain("vitals");
  });

  it("is read off the row's data with the rest of the weapon", () => {
    expect(weaponFromDataset({}, { damageType: "burn", tightBeam: "1" }).tightBeam).toBe(true);
    expect(weaponFromDataset({}, { damageType: "burn", tightBeam: "" }).tightBeam).toBe(false);
  });
});

describe("a tight-beam burn landing", () => {
  it("wounds at x2 in the vitals, where another burn wounds at x1", () => {
    expect(resolveDamageAgainst(target(), blow({ tightBeam: true })).injury).toBe(12);
    expect(resolveDamageAgainst(target(), blow()).injury).toBe(6);
  });

  it("changes nothing elsewhere", () => {
    expect(resolveDamageAgainst(target(), blow({ tightBeam: true, hitLocation: "torso" })).injury).toBe(6);
  });
});

describe("the parser's tight beams", () => {
  it("reads \"tbb\" in a damage type, on a burn only", () => {
    expect(parseDamage("3d", "burn tbb")!.fields.tightBeam).toBe(true);
    expect(parseDamage("3d", "tbb burn sur")!.fields).toMatchObject({ damageType: "burn", surge: true, tightBeam: true });
    expect(parseDamage("3d", "burn")!.fields.tightBeam).toBeUndefined();
    expect(parseDamage("3d", "burn ex tbb")!.fields.tightBeam).toBeUndefined();
  });

  it("marks the Basic Set's beam weapons, and nothing else that burns", () => {
    const gear = JSON.parse(readFileSync(join(import.meta.dirname, "../../../packs-src/equipment/gear.json"), "utf-8")) as Array<{ name: string; system: { rangedModes?: Array<Record<string, unknown>> } }>;
    const burns = gear.flatMap((item) => (item.system.rangedModes ?? [])
      .filter((mode) => mode.damageType === "burn")
      .map((mode) => ({ name: item.name, tightBeam: mode.tightBeam === true })));
    const beams = burns.filter((b) => b.tightBeam).map((b) => b.name);
    expect(beams).toEqual([
      "Electrolaser Pistol", "Laser Pistol", "Blaster Pistol", "Omni-Blaster Pistol", "Electrolaser Carbine",
      "Laser Sniper Rifle", "Laser Rifle", "Blaster Rifle", "Omni-Blaster Rifle", "Heavy Blaster",
    ]);
    expect(burns.filter((b) => !b.tightBeam).map((b) => b.name)).toEqual(["Flamethrower", "Plasma Grenade"]);
  });
});
