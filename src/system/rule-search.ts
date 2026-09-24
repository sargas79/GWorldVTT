/**
 * Finding a rule on the Rules page by typing part of it.
 *
 * With the system's groups and every module's besides, the page runs to
 * enough switches that reading down it for one is the slow way.
 */

/** A rule as the search sees it: its key and the words it can be found by. */
export interface SearchableRule {
  key: string;
  /** The rule's name, its hint, and its group's label, already localized. */
  text: string;
}

/** Lowercased and trimmed, the form both sides of a match are compared in. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Whether a rule's words contain what was typed. An empty search matches everything. */
export function ruleMatches(text: string, query: string): boolean {
  const wanted = normaliseQuery(query);
  return !wanted || text.toLowerCase().includes(wanted);
}

/**
 * The keys All on and All off act on: the rules a search shows, or every rule
 * when there is no search. A rule hidden by the search is left as it is --
 * turning on everything to do with grappling should not also switch off magic.
 */
export function rulesInView(rules: readonly SearchableRule[], query: string): string[] {
  return rules.filter((rule) => ruleMatches(rule.text, query)).map((rule) => rule.key);
}
