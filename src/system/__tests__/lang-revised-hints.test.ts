import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lang = JSON.parse(readFileSync(resolve(__dirname, "../../../lang/en.json"), "utf8")) as any;

/** Hint text that follows the Revised edition's figures. */
describe("hints that state a Revised figure", () => {
  /**
   * Characters p. 11: "A good rule of thumb is to hold disadvantages to -50 points"
   * (the 2004 text said 50% of starting points).
   */
  it("gives the disadvantage limit as -50 points, not half the starting points", () => {
    const hint = String(lang.GWORLD.Hint.DisadvantageLimit);
    expect(hint).toContain("-50 points");
    expect(hint).not.toMatch(/50%|half/i);
  });
});
