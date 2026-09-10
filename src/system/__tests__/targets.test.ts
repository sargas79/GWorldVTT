import { afterEach, describe, expect, it } from "vitest";

import { currentTargets, targetedTokens } from "../targets.js";

const globals = globalThis as Record<string, unknown>;

/** Stands in for the two Foundry globals these functions read. */
function stub(options: { targeted?: unknown[]; selected?: unknown[] }) {
  globals.game = { user: { targets: new Set(options.targeted ?? []) } };
  globals.canvas = { tokens: { controlled: options.selected ?? [] } };
}

afterEach(() => {
  delete globals.game;
  delete globals.canvas;
});

const attacker = { name: "Attacker" };
const victim = { name: "Victim" };

describe("targetedTokens", () => {
  it("reports what the user targeted", () => {
    stub({ targeted: [victim], selected: [attacker] });
    expect(targetedTokens()).toEqual([victim]);
  });

  /**
   * The distinction this exists for. An attacker has their own token selected
   * far more often than not, so an attack that fell back to the selection
   * would record the attacker as the person defending against themselves.
   */
  it("does not fall back to the selection", () => {
    stub({ targeted: [], selected: [attacker] });
    expect(targetedTokens()).toEqual([]);
  });
});

describe("currentTargets", () => {
  it("prefers the target over the selection", () => {
    stub({ targeted: [victim], selected: [attacker] });
    expect(currentTargets()).toEqual([victim]);
  });

  it("falls back to the selection, which is how a GM usually acts on a token", () => {
    stub({ targeted: [], selected: [victim] });
    expect(currentTargets()).toEqual([victim]);
  });

  it("returns nothing when neither is set", () => {
    stub({});
    expect(currentTargets()).toEqual([]);
  });

  it("survives a world with no canvas drawn", () => {
    globals.game = { user: { targets: new Set() } };
    globals.canvas = null;
    expect(currentTargets()).toEqual([]);
  });
});
