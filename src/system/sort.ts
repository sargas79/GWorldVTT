/**
 * The one order every list on a character sheet is shown in: by name.
 *
 * Advantages, disadvantages, quirks, languages, armour and the rest used to
 * appear in the order they were added, so a trait bought last sat at the foot
 * of its list whatever it was called. A player looking for "Night Vision"
 * reads down an alphabet, not a purchase history.
 *
 * The comparison is the reader's locale's, ignoring case and accents, with
 * digits read as numbers so "Acute Vision 10" follows "Acute Vision 2". Ties
 * fall back to the id, so two items of one name keep a stable order between
 * redraws.
 *
 * Kept apart from the sheets so it can be tested without Foundry.
 */

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** What sorting needs to know about an entry. */
export interface Named {
  name?: unknown;
  id?: unknown;
}

/** Compares two entries by name, then by id. */
export function byName(a: Named, b: Named): number {
  const named = collator.compare(String(a?.name ?? ""), String(b?.name ?? ""));
  if (named !== 0) return named;
  return collator.compare(String(a?.id ?? ""), String(b?.id ?? ""));
}

/** A sorted copy of a list, by name. The list itself is left as it was. */
export function sortedByName<T extends Named>(entries: Iterable<T>): T[] {
  return [...entries].sort(byName);
}

/** A sorted copy of a list of wrapped entries, by the name of what each wraps. */
export function sortedByNameOf<T>(entries: Iterable<T>, named: (entry: T) => Named): T[] {
  return [...entries].sort((a, b) => byName(named(a), named(b)));
}
