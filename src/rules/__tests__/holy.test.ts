import { describe, expect, it } from "vitest";

import { HOLY_FIZZ_SECONDS, holyContact, vulnerableToHoly } from "../holy.js";

/** Monster Hunters 1 p. 51. */
describe("who holy things hurt", () => {
  it("is whoever has a Weakness to holy things", () => {
    expect(vulnerableToHoly([{ source: "Contact with holy water and artifacts" }])).toBe(true);
    expect(vulnerableToHoly([{ source: "Sunlight" }])).toBe(false);
    expect(vulnerableToHoly([])).toBe(false);
  });
});

describe("a holy contact", () => {
  it("burns a vulnerable creature and starts the minute of fizzing", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 0, now: 100 })).toEqual({
      burns: true, fizzing: false, fizzingUntil: 100 + HOLY_FIZZ_SECONDS,
    });
  });

  it("does nothing more while the wound fizzes, and does not restart the minute", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 160, now: 130 })).toEqual({
      burns: false, fizzing: true, fizzingUntil: 160,
    });
  });

  it("burns again once the minute is past: 1d a minute, submerged", () => {
    expect(holyContact({ vulnerable: true, fizzingUntil: 160, now: 160 }).burns).toBe(true);
  });

  it("does nothing to a creature holy things do not hurt", () => {
    expect(holyContact({ vulnerable: false, fizzingUntil: 0, now: 100 })).toEqual({
      burns: false, fizzing: false, fizzingUntil: 0,
    });
  });
});
