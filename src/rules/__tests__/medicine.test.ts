import { describe, expect, it } from "vitest";

import {
  CARED_FOR_BONUS,
  COMPETENT_PHYSICIAN,
  PATIENTS_PER_PHYSICIAN,
  RESUSCITATION_MINUTES,
  RESUSCITATION_TL,
  canResuscitate,
  careBonus,
  competentCare,
  cureHitPoints,
  cureResult,
  resuscitationModifier,
  risksInfection,
  surgeryEquipment,
  surgeryModifier,
} from "../medicine.js";

describe("surgery (Campaigns p. 424)", () => {
  it("runs the book's equipment ladder", () => {
    // "-6 at TL1, -5 at TL2-3, -4 at TL4, -2 at TL5, and +(TL-6) at TL6+."
    expect(surgeryEquipment(1)).toBe(-6);
    expect(surgeryEquipment(2)).toBe(-5);
    expect(surgeryEquipment(3)).toBe(-5);
    expect(surgeryEquipment(4)).toBe(-4);
    expect(surgeryEquipment(5)).toBe(-2);
    expect(surgeryEquipment(6)).toBe(0);
    expect(surgeryEquipment(9)).toBe(3);
  });

  it("takes two more off for operating without anaesthetic", () => {
    // "The modifiers for TL5+ surgery assume that anesthetic is available. If
    // it isn't, apply a -2 penalty to skill."
    expect(surgeryModifier({ techLevel: 8 })).toBe(2);
    expect(surgeryModifier({ techLevel: 8, anesthetic: false })).toBe(0);
  });

  it("has no anaesthetic to lack before it was invented", () => {
    // A TL3 surgeon is not penalised for the absence of something nobody had.
    expect(surgeryModifier({ techLevel: 3 })).toBe(-5);
    expect(surgeryModifier({ techLevel: 3, anesthetic: false })).toBe(-5);
  });

  it("takes three more off for putting a crippled limb right", () => {
    // "This kind of operation is also tricky: -3 or worse to skill."
    expect(surgeryModifier({ techLevel: 8, repairingCrippled: true })).toBe(-1);
  });

  it("counts the quality of the tools alongside", () => {
    expect(surgeryModifier({ techLevel: 8, equipmentQuality: 2 })).toBe(4);
  });

  it("risks infection before antiseptic practice", () => {
    expect(risksInfection(4)).toBe(true);
    expect(risksInfection(5)).toBe(false);
  });
});

describe("medical care (p. 424)", () => {
  it("wants a physician at twelve or better", () => {
    expect(COMPETENT_PHYSICIAN).toBe(12);
    expect(competentCare(12)).toBe(true);
    expect(competentCare(11)).toBe(false);
    expect(competentCare(null)).toBe(false);
  });

  it("is worth one on every roll for natural recovery", () => {
    expect(CARED_FOR_BONUS).toBe(1);
    expect(careBonus(14)).toBe(1);
    expect(careBonus(9)).toBe(0);
  });

  it("lets one doctor look after two hundred", () => {
    expect(PATIENTS_PER_PHYSICIAN).toBe(200);
  });

  it("heals one, or two on a critical, and costs one on a critical failure", () => {
    expect(cureResult({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("healed");
    expect(cureResult({ success: true, criticalSuccess: true, criticalFailure: false })).toBe("healedWell");
    expect(cureResult({ success: false, criticalSuccess: false, criticalFailure: false })).toBe("nothing");
    expect(cureResult({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("worsened");

    expect(cureHitPoints("healed")).toBe(1);
    expect(cureHitPoints("healedWell")).toBe(2);
    expect(cureHitPoints("nothing")).toBe(0);
    // "a critical failure costs the patient 1 HP!"
    expect(cureHitPoints("worsened")).toBe(-1);
  });
});

describe("resuscitation (p. 425)", () => {
  it("takes a minute an attempt, and a modern skill", () => {
    expect(RESUSCITATION_MINUTES).toBe(1);
    expect(RESUSCITATION_TL).toBe(7);
    expect(canResuscitate(7)).toBe(true);
    expect(canResuscitate(6)).toBe(false);
  });

  it("costs a physician nothing and a first-aider four", () => {
    expect(resuscitationModifier({ skill: "physician", cause: "heartAttack" })).toBe(0);
    expect(resuscitationModifier({ skill: "firstAid", cause: "heartAttack" })).toBe(-4);
  });

  it("costs only two once CPR is taught, and only for the two it helps", () => {
    // "First Aid rolls to revive victims of drowning or asphyxiation are at -2
    // instead of -4."
    expect(resuscitationModifier({ skill: "firstAid", cause: "drowning", cpr: true })).toBe(-2);
    expect(resuscitationModifier({ skill: "firstAid", cause: "asphyxiation", cpr: true })).toBe(-2);
    expect(resuscitationModifier({ skill: "firstAid", cause: "heartAttack", cpr: true })).toBe(-4);
  });

  it("gives none of that to somebody who never learned First Aid", () => {
    // "First Aid rolls (but not default rolls)".
    expect(resuscitationModifier({ skill: "firstAid", cause: "drowning", cpr: true, byDefault: true }))
      .toBe(-4);
  });
});
