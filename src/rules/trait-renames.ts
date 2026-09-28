/**
 * Traits the Basic Set, Fourth Edition Revised (2025) renamed, and level names
 * it renamed, so that characters and data files made before it still work.
 *
 * Slave Mentality (Characters p. 154) is Heteronomy (p. 138); the top level of
 * Shyness (p. 154), Flashbacks (p. 136) and Neurological Disorder (p. 144) is
 * Overwhelming, not Crippling. `tools/renamed-traits.mjs` holds the same table
 * for the data-file parser; a test keeps the two equal.
 */

/** A trait renamed, and the page the Revised edition prints it on. */
export interface TraitRename {
  from: string;
  to: string;
  page: number;
  /** The page the trait was printed on before the Revised edition. */
  oldPage: number;
}

/** Level names renamed on the traits that carry them. */
export interface LevelRename {
  traits: readonly string[];
  from: string;
  to: string;
}

export const RENAMED_TRAITS: readonly TraitRename[] = [{ from: "Slave Mentality", to: "Heteronomy", page: 138, oldPage: 154 }];

export const RENAMED_LEVELS: readonly LevelRename[] = [
  { traits: ["Shyness", "Flashbacks", "Neurological Disorder"], from: "Crippling", to: "Overwhelming" },
];

/** The rename that applies to a trait name, ignoring case and surrounding space, or null. */
export function renamedTrait(name: unknown): TraitRename | null {
  const key = String(name ?? "").trim().toLowerCase();
  return RENAMED_TRAITS.find((rename) => rename.from.toLowerCase() === key) ?? null;
}

/** The name a trait goes by now: the new name for a renamed one, otherwise its own. */
export function currentTraitName(name: string): string {
  return renamedTrait(name)?.to ?? name;
}

/** A trait's name without a level ("Shyness 2") or a specialty ("Flashbacks (Mild)") a sheet adds to it. */
export function traitBaseName(name: unknown): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+\d+$/, "")
    .replace(/\s*\([^()]*\)$/, "")
    .trim();
}

/** A trait's level names with the renamed ones replaced, for the traits that had them renamed. */
export function currentLevelNames(trait: unknown, levelNames: readonly string[]): string[] {
  const key = traitBaseName(trait).toLowerCase();
  const rules = RENAMED_LEVELS.filter((rule) => rule.traits.some((name) => name.toLowerCase() === key));
  return levelNames.map((level) => rules.find((rule) => rule.from === level)?.to ?? level);
}
