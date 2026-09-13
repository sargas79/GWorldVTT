import { describe, expect, it } from "vitest";

import {
  BUILDINGS,
  COLLAPSE_BASE,
  SOUND_BUILDING_HT,
  STRUCTURES,
  WALLS,
  buildingHealth,
  buildingHitPoints,
  collapseDamage,
  collapseShelter,
  mustRollToStand,
  structure,
  structureState,
  tonsPerThousandFeet,
  trappedInRubble,
} from "../structures.js";

describe("how well a building is built (Campaigns p. 484)", () => {
  it("assumes twelve, and moves for shoddy work or a quake code", () => {
    expect(SOUND_BUILDING_HT).toBe(12);
    expect(buildingHealth("sound")).toBe(12);
    expect(buildingHealth("shoddy")).toBe(10);
    expect(buildingHealth("quakeResistant")).toBe(13);
  });
});

describe("what a structure's hit points say about it (p. 484)", () => {
  it("stands until it fails the roll that zero calls for", () => {
    // "Any building 'disabled' by going to 0 HP or less AND failing a HT roll."
    expect(structureState({ hp: 0, maxHp: 100 })).toBe("standing");
    expect(structureState({ hp: 0, maxHp: 100, failedDisabling: true })).toBe("breached");
    expect(structureState({ hp: -50, maxHp: 100, failedDisabling: true })).toBe("breached");
  });

  it("starts rolling to stay up at minus its own hit points", () => {
    expect(structureState({ hp: -100, maxHp: 100 })).toBe("failing");
    expect(mustRollToStand({ hp: -150, maxHp: 100 })).toBe(true);
    expect(mustRollToStand({ hp: -50, maxHp: 100 })).toBe(false);
  });

  it("comes down for certain at five times over", () => {
    expect(structureState({ hp: -500, maxHp: 100 })).toBe("collapsed");
    expect(structureState({ hp: -499, maxHp: 100 })).toBe("failing");
  });
});

describe("being inside one when it goes (p. 484)", () => {
  it("is three dice, and one more per storey overhead", () => {
    expect(COLLAPSE_BASE).toEqual({ dice: 3, adds: 0 });
    // A man on the top floor has nothing over his head.
    expect(collapseDamage(0)).toEqual({ dice: 3, adds: 0 });
    expect(collapseDamage(4)).toEqual({ dice: 7, adds: 0 });
  });

  it("shelters behind a beam, or gets away clean on a critical", () => {
    expect(collapseShelter({ success: false, criticalSuccess: false })).toBe("crushed");
    expect(collapseShelter({ success: true, criticalSuccess: false })).toBe("sheltered");
    expect(collapseShelter({ success: true, criticalSuccess: true })).toBe("unharmed");
  });

  it("leaves everybody but the lucky one in the rubble", () => {
    // "he receives DR equal to the building's exterior wall DR... but is still
    // trapped in the rubble. On a critical success, he is totally unharmed!"
    expect(trappedInRubble("sheltered")).toBe(true);
    expect(trappedInRubble("crushed")).toBe(true);
    expect(trappedInRubble("unharmed")).toBe(false);
  });
});

describe("the Structural Damage Table (p. 558)", () => {
  it("carries the walls and the buildings", () => {
    expect(WALLS).toHaveLength(25);
    expect(BUILDINGS).toHaveLength(6);
    expect(STRUCTURES).toHaveLength(31);
  });

  it("reads a row back by name", () => {
    expect(structure("Stone Keep (5'-thick walls)")).toMatchObject({ dr: 780, hp: 1200 });
    expect(structure('Wood (1" thick)')).toMatchObject({ dr: 1, hp: 23, fragile: "combustible" });
    expect(structure("nothing of the sort")).toBe(null);
  });

  it("marks the DR that wears away under repeated blows", () => {
    // The starred values: brick and stone wear, mild steel does not.
    expect(structure('Brick Wall (3" thick)')?.wearsAway).toBe(true);
    expect(structure('Steel, mild (1" thick)')?.wearsAway).toBe(false);
  });

  it("marks the brittle and the combustible, which are Fragile", () => {
    expect(structure('Glass, plate (1/5" thick)')?.fragile).toBe("brittle");
    expect(structure("Farmhouse (1,000 sf)")?.fragile).toBe("combustible");
    expect(structure("Pillbox (10'-thick concrete)")?.fragile).toBeUndefined();
  });
});

describe("working hit points out instead of looking them up (p. 558)", () => {
  it("weighs a building by its frame and its floor", () => {
    expect(tonsPerThousandFeet("wood")).toBe(50);
    expect(tonsPerThousandFeet("brick")).toBe(100);
    expect(tonsPerThousandFeet("stone")).toBe(150);
  });

  it("lands near the table's own farmhouse", () => {
    // 1,000 sf of wood frame is 50 tons; 100 x cube root of 50 is 368.
    // The table says 370, which is the same figure rounded for print.
    expect(buildingHitPoints({ squareFeet: 1000, frame: "wood" })).toBe(369);
  });
});
