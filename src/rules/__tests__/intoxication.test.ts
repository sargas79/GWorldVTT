import { describe, expect, it } from "vitest";

import {
  INTOXICATION_LEVELS,
  OVERDOSE_POISON,
  PINK_ELEPHANTS_MODIFIER,
  WITHDRAWAL_DAYS,
  WITHDRAWAL_MAX,
  drinkModifier,
  drinkResult,
  drinksBeforeRolling,
  hangover,
  hangoverModifier,
  mustRollForDrink,
  overdoseModifier,
  risksHangover,
  soberUp,
  soberingHours,
  stimulantCrash,
  stimulantDoseModifier,
  stimulantHours,
  withdrawalDay,
} from "../intoxication.js";

describe("how much you can take (Campaigns p. 439)", () => {
  /** "At the end of any hour during which you consume more than ST/4 drinks." */
  it("is a quarter of your strength in drinks an hour", () => {
    expect(drinksBeforeRolling(12)).toBe(3);
    expect(drinksBeforeRolling(10)).toBe(2.5);
  });

  it("only rolls once you go over", () => {
    expect(mustRollForDrink({ strength: 12, drinks: 3 })).toBe(false);
    expect(mustRollForDrink({ strength: 12, drinks: 4 })).toBe(true);
  });
});

describe("the hourly roll (Campaigns p. 439)", () => {
  /** "-1 per drink over ST/4 that hour." */
  it("is a point worse per drink over the line", () => {
    expect(drinkModifier({ strength: 12, drinks: 4 })).toBe(-1);
    expect(drinkModifier({ strength: 12, drinks: 6 })).toBe(-3);
  });

  it("is not a bonus for drinking less than you can hold", () => {
    expect(drinkModifier({ strength: 12, drinks: 1 })).toBe(0);
    expect(Object.is(drinkModifier({ strength: 12, drinks: 3 }), 0)).toBe(true);
  });

  /** "-2 on an empty stomach, or +1 if you have recently eaten." */
  it("prices what is in your stomach", () => {
    expect(drinkModifier({ strength: 12, drinks: 3, emptyStomach: true })).toBe(-2);
    expect(drinkModifier({ strength: 12, drinks: 3, recentlyEaten: true })).toBe(1);
  });

  /** "+2 for the Alcohol Tolerance perk, or -2 for the Alcohol Intolerance quirk." */
  it("prices what you are made of", () => {
    expect(drinkModifier({ strength: 12, drinks: 4, tolerance: true })).toBe(1);
    expect(drinkModifier({ strength: 12, drinks: 4, intolerance: true })).toBe(-3);
  });
});

describe("sliding down the track (Campaigns p. 439)", () => {
  it("runs sober to coma", () => {
    expect(INTOXICATION_LEVELS).toEqual(["sober", "tipsy", "drunk", "unconscious", "coma"]);
  });

  it("costs nothing at all on a success", () => {
    expect(drinkResult({ level: "tipsy", success: true, effectiveTarget: 10 })).toMatchObject({
      level: "tipsy",
      steps: 0,
    });
  });

  /** "Each failure shifts you one level." */
  it("is one step per failure", () => {
    expect(drinkResult({ level: "sober", success: false, effectiveTarget: 10 }).level).toBe("tipsy");
    expect(drinkResult({ level: "tipsy", success: false, effectiveTarget: 10 }).level).toBe("drunk");
  });

  /** "A critical failure drops you two levels: sober to drunk." */
  it("is two on a critical failure", () => {
    expect(
      drinkResult({ level: "sober", success: false, criticalFailure: true, effectiveTarget: 8 }),
    ).toMatchObject({ level: "drunk", steps: 2 });
  });

  /** "If penalties reduce your roll to 2 or less, critical failure means you
   * drop three levels!" */
  it("is three when the roll was hopeless to begin with", () => {
    expect(
      drinkResult({ level: "sober", success: false, criticalFailure: true, effectiveTarget: 2 }),
    ).toMatchObject({ level: "unconscious", steps: 3 });
  });

  it("stops at a coma however far it would go", () => {
    expect(
      drinkResult({ level: "drunk", success: false, criticalFailure: true, effectiveTarget: 1 }),
    ).toMatchObject({ level: "coma" });
  });

  /** "If you are drunk, make one additional HT+4 roll." */
  it("asks for pink elephants on reaching drunk", () => {
    expect(PINK_ELEPHANTS_MODIFIER).toBe(4);
    expect(drinkResult({ level: "tipsy", success: false, effectiveTarget: 10 }).pinkElephantsRoll)
      .toBe(true);
    expect(drinkResult({ level: "sober", success: false, effectiveTarget: 10 }).pinkElephantsRoll)
      .toBe(false);
  });

  /** "When a failed HT roll indicates that you would fall unconscious or into
   * a coma, make a second, unmodified HT roll." */
  it("asks for the Heaves before letting anybody hit the floor", () => {
    expect(drinkResult({ level: "drunk", success: false, effectiveTarget: 10 }).heavesRoll)
      .toBe(true);
  });
});

describe("the morning after (Campaigns p. 439)", () => {
  /** "After half as many hours as the total number of drinks you consumed." */
  it("takes half an hour per drink between rolls", () => {
    expect(soberingHours(8)).toBe(4);
  });

  it("comes back one step at a time", () => {
    expect(soberUp("drunk")).toBe("tipsy");
    expect(soberUp("tipsy")).toBe("sober");
    expect(soberUp("sober")).toBe("sober");
  });

  /** "Exception: to recover from a coma, you need medical help!" */
  it("does not walk out of a coma on its own", () => {
    expect(soberUp("coma")).toBe("coma");
  });

  /** "-2 if you're drunk or -4 if you're unconscious." */
  it("prices the hangover roll by how far you got", () => {
    expect(hangoverModifier("tipsy")).toBe(0);
    expect(hangoverModifier("drunk")).toBe(-2);
    expect(hangoverModifier("unconscious")).toBe(-4);
  });

  it("only threatens somebody who drank at all", () => {
    expect(risksHangover("sober")).toBe(false);
    expect(risksHangover("tipsy")).toBe(true);
  });

  /** "Kicks in 1d hours after... and lasts hours equal to your margin." */
  it("starts on the die and lasts the margin", () => {
    expect(hangover({ delayRoll: 4, marginOfFailure: 3 })).toEqual({ startsInHours: 4, hours: 3 });
  });
});

describe("stimulants (Campaigns p. 440)", () => {
  /** "These effects endure for (12 - HT) hours, minimum one hour." */
  it("wears off sooner the healthier you are", () => {
    expect(stimulantHours(10)).toBe(2);
    expect(stimulantHours(12)).toBe(1);
    expect(stimulantHours(14)).toBe(1);
  });

  /** "The user loses twice the FP he recovered." */
  it("charges double on the way down", () => {
    expect(stimulantCrash(2)).toBe(4);
  });

  /** "At a cumulative -1 per dose after the first." */
  it("is worse every dose after the first", () => {
    expect(Object.is(stimulantDoseModifier(1), 0)).toBe(true);
    expect(stimulantDoseModifier(2)).toBe(-1);
    expect(stimulantDoseModifier(4)).toBe(-3);
  });
});

describe("overdose (Campaigns p. 441)", () => {
  /** "Each doubling of dosage gives -2 to resistance rolls." */
  it("is two worse per doubling of the dose", () => {
    expect(Object.is(overdoseModifier({ doses: 1 }), 0)).toBe(true);
    expect(overdoseModifier({ doses: 2 })).toBe(-2);
    expect(overdoseModifier({ doses: 4 })).toBe(-4);
  });

  /** "Any alcohol at all counts as an extra dose." */
  it("counts a drink as a dose", () => {
    expect(overdoseModifier({ doses: 1, anyAlcohol: true })).toBe(-2);
  });

  /** "1 point of toxic damage, repeating at 15-minute intervals for 24 cycles." */
  it("becomes a poison of its own", () => {
    expect(OVERDOSE_POISON).toEqual({ intervalSeconds: 900, cycles: 24, damagePerCycle: 1 });
  });
});

describe("withdrawal (Campaigns p. 440)", () => {
  it("takes a fortnight of clear days, rolled at 13 at best", () => {
    expect(WITHDRAWAL_DAYS).toBe(14);
    expect(WITHDRAWAL_MAX).toBe(13);
  });

  it("banks a day for every success", () => {
    expect(withdrawalDay({ success: true, daysClear: 3, drugAvailable: true })).toMatchObject({
      daysClear: 4,
      withdrawn: false,
    });
  });

  it("is beaten on the fourteenth", () => {
    expect(withdrawalDay({ success: true, daysClear: 13, drugAvailable: false }).withdrawn)
      .toBe(true);
  });

  /** "If it is [available], you give in... you must restart from day one." */
  it("starts again when the drug is there to be had", () => {
    expect(withdrawalDay({ success: false, daysClear: 9, drugAvailable: true })).toMatchObject({
      daysClear: 0,
      gaveIn: true,
    });
  });

  /** "You take 1 HP of injury... but that day doesn't count." */
  it("costs a hit point and no progress when there is none to be had", () => {
    expect(withdrawalDay({ success: false, daysClear: 9, drugAvailable: false })).toMatchObject({
      daysClear: 9,
      hpLost: 1,
      quirk: false,
    });
  });

  /** "You don't take injury. Instead, you gain -1 point of drug-related quirks." */
  it("costs a quirk instead where the habit is in the head", () => {
    expect(
      withdrawalDay({ success: false, daysClear: 2, drugAvailable: false, psychological: true }),
    ).toMatchObject({ hpLost: 0, quirk: true });
  });
});
