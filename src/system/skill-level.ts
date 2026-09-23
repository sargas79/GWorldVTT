/**
 * Finding a character's skill by name, for the procedures that roll one.
 *
 * A procedure names the skill as the book refers to it -- "Physician",
 * "Surgery", "First Aid" -- and the sheet holds it as the book writes it on a
 * character, "Physician/TL" or "Physician/TL8". `normalizeSkillName` sees
 * through the marker, the case and the spacing, so every procedure compares
 * names the one way the sheet does.
 */

import { normalizeSkillName } from "../rules/skills.js";

/** A skill's level on the actor by name, or null where they haven't got it. */
export function skillLevelOf(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  if (!wanted) return null;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill") continue;
    if (normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" && Number.isFinite(level) ? level : null;
  }
  return null;
}
