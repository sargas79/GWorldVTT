import { describe, expect, it } from "vitest";

import { coldModifier, heatModifier } from "../environment.js";
import { block, dodge, parry } from "../defenses.js";
import { spendFatigue } from "../fatigue.js";
import { fatigueRecovered } from "../recovery.js";
import { senseScores } from "../senses.js";
import {
  charismaInfluenceBonus, isSocialTrait, reactionSources, unconditionalReaction,
} from "../social.js";
import { isTalent, talentBonusFor, talentBonuses } from "../talents.js";
import {
  impairedAttacks, isReadTrait, lameCombatPenalty, lameMove, traitEffects,
} from "../trait-effects.js";
import { attackWithoutSight, darknessPenalty } from "../visibility.js";

describe("the trait table", () => {
  it("reads Enhanced Dodge, Parry and Block by name", () => {
    const t = traitEffects([
      { name: "Enhanced Dodge", levels: 1 },
      { name: "Enhanced Parry (All Parries)", levels: 2 },
      { name: "Enhanced Parry (Bare Hands)", levels: 1 },
      { name: "Enhanced Block", levels: 3 },
    ]);
    expect(t.enhancedDodge).toBe(1);
    expect(t.enhancedParry).toEqual({ all: 2, bareHands: 1 });
    expect(t.enhancedBlock).toBe(3);
  });

  it("reads Fit as a level of HT rolls, and Very Fit either way it is written", () => {
    expect(traitEffects([{ name: "Fit", levels: 1 }])).toMatchObject({
      htRolls: 1, fatigueRecoveryMultiplier: 2, fatigueLossHalved: false,
    });
    expect(traitEffects([{ name: "Fit", levels: 2 }])).toMatchObject({
      htRolls: 2, fatigueLossHalved: true,
    });
    expect(traitEffects([{ name: "Very Fit" }])).toMatchObject({ htRolls: 2, fatigueLossHalved: true });
    // Both together are Very Fit, not +3.
    expect(traitEffects([{ name: "Fit", levels: 1 }, { name: "Very Fit" }]).htRolls).toBe(2);
  });

  it("reads the eyes, capping Night Vision at nine", () => {
    const t = traitEffects([{ name: "Night Vision", levels: 12 }, { name: "Infravision" }]);
    expect(t.nightVision).toBe(9);
    expect(t.infravision).toBe(true);
    expect(t.darkVision).toBe(false);
  });

  it("reads the physical disadvantages", () => {
    const t = traitEffects([
      { name: "Bad Sight (Nearsighted)" },
      { name: "One Eye" },
      { name: "Hard of Hearing" },
      { name: "Lame (Crippled Legs)" },
      { name: "Lame (Legless)" },
      { name: "One Arm" },
      { name: "Acute Vision", levels: 2 },
    ]);
    expect(t.badSight).toBe("nearsighted");
    expect(t.oneEye).toBe(true);
    expect(t.hardOfHearing).toBe(true);
    // The worse lameness is the one you have.
    expect(t.lame).toBe("none");
    expect(t.oneArm).toBe(true);
    expect(t.acute.vision).toBe(2);
  });

  it("splits Temperature Tolerance unless a modifier says which side", () => {
    expect(traitEffects([{ name: "Temperature Tolerance", levels: 2 }]).temperatureTolerance)
      .toEqual({ coldF: 10, heatF: 10 });
    expect(traitEffects([{ name: "Temperature Tolerance", levels: 3, modifiers: ["Cold"] }]).temperatureTolerance)
      .toEqual({ coldF: 30, heatF: 0 });
  });

  it("counts talents and social traits as read", () => {
    expect(isReadTrait("Healer")).toBe(true);
    expect(isReadTrait("Charisma")).toBe(true);
    expect(isReadTrait("Social Stigma (Monster)")).toBe(true);
    expect(isReadTrait("Temperature Tolerance")).toBe(true);
    expect(isReadTrait("Bad Temper")).toBe(false);
  });
});

describe("lame legs", () => {
  it("leave half Basic Speed when crippled, 2 when missing, none when legless", () => {
    expect(lameMove(7, "crippled", 6.75)).toBe(3);
    expect(lameMove(7, "missing", 6.75)).toBe(2);
    expect(lameMove(1, "missing", 6.75)).toBe(1);
    expect(lameMove(7, "none", 6.75)).toBe(0);
    expect(lameMove(7, null, 6.75)).toBe(7);
  });

  it("cost -3 or -6 to every skill that needs legs", () => {
    expect(lameCombatPenalty("crippled")).toBe(-3);
    expect(lameCombatPenalty("missing")).toBe(-6);
    expect(lameCombatPenalty(null)).toBe(0);
  });
});

describe("what the eyes take off an attack", () => {
  it("is nearsighted -2 in melee, farsighted -3 in close combat, and One Eye -1, or -4 at range unaimed", () => {
    const near = { badSight: "nearsighted" as const, oneEye: true };
    expect(impairedAttacks(near, { ranged: false })).toEqual([
      { trait: "Bad Sight", value: -2 }, { trait: "One Eye", value: -1 },
    ]);
    expect(impairedAttacks(near, { ranged: true })).toEqual([{ trait: "One Eye", value: -4 }]);
    expect(impairedAttacks(near, { ranged: true, aimed: true })).toEqual([{ trait: "One Eye", value: -1 }]);
    const far = { badSight: "farsighted" as const, oneEye: false };
    expect(impairedAttacks(far, { ranged: false })).toEqual([]);
    expect(impairedAttacks(far, { ranged: false, closeCombat: true })).toEqual([{ trait: "Bad Sight", value: -3 }]);
  });
});

describe("enhanced defenses", () => {
  it("add their levels under their own label", () => {
    expect(dodge(6, { enhanced: 2 }).total).toBe(11);
    expect(parry(14, { enhanced: 1 }).total).toBe(11);
    expect(block(12, { enhanced: 1 }).modifiers).toEqual([{ label: "Enhanced defense", value: 1 }]);
  });
});

describe("Fit and fatigue", () => {
  it("recovers twice as fast", () => {
    expect(fatigueRecovered({ minutes: 30 })).toBe(3);
    expect(fatigueRecovered({ minutes: 30, multiplier: 2 })).toBe(6);
  });

  it("loses at half the rate, rounding up so a point is still a point", () => {
    expect(spendFatigue({ currentFp: 10, maxFp: 10, lost: 4, halved: true }).fpLost).toBe(2);
    expect(spendFatigue({ currentFp: 10, maxFp: 10, lost: 3, halved: true }).fpLost).toBe(2);
    expect(spendFatigue({ currentFp: 10, maxFp: 10, lost: 1, halved: true }).fpLost).toBe(1);
  });
});

describe("Temperature Tolerance", () => {
  it("moves the cold threshold down and the heat threshold up", () => {
    expect(coldModifier({ clothing: "winter", temperatureF: -20 })).toBe(-2);
    expect(coldModifier({ clothing: "winter", temperatureF: -20, toleranceF: 20 })).toBe(0);
    expect(heatModifier({ temperatureF: 110 })).toBe(-3);
    expect(heatModifier({ temperatureF: 110, toleranceF: 20 })).toBe(-1);
  });
});

describe("the dark", () => {
  it("costs a point a level, less Night Vision, and nothing to Dark Vision", () => {
    expect(darknessPenalty(5)).toBe(-5);
    expect(darknessPenalty(5, { nightVision: 3 })).toBe(-2);
    expect(darknessPenalty(5, { nightVision: 9 })).toBe(0);
    expect(darknessPenalty(5, { darkVision: true })).toBe(0);
    expect(darknessPenalty(5, { infravision: true })).toBe(0);
    expect(darknessPenalty(12)).toBe(-9);
  });

  it("is total darkness only to eyes that need light", () => {
    expect(attackWithoutSight({ sight: "blind" }).modifier).toBe(-10);
    expect(attackWithoutSight({ sight: "blind", eyes: { darkVision: true } }).modifier).toBe(0);
    expect(attackWithoutSight({ sight: "blind", eyes: { nightVision: 9 } }).modifier).toBe(-10);
    // Being blind is not darkness, and Dark Vision does nothing for it.
    expect(attackWithoutSight({ sight: "blind", accustomedToBlindness: true, eyes: { darkVision: true } }).modifier).toBe(-6);
    // An invisible foe is invisible whatever the eyes.
    expect(attackWithoutSight({ sight: "foeUnseen", eyes: { darkVision: true } }).modifier).toBe(-6);
  });
});

describe("senses", () => {
  it("are Perception, plus Acute Senses, less Hard of Hearing, and none for the deaf or blind", () => {
    const scores = senseScores(12, { acute: { vision: 2 }, hardOfHearing: true });
    expect(scores.map((s) => s.score)).toEqual([14, 8, 12, 12]);
    const missing = senseScores(12, { deafness: true, blindness: true });
    expect(missing[0]?.score).toBeNull();
    expect(missing[1]?.score).toBeNull();
    expect(missing[2]?.score).toBe(12);
  });
});

describe("talents", () => {
  it("give a level to every skill on the list, stacking where lists overlap", () => {
    const bonuses = talentBonuses([
      { name: "Business Acumen", levels: 2 },
      { name: "Mathematical Ability", levels: 1 },
      { name: "Voice" },
    ]);
    expect(talentBonusFor("Accounting", bonuses)).toBe(3);
    expect(talentBonusFor("Merchant", bonuses)).toBe(2);
    expect(talentBonusFor("Singing", bonuses)).toBe(2);
    expect(talentBonusFor("Broadsword", bonuses)).toBe(0);
  });

  it("match a specialty to its base skill", () => {
    const bonuses = talentBonuses([{ name: "Musical Ability", levels: 1 }]);
    expect(talentBonusFor("Musical Instrument (Flute)", bonuses)).toBe(1);
    expect(talentBonusFor("Survival (Desert)", bonuses)).toBe(0);
  });

  it("know which traits they are", () => {
    expect(isTalent("Outdoorsman")).toBe(true);
    expect(isTalent("Charisma")).toBe(true);
    expect(isTalent("Combat Reflexes")).toBe(false);
  });
});

describe("reaction modifiers from the sheet", () => {
  it("adds up what always applies and offers the rest", () => {
    const sources = reactionSources([
      { name: "Appearance", levels: 2 },
      { name: "Charisma", levels: 2 },
      { name: "Reputation", levels: 3 },
      { name: "Odious Personal Habit", levels: 1 },
      { name: "Social Stigma (Monster)" },
      { name: "Bad Temper", reactionModifier: -1 },
    ]);
    // Beautiful +2, Charisma +2, an Odious Personal Habit -1, a Monster -3, the typed -1.
    expect(unconditionalReaction(sources)).toBe(2 + 2 - 1 - 3 - 1);
    const attracted = sources.find((s) => s.condition === "attracted");
    expect(attracted?.value).toBe(2);
    expect(sources.find((s) => s.condition === "knowing")?.value).toBe(3);
  });

  it("has the book's figures for the ugly, caps reputations at four, and offers a talent", () => {
    expect(unconditionalReaction(reactionSources([{ name: "Appearance (Disadvantage)", levels: 5 }]))).toBe(-6);
    expect(unconditionalReaction(reactionSources([{ name: "Appearance", levels: 6 }]))).toBe(2);
    const capped = reactionSources([{ name: "Reputation", levels: 4 }, { name: "Reputation", levels: 2 }]);
    expect(capped.reduce((sum, s) => sum + s.value, 0)).toBe(4);
    expect(reactionSources([{ name: "Healer", levels: 2 }])).toEqual([{ label: "Healer", value: 2, condition: "impressed" }]);
    expect(reactionSources([{ name: "Social Stigma (Minority Group)" }])[0]).toMatchObject({ value: -2, condition: "ownKind" });
  });

  it("reads Charisma onto Influence rolls too", () => {
    expect(charismaInfluenceBonus([{ name: "Charisma", levels: 2 }, { name: "Voice" }])).toBe(2);
    expect(isSocialTrait("Voice")).toBe(true);
    expect(isSocialTrait("Fit")).toBe(false);
  });
});
