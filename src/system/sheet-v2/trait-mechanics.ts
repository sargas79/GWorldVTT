/**
 * What a trait does that this system applies on its own, for the Traits tab's
 * detail panel.
 *
 * A player who buys Combat Reflexes should be able to see that the +1 is
 * already in their Dodge. The rules engine reads a couple of dozen traits by
 * name; this runs it on the one trait and lists whatever came out different
 * from a character with no traits at all.
 */

import { noTraitEffects, traitEffects, type HeldTrait } from "../../rules/trait-effects.js";

export interface Mechanic {
  /** The effect's path in the engine's result, e.g. "activeDefense" or "acute.vision". */
  path: string;
  /** A number to show signed, text to show as it is, or null for an effect that is simply on. */
  value: number | string | null;
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) flatten(inner, prefix ? `${prefix}.${key}` : key, out);
    return;
  }
  out.set(prefix, value);
}

/**
 * The effects the engine applies for one trait. Multipliers are shown as
 * "×2"; switched-on effects carry no value; nested effects are named by
 * path. An effect whose result is a structure rather than a figure (Injury
 * Tolerance's kinds) is named once, by its top key.
 */
export function mechanicsOf(trait: HeldTrait): Mechanic[] {
  const base = new Map<string, unknown>();
  const held = new Map<string, unknown>();
  flatten(noTraitEffects(), "", base);
  flatten(traitEffects([trait]), "", held);

  const mechanics: Mechanic[] = [];
  const structured = new Set<string>();
  for (const [path, value] of held) {
    const before = base.get(path);
    if (JSON.stringify(before) === JSON.stringify(value)) continue;
    const top = path.split(".")[0]!;
    if (Array.isArray(value) || (top === "injuryTolerance")) {
      if (!structured.has(top)) mechanics.push({ path: top, value: null });
      structured.add(top);
      continue;
    }
    if (typeof value === "boolean") {
      if (value) mechanics.push({ path, value: null });
      continue;
    }
    if (typeof value === "number") {
      const multiplier = /Multiplier$|^enhancedMove$/.test(path);
      mechanics.push({ path, value: multiplier ? `×${value}` : value });
      continue;
    }
    if (value !== null && value !== undefined) mechanics.push({ path, value: String(value) });
  }
  return mechanics;
}

/** "acute.vision" as words, for an effect no string names: "Acute vision". */
export function mechanicFallbackLabel(path: string): string {
  const words = path
    .split(".")
    .map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
