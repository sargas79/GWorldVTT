/**
 * What makes an armour's split DR ("4/2") well formed.
 *
 * Two places refuse a bad split: the pack validator, before a record is built
 * into a compendium, and the armour data model, which refuses a document that
 * breaks the rule however it got there -- edited on the sheet, made by a
 * macro, or brought in by a module's pack. They used to hold a copy each, and
 * the copies drifted: the validator learnt that only the Basic Set's armour has
 * to put crushing on the lower figure, the model did not, and armour that
 * validated and built could not then be put on a character. This lives in
 * `tools/` rather than in `src/` because only one of the two is TypeScript.
 */

/**
 * @typedef {object} SplitDr
 * @property {number} [dr]                      The armour's main DR.
 * @property {number | null} [drSplit]          The second, lower figure, if any.
 * @property {readonly string[]} [drSplitAppliesTo] The damage it applies to.
 */

/**
 * Why a split DR is malformed, or an empty list when it is not.
 *
 * The split is only meaningful as a pair: a second figure with nothing saying
 * when it applies would never be used, and damage named with no second figure
 * would promise protection that does not exist. The second figure is the
 * lower one; above the main DR, the damage it is meant to protect against least
 * would meet the most.
 *
 * Which damage takes the lower figure is not checked here: the Basic Set's two
 * armour tables both put crushing there, but other armour need not agree -- a
 * helmet may be at its best against blows -- and see {@link splitDrOmitsCrushing}.
 *
 * @param {SplitDr} armor
 * @returns {string[]}
 */
export function splitDrProblems(armor) {
  const split = armor.drSplit ?? null;
  const against = armor.drSplitAppliesTo ?? [];
  const dr = armor.dr ?? 0;
  const problems = [];

  if (split === null && against.length > 0) {
    problems.push("Armor names damage for a split DR without giving the second DR.");
  }
  if (split !== null && against.length === 0) {
    problems.push("Armor has a split DR without saying which damage it applies to.");
  }
  if (split !== null && !(Number.isInteger(split) && split >= 0)) {
    problems.push(`Split DR ${split} must be a whole number, zero or more.`);
  }
  if (split !== null && split > dr) {
    problems.push(`Split DR ${split} must not exceed the armor's DR of ${dr}.`);
  }
  return problems;
}

/**
 * Whether a Basic Set record's split leaves crushing off the lower figure.
 *
 * Both of the Basic Set's armour tables put crushing there (Characters
 * pp. 282-285), so such a record has been read from the wrong footnote. A record
 * from any other book may do otherwise, and so may a GM's own armour, so only
 * the pack validator asks this, and only of the Basic Set's records (or of one
 * that names no source at all, which the system's own packs never do).
 *
 * @param {SplitDr & {reference?: string}} armor
 * @returns {boolean}
 */
export function splitDrOmitsCrushing(armor) {
  if ((armor.drSplit ?? null) === null) return false;
  const reference = String(armor.reference ?? "");
  if (reference && !/^Basic Set\b/.test(reference)) return false;
  return !(armor.drSplitAppliesTo ?? []).includes("cr");
}
