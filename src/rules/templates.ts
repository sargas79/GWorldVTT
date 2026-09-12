/**
 * Templates and racial templates (GURPS Basic Set: Characters pp. 258-263).
 *
 * A template is "a partially completed character sheet that contains only those
 * traits required for a character to fill a certain role believably", and the
 * two kinds differ in one important way:
 *
 * A **character template** states attributes as scores you buy -- "ST 9 [-10];
 * DX 11 [20]" -- so its cost is simply the sum of everything in it, and a
 * character who takes one has bought those attributes in the ordinary way.
 *
 * A **racial template** states them as modifiers to whatever you bought, and
 * "there is no added point cost for any of this! You paid for these bonuses or
 * penalties when you paid your racial cost." So a racial modifier moves the
 * score without being billed for it, and the cost the template states for those
 * modifiers is billed once, as part of the racial cost.
 *
 * Getting that split right is most of this module. The rest is the choices --
 * "select two skills from", "20 points chosen from among" -- which is what
 * makes a template a template rather than a list.
 */

import type { Attribute } from "./types.js";

/** Which kind of template this is (pp. 258, 260). */
export type TemplateKind =
  /** An occupation or a dramatic role, bought with starting points. */
  | "character"
  /** A species, whose modifiers are free once the racial cost is paid. */
  | "racial"
  /** A modifier applied on top of another template. */
  | "lens"
  /**
   * "A collection of traits that are typical of a particular mental, physical,
   * or supernatural state" (p. 262). It behaves like a racial template -- its
   * traits are a package with one total -- and is recorded on a sheet instead
   * of its components.
   */
  | "metaTrait";

/** The secondary characteristics a template can move. */
export type SecondaryKey = "hp" | "will" | "per" | "fp" | "basicSpeed" | "basicMove";

/** One thing a template grants: a trait, a skill, a technique, a language. */
export interface TemplateEntry {
  name: string;
  /** Which kind of item this becomes on the sheet. */
  itemType: "trait" | "skill" | "technique" | "language" | "equipment";
  /** What the template says it costs, which is what the sheet will bill. */
  points: number;
  /** Levels, for a trait bought in them. */
  levels?: number;
  /** The compendium document this came from, so applying it keeps the real one. */
  uuid?: string;
  /**
   * The choice group this belongs to, or "" for something everyone gets.
   *
   * "Racial traits are rarely optional" -- so a racial template's entries are
   * normally all ungrouped, and a character template's are where the groups
   * mostly live.
   */
  group?: string;
  /** A skill's difficulty and relative level, for the line the sheet shows. */
  note?: string;
}

/** A set of options a template makes you choose between (p. 258). */
export interface ChoiceGroup {
  id: string;
  label: string;
  /**
   * How the requirement is stated: "select two skills from" counts entries,
   * "20 points chosen from among" counts points.
   */
  kind: "count" | "points";
  /** How many, or how many points' worth. */
  required: number;
}

/** A template, as the book writes one out. */
export interface Template {
  name: string;
  kind: TemplateKind;
  /** The cost the book states, for showing beside what this adds up to. */
  statedCost: number;
  /**
   * Attribute scores for a character template, or modifiers for a racial one.
   * Which it is follows from `kind`, and nothing else reads it.
   */
  attributes: Partial<Record<Attribute, number>>;
  secondary: Partial<Record<SecondaryKey, number>>;
  /** Size Modifier, which a racial template often changes and never bills. */
  sizeModifier?: number;
  /**
   * What the template says its attribute and secondary modifiers cost.
   *
   * A racial template needs this because the modifiers themselves are free:
   * the Dragon's "ST+15 (Size, -20%) [120]" is 120 points however little the
   * unmodified table would charge for fifteen levels. A character template
   * leaves it at zero, since its attributes are bought in the ordinary way and
   * billed by the sheet.
   */
  attributeCost: number;
  entries: TemplateEntry[];
  choices: ChoiceGroup[];
  /** Notes that cost nothing: "sterility and an ordinary tail" (p. 261). */
  features: string[];
  /** Traits members of the race may not have. Also free (p. 261). */
  tabooTraits: string[];
}

/** Everything in a template that everybody who takes it gets. */
export function requiredEntries(template: Pick<Template, "entries">): TemplateEntry[] {
  return template.entries.filter((entry) => !entry.group);
}

/** The entries belonging to one choice group. */
export function entriesInGroup(
  template: Pick<Template, "entries">,
  group: string,
): TemplateEntry[] {
  return template.entries.filter((entry) => entry.group === group);
}

/**
 * What a template costs, added up from its parts.
 *
 * "It lists the point costs of those traits, and gives the sum as the
 * template's cost." Choices are counted at what the requirement says they cost
 * rather than at what any particular set of picks would: a template offering
 * "20 points chosen from among" costs 20 for that group whichever twenty are
 * taken.
 */
export function templateCost(template: Template): number {
  const required = requiredEntries(template).reduce((sum, entry) => sum + entry.points, 0);

  const chosen = template.choices.reduce((sum, group) => {
    if (group.kind === "points") return sum + group.required;

    // A count group costs what the cheapest legal set of picks costs, which
    // for the book's own templates is every option priced the same anyway.
    const options = entriesInGroup(template, group.id)
      .map((entry) => entry.points)
      .sort((a, b) => a - b);
    return sum + options.slice(0, Math.max(0, group.required)).reduce((a, b) => a + b, 0);
  }, 0);

  return template.attributeCost + required + chosen;
}

/**
 * Whether a set of picks satisfies a choice group (p. 258).
 *
 * A count group wants that many picks; a points group wants that many points'
 * worth. Neither is checked as an upper bound: "you are free to alter anything
 * that came with it", and a player who takes an extra option has customised the
 * template rather than broken it.
 */
export function choiceSatisfied(options: {
  group: ChoiceGroup;
  picks: TemplateEntry[];
}): boolean {
  if (options.group.kind === "count") return options.picks.length >= options.group.required;

  const spent = options.picks.reduce((sum, entry) => sum + entry.points, 0);
  // A group of disadvantages is stated as "-35 points chosen from among", so
  // the comparison is on how much was taken rather than on its sign.
  return Math.abs(spent) >= Math.abs(options.group.required);
}

/** What applying a template does to an actor's numbers. */
export interface TemplateApplication {
  /** Attribute scores to write, for a character template. */
  attributes: Partial<Record<Attribute, number>>;
  /** Attribute levels granted without being billed, for a racial one. */
  racial: Partial<Record<Attribute, number>>;
  /**
   * Secondary levels bought in the ordinary way, for a character template.
   *
   * The book prints these as scores -- "HP 11 [2]" -- but what a sheet stores
   * is the levels above the default the attributes give, which is what the [2]
   * is the price of.
   */
  purchased: Partial<Record<SecondaryKey, number>>;
  /** Secondary levels granted without being billed, for a racial template. */
  bonuses: Partial<Record<SecondaryKey, number>>;
  sizeModifier: number | null;
  /** Points to bill for the modifiers themselves, which is the racial half. */
  attributeCost: number;
}

/**
 * How a template's numbers land on a character (pp. 258, 261).
 *
 * "Apply attribute modifiers to the attributes you purchase for your character.
 * Next, recalculate your secondary characteristics to reflect your modified
 * attributes. Finally, apply secondary characteristic modifiers."
 *
 * The recalculation in the middle is the sheet's own doing, so what this
 * returns is the two ends: what to add to the attributes, and what to add to
 * the secondaries afterwards.
 */
export function applyTemplate(options: {
  template: Template;
  /** The attributes as bought, which a racial template modifies. */
  bought: Record<Attribute, number>;
}): TemplateApplication {
  const { template } = options;

  if (template.kind === "character") {
    return {
      // "Do this instead of buying individual attributes": a character
      // template's attributes and secondaries are bought, and the sheet bills
      // them at the ordinary rate -- which is the rate the template was priced
      // at in the first place.
      attributes: { ...template.attributes },
      racial: {},
      purchased: { ...template.secondary },
      bonuses: {},
      sizeModifier: template.sizeModifier ?? null,
      attributeCost: 0,
    };
  }

  // A racial template's modifiers are granted rather than bought, on both
  // halves: "there is no added point cost for any of this."
  return {
    attributes: {},
    racial: { ...template.attributes },
    purchased: {},
    bonuses: { ...template.secondary },
    sizeModifier: template.sizeModifier ?? null,
    attributeCost: template.attributeCost,
  };
}

/**
 * Two templates stacked into one (pp. 259, 261).
 *
 * "When you combine templates, choose the highest level of each attribute and
 * secondary characteristic from among the templates. Combine the advantage,
 * disadvantage, and skill lists of all the templates, and take all required
 * traits. If multiple templates require a leveled trait, such as a skill, meet
 * the most difficult requirement -- do not take repeated traits at higher
 * levels."
 *
 * For two racial templates the rule is different in one word: "add traits that
 * come in levels (e.g., if an Elf has ST-1 and a Vampire has ST+6, a Vampire
 * Elf has ST+5)", because those are modifiers rather than scores.
 */
export function combineTemplates(first: Template, second: Template): Template {
  const bothRacial = first.kind === "racial" && second.kind === "racial";
  const pick = (a: number | undefined, b: number | undefined): number | undefined => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return bothRacial ? a + b : Math.max(a, b);
  };

  const attributes: Partial<Record<Attribute, number>> = {};
  for (const key of ["ST", "DX", "IQ", "HT"] as const) {
    const value = pick(first.attributes[key], second.attributes[key]);
    if (value !== undefined) attributes[key] = value;
  }

  const secondary: Partial<Record<SecondaryKey, number>> = {};
  for (const key of ["hp", "will", "per", "fp", "basicSpeed", "basicMove"] as const) {
    const value = pick(first.secondary[key], second.secondary[key]);
    if (value !== undefined) secondary[key] = value;
  }

  // "Do not take repeated traits at higher levels": one entry per name, at the
  // most demanding of the two.
  const entries = new Map<string, TemplateEntry>();
  for (const entry of [...first.entries, ...second.entries]) {
    const key = `${entry.itemType}:${entry.name.toLowerCase()}`;
    const existing = entries.get(key);
    if (!existing || entry.points > existing.points) entries.set(key, entry);
  }

  const combined: Template = {
    name: `${first.name} ${second.name}`,
    kind: bothRacial ? "racial" : "character",
    statedCost: 0,
    attributes,
    secondary,
    ...(first.sizeModifier !== undefined || second.sizeModifier !== undefined
      ? { sizeModifier: (first.sizeModifier ?? 0) + (second.sizeModifier ?? 0) }
      : {}),
    attributeCost: first.attributeCost + second.attributeCost,
    entries: [...entries.values()],
    choices: [...first.choices, ...second.choices],
    features: [...new Set([...first.features, ...second.features])],
    tabooTraits: [...new Set([...first.tabooTraits, ...second.tabooTraits])],
  };

  // "Adjust the combined template cost appropriately", which is what the parts
  // now add up to rather than what either template said on its own.
  combined.statedCost = templateCost(combined);
  return combined;
}

/** It costs nothing to be human (p. 261). */
export const HUMAN_RACIAL_COST = 0;

/** An empty template, for a GM starting one from nothing. */
export function emptyTemplate(kind: TemplateKind = "character"): Template {
  return {
    name: "",
    kind,
    statedCost: 0,
    attributes: {},
    secondary: {},
    attributeCost: 0,
    entries: [],
    choices: [],
    features: [],
    tabooTraits: [],
  };
}
