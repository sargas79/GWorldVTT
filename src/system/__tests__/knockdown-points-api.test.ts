import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.game = { user: { isGM: false }, settings: { get: () => ({}) }, i18n: { localize: (k: string) => k, format: (k: string) => k } };
});

afterEach(() => {
  delete globals.game;
  vi.restoreAllMocks();
});

/** Knockdown results and unspent points for modules (sargas79/GWorldVTT#347). */
describe("taking a knockdown back (since 1.39.0)", () => {
  it("stands an owned actor back up in the posture given, and refuses one the user doesn't own", async () => {
    vi.resetModules();
    const { undoKnockdown } = await import("../knockdown.js");
    const update = vi.fn(async () => undefined);
    const toggleStatusEffect = vi.fn(async () => undefined);
    const actor = { isOwner: true, system: { posture: "lying", conditions: { stunned: true } }, statuses: new Set(["stunned", "prone"]), update, toggleStatusEffect };
    expect(await undoKnockdown(actor, { posture: "kneeling" })).toBe(true);
    expect(update).toHaveBeenCalledWith({ "system.posture": "kneeling", "system.conditions.stunned": false });
    expect(await undoKnockdown({ ...actor, isOwner: false })).toBe(false);
    expect(await undoKnockdown(actor, { posture: "flying" })).toBe(true);
    expect(update).toHaveBeenLastCalledWith({ "system.posture": "standing", "system.conditions.stunned": false });
  });
});

describe("charging unspent points (since 1.39.0)", () => {
  it("records a negative award, and spends nothing a character can't afford", async () => {
    vi.resetModules();
    const { spendUnspentPoints } = await import("../bonus-points.js");
    const update = vi.fn(async () => undefined);
    const actor = { isOwner: true, system: { derived: { points: { unspent: 5 } }, points: { awards: [] } }, update };
    expect(await spendUnspentPoints(actor, 6, "Too much")).toBe(false);
    expect(await spendUnspentPoints(actor, 0, "Nothing")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(await spendUnspentPoints(actor, 3, "An effect")).toBe(true);
    expect(update).toHaveBeenCalledWith({ "system.points.awards": [expect.objectContaining({ points: -3, note: "An effect" })] });
    expect(await spendUnspentPoints({ ...actor, isOwner: false }, 1, "Not yours")).toBe(false);
  });
});
