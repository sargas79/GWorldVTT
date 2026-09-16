import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyAfflictionEffects } from "../afflictions.js";
import { successRollModifiers } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  // Foundry's localiser, as far as naming a system condition needs it.
  globals.game = { i18n: { localize: (key: string) => key, format: (key: string) => key } };
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.game;
  vi.restoreAllMocks();
});

/** A victim the condition code can write to: flags and token statuses. */
function victim() {
  const statuses = new Set<string>();
  const flags: Record<string, unknown> = {};
  return {
    name: "Target",
    isOwner: true,
    statuses,
    items: [] as unknown[],
    system: {},
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => {
      flags[key] = value;
    }),
    update: vi.fn(async () => undefined),
    toggleStatusEffect: vi.fn(async (id: string, { active }: { active: boolean }) => {
      if (active) statuses.add(id);
      else statuses.delete(id);
    }),
  };
}

const attack = { attacker: { name: "Shooter" }, item: null, mode: null, label: "Stun Gun", margin: -3 };

describe("gworld.afflictionEffect (since 1.49.0)", () => {
  it("applies the condition a module names for its own weapon", async () => {
    const target = victim();
    globals.Hooks = {
      callAll: (event: string, context: { effects?: unknown[] }) => {
        if (event === "gworld.afflictionEffect") {
          context.effects!.push({ key: "stunned", duration: { turns: 1 } });
        }
      },
    };
    const applied = await applyAfflictionEffects({ actor: target, ...attack });
    expect(applied).toEqual(["stunned"]);
    expect(target.statuses.has("stunned")).toBe(true);
  });

  it("applies more than one, so a module can add a second beside the first", async () => {
    const target = victim();
    globals.Hooks = {
      callAll: (event: string, context: { effects?: unknown[] }) => {
        if (event !== "gworld.afflictionEffect") return;
        context.effects!.push({ key: "stunned" }, { key: "prone" });
      },
    };
    expect(await applyAfflictionEffects({ actor: target, ...attack })).toEqual(["stunned", "prone"]);
  });

  it("applies nothing where no module is listening", async () => {
    // Which of the Basic Set's own afflictions a hit inflicts is the GM's
    // call, and the card asks. Nothing is chosen here.
    const target = victim();
    delete globals.Hooks;
    expect(await applyAfflictionEffects({ actor: target, ...attack })).toEqual([]);
    expect(target.toggleStatusEffect).not.toHaveBeenCalled();
  });

  it("tells the listener what forced the roll and by how much it failed", async () => {
    const target = victim();
    let seen: Record<string, unknown> | null = null;
    globals.Hooks = {
      callAll: (event: string, context: Record<string, unknown>) => {
        if (event === "gworld.afflictionEffect") seen = { ...context };
      },
    };
    await applyAfflictionEffects({ actor: target, ...attack });
    expect(seen).toMatchObject({ label: "Stun Gun", margin: -3, attacker: { name: "Shooter" } });
  });

  it("ignores an effect naming a condition that does not exist", async () => {
    const target = victim();
    globals.Hooks = {
      callAll: (event: string, context: { effects?: unknown[] }) => {
        if (event === "gworld.afflictionEffect") context.effects!.push({ key: "made-up" });
      },
    };
    expect(await applyAfflictionEffects({ actor: target, ...attack })).toEqual([]);
  });
});

describe("the attack a resistance roll is made against (since 1.49.0)", () => {
  it("reaches a successRollModifiers listener untouched", () => {
    let seen: Record<string, unknown> | null = null;
    globals.Hooks = {
      callAll: (_event: string, context: Record<string, unknown>) => {
        seen = { tags: context.tags, attack: context.attack };
        (context.modifiers as Array<{ label: string; value: number }>).push({ label: "Sealed suit", value: 4 });
      },
    };
    const added = successRollModifiers({
      actor: { name: "Target" },
      label: "Resist",
      kind: "attribute",
      skill: "",
      base: 10,
      tags: ["resist", "affliction"],
      modifiers: [],
      attack: {
        attacker: { name: "Shooter" },
        item: null,
        mode: { index: 0, ranged: true },
        distanceYards: 12,
        halfDamageRange: 5,
        dr: 6,
        drCounted: true,
      },
    });
    expect(added).toEqual([{ label: "Sealed suit", value: 4 }]);
    expect(seen).toMatchObject({
      // successRollModifiers passes the caller's tags through as they are; the
      // kind is added by the roll itself, one layer up.
      tags: ["resist", "affliction"],
      attack: { distanceYards: 12, halfDamageRange: 5, dr: 6, drCounted: true },
    });
  });
});
