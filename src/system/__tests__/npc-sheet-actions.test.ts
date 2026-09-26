import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The one-pane NPC sheet shows the character sheet's attack cards, so every
 * button a card can carry has to be an action of the NPC sheet too: a card
 * whose affliction roll the pane had no handler for did nothing when pressed.
 */

const ROOT = join(process.cwd(), "templates", "actor");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** The templates the pane renders: its own, the attack card, and the parts the card includes. */
const templates = [
  read("npc-sheet.hbs"),
  read("v2", "attack-card.hbs"),
  ...["melee", "ranged"].flatMap((range) =>
    ["roll", "damage", "affliction"].map((kind) => read("parts", `attack-${range}-${kind}.hbs`)),
  ),
].join("\n");

const sheet = readFileSync(join(process.cwd(), "src", "system", "sheets", "npc-sheet.ts"), "utf8");

/** Actions a card carries only when it is a row of a list, which the pane never passes. */
const LIST_ONLY = new Set(["v2Select"]);

const actions = [...new Set([...templates.matchAll(/data-action="(\w+)"/g)].map((m) => m[1]!))].filter(
  (a) => !LIST_ONLY.has(a),
);

describe("the NPC sheet's actions", () => {
  it("finds the actions its templates carry", () => {
    expect(actions).toEqual(expect.arrayContaining(["roll", "rollDamage", "affliction", "readyWeapon", "openFullSheet"]));
  });

  it.each(actions)("%s is an action of the NPC sheet", (action) => {
    expect(sheet).toMatch(new RegExp(`\\b${action}: GWorldNpcSheet\\.#\\w+`));
  });
});
