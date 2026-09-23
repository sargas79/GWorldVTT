import { afterEach, describe, expect, it, vi } from "vitest";

import { refusalReason, reportRefusedDrop } from "../sheets/drop-errors.js";

describe("refusalReason", () => {
  it("keeps only the reason from a validation error", () => {
    const error = new Error(
      "GWorldItem [Compendium.world.test.Item.abc] validation errors: Split DR 3 must not exceed the armor's DR of 2.\n"
        + "  Joint Validation: Split DR 3 must not exceed the armor's DR of 2.",
    );
    expect(refusalReason(error)).toBe("Split DR 3 must not exceed the armor's DR of 2.");
  });

  it("passes any other error's first line through", () => {
    expect(refusalReason(new Error("Something broke\nstack"))).toBe("Something broke");
    expect(refusalReason("plain")).toBe("plain");
  });
});

describe("reportRefusedDrop", () => {
  const error = vi.fn();
  const format = vi.fn((key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}`);

  function stubFoundry(name: string | null) {
    vi.stubGlobal("ui", { notifications: { error } });
    vi.stubGlobal("game", { i18n: { format } });
    vi.stubGlobal("fromUuidSync", () => (name ? { name } : null));
    vi.stubGlobal("foundry", {
      applications: { ux: { TextEditor: { implementation: { getDragEventData: () => ({ uuid: "Item.x" }) } } } },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    error.mockClear();
    format.mockClear();
  });

  it("returns what the drop returned and says nothing when it works", async () => {
    stubFoundry("Cup");
    expect(await reportRefusedDrop({} as DragEvent, async () => 7)).toBe(7);
    expect(error).not.toHaveBeenCalled();
  });

  it("names what was dropped and why it was refused", async () => {
    stubFoundry("Cup");
    const result = await reportRefusedDrop({} as DragEvent, async () => {
      throw new Error("GWorldItem [Item.x] validation errors: bad split");
    });
    expect(result).toBeNull();
    expect(format).toHaveBeenCalledWith("GWORLD.Item.DropRefusedNamed", { name: "Cup", reason: "bad split" });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("still says why when the name cannot be found", async () => {
    stubFoundry(null);
    await reportRefusedDrop({} as DragEvent, async () => {
      throw new Error("bad split");
    });
    expect(format).toHaveBeenCalledWith("GWORLD.Item.DropRefused", { reason: "bad split" });
  });
});
