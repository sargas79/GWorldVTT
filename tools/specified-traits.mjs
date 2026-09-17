/**
 * The traits that are not complete until the player says what they are of.
 *
 * Compulsive Behavior is not a disadvantage until it is Compulsive Gambling;
 * Intolerance needs the group, Phobia the fear, Weapon Master the weapon. The
 * book says so in each entry ("you must specify..."), and GCA asks when the
 * trait is added -- but only for its quirks does the data file carry the
 * prompt (`#InputToTag("Please describe your Vow:", ...)`). The full-cost
 * traits are silent in the file, so the Basic Set's are listed here by hand,
 * and the parser marks both kinds with `needsSpecialty`.
 *
 * Names are the compendium's: the bare name, before any "(Advantage)" or
 * "(Disadvantage)" the parser adds to tell two halves apart. A trait the file
 * writes only with a blank for its subject -- Weapon Bond, Susceptible,
 * Likes -- is not in the packs at all, and is not listed; one it writes
 * already specified -- Addiction (Tobacco), Enhanced Parry (Bare Hands) --
 * needs nothing more said.
 */

/** A GCA record that prompts the player for a description as it is added. */
const INPUT_PROMPT = /#Input(?:ToTag|Replace)?\s*\(/i;

/** Whether a record's text asks the player to describe the trait. */
export function asksForSpecialty(text) {
  return INPUT_PROMPT.test(String(text ?? ""));
}

/** The Basic Set's traits that need a specification, by compendium name. */
export const SPECIFIED_TRAITS = new Set([
  // Advantages (GURPS Basic Set: Characters, chapter 2).
  "Ally",
  "Alternate Form",
  "Alternate Identity",
  "Affliction",
  "Blessed",
  "Claim to Hospitality",
  "Contact",
  "Contact Group",
  "Detect",
  "Higher Purpose",
  "Obscure",
  "Patron",
  "Permeation",
  "Puppet",
  "Racial Skill Bonus",
  "Racial Spell Bonus",
  "Rank",
  "Reputation",
  "Resistant",
  "Signature Gear",
  "Special Rapport",
  "Weapon Master",
  // Disadvantages (chapter 3).
  "Code of Honor",
  "Compulsive Behavior",
  "Delusion",
  "Dependency",
  "Dependent",
  "Discipline of Faith",
  "Divine Curse",
  "Draining",
  "Dread",
  "Duty",
  "Enemy (One Person)",
  "Enemy (Less powerful group)",
  "Enemy (Formidable group)",
  "Fanaticism",
  "Intolerance",
  "Obsession",
  "Odious Personal Habit",
  "Phobia",
  "Restricted Diet",
  "Revulsion",
  "Secret",
  "Sense of Duty",
  "Social Stigma",
  "Supernatural Feature",
  "Trademark",
  "Uncontrollable Appetite",
  "Vow",
  "Vulnerability",
  "Weakness",
  // Perks and quirks (pp. 100, 162-165).
  "Accessory",
  "Distinctive Feature",
  "Expression",
  "Habit",
  "Incompetence",
  "Minor Handicap",
]);

/** Whether a trait, by name or by its record's text, needs a specification. */
export function needsSpecialty(name, text = "") {
  const bare = String(name ?? "").replace(/\s+\((?:Advantage|Disadvantage)\)$/, "");
  return SPECIFIED_TRAITS.has(bare) || asksForSpecialty(text);
}
