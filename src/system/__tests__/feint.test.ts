import { afterEach, describe, expect, it } from "vitest";

import { SYSTEM_ID } from "../constants.js";
import { clearFeint, consumeFeint, feintDefenseScore, recordFeint } from "../feint.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
});

/**
 * Stands in for the Foundry globals these read: who is targeted, and which
 * combat and round it is.
 */
function targeting(uuids: string[], combat?: { id: string; round: number }): void {
  globals.game = {
    user: { targets: new Set(uuids.map((uuid) => ({ actor: { uuid } }))) },
    ...(combat ? { combat } : {}),
  };
}

/** An actor whose flags can be set and read, as a Foundry document's can. */
function actor(options: { uuid?: string; isOwner?: boolean } = {}) {
  const flags: Record<string, unknown> = {};
  return {
    uuid: options.uuid ?? "Actor.attacker",
    isOwner: options.isOwner ?? true,
    flags,
    getFlag: (scope: string, key: string) => flags[`${scope}.${key}`],
    setFlag: async (scope: string, key: string, value: unknown) => {
      flags[`${scope}.${key}`] = value;
    },
    unsetFlag: async (scope: string, key: string) => {
      delete flags[`${scope}.${key}`];
    },
  };
}

describe("remembering a feint", () => {
  it("keeps the penalty until the next attack spends it", async () => {
    const attacker = actor();
    await recordFeint(attacker, "Actor.foe", -3);
    expect(attacker.getFlag(SYSTEM_ID, "feint")).toEqual({ target: "Actor.foe", penalty: -3 });

    targeting(["Actor.foe"]);
    expect(await consumeFeint(attacker)).toBe(-3);
  });

  /** "A Feint is good for one second" -- the next attack ends it either way. */
  it("is spent even by an attack aimed at somebody else", async () => {
    const attacker = actor();
    await recordFeint(attacker, "Actor.foe", -3);

    targeting(["Actor.bystander"]);
    expect(await consumeFeint(attacker)).toBe(0);
    expect(attacker.getFlag(SYSTEM_ID, "feint")).toBeUndefined();
  });

  it("leaves the flag empty once spent", async () => {
    const attacker = actor();
    await recordFeint(attacker, "Actor.foe", -3);

    targeting(["Actor.foe"]);
    await consumeFeint(attacker);
    expect(await consumeFeint(attacker)).toBe(0);
  });

  it("records nothing for a feint that achieved nothing", async () => {
    const attacker = actor();
    await recordFeint(attacker, "Actor.foe", 0);
    expect(attacker.getFlag(SYSTEM_ID, "feint")).toBeUndefined();
  });

  it("asks about no targets when there is no feint to spend", async () => {
    // No game global at all: with nothing pending, nothing should be read.
    expect(await consumeFeint(actor())).toBe(0);
  });

  /** "A Feint is good for one second": this turn and the next, not longer. */
  it("still counts on the turn after it was made", async () => {
    const attacker = actor();
    targeting([], { id: "Combat.1", round: 3 });
    await recordFeint(attacker, "Actor.foe", -3);

    targeting(["Actor.foe"], { id: "Combat.1", round: 4 });
    expect(await consumeFeint(attacker)).toBe(-3);
  });

  it("is worthless once the fight has moved on", async () => {
    const attacker = actor();
    targeting([], { id: "Combat.1", round: 3 });
    await recordFeint(attacker, "Actor.foe", -3);

    targeting(["Actor.foe"], { id: "Combat.1", round: 5 });
    expect(await consumeFeint(attacker)).toBe(0);
  });

  it("does not survive into a different fight", async () => {
    const attacker = actor();
    targeting([], { id: "Combat.1", round: 3 });
    await recordFeint(attacker, "Actor.foe", -3);

    targeting(["Actor.foe"], { id: "Combat.2", round: 3 });
    expect(await consumeFeint(attacker)).toBe(0);
  });

  /** Outside a fight nothing counts rounds, so nothing expires. */
  it("keeps a feint made with no combat running", async () => {
    const attacker = actor();
    targeting([]);
    await recordFeint(attacker, "Actor.foe", -2);

    targeting(["Actor.foe"], { id: "Combat.1", round: 9 });
    expect(await consumeFeint(attacker)).toBe(-2);
  });

  it("can be thrown away without being applied", async () => {
    const attacker = actor();
    await recordFeint(attacker, "Actor.foe", -2);
    await clearFeint(attacker);
    expect(attacker.getFlag(SYSTEM_ID, "feint")).toBeUndefined();
  });
});

describe("what a foe rolls against a feint", () => {
  const foe = (options: {
    dx?: number;
    melee?: Array<{ skillName: string; skillLevel: number | null }>;
    skills?: Array<{ name: string; level: number }>;
  }) => ({
    system: {
      attributes: { DX: options.dx ?? 10 },
      derived: { melee: options.melee ?? [] },
    },
    items: (options.skills ?? []).map((skill) => ({
      type: "skill",
      name: skill.name,
      system: { derived: { level: skill.level } },
    })),
  });

  it("rolls DX when they have no combat skill at all", () => {
    expect(feintDefenseScore(foe({ dx: 12 }))).toEqual({ score: 12, source: "DX" });
  });

  it("rolls their best weapon skill when it beats DX", () => {
    const best = feintDefenseScore(
      foe({
        dx: 12,
        melee: [
          { skillName: "Brawling", skillLevel: 11 },
          { skillName: "Broadsword", skillLevel: 15 },
        ],
      }),
    );
    expect(best).toEqual({ score: 15, source: "Broadsword" });
  });

  it("keeps DX when it beats every skill they have", () => {
    const best = feintDefenseScore({
      ...foe({ dx: 14, melee: [{ skillName: "Knife", skillLevel: 12 }] }),
    });
    expect(best.score).toBe(14);
    expect(best.source).toBe("DX");
  });

  /** "Your opponent may opt to roll against Cloak or Shield skill". */
  it("rolls Shield or Cloak when that is their best", () => {
    const best = feintDefenseScore(
      foe({ dx: 10, melee: [{ skillName: "Axe/Mace", skillLevel: 12 }], skills: [
        { name: "Shield", level: 16 },
        { name: "Stealth", level: 18 },
      ] }),
    );
    expect(best).toEqual({ score: 16, source: "Shield" });
  });

  it("ignores an attack whose skill the foe does not have", () => {
    const best = feintDefenseScore(
      foe({ dx: 11, melee: [{ skillName: "Rapier", skillLevel: null }] }),
    );
    expect(best).toEqual({ score: 11, source: "DX" });
  });

  it("survives an actor with nothing on it", () => {
    expect(feintDefenseScore({}).score).toBe(10);
  });
});
