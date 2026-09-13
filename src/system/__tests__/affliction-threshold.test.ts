import { describe, expect, it } from "vitest";

import {
  afflictionEffectFor,
  afflictionNotes,
  injuryToleranceOf,
  painThresholdOf,
  totalAfflictionEffect,
} from "../afflictions.js";

/**
 * Pain and agony for somebody whose pain threshold is not ordinary (GURPS
 * Basic Set: Campaigns p. 428). The affliction table prints the ordinary
 * figures; the book adjusts them, and the system used to apply the table flat.
 */
describe("pain threshold", () => {
  it("reads High and Low Pain Threshold off the trait effects", () => {
    expect(painThresholdOf({ noShock: true, shockMultiplier: 1 })).toBe("high");
    expect(painThresholdOf({ noShock: false, shockMultiplier: 2 })).toBe("low");
    expect(painThresholdOf({ noShock: false, shockMultiplier: 1 })).toBe("normal");
    expect(painThresholdOf(null)).toBe("normal");
  });

  it("halves pain for High Pain Threshold and doubles it for Low", () => {
    // "-2 for Moderate Pain, -4 for Severe Pain, and -6 for Terrible Pain. High
    // Pain Threshold halves these penalties; Low Pain Threshold doubles them."
    expect(afflictionEffectFor("moderatePain", "normal").dx).toBe(-2);
    expect(afflictionEffectFor("moderatePain", "high").dx).toBe(-1);
    expect(afflictionEffectFor("moderatePain", "low").dx).toBe(-4);
    expect(afflictionEffectFor("terriblePain", "high").iq).toBe(-3);
    expect(afflictionEffectFor("severePain", "low").selfControl).toBe(-8);
  });

  it("lets High Pain Threshold act through agony, at -3", () => {
    // "High Pain Threshold lets you overcome the agony enough to function, but
    // at -3 to DX and IQ."
    const ordinary = afflictionEffectFor("agony", "normal");
    expect(ordinary.helpless).toBe(true);

    const tough = afflictionEffectFor("agony", "high");
    expect(tough.helpless).toBe(false);
    expect(tough.fallsDown).toBe(false);
    expect(tough.dx).toBe(-3);
    expect(tough.iq).toBe(-3);
  });

  it("carries the threshold through the total an actor's sheet reads", () => {
    expect(totalAfflictionEffect(["moderatePain"], "high").dx).toBe(-1);
    expect(totalAfflictionEffect(["moderatePain"]).dx).toBe(-2);
  });
});

describe("afflictionNotes", () => {
  const base = { health: 12, hitPoints: 8, threshold: "normal" as const };
  const keys = (notes: ReturnType<typeof afflictionNotes>) => notes.map((n) => n.key);

  it("doubles the drain and the torture bonus of agony for Low Pain Threshold", () => {
    const low = afflictionNotes({ ...base, affliction: "agony", threshold: "low" });
    expect(low.find((n) => n.key === "AgonyDrain")?.data?.fatigue).toBe(2);
    expect(low.find((n) => n.key === "TortureBonus")?.data?.bonus).toBe(6);
  });

  it("gives ecstasy an Influence bonus that no threshold touches", () => {
    const notes = afflictionNotes({ ...base, affliction: "ecstasy", threshold: "low" });
    expect(notes.find((n) => n.key === "EcstasyInfluence")?.data?.bonus).toBe(3);
  });

  it("works a nauseated character's HT roll and how long they vomit", () => {
    const notes = afflictionNotes({ ...base, affliction: "nauseated" });
    expect(notes.find((n) => n.key === "NauseaRoll")?.data?.target).toBe(12);
    // "you vomit for (25 - HT) seconds."
    expect(notes.find((n) => n.key === "Vomits")?.data?.seconds).toBe(13);
  });

  it("lists every outcome of a hallucinating character's Will roll", () => {
    const [roll] = afflictionNotes({ ...base, affliction: "hallucinating" });
    expect(roll?.data).toMatchObject({ success: -2, failure: -5 });
  });

  it("counts down a heart attack at HT/3 minutes, and leaves 0 HP or worse", () => {
    const notes = afflictionNotes({ ...base, affliction: "heartAttack" });
    expect(notes.find((n) => n.key === "HeartAttackClock")?.data?.minutes).toBe(4);
    // "at 0 HP or your current HP, whichever is worse."
    expect(notes.find((n) => n.key === "HeartAttackSurvives")?.data?.hp).toBe(0);
    expect(
      afflictionNotes({ ...base, hitPoints: -4, affliction: "heartAttack" })
        .find((n) => n.key === "HeartAttackSurvives")?.data?.hp,
    ).toBe(-4);
  });

  it("says nothing extra about a plain cough", () => {
    expect(keys(afflictionNotes({ ...base, affliction: "coughing" }))).toEqual([]);
  });
});

describe("injuryToleranceOf", () => {
  const trait = (name: string, ...modifiers: string[]) => ({
    type: "trait",
    name,
    system: { modifiers: modifiers.map((m) => ({ name: m })) },
  });

  it("finds the kinds of Injury Tolerance that spare a heart", () => {
    expect(injuryToleranceOf({ items: [trait("Injury Tolerance", "No Vitals")] }).noVitals).toBe(true);
    expect(injuryToleranceOf({ items: [trait("Injury Tolerance", "Diffuse")] }).diffuse).toBe(true);
    expect(injuryToleranceOf({ items: [trait("Injury Tolerance", "Homogenous")] }).homogenous).toBe(true);
  });

  it("ignores every other trait, and Injury Tolerance of another kind", () => {
    const none = injuryToleranceOf({ items: [trait("Injury Tolerance", "No Brain"), trait("Toughness")] });
    expect(none).toEqual({ diffuse: false, homogenous: false, noVitals: false });
  });
});
