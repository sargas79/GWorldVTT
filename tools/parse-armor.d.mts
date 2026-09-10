/**
 * The one export the armour parser shares with the rules engine.
 *
 * The parser itself is plain JavaScript, run by node rather than compiled, so it
 * carries no types of its own. This declares only what the consistency test
 * imports: the mapping of which damage a split DR applies to, which must match
 * SPLIT_AGAINST in `src/rules/armor.ts`.
 */
import type { DamageType } from "../src/rules/types.js";

export declare const SPLIT_AGAINST: {
  lowTech: readonly DamageType[];
  highTech: readonly DamageType[];
};
