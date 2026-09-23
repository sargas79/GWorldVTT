import { afterEach, describe, expect, it } from "vitest";

import { aimStateOf, aimTargetLines, loseAim } from "../aim.js";
import { attackerMovement } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.canvas;
  delete globals.game;
  delete globals.ui;
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

/** Ending an aim for a module's rule (Campaigns p. 364; since 1.87.0). */
describe("loseAim", () => {
  const setup = () => {
    const notes: string[] = [];
    globals.game = { i18n: { format: (key: string, data: Record<string, string>) => `${key}|${data.name}|${data.reason ?? ""}` } };
    globals.ui = { notifications: { info: (text: string) => notes.push(text) } };
    const updates: Record<string, unknown>[] = [];
    const actor = {
      name: "Archer",
      isOwner: true,
      system: { aim: { turns: 2, target: "Scene.a.Token.b", bonuses: [{ label: "Optics", value: 1 }] } },
      update: async (data: Record<string, unknown>) => void updates.push(data),
    };
    return { notes, updates, actor };
  };

  it("clears the aim and shows the module's reason as given", async () => {
    const { notes, updates, actor } = setup();
    expect(await loseAim(actor, "the mount bolted")).toBe(true);
    expect(updates).toEqual([{ "system.aim.turns": 0, "system.aim.target": "", "system.aim.bonuses": [] }]);
    expect(notes).toEqual(["GWORLD.Aim.Lost.other|Archer|the mount bolted"]);
  });

  it("uses the system's words for its own reasons, and a plain note for none", async () => {
    const first = setup();
    await loseAim(first.actor, "injured");
    expect(first.notes).toEqual(["GWORLD.Aim.Lost.injured|Archer|"]);
    const second = setup();
    await loseAim(second.actor, "");
    expect(second.notes).toEqual(["GWORLD.Aim.Lost.plain|Archer|"]);
  });

  it("does nothing, and says so, where there was no aim or no right to change it", async () => {
    const { notes, updates, actor } = setup();
    expect(await loseAim({ ...actor, system: { aim: { turns: 0 } } }, "x")).toBe(false);
    expect(await loseAim({ ...actor, isOwner: false }, "x")).toBe(false);
    expect(updates).toEqual([]);
    expect(notes).toEqual([]);
  });
});
