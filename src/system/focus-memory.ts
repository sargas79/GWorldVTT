/**
 * Keeping the caret where the player left it across a re-render.
 *
 * The sheets submit on change, so editing an attribute updates the actor and
 * the actor update re-renders the sheet. The render replaces the element that
 * `Tab` has just moved to, and the focus goes with it: the player types a
 * number, tabs, and lands nowhere, having to reach for the mouse to carry on.
 *
 * The fix is to remember which field had the focus before the render and put
 * it back afterwards. Two details matter and are the reason this is a module
 * rather than three copies of four lines:
 *
 * - The field to remember is whichever is focused when the render *begins*,
 *   not the one that was edited. On `Tab` the browser has already moved on by
 *   then, so the field to restore is the one being tabbed to.
 * - Focus is only ever put back if it was lost. A render in a background
 *   window must not pull the caret out of whatever the player is typing into
 *   now, so a restore that would steal focus is declined.
 *
 * Written against the parts of the DOM it uses rather than the DOM itself, so
 * the decisions can be tested without a browser.
 */

/** The parts of a focusable field this reads and writes. */
export interface FocusableField {
  name?: string | null;
  /** Used where a field has no name: the builder's fields are identified by id. */
  id?: string | null;
  type?: string | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  focus?: (options?: unknown) => void;
  select?: () => void;
  setSelectionRange?: (start: number, end: number) => void;
}

/**
 * The parts of a rendered application this reads.
 *
 * Loose on purpose: a real `HTMLElement` satisfies it, and so does a plain
 * object in a test, which is what lets the decisions below be checked without
 * a browser.
 */
export interface FocusRoot {
  querySelector(selector: string): unknown;
  contains?(node: never): boolean;
}

/** Where the focus was, in terms that survive the element being replaced. */
export interface RememberedFocus {
  /** A selector that finds the field again in the re-rendered markup. */
  selector: string;
  /** Where the caret was, for a field that has one. */
  selectionStart: number | null;
  selectionEnd: number | null;
}

/**
 * Input types that carry a caret. A number field does not: reading or setting
 * `selectionStart` on one throws in some browsers, which is why the type is
 * checked rather than the property merely being tried.
 */
const SELECTABLE_TYPES: ReadonlySet<string> = new Set([
  "", "text", "search", "url", "tel", "password", "textarea",
]);

/** Whether a field's caret position can be read and written. */
function hasCaret(field: FocusableField): boolean {
  return SELECTABLE_TYPES.has(String(field.type ?? "").toLowerCase());
}

/** An attribute selector for a value that may hold quotes or backslashes. */
function attributeSelector(attribute: string, value: string): string {
  return `[${attribute}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

/**
 * How to find this field again after the render.
 *
 * A form field is found by its name. The builder's fields are not form fields
 * -- a `name` there would submit onto the actor on every keystroke -- so they
 * are found by their id, which is stable across a render.
 */
function selectorFor(field: FocusableField): string | null {
  const name = String(field.name ?? "");
  if (name) return attributeSelector("name", name);
  const id = String(field.id ?? "");
  if (id) return attributeSelector("id", id);
  return null;
}

/**
 * What to put back after the render, or null when there is nothing worth
 * remembering: no focus, focus outside this application, or a focused element
 * with no name to find it by again.
 */
export function rememberFocus(
  root: FocusRoot | null | undefined,
  active: unknown,
): RememberedFocus | null {
  const field = asField(active);
  if (!root || !field) return null;
  if (root.contains && !root.contains(active as never)) return null;

  const selector = selectorFor(field);
  if (!selector) return null;

  // A field with no caret reports none rather than a position of zero, so a
  // number field is not sent back with a caret it cannot take.
  const caret = hasCaret(field);
  return {
    selector,
    selectionStart: caret ? (field.selectionStart ?? null) : null,
    selectionEnd: caret ? (field.selectionEnd ?? null) : null,
  };
}

/** Where the focus is now, which decides whether putting it back would steal it. */
export interface FocusNow {
  /** The focused element, if any. */
  active?: unknown;
  /** The document's body, which is what holds the focus when nothing else does. */
  body?: unknown;
}

/** Narrows anything that might be a field to the parts this module uses. */
function asField(value: unknown): FocusableField | null {
  return value && typeof value === "object" ? (value as FocusableField) : null;
}

/**
 * Whether the focus is free to be taken.
 *
 * It is free when nothing holds it -- which is the case after a render has
 * replaced the focused element. It is not free when the player is typing
 * somewhere, whether inside this application (the focus survived, so there is
 * nothing to do) or in another window (taking it would be a bug of its own).
 */
export function focusIsFree(_root: FocusRoot | null | undefined, now: FocusNow): boolean {
  const active = now.active;
  if (!active) return true;
  if (now.body !== undefined && active === now.body) return true;
  return false;
}

/**
 * Puts the focus back on the remembered field, and the caret with it.
 *
 * Returns whether it did, which is what the tests read and what a caller can
 * use to decide whether to fall back to something else.
 */
export function restoreFocus(
  root: FocusRoot | null | undefined,
  memory: RememberedFocus | null | undefined,
  now: FocusNow = {},
): boolean {
  if (!root || !memory) return false;
  if (!focusIsFree(root, now)) return false;

  const field = asField(root.querySelector(memory.selector));
  if (!field || typeof field.focus !== "function") return false;

  field.focus();

  // The caret only goes back where the field has one, and only when it was
  // somewhere in particular. A failure here must not cost the focus, which is
  // the part that matters.
  if (memory.selectionStart !== null && hasCaret(field) && typeof field.setSelectionRange === "function") {
    try {
      field.setSelectionRange(memory.selectionStart, memory.selectionEnd ?? memory.selectionStart);
    } catch {
      // Some fields refuse a selection even when their type says otherwise.
    }
  }

  return true;
}
