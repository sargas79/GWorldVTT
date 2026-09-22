import { beforeEach, describe, expect, it, vi } from "vitest";

const rulesOn = new Set<string>();
vi.mock("../optional-rules.js", () => ({ isRuleOn: (key: string) => rulesOn.has(key) }));

import { equipmentUseLines, familiarityApplies } from "../tech-level.js";

const skill = (name: string, attribute = "DX", techLevel = "") => ({ type: "skill", name, system: { attribute, techLevel } });
const actor = (tl: number, skills: any[], familiarities?: string[]) => ({
  items: skills,
  system: { tl, ...(familiarities ? { familiarities } : {}) },
});
const gun = { name: "Assault Rifle", system: { tl: "8" } };

describe("equipmentUseLines", () => {
  beforeEach(() => {
    rulesOn.clear();
    rulesOn.add("techLevelModifiers");
    rulesOn.add("familiarity");
  });

  it("puts a TL line on a TL5 shooter's TL8 gun", () => {
    const use = equipmentUseLines(actor(5, [skill("Guns/TL (Rifle)")], ["Assault Rifle"]), gun, "Guns (Rifle)");
    expect(use.lines).toEqual([{ key: "techLevel", label: "TL8 equipment, TL5 skill", value: -3 }]);
    expect(use.tags).toEqual(["techLevel"]);
    expect(use.impossible).toBeNull();
  });

  it("adds -2 for a weapon the character is not familiar with", () => {
    const use = equipmentUseLines(actor(8, [skill("Guns/TL (Rifle)")], []), gun, "Guns (Rifle)");
    expect(use.lines).toEqual([{ key: "unfamiliar", label: "Unfamiliar: Assault Rifle", value: -2 }]);
    expect(use.tags).toEqual(["unfamiliar"]);
  });

  it("says nothing for a skill without /TL, or with the rules off", () => {
    expect(equipmentUseLines(actor(3, [skill("Broadsword")], []), { name: "Sword", system: { tl: "1" } }, "Broadsword").lines).toEqual([]);
    rulesOn.clear();
    expect(equipmentUseLines(actor(5, [skill("Guns/TL (Rifle)")], []), gun, "Guns (Rifle)").lines).toEqual([]);
  });

  it("refuses an IQ-based skill four TLs behind the gear", () => {
    const use = equipmentUseLines(actor(4, [skill("Electronics Operation/TL (Sensors)", "IQ")], ["Assault Rifle"]), gun, "Electronics Operation (Sensors)");
    expect(use.impossible).toBeTruthy();
  });

  it("reads the skill's own TL before the character's, and keeps no familiarity for an actor without the list", () => {
    const use = equipmentUseLines(actor(8, [skill("Guns/TL (Rifle)", "DX", "7")]), gun, "Guns (Rifle)");
    expect(use.lines.map((l) => l.value)).toEqual([-1]);
    expect(familiarityApplies(actor(8, [skill("Guns/TL (Rifle)")]), gun, "Guns (Rifle)")).toBe(false);
    expect(familiarityApplies(actor(8, [skill("Guns/TL (Rifle)")], []), gun, "Guns (Rifle)")).toBe(true);
  });
});
