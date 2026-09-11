import { describe, expect, it } from "vitest";

import {
  MORTAL_WOUND_MINUTES,
  TRAUMA_MAINTENANCE_MINUTES,
  cripplingDuration,
  cripplingMonths,
  deathCheck,
  mortalWoundCheck,
  mortalWoundInterval,
  mortalWoundTarget,
} from "../mortal-wounds.js";
import {
  SECONDS_TO_BRAIN_DAMAGE,
  SECONDS_TO_DEATH,
  brainDamageRoll,
  drowningRollDue,
  suffocationSecond,
} from "../suffocation.js";

describe("the roll against death (Campaigns p. 423)", () => {
  it("is survived on a success", () => {
    expect(deathCheck({ success: true, margin: 0 })).toBe("survived");
  });

  /** "If you fail a HT roll to avoid death by 1 or 2 ... a 'mortal wound'." */
  it("is a mortal wound when failed by one or two", () => {
    expect(deathCheck({ success: false, margin: 1 })).toBe("mortallyWounded");
    expect(deathCheck({ success: false, margin: 2 })).toBe("mortallyWounded");
  });

  it("is death when failed by more", () => {
    expect(deathCheck({ success: false, margin: 3 })).toBe("dead");
    expect(deathCheck({ success: false, margin: 9 })).toBe("dead");
  });
});

describe("lingering with a mortal wound", () => {
  /** "On a success, you linger for another half-hour." */
  it("buys another half-hour on a success", () => {
    expect(mortalWoundCheck({ success: true })).toBe("lingers");
    expect(MORTAL_WOUND_MINUTES).toBe(30);
  });

  /** "On any failure, you die." */
  it("is fatal on any failure at all", () => {
    expect(mortalWoundCheck({ success: false })).toBe("dead");
  });

  /** "On a critical success, you pull through miraculously." */
  it("is survived outright on a critical success", () => {
    expect(mortalWoundCheck({ success: true, criticalSuccess: true })).toBe("recovered");
  });

  /** "Instead of rolling vs. HT every half-hour, roll ... every hour." */
  it("is rolled half as often under trauma maintenance", () => {
    expect(mortalWoundInterval(false)).toBe(MORTAL_WOUND_MINUTES);
    expect(mortalWoundInterval(true)).toBe(TRAUMA_MAINTENANCE_MINUTES);
  });

  /** "roll against the higher of your HT or your caregiver's Physician skill" */
  it("uses a caregiver's skill when it is better than your own health", () => {
    expect(mortalWoundTarget({ health: 11, physician: 14 })).toBe(14);
    expect(mortalWoundTarget({ health: 15, physician: 14 })).toBe(15);
    expect(mortalWoundTarget({ health: 11, physician: null })).toBe(11);
  });
});

describe("how long a crippling lasts (Campaigns p. 422)", () => {
  it("reads the HT roll", () => {
    expect(cripplingDuration({ success: true })).toBe("temporary");
    expect(cripplingDuration({ success: false })).toBe("lasting");
    expect(cripplingDuration({ success: false, criticalFailure: true })).toBe("permanent");
  });

  /** "Roll 1d. This is the number of months it will take." */
  it("heals a lasting crippling in the months rolled", () => {
    expect(cripplingMonths({ roll: 4 })).toBe(4);
    expect(cripplingMonths({ roll: 1 })).toBe(1);
  });

  /** "subtract 3 ... at medical TL7+, 2 at TL6, or 1 at TL5" */
  it("heals faster with a physician, by tech level", () => {
    expect(cripplingMonths({ roll: 6, treatedAtTl: 8 })).toBe(3);
    expect(cripplingMonths({ roll: 6, treatedAtTl: 6 })).toBe(4);
    expect(cripplingMonths({ roll: 6, treatedAtTl: 5 })).toBe(5);
    expect(cripplingMonths({ roll: 6, treatedAtTl: 3 })).toBe(6);
  });

  /** "the period of healing is never less than one month" */
  it("never heals in less than a month, however good the medicine", () => {
    expect(cripplingMonths({ roll: 1, treatedAtTl: 9 })).toBe(1);
    expect(cripplingMonths({ roll: 2, treatedAtTl: 8 })).toBe(1);
  });
});

describe("running out of air (Campaigns p. 436)", () => {
  /** "you lose 1 FP per second" */
  it("costs a point of fatigue every second with no air", () => {
    const second = suffocationSecond({ air: "none", seconds: 3, currentFp: 10 });
    expect(second.fpLost).toBe(1);
    expect(second.willRoll).toBe(false);
  });

  /** "At 0 FP, you must make a Will roll every second or fall unconscious." */
  it("asks for a Will roll every second once the fatigue is gone", () => {
    expect(suffocationSecond({ air: "none", seconds: 9, currentFp: 1 }).willRoll).toBe(true);
    expect(suffocationSecond({ air: "none", seconds: 9, currentFp: 0 }).willRoll).toBe(true);
  });

  /** "Regardless of FP or HP, you die after four minutes without air." */
  it("kills after four minutes whatever is left", () => {
    expect(SECONDS_TO_DEATH).toBe(240);
    expect(suffocationSecond({ air: "none", seconds: 239, currentFp: 20 }).dead).toBe(false);
    expect(suffocationSecond({ air: "none", seconds: 240, currentFp: 20 }).dead).toBe(true);
  });

  /** Drowning costs fatigue only on the seconds the Swimming roll is missed. */
  it("costs a drowning swimmer nothing until they inhale water", () => {
    expect(suffocationSecond({ air: "drowning", seconds: 5, currentFp: 8 }).fpLost).toBe(0);
    expect(
      suffocationSecond({ air: "drowning", seconds: 5, currentFp: 8, inhaledWater: true }).fpLost,
    ).toBe(1);
  });

  /** A drowning swimmer is getting some air, so the four minutes do not run. */
  it("does not put a drowning swimmer on the four-minute clock", () => {
    expect(suffocationSecond({ air: "drowning", seconds: 600, currentFp: 5 }).dead).toBe(false);
  });

  /** "roll vs. Swimming every five seconds" */
  it("asks for a Swimming roll every five seconds", () => {
    expect(drowningRollDue(5)).toBe(true);
    expect(drowningRollDue(10)).toBe(true);
    expect(drowningRollDue(4)).toBe(false);
    expect(drowningRollDue(0)).toBe(false);
  });

  /** "If you went without air for more than two minutes, roll vs. HT to avoid
   *  permanent brain damage: -1 to IQ." */
  it("risks brain damage past two minutes", () => {
    expect(SECONDS_TO_BRAIN_DAMAGE).toBe(120);
    expect(brainDamageRoll(120)).toBe(false);
    expect(brainDamageRoll(121)).toBe(true);
    expect(suffocationSecond({ air: "none", seconds: 150, currentFp: 3 }).brainDamageRisk).toBe(true);
  });
});
