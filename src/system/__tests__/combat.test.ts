import { afterEach, beforeEach, describe, expect, it } from "vitest";

const globals = globalThis as Record<string, unknown>;

/** The base class the subclass extends, which Foundry supplies at runtime. */
beforeEach(() => {
  globals.Combat = class {};
});

afterEach(() => {
  delete globals.Combat;
});

/** A combatant, as the comparator reads one. */
function combatant(id: string, initiative: number | null, dx?: number) {
  return {
    id,
    initiative,
    actor: dx === undefined ? null : { system: { attributes: { DX: dx } } },
  };
}

async function sortCombatants() {
  const { GWorldCombat } = await import("../combat.js");
  const combat = new GWorldCombat();
  // Foundry calls the comparator unbound, so the test does too -- a comparator
  // that quietly depended on `this` would pass a bound test and fail in play.
  const compare = combat._sortCombatants;
  return (list: ReturnType<typeof combatant>[]) =>
    [...list].sort(compare).map((c) => c.id);
}

describe("turn order", () => {
  it("puts the highest Basic Speed first", async () => {
    const sort = await sortCombatants();
    expect(
      sort([combatant("slow", 5.0, 10), combatant("fast", 6.25, 10)]),
    ).toEqual(["fast", "slow"]);
  });

  /**
   * The reason this class exists. Basic Speed comes in quarter-point steps, so
   * a party of four will routinely have two people on 5.00, and Foundry's own
   * comparator breaks that tie on the combatant id -- which is to say, at
   * random, ignoring the DX the book says decides it.
   */
  it("breaks a tie on DX, highest first", async () => {
    const sort = await sortCombatants();
    expect(
      sort([combatant("clumsy", 5.0, 10), combatant("nimble", 5.0, 14)]),
    ).toEqual(["nimble", "clumsy"]);
  });

  it("orders a whole party by speed then DX", async () => {
    const sort = await sortCombatants();
    const party = [
      combatant("a", 5.0, 12),
      combatant("b", 6.0, 9),
      combatant("c", 5.0, 15),
      combatant("d", 5.5, 11),
    ];
    expect(sort(party)).toEqual(["b", "d", "c", "a"]);
  });

  it("is stable when speed and DX are both equal, so the order stops changing", async () => {
    const sort = await sortCombatants();
    const tied = [combatant("z", 5.0, 12), combatant("a", 5.0, 12)];
    const once = sort(tied);
    expect(sort(tied)).toEqual(once);
    expect(sort([...tied].reverse())).toEqual(once);
  });

  it("sorts a combatant with no initiative rolled to the end", async () => {
    const sort = await sortCombatants();
    expect(
      sort([combatant("unrolled", null, 12), combatant("rolled", 5.0, 12)]),
    ).toEqual(["rolled", "unrolled"]);
  });

  /**
   * A combatant with no actor cannot be read for DX. Treating that as DX 0
   * would let it beat anyone whose DX was also unreadable, on nothing.
   */
  it("sorts a combatant whose DX cannot be read after one whose DX can", async () => {
    const sort = await sortCombatants();
    expect(sort([combatant("noActor", 5.0), combatant("hasActor", 5.0, 8)])).toEqual([
      "hasActor",
      "noActor",
    ]);
  });
});
