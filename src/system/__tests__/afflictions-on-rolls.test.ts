import { describe, expect, it } from "vitest";

import { afflictionEffect } from "../../rules/afflictions.js";
import { penaltyEffects, penaltyFromEffects } from "../../rules/attribute-penalties.js";
import { totalAfflictionEffect } from "../afflictions.js";

/**
 * What a condition on the token costs on a roll (GURPS Basic Set: Campaigns
 * pp. 421, 428-429).
 *
 * The penalties were worked out correctly and then written where nothing read
 * them: the roll read the field the GM types into, and the afflictions were
 * folded into the derived total beside it. A nauseated character rolled
 * everything at full level while the sheet said -2.
 */

/** The penalties a character's sheet comes to, as `buildDerived` assembles them. */
function derivedPenalties(options: {
  typed?: { ST?: number; DX?: number; IQ?: number; HT?: number };
  conditions?: Parameters<typeof totalAfflictionEffect>[0];
}) {
  const typed = options.typed ?? {};
  const afflicted = totalAfflictionEffect(options.conditions ?? []);
  return penaltyEffects({
    ST: (typed.ST ?? 0) + afflicted.st,
    DX: (typed.DX ?? 0) + afflicted.dx,
    IQ: (typed.IQ ?? 0) + afflicted.iq,
    HT: (typed.HT ?? 0) + afflicted.ht,
  });
}

describe("a condition on the token", () => {
  /** "-2 to all attribute and skill rolls, and -1 to active defenses." */
  it("takes nausea off all four attributes, not DX and IQ alone", () => {
    const nauseated = afflictionEffect("nauseated");
    expect(nauseated).toMatchObject({ dx: -2, iq: -2, st: -2, ht: -2, defense: -1 });

    const effects = derivedPenalties({ conditions: ["nauseated"] });
    for (const basedOn of ["ST", "DX", "IQ", "HT", "Will", "Per"] as const) {
      expect(penaltyFromEffects({ effects, basedOn, kind: "skill" })).toBe(-2);
    }
  });

  /** "-2 to DX and IQ, and -4 to self-control rolls." */
  it("leaves ST and HT alone for a drunk character, and drags Will and Per down with IQ", () => {
    const effects = derivedPenalties({ conditions: ["drunk"] });
    expect(penaltyFromEffects({ effects, basedOn: "DX", kind: "skill" })).toBe(-2);
    expect(penaltyFromEffects({ effects, basedOn: "IQ", kind: "skill" })).toBe(-2);
    expect(penaltyFromEffects({ effects, basedOn: "Will", kind: "skill" })).toBe(-2);
    expect(penaltyFromEffects({ effects, basedOn: "Per", kind: "skill" })).toBe(-2);
    expect(penaltyFromEffects({ effects, basedOn: "ST", kind: "skill" })).toBe(0);
    expect(penaltyFromEffects({ effects, basedOn: "HT", kind: "skill" })).toBe(0);
  });

  /**
   * "Defensive reactions that don't require a maneuver to perform -- active
   * defenses, resistance rolls, Fright Checks, etc. -- never suffer penalties
   * for attribute reductions" (p. 421). Nausea's -1 to defenses is its own
   * separate figure, and the only thing that reaches them.
   */
  it("never reaches a defense, a resistance roll or a Fright Check", () => {
    const effects = derivedPenalties({ conditions: ["nauseated", "drunk"] });
    expect(penaltyFromEffects({ effects, basedOn: "DX", kind: "activeDefense" })).toBe(0);
    expect(penaltyFromEffects({ effects, basedOn: "HT", kind: "resistance" })).toBe(0);
    expect(penaltyFromEffects({ effects, basedOn: "Will", kind: "frightCheck" })).toBe(0);
    expect(totalAfflictionEffect(["nauseated"]).defense).toBe(-1);
  });

  it("adds up with a penalty the GM typed in, once", () => {
    const effects = derivedPenalties({ typed: { DX: -1 }, conditions: ["drunk"] });
    expect(penaltyFromEffects({ effects, basedOn: "DX", kind: "skill" })).toBe(-3);
    // The share each accounts for, which is what the roll card names apart:
    // the typed figure on its own, and the rest to the conditions.
    const typedOnly = penaltyEffects({ DX: -1 });
    expect(penaltyFromEffects({ effects: typedOnly, basedOn: "DX", kind: "skill" })).toBe(-1);
  });

  it("stacks two conditions, because two poisons are two problems", () => {
    const effects = derivedPenalties({ conditions: ["nauseated", "coughing"] });
    expect(penaltyFromEffects({ effects, basedOn: "DX", kind: "skill" })).toBe(-5);
    expect(penaltyFromEffects({ effects, basedOn: "IQ", kind: "skill" })).toBe(-3);
    expect(penaltyFromEffects({ effects, basedOn: "HT", kind: "skill" })).toBe(-2);
  });

  it("costs nothing where the token carries no condition", () => {
    const effects = derivedPenalties({});
    expect(penaltyFromEffects({ effects, basedOn: "DX", kind: "skill" })).toBe(0);
  });
});
