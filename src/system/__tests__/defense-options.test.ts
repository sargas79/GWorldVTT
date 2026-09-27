import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { defendUpdate, increasedDefense, withDefenseOptions } from "../sheet-v2/defense-options.js";

/*
 * Retreat and Defend under Dodge, Parry and Block on the character sheet
 * (GWorldVTT #877): Retreat for a defense's next roll (Campaigns p. 377),
 * Defend as All-Out Defense (Increased Defense), +2 to one defense (p. 366).
 */

const card = (key: string, total: number, available = true) => ({ key, label: key, total, source: "", math: "", available });
const cards = [card("dodge", 9), card("parry", 10), card("block", 0, false)];

describe("withDefenseOptions", () => {
  it("gives each defense its retreat bonus: +3 Dodge, +1 Parry and Block, +3 Parry with a fencing weapon or Judo", () => {
    const plain = withDefenseOptions([card("dodge", 9), card("parry", 10), card("block", 11)], { defenses: { parry: { skillName: "Broadsword" } } }, new Set());
    expect(plain.map((c) => c.retreat.bonus)).toEqual([3, 1, 1]);
    const fencing = withDefenseOptions([card("parry", 12)], { defenses: { parry: { skillName: "Rapier", isFencing: true } } }, new Set());
    expect(fencing[0]!.retreat.bonus).toBe(3);
    const judo = withDefenseOptions([card("parry", 12)], { defenses: { parry: { skillName: "Judo" } } }, new Set());
    expect(judo[0]!.retreat.bonus).toBe(3);
  });

  it("shows a chosen retreat on the figure, only for a defense that can be rolled", () => {
    const shown = withDefenseOptions(cards, {}, new Set(["dodge", "block"]));
    expect(shown.map((c) => [c.key, c.shown, c.retreat.on])).toEqual([
      ["dodge", 12, true],
      ["parry", 10, false],
      ["block", 0, false],
    ]);
  });

  it("marks the defense All-Out Defense (Increased Defense) raises, and only that one", () => {
    const state = { maneuver: "allOutDefense", allOutDefenseOption: "increased", allOutDefenseTarget: "parry" };
    expect(withDefenseOptions(cards, state, new Set()).map((c) => c.defend.on)).toEqual([false, true, false]);
    // The +2 is already in the figure the character's data worked out.
    expect(withDefenseOptions(cards, state, new Set())[1]!.shown).toBe(10);
    expect(withDefenseOptions(cards, { ...state, allOutDefenseOption: "double" }, new Set()).some((c) => c.defend.on)).toBe(false);
  });
});

describe("increasedDefense", () => {
  it("reads the maneuver or the All-Out Defense condition", () => {
    expect(increasedDefense({ maneuver: "allOutDefense", allOutDefenseOption: "increased", allOutDefenseTarget: "dodge" })).toBe("dodge");
    expect(increasedDefense({ maneuver: "attack", allOutDefense: true, allOutDefenseOption: "increased", allOutDefenseTarget: "block" })).toBe("block");
    expect(increasedDefense({ maneuver: "attack", allOutDefenseOption: "increased", allOutDefenseTarget: "dodge" })).toBeNull();
  });
});

describe("defendUpdate", () => {
  it("makes the maneuver All-Out Defense, raising the defense chosen", () => {
    expect(defendUpdate({ maneuver: "attack", allOutDefenseOption: "double", allOutDefenseTarget: "dodge" }, "parry")).toEqual({
      "system.maneuver": "allOutDefense",
      "system.allOutDefenseOption": "increased",
      "system.allOutDefenseTarget": "parry",
    });
  });

  it("moves the +2 to another defense", () => {
    expect(defendUpdate({ maneuver: "allOutDefense", allOutDefenseOption: "increased", allOutDefenseTarget: "dodge" }, "block")).toMatchObject({
      "system.allOutDefenseTarget": "block",
    });
  });

  it("gives it up where that defense is already the one raised", () => {
    expect(defendUpdate({ maneuver: "allOutDefense", allOutDefenseOption: "increased", allOutDefenseTarget: "parry" }, "parry")).toEqual({
      "system.maneuver": "doNothing",
    });
    expect(defendUpdate({ maneuver: "attack", allOutDefense: true, allOutDefenseOption: "increased", allOutDefenseTarget: "parry" }, "parry")).toEqual({
      "system.conditions.allOutDefense": false,
    });
  });
});

describe("the sheet", () => {
  const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");
  const partial = read("templates", "actor", "v2", "defense-cards.hbs");

  it("draws the choices under every defense, on the Overview and the Combat tab", () => {
    expect(read("templates", "actor", "v2", "tab-overview.hbs")).toContain('{{> "gworld.v2.defenseCards"}}');
    expect(read("templates", "actor", "v2", "tab-combat.hbs")).toContain('{{> "gworld.v2.defenseCards"}}');
    expect(partial).toContain('data-action="v2Retreat"');
    expect(partial).toContain('data-action="v2Defend"');
  });

  it("rolls the defense at its own total, with the retreat as a line of its own", () => {
    expect(partial).toContain('data-action="v2RollDefense"');
    expect(partial).toContain('data-roll-target="{{def.total}}"');
    expect(partial).toContain('{{#if def.retreat.on}}data-retreat="{{def.retreat.bonus}}"{{/if}}');
    expect(read("src", "system", "roll.ts")).toContain("retreat: target.dataset.retreat,");
  });
});
