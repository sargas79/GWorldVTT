import { describe, expect, it } from "vitest";

import { CRITICAL_HIT, criticalEntry } from "../../../rules/criticals.js";
import { frightCheckResult } from "../../../rules/fright.js";
import { randomHitLocation } from "../../../rules/hit-locations.js";
import { reactionFor } from "../../../rules/reactions.js";
import { assembleScreen, buildSection, rollSpec, sectionDef } from "../assemble.js";
import { GM_SCREEN_TABS, SYSTEM_SECTIONS } from "../layout.js";
import type { GmRules, GmTable } from "../types.js";
import { englishContext } from "./i18n.js";

/** One section, built in English. */
function built(id: string) {
  const context = englishContext();
  const section = buildSection(sectionDef(id)!, context);
  expect(context.missing).toEqual([]);
  return section!;
}

function table(id: string, part = 0): GmTable {
  return built(id).parts[part]!.content as GmTable;
}

function rules(id: string, part = 0): GmRules {
  return built(id).parts[part]!.content as GmRules;
}

/** The cells of the row whose first cell is `first`. */
function row(t: GmTable, first: string): string[] {
  const found = t.rows.find((r) => r.cells[0] === first);
  expect(found, `a row ${first}`).toBeDefined();
  return found!.cells;
}

describe("the GM Screen's sections", () => {
  it("builds every section in English, with no string missing and nothing left unformatted", () => {
    const context = englishContext();
    const tabs = assembleScreen(context, { isGM: true });
    expect(context.missing).toEqual([]);
    expect(tabs.map((tab) => tab.id)).toEqual(GM_SCREEN_TABS.map((tab) => tab.id));
    const text = JSON.stringify(tabs);
    expect(text).not.toMatch(/GWORLD\./);
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const def of SYSTEM_SECTIONS.filter((d) => !d.slot)) {
      const section = tabs.flatMap((tab) => tab.sections).find((s) => s.id === def.id);
      expect(section?.parts.length, def.id).toBeGreaterThan(0);
      expect(section?.cite, def.id).toMatch(/^pp?\. B\d/);
    }
  });

  it("gives every id a journal page can name only once", () => {
    const tabs = assembleScreen(englishContext(), { isGM: true });
    const ids = tabs.flatMap((tab) => tab.sections.flatMap((s) => [s.id, ...s.parts.flatMap((p) => (p.id ? [p.id] : []))]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads the critical tables off the automation", () => {
    const hit = table("criticalHit");
    expect(hit.rows).toHaveLength(CRITICAL_HIT.length);
    expect(row(hit, "3")[1]).toBe("Triple basic damage");
    expect(row(hit, "9-11")[1]).toBe("Normal damage");
    expect(row(hit, "8")[1]).toContain("(GM decides)");
    expect(row(table("criticalMiss"), "3-4")[1]).toContain("weapon breaks");
    expect(row(table("unarmedCriticalMiss"), "3")[1]).toContain("knock yourself out");
  });

  it("lands every 3d roll on the row the automation's own lookup gives", () => {
    for (let total = 3; total <= 18; total += 1) {
      expect(rollSpec("criticalHit")!.rowFor(total)).toBe(String(criticalEntry("hit", total).rolls[0]));
      expect(rollSpec("criticalHeadBlow")!.rowFor(total)).toBe(String(criticalEntry("headBlow", total).rolls[0]));
      expect(rollSpec("criticalMiss")!.rowFor(total)).toBe(String(criticalEntry("miss", total).rolls[0]));
      expect(rollSpec("unarmedCriticalMiss")!.rowFor(total)).toBe(String(criticalEntry("missUnarmed", total).rolls[0]));
      expect(rollSpec("hitLocations")!.rowFor(total)).toBe(randomHitLocation(total).location);
    }
    for (let total = 4; total <= 45; total += 1) expect(rollSpec("frightChecks")!.rowFor(total)).toBe(String(frightCheckResult(total).from));
    for (let total = -5; total <= 25; total += 1) expect(rollSpec("reactions")!.rowFor(total)).toBe(reactionFor(total));
    // Every key a roll can land on is a row on the table.
    const keys = (id: string) => new Set((buildSection(sectionDef(id)!, englishContext())!.parts[0]!.content as GmTable).rows.map((r) => r.key));
    for (let total = 3; total <= 18; total += 1) {
      expect(keys("criticalHit").has(rollSpec("criticalHit")!.rowFor(total))).toBe(true);
      expect(keys("hitLocations").has(rollSpec("hitLocations")!.rowFor(total))).toBe(true);
    }
    expect(rollSpec("hitLocations")!.sideFor!("hand")).toBe(true);
    expect(rollSpec("hitLocations")!.sideFor!("arm")).toBe(false);
    expect(rollSpec("frightChecks")!.ask).toBe("margin");
    expect(rollSpec("reactions")!.ask).toBe("modifier");
    expect(rollSpec("damageTable")).toBeNull();
  });

  it("shows the hit locations with their rolls, penalties and wounding", () => {
    const locations = table("hitLocations");
    expect(locations.pinned).toBe(2);
    expect(locations.groups!.reduce((sum, g) => sum + g.span, 0)).toBe(locations.columns.length);
    const skull = row(locations, "3-4");
    expect(skull.slice(1, 4)).toEqual(["Skull", "-7", "2"]);
    expect(skull[4]).toBe("×4");
    expect(row(locations, "6-7, 13-14")[1]).toBe("Leg");
    const eye = locations.rows.find((r) => r.key === "eye")!.cells;
    expect(eye[0]).toBe("—");
    expect(eye[2]).toBe("-9");
    const neck = locations.rows.find((r) => r.key === "neck")!.cells;
    const cut = locations.columns.indexOf("cut");
    expect(neck[cut]).toBe("×2");
    expect(built("hitLocations").wide).toBe(true);
  });

  it("gives the attribute levels and the chances of success", () => {
    const levels = table("attributeSkillLevels", 0);
    expect(levels.rows.map((r) => r.cells[0])).toEqual(["6 or less", "7", "8-9", "10", "11-12", "13-14", "15+"]);
    const chances = table("attributeSkillLevels", 1);
    expect(row(chances, "10")[1]).toBe("50%");
    expect(row(chances, "16")[1]).toBe("98.1%");
  });

  it("works out the thrown damage and throwing distance rows", () => {
    const thrown = table("thrownDamage");
    expect(thrown.rows.map((r) => r.cells[1])).toEqual([
      "Thrust, -2 per die", "Thrust, -1 per die", "Thrust", "Thrust, +1 per die", "Thrust", "Thrust, -1 per two dice", "Thrust, -1 per die",
    ]);
    expect(row(table("throwingDistance"), "0.05")[1]).toBe("×3.5");
  });

  it("groups the criticals by effective skill", () => {
    expect(table("criticals").rows.map((r) => r.cells)).toEqual([
      ["3", "3-4", "13+"], ["4", "3-4", "14+"], ["5", "3-4", "15+"], ["6", "3-4", "16+"],
      ["7-14", "3-4", "17+"], ["15", "3-5", "17+"], ["16+", "3-6", "18"],
    ]);
  });

  it("lists the melee and defense modifiers with the automation's figures", () => {
    const melee = rules("meleeAttackModifiers").items.map((i) => `${i.term}: ${i.text}`).join("\n");
    expect(melee).toContain("All-Out Attack (Determined): +4.");
    expect(melee).toContain("Move and Attack: -4, and effective skill no higher than 9.");
    expect(melee).toContain("Rapid Strike: -6");
    expect(melee).toContain("-10 in total darkness (-6 if used to blindness)");
    const defense = rules("activeDefenseModifiers").items.map((i) => `${i.term}: ${i.text}`).join("\n");
    expect(defense).toContain("All-Out Defense (Increased): +2 to one defense.");
    expect(defense).toContain("Retreat: +3 to Dodge, +1 to Parry or Block; +3 to Parry");
    expect(defense).toContain("Combat Reflexes: +1");
    expect(defense).toContain("Encumbrance: -1 per level");
    expect(defense).toContain("Bare hands against a weapon: -3");
  });

  it("builds the Size and Speed/Range Table and the Damage Table", () => {
    const size = table("sizeSpeedRange");
    const tenYards = size.rows.find((r) => r.cells[1] === "10 yd")!.cells;
    expect(tenYards).toEqual(["+4", "10 yd", "-4"]);
    const oneYard = size.rows.find((r) => r.cells[1] === "1 yd")!.cells;
    expect(oneYard).toEqual(["-2", "1 yd", "0"]);
    const damage = table("damageTable");
    expect(row(damage, "13")).toEqual(["13", "1d", "2d-1"]);
    expect(row(damage, "100")).toEqual(["100", "11d", "13d"]);
    expect(damage.rows.some((r) => r.cells[0] === "41")).toBe(false);
  });

  it("builds the posture, maneuver, fright and reaction tables", () => {
    expect(row(table("posture"), "Lying Down")).toEqual(["Lying Down", "-4", "-3", "-2", "1 yard a second"]);
    const maneuvers = table("maneuvers");
    expect(row(maneuvers, "All-Out Attack").slice(1, 3)).toEqual(["Half Move", "None"]);
    expect(maneuvers.rows.find((r) => r.cells[0] === "Determined")!.depth).toBe(1);
    expect(row(table("frightChecks"), "40+")[1]).toContain("(GM decides)");
    expect(row(table("reactions"), "0 or less")[1]).toBe("Disastrous");
    expect(row(table("reactions"), "19+")[1]).toBe("Excellent");
  });

  it("draws the vision diagram from the arcs", () => {
    const diagram = built("visionHexDiagram").parts[0]!.content;
    expect(diagram.kind).toBe("diagram");
    if (diagram.kind !== "diagram") return;
    expect(diagram.svg.match(/gs-arc-front/g)).toHaveLength(3);
    expect(diagram.svg.match(/gs-arc-side/g)).toHaveLength(2);
    expect(diagram.svg.match(/gs-arc-back/g)).toHaveLength(1);
    expect(diagram.legend[2]!.text).toContain("Peripheral Vision -2");
  });
});

describe("what a player sees", () => {
  it("hides the tabs the GM keeps back and the empty add-on slots", () => {
    const gm = assembleScreen(englishContext(), { isGM: true, hiddenTabs: ["combat"] });
    expect(gm.some((tab) => tab.id === "combat")).toBe(true);
    expect(gm.find((tab) => tab.id === "checks")!.sections.find((s) => s.id === "aweConfusion")?.placeholder).toBe(true);
    const player = assembleScreen(englishContext(), { isGM: false, hiddenTabs: ["combat"] });
    expect(player.some((tab) => tab.id === "combat")).toBe(false);
    expect(player.find((tab) => tab.id === "checks")!.sections.some((s) => s.id === "aweConfusion")).toBe(false);
  });

  it("gives every section words to be found by", () => {
    const tabs = assembleScreen(englishContext(), { isGM: true });
    const stunned = tabs.flatMap((tab) => tab.sections).filter((s) => s.search.includes("stun"));
    expect(stunned.map((s) => s.id)).toEqual(expect.arrayContaining(["wounds", "activeDefenseModifiers", "frightChecks"]));
  });
});

