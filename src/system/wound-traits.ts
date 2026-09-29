/**
 * Writing a lasting wound to the character (Basic Set Revised p. 566).
 *
 * A crippled spine, a broken neck, a pelvis that gives out, a broken nose and
 * an ear or nose cut off each cost the victim a trait -- Bad Back (Severe) and
 * Lame (Paraplegic), Quadriplegic, Lame (Missing Legs), No Sense of
 * Smell/Taste, a level or two of Appearance. The damage card names them; this is
 * what its button does, on the GM's say, since it rewrites a character's build.
 * The recovery rolls the book asks for are the table's to make first, which is
 * why nothing here happens by itself.
 */

import { appearanceAfter, type WoundTrait } from "../rules/revised-hit-locations.js";
import { normalizeSkillName } from "../rules/skills.js";
import { changeTrait } from "./trait-change.js";

function traitNamed(actor: any, name: string): any {
  const wanted = normalizeSkillName(name);
  return [...(actor?.items ?? [])].find((item: any) => item?.type === "trait" && normalizeSkillName(String(item.name ?? "")) === wanted) ?? null;
}

/** The character's Appearance as a signed level: Attractive +1, Ugly -2, Average 0. */
export function appearanceOf(actor: any): { item: any | null; signed: number } {
  for (const item of actor?.items ?? []) {
    if (item?.type !== "trait" || !normalizeSkillName(String(item.name ?? "")).startsWith("appearance")) continue;
    const levels = Number(item.system?.levels ?? 0) || 0;
    const disadvantage = item.system?.category === "disadvantage" || /disadvantage/i.test(String(item.name ?? ""));
    return { item, signed: disadvantage ? -levels : levels };
  }
  return { item: null, signed: 0 };
}

/** Takes levels of Appearance off a character, as the advantage or the disadvantage holds them. Null when nothing changed. */
async function lowerAppearance(actor: any, lost: number): Promise<string | null> {
  const { item, signed } = appearanceOf(actor);
  const after = appearanceAfter(signed, lost);
  if (after.signed === signed) return null;
  if (after.trait === null) {
    return item ? (await changeTrait(actor, { id: item.id, remove: true }) ? "Appearance" : null) : null;
  }
  const holds = item ? (signed > 0 ? "Appearance" : "Appearance (Disadvantage)") : null;
  const done = !item
    ? await changeTrait(actor, { add: after.trait, level: after.levels })
    : holds === after.trait
      ? await changeTrait(actor, { id: item.id, level: after.levels })
      : await changeTrait(actor, { id: item.id, replaceWith: after.trait, level: after.levels });
  return done ? `${after.trait} ${after.levels}` : null;
}

/**
 * Gives a character one wound's trait, or raises it to the level the wound
 * names. Returns what was written, or null when nothing was: no GM, a trait the
 * character already has at that level, or one the compendia don't carry.
 */
export async function applyWoundTrait(actor: any, trait: WoundTrait): Promise<string | null> {
  if (trait.appearance) return lowerAppearance(actor, trait.appearance);
  const has = traitNamed(actor, trait.name);
  if (has) {
    if (typeof trait.level === "number" && (Number(has.system?.levels ?? 0) || 0) < trait.level) {
      return (await changeTrait(actor, { id: has.id, level: trait.level })) ? trait.name : null;
    }
    return null;
  }
  const done = await changeTrait(actor, { add: trait.name, ...(typeof trait.level === "number" ? { level: trait.level } : {}) });
  return done ? trait.name : null;
}

/** Applies every trait of a wound; the names of those written. */
export async function applyWoundTraits(actor: any, traits: readonly WoundTrait[]): Promise<string[]> {
  const written: string[] = [];
  for (const trait of traits) {
    const name = await applyWoundTrait(actor, trait);
    if (name) written.push(name);
  }
  return written;
}
