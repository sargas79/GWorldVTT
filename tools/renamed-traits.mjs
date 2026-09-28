/**
 * Traits the Basic Set, Fourth Edition Revised (2025) gave new names, so that
 * a GCA data file written before it still reads: the parser files a record
 * called by the old name under the new one, with the page the Revised edition
 * moved it to, and the old level names under the new ones.
 *
 * `src/rules/trait-renames.ts` holds the same table for the running system
 * (the migration and the name matching); a test keeps the two equal.
 */

/** A trait renamed, the page the Revised edition prints it on, and the page it was on before. */
export const RENAMED_TRAITS = [
  { from: "Slave Mentality", to: "Heteronomy", page: 138, oldPage: 154 },
];

/** Level names renamed on the traits that carry them. */
export const RENAMED_LEVELS = [
  { traits: ["Shyness", "Flashbacks", "Neurological Disorder"], from: "Crippling", to: "Overwhelming" },
];

/**
 * The rename that applies to a trait, or null. The name is compared without
 * regard to case or surrounding space, as the running system matches it.
 *
 * @param {unknown} name
 * @returns {{ from: string, to: string, page: number, oldPage: number } | null}
 */
export function renamedTrait(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return RENAMED_TRAITS.find((rename) => rename.from.toLowerCase() === key) ?? null;
}

/**
 * A trait's level names with the renamed ones replaced, for the traits that
 * had them renamed.
 *
 * @param {unknown} trait the trait's name
 * @param {readonly string[]} levelNames
 * @returns {string[]}
 */
export function currentLevelNames(trait, levelNames) {
  const key = String(trait ?? "").trim().toLowerCase();
  const rules = RENAMED_LEVELS.filter((rule) => rule.traits.some((name) => name.toLowerCase() === key));
  return levelNames.map((level) => rules.find((rule) => rule.from === level)?.to ?? level);
}
