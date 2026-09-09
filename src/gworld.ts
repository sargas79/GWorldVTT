/**
 * GWorld - a GURPS Lite (4th Edition) system for Foundry Virtual Tabletop.
 *
 * Entry point. The rules engine in `src/rules` is pure and Foundry-free; this
 * module and everything under `src/system` form the integration layer that
 * binds it to Foundry documents, sheets, and the canvas.
 */

import "./styles/gworld.css";

import * as rules from "./rules/index.js";
import { SYSTEM_ID } from "./system/constants.js";
import { CharacterData } from "./system/data/character.js";
import { NpcData } from "./system/data/npc.js";
import {
  ArmorData,
  EquipmentData,
  LanguageData,
  ShieldData,
  SkillData,
  TraitData,
} from "./system/data/items.js";
import { GWorldCharacterSheet } from "./system/sheets/character-sheet.js";
import { GWorldNpcSheet } from "./system/sheets/npc-sheet.js";
import { registerTemplateHelpers } from "./system/templates.js";

export { SYSTEM_ID };

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising GURPS Lite system`);

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;

  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.skill = SkillData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.language = LanguageData;

  // Initiative is Basic Speed, fixed for the whole fight (GURPS Lite p. 25).
  // The Combat subclass that enforces the ordering arrives with a later phase.
  CONFIG.Combat.initiative = { formula: "@derived.basicSpeed", decimals: 2 };

  registerTemplateHelpers();

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

  // Exposed for macros and for poking at the rules engine from the console.
  (globalThis as Record<string, unknown>).gworld = { rules };
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
});

export { rules };
