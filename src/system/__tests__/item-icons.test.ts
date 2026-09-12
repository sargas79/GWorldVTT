import { describe, expect, it } from "vitest";

import { GENERIC_ITEM_ICON, defaultItemIcon, isGenericIcon, itemIcon } from "../item-icons.js";

describe("defaultItemIcon", () => {
  it("gives each kind of item its own picture", () => {
    const icons = new Set([
      defaultItemIcon("skill"),
      defaultItemIcon("technique"),
      defaultItemIcon("trait", { category: "advantage" }),
      defaultItemIcon("trait", { category: "disadvantage" }),
      defaultItemIcon("trait", { category: "perk" }),
      defaultItemIcon("trait", { category: "quirk" }),
      defaultItemIcon("equipment", { category: "weapon" }),
      defaultItemIcon("equipment", { category: "misc" }),
      defaultItemIcon("armor"),
      defaultItemIcon("shield"),
      defaultItemIcon("spell"),
      defaultItemIcon("modifier"),
    ]);
    expect(icons.size).toBe(12);
    expect(icons.has(GENERIC_ITEM_ICON)).toBe(false);
  });

  it("tells a trait's kind from its category, and takes an advantage otherwise", () => {
    expect(defaultItemIcon("trait", { category: "disadvantage" })).toBe("icons/svg/downgrade.svg");
    expect(defaultItemIcon("trait")).toBe(defaultItemIcon("trait", { category: "advantage" }));
  });

  it("draws anything with an attack mode as a weapon", () => {
    const sword = defaultItemIcon("equipment", { category: "tool", meleeModes: [{}] });
    expect(sword).toBe(defaultItemIcon("equipment", { category: "weapon" }));
    expect(defaultItemIcon("equipment", { category: "tool" })).not.toBe(sword);
  });

  it("falls back to the bag for a type it does not know", () => {
    expect(defaultItemIcon("mystery")).toBe(GENERIC_ITEM_ICON);
  });
});

describe("itemIcon", () => {
  it("keeps a picture somebody chose", () => {
    expect(itemIcon("icons/custom/sword.webp", "skill")).toBe("icons/custom/sword.webp");
  });

  it("replaces the bag, or nothing, with the kind's default", () => {
    expect(itemIcon(GENERIC_ITEM_ICON, "skill")).toBe("icons/svg/book.svg");
    expect(itemIcon("", "skill")).toBe("icons/svg/book.svg");
    expect(itemIcon(undefined, "shield")).toBe("icons/svg/shield.svg");
  });

  it("knows the bag when it sees it", () => {
    expect(isGenericIcon(GENERIC_ITEM_ICON)).toBe(true);
    expect(isGenericIcon("  ")).toBe(true);
    expect(isGenericIcon("icons/svg/book.svg")).toBe(false);
  });
});
