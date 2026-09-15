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
