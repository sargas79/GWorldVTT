import { beforeEach, describe, expect, it, vi } from "vitest";

const rulesOn = new Set<string>();
vi.mock("../optional-rules.js", () => ({ isRuleOn: (key: string) => rulesOn.has(key) }));

import { perksOf, noPerks } from "../../rules/addendum-perks.js";
import { maximumLevelsOf, clampedLevels, steppedLevels } from "../advancement.js";
import { analyseAlternatives } from "../alternative-analysis.js";
import { legalityNote, permitFor } from "../legality.js";
import { nuisanceWaiver } from "../no-nuisance.js";
import { anyOffered, bondedItems, bonusOffers, offerFieldsHtml, readOffers, wildcardRelativeLevel } from "../roll-bonuses.js";
import { equipmentUseLines } from "../tech-level.js";

/**
 * The parts of #909 and #911 that #936 and #938 left undone, wired to the
 * sheet's data: the bond item flag, Permit on the gear's legality, Special
 * Exercises on a trait's maximum, No Nuisance Rolls, the Link check, and the
 * bonuses a roll offers (Basic Set Revised pp. 324-325, 328-329, 333).
 */

const globals = globalThis as Record<string, unknown>;

const perk = (name: string, specialty = "", levels = 1) => ({ name, specialty, levels });
const skill = (name: string, level: number, attribute = "DX", techLevel = "") => ({
  id: name, type: "skill", name, system: { attribute, techLevel, derived: { level } },
});

beforeEach(() => {
  rulesOn.clear();
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: Record<string, unknown>) => `${k}:${JSON.stringify(d)}`, has: () => true },
  };
  globals.foundry = { utils: { escapeHTML: (s: string) => s } };
});

function actorWith(perks: Array<ReturnType<typeof perk>>, items: any[] = [], derived: Record<string, unknown> = {}) {
  return {
    items,
    flags: {},
    system: { tl: 8, derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, will: 10, per: 10, perks: perksOf(perks), ...derived } },
  };
}

describe("Weapon Bond and Equipment Bond read the item's flag", () => {
  it("puts a +1 bond line on the flagged item, with no name in the perk", () => {
    const actor = actorWith([perk("Weapon Bond")]);
    const use = equipmentUseLines(actor, { name: "Family Katana", system: { bonded: true } }, "Broadsword");
    expect(use.lines.map((l) => [l.key, l.value])).toEqual([["bond", 1]]);
    expect(equipmentUseLines(actor, { name: "Other Sword", system: { bonded: false } }, "Broadsword").lines).toEqual([]);
  });

  it("gives nothing for a flagged item when no bond perk is held", () => {
    const actor = actorWith([]);
    expect(equipmentUseLines(actor, { name: "Katana", system: { bonded: true } }, "Broadsword").lines).toEqual([]);
  });

  it("covers as many flagged items as the perks held", () => {
    const flagged = (id: string) => ({ id, type: "equipment", name: id, system: { bonded: true } });
    const actor = actorWith([perk("Equipment Bond")], [flagged("a"), flagged("b")]);
    expect(bondedItems(actor).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("Equipment Bond in a tool-skill roll", () => {
  it("is offered, with the kit's TL and familiarity lines, for a technological skill", () => {
    rulesOn.add("techLevelModifiers");
    const kit = { id: "kit", type: "equipment", name: "Mechanic's Kit", system: { bonded: true, tl: "8" } };
    const actor = actorWith([perk("Equipment Bond")], [kit, skill("Mechanic/TL (Automobile)", 12, "IQ")]);
    const offers = bonusOffers(actor, { kind: "skill", skill: "Mechanic (Automobile)" });
    expect(offers.equipment).toHaveLength(1);
    expect(offers.equipment[0]!.lines.map((l) => l.key)).toContain("bond");
    expect(anyOffered(offers)).toBe(true);
    // No offer for a skill that isn't technological, or for a defense or an attack.
    expect(bonusOffers(actor, { kind: "skill", skill: "Diplomacy" }).equipment).toEqual([]);
    expect(bonusOffers(actor, { kind: "defense", skill: "Mechanic (Automobile)" }).equipment).toEqual([]);
  });
});

describe("Permit on the gear's legality", () => {
  it("makes gear below the Control Rating legal for its holder, without hiding its class", () => {
    rulesOn.add("legalityClass");
    const restricted = legalityNote(3, 4);
    expect(restricted).toMatchObject({ label: "LC3", status: "licensed", restricted: true, permitted: false });
    expect(legalityNote(3, 4, true)).toMatchObject({ label: "LC3", status: "licensed", restricted: false, permitted: true });
    // Open gear needs no permit, so holding one changes nothing.
    expect(legalityNote(4, 3, true)).toMatchObject({ restricted: false, permitted: false });
  });

  it("finds the permit for the piece by the name its specialty gives", () => {
    const actor = actorWith([perk("Permit", "Pistol")]);
    expect(permitFor(actor, { name: "Pistol, 9mm" })).toBe(true);
    expect(permitFor(actor, { name: "Rifle" })).toBe(false);
  });
});

describe("Special Exercises on a trait's maximum", () => {
  const trait = (perks: Array<ReturnType<typeof perk>>) => ({
    name: "Acute Hearing",
    actor: actorWith(perks),
    system: { levels: 4, maxLevels: 4, costTable: [] as number[] },
  });

  it("raises the printed maximum by a level for each perk that names the trait", () => {
    expect(maximumLevelsOf(trait([]))).toBe(4);
    expect(maximumLevelsOf(trait([perk("Special Exercises", "Acute Hearing")]))).toBe(5);
    expect(maximumLevelsOf(trait([perk("Special Exercises", "Acute Vision")]))).toBe(4);
  });

  it("lets the step buttons and a typed level go one further, and no more", () => {
    const held = trait([perk("Special Exercises", "Acute Hearing")]);
    expect(steppedLevels(held, "up")).toBe(5);
    expect(clampedLevels(held, 9)).toBe(5);
    const plain = trait([]);
    expect(steppedLevels(plain, "up")).toBe(4);
    expect(clampedLevels(plain, 9)).toBe(4);
  });

  it("leaves a trait with no printed maximum alone", () => {
    const open = { name: "Acute Hearing", actor: actorWith([perk("Special Exercises", "Acute Hearing")]), system: { levels: 2, maxLevels: 0, costTable: [] as number[] } };
    expect(maximumLevelsOf(open)).toBe(0);
  });
});

describe("No Nuisance Rolls for a task", () => {
  it("waives the task the perk names when the score is 16+", () => {
    const actor = actorWith([perk("No Nuisance Rolls", "Hiking")]);
    expect(nuisanceWaiver(actor, ["hiking", "travel"], [16])).toEqual({ task: "Hiking" });
    expect(nuisanceWaiver(actor, ["hiking", "travel"], [15])).toBeNull();
    expect(nuisanceWaiver(actor, ["job"], [18])).toBeNull();
    expect(nuisanceWaiver({ system: { derived: {} } }, ["hiking"], [18])).toBeNull();
    expect(noPerks().noNuisance).toEqual([]);
  });
});

describe("a Link between alternatives on the sheet", () => {
  const trait = (id: string, group: string, modifiers: Array<{ name: string; value: number }> = []) => ({
    id, type: "trait", system: { alternativeGroup: group, alternativeSlots: 1, totalPoints: 10, modifiers },
  });

  it("names the linked ability of a set", () => {
    const analysis = analyseAlternatives([trait("a", "laser"), trait("b", "laser", [{ name: "Link", value: 10 }]), trait("c", "")]);
    expect(analysis.linkConflicts).toEqual(["b"]);
  });

  it("finds none where the set is one ability", () => {
    expect(analyseAlternatives([trait("a", "laser", [{ name: "Link", value: 10 }])]).linkConflicts).toEqual([]);
  });
});

describe("the wildcard bonus in a roll's dialog", () => {
  const streetwise = () => skill("Streetwise-Everything!", 16, "IQ");
  const wildcard = () => ({ id: "wc", type: "skill", name: "Detective!", system: { attribute: "IQ", derived: { level: 15 } } });

  it("is offered only with the rule on, for a wildcard above its attribute", () => {
    const actor = actorWith([], [wildcard(), skill("Broadsword", 12)]);
    expect(wildcardRelativeLevel(actor, wildcard())).toBe(5);
    expect(bonusOffers(actor, { kind: "skill", skill: "Streetwise" }).wildcards).toEqual([]);
    rulesOn.add("wildcardBonus");
    expect(bonusOffers(actor, { kind: "skill", skill: "Streetwise" }).wildcards).toEqual([{ id: "wc", name: "Detective!", level: 5 }]);
    expect(streetwise().name).toBeTruthy();
  });

  it("does not offer a wildcard's bonus to its own roll", () => {
    rulesOn.add("wildcardBonus");
    const actor = actorWith([], [wildcard()]);
    expect(bonusOffers(actor, { kind: "skill", skill: "Detective!" }).wildcards).toEqual([]);
  });

  /** A dialog form with these fields answered. */
  function form(values: Record<string, string>, ticked: string[] = []) {
    return {
      querySelector: (selector: string) => {
        const name = /name="([^"]+)"/.exec(selector)?.[1] ?? "";
        return name in values ? { value: values[name], checked: values[name] === "on" } : null;
      },
      querySelectorAll: () => ticked.map((value) => ({ value })),
    } as unknown as HTMLElement;
  }

  it("lists the wildcard with the categories that fit the roll", () => {
    rulesOn.add("wildcardBonus");
    const actor = actorWith([], [wildcard()]);
    const context = { kind: "defense" as const };
    const html = offerFieldsHtml(bonusOffers(actor, context), context);
    expect(html).toContain('name="bonusWildcard"');
    expect(html).toContain('value="resist" selected');
    expect(html).not.toContain('value="accuracy"');
    expect(html).toContain("GWORLD.RollBonus.DefenseHalved");
  });

  it("adds the level as a bonus in the chosen category, halved for an active defense and for Accuracy", () => {
    rulesOn.add("wildcardBonus");
    const actor = actorWith([], [wildcard()]);
    const plain = { kind: "skill" as const };
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "noSkill", bonusHalve: "off" }), bonusOffers(actor, plain), plain))
      .toEqual([expect.objectContaining({ value: 5, key: "wildcard" })]);
    const defense = { kind: "defense" as const };
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "resist", bonusHalve: "off" }), bonusOffers(actor, defense), defense)[0]!.value).toBe(3);
    const attack = { kind: "attack" as const };
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "accuracy", bonusHalve: "off" }), bonusOffers(actor, attack), attack)[0]!.value).toBe(3);
    // The GM's own halving, and fewer than three dice.
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "reaction", bonusHalve: "on" }), bonusOffers(actor, plain), plain)[0]!.value).toBe(3);
    const initiative = { kind: "attribute" as const, dice: 1 };
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "noSkill", bonusHalve: "off" }), bonusOffers(actor, initiative), initiative)[0]!.value).toBe(3);
  });

  it("takes no bonus for a category the roll doesn't offer, and never two wildcards", () => {
    rulesOn.add("wildcardBonus");
    const actor = actorWith([], [wildcard(), { ...wildcard(), id: "wc2", name: "Sailor!" }]);
    const attack = { kind: "attack" as const };
    // Damage isn't a to-hit category: the roll falls back to Accuracy (halved).
    const lines = readOffers(form({ bonusWildcard: "wc", bonusCategory: "damage", bonusHalve: "off" }), bonusOffers(actor, attack), attack);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.value).toBe(3);
  });

  it("offers a damage roll the ST and damage category only, halved on the GM's tick", () => {
    rulesOn.add("wildcardBonus");
    const actor = actorWith([], [wildcard()]);
    const damage = { kind: "damage" as const };
    const html = offerFieldsHtml(bonusOffers(actor, damage), damage);
    expect(html).toContain('value="damage" selected');
    expect(html).not.toContain('value="noSkill"');
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "damage", bonusHalve: "off" }), bonusOffers(actor, damage), damage)[0]!.value).toBe(5);
    expect(readOffers(form({ bonusWildcard: "wc", bonusCategory: "damage", bonusHalve: "on" }), bonusOffers(actor, damage), damage)[0]!.value).toBe(3);
    expect(bonusOffers(actor, damage).talents).toEqual([]);
  });

  it("offers nothing when nothing applies", () => {
    expect(anyOffered(bonusOffers(actorWith([], [skill("Broadsword", 12)]), { kind: "skill", skill: "Broadsword" }))).toBe(false);
  });
});

describe("a Talent's alternative benefit in a roll's dialog", () => {
  const talent = (id: string, benefit: string, levels: number) => ({ id, type: "trait", name: `Talent ${id}`, system: { levels, talentBenefit: benefit } });

  it("offers its levels as a bonus, but not for a benefit of none or the reaction bonus", () => {
    const actor = actorWith([], [talent("a", "influence", 2), talent("b", "none", 3), talent("c", "", 3), talent("d", "feat", 1)]);
    const offers = bonusOffers(actor, { kind: "skill", skill: "Diplomacy" });
    expect(offers.talents.map((t) => [t.id, t.value])).toEqual([["a", 2], ["d", -3]]);
    expect(bonusOffers(actor, { kind: "attack" }).talents).toEqual([]);
  });

  it("adds the ticked Talents' lines to the roll", () => {
    const actor = actorWith([], [talent("a", "influence", 2), talent("d", "contests", 1)]);
    const context = { kind: "skill" as const, skill: "Diplomacy" };
    const root = {
      querySelector: () => null,
      querySelectorAll: () => [{ value: "a" }],
    } as unknown as HTMLElement;
    expect(readOffers(root, bonusOffers(actor, context), context)).toEqual([
      expect.objectContaining({ value: 2, key: "talentBenefit" }),
    ]);
  });
});
