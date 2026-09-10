import { describe, expect, it } from "vitest";

import {
  MANEUVERS,
  MANEUVER_ORDER,
  MAX_EVALUATE_BONUS,
  allOutAttackBonus,
  canDefendWith,
  canParryWith,
  evaluateBonus,
  knockback,
  resolveFeint,
} from "../maneuvers.js";

describe("maneuvers (GURPS Basic Set: Campaigns pp. 363-367)", () => {
  it("includes the three the Lite rules leave out", () => {
    for (const key of ["evaluate", "feint", "wait"] as const) {
      expect(MANEUVER_ORDER).toContain(key);
    }
  });

  it("strips every defense from an All-Out Attack", () => {
    expect(MANEUVERS.allOutAttack.defense).toBe("none");
    expect(canDefendWith("allOutAttack")).toBe(false);
    expect(canParryWith("allOutAttack")).toBe(false);
  });

  it("lets Move and Attack dodge or block but never parry", () => {
    expect(MANEUVERS.moveAndAttack.defense).toBe("dodgeAndBlockOnly");
    expect(canDefendWith("moveAndAttack")).toBe(true);
    expect(canParryWith("moveAndAttack")).toBe(false);
  });

  it("leaves ordinary maneuvers fully defensible", () => {
    for (const key of ["attack", "evaluate", "feint", "aim", "ready"] as const) {
      expect(canDefendWith(key), key).toBe(true);
      expect(canParryWith(key), key).toBe(true);
    }
  });
});

describe("Evaluate", () => {
  it("gives +1 per consecutive turn", () => {
    expect(evaluateBonus(1)).toBe(1);
    expect(evaluateBonus(2)).toBe(2);
    expect(evaluateBonus(3)).toBe(3);
  });

  it("caps at +3 however long you wait", () => {
    expect(evaluateBonus(4)).toBe(MAX_EVALUATE_BONUS);
    expect(evaluateBonus(50)).toBe(3);
  });

  it("gives nothing for zero or negative turns", () => {
    expect(evaluateBonus(0)).toBe(0);
    expect(evaluateBonus(-2)).toBe(0);
  });
});

describe("All-Out Attack", () => {
  it("gives Determined +4 in melee but only +1 at range", () => {
    expect(allOutAttackBonus("determined")).toBe(4);
    expect(allOutAttackBonus("determined", true)).toBe(1);
  });

  it("gives no to-hit bonus for the other options", () => {
    for (const option of ["double", "strong", "feint"] as const) {
      expect(allOutAttackBonus(option), option).toBe(0);
    }
  });
});

describe("Feint", () => {
  it("penalises the loser's defenses by the margin of victory", () => {
    expect(resolveFeint(7, 3)).toEqual({ success: true, defensePenalty: 4 });
  });

  it("achieves nothing on a tie", () => {
    expect(resolveFeint(5, 5)).toEqual({ success: false, defensePenalty: 0 });
  });

  it("never helps the defender when the feint is beaten", () => {
    // A lost feint must not produce a negative penalty (i.e. a bonus).
    expect(resolveFeint(2, 9)).toEqual({ success: false, defensePenalty: 0 });
  });
});

describe("knockback (GURPS Basic Set: Campaigns p. 378)", () => {
  it("knocks back on crushing whether or not DR is penetrated", () => {
    expect(knockback({ basicDamage: 16, type: "cr", penetratedDr: true, targetStrength: 10 }).yards).toBe(2);
    expect(knockback({ basicDamage: 16, type: "cr", penetratedDr: false, targetStrength: 10 }).yards).toBe(2);
  });

  it("knocks back on cutting only when the blow fails to penetrate", () => {
    // A cut that gets through wounds instead of shoving.
    expect(knockback({ basicDamage: 16, type: "cut", penetratedDr: true, targetStrength: 10 }).yards).toBe(0);
    expect(knockback({ basicDamage: 16, type: "cut", penetratedDr: false, targetStrength: 10 }).yards).toBe(2);
  });

  it("causes no knockback from any other damage type", () => {
    for (const type of ["imp", "pi", "pi+", "burn", "tox", "cor", "fat"] as const) {
      expect(knockback({ basicDamage: 30, type, penetratedDr: false, targetStrength: 10 }).yards, type).toBe(0);
    }
  });

  it("moves one yard per full multiple of ST-2, per the ST 10 example", () => {
    // A ST 10 man is knocked back one yard per full 8 points.
    expect(knockback({ basicDamage: 7, type: "cr", penetratedDr: false, targetStrength: 10 }).yards).toBe(0);
    expect(knockback({ basicDamage: 8, type: "cr", penetratedDr: false, targetStrength: 10 }).yards).toBe(1);
    expect(knockback({ basicDamage: 24, type: "cr", penetratedDr: false, targetStrength: 10 }).yards).toBe(3);
  });

  it("shoves very weak targets a yard per point", () => {
    expect(knockback({ basicDamage: 5, type: "cr", penetratedDr: false, targetStrength: 3 }).yards).toBe(5);
    expect(knockback({ basicDamage: 5, type: "cr", penetratedDr: false, targetStrength: 1 }).yards).toBe(5);
  });

  it("penalises the roll to stay standing by 1 per yard after the first", () => {
    expect(knockback({ basicDamage: 8, type: "cr", penetratedDr: false, targetStrength: 10 }).fallRollPenalty).toBe(0);
    expect(knockback({ basicDamage: 24, type: "cr", penetratedDr: false, targetStrength: 10 }).fallRollPenalty).toBe(-2);
  });

  it("uses damage before DR, so armor does not reduce the shove", () => {
    // Both calls pass the same basic damage; only penetration differs.
    const through = knockback({ basicDamage: 16, type: "cr", penetratedDr: true, targetStrength: 10 });
    const stopped = knockback({ basicDamage: 16, type: "cr", penetratedDr: false, targetStrength: 10 });
    expect(through.yards).toBe(stopped.yards);
  });
});
