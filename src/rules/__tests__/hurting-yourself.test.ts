import { describe, expect, it } from "vitest";

import { hurtingYourself, strikingPart } from "../hurting-yourself.js";

/** Hurting Yourself (GURPS Basic Set: Campaigns p. 379). */
describe("hurting yourself", () => {
  it("costs a point of crushing per 5 basic damage, up to the target's DR, against DR 3+", () => {
    expect(hurtingYourself({ basicDamage: 12, targetDr: 6, ownDr: 0 })).toEqual({ damage: 2, injury: 2 });
    expect(hurtingYourself({ basicDamage: 40, targetDr: 3, ownDr: 0 })).toEqual({ damage: 3, injury: 3 });
    expect(hurtingYourself({ basicDamage: 12, targetDr: 2, ownDr: 0 })).toEqual({ damage: 0, injury: 0 });
  });

  it("lets the striker's own DR protect, and a lower threshold count a tougher spot", () => {
    expect(hurtingYourself({ basicDamage: 12, targetDr: 6, ownDr: 1 })).toEqual({ damage: 2, injury: 1 });
    expect(hurtingYourself({ basicDamage: 15, targetDr: 2, ownDr: 0, minimumDr: 0 })).toEqual({ damage: 2, injury: 2 });
  });

  it("strikes with the hand, foot or face", () => {
    expect([strikingPart("punch"), strikingPart("kick"), strikingPart("bite"), strikingPart("striker")]).toEqual(["hand", "foot", "face", null]);
  });
});
