import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

import { announceShots } from "../ammunition.js";
import { clearingAttempt, clearingProcedure, malfunctionOf, malfunctionWithHooks } from "../malfunctions.js";
import { shotsEntryFor } from "../shots-entry.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

function listen(hook: string, listener: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === hook) listener(context); } };
}

/** A rifle out of action with the flag given, held by someone with Guns 14 at DX 12, IQ 10. */
function rifle(flag: Record<string, unknown> | null = null) {
  const item: any = {
    id: "rifle",
    name: "Rifle",
    isOwner: true,
    flags: flag ? { gworld: { malfunction: flag } } : {},
    system: { rangedModes: [{ shots: "30(3)", loaded: 30, skill: "Guns (Rifle)" }] },
  };
  const actor: any = {
    items: [{ type: "skill", name: "Guns/TL8 (Rifle)", system: { attribute: "DX", derived: { level: 14 } } }],
    system: {
      derived: { attributes: { ST: 10, DX: 12, IQ: 10, HT: 10 }, ranged: [{ itemId: "rifle", modeIndex: 0, skillLevel: 14, skillName: "Guns (Rifle)" }] },
    },
  };
  return { item, actor };
}

describe("gworld.malfunction (sargas79/GWorldVTT#594)", () => {
  const base = { actor: null, item: null, modeIndex: 0, attackRoll: 17, roll: 10, techLevel: 8, revolver: false };

  it("reports the table's result when nobody listens", () => {
    expect(malfunctionWithHooks({ ...base, kind: "stoppage" })).toMatchObject({ kind: "stoppage", fires: true, clears: false, jams: true });
    expect(malfunctionWithHooks({ ...base, revolver: true, kind: "misfire" })).toMatchObject({ kind: "misfire", clears: true, jams: false });
  });

  it("lets a listener replace the result, and works the rest out for the new kind", () => {
    const seen: any[] = [];
    listen("gworld.malfunction", (context) => { seen.push({ ...context }); context.kind = "misfire"; });
    expect(malfunctionWithHooks({ ...base, kind: "stoppage" })).toMatchObject({ kind: "misfire", fires: false, jams: true });
    expect(seen[0]).toMatchObject({ attackRoll: 17, roll: 10, kind: "stoppage", modeIndex: 0 });
  });

  it("keeps what a listener set itself, and takes a kind of its own", () => {
    listen("gworld.malfunction", (context) => { context.kind = "overheated"; context.label = "Overheated"; context.jams = false; });
    expect(malfunctionWithHooks({ ...base, kind: "mechanical" })).toMatchObject({ kind: "overheated", label: "Overheated", jams: false, fires: false });
  });

  it("lets a listener call it off", () => {
    listen("gworld.malfunction", (context) => { context.kind = null; });
    expect(malfunctionWithHooks({ ...base, kind: "mechanical" })).toBeNull();
  });
});

describe("clearing a malfunction (sargas79/GWorldVTT#594)", () => {
  it("reads nothing wrong without the flag", () => {
    const { item, actor } = rifle();
    expect(malfunctionOf(item)).toBeNull();
    expect(clearingProcedure(actor, item)).toBeNull();
  });

  it("offers Armoury at its default and the IQ-based weapon skill, at the table's modifiers and time", () => {
    const { item, actor } = rifle({ kind: "stoppage", label: "Stoppage", modeIndex: 0 });
    const procedure = clearingProcedure(actor, item)!;
    expect(procedure.rolls).toEqual([
      expect.objectContaining({ key: "armoury", level: 5, modifier: 0 }),
      expect.objectContaining({ key: "weapon", level: 12, modifier: -4 }),
    ]);
    expect(procedure).toMatchObject({ readyManeuvers: 3, hours: 0, needsBothHands: true, criticalFailure: "mechanical", refusal: null });
  });

  it("lets a listener change the procedure and offer an assistant", () => {
    const { item, actor } = rifle({ kind: "misfire", modeIndex: 0 });
    listen("gworld.clearMalfunction", (context) => {
      context.readyManeuvers = 2;
      context.modifiers.push({ label: "Fouled", value: -1 });
      context.aids.push({ id: "assistant", label: "Assistant", modifier: 1, readyManeuvers: 1 });
    });
    const procedure = clearingProcedure(actor, item)!;
    expect(procedure.readyManeuvers).toBe(2);
    const alone = clearingAttempt(procedure, { roll: "armoury", aids: [] });
    expect(alone).toMatchObject({ readyManeuvers: 2, modifiers: [{ label: "Armoury", value: 2 }, { label: "Fouled", value: -1 }] });
    const helped = clearingAttempt(procedure, { roll: "armoury", aids: ["assistant"], modifier: -2 });
    expect(helped.readyManeuvers).toBe(1);
    expect(helped.modifiers.map((l) => l.value)).toEqual([2, -1, 1, -2]);
  });

  it("refuses a destroyed weapon", () => {
    const { item, actor } = rifle({ kind: "destroyed", modeIndex: 0 });
    expect(clearingProcedure(actor, item)!.refusal).toBeTruthy();
  });
});

describe("gworld.afterShots (sargas79/GWorldVTT#594)", () => {
  it("says once what an attack spent, with the mode", () => {
    const seen: any[] = [];
    listen("gworld.afterShots", (context) => seen.push(context));
    const { item, actor } = rifle();
    announceShots({ actor, item, modeIndex: 0, fired: 9, extra: 1, wasted: 2, kind: "spraying", targets: 3 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ actor, item, modeIndex: 0, mode: item.system.rangedModes[0], shots: 12, fired: 9, extra: 1, wasted: 2, kind: "spraying", targets: 3 });
  });

  it("says nothing for an attack that spent nothing, or a mode that isn't there", () => {
    const seen: any[] = [];
    listen("gworld.afterShots", (context) => seen.push(context));
    const { item, actor } = rifle();
    announceShots({ actor, item, modeIndex: 0, fired: 0, extra: 0, wasted: 0, kind: "single", targets: 1 });
    announceShots({ actor, item, modeIndex: 4, fired: 1, extra: 0, wasted: 0, kind: "single", targets: 1 });
    expect(seen).toHaveLength(0);
  });
});

describe("gworld.shotsEntry's Fast-Draw and aids (sargas79/GWorldVTT#594)", () => {
  it("takes what Fast-Draw (Ammo) saves and the aids a listener offers, and drops nonsense", () => {
    listen("gworld.shotsEntry", (context) => {
      context.entry.fastDrawSeconds = 2;
      context.entry.fastDrawPer = "round";
      context.entry.aids = [{ id: "assistant", label: "Assistant", seconds: -1 }, { label: "no id" }, null];
    });
    const { item } = rifle();
    expect(shotsEntryFor(item, 0)).toMatchObject({
      fastDrawSeconds: 2,
      fastDrawPer: "round",
      aids: [{ id: "assistant", label: "Assistant", seconds: -1, checked: false }],
    });
  });

  it("keeps the Basic Set's second where a listener writes something that isn't a number", () => {
    listen("gworld.shotsEntry", (context) => { context.entry.fastDrawSeconds = "lots"; context.entry.fastDrawPer = "sometimes"; });
    expect(shotsEntryFor(rifle().item, 0)).toMatchObject({ fastDrawSeconds: 1, fastDrawPer: "reload", aids: [] });
  });
});
