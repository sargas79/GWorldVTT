import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { GENERIC_ITEM_ICON, defaultItemIcon, isGenericIcon, itemIcon } from "../item-icons.js";
import { EQUIPMENT_CATEGORIES } from "../gear-groups.js";

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

/**
 * The compendium sidebar renders a pack's index, which carries whatever was
 * stored and never runs the document class. So every entry that ships has to
 * have been given a picture at build time -- and a kind with no entry in the
 * tables falls through to the bag, which is exactly how vehicles came to wear
 * one after this was first written.
 */
describe("every entry that ships gets a picture of its own", () => {
  const source = join(import.meta.dirname, "..", "..", "..", "packs-src");

  const entries = readdirSync(source, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(source, dir.name))
        .filter((f) => f.endsWith(".json"))
        .flatMap((file) => {
          const raw = JSON.parse(readFileSync(join(source, dir.name, file), "utf8"));
          return (Array.isArray(raw) ? raw : [raw]).map((entry) => ({ pack: dir.name, entry }));
        }),
    );

  it("reads the packs it is checking", () => {
    expect(entries.length).toBeGreaterThan(2000);
  });

  /** The creatures pack holds actors, which wear Foundry's own portrait. */
  const ACTOR_TYPES = new Set(["character", "npc", "vehicle"]);

  it("leaves no item wearing the bag", () => {
    const wearing = entries
      .filter(({ entry }) => entry.type !== undefined && !ACTOR_TYPES.has(String(entry.type)))
      .filter(({ entry }) => defaultItemIcon(String(entry.type), entry.system ?? {}) === GENERIC_ITEM_ICON)
      .map(({ pack, entry }) => `${pack}/${entry.name} (${entry.type})`);
    expect(wearing).toEqual([]);
  });

  it("leaves nothing a creature carries wearing the bag either", () => {
    const wearing = entries
      .flatMap(({ entry }) => (entry.items ?? []) as Array<{ name?: string; type?: string; system?: unknown }>)
      .filter((item) => defaultItemIcon(String(item.type ?? ""), item.system ?? {}) === GENERIC_ITEM_ICON)
      .map((item) => `${item.name} (${item.type})`);
    expect(wearing).toEqual([]);
  });

  /** Every category the equipment model allows, not just the ones in the packs. */
  it("covers every equipment category the model allows", () => {
    for (const category of EQUIPMENT_CATEGORIES) {
      expect(defaultItemIcon("equipment", { category })).not.toBe(GENERIC_ITEM_ICON);
    }
  });
});
