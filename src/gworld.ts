/**
 * GWorld - a GURPS (4th Edition) system for Foundry Virtual Tabletop.
 *
 * Entry point. The rules engine in `src/rules` is pure and Foundry-free; this
 * module and everything under `src/system` form the integration layer that
 * binds it to Foundry documents, sheets, and the canvas.
 */

import "./styles/gworld.css";

import * as rules from "./rules/index.js";
import { registerChatHooks } from "./system/chat.js";
import { registerFacing } from "./system/facing.js";
import { registerAimTracking } from "./system/aim.js";
import { registerBattleFatigue } from "./system/battle-fatigue.js";
import { loadSkillCatalog } from "./system/skill-catalog.js";
import { registerConditions, registerPostureSync } from "./system/conditions.js";
import { GWorldCombat } from "./system/combat.js";
import { SYSTEM_ID } from "./system/constants.js";
import { CharacterData } from "./system/data/character.js";
import { NpcData } from "./system/data/npc.js";
import {
  ArmorData,
  EquipmentData,
  LanguageData,
  ShieldData,
  SkillData,
  ModifierData,
  SpellData,
  TechniqueData,
  TemplateData,
  TraitData,
} from "./system/data/items.js";
import { GWorldCharacterSheet } from "./system/sheets/character-sheet.js";
import { GWorldItemSheet } from "./system/sheets/item-sheet.js";
import { GWorldNpcSheet } from "./system/sheets/npc-sheet.js";
import { registerSettings } from "./system/settings.js";
import { loadFilePartials, registerTemplateHelpers } from "./system/templates.js";

export { SYSTEM_ID };

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising GURPS system`);

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;

  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.skill = SkillData;
  CONFIG.Item.dataModels.technique = TechniqueData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.language = LanguageData;
  CONFIG.Item.dataModels.template = TemplateData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.modifier = ModifierData;

  // Initiative is Basic Speed, fixed for the whole fight (GURPS Lite p. 25):
  // nothing random goes into the formula, so it does not change between rounds.
  // The subclass breaks the ties, which quarter-point Basic Speed makes common.
  CONFIG.Combat.initiative = { formula: "@derived.basicSpeed", decimals: 2 };
  CONFIG.Combat.documentClass = GWorldCombat;

  // A GURPS turn is one second (Campaigns p. 363), so a round of combat
  // advances world time by one. A spell that lasts a minute runs out sixty
  // rounds later, which is what its duration on the sheet counts against.
  CONFIG.time.roundTime = 1;
  CONFIG.time.turnTime = 0;

  registerSettings();
  registerTemplateHelpers();
  // Partials kept in files rather than in strings. Not awaited: init is
  // synchronous, and nothing renders before it has finished.
  void loadFilePartials();

  // Foundry's own status effects are another game's. These are the states a
  // GURPS wound actually leaves somebody in.
  registerConditions();
  // The posture on the sheet and the prone icon on the token are one fact
  // written in two places, so changing either changes both.
  registerPostureSync();

  // A damage card is posted before anyone has decided who it hits, so the card
  // grows an apply control when it renders.
  registerChatHooks();

  // Which way a token faces, drawn on it, and the keys that turn it a hex
  // side at a time.
  registerFacing();

  // An aim is lost by doing anything else with the turn, and a battle that
  // ran on costs everyone in it a point of fatigue when the tracker closes.
  registerAimTracking();
  registerBattleFatigue();

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.applications.sheets.ActorSheetV2);
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "GWORLD.Sheet.Character",
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "GWORLD.Sheet.Npc",
  });

  // Without this, items fall back to Foundry's core sheet, which knows nothing
  // about these data models: a skill opens showing a name and an image and
  // nothing else that can be changed.
  DocumentSheetConfig.unregisterSheet(Item, "core", foundry.applications.sheets.ItemSheetV2);
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GWorldItemSheet, {
    types: [
      "trait", "skill", "technique", "equipment", "armor", "shield", "language", "template", "spell",
      "modifier",
    ],
    makeDefault: true,
    label: "GWORLD.Sheet.Item",
  });

  // Exposed for macros and for poking at the rules engine from the console.
  (globalThis as Record<string, unknown>).gworld = { rules };
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
  // What the compendia know about skills nobody on the sheet has learned,
  // so a weapon whose skill is missing is rolled at the book's default.
  void loadSkillCatalog();
});

export { rules };
