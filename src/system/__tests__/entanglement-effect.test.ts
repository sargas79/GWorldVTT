import { describe, expect, it } from "vitest";

import { entanglementEffect } from "../entangling.js";

/**
 * What a bolas or a lariat is doing to whoever it caught (GURPS Basic Set:
 * Campaigns p. 410). Escaping is only half of being caught.
 */
const keys = (notes: ReturnType<typeof entanglementEffect>) => notes.map((n) => n.key);

describe("entanglementEffect", () => {
  it("takes what a bolas round the arm was holding", () => {
    expect(keys(entanglementEffect({ entanglement: "bolas", where: "arm", running: false })))
      .toContain("Disarms");
  });

  it("trips a running man with a bolas round his legs, and only ties a standing one", () => {
    expect(keys(entanglementEffect({ entanglement: "bolas", where: "leg", running: true })))
      .toContain("TripsRunning");
    expect(keys(entanglementEffect({ entanglement: "bolas", where: "leg", running: false })))
      .toContain("TiesTheLegs");
  });

  it("stops the breathing of whoever a bolas caught by the neck", () => {
    const notes = entanglementEffect({ entanglement: "bolas", where: "neck", running: false });
    const choke = notes.find((n) => n.key === "Suffocates");
    expect(choke?.grave).toBe(true);
  });

  it("puts the victim of a lariat round the neck five down in the Contest, and chokes him", () => {
    const notes = entanglementEffect({ entanglement: "lariat", where: "neck", running: false });
    expect(notes.find((n) => n.key === "ContestAt")?.data?.modifier).toBe(-5);
    expect(keys(notes)).toContain("Suffocates");
  });

  it("makes a roped foot a DX roll to stand rather than a Contest", () => {
    const notes = keys(entanglementEffect({ entanglement: "lariat", where: "foot", running: true }));
    expect(notes).toContain("RollsToStand");
    expect(notes).not.toContain("Contest");
  });

  it("says a missed ten-yard lariat takes two turns to gather", () => {
    const notes = entanglementEffect({ entanglement: "lariat", where: "torso", running: false });
    expect(notes.find((n) => n.key === "LariatReady")?.data?.turns).toBe(2);
  });

  it("says nothing extra about a net, which only holds", () => {
    expect(entanglementEffect({ entanglement: "net", where: "torso", running: false })).toEqual([]);
  });
});
