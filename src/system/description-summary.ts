/**
 * A description folded down to its first line.
 *
 * A trait's description on the sheet used to be printed whole. That was fine
 * while it held a sentence; a content module that fills it with the book's
 * several paragraphs would turn the traits tab into the book. So the tab
 * shows the first line and opens the rest on request, and this is the pure
 * half of that: what the first line is, and whether there is any more.
 *
 * The description is HTML, since the field is one. The first line is taken
 * from its text -- a paragraph, a line break or a list item ends a line --
 * and the full description is shown as it was written.
 */

/** A line longer than this is cut on the sheet, so it counts as having more. */
const ONE_LINE = 90;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** The text of an HTML description, block ends and line breaks as newlines. */
export function descriptionText(html: unknown): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

export interface DescriptionSummary {
  /** The first line of text, or "" for a blank description. */
  first: string;
  /** Whether the full description says more than the first line shows. */
  more: boolean;
}

/**
 * The first line of a description, and whether the rest is worth opening.
 *
 * A single short sentence has nothing to open: it is shown as it always was.
 * More than one line, or one line too long to fit, gets the fold.
 */
export function summariseDescription(html: unknown): DescriptionSummary {
  const lines = descriptionText(html)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  const first = lines[0] ?? "";
  return { first, more: lines.length > 1 || first.length > ONE_LINE };
}
