import { describe, expect, it } from "vitest";

import {
  ANTIBIOTIC_BONUS,
  CONTAGION_MODIFIERS,
  GENERIC_DELAY_SECONDS,
  GENERIC_INTERVAL_SECONDS,
  INFECTION_BASE,
  antibioticsPreventInfection,
  contagionModifier,
  diseaseCycle,
  diseaseNamed,
  diseaseTreatmentBonus,
  infectionModifier,
  naturallyImmune,
} from "../disease.js";

describe("catching something (Campaigns p. 443)", () => {
  /** The whole table, which runs from +4 for staying away to -3 for a kiss. */
  it("prices how close you got", () => {
    expect(CONTAGION_MODIFIERS.avoided).toBe(4);
    expect(CONTAGION_MODIFIERS.enteredDwelling).toBe(3);
    expect(CONTAGION_MODIFIERS.spokeCloseQuarters).toBe(2);
    expect(CONTAGION_MODIFIERS.touchedBriefly).toBe(1);
    expect(CONTAGION_MODIFIERS.usedBelongings).toBe(0);
    expect(CONTAGION_MODIFIERS.ateCookedFlesh).toBe(0);
    expect(CONTAGION_MODIFIERS.ateRawFlesh).toBe(-1);
    expect(CONTAGION_MODIFIERS.prolongedContact).toBe(-2);
    expect(CONTAGION_MODIFIERS.intimateContact).toBe(-3);
  });

  /** "The least advantageous applicable modifier from this list." */
  it("takes the worst thing you did, not the sum of them", () => {
    expect(contagionModifier(["enteredDwelling", "intimateContact"])).toBe(-3);
    expect(contagionModifier(["touchedBriefly", "spokeCloseQuarters"])).toBe(1);
  });

  it("treats saying nothing as having kept away", () => {
    expect(contagionModifier([])).toBe(4);
  });
});

describe("a wound going bad (Campaigns p. 444)", () => {
  /** "must make a HT+3 roll" */
  it("starts three in the victim's favour", () => {
    expect(INFECTION_BASE).toBe(3);
    expect(infectionModifier(["clean"])).toBe(3);
  });

  /** "Dung or other infected matter in wound: -2." */
  it("is worse for what got into it", () => {
    expect(infectionModifier(["dung"])).toBe(1);
    expect(infectionModifier(["specialInfection"])).toBe(0);
  });

  /** "These modifiers are cumulative." */
  it("adds them up, unlike the contagion table", () => {
    expect(infectionModifier(["dung", "specialInfection"])).toBe(-2);
  });

  /** "Open wounds treated with antibiotics (TL6+) never become infected
   * except on a critically failed First Aid or Physician roll." */
  it("does not happen at all under antibiotics", () => {
    expect(antibioticsPreventInfection(6)).toBe(true);
    expect(antibioticsPreventInfection(8)).toBe(true);
    expect(antibioticsPreventInfection(5)).toBe(false);
    expect(antibioticsPreventInfection(8, true)).toBe(false);
  });
});

describe("treating an illness (Campaigns p. 443)", () => {
  /** "At TL6+, antibiotics give +3 to recover from most bacterial diseases." */
  it("gives three for antibiotics, once they exist", () => {
    expect(ANTIBIOTIC_BONUS).toBe(3);
    expect(diseaseTreatmentBonus({ techLevel: 7, antibiotics: true })).toBe(3);
    expect(diseaseTreatmentBonus({ techLevel: 4, antibiotics: true })).toBe(0);
  });

  /** "Some diseases are drug-resistant, in which case ordinary medicine gives
   * no bonus." */
  it("gives nothing for antibiotics against something that shrugs them off", () => {
    expect(diseaseTreatmentBonus({ techLevel: 8, antibiotics: true, drugResistant: true }))
      .toBe(0);
  });

  /** "A physician's care provides the same bonuses to recover from disease
   * that it gives to recover from injuries." */
  it("adds a physician's care to the drugs", () => {
    expect(diseaseTreatmentBonus({ techLevel: 7, antibiotics: true, physicianBonus: 2 })).toBe(5);
    expect(diseaseTreatmentBonus({ techLevel: 3, physicianBonus: 1 })).toBe(1);
  });

  it("gives nothing to somebody nobody is treating", () => {
    expect(diseaseTreatmentBonus({ techLevel: 8 })).toBe(0);
  });
});

describe("an illness running its course (Campaigns p. 442)", () => {
  const flu = diseaseNamed("Influenza")!;

  it("ends the moment the victim makes the roll", () => {
    expect(diseaseCycle({ disease: flu, resisted: true, cyclesSoFar: 2 })).toEqual({
      recovered: true,
      cyclesSuffered: 2,
      continues: false,
    });
  });

  it("costs another cycle on a failure", () => {
    expect(diseaseCycle({ disease: flu, resisted: false, cyclesSoFar: 0 })).toEqual({
      recovered: false,
      cyclesSuffered: 1,
      continues: true,
    });
  });

  it("burns itself out at the end of its cycles", () => {
    expect(diseaseCycle({ disease: flu, resisted: false, cyclesSoFar: 5 })).toMatchObject({
      cyclesSuffered: 6,
      continues: false,
    });
  });
});

describe("what the book's two illustrations come to (Campaigns p. 443)", () => {
  /** "a virulent but mild flu... 24-hour delay, HT-2, 1 point of toxic damage,
   * 12-hour interval, six cycles" */
  it("has the mild flu right", () => {
    expect(diseaseNamed("influenza")).toMatchObject({
      resistanceModifier: -2,
      delaySeconds: 86400,
      adds: 1,
      intervalSeconds: 43200,
      cycles: 6,
    });
  });

  /** "a slower but usually fatal disease: 72-hour delay, HT-5, 1 point of
   * toxic damage, daily interval, 30 cycles" */
  it("has the slow killer right", () => {
    expect(diseaseNamed("Wasting Sickness")).toMatchObject({
      resistanceModifier: -5,
      delaySeconds: 3 * 86400,
      intervalSeconds: 86400,
      cycles: 30,
    });
  });

  it("uses a day for a generic disease's incubation and interval", () => {
    expect(GENERIC_DELAY_SECONDS).toBe(86400);
    expect(GENERIC_INTERVAL_SECONDS).toBe(86400);
  });

  it("knows nothing of a disease somebody invented", () => {
    expect(diseaseNamed("Purple Shakes")).toBeNull();
  });
});

describe("natural immunity (Campaigns p. 443)", () => {
  /** "If the GM rolls a 3 or 4 for your first attempt to resist a disease,
   * you are immune!" */
  it("shows up on a 3 or a 4, the first time only", () => {
    expect(naturallyImmune(3)).toBe(true);
    expect(naturallyImmune(4)).toBe(true);
    expect(naturallyImmune(5)).toBe(false);
    expect(naturallyImmune(3, false)).toBe(false);
  });
});
