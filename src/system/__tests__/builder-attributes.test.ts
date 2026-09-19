import { describe, expect, it } from "vitest";

import { builderAttributeRow } from "../sheet-v2/builder-attributes.js";

/**
 * The guided build's Attributes step (GURPS Basic Set: Characters pp. 14-17,
 * 261). The box edits what was bought; Extra ST and its fellows, and a racial
 * template, move the score without touching it.
 */
describe("an attribute on the guided build's Attributes step", () => {
  it("shows the bought figure alone where nothing else touches it", () => {
    const row = builderAttributeRow({ key: "HT", bought: 12, total: 12, fromTraits: 0, fromTemplate: 0 });
    expect(row).toEqual({ key: "HT", value: 12, total: 12, raised: false, sources: [] });
  });

  // The bug: a level of Extra HT left the step reading HT 10, so the same
  // point was bought a second time in the box.
  it("shows what a trait made of it, and says so", () => {
    const row = builderAttributeRow({ key: "HT", bought: 10, total: 11, fromTraits: 1, fromTemplate: 0 });
    expect(row.value).toBe(10);
    expect(row.total).toBe(11);
    expect(row.raised).toBe(true);
    expect(row.sources).toEqual([{ label: "GWORLD.Builder.FromTraits", labelKey: true, value: 1 }]);
  });

  it("names a racial template's modifiers beside the traits'", () => {
    const row = builderAttributeRow({ key: "ST", bought: 10, total: 14, fromTraits: 2, fromTemplate: 2 });
    expect(row.total).toBe(14);
    expect(row.sources.map((s) => [s.label, s.value])).toEqual([
      ["GWORLD.Builder.FromTraits", 2],
      ["GWORLD.Builder.FromTemplate", 2],
    ]);
  });

  it("takes a modifier down as readily as up", () => {
    const row = builderAttributeRow({ key: "DX", bought: 12, total: 11, fromTraits: 0, fromTemplate: -1 });
    expect(row.raised).toBe(true);
    expect(row.sources).toEqual([{ label: "GWORLD.Builder.FromTemplate", labelKey: true, value: -1 }]);
  });

  it("keeps a module's own reason, and only its own attribute", () => {
    const row = builderAttributeRow({
      key: "IQ", bought: 10, total: 12, fromTraits: 0, fromTemplate: 0,
      moduleLines: [
        { attribute: "IQ", value: 2, label: "Cybernetic co-processor" },
        { attribute: "DX", value: 3, label: "Somebody else's" },
        { attribute: "IQ", value: 0, label: "Worth nothing" },
      ],
    });
    expect(row.sources).toEqual([{ label: "Cybernetic co-processor", labelKey: false, value: 2 }]);
  });

  it("falls back to 10 bought and the bought figure as the total", () => {
    const row = builderAttributeRow({ key: "ST", bought: undefined, total: undefined, fromTraits: undefined, fromTemplate: undefined });
    expect(row).toEqual({ key: "ST", value: 10, total: 10, raised: false, sources: [] });
  });
});
