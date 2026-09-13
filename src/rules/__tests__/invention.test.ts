import { describe, expect, it } from "vitest";

import {
  COMPUTER_TL,
  INVENTION_GRADES,
  MINIMUM_INVENTION_DAYS,
  WORKSHOP_EXPLOSION,
  assistantBonus,
  conceptModifier,
  facilitiesCost,
  fitsAtOnce,
  gradeForComplexity,
  gradeForPrice,
  gradeRow,
  halveDice,
  programsAtOnce,
  prototypeBugs,
  prototypeModifier,
  prototypeTime,
  reinventing,
  willRun,
} from "../invention.js";

describe("computers (Campaigns p. 472)", () => {
  it("arrives at TL7", () => {
    expect(COMPUTER_TL).toBe(7);
  });

  it("runs nothing above its own Complexity", () => {
    expect(willRun({ computer: 2, program: 2 })).toBe(true);
    expect(willRun({ computer: 2, program: 3 })).toBe(false);
    expect(programsAtOnce({ computer: 2, program: 3 })).toBe(0);
  });

  it("runs two of its own, twenty of one less, two hundred of two less", () => {
    expect(programsAtOnce({ computer: 2, program: 2 })).toBe(2);
    expect(programsAtOnce({ computer: 2, program: 1 })).toBe(20);
    expect(programsAtOnce({ computer: 3, program: 1 })).toBe(200);
  });

  it("works the book's own mixed load", () => {
    // "a Complexity 2 computer could run two Complexity 2 programs or 20
    // Complexity 1 programs - or one Complexity 2 program and 10 Complexity 1."
    expect(fitsAtOnce({ computer: 2, programs: [2, 2] })).toBe(true);
    expect(fitsAtOnce({ computer: 2, programs: Array(20).fill(1) })).toBe(true);
    expect(fitsAtOnce({ computer: 2, programs: [2, ...Array(10).fill(1)] })).toBe(true);
  });

  it("refuses one program too many", () => {
    expect(fitsAtOnce({ computer: 2, programs: [2, 2, 2] })).toBe(false);
    expect(fitsAtOnce({ computer: 2, programs: [2, ...Array(11).fill(1)] })).toBe(false);
    expect(fitsAtOnce({ computer: 2, programs: [3] })).toBe(false);
  });
});

describe("how hard a thing is to invent (p. 473)", () => {
  it("carries the book's four grades and their skill levels", () => {
    expect(INVENTION_GRADES).toEqual(["simple", "average", "complex", "amazing"]);
    expect(gradeRow("simple").skill).toBe(14);
    expect(gradeRow("average").skill).toBe(15);
    expect(gradeRow("complex").skill).toBe(18);
    expect(gradeRow("amazing").skill).toBe(21);
  });

  it("reads a grade off a retail price", () => {
    expect(gradeForPrice(100)).toBe("simple");
    expect(gradeForPrice(101)).toBe("average");
    expect(gradeForPrice(10000)).toBe("average");
    expect(gradeForPrice(999999)).toBe("complex");
    expect(gradeForPrice(2000000)).toBe("amazing");
  });

  it("reads a grade off a program's Complexity", () => {
    // "treat Complexity 1-3 as Simple, 4-5 as Average."
    expect(gradeForComplexity(3)).toBe("simple");
    expect(gradeForComplexity(5)).toBe("average");
    expect(gradeForComplexity(7)).toBe("complex");
    expect(gradeForComplexity(9)).toBe("amazing");
  });

  it("makes yesterday's technology easier, a step per century", () => {
    // "Reduce complexity by one step per TL... to a minimum of Simple."
    expect(reinventing({ grade: "amazing", inventorTl: 8, inventionTl: 6 })).toBe("average");
    expect(reinventing({ grade: "complex", inventorTl: 8, inventionTl: 3 })).toBe("simple");
    expect(reinventing({ grade: "complex", inventorTl: 8, inventionTl: 8 })).toBe("complex");
  });
});

describe("the Concept roll (p. 473)", () => {
  it("runs six, ten, fourteen and twenty-two against the inventor", () => {
    expect(conceptModifier({ grade: "simple" })).toBe(-6);
    expect(conceptModifier({ grade: "average" })).toBe(-10);
    expect(conceptModifier({ grade: "complex" })).toBe(-14);
    expect(conceptModifier({ grade: "amazing" })).toBe(-22);
  });

  it("takes twice the Complexity instead, for a program", () => {
    expect(conceptModifier({ grade: "amazing", complexity: 4 })).toBe(-8);
  });

  it("is five better with a model to copy, and two with only the rumour", () => {
    expect(conceptModifier({ grade: "average", workingModel: true })).toBe(-5);
    expect(conceptModifier({ grade: "average", knownToExist: true })).toBe(-8);
  });

  it("is worse for a new science and for being ahead of its time, and both", () => {
    expect(conceptModifier({ grade: "average", newTechnology: true })).toBe(-15);
    expect(conceptModifier({ grade: "average", aheadOfItsTime: true })).toBe(-15);
    expect(conceptModifier({ grade: "average", newTechnology: true, aheadOfItsTime: true })).toBe(-20);
  });

  it("caps what a variant and a good pitch are worth", () => {
    expect(conceptModifier({ grade: "average", variant: 9 })).toBe(-5);
    expect(conceptModifier({ grade: "average", wellDescribed: 7 })).toBe(-8);
  });
});

describe("the Prototype roll (p. 474)", () => {
  it("counts four assistants and no more", () => {
    expect(assistantBonus(2)).toBe(2);
    expect(assistantBonus(9)).toBe(4);
    expect(assistantBonus(0)).toBe(0);
  });

  it("adds the helpers and takes off the workshop", () => {
    expect(prototypeModifier({ concept: -10, assistants: 3, poorTools: 4 })).toBe(-11);
    expect(prototypeModifier({ concept: -10, poorTools: 20 })).toBe(-20);
  });

  it("prices the facilities, tripled ahead of its time and tenthed when reused", () => {
    expect(facilitiesCost({ grade: "simple" })).toBe(50000);
    expect(facilitiesCost({ grade: "amazing" })).toBe(500000);
    expect(facilitiesCost({ grade: "complex", aheadOfItsTime: true })).toBe(750000);
    expect(facilitiesCost({ grade: "complex", reusingFacilities: true })).toBe(25000);
  });

  it("takes days for the small and months for the grand, divided among the hands", () => {
    expect(prototypeTime({ grade: "simple" })).toMatchObject({ unit: "days", dividedBy: 1 });
    expect(prototypeTime({ grade: "simple" }).dice).toEqual({ dice: 1, adds: -2 });
    expect(prototypeTime({ grade: "amazing" })).toMatchObject({ unit: "months" });
    expect(prototypeTime({ grade: "complex", people: 4 }).dividedBy).toBe(4);
    expect(MINIMUM_INVENTION_DAYS).toBe(1);
  });
});

describe("bugs (p. 474)", () => {
  it("comes out clean only on a critical success", () => {
    expect(prototypeBugs({ success: true, margin: 9, criticalSuccess: true }))
      .toEqual({ major: null, minor: null, flawless: true });
  });

  it("has minor bugs alone on a wide success", () => {
    expect(prototypeBugs({ success: true, margin: 3, criticalSuccess: false }))
      .toEqual({ major: null, minor: { dice: 1, adds: 0 }, flawless: false });
  });

  it("has both on a narrow one", () => {
    expect(prototypeBugs({ success: true, margin: 2, criticalSuccess: false }))
      .toEqual({ major: { dice: 1, adds: 0 }, minor: { dice: 1, adds: 0 }, flawless: false });
  });

  it("produces nothing at all on a failure", () => {
    expect(prototypeBugs({ success: false, margin: -1, criticalSuccess: false })).toBe(null);
  });

  it("halves the die the bug count is rolled on", () => {
    expect(halveDice(5)).toBe(2);
    expect(halveDice(6)).toBe(3);
    expect(halveDice(1)).toBe(0);
  });

  it("blows the workshop up on a critical failure", () => {
    expect(WORKSHOP_EXPLOSION).toEqual({ dice: 2, adds: 0 });
  });
});
