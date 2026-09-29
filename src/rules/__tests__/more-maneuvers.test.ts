import { describe, expect, it } from "vitest";
import {
  ADDENDUM_MANEUVERS,
  allOutMaySlam,
  allOutSlamMovement,
  committedDamageBonus,
  committedRefuses,
  committedToHit,
  defensiveAllowsSameWeaponParry,
  defensiveDamagePenalty,
  defensiveDefenseBonus,
  distractionPenalty,
  isAddendumManeuver,
} from "../more-maneuvers.js";

describe("More maneuvers (Basic Set Revised pp. 575-576)", () => {
  it("lets an All-Out Attack slam a full Move, and Double half a Move with an attack first", () => {
    expect(allOutSlamMovement("strong")).toEqual({ movement: "full", forwardOnly: true, extraAttack: false });
    expect(allOutSlamMovement("double")).toEqual({ movement: "half", forwardOnly: true, extraAttack: true });
    expect(allOutMaySlam("suppression")).toBe(false);
    expect(allOutMaySlam("determined")).toBe(true);
  });

  it("makes a distraction Will-2 on All-Out Concentrate", () => {
    expect(distractionPenalty(false)).toBe(-3);
    expect(distractionPenalty(true)).toBe(-2);
  });

  it("gives Committed Attack (Determined) +2 and a second step -2", () => {
    expect(committedToHit("determined", false)).toBe(2);
    expect(committedToHit("determined", true)).toBe(0);
    expect(committedToHit("strong", true)).toBe(-2);
    expect(committedToHit("strong", false)).toBe(0);
  });

  it("gives Strong +1 damage or +1 per two full dice, for ST-based damage only", () => {
    expect(committedDamageBonus("strong", 1, true)).toBe(1);
    expect(committedDamageBonus("strong", 3, true)).toBe(1);
    expect(committedDamageBonus("strong", 4, true)).toBe(2);
    expect(committedDamageBonus("strong", 6, true)).toBe(3);
    expect(committedDamageBonus("strong", 4, false)).toBe(0);
    expect(committedDamageBonus("determined", 4, true)).toBe(0);
  });

  it("costs the defense the attack used", () => {
    expect(committedRefuses("hand", "parry")).toBe(true);
    expect(committedRefuses("hand", "dodge")).toBe(false);
    expect(committedRefuses("shield", "block")).toBe(true);
    expect(committedRefuses("kick", "dodge")).toBe(true);
    expect(committedRefuses("kick", "parry")).toBe(false);
  });

  it("takes -2 damage or -1 a die from a Defensive Attack, whichever is worse", () => {
    expect(defensiveDamagePenalty(1)).toBe(-2);
    expect(defensiveDamagePenalty(2)).toBe(-2);
    expect(defensiveDamagePenalty(3)).toBe(-3);
    expect(defensiveDamagePenalty(5)).toBe(-5);
  });

  it("gives Defensive Attack +1 to the chosen defense only", () => {
    expect(defensiveDefenseBonus("parry", "parry")).toBe(1);
    expect(defensiveDefenseBonus("parry", "block")).toBe(0);
    expect(defensiveDefenseBonus("block", "block")).toBe(1);
    expect(defensiveDefenseBonus("sameWeapon", "parry")).toBe(0);
    expect(defensiveAllowsSameWeaponParry("sameWeapon")).toBe(true);
    expect(defensiveAllowsSameWeaponParry("parry")).toBe(false);
  });

  it("describes the new maneuvers", () => {
    expect(isAddendumManeuver("committedAttack")).toBe(true);
    expect(isAddendumManeuver("attack")).toBe(false);
    expect(ADDENDUM_MANEUVERS.allOutConcentrate.defense).toBe("none");
    expect(ADDENDUM_MANEUVERS.committedAttack.attacks).toBe(true);
    expect(ADDENDUM_MANEUVERS.defensiveAttack.movement).toBe("step");
  });
});
