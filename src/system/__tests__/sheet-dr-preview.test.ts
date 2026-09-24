import { afterEach, describe, expect, it } from "vitest";

import { applyDamageToActor, previewBands, previewDrAt } from "../damage.js";
import { locationDrTooltip } from "../sheet-v2/location-dr.js";
import { DAMAGE_TYPES, type DamageType } from "../../rules/types.js";
import { noTraitEffects } from "../../rules/trait-effects.js";
import type { ArmorPiece } from "../../rules/armor.js";
import type { ArmorDrLine } from "../combat-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

/** Listeners on `gworld.armorDr`, called the way Foundry's Hooks.callAll would. */
function listen(listener: (context: any) => void): any[] {
  const seen: any[] = [];
  globals.Hooks = {
    callAll: (event: string, context: any) => {
      if (event !== "gworld.armorDr") return;
      seen.push(context);
      listener(context);
    },
  };
  return seen;
}

const breastplate: ArmorPiece = {
  id: "plate", name: "Breastplate", dr: 5, drSplit: null, drSplitAppliesTo: [], locations: ["torso", "vitals"],
};
const mail: ArmorPiece = {
  id: "mail", name: "Mail", dr: 4, drSplit: 2, drSplitAppliesTo: ["cr"], locations: [], flexible: true,
};
const actor = { items: [] as unknown[] };

/** The sheet's grouped figure for one location, as the character's data model works it out. */
function sheetAt(location: Parameters<typeof previewDrAt>[1], worn: ArmorPiece[], traits = noTraitEffects()) {
  return previewBands(previewDrAt(actor, location, traits, worn, DAMAGE_TYPES));
}

describe("the sheet's DR by location after gworld.armorDr (#743)", () => {
  it("matches what the pieces say when nothing listens", () => {
    expect(sheetAt("torso", [breastplate]).bands).toEqual([{ dr: 5, types: [...DAMAGE_TYPES] }]);
    // Mail's split still makes a band of its own.
    const torso = sheetAt("torso", [breastplate, mail]);
    expect(torso.splits).toBe(true);
    expect(torso.bands).toEqual([
      { dr: 9, types: DAMAGE_TYPES.filter((type) => type !== "cr") },
      { dr: 7, types: ["cr"] },
    ]);
    // The skull's bone is the location's, not a line, and toxic gets past it.
    const skull = sheetAt("skull", []);
    expect(skull.locationDr).toBe(2);
    expect(skull.lines).toEqual([]);
    expect(skull.bands.find((band) => band.types.includes("tox"))?.dr).toBe(0);
  });

  it("fires with preview true and no blow behind it, once per damage type", () => {
    const seen = listen(() => {});
    previewDrAt(actor, "torso", noTraitEffects(), [breastplate], DAMAGE_TYPES);
    expect(seen.map((context) => context.damageType)).toEqual([...DAMAGE_TYPES]);
    expect(seen[0]).toMatchObject({
      actor, item: null, mode: null, hitLocation: "torso", basicDamage: 0, ignoresDr: false, arc: null,
      fromBelow: false, calledShot: null, chink: false, addonLocation: null, options: {}, preview: true,
    });
    expect(seen[0].lines).toEqual([
      { label: "Breastplate", dr: 5, applies: true, forceField: false, flexible: false, hardened: 0, itemId: "plate", source: "armor" },
    ]);
  });

  it("shows what a listener leaves: a piece refused, one doubled against one kind of damage, a layer added", () => {
    listen((context) => {
      for (const line of context.lines as ArmorDrLine[]) {
        if (line.itemId === "mail") {
          line.applies = false;
          line.reason = "left side only";
        }
        if (line.itemId === "plate" && context.damageType === "burn") {
          line.dr *= 2;
          line.reason = "reflective";
        }
      }
      context.lines.push({ label: "Coating", dr: 1, applies: true, forceField: false, flexible: false, hardened: 0 });
    });
    const torso = sheetAt("torso", [breastplate, mail]);
    // Burning meets the plate doubled; everything else the plate and the coating.
    expect(torso.bands).toEqual([
      { dr: 11, types: ["burn"] },
      { dr: 6, types: DAMAGE_TYPES.filter((type) => type !== "burn") },
    ]);
    expect(torso.lines).toEqual([
      { label: "Breastplate", dr: 10, applies: true, reason: "reflective" },
      { label: "Mail", dr: 4, applies: false, reason: "left side only" },
      { label: "Coating", dr: 1, applies: true },
    ]);
  });

  it("gives each damage type its own lines, so one listener's change never reaches another type", () => {
    const traits = { ...noTraitEffects(), damageResistance: 3 };
    listen((context) => {
      // Natural DR divided against one kind of damage alone.
      if (context.damageType !== "burn") return;
      for (const line of context.lines as ArmorDrLine[]) if (line.source === "natural") line.dr = Math.floor(line.dr / 3);
    });
    const previews = previewDrAt(actor, "arm", traits, [], DAMAGE_TYPES);
    const at = (type: DamageType) => previews.find((preview) => preview.type === type)!.dr;
    expect(at("burn")).toBe(1);
    expect(at("cut")).toBe(3);
  });

  it("counts natural DR as the pipeline does: Damage Resistance leaves the eyes bare, Hooves armour the feet", () => {
    const traits = { ...noTraitEffects(), damageResistance: 2, footDr: 1 };
    expect(sheetAt("torso", [], traits).bands[0]?.dr).toBe(2);
    expect(sheetAt("eye", [], traits).bands[0]?.dr).toBe(0);
    expect(sheetAt("foot", [], traits).bands[0]?.dr).toBe(3);
  });

  it("agrees with the damage pipeline on the same listener", async () => {
    listen((context) => {
      for (const line of context.lines as ArmorDrLine[]) if (line.itemId === "plate" && context.damageType === "imp") line.dr = 1;
    });
    const target = {
      items: [{ id: "plate", type: "armor", name: "Breastplate", system: { equipped: true, dr: 5, locations: ["torso"] } }],
      isOwner: true,
      statuses: new Set<string>(),
      system: { hp: { value: 20, max: 20 }, fp: { value: 10, max: 10 }, aim: { turns: 0 }, derived: { status: "ok" } },
      update: async () => {},
      toggleStatusEffect: async () => {},
    };
    const shown = previewBands(previewDrAt(target, "torso", noTraitEffects(), [breastplate], DAMAGE_TYPES));
    expect(shown.bands.find((band) => band.types.includes("imp"))?.dr).toBe(1);
    const result = await applyDamageToActor(target, { basicDamage: 6, type: "imp", armorDivisor: 1, hitLocation: "torso" } as never);
    // What got through is what the sheet said would stop it: 6 - 1, doubled for impaling.
    expect(result?.injury).toBe(10);
  });
});

describe("the location's DR tooltip (#743)", () => {
  const format = (key: string, data: Record<string, string | number>) =>
    `${key.replace("GWORLD.SheetV2.", "")}[${Object.entries(data).map(([k, v]) => `${k}=${v}`).join(",")}]`;
  const escape = (text: string) => text.replace(/</g, "&lt;");

  it("names each line, a refused one and a listener's reason included, and the location's own DR", () => {
    const tooltip = locationDrTooltip({
      lines: [
        { label: "Helm", dr: 4, applies: true },
        { label: "Coif", dr: 2, applies: false, reason: "not against this" },
        { label: "Hat", dr: 1, applies: true, reason: "felt" },
      ],
      locationDr: 2,
    }, format, escape);
    expect(tooltip.split("<br>")).toEqual([
      "DrLine[label=Helm,dr=4]",
      "DrLineRefusedWhy[label=Coif,dr=2,reason=not against this]",
      "DrLineWhy[label=Hat,dr=1,reason=felt]",
      "DrLineLocation[dr=2]",
    ]);
  });

  it("escapes names and reasons, and is empty with nothing to name", () => {
    expect(locationDrTooltip({ lines: [{ label: "<b>", dr: 1, applies: true, reason: "<i>" }] }, format, escape))
      .toBe("DrLineWhy[label=&lt;b>,dr=1,reason=&lt;i>]");
    expect(locationDrTooltip({ lines: [], locationDr: 0 }, format, escape)).toBe("");
  });
});
