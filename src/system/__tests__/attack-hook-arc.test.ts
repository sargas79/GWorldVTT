import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { arcAgainstTarget, facingAgainstTarget } from "../attack-arc.js";
import { weaponTargetsFor } from "../weapon-damage.js";

/** The arc on the attack hooks (sargas79/GWorldVTT#739). */

const globals = globalThis as Record<string, unknown>;

/** A flat-topped hex grid, whose direction 0 is due north. */
const scene = { grid: { type: 4, size: 100 } };

/** A defender at the origin, facing south (Foundry's rotation 0). */
function defenderToken(actor: unknown) {
  return { actor, document: { x: 0, y: 0, width: 1, height: 1, rotation: 0, parent: scene } };
}

/** An attacker whose token's centre is 200 px from the defender's on a bearing. */
function attackerAt(bearingDegrees: number) {
  const radians = (bearingDegrees * Math.PI) / 180;
  const x = 50 + 200 * Math.sin(radians) - 50;
  const y = 50 - 200 * Math.cos(radians) - 50;
  return { getActiveTokens: () => [{ document: { x, y, width: 1, height: 1, parent: scene } }] };
}

function world(options: { style?: string; targets?: unknown[] } = {}) {
  globals.game = {
    settings: { get: (_system: string, key: string) => (key === "combatStyle" ? (options.style ?? "tactical") : {}) },
    user: { targets: new Set(options.targets ?? []) },
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.game;
  vi.restoreAllMocks();
});

describe("facingAgainstTarget (since 1.137.0)", () => {
  it("reads the arc, and which side for a side attack, from the tokens", () => {
    world({ targets: [defenderToken({})] });
    expect(facingAgainstTarget(attackerAt(180))).toEqual({ arc: "front", side: null });
    expect(facingAgainstTarget(attackerAt(0))).toEqual({ arc: "back", side: null });
    // Facing south, the defender's right is to the west.
    expect(facingAgainstTarget(attackerAt(300))).toEqual({ arc: "side", side: "right" });
    expect(facingAgainstTarget(attackerAt(60))).toEqual({ arc: "side", side: "left" });
    // The called shot's own reading is the same one.
    expect(arcAgainstTarget(attackerAt(60))).toBe("side");
  });

  it("is null outside tactical combat, or without one target", () => {
    world({ style: "basic", targets: [defenderToken({})] });
    expect(facingAgainstTarget(attackerAt(0))).toBeNull();
    world({ targets: [] });
    expect(facingAgainstTarget(attackerAt(0))).toBeNull();
    world({ targets: [defenderToken({}), defenderToken({})] });
    expect(facingAgainstTarget(attackerAt(0))).toBeNull();
    world({ targets: [defenderToken({})] });
    expect(facingAgainstTarget({ getActiveTokens: () => [] })).toBeNull();
  });
});

describe("gworld.weaponTargets gets the arc (since 1.137.0)", () => {
  const items = new Map([["sword", { id: "sword", name: "Broadsword" }]]);
  const foe = { items: { get: (id: string) => items.get(id) }, system: { derived: { melee: [{ itemId: "sword", name: "Broadsword", reach: "1" }], ranged: [] } } };

  function seen(attacker: unknown): Array<{ arc: unknown; side: unknown }> {
    const contexts: Array<{ arc: unknown; side: unknown }> = [];
    globals.Hooks = { callAll: (_event: string, context: any) => contexts.push({ arc: context.arc, side: context.side }) };
    weaponTargetsFor(attacker, foe);
    return contexts;
  }

  it("from behind the foe targeted, and from a side", () => {
    world({ targets: [defenderToken(foe)] });
    expect(seen(attackerAt(0))).toEqual([{ arc: "back", side: null }]);
    expect(seen(attackerAt(300))).toEqual([{ arc: "side", side: "right" }]);
  });

  it("null outside tactical combat, or for a foe who isn't the one targeted", () => {
    world({ style: "basic", targets: [defenderToken(foe)] });
    expect(seen(attackerAt(0))).toEqual([{ arc: null, side: null }]);
    world({ targets: [defenderToken({})] });
    expect(seen(attackerAt(0))).toEqual([{ arc: null, side: null }]);
  });
});
