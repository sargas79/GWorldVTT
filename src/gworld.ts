/**
 * GWorld - a GURPS Lite (4th Edition) system for Foundry Virtual Tabletop.
 *
 * Entry point. The rules engine in `src/rules` is pure and Foundry-free; this
 * module and everything under `src/system` form the integration layer that
 * binds it to Foundry documents, sheets, and the canvas.
 */

import "./styles/gworld.css";

import * as rules from "./rules/index.js";
import { CharacterData } from "./system/data/character.js";
import {
  ArmorData,
  EquipmentData,
  LanguageData,
  ShieldData,
  SkillData,
  TraitData,
} from "./system/data/items.js";

export const SYSTEM_ID = "gworld";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising GURPS Lite system`);

  CONFIG.Actor.dataModels.character = CharacterData;

  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.skill = SkillData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.shield = ShieldData;
  CONFIG.Item.dataModels.language = LanguageData;

  // Initiative is Basic Speed, fixed for the whole fight (GURPS Lite p. 25).
  // The Combat subclass that enforces the ordering arrives with phase 5.
  CONFIG.Combat.initiative = { formula: "@derived.basicSpeed", decimals: 2 };

  // Exposed for macros and for poking at the rules engine from the console.
  (globalThis as Record<string, unknown>).gworld = { rules };
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
});

export { rules };
