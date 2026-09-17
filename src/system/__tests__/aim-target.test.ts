import { afterEach, describe, expect, it } from "vitest";

import { aimStateOf, aimTargetLines } from "../aim.js";
import { attackerMovement } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.canvas;
});

/** Aim bonuses a module gives for one foe (sargas79/GWorldVTT#483). */
describe("per-target aim bonuses (since 1.63.0)", () => {
  const actor = {
    system: { aim: { turns: 2, braced: false, target: "Scene.a.Token.b", bonuses: [{ label: "Optics", value: 2, key: "" }, { label: "", value: 0 }] } },
  };

  it("reads the aim as stored, dropping empty bonuses", () => {
    expect(aimStateOf(actor)).toEqual({ turns: 2, braced: false, target: "Scene.a.Token.b", bonuses: [{ label: "Optics", value: 2 }] });
  });

  it("gives the bonuses only while aiming, at the foe aimed at", () => {
    const aim = aimStateOf(actor);
    expect(aimTargetLines(aim, 2, "Scene.a.Token.b")).toEqual([{ label: "Optics", value: 2, key: "aimTarget" }]);
    expect(aimTargetLines(aim, 2, "Scene.a.Token.c")).toEqual([]);
    expect(aimTargetLines(aim, 0, "Scene.a.Token.b")).toEqual([]);
  });
});

describe("the attacker's movement (since 1.63.0)", () => {
  it("measures the token's movement history in yards", () => {
    globals.canvas = { scene: { grid: { units: "yd" } }, grid: { measurePath: (points: unknown[]) => ({ distance: (points.length - 1) * 3 }) } };
    const mover = { system: { maneuver: "moveAndAttack" }, getActiveTokens: () => [{ document: { movementHistory: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] } }] };
    expect(attackerMovement(mover)).toEqual({ maneuver: "moveAndAttack", yards: 6 });
    expect(attackerMovement({ system: { maneuver: "attack" } })).toEqual({ maneuver: "attack", yards: null });
  });
});
