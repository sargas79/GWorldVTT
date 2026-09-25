/**
 * The Basic Set's advantages that can be learned as if they were skills
 * (Learnable Advantages, Characters p. 294): study toward them at 200 hours
 * a point, with a teacher who has the advantage. The parser marks them
 * `learnable`, the sheet's Study tool offers only those, and the system's
 * world migration flags the copies characters already hold.
 *
 * Names are the compendium's. Eidetic Memory is its first level only;
 * Photographic Memory is not on the list. The psionic Talents are learnable
 * where a campaign has psi academies, and the GM says whether it has.
 */
export const LEARNABLE_TRAITS = new Set([
  "Combat Reflexes",
  "Eidetic Memory",
  "Enhanced Block",
  "Enhanced Dodge",
  "Enhanced Parry (All Parries)",
  "Enhanced Parry (Bare Hands)",
  "ESP Talent",
  "Fit",
  "G-Experience",
  "PK Talent",
  "Psychic Healing Talent",
  "Telepathy Talent",
  "Teleportation Talent",
  "Trained By A Master",
  "Very Fit",
  "Weapon Master",
  "Weapon Master (Targets)",
]);

/** Whether the Basic Set's trait of that compendium name is learnable. */
export function learnable(name) {
  return LEARNABLE_TRAITS.has(String(name ?? ""));
}

/**
 * A trait's name without what a sheet adds to it: a level ("Enhanced Dodge
 * 2") and a specialty in parentheses ("Weapon Master (Broadsword)"), the way
 * the pack's own names are written bare.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function baseTraitName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+\d+$/, "")
    .replace(/\s*\([^()]*\)$/, "")
    .trim();
}

const LEARNABLE_BASES = new Set([...LEARNABLE_TRAITS].map(baseTraitName));

/**
 * Whether a trait a character holds is one of the learnable ones, by its
 * compendium name or by its base name: "Enhanced Parry (Broadsword)" and
 * "G-Experience 3" both are.
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export function learnableByName(name) {
  const text = String(name ?? "").trim();
  if (LEARNABLE_TRAITS.has(text)) return true;
  const level = text.replace(/\s+\d+$/, "");
  return LEARNABLE_TRAITS.has(level) || LEARNABLE_BASES.has(baseTraitName(text));
}
