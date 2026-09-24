import { describe, expect, it } from "vitest";

import { PAGE_SIZE, listPage } from "../list-page.js";

describe("listPage", () => {
  it("shows the first page of a long list", () => {
    expect(listPage(1764, 0)).toEqual({ page: 0, pages: 9, start: 0, end: PAGE_SIZE });
  });

  it("reaches the rows past the first 200", () => {
    expect(listPage(1764, 1)).toEqual({ page: 1, pages: 9, start: 200, end: 400 });
  });

  it("ends the last page at the last row", () => {
    expect(listPage(1764, 8)).toEqual({ page: 8, pages: 9, start: 1600, end: 1764 });
  });

  it("reads a page past the end as the last page, once the list has shrunk", () => {
    expect(listPage(250, 5)).toEqual({ page: 1, pages: 2, start: 200, end: 250 });
  });

  it("reads a page before the start, or no page at all, as the first", () => {
    expect(listPage(250, -3).page).toBe(0);
    expect(listPage(250, Number.NaN).page).toBe(0);
  });

  it("makes one empty page of an empty list", () => {
    expect(listPage(0, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 0 });
  });

  it("makes one page of a list that fits", () => {
    expect(listPage(200, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 200 });
    expect(listPage(201, 0).pages).toBe(2);
  });
});
