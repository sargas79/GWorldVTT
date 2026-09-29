import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock("../optional-rules.js", () => ({ isRuleOn: (key: string) => state.on.has(key) }));

import {
  ammoToggleFor,
  ammunitionKindOf,
  gadgetDays,
  isAmmoTracked,
  toggleAmmoTracked,
} from "../simplified-resources.js";
import {
  evasiveDeclaration,
  rangedFeintLines,
  rapidStrikeCheck,
  restrictedDodgeRefusals,
  revisedRangedDefenseModifiers,
  rollPartialCoverage,
  simplifiedRange,
  withLargeObject,
  type RevisedRangedInput,
} from "../revised-ranged.js";
import { resolveDamageAgainst } from "../damage.js";
import { noInjuryTolerance } from "../../rules/injury-tolerance.js";
import { applyFrostbite, combatVisionNeed, combatVisionMemo, settleCombatVision } from "../vision-corrections.js";
import {
  concealmentField,
  concealmentRevealed,
  hideAttacker,
  isTrackingSkill,
  noteConcealedShot,
  trackingTerrainLines,
} from "../vision-prompts.js";

const globals = globalThis as Record<string, any>;

beforeEach(() => {
  state.on.clear();
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string, data?: Record<string, unknown>) => `${key} ${JSON.stringify(data ?? {})}` },
    settings: { get: () => "" },
  };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async () => ({})) } };
  globals.foundry = { utils: { randomID: () => "id1" } };
});

afterEach(() => {
  for (const key of ["game", "CONST", "ChatMessage", "foundry", "Roll", "fromUuid"]) delete globals[key];
});

/** An item with a flag store, as the settings and the toggle read it. */
function withFlags<T extends Record<string, any>>(base: T) {
  const flags: Record<string, any> = {};
  return Object.assign(base, {
    isOwner: true,
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => { flags[key] = value; }),
    unsetFlag: vi.fn(async (_scope: string, key: string) => { delete flags[key]; }),
  });
}

function box(system: Record<string, unknown>, id = "box1") {
  return { id, type: "equipment", name: "Rounds", system: { category: "ammunition", carried: true, quantity: 20, ammunition: { fits: "9mm" }, ...system } };
}

function rifle(actorItems: any[], mode: Record<string, unknown> = {}) {
  const actor = { type: "character", items: actorItems } as any;
  const item = withFlags({ id: "gun1", name: "Pistol, 9mm", type: "equipment", actor, system: { rangedModes: [{ damageType: "pi", loadedFrom: "", ...mode }], weaponClass: "" } });
  actor.items = [...actorItems, item];
  return item;
}

describe("Simplified Resources: the sheet toggle (Revised p. 578)", () => {
  it("shows no toggle while the switch is off, and counts every shot", () => {
    const gun = rifle([]);
    expect(ammoToggleFor(gun)).toBeNull();
    expect(isAmmoTracked(gun)).toBe(true);
  });

  it("shows the toggle for a character's ranged weapon, not counting until it is switched on", async () => {
    state.on.add("simplifiedResources");
    const gun = rifle([]);
    expect(ammoToggleFor(gun)).toEqual({ tracked: false, forced: false });
    expect(isAmmoTracked(gun)).toBe(false);
    expect(await toggleAmmoTracked(gun)).toBe(true);
    expect(isAmmoTracked(gun)).toBe(true);
    expect(ammoToggleFor(gun)).toEqual({ tracked: true, forced: false });
    expect(await toggleAmmoTracked(gun)).toBe(false);
    expect(isAmmoTracked(gun)).toBe(false);
  });

  it("has no toggle for a weapon with no ranged mode", () => {
    state.on.add("simplifiedResources");
    const actor = { type: "character", items: [] } as any;
    const club = withFlags({ id: "c", name: "Club", type: "equipment", actor, system: { rangedModes: [] } });
    expect(ammoToggleFor(club)).toBeNull();
  });
});

describe("Simplified Resources: ammunition that is always counted", () => {
  it("counts explosive rounds (a mode that does explosive damage)", () => {
    state.on.add("simplifiedResources");
    const gun = rifle([], { damageType: "ex" });
    expect(ammunitionKindOf(gun).explosive).toBe(true);
    expect(isAmmoTracked(gun)).toBe(true);
    expect(ammoToggleFor(gun)).toEqual({ tracked: true, forced: true });
  });

  it("counts fine ammunition, from the box the weapon was loaded from", async () => {
    state.on.add("simplifiedResources");
    const fine = box({ quality: "fine" }, "fineBox");
    const gun = rifle([fine], { loadedFrom: "fineBox" });
    expect(ammunitionKindOf(gun)).toEqual({ explosive: false, fine: true, magical: false });
    expect(isAmmoTracked(gun)).toBe(true);
    // Forced on, so the sheet's toggle changes nothing.
    expect(await toggleAmmoTracked(gun)).toBeNull();
  });

  it("counts magical ammunition, and fine ammunition among the boxes carried that fit", () => {
    state.on.add("simplifiedResources");
    const enchanted = box({ enchantments: [{ name: "Flaming" }] }, "magic");
    expect(ammunitionKindOf(rifle([enchanted], { loadedFrom: "magic" })).magical).toBe(true);
    const veryFine = box({ quality: "veryFine" }, "vf");
    expect(ammunitionKindOf(rifle([veryFine])).fine).toBe(true);
  });

  it("leaves ordinary rounds to the shortcut", () => {
    state.on.add("simplifiedResources");
    const gun = rifle([box({ quality: "good" })]);
    expect(ammunitionKindOf(gun)).toEqual({ explosive: false, fine: false, magical: false });
    expect(isAmmoTracked(gun)).toBe(false);
  });
});

describe("Simplified Resources: the days the gadgets run (Revised p. 578)", () => {
  const spare = (name: string, cost: number, weight: number, quantity = 1) => ({ type: "equipment", name, system: { carried: true, cost, weight, quantity } });

  it("is nothing while the switch is off", () => {
    expect(gadgetDays({ system: { tl: "8" }, items: [] })).toBeNull();
  });

  it("gives a day, and one more for each $3 and 1 lb of spare batteries at TL6-8", () => {
    state.on.add("simplifiedResources");
    const actor = { system: { tl: "8" }, items: [spare("Battery, Medium (M)", 5, 2, 2), spare("Rope", 5, 10)] };
    // Two medium batteries: $10 and 4 lb, so 3 by cost and 4 by weight: 3 more days.
    expect(gadgetDays(actor)).toMatchObject({ days: 4, tl: 8, spareCost: 10, spareWeight: 4 });
  });

  it("uses $10 and 0.5 lb at TL9+, and skips spares left in storage", () => {
    state.on.add("simplifiedResources");
    const stored = { type: "equipment", name: "Power Cell, C", system: { carried: false, cost: 10, weight: 0.5, quantity: 5 } };
    const actor = { system: { tl: "10" }, items: [spare("Power Cell, C", 10, 0.5, 2), stored] };
    expect(gadgetDays(actor)).toMatchObject({ days: 3, tl: 10 });
  });
});

const input = (over: Partial<RevisedRangedInput> = {}): RevisedRangedInput => ({
  contact: "none", allOutDetermined: false, braced: false, unresisting: false, strikeAround: 0, nonCombat: null,
  prediction: 0, rapidStrike: false, bandShift: "none", ...over,
});

describe("the optional ranged rules, wired (Revised pp. 576-577)", () => {
  it("shifts the band at Close and Short when the shooter moved", () => {
    expect(simplifiedRange(4)).toMatchObject({ band: "close", penalty: 0, shifted: false });
    expect(simplifiedRange(4, "farther")).toMatchObject({ band: "short", penalty: -3, shifted: true });
    expect(simplifiedRange(15, "closer")).toMatchObject({ band: "close", penalty: 0, shifted: true });
    expect(simplifiedRange(50, "closer")).toMatchObject({ band: "medium", penalty: -7, shifted: false });
  });

  it("puts a Prediction Shot's penalty on the target's Dodge alone", () => {
    expect(revisedRangedDefenseModifiers(input({ prediction: 2 }))).toEqual([
      { label: expect.stringContaining("Dodge"), value: -2, defenses: ["dodge"] },
    ]);
    expect(revisedRangedDefenseModifiers(input())).toEqual([]);
    expect(revisedRangedDefenseModifiers(null)).toEqual([]);
  });

  it("refuses a Ranged Rapid Strike with Dual-Weapon Attack, or that cannot split its RoF", () => {
    const rapid = input({ rapidStrike: true });
    expect(rapidStrikeCheck(input(), { rateOfFire: 3, shots: 2, dual: false })).toBeNull();
    expect(rapidStrikeCheck(rapid, { rateOfFire: 3, shots: 1, dual: false })).toEqual({ other: 2 });
    expect(rapidStrikeCheck(rapid, { rateOfFire: 3, shots: 1, dual: true })).toHaveProperty("refusal");
    expect(rapidStrikeCheck(rapid, { rateOfFire: 1, shots: 1, dual: false })).toHaveProperty("refusal");
    expect(rapidStrikeCheck(rapid, { rateOfFire: 3, shots: 3, dual: false })).toHaveProperty("refusal");
  });

  it("puts a ranged attack's range and size on a ranged Feint", () => {
    expect(rangedFeintLines(null)).toEqual([]);
    const lines = rangedFeintLines({ rangeYards: 20, targetSizeModifier: -2 });
    expect(lines.map((line) => line.value)).toEqual([-6, -2]);
    state.on.add("simplifiedRange");
    expect(rangedFeintLines({ rangeYards: 20, targetSizeModifier: 0 }).map((line) => line.value)).toEqual([-3]);
  });

  it("gives a vehicle item's SM to the large-target wounding while the switch is on", () => {
    const object = { ...noInjuryTolerance(), unliving: true };
    expect(withLargeObject(object, 8)).toBe(object);
    state.on.add("largeTargetDamage");
    expect(withLargeObject(object, 8).largeTargetSm).toBe(8);
    expect(withLargeObject(noInjuryTolerance(), 8).largeTargetSm).toBeUndefined();
  });
});

describe("Restricted Dodge Against Firearms, wired (Revised p. 577)", () => {
  function fighter(maneuver: string, chosen: Record<string, unknown>, uuid = "Actor.me") {
    return {
      uuid,
      system: { maneuver },
      getFlag: (_scope: string, key: string) => (key === "maneuverOptions" ? { gworld: chosen } : undefined),
    };
  }
  const gunman = { uuid: "Actor.gun" };

  it("does nothing while the switch is off, and for a shot that is not from a firearm", () => {
    expect(restrictedDodgeRefusals(fighter("move", {}), gunman, { skill: "Guns (Pistol)", delivery: "ranged" })).toBeNull();
    state.on.add("restrictedDodge");
    expect(restrictedDodgeRefusals(fighter("move", {}), gunman, { skill: "Bow", delivery: "ranged" })).toBeNull();
    expect(restrictedDodgeRefusals(fighter("move", {}), gunman, { skill: "Guns (Pistol)", delivery: "melee" })).toBeNull();
  });

  it("refuses the dodge from a shooter who was not declared", () => {
    state.on.add("restrictedDodge");
    const refusals = restrictedDodgeRefusals(fighter("move", {}), gunman, { skill: "Guns (Pistol)", delivery: "ranged" });
    expect(refusals?.dodge).toContain("RestrictedNoDodge");
    const other = restrictedDodgeRefusals(fighter("move", { evasiveMove: "Actor.other" }), gunman, { skill: "Guns (Pistol)", delivery: "ranged" });
    expect(other?.dodge).toContain("RestrictedNoDodge");
  });

  it("allows the declared shooter, and the acrobatic dodge only if it was rolled on the turn", () => {
    state.on.add("restrictedDodge");
    const declared = fighter("move", { evasiveMove: "Actor.gun" });
    expect(restrictedDodgeRefusals(declared, gunman, { skill: "Guns (Pistol)", delivery: "ranged" })).toEqual({
      dodge: null,
      acrobatic: expect.stringContaining("RestrictedNoAcrobatic"),
    });
    const acrobat = fighter("move", { evasiveMove: "Actor.gun", evasiveAcrobaticMove: true });
    expect(restrictedDodgeRefusals(acrobat, gunman, { skill: "Guns (Pistol)", delivery: "ranged" })).toEqual({ dodge: null, acrobatic: null });
  });

  it("reads the declaration of the maneuver held, not one left over from another", () => {
    const stale = fighter("attack", { evasiveMove: "Actor.gun" });
    expect(evasiveDeclaration(stale)).toMatchObject({ shooter: null, maneuver: "attack" });
    expect(evasiveDeclaration(fighter("allOutAttack", {}))).toBeNull();
    expect(evasiveDeclaration(fighter("moveAndAttack", { evasiveMoveAndAttack: "Actor.gun", evasiveDropMoveAndAttack: "true" })))
      .toMatchObject({ shooter: "Actor.gun", droppedProneAtEnd: true, acrobaticRolledOnTurn: false });
  });
});

describe("Hitting 'Em Where It Hurts: the coverage roll is the blow's (Revised p. 576)", () => {
  const armour = (coverage: number, dr = 4) => ({
    type: "armor",
    system: { dr, equipped: true, coverage, locations: ["torso"], drSplit: null, drSplitAppliesTo: [], hardened: 0, ablative: "none", drLost: 0 },
  });
  const wearer = (...pieces: any[]) => ({ name: "Target", system: { hp: { value: 20, max: 20 }, fp: { value: 10, max: 10 } }, items: pieces });
  const blow = (over: Record<string, unknown> = {}) => ({ basicDamage: 8, type: "cut", hitLocation: "torso", armorDivisor: 1, ...over }) as never;

  it("uses the roll it is given, so working the same blow out again gives the same answer", () => {
    state.on.add("partialCoverage");
    const target = wearer(armour(3));
    const protectedHit = resolveDamageAgainst(target, blow({ coverageRoll: 3 }));
    expect(protectedHit.coverage).toEqual({ coverage: 3, roll: 3, protected: true });
    expect(resolveDamageAgainst(target, blow({ coverageRoll: 3 })).injury).toBe(protectedHit.injury);
    const missed = resolveDamageAgainst(target, blow({ coverageRoll: 4 }));
    expect(missed.coverage).toEqual({ coverage: 3, roll: 4, protected: false });
    expect(missed.injury).toBeGreaterThan(protectedHit.injury);
  });

  it("makes no roll for full coverage, or with the switch off", () => {
    state.on.add("partialCoverage");
    expect(resolveDamageAgainst(wearer(armour(6)), blow()).coverage).toBeUndefined();
    state.on.clear();
    expect(resolveDamageAgainst(wearer(armour(3)), blow({ coverageRoll: 6 })).coverage).toBeUndefined();
  });

  it("adds the coverage of several pieces before rolling", () => {
    state.on.add("partialCoverage");
    const worn = [
      { coverage: 2, locations: ["torso"] },
      { coverage: 3, locations: ["torso"] },
    ];
    expect(rollPartialCoverage(worn, "torso", 5)).toMatchObject({ coverage: 5, protectedByRoll: true });
    expect(rollPartialCoverage(worn, "torso", 6)).toMatchObject({ coverage: 5, protectedByRoll: false });
  });
});

describe("Terrain Types Redux: the Tracking roll (Revised p. 573)", () => {
  function setting(terrain: string, surface = "firm") {
    globals.game.settings.get = (_scope: string, key: string) => (key === "currentTerrain" ? terrain : surface);
  }

  it("recognises Tracking under any specialty", () => {
    expect(isTrackingSkill("Tracking")).toBe(true);
    expect(isTrackingSkill("Tracking/TL4")).toBe(true);
    expect(isTrackingSkill("Trackingx")).toBe(false);
    expect(isTrackingSkill("Stealth")).toBe(false);
  });

  it("adds the terrain's modifier while the switch is on and a terrain is set", () => {
    setting("swampland");
    expect(trackingTerrainLines("Tracking")).toEqual([]);
    state.on.add("terrainTypes");
    expect(trackingTerrainLines("Tracking")).toEqual([{ label: expect.any(String), value: -4, key: "terrain" }]);
    expect(trackingTerrainLines("Stealth")).toEqual([]);
    setting("mountain");
    expect(trackingTerrainLines("Tracking")[0]?.value).toBe(-2);
    setting("plains");
    expect(trackingTerrainLines("Tracking")).toEqual([]);
    setting("");
    expect(trackingTerrainLines("Tracking")).toEqual([]);
  });

  it("gives 0 in loose sand without wind, and -4 with lots of wind or water", () => {
    state.on.add("terrainTypes");
    setting("desert", "loose");
    expect(trackingTerrainLines("Tracking")).toEqual([]);
    setting("desert", "looseWindy");
    expect(trackingTerrainLines("Tracking")[0]?.value).toBe(-4);
    setting("desert", "firm");
    expect(trackingTerrainLines("Tracking")[0]?.value).toBe(-2);
  });
});

describe("Frostbite that cripples (Revised p. 574)", () => {
  function frozen(hp = 10) {
    return withFlags({
      name: "Trapper",
      system: { hp: { value: hp, max: 10 }, fp: { value: 10, max: 10 } },
      items: [],
      update: vi.fn(async function (this: any, data: Record<string, number>) { this.system.hp.value = data["system.hp.value"] ?? this.system.hp.value; }),
    }) as any;
  }

  it("keeps a tally per location and cripples what passes its threshold", async () => {
    state.on.add("frostbite");
    const actor = frozen();
    await applyFrostbite(actor, 2);
    // 2 HP each on eight bare locations: nothing over a threshold yet.
    expect(actor.getFlag("gworld", "crippled")).toBeUndefined();
    expect(actor.getFlag("gworld", "frostbite")).toMatchObject({ hand: 2, foot: 2, arm: 2 });
    await applyFrostbite(actor, 2);
    // 4 HP on a hand or foot passes HP/3 (3.33): both are crippled, arms (HP/2 = 5) are not.
    const crippled = actor.getFlag("gworld", "crippled") as Array<{ location: string; label: string }>;
    expect(crippled.map((part) => part.location).sort()).toEqual(["foot", "hand"]);
    expect(crippled[0]?.label).toBe("GWORLD.Vision.FrostbiteLabel");
  });

  it("starts the tally over once the victim is back at full HP", async () => {
    state.on.add("frostbite");
    const actor = frozen();
    await applyFrostbite(actor, 2);
    actor.system.hp.value = 10;
    await applyFrostbite(actor, 2);
    expect(actor.getFlag("gworld", "frostbite")).toMatchObject({ hand: 2 });
  });

  it("does nothing with the switch off", async () => {
    const actor = frozen();
    expect(await applyFrostbite(actor, 2)).toBe(0);
    expect(actor.getFlag("gworld", "frostbite")).toBeUndefined();
  });
});

describe("Vision Rolls in Combat, in the defense flow (Revised pp. 574-575)", () => {
  function diceOf(faces: number[]) {
    return class {
      total = faces.reduce((a, b) => a + b, 0);
      dice = [{ results: faces.map((result) => ({ result })) }];
      async evaluate() { return this; }
    };
  }
  const defender = () => withFlags({ name: "Guard", system: { derived: { per: 12 } } }) as any;

  it("calls for a roll against a tiny attacker, and only with the switch on", async () => {
    expect(await combatVisionNeed({ attacker: { system: { sm: -12 } } })).toBeNull();
    state.on.add("visionRollsInCombat");
    expect(await combatVisionNeed({ attacker: { system: { sm: 0 } } })).toBeNull();
    const need = await combatVisionNeed({ attacker: { system: { sm: -12 } } });
    // SM -12 and +10 for plain sight: Vision-2.
    expect(need?.check).toEqual({ needsRoll: true, modifier: -2 });
    expect(need?.attackerSm).toBe(-12);
  });

  it("rolls once per attack and defender, keeps the answer, and a failure leaves no defense", async () => {
    state.on.add("visionRollsInCombat");
    const need = (await combatVisionNeed({ attacker: { system: { sm: -12 } } }))!;
    const guard = defender();
    // Per 12 - 2 = 10: a 6 sees it.
    globals.Roll = diceOf([1, 2, 3]);
    expect(await settleCombatVision(guard, "msg1", need)).toBe(true);
    expect(combatVisionMemo(guard, "msg1")).toBe(true);
    // Asked again, it is not rolled again, whatever the dice would say.
    globals.Roll = diceOf([6, 6, 6]);
    expect(await settleCombatVision(guard, "msg1", need)).toBe(true);

    const second = defender();
    expect(await settleCombatVision(second, "msg2", need)).toBe(false);
    expect(combatVisionMemo(second, "msg2")).toBe(false);
    expect(combatVisionMemo(second, "msg3")).toBeNull();
  });

  it("marks a shooter revealed by their first shot from concealment, until they hide again", async () => {
    const shooter = withFlags({ name: "Sniper", system: {} }) as any;
    expect(concealmentRevealed(shooter)).toBe(false);
    expect(await noteConcealedShot(shooter)).toEqual({ first: true });
    expect(concealmentRevealed(shooter)).toBe(true);
    expect(await noteConcealedShot(shooter)).toEqual({ first: false });
    await hideAttacker(shooter);
    expect(await noteConcealedShot(shooter)).toEqual({ first: true });
  });

  it("shows the box only with the switch on, and says when the shooter is already revealed", async () => {
    expect(concealmentField({})).toBe("");
    state.on.add("visionRollsInCombat");
    expect(concealmentField({})).toContain("GWORLD.Vision.Concealed<");
    const shooter = withFlags({ name: "Sniper", system: {} }) as any;
    await noteConcealedShot(shooter);
    expect(concealmentField(shooter)).toContain("GWORLD.Vision.ConcealedAgain");
  });

  it("rolls a later shot from concealment without the +10, whatever the SM and range", async () => {
    state.on.add("visionRollsInCombat");
    // An ordinary-sized shooter at short range calls for no roll in the open ...
    expect(await combatVisionNeed({ attacker: { system: { sm: 0 } } })).toBeNull();
    // ... but from concealment it is Vision at SM 0: Per 12, no bonus.
    const need = (await combatVisionNeed({ attacker: { system: { sm: 0 } }, concealed: true }))!;
    expect(need.check).toEqual({ needsRoll: true, modifier: 0 });
    expect(need.concealed).toBe(true);
    const guard = defender();
    globals.Roll = diceOf([4, 4, 4]);
    expect(await settleCombatVision(guard, "c1", need)).toBe(true);
    const other = defender();
    globals.Roll = diceOf([6, 6, 6]);
    expect(await settleCombatVision(other, "c2", need)).toBe(false);
  });
});
