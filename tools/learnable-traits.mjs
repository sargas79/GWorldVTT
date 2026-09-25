/**
 * The Basic Set's advantages that can be learned as if they were skills
 * (Learnable Advantages, Characters p. 294): study toward them at 200 hours
 * a point, with a teacher who has the advantage. The parser marks them
 * `learnable`, and the sheet's Study tool offers only those.
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
