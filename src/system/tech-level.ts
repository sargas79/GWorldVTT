/**
 * Tech-Level Modifiers and Familiarity on the rolls that use a piece of
 * equipment (Characters pp. 168-169).
 *
 * The pure rules are in `rules/tech-level.ts`; this reads them off an actor
 * and the item in hand. An attack with a weapon is the roll the system knows
 * the item of, so the attack roll and the sheet's attack preview both take
 * these lines; the tools of a trade carry their TL line on the skill itself
 * (see the character's preparation).
 *
 * Each line carries a `key` -- `techLevel` or `unfamiliar` -- and the roll a
 * tag of the same name, so that a `gworld.attackModifiers` or
 * `gworld.successRollModifiers` listener can find the line and change its
 * value or label (a skill whose description sets another penalty), or add
 * one of its own.
 */

import { normalizeSkillName } from "../rules/skills.js";
import {
  familiarityModifier,
  isTechnologicalSkill,
  parseTechLevel,
  skillTechLevel,
  techLevelModifier,
} from "../rules/tech-level.js";
import { isRuleOn } from "./optional-rules.js";

/** One line an item's use puts on a roll. */
export interface EquipmentUseLine {
  /** `techLevel` for the Tech-Level Modifiers table, `unfamiliar` for the familiarity penalty. */
  key: "techLevel" | "unfamiliar";
  label: string;
  value: number;
}

/** What using an item costs a roll, and the tags that roll carries for it. */
export interface EquipmentUse {
  lines: EquipmentUseLine[];
  tags: string[];
  /** Why the roll cannot be made at all -- IQ-based use of gear four or more TLs ahead -- or null. */
  impossible: string | null;
}

const NONE: EquipmentUse = Object.freeze({ lines: [], tags: [], impossible: null }) as EquipmentUse;

function format(key: string, data: Record<string, unknown>, fallback: string): string {
  const i18n = (globalThis as { game?: { i18n?: { format?: (k: string, d: Record<string, unknown>) => string } } }).game?.i18n;
  const text = i18n?.format?.(key, data);
  return typeof text === "string" && text !== key ? text : fallback;
}

/** The actor's skill item of this name, compared through the "/TL" marker. */
function skillItem(actor: any, skillName: string): any {
  const wanted = normalizeSkillName(skillName);
  if (!wanted) return null;
  return [...(actor?.items ?? [])].find((item: any) => item?.type === "skill" && normalizeSkillName(String(item.name ?? "")) === wanted) ?? null;
}

/** The actor's familiarities, or null for an actor that keeps none (an NPC). */
export function familiaritiesOf(actor: any): string[] | null {
  const list = actor?.system?.familiarities;
  return Array.isArray(list) ? list.map((entry: unknown) => String(entry ?? "")) : null;
}

/**
 * Whether the familiarity rule can speak about this item with this skill:
 * the rule is on, the actor keeps familiarities, and the skill is a
 * technological one, which is what "a skill used to operate equipment" is
 * taken to be. The item's name is what is familiar.
 */
export function familiarityApplies(actor: any, item: any, skillName: string): boolean {
  if (!item || !isRuleOn("familiarity") || familiaritiesOf(actor) === null) return false;
  const skill = skillItem(actor, skillName);
  return isTechnologicalSkill(String(skill?.name ?? skillName ?? ""), skill?.system?.techLevel);
}

/**
 * The lines using `item` with the skill `skillName` puts on a roll: the TL
 * line where the item's TL differs from the skill's, and -2 for an item the
 * actor is not familiar with. Only a technological skill takes either. A
 * skill used at default is taken as learned at the character's TL, and as
 * not IQ-based.
 */
export function equipmentUseLines(actor: any, item: any, skillName: string | undefined): EquipmentUse {
  const name = String(skillName ?? "").trim();
  if (!item || !name) return NONE;
  const skill = skillItem(actor, name);
  const recorded = skill?.system?.techLevel;
  const shownName = String(skill?.name ?? name);
  if (!isTechnologicalSkill(shownName, recorded)) return NONE;

  const lines: EquipmentUseLine[] = [];
  let impossible: string | null = null;
  const personal = parseTechLevel(actor?.system?.tl);
  const equipmentTL = parseTechLevel(item?.system?.tl);
  if (isRuleOn("techLevelModifiers") && equipmentTL !== null && (personal !== null || parseTechLevel(recorded) !== null || /\/TL\d/i.test(shownName))) {
    const skillTL = skillTechLevel(shownName, recorded, personal ?? 0);
    const value = techLevelModifier({ skillTechLevel: skillTL, equipmentTechLevel: equipmentTL, iqBased: skill?.system?.attribute === "IQ" });
    if (value === null) {
      impossible = format("GWORLD.TechLevel.Impossible", { item: String(item.name ?? ""), equipment: equipmentTL, skill: skillTL },
        `TL${equipmentTL} equipment is beyond a TL${skillTL} skill`);
    } else if (value !== 0) {
      lines.push({ key: "techLevel", label: format("GWORLD.TechLevel.Line", { equipment: equipmentTL, skill: skillTL }, `TL${equipmentTL} equipment, TL${skillTL} skill`), value });
    }
  }
  const familiarities = familiaritiesOf(actor);
  if (familiarities !== null && isRuleOn("familiarity")) {
    const value = familiarityModifier(familiarities, String(item.name ?? ""));
    if (value !== 0) {
      lines.push({ key: "unfamiliar", label: format("GWORLD.TechLevel.Unfamiliar", { item: String(item.name ?? "") }, `Unfamiliar: ${String(item.name ?? "")}`), value });
    }
  }
  return { lines, tags: lines.map((line) => line.key), impossible };
}
