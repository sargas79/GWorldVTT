import { describe, expect, it } from "vitest";

import { descriptionText, summariseDescription } from "../description-summary.js";

describe("descriptionText", () => {
  it("ends a line where the HTML ends a block", () => {
    expect(descriptionText("<p>One</p><p>Two</p>")).toBe("One\nTwo\n");
    expect(descriptionText("One<br>Two")).toBe("One\nTwo");
    expect(descriptionText("<ul><li>a</li><li>b</li></ul>")).toBe("a\nb\n");
  });

  it("strips tags and unescapes what the editor escaped", () => {
    expect(descriptionText("<p>Rock &amp; roll &lt;3</p>")).toBe("Rock & roll <3\n");
    expect(descriptionText("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  it("is empty for nothing", () => {
    expect(descriptionText("")).toBe("");
    expect(descriptionText(undefined)).toBe("");
  });
});

describe("summariseDescription", () => {
  it("shows a short one-liner whole, with nothing to open", () => {
    expect(summariseDescription("<p>You have +2 to Dodge.</p>")).toEqual({
      first: "You have +2 to Dodge.",
      more: false,
    });
  });

  it("folds several paragraphs down to the first", () => {
    const html = "<p>You are very hard to kill.</p><p>Second paragraph.</p><p>Third.</p>";
    expect(summariseDescription(html)).toEqual({ first: "You are very hard to kill.", more: true });
  });

  it("counts one line too long to fit as having more", () => {
    const long = "This one sentence goes on and on and on for far longer than a single line of the sheet can hold.";
    expect(summariseDescription(`<p>${long}</p>`)).toEqual({ first: long, more: true });
  });

  it("skips blank lines the editor leaves behind", () => {
    expect(summariseDescription("<p></p><p>  </p><p>First real line</p>")).toEqual({
      first: "First real line",
      more: false,
    });
  });

  it("is blank for a blank description", () => {
    expect(summariseDescription("")).toEqual({ first: "", more: false });
  });
});
