import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globals = globalThis as Record<string, unknown>;

/** An actor whose flags live in a plain object. */
function actor(uuid: string) {
  const flags: Record<string, any> = {};
  return {
    uuid,
    name: uuid,
    isOwner: true,
    statuses: new Set<string>(),
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: vi.fn(async (_scope: string, key: string, value: unknown) => { flags[key] = value; }),
    unsetFlag: vi.fn(async (_scope: string, key: string) => { delete flags[key]; }),
    toggleStatusEffect: vi.fn(async () => undefined),
    flags,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.game = { settings: { get: () => ({}) }, i18n: { localize: (k: string) => k, format: (k: string) => k } };
});

afterEach(() => {
  delete globals.game;
  delete globals.fromUuid;
  vi.restoreAllMocks();
});

/** The grapple a module can read and change (sargas79/GWorldVTT#334). */
describe("grapple methods (since 1.34.0)", () => {
  it("starts a grapple on both fighters, changes it on both, and ends it on both", async () => {
    vi.resetModules();
    const grappling = await import("../grappling.js");
    const grappler = actor("A");
    const victim = actor("B");
    globals.fromUuid = async (uuid: string) => (uuid === "A" ? grappler : victim);
    await grappling.beginGrapple({ grappler, victim, hands: 2 });
    expect(grappling.grappleOf(grappler)).toMatchObject({ foe: "B", holding: true, hands: 2 });
    expect(grappling.grappleOf(victim)).toMatchObject({ foe: "A", holding: false, hands: 2 });
    expect(await grappling.updateGrapple(victim, { hands: 1, hitLocation: "neck" })).toBe(true);
    expect([grappling.grappleOf(grappler)?.hands, grappling.grappleOf(victim)?.hitLocation]).toEqual([1, "neck"]);
    await grappling.updateGrapple(grappler, { pinned: true });
    expect([grappling.grappleOf(grappler)?.pinned, grappling.grappleOf(victim)?.pinned]).toEqual([true, true]);
    await grappling.endGrapple(grappler);
    expect([grappling.grappleOf(grappler), grappling.grappleOf(victim)]).toEqual([null, null]);
    expect(await grappling.updateGrapple(grappler, { hands: 2 })).toBe(false);
  });
});

/** A fighter in more than one grapple (sargas79/GWorldVTT#370). */
describe("several grapples at once (since 1.45.0)", () => {
  it("holds two foes, tells them apart, and lets go of one", async () => {
    vi.resetModules();
    const grappling = await import("../grappling.js");
    const grappler = actor("A");
    const first = actor("B");
    const second = actor("C");
    const byUuid: Record<string, unknown> = { A: grappler, B: first, C: second };
    globals.fromUuid = async (uuid: string) => byUuid[uuid];

    await grappling.beginGrapple({ grappler, victim: first, hands: 1, hitLocation: "arm" });
    await grappling.beginGrapple({ grappler, victim: second, hands: 1, hitLocation: "neck" });
    expect(grappling.grapplesOf(grappler).map((g) => g.foe)).toEqual(["B", "C"]);
    // Each foe is in one grapple, and knows which.
    expect(grappling.grapplesOf(second).map((g) => g.foe)).toEqual(["A"]);

    // Named, the foe picks the grapple out; unnamed, the first stands.
    expect(grappling.grappleOf(grappler, second)).toMatchObject({ foe: "C", hitLocation: "neck" });
    expect(grappling.grappleOf(grappler, "B")).toMatchObject({ foe: "B", hitLocation: "arm" });
    expect(grappling.grappleOf(grappler)).toMatchObject({ foe: "B" });
    expect(grappling.grappleOf(grappler, actor("D"))).toBeNull();

    // A change names its grapple too, and leaves the other alone.
    expect(await grappling.updateGrapple(grappler, { hands: 2 }, second)).toBe(true);
    expect(grappling.grapplesOf(grappler).map((g) => g.hands)).toEqual([1, 2]);
    expect(grappling.grappleOf(second)?.hands).toBe(2);

    // Letting go of one leaves the other in place, on both sides.
    await grappling.endGrapple(grappler, first);
    expect(grappling.grapplesOf(grappler).map((g) => g.foe)).toEqual(["C"]);
    expect(grappling.grapplesOf(first)).toEqual([]);
    expect(grappling.grapplesOf(second).map((g) => g.foe)).toEqual(["A"]);

    // And letting go with nobody named ends them all.
    await grappling.endGrapple(grappler);
    expect([grappling.grapplesOf(grappler), grappling.grapplesOf(second)]).toEqual([[], []]);
  });

  it("holds one foe while another holds him, and keeps both conditions", async () => {
    vi.resetModules();
    const grappling = await import("../grappling.js");
    const middle = actor("A");
    const held = actor("B");
    const holder = actor("C");
    const byUuid: Record<string, unknown> = { A: middle, B: held, C: holder };
    globals.fromUuid = async (uuid: string) => byUuid[uuid];

    await grappling.beginGrapple({ grappler: middle, victim: held, hands: 1 });
    await grappling.beginGrapple({ grappler: holder, victim: middle, hands: 2 });
    expect(grappling.grapplesOf(middle).map((g) => [g.foe, g.holding])).toEqual([["B", true], ["C", false]]);
    expect(middle.toggleStatusEffect).toHaveBeenCalled();

    // The one grapple flag keeps naming the first, for anything reading it.
    expect(middle.flags.grapple).toMatchObject({ foe: "B", holding: true });
  });

  it("reads a world recorded before it as the one grapple it holds", async () => {
    vi.resetModules();
    const grappling = await import("../grappling.js");
    const old = actor("A");
    old.flags.grapple = { foe: "B", holding: false, hands: 2, pinned: false, hitLocation: "torso" };
    expect(grappling.grapplesOf(old).map((g) => g.foe)).toEqual(["B"]);
    expect(grappling.grappleOf(old, "B")).toMatchObject({ foe: "B" });
  });
});
