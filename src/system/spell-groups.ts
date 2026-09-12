/**
 * How the Magic tab arranges a character's spells.
 *
 * By college, as the book's spell list is, and as a grimoire would be: the
 * Fire spells together, the Healing spells together. A spell of two colleges
 * is filed under the first the record names, which is the one the book lists
 * it under, and the tab shows the others beside it rather than listing the
 * spell twice.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

/** What the grouping needs to know about a spell. */
export interface GroupableSpell {
  id: string;
  name: string;
  colleges: readonly string[];
  points: number;
  /** The level it is cast at, or null when it cannot be. */
  level: number | null;
}

export interface SpellRow<T extends GroupableSpell> {
  spell: T;
  /** True when points have been spent on it: the spell is known (p. 235). */
  known: boolean;
  /** True when it can be rolled at all. A ritual mage can roll a spell at default. */
  rollable: boolean;
  /** The colleges beyond the one it is filed under. */
  otherColleges: string[];
}

export interface SpellGroup<T extends GroupableSpell> {
  /** The college, or "" for a spell that names none. */
  college: string;
  rows: SpellRow<T>[];
}

function byName<T extends GroupableSpell>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

function toRow<T extends GroupableSpell>(spell: T): SpellRow<T> {
  return {
    spell,
    known: spell.points > 0,
    rollable: spell.level !== null,
    otherColleges: spell.colleges.slice(1),
  };
}

/**
 * Arranges spells by college, colleges in alphabetical order and spells
 * within each likewise. A college with nothing in it is not shown; spells
 * that name no college are gathered last.
 */
export function groupSpells<T extends GroupableSpell>(spells: readonly T[]): SpellGroup<T>[] {
  const byCollege = new Map<string, T[]>();
  for (const spell of [...spells].sort(byName)) {
    const college = (spell.colleges[0] ?? "").trim();
    const list = byCollege.get(college) ?? [];
    list.push(spell);
    byCollege.set(college, list);
  }

  const named = [...byCollege.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const order = byCollege.has("") ? [...named, ""] : named;
  return order.map((college) => ({
    college,
    rows: (byCollege.get(college) ?? []).map(toRow),
  }));
}
