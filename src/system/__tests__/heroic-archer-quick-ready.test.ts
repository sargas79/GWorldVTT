import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rollSuccess = vi.fn();
vi.mock("../roll.js", () => ({ rollSuccess: (...args: unknown[]) => rollSuccess(...args) }));

import { QUICK_READY_FLAG, isHeroicBow, quickReadyFor, rollQuickReady } from "../heroic-archer.js";
import { SYSTEM_ID } from "../constants.js";

const globals = globalThis as Record<string, unknown>;

function actor(options: { heroic?: boolean; weaponMaster?: boolean; skill?: number | null } = {}) {
  const items: any[] = [];
  if (options.skill !== null) items.push({ type: "skill", name: "Bow", system: { derived: { level: options.skill ?? 14 } } });
  if (options.weaponMaster) items.push({ type: "trait", name: "Weapon Master (Bow)", system: { levels: 0, masteredWeapons: [] } });
  return {
    isOwner: true,
    items,
    system: { derived: { traitEffects: { heroicArcher: options.heroic !== false } } },
    setFlag: vi.fn(async () => undefined),
  };
}
const item = { name: "Long Bow" };
const mode = { skill: "Bow" };

beforeEach(() => {
  rollSuccess.mockReset();
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    settings: { get: () => ({ heroicArcher: true }) },
  };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { confirm: vi.fn(async () => true) } } },
  };
});

afterEach(() => {
  delete globals.game;
  delete globals.foundry;
});

describe("the Heroic Archer's quick ready", () => {
  it("is for a Heroic Archer's bow only", () => {
    expect(isHeroicBow(actor(), mode)).toBe(true);
    expect(isHeroicBow(actor({ heroic: false }), mode)).toBe(false);
    expect(isHeroicBow(actor(), { skill: "Guns (Pistol)" })).toBe(false);
  });

  it("costs -3, or -1 for a Weapon Master (Bow)", () => {
    expect(quickReadyFor(actor(), item, mode)).toBe(-3);
    expect(quickReadyFor(actor({ weaponMaster: true }), item, mode)).toBe(-1);
  });

  it("rolls Bow at the penalty and holds the penalty for the next attack on a success", async () => {
    rollSuccess.mockResolvedValue({ success: true });
    const who = actor();
    expect(await rollQuickReady(who, item, mode)).toEqual({ success: true, penalty: -3 });
    const call = rollSuccess.mock.calls[0]![0] as any;
    expect(call.base).toBe(14);
    expect(call.modifiers).toEqual([expect.objectContaining({ value: -3, key: "heroicArcher", heroicArcher: "quickReady" })]);
    expect(who.setFlag).toHaveBeenCalledWith(SYSTEM_ID, QUICK_READY_FLAG, -3);
  });

  it("holds nothing on a failure", async () => {
    rollSuccess.mockResolvedValue({ success: false });
    const who = actor({ weaponMaster: true });
    expect(await rollQuickReady(who, item, mode)).toEqual({ success: false, penalty: -1 });
    expect(who.setFlag).not.toHaveBeenCalled();
  });

  it("is not offered to another shooter, without the Bow skill, or when the player declines", async () => {
    expect(await rollQuickReady(actor({ heroic: false }), item, mode)).toBeNull();
    expect(await rollQuickReady(actor({ skill: null }), item, mode)).toBeNull();
    (globals.foundry as any).applications.api.DialogV2.confirm = vi.fn(async () => false);
    expect(await rollQuickReady(actor(), item, mode)).toBeNull();
    expect(rollSuccess).not.toHaveBeenCalled();
  });
});
