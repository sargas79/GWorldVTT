import { afterEach, describe, expect, it } from "vitest";

import { currentTargets, ownsATokenOnScene, targetedTokens } from "../targets.js";

const globals = globalThis as Record<string, unknown>;

/** Stands in for the two Foundry globals these functions read. */
function stub(options: { targeted?: unknown[]; selected?: unknown[]; drawn?: unknown[] }) {
  globals.game = { user: { targets: new Set(options.targeted ?? []) } };
  globals.canvas = { tokens: { controlled: options.selected ?? [], placeables: options.drawn ?? [] } };
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

/**
 * Who a control that acts on your own character belongs to. The damage card's
 * Apply button is the case: the blow comes off the victim's sheet, so their
 * player is offered it -- and a player with no character on the scene is not.
 */
describe("ownsATokenOnScene", () => {
  it("is true where one of the tokens drawn is the user's own", () => {
    stub({ drawn: [{ actor: { isOwner: false } }, { actor: { isOwner: true } }] });
    expect(ownsATokenOnScene()).toBe(true);
  });

  it("is false where none of them is", () => {
    stub({ drawn: [{ actor: { isOwner: false } }, { actor: null }, {}] });
    expect(ownsATokenOnScene()).toBe(false);
  });

  it("survives a world with no canvas drawn", () => {
    globals.game = { user: { targets: new Set() } };
    globals.canvas = null;
    expect(ownsATokenOnScene()).toBe(false);
  });
});
