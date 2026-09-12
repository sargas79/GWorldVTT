/**
 * World settings.
 *
 * The one that matters is which combat system the table is using. GURPS offers
 * two -- an abstract one where everyone can reach everyone, and a tactical one
 * fought on a hex map where a figure has a front and a back -- and the choice
 * belongs to the GM for the whole world, not to a player per character.
 */

import { RulesSettings } from "./apps/rules-settings.js";
import { CompendiumSourcesSettings } from "./apps/compendium-sources.js";
import { SYSTEM_ID } from "./constants.js";
import { COMPENDIUM_SOURCES_KEY } from "./compendium-sources.js";
import { OPTIONAL_RULES_KEY, defaultRuleState } from "./optional-rules.js";

export const COMBAT_STYLE = "combatStyle";

/** How the Skills tab is ordered: by attribute, or one alphabetical list. */
export const SKILL_ORDER = "skillOrder";

export type CombatStyle = "basic" | "tactical";

export function registerSettings(): void {
  // The rules the table is playing, as one stored object. Not shown in the
  // core settings list itself -- the menu below is how it is edited, and a raw
  // JSON blob in a settings pane helps nobody.
  game.settings.register(SYSTEM_ID, OPTIONAL_RULES_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultRuleState(),
  });

  game.settings.registerMenu(SYSTEM_ID, "rules", {
    name: "GWORLD.Rules.Title",
    label: "GWORLD.Rules.MenuLabel",
    hint: "GWORLD.Rules.MenuHint",
    icon: "fa-solid fa-list-check",
    type: RulesSettings,
    restricted: true,
  });

  // Which compendia the picker offers. Empty means the system's own packs;
  // a GM with a private pack of house-ruled traits or campaign gear can add
  // it beside the book's, or put it in the book's place.
  game.settings.register(SYSTEM_ID, COMPENDIUM_SOURCES_KEY, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.registerMenu(SYSTEM_ID, "compendiumSources", {
    name: "GWORLD.Sources.Title",
    label: "GWORLD.Sources.MenuLabel",
    hint: "GWORLD.Sources.MenuHint",
    icon: "fa-solid fa-book-atlas",
    type: CompendiumSourcesSettings,
    restricted: true,
  });

  // A way of reading the sheet, not a fact about the character or the world,
  // so each player keeps their own.
  game.settings.register(SYSTEM_ID, SKILL_ORDER, {
    name: "GWORLD.Settings.SkillOrder.Name",
    hint: "GWORLD.Settings.SkillOrder.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      attribute: "GWORLD.Settings.SkillOrder.attribute",
      alphabetical: "GWORLD.Settings.SkillOrder.alphabetical",
    },
    default: "attribute",
  });

  game.settings.register(SYSTEM_ID, COMBAT_STYLE, {
    name: "GWORLD.Settings.CombatStyle.Name",
    hint: "GWORLD.Settings.CombatStyle.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      basic: "GWORLD.Settings.CombatStyle.Basic",
      tactical: "GWORLD.Settings.CombatStyle.Tactical",
    },
    default: "basic",
  });
}

/** Which combat system this world is using. */
export function combatStyle(): CombatStyle {
  return game.settings.get(SYSTEM_ID, COMBAT_STYLE) === "tactical" ? "tactical" : "basic";
}

/**
 * Whether the tactical rules apply.
 *
 * Only a hex grid can carry them: facing is defined by the six hexes around
 * you, and a square or gridless scene has no such thing. A world set to
 * tactical that opens a square-gridded scene falls back to basic combat rather
 * than inventing arcs, which is the honest answer and not a failure.
 */
export function tacticalOnScene(gridType: number | null | undefined): boolean {
  if (combatStyle() !== "tactical") return false;
  return typeof gridType === "number" && gridType >= 2 && gridType <= 5;
}
