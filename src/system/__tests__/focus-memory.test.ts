import { describe, expect, it, vi } from "vitest";

import { focusIsFree, rememberFocus, restoreFocus } from "../focus-memory.js";

/** A stand-in for a field on a rendered sheet. */
function field(options: {
  name?: string;
  id?: string;
  type?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  caretThrows?: boolean;
} = {}) {
  return {
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.id === undefined ? {} : { id: options.id }),
    type: options.type ?? "text",
    selectionStart: options.selectionStart ?? null,
    selectionEnd: options.selectionEnd ?? null,
    focus: vi.fn(),
    setSelectionRange: vi.fn(() => {
      if (options.caretThrows) throw new Error("this field refuses a selection");
    }),
  };
}

/**
 * A stand-in for the rendered application: a bag of fields answering to the
 * selectors rememberFocus builds.
 */
function root(fields: Record<string, ReturnType<typeof field>>, contains?: (node: unknown) => boolean) {
  return {
    querySelector: (selector: string) => fields[selector] ?? null,
    ...(contains ? { contains } : {}),
  };
}

describe("remembering where the focus was", () => {
  it("identifies a form field by its name", () => {
    const active = field({ name: "system.attributes.ST", selectionStart: 2, selectionEnd: 2 });
    expect(rememberFocus(root({}), active)).toEqual({
      selector: '[name="system.attributes.ST"]',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("falls back to the id for a field with no name", () => {
    // The builder's fields carry no name on purpose: one there would submit
    // onto the actor on every keystroke. They carry an id instead.
    const active = field({ id: "app-42-ST" });
    expect(rememberFocus(root({}), active)?.selector).toBe('[id="app-42-ST"]');
  });

  it("remembers nothing when there is no focus at all", () => {
    expect(rememberFocus(root({}), null)).toBeNull();
    expect(rememberFocus(root({}), undefined)).toBeNull();
  });

  it("remembers nothing for a field with neither name nor id", () => {
    expect(rememberFocus(root({}), field({}))).toBeNull();
  });

  it("remembers nothing when the focus is outside this application", () => {
    // Another window's field. Remembering it would mean reaching into that
    // window after this one re-renders.
    const elsewhere = field({ name: "other" });
    expect(rememberFocus(root({}, () => false), elsewhere)).toBeNull();
  });

  it("records no caret for a field that has none", () => {
    // Reading selectionStart on a number input throws in some browsers, so the
    // type is checked rather than the property merely being tried.
    const number = field({ name: "system.attributes.ST", type: "number", selectionStart: 3 });
    expect(rememberFocus(root({}), number)).toMatchObject({
      selectionStart: null,
      selectionEnd: null,
    });
  });
});

describe("whether the focus may be taken back", () => {
  it("is free when nothing holds it", () => {
    expect(focusIsFree(root({}), { active: null })).toBe(true);
    expect(focusIsFree(root({}), {})).toBe(true);
  });

  it("is free when it fell back to the body, which is what a render does", () => {
    const body = { tagName: "BODY" };
    expect(focusIsFree(root({}), { active: body, body })).toBe(true);
  });

  it("is not free while somebody is typing somewhere", () => {
    const body = { tagName: "BODY" };
    expect(focusIsFree(root({}), { active: field({ name: "elsewhere" }), body })).toBe(false);
  });
});

describe("putting the focus back", () => {
  it("focuses the remembered field and restores the caret", () => {
    const target = field({ name: "system.attributes.DX" });
    const memory = rememberFocus(root({}), field({
      name: "system.attributes.DX",
      selectionStart: 1,
      selectionEnd: 3,
    }));

    expect(restoreFocus(root({ '[name="system.attributes.DX"]': target }), memory)).toBe(true);
    expect(target.focus).toHaveBeenCalled();
    expect(target.setSelectionRange).toHaveBeenCalledWith(1, 3);
  });

  it("lands on the field Tab moved to, not the one that was edited", () => {
    // The whole point: editing ST and pressing Tab re-renders the sheet, and
    // by then the browser has already moved on to DX. DX is where to land.
    const dx = field({ name: "system.attributes.DX" });
    const memory = rememberFocus(root({}), field({ name: "system.attributes.DX" }));
    restoreFocus(root({ '[name="system.attributes.DX"]': dx }), memory);
    expect(dx.focus).toHaveBeenCalled();
  });

  it("declines while the player is typing somewhere else", () => {
    const target = field({ name: "a" });
    const memory = rememberFocus(root({}), field({ name: "a" }));
    const elsewhere = field({ name: "somewhere-else" });

    expect(restoreFocus(root({ '[name="a"]': target }), memory, { active: elsewhere })).toBe(false);
    expect(target.focus).not.toHaveBeenCalled();
  });

  it("declines when there is nothing remembered, or the field is gone", () => {
    expect(restoreFocus(root({}), null)).toBe(false);
    const memory = rememberFocus(root({}), field({ name: "vanished" }));
    expect(restoreFocus(root({}), memory)).toBe(false);
  });

  it("sets no caret on a field that has none", () => {
    const number = field({ name: "n", type: "number" });
    const memory = rememberFocus(root({}), field({ name: "n", type: "number", selectionStart: 2 }));
    expect(restoreFocus(root({ '[name="n"]': number }), memory)).toBe(true);
    expect(number.focus).toHaveBeenCalled();
    expect(number.setSelectionRange).not.toHaveBeenCalled();
  });

  it("keeps the focus even when the field refuses the caret", () => {
    // The focus is the part that matters; the caret is a nicety.
    const awkward = field({ name: "a", caretThrows: true });
    const memory = rememberFocus(root({}), field({ name: "a", selectionStart: 1, selectionEnd: 1 }));
    expect(restoreFocus(root({ '[name="a"]': awkward }), memory)).toBe(true);
    expect(awkward.focus).toHaveBeenCalled();
  });

  it("finds a field whose name holds a quote", () => {
    const odd = field({ name: 'say "hello"' });
    const memory = rememberFocus(root({}), field({ name: 'say "hello"' }));
    expect(memory?.selector).toBe('[name="say \\"hello\\""]');
    expect(restoreFocus(root({ [memory!.selector]: odd }), memory)).toBe(true);
  });
});
