/**
 * One page of a long list, for the compendium picker.
 *
 * The picker used to stop at the first 200 rows and say how many it had left
 * out, with no way to reach them. Paging keeps each render as small as the cap
 * did while leaving every entry within reach of the Next button.
 */

/** Rows on one page: enough to scroll through, few enough to render at once. */
export const PAGE_SIZE = 200;

export interface ListPage {
  /** The page shown, counted from 0 and pulled back into range. */
  page: number;
  /** How many pages the list makes; 1 even when it is empty. */
  pages: number;
  /** The first row shown, as an index into the list. */
  start: number;
  /** One past the last row shown. */
  end: number;
}

/**
 * Which rows of a list of `total` make page `page`.
 *
 * A page past the end is read as the last one: the list can shrink under the
 * page it was on (an entry's pack switched off, a search narrowed), and an
 * empty page with rows before it would look like nothing matches.
 */
export function listPage(total: number, page: number, size = PAGE_SIZE): ListPage {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
  const start = current * size;
  return { page: current, pages, start, end: Math.min(total, start + size) };
}
