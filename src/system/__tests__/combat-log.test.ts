import { describe, expect, it } from "vitest";

import { combatLog, plainLine } from "../sheet-v2/combat-log.js";

describe("the combat log", () => {
  const messages = [
    { id: "1", speakerActor: "elara", content: "<p>Old news</p>" },
    { id: "2", speakerActor: "guard", content: "<p>The guard shouts</p>" },
    { id: "3", speakerActor: "elara", flavor: "Shortsword", content: "<div>ignored</div>", rolls: [{}] },
    { id: "4", speakerActor: "elara", content: "<div class='gworld-chat'><b>Leather cuirass</b> absorbs 3 cutting damage</div>" },
    { id: "5", speakerActor: "elara", content: "   " },
  ];

  it("lists this character's messages, newest first, a line each", () => {
    expect(combatLog(messages, "elara").map((l) => [l.id, l.text, l.kind])).toEqual([
      ["4", "Leather cuirass absorbs 3 cutting damage", "note"],
      ["3", "Shortsword", "roll"],
      ["1", "Old news", "note"],
    ]);
  });

  it("keeps only the most recent", () => {
    expect(combatLog(messages, "elara", 2).map((l) => l.id)).toEqual(["4"]);
  });

  it("flattens a card to text and cuts it at a word", () => {
    expect(plainLine("<p>A&nbsp;&amp;&nbsp;B</p><style>.x{}</style>")).toBe("A & B");
    expect(plainLine("one two three four five six seven", 15)).toBe("one two three…");
  });
});
