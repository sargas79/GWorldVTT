import { afterEach, describe, expect, it, vi } from "vitest";

import { moduleMove } from "../data-extensions.js";
import { restoreFatigue } from "../fatigue.js";
import { activeConditions, applyCondition, patchCondition } from "../procedure-extensions.js";
import { surpriseKind, surpriseRecoveryBonus, SURPRISE_COMBAT_REFLEXES_BONUS } from "../../rules/surprise.js";

/** Water Move, restoring FP and mental stun (sargas79/GWorldVTT#692). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
  delete globals.game;
});

describe("gworld.moveModifiers for water Move", () => {
  it("tells the listener the medium, and counts a line only on the call for its own", () => {
    const seen: string[] = [];
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        seen.push(context.medium);
        context.lines.push({ label: "Boots", value: 1 });
        context.lines.push({ label: "Swim fins", multiplier: 1.5, medium: "water" });
      },
    };
    expect(moduleMove({}, 5)).toMatchObject({ move: 6, lines: [{ label: "Boots" }] });
    expect(moduleMove({}, 2, "water")).toMatchObject({ move: 3, lines: [{ label: "Swim fins" }] });
    expect(seen).toEqual(["ground", "water"]);
  });
});

describe("restoreFatigue", () => {
  const actor = (value: number, max: number, isOwner = true) => {
    const a: any = { isOwner, system: { fp: { value, max } }, update: vi.fn(async (c: any) => { a.system.fp.value = c["system.fp.value"]; }) };
    return a;
  };

  it("gives FP back up to the most there are, and says so", async () => {
    const a = actor(3, 10);
    expect(await restoreFatigue(a, 4, { reason: "drug" })).toEqual({ from: 3, to: 7, max: 10, reason: "drug" });
    expect(await restoreFatigue(a, 9)).toEqual({ from: 7, to: 10, max: 10, reason: "" });
    expect(a.system.fp.value).toBe(10);
  });

  it("works from below zero, and refuses a stranger or a nonsense amount", async () => {
    expect(await restoreFatigue(actor(-4, 10), 2)).toMatchObject({ from: -4, to: -2 });
    expect(await restoreFatigue(actor(3, 10, false), 2)).toBeNull();
    expect(await restoreFatigue(actor(3, 10), 0)).toBeNull();
    expect(await restoreFatigue(actor(3, 10), Number.NaN)).toBeNull();
  });
});

describe("mental stun and surprise (Campaigns pp. 393, 420)", () => {
  it("treats total surprise as partial for Combat Reflexes", () => {
    expect(surpriseKind(true, false)).toBe("total");
    expect(surpriseKind(true, true)).toBe("partial");
    expect(surpriseKind(false, false)).toBe("partial");
  });

  it("is +6 for Combat Reflexes and, with partial surprise, a point per roll failed", () => {
    expect(surpriseRecoveryBonus({ partial: false, tries: 3, combatReflexes: false })).toBe(0);
    expect(surpriseRecoveryBonus({ partial: true, tries: 2, combatReflexes: false })).toBe(2);
    expect(surpriseRecoveryBonus({ partial: true, tries: 1, combatReflexes: true })).toBe(SURPRISE_COMBAT_REFLEXES_BONUS + 1);
  });

  it("keeps a stun applied with IQ recovery as a mental one, and a patch on it", async () => {
    globals.game = { combat: null, time: { worldTime: 0 } };
    const store: Record<string, unknown> = {};
    const actor: any = {
      isOwner: true,
      getFlag: (_s: string, key: string) => store[key],
      setFlag: async (_s: string, key: string, value: unknown) => { store[key] = value; },
    };
    const hooks = { setSystemCondition: vi.fn(async () => {}), systemConditionLabel: (id: string) => (id === "stunned" ? "Stunned" : null) };
    expect(await applyCondition(actor, { key: "stunned", recovery: "IQ" }, hooks)).toBe("stunned");
    expect(activeConditions(actor)[0]).toMatchObject({ id: "stunned", recovery: "IQ" });
    await patchCondition(actor, "stunned", { surprise: { partial: true, tries: 1 } });
    expect(activeConditions(actor)[0]).toMatchObject({ recovery: "IQ", surprise: { partial: true, tries: 1 } });
    // An ordinary stun, and a module's condition, keep no recovery.
    await applyCondition(actor, { key: "stunned" }, hooks);
    expect(activeConditions(actor)[0]?.recovery).toBeUndefined();
  });
});
