import { describe, expect, it } from "vitest";

import {
  POISON_EXAMPLES,
  SYMPTOM_THRESHOLDS,
  delayForSize,
  dosage,
  effectMinutes,
  poisonCycle,
  poisonNamed,
  symptomShowing,
  treatmentBonus,
  treatmentRollModifier,
} from "../poison.js";

describe("how long a poison waits (Campaigns p. 437)", () => {
  /** "If the delay is 1 hour, someone with SM -2 is affected in only 15 minutes." */
  it("halves the delay per point of size below zero", () => {
    expect(delayForSize(3600, -2)).toBe(900);
    expect(delayForSize(3600, -1)).toBe(1800);
  });

  it("doubles it per point above", () => {
    expect(delayForSize(3600, 1)).toBe(7200);
    expect(delayForSize(3600, 3)).toBe(28800);
  });

  it("leaves an ordinary victim alone", () => {
    expect(delayForSize(60, 0)).toBe(60);
  });

  /** A poison with no delay has none however big the victim is. */
  it("cannot stretch a delay that was never there", () => {
    expect(delayForSize(0, 4)).toBe(0);
  });
});

describe("varying the dose (Campaigns p. 438)", () => {
  /** "Each doubling of dosage halves the delay and interval, doubles damage,
   * gives -2 to HT rolls to resist, and gives +2 to all rolls to detect." */
  it("prices one doubling", () => {
    expect(dosage(1)).toEqual({
      timeMultiplier: 0.5,
      damageMultiplier: 2,
      resistanceModifier: -2,
      detectionBonus: 2,
    });
  });

  it("compounds", () => {
    expect(dosage(2)).toMatchObject({ damageMultiplier: 4, resistanceModifier: -4 });
  });

  it("reverses for less than a full dose", () => {
    expect(dosage(-1)).toMatchObject({
      timeMultiplier: 2,
      damageMultiplier: 0.5,
      resistanceModifier: 2,
    });
  });

  it("changes nothing for a standard dose", () => {
    expect(dosage(0)).toEqual({
      timeMultiplier: 1,
      damageMultiplier: 1,
      resistanceModifier: 0,
      detectionBonus: 0,
    });
  });
});

describe("treating a poisoning (Campaigns p. 439)", () => {
  /** "Sucking the poison from the wound... gives +2 on HT rolls to resist." */
  it("gives two for sucking the wound or bringing it back up", () => {
    expect(treatmentBonus("suckWound")).toBe(2);
    expect(treatmentBonus("induceVomiting")).toBe(2);
  });

  /** "The HT bonus never exceeds TL/2 (round up, minimum +1)." */
  it("caps medical treatment at half the tech level", () => {
    expect(treatmentBonus("medical", 3)).toBe(2);
    expect(treatmentBonus("medical", 8)).toBe(4);
    expect(treatmentBonus("medical", 0)).toBe(1);
    expect(treatmentBonus("medical", 1)).toBe(1);
  });

  /** An antidote's bonus is the poison's own, so this knows of none. */
  it("leaves an antidote's worth to the poison", () => {
    expect(treatmentBonus("antidote")).toBe(0);
  });

  it("charges two for the difficulty of sucking a wound clean", () => {
    expect(treatmentRollModifier("suckWound")).toBe(-2);
    expect(treatmentRollModifier("induceVomiting")).toBe(0);
  });
});

describe("a poison running its course (Campaigns p. 438)", () => {
  const arsenic = poisonNamed("Arsenic")!;

  /** "On a success, he shakes off the poison." */
  it("ends the moment the victim makes the roll", () => {
    expect(poisonCycle({ poison: arsenic, resisted: true, cyclesSoFar: 3 })).toEqual({
      shakenOff: true,
      cyclesSuffered: 3,
      continues: false,
    });
  });

  /** "On a failure, an additional cycle of damage occurs." */
  it("costs another cycle on a failure", () => {
    expect(poisonCycle({ poison: arsenic, resisted: false, cyclesSoFar: 0 })).toEqual({
      shakenOff: false,
      cyclesSuffered: 1,
      continues: true,
    });
  });

  it("stops when the poison runs out of cycles", () => {
    expect(poisonCycle({ poison: arsenic, resisted: false, cyclesSoFar: 7 })).toMatchObject({
      cyclesSuffered: 8,
      continues: false,
    });
  });

  /** Cyanide "has no HT roll to resist", so there is nothing to make. */
  it("runs regardless where the poison allows no roll", () => {
    const cyanide = poisonNamed("Cyanide")!;
    expect(cyanide.resistanceModifier).toBeNull();
    expect(poisonCycle({ poison: cyanide, resisted: null, cyclesSoFar: 0 })).toMatchObject({
      shakenOff: false,
      cyclesSuffered: 1,
      continues: false,
    });
  });
});

describe("symptoms (Campaigns p. 438)", () => {
  it("shows at a third, a half and two thirds", () => {
    expect(SYMPTOM_THRESHOLDS).toEqual([1 / 3, 1 / 2, 2 / 3]);
  });

  /** Cobra venom: "-2, -4, or -6 DX" at each threshold. */
  it("appears once the poison has done that much", () => {
    expect(symptomShowing({ hpLostToPoison: 4, maxHp: 12, threshold: 1 / 3 })).toBe(true);
    expect(symptomShowing({ hpLostToPoison: 3, maxHp: 12, threshold: 1 / 3 })).toBe(false);
  });

  /** "Symptoms vanish when the victim's HP rise above this threshold." */
  it("goes away as the victim recovers", () => {
    expect(symptomShowing({ hpLostToPoison: 6, maxHp: 12, threshold: 1 / 2 })).toBe(true);
    expect(symptomShowing({ hpLostToPoison: 5, maxHp: 12, threshold: 1 / 2 })).toBe(false);
  });

  /** "The default duration is a number of minutes equal to the margin." */
  it("times other effects by the margin of failure", () => {
    expect(effectMinutes(5)).toBe(5);
    expect(effectMinutes(0)).toBe(0);
  });
});

describe("the poisons the book gives numbers for (Campaigns p. 439)", () => {
  /** "Arsenic: a one-hour delay and a HT-2 roll... 1d toxic, hourly, eight cycles." */
  it("has arsenic right", () => {
    expect(poisonNamed("arsenic")).toMatchObject({
      delaySeconds: 3600,
      resistanceModifier: -2,
      dice: 1,
      intervalSeconds: 3600,
      cycles: 8,
    });
  });

  /** "Cobra Venom: a one-minute delay and a HT-3 roll... 2d, hourly, six cycles." */
  it("has cobra venom right", () => {
    expect(poisonNamed("Cobra Venom")).toMatchObject({
      delaySeconds: 60,
      resistanceModifier: -3,
      dice: 2,
      cycles: 6,
    });
  });

  /** "Nerve Gas: no delay and a HT-6 roll... 2d, one-minute intervals, six cycles." */
  it("has nerve gas right", () => {
    expect(poisonNamed("Nerve Gas")).toMatchObject({
      delaySeconds: 0,
      resistanceModifier: -6,
      dice: 2,
      intervalSeconds: 60,
      cycles: 6,
    });
  });

  it("knows nothing of a poison somebody invented", () => {
    expect(poisonNamed("Iocane Powder")).toBeNull();
  });

  it("gives every example a page to check it against", () => {
    for (const poison of POISON_EXAMPLES) expect(poison.reference).toMatch(/^Campaigns p\./);
  });
});
