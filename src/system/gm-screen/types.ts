/**
 * What the GM Screen is made of, as plain data.
 *
 * Every section is built by a pure function from the rules modules the
 * automation itself reads, so the screen and the rolls never disagree, and
 * everything here can be tested without Foundry. The window turns these into
 * cards; see `apps/gm-screen.ts`.
 */

/** Localizes a key, formatting `{name}` placeholders; a string that is not a key comes back as it is. */
export type Translate = (key: string, data?: Record<string, string | number>) => string;

/** What a section's builder is handed. */
export interface BuildContext {
  t: Translate;
  /** A module's title, for the badge on what it added; its id where it has none. */
  moduleTitle: (id: string) => string;
}

/** One row of a table. */
export interface GmRow {
  cells: string[];
  /** What a roll on the table matches, to highlight the row it lands on. */
  key?: string;
  /** 1 for a row that belongs to the one above it: an option of a maneuver, a location within a location. */
  depth?: 0 | 1;
  /** The title of the module that added the row, where one did. */
  source?: string | null;
}

export interface GmTable {
  kind: "table";
  columns: string[];
  rows: GmRow[];
  /** Headings over runs of columns, left to right: "Wounding multiplier" over ten. */
  groups?: Array<{ label: string; span: number }>;
  /** How many columns stay in view while a wide table scrolls sideways. */
  pinned?: number;
  /** Columns centred rather than set left, by index: the figures of a wide table. */
  centered?: number[];
}

/** A term and what it comes to: "Retreat" and "+3 to Dodge, +1 to Parry or Block". */
export interface GmItem {
  term: string;
  text: string;
  source?: string | null;
}

export interface GmRules {
  kind: "rules";
  items: GmItem[];
}

/** A picture, drawn as SVG by the system itself, with a key under it. */
export interface GmDiagram {
  kind: "diagram";
  svg: string;
  legend: GmItem[];
}

export type GmContent = GmTable | GmRules | GmDiagram;

/** A part of a section: a table or a list, with a heading where the section has several. */
export interface GmPart {
  /** Where the part has prose of its own, what a journal page names to supply it. */
  id?: string;
  heading?: string;
  cite?: string;
  content: GmContent;
  notes?: string[];
}

export interface GmSectionContent {
  parts: GmPart[];
  notes?: string[];
}

/**
 * How a table is rolled on from the screen: the dice, anything asked first,
 * and which row a total lands on -- the automation's own lookup, so the card
 * and the highlighted row say the same.
 */
export interface GmRollSpec {
  formula: string;
  /** Asked before rolling and added to the total: a Fright Check's margin of failure, a reaction's modifiers. */
  ask?: "margin" | "modifier";
  /** The key of the row a total lands on. */
  rowFor: (total: number) => string;
  /** Whether a row needs a 1d roll for its side, as a hand or foot does. */
  sideFor?: (rowKey: string) => boolean;
}

/** A section as it is defined, by the system or by a module. */
export interface GmSectionDef {
  /** Unique across the screen; what a journal page names to supply its prose. */
  id: string;
  tab: string;
  /** A localization key, or a module's own text. */
  title: string;
  /** Where in the book it is, e.g. "p. B556". */
  cite?: string;
  /** A short summary in the system's own words, shown where no content module gives the prose. */
  summary?: string;
  build?: (context: BuildContext) => GmSectionContent;
  roll?: GmRollSpec;
  /** The module that added it, or null for the system's own. */
  module?: string | null;
  /** Shown to the GM only. */
  gmOnly?: boolean;
  /**
   * A place kept for a table the Basic Set does not have. It shows only when
   * a module fills it, in its place on the tab.
   */
  slot?: boolean;
  /** A module's prose for its own section: HTML, or a journal entry's uuid. */
  prose?: string | null;
  /** Takes the whole width of the screen rather than one column: a table too wide for one. */
  wide?: boolean;
}

/** A tab of the screen. */
export interface GmTabDef {
  id: string;
  /** A localization key, or a module's own text. */
  label: string;
  /** What is on it, in a few words, for the narrow window's tab menu. */
  hint?: string;
  icon: string;
  module?: string | null;
}
