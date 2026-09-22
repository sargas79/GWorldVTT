import { afterEach, describe, expect, it, vi } from "vitest";

import { clearRegisteredExplosives, explosiveById, offeredExplosives, registerExplosive } from "../explosive-registry.js";

// Explosives a module adds to the Relative Explosive Force Table
// (sargas79/GWorldVTT#597).

describe("registering an explosive", () => {
  afterEach(() => {
    clearRegisteredExplosives();
    vi.restoreAllMocks();
  });

  it("offers the Basic Set's table first, then the module's", () => {
    expect(registerExplosive({ module: "my-mod", key: "plasteel", label: "Plasteel Gel", ref: 2.5, tl: 9 })).toBe("my-mod.plasteel");
    const offered = offeredExplosives();
    expect(offered[0]?.id).toBe("serpentinePowder");
    expect(offered.find((e) => e.id === "tnt")?.ref).toBe(1);
    expect(offered.at(-1)).toEqual({ id: "my-mod.plasteel", label: "Plasteel Gel", ref: 2.5, tl: 9 });
    expect(explosiveById("my-mod.plasteel")?.ref).toBe(2.5);
    expect(explosiveById("dynamite")?.ref).toBe(0.8);
  });

  it("refuses a registration without a module, key, label or positive REF", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registerExplosive({ module: "", key: "x", label: "X", ref: 1 })).toBeNull();
    expect(registerExplosive({ module: "m", key: "x", label: "", ref: 1 })).toBeNull();
    expect(registerExplosive({ module: "m", key: "x", label: "X", ref: 0 })).toBeNull();
    expect(offeredExplosives()).toHaveLength(14);
  });

  it("offers one only while it says it is available, but still finds it by id", () => {
    let on = false;
    registerExplosive({ module: "m", key: "x", label: "X", ref: 3, available: () => on });
    expect(offeredExplosives().some((e) => e.id === "m.x")).toBe(false);
    expect(explosiveById("m.x")?.ref).toBe(3);
    on = true;
    expect(offeredExplosives().some((e) => e.id === "m.x")).toBe(true);
  });
});
