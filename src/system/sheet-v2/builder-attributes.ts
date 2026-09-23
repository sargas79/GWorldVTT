/**
 * What the guided build shows for an attribute (GURPS Basic Set: Characters
 * pp. 14-17, 261).
 *
 * The box on the Attributes step edits the figure the character *bought*,
 * because that is what the points ledger bills. Extra ST and its three
 * fellows (p. 14) and a racial template's modifiers (p. 261) move the score
 * without touching that figure, and are billed by the trait and by the racial
 * cost respectively.
 *
 * With only the box on the step, none of that was visible: a player who had
 * just bought Extra HT saw HT 10 still, and buying the point again in the box
 * -- paying for it twice -- was the obvious next move. This works out what to
 * show beside the box, and where each point of the difference came from.
 */

/** A line of where an attribute's extra points came from. */
export interface AttributeSource {
  /** A localization key when `labelKey`, else the text a module gave. */
  label: string;
  labelKey: boolean;
  value: number;
}

/** One attribute on the Attributes step. */
export interface BuilderAttributeRow {
  key: string;
  /** What was bought, which is what the box edits and the ledger bills. */
  value: number;
  /** What the character actually has, which is what they roll against. */
  total: number;
  /** True when the two differ, and the total is worth showing. */
  raised: boolean;
  sources: AttributeSource[];
}

export interface BuilderAttributeInput {
  key: string;
  /** The bought figure, from `system.attributes`. */
  bought: unknown;
  /** The score everything else reads, from `system.derived.attributes`. */
  total: unknown;
  /** What traits add, from `system.derived.attributeBonuses`. */
  fromTraits: unknown;
  /** What a racial template granted, from `system.racial`. */
  fromTemplate: unknown;
  /** What modules added, each with the reason it gave. */
  moduleLines?: ReadonlyArray<{ attribute?: string; value?: unknown; label?: unknown }>;
}

/** A number as stored, or the fallback where it is not one. */
function figure(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** One attribute's row: bought, total, and what accounts for the difference. */
export function builderAttributeRow(input: BuilderAttributeInput): BuilderAttributeRow {
  const value = figure(input.bought, 10);
  const total = figure(input.total, value);
  const sources: AttributeSource[] = [];

  const traits = figure(input.fromTraits, 0);
  if (traits !== 0) sources.push({ label: "GWORLD.Builder.FromTraits", labelKey: true, value: traits });

  const template = figure(input.fromTemplate, 0);
  if (template !== 0) sources.push({ label: "GWORLD.Builder.FromTemplate", labelKey: true, value: template });

  // A module's own line keeps the reason the module gave, so the step can say
  // where a point the character never bought came from.
  for (const line of input.moduleLines ?? []) {
    if (line?.attribute !== input.key) continue;
    const added = figure(line.value, 0);
    if (added !== 0) sources.push({ label: String(line.label ?? ""), labelKey: false, value: added });
  }

  return { key: input.key, value, total, raised: total !== value, sources };
}

/**
 * The bought figure behind a score typed into the sheet (#631).
 *
 * The character sheet's attribute box shows the score the character has, and
 * the ledger bills what was bought; whatever traits, a racial template and
 * modules add stays what it was, so the bought figure moves by exactly what
 * the score was moved by.
 */
export function boughtForScore(options: { entered: unknown; bought: unknown; score: unknown }): number | null {
  const entered = Number(options.entered);
  if (options.entered === "" || options.entered === null || !Number.isFinite(entered)) return null;
  const bought = figure(options.bought, 10);
  const score = figure(options.score, bought);
  return entered - (score - bought);
}
