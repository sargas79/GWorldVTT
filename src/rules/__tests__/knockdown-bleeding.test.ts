import { describe, expect, it } from "vitest";

import {
  BLEEDING_CRITICAL_HP,
  MINUTES_TO_STOP_BLEEDING,
  bleedingMinute,
  bleedingModifier,
  woundBleeds,
} from "../bleeding.js";
import {
  STUN_DEFENSE_PENALTY,
  knockdownModifier,
  knockdownRequired,
  knockdownResult,
  recoversFromStun,
} from "../knockdown.js";

describe("when a knockdown roll is called for (Campaigns p. 420)", () => {
  /** "Whenever you suffer a major wound..." */
  it("is called for by any major wound, wherever it landed", () => {
    expect(knockdownRequired({ majorWound: true, hitLocation: "arm" })).toBe(true);
    expect(knockdownRequired({ majorWound: true })).toBe(true);
  });

  /** "...and whenever you are struck in the head or vitals for enough injury
   *  to cause a shock penalty." */
  it("is called for by a head or vitals hit that causes shock", () => {
    for (const hitLocation of ["skull", "face", "eye", "vitals", "groin"] as const) {
      expect(knockdownRequired({ majorWound: false, hitLocation, shock: -1 }), hitLocation).toBe(true);
    }
  });

  it("is not called for by a head hit that caused no shock at all", () => {
    expect(knockdownRequired({ majorWound: false, hitLocation: "skull", shock: 0 })).toBe(false);
  });

  it("is not called for by an ordinary wound elsewhere", () => {
    expect(knockdownRequired({ majorWound: false, hitLocation: "torso", shock: -3 })).toBe(false);
    expect(knockdownRequired({ majorWound: false, hitLocation: "leg", shock: -4 })).toBe(false);
  });
});

describe("what the knockdown roll is made at", () => {
  /** "-10 for a major wound to the skull or eye" */
  it("is ten worse for a major wound to the skull or eye", () => {
    expect(knockdownModifier({ majorWound: true, hitLocation: "skull" })).toBe(-10);
    expect(knockdownModifier({ majorWound: true, hitLocation: "eye" })).toBe(-10);
  });

  /** "-5 for a major wound to the face or vitals (or to the groin)" */
  it("is five worse for a major wound to the face, vitals or groin", () => {
    for (const hitLocation of ["face", "vitals", "groin"] as const) {
      expect(knockdownModifier({ majorWound: true, hitLocation }), hitLocation).toBe(-5);
    }
  });

  it("is unmodified for a major wound anywhere else", () => {
    expect(knockdownModifier({ majorWound: true, hitLocation: "torso" })).toBe(0);
  });

  /**
   * The location penalties are for a *major* wound there. A head hit that only
   * caused shock still calls for the roll, but not at -10.
   */
  it("does not penalise a head hit that was not a major wound", () => {
    expect(knockdownModifier({ majorWound: false, hitLocation: "skull", shock: -2 })).toBe(0);
  });

  it("takes the traits with it", () => {
    expect(knockdownModifier({ majorWound: true, hitLocation: "torso", traitModifier: 3 })).toBe(3);
    expect(knockdownModifier({ majorWound: true, hitLocation: "skull", traitModifier: 3 })).toBe(-7);
    expect(knockdownModifier({ majorWound: true, hitLocation: "face", traitModifier: -4 })).toBe(-9);
  });
});

describe("what the knockdown roll did", () => {
  it("does nothing at all on a success", () => {
    expect(knockdownResult({ success: true, margin: 4 })).toEqual({
      outcome: "unaffected",
      stunned: false,
      prone: false,
      unconscious: false,
    });
  });

  /** "On a failure, you're stunned... You fall prone." */
  it("stuns and floors on a failure", () => {
    expect(knockdownResult({ success: false, margin: 2 })).toEqual({
      outcome: "knockedDown",
      stunned: true,
      prone: true,
      unconscious: false,
    });
  });

  /** "On a failure by 5 or more, or any critical failure, you fall unconscious!" */
  it("puts them out on a failure by five", () => {
    expect(knockdownResult({ success: false, margin: 5 }).unconscious).toBe(true);
    expect(knockdownResult({ success: false, margin: 9 }).outcome).toBe("unconscious");
  });

  it("puts them out on any critical failure, however narrow", () => {
    expect(knockdownResult({ success: false, margin: 1, criticalFailure: true }).unconscious).toBe(true);
  });

  it("leaves them stunned until they shake it off", () => {
    expect(recoversFromStun({ success: true })).toBe(true);
    expect(recoversFromStun({ success: false })).toBe(false);
    expect(STUN_DEFENSE_PENALTY).toBe(-4);
  });
});

describe("which wounds bleed (Campaigns p. 420)", () => {
  it("bleeds from anything that cut or went through", () => {
    for (const type of ["cut", "imp", "pi-", "pi", "pi+", "pi++"] as const) {
      expect(woundBleeds(type), type).toBe(true);
    }
  });

  it("does not bleed from a crushing blow", () => {
    expect(woundBleeds("cr")).toBe(false);
    expect(woundBleeds("cr", true)).toBe(false);
  });

  /** "the damage sears the flesh... However, if such injury causes a major
   *  wound, treat it as a bleeding wound." */
  it("bleeds from a burn only when the burn was a major wound", () => {
    expect(woundBleeds("burn")).toBe(false);
    expect(woundBleeds("burn", true)).toBe(true);
    expect(woundBleeds("cor", true)).toBe(true);
  });

  it("does not bleed from fatigue or toxins", () => {
    expect(woundBleeds("fat")).toBe(false);
    expect(woundBleeds("tox")).toBe(false);
  });
});

describe("a minute of bleeding", () => {
  /** "at -1 per 5 HP lost" -- lost, so it gets worse as the wound accumulates. */
  it("gets harder the more blood has been lost", () => {
    expect(bleedingModifier(0)).toBe(0);
    expect(bleedingModifier(4)).toBe(0);
    expect(bleedingModifier(5)).toBe(-1);
    expect(bleedingModifier(17)).toBe(-3);
  });

  it("costs a point on a failure", () => {
    expect(bleedingMinute({ roll: { success: false }, quietMinutes: 0 })).toEqual({
      lost: 1,
      stopped: false,
      quietMinutes: 0,
    });
  });

  it("costs three on a critical failure", () => {
    expect(bleedingMinute({ roll: { success: false, criticalFailure: true }, quietMinutes: 2 }).lost)
      .toBe(BLEEDING_CRITICAL_HP);
  });

  /** "On a critical success, the bleeding stops completely." */
  it("stops at once on a critical success", () => {
    const result = bleedingMinute({
      roll: { success: true, criticalSuccess: true },
      quietMinutes: 0,
    });
    expect(result).toMatchObject({ lost: 0, stopped: true });
  });

  /** "If you do not bleed for three consecutive minutes, the bleeding stops." */
  it("stops after three quiet minutes", () => {
    expect(bleedingMinute({ roll: { success: true }, quietMinutes: 0 }).stopped).toBe(false);
    expect(bleedingMinute({ roll: { success: true }, quietMinutes: 1 }).stopped).toBe(false);
    expect(bleedingMinute({ roll: { success: true }, quietMinutes: 2 }).stopped).toBe(true);
    expect(MINUTES_TO_STOP_BLEEDING).toBe(3);
  });

  /** Three in a row: a minute that bleeds starts the count again. */
  it("starts the count again on any minute that bleeds", () => {
    expect(bleedingMinute({ roll: { success: false }, quietMinutes: 2 }).quietMinutes).toBe(0);
  });
});
