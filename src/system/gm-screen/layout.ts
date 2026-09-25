/**
 * The GM Screen's eight tabs and the Basic Set sections on each, in the order
 * the screen shows them.
 */

import { AFFLICTION_SECTIONS } from "./sections/afflictions.js";
import { CHECK_SECTIONS } from "./sections/checks.js";
import { COMBAT_SECTIONS } from "./sections/combat.js";
import { MANEUVER_SECTIONS } from "./sections/maneuvers.js";
import { MELEE_SECTIONS } from "./sections/melee.js";
import { RANGED_SECTIONS } from "./sections/ranged.js";
import { K } from "./sections/shared.js";
import { TABLES_SECTIONS } from "./sections/tables.js";
import { WOUNDS_SECTIONS } from "./sections/wounds.js";
import type { GmSectionDef, GmTabDef } from "./types.js";

const tab = (id: string, icon: string): GmTabDef => ({ id, label: `${K}.Tab.${id}`, hint: `${K}.TabHint.${id}`, icon, module: null });

export const GM_SCREEN_TABS: readonly GmTabDef[] = [
  tab("tables", "fa-solid fa-table-list"),
  tab("wounds", "fa-solid fa-person"),
  tab("melee", "fa-solid fa-khanda"),
  tab("ranged", "fa-solid fa-bullseye"),
  tab("maneuvers", "fa-solid fa-person-running"),
  tab("combat", "fa-solid fa-hand-fist"),
  tab("afflictions", "fa-solid fa-head-side-cough"),
  tab("checks", "fa-solid fa-dice"),
];

export const SYSTEM_SECTIONS: readonly GmSectionDef[] = [
  ...TABLES_SECTIONS,
  ...WOUNDS_SECTIONS,
  ...MELEE_SECTIONS,
  ...RANGED_SECTIONS,
  ...MANEUVER_SECTIONS,
  ...COMBAT_SECTIONS,
  ...AFFLICTION_SECTIONS,
  ...CHECK_SECTIONS,
];

/** The places kept for tables the Basic Set does not have, which a module fills. */
export const GM_SCREEN_SLOTS: readonly string[] = SYSTEM_SECTIONS.filter((def) => def.slot).map((def) => def.id);
