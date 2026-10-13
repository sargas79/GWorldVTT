import { describe, expect, it } from "vitest";

import { afterParry, parriesBefore, type ParryLedger } from "../parry-count.js";
import { multipleParryPenalty } from "../../rules/defenses.js";

/** Choosing which parry this is (sargas79/GWorldVTT#978). */
const empty = (): ParryLedger => ({ parries: {}, parriedBy: {} });

describe("which parry of the turn this is", () => {
  it("counts each attack parried, as before", () => {
    let ledger = empty();
    expect(parriesBefore(ledger, "sword", "attack-1", null)).toBe(0);
    ledger = afterParry(ledger, "sword", "attack-1", null);
    expect(parriesBefore(ledger, "sword", "attack-2", null)).toBe(1);
    ledger = afterParry(ledger, "sword", "attack-2", null);
    expect(ledger.parries.sword).toBe(2);
    // A third parry with a broadsword is at -8 (Campaigns p. 376).
    expect(multipleParryPenalty(parriesBefore(ledger, "sword", "attack-3", null), { fencing: false, trained: false })).toBe(-8);
  });

  it("treats a second press against the same attack as the same parry", () => {
    let ledger = afterParry(empty(), "sword", "attack-1", null);
    expect(parriesBefore(ledger, "sword", "attack-1", null)).toBe(0);
    ledger = afterParry(ledger, "sword", "attack-1", null);
    expect(ledger.parries.sword).toBe(1);
    expect(parriesBefore(ledger, "sword", "attack-2", null)).toBe(1);
  });

  it("keeps the later parries when an earlier attack is parried again", () => {
    let ledger = afterParry(empty(), "sword", "a", null);
    ledger = afterParry(ledger, "sword", "b", null);
    ledger = afterParry(ledger, "sword", "a", null);
    expect(ledger).toEqual({ parries: { sword: 2 }, parriedBy: { sword: ["a", "b"] } });
  });

  it("takes the defender's word for which parry it is, and counts on from there", () => {
    let ledger = afterParry(empty(), "sword", "a", null);
    ledger = afterParry(ledger, "sword", "b", null);
    // "That was my first parry."
    expect(parriesBefore(ledger, "sword", "c", 0)).toBe(0);
    ledger = afterParry(ledger, "sword", "c", 0);
    expect(ledger).toEqual({ parries: { sword: 1 }, parriedBy: { sword: ["c"] } });
    expect(parriesBefore(ledger, "sword", "d", null)).toBe(1);
  });

  it("lets the defender count a parry made off the cards", () => {
    const ledger = afterParry(empty(), "sword", "a", 2);
    expect(ledger.parries.sword).toBe(3);
    expect(parriesBefore(ledger, "sword", "b", null)).toBe(3);
  });

  it("keeps each weapon's count apart", () => {
    const ledger = afterParry(empty(), "sword", "a", null);
    expect(parriesBefore(ledger, "bare", "b", null)).toBe(0);
  });

  it("reads a count kept before attacks were remembered", () => {
    const old: ParryLedger = { parries: { sword: 2 }, parriedBy: {} };
    expect(parriesBefore(old, "sword", "a", null)).toBe(2);
    expect(afterParry(old, "sword", "a", null)).toEqual({ parries: { sword: 3 }, parriedBy: { sword: ["a"] } });
  });
});
