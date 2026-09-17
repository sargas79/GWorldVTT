import { describe, expect, it } from "vitest";

import { isUndoable, undoPlan, type DamageTransaction } from "../damage-undo.js";

/** A blow that took 5 HP off and wore a point off one ablative piece. */
function transaction(overrides: Partial<DamageTransaction> = {}): DamageTransaction {
  return {
    actorUuid: "Actor.abc",
    actorName: "Hrothgar",
    pool: "hp",
    from: 12,
    to: 7,
    armor: [{ itemId: "armor1", from: 0, to: 1 }],
    aim: null,
    at: 0,
    ...overrides,
  };
}

describe("undoing an application of damage", () => {
  it("puts the pool back where the blow found it", () => {
    const plan = undoPlan(transaction(), { pool: 7, armor: { armor1: 1 } });
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.actorChanges).toEqual({ "system.hp.value": 12 });
  });

  it("puts fatigue back on its own pool", () => {
    const plan = undoPlan(
      transaction({ pool: "fp", from: 10, to: 6, armor: [] }),
      { pool: 6, armor: {} },
    );
    expect(plan.ok && plan.actorChanges).toEqual({ "system.fp.value": 10 });
  });

  it("puts back the ablative armour the blow wore down", () => {
    const plan = undoPlan(transaction(), { pool: 7, armor: { armor1: 1 } });
    expect(plan.ok && plan.armorChanges).toEqual([{ _id: "armor1", "system.drLost": 0 }]);
  });

  it("restores an aim the blow spoiled", () => {
    const plan = undoPlan(
      transaction({ aim: { turns: 2, target: "Token.xyz", bonuses: [1] } }),
      { pool: 7, armor: { armor1: 1 } },
    );
    expect(plan.ok && plan.actorChanges).toMatchObject({
      "system.aim.turns": 2,
      "system.aim.target": "Token.xyz",
      "system.aim.bonuses": [1],
    });
  });

  it("leaves the aim alone where the blow cost none", () => {
    // Undo must not invent an aim for somebody who was not aiming.
    const plan = undoPlan(transaction(), { pool: 7, armor: { armor1: 1 } });
    expect(plan.ok && Object.keys(plan.actorChanges)).toEqual(["system.hp.value"]);
  });

  it("writes nothing for a piece of armour the blow did not wear down", () => {
    const plan = undoPlan(
      transaction({ armor: [{ itemId: "armor1", from: 3, to: 3 }] }),
      { pool: 7, armor: { armor1: 3 } },
    );
    expect(plan.ok && plan.armorChanges).toEqual([]);
  });
});

describe("refusing an undo that would discard later work", () => {
  it("refuses when the pool has moved since", () => {
    // A second blow, a heal, or a GM's edit. Restoring 12 here would throw
    // whatever moved it away, which is worse than not undoing at all.
    const plan = undoPlan(transaction(), { pool: 4, armor: { armor1: 1 } });
    expect(plan).toEqual({ ok: false, reason: "poolChanged" });
  });

  it("refuses even when the pool moved back up", () => {
    // Healed to full is still a change: the undo has no way to tell that from
    // a value it put there itself.
    const plan = undoPlan(transaction(), { pool: 12, armor: { armor1: 1 } });
    expect(plan).toEqual({ ok: false, reason: "poolChanged" });
  });

  it("refuses when the armour has been worn further since", () => {
    const plan = undoPlan(transaction(), { pool: 7, armor: { armor1: 2 } });
    expect(plan).toEqual({ ok: false, reason: "armorChanged" });
  });

  it("refuses when the armour is no longer on the character", () => {
    const plan = undoPlan(transaction(), { pool: 7, armor: {} });
    expect(plan).toEqual({ ok: false, reason: "armorGone" });
  });

  it("refuses when there is nothing to check against", () => {
    expect(undoPlan(transaction(), null)).toEqual({ ok: false, reason: "actorGone" });
    expect(undoPlan(null, { pool: 7, armor: {} })).toEqual({ ok: false, reason: "actorGone" });
  });

  it("checks every piece, not just the first", () => {
    const plan = undoPlan(
      transaction({
        armor: [
          { itemId: "armor1", from: 0, to: 1 },
          { itemId: "armor2", from: 0, to: 2 },
        ],
      }),
      { pool: 7, armor: { armor1: 1, armor2: 5 } },
    );
    expect(plan).toEqual({ ok: false, reason: "armorChanged" });
  });
});

describe("whether a card should offer an undo at all", () => {
  it("offers one when the pool moved", () => {
    expect(isUndoable(transaction({ armor: [] }))).toBe(true);
  });

  it("offers one when only armour was worn down", () => {
    // A blow armour stopped still wore the armour, and that is worth taking
    // back on its own.
    expect(isUndoable(transaction({ from: 12, to: 12 }))).toBe(true);
  });

  it("offers one when only an aim was lost", () => {
    expect(isUndoable(transaction({
      from: 12, to: 12, armor: [], aim: { turns: 1, target: "", bonuses: [] },
    }))).toBe(true);
  });

  it("offers none where the blow changed nothing", () => {
    expect(isUndoable(transaction({ from: 12, to: 12, armor: [] }))).toBe(false);
    expect(isUndoable(null)).toBe(false);
  });
});
