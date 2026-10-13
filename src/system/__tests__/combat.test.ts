import { afterEach, beforeEach, describe, expect, it } from "vitest";

const globals = globalThis as Record<string, unknown>;

/** The base class the subclass extends, which Foundry supplies at runtime. */
beforeEach(() => {
  globals.Combat = class {};
  globals.Combatant = class {};
});

afterEach(() => {
  delete globals.Combat;
  delete globals.Combatant;
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
   * Basic Speed comes in quarter-point steps, so a party of four will
   * routinely have two people on 5.00. The book breaks that tie on DX, which
   * goes into the initiative rolled; the comparator then needs nothing but
   * the initiative and the id, which is the order Foundry's server keeps.
   */
  it("breaks a tie on DX, highest first, through the initiative rolled", async () => {
    const sort = await sortCombatants();
    const { initiativeTieBreak } = await import("../combat.js");
    expect(
      sort([combatant("clumsy", 5.0 + initiativeTieBreak(10)), combatant("nimble", 5.0 + initiativeTieBreak(14))]),
    ).toEqual(["nimble", "clumsy"]);
  });

  it("orders a whole party by speed then DX", async () => {
    const sort = await sortCombatants();
    const { initiativeTieBreak } = await import("../combat.js");
    const at = (speed: number, dx: number) => speed + initiativeTieBreak(dx);
    const party = [
      combatant("a", at(5.0, 12)),
      combatant("b", at(6.0, 9)),
      combatant("c", at(5.0, 15)),
      combatant("d", at(5.5, 11)),
    ];
    expect(sort(party)).toEqual(["b", "d", "c", "a"]);
  });

  /**
   * The server decides whether a player may end their turn by its own order:
   * initiative, then id. A comparator that looked at anything else gave the
   * table a different order from the server's on a tie, and the player whose
   * turn it was by the table's order was refused (sargas79/GWorldVTT#979).
   */
  it("keeps the server's order: initiative, then id, whatever the DX", async () => {
    const sort = await sortCombatants();
    const core = (a: any, b: any) => (b.initiative - a.initiative) || (a.id > b.id ? 1 : -1);
    const tied = [combatant("b", 5.0, 18), combatant("a", 5.0, 9), combatant("c", 6.0, 10)];
    expect(sort(tied)).toEqual([...tied].sort(core).map((c) => c.id));
  });

  it("keeps the tie-break under the quarter-point steps and the two decimals shown", async () => {
    const { initiativeTieBreak } = await import("../combat.js");
    expect(initiativeTieBreak(10)).toBeCloseTo(0.0001, 10);
    expect((5.25 + initiativeTieBreak(30)).toFixed(2)).toBe("5.25");
    expect(5.0 + initiativeTieBreak(999)).toBeLessThan(5.25);
    expect(initiativeTieBreak(null)).toBe(0);
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

  it("sorts two unrolled combatants by id rather than leaving them unordered", async () => {
    const sort = await sortCombatants();
    expect(sort([combatant("b", null), combatant("a", null)])).toEqual(["a", "b"]);
  });

  it("rolls Basic Speed with the DX tie-break, and none for a combatant with no DX to read", async () => {
    const made: Array<{ formula: string; data: any }> = [];
    globals.Combatant = class {};
    globals.Roll = class { constructor(formula: string, data: any) { made.push({ formula, data }); } };
    const { GWorldCombatant, INITIATIVE_FORMULA } = await import("../combat.js");
    const fighter = Object.assign(new GWorldCombatant(), {
      actor: { system: { attributes: { DX: 14 } }, getRollData: () => ({ derived: { basicSpeed: 6 } }) },
    });
    fighter.getInitiativeRoll();
    const nobody = Object.assign(new GWorldCombatant(), { actor: null });
    nobody.getInitiativeRoll();
    expect(made[0]).toEqual({ formula: INITIATIVE_FORMULA, data: { derived: { basicSpeed: 6 }, tieBreak: 0.00014 } });
    expect(made[1]!.data).toEqual({ tieBreak: 0 });
    delete globals.Combatant;
    delete globals.Roll;
  });
});
