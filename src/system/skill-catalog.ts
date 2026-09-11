/**
 * What the compendia know about a skill the character does not have.
 *
 * A weapon names the skill it is used with, and a character who never learned
 * that skill still gets to try: "Guns (Pistol) defaults to DX-4" is the book's
 * way of saying anybody can pull a trigger. The sheet could only resolve a
 * skill the character carried, so a pistol in the hands of somebody without
 * the skill showed no attack at all.
 *
 * The compendium index carries each skill's attribute and defaults, and the
 * index is read once at ready and kept here, by name. A weapon whose skill is
 * not on the sheet is then rolled at the best default the book lists for it.
 *
 * The pure half -- working out the default from what the catalog holds --
 * has no Foundry in it and is tested; the loading half reads the packs.
 */

import { namedDefaultLevel, normalizeSkillName } from "../rules/skills.js";
import type { SkillAttribute } from "../rules/types.js";
import { sourceCollections } from "./compendium-sources.js";

/** A skill's default, as the compendium spells it. */
export interface CatalogDefault {
  from: "attribute" | "skill";
  attribute: SkillAttribute;
  skill: string;
  modifier: number;
}

/** What the catalog keeps of a skill. */
export interface CatalogSkill {
  name: string;
  attribute: SkillAttribute;
  defaults: CatalogDefault[];
}

const catalog = new Map<string, CatalogSkill>();

/** The catalog entry for a skill, by name, or null when no pack lists it. */
export function catalogSkill(name: string): CatalogSkill | null {
  return catalog.get(normalizeSkillName(name)) ?? null;
}

/** Replaces the catalog wholesale, which is what a test or a reload does. */
export function setSkillCatalog(skills: readonly CatalogSkill[]): void {
  catalog.clear();
  for (const skill of skills) catalog.set(normalizeSkillName(skill.name), skill);
}

/**
 * The level a skill is used at by somebody who never learned it, from its
 * listed defaults: the best of them, or null when the book lists none, which
 * means the skill cannot be used untrained at all.
 *
 * `attributeScore` supplies the character's attributes; `skillLevel` says what
 * they have of another skill, or null. A default from a skill they also lack
 * is not chased through the catalog: the book's defaults are one step deep,
 * and a chain of them would price a whole skill tree at DX-8.
 */
export function defaultLevelFrom(
  defaults: readonly CatalogDefault[],
  attributeScore: (attribute: SkillAttribute) => number,
  skillLevel: (name: string) => number | null,
): number | null {
  let best: number | null = null;
  for (const entry of defaults) {
    let level: number | null;
    if (entry.from === "skill") {
      const source = entry.skill ? skillLevel(entry.skill) : null;
      level = source === null ? null : source + entry.modifier;
    } else {
      level = namedDefaultLevel(attributeScore(entry.attribute), entry.modifier);
    }
    if (level !== null && (best === null || level > best)) best = level;
  }
  return best;
}

/** The index fields the catalog reads. */
const INDEX_FIELDS = ["system.attribute", "system.defaults"];

/**
 * Reads every skill in the chosen compendia into the catalog.
 *
 * Called at ready, and again when the GM changes which compendia are in use.
 * Actors prepared before the catalog was filled are prepared again, so a
 * pistol on a sheet that was open at load gets its default without a reload.
 */
export async function loadSkillCatalog(): Promise<void> {
  const sources = sourceCollections();
  const skills: CatalogSkill[] = [];

  for (const pack of (game as any).packs ?? []) {
    if (pack?.documentName !== "Item") continue;
    if (!sources.has(String(pack.collection))) continue;
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    for (const entry of index) {
      if (entry.type !== "skill") continue;
      skills.push({
        name: String(entry.name ?? ""),
        attribute: (entry.system?.attribute ?? "DX") as SkillAttribute,
        defaults: Array.isArray(entry.system?.defaults) ? entry.system.defaults : [],
      });
    }
  }

  setSkillCatalog(skills);

  for (const actor of (game as any).actors ?? []) {
    actor.reset?.();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
}
