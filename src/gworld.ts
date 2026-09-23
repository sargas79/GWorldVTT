/**
 * GWorld - a GURPS (4th Edition) system for Foundry Virtual Tabletop.
 *
 * Entry point. The rules engine in `src/rules` is pure and Foundry-free; this
 * module and everything under `src/system` form the integration layer that
 * binds it to Foundry documents, sheets, and the canvas.
 */

import { registerConsciousnessTurns } from "./system/consciousness.js";
import "./styles/gworld.css";
import "./styles/sheet-v2.css";
import "./styles/party.css";
import "./styles/vehicle.css";

import * as rules from "./rules/index.js";
import { registerChatHooks } from "./system/chat.js";
import { registerSuppressionFire } from "./system/suppression-fire.js";
import { registerFacing } from "./system/facing.js";
import { registerAimTracking } from "./system/aim.js";
import { registerSupersededPackHiding } from "./system/compendium-sources.js";
import { registerEvaluateTracking } from "./system/evaluate.js";
import { registerConcentrateTracking } from "./system/zen.js";
import { registerBattleFatigue } from "./system/battle-fatigue.js";
import { loadSkillCatalog } from "./system/skill-catalog.js";
import { setCondition, registerConditions, registerPostureSync, registerStunSync } from "./system/conditions.js";
import { GWorldCombat } from "./system/combat.js";
import { SYSTEM_ID } from "./system/constants.js";
import { CharacterData } from "./system/data/character.js";
import { NpcData } from "./system/data/npc.js";
import { VehicleData } from "./system/data/vehicle.js";
import { PartyData } from "./system/data/party.js";
import { registerPartyHooks } from "./system/party.js";
import { GWorldPartySheet } from "./system/sheets/party-sheet.js";
import { GWorldItem } from "./system/documents/item.js";
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
import { GWorldCharacterSheetV2 } from "./system/sheets/character-sheet-v2.js";
import { GWorldItemSheet } from "./system/sheets/item-sheet.js";
import { GWorldGenericItemSheet } from "./system/sheets/generic-item-sheet.js";
import { setGenericSheetRegistrar } from "./system/data-extensions.js";
import { registerSheetExtensionHooks } from "./system/sheet-extensions.js";
import { registerDemolitionTool } from "./system/demolition.js";
import { GWorldNpcSheet } from "./system/sheets/npc-sheet.js";
import { GWorldVehicleSheet } from "./system/sheets/vehicle-sheet.js";
import { READY_HOOK, createApi, warnIncompatibleModules } from "./system/api.js";
import { registerCombatStateHooks } from "./system/combat-extensions.js";
import { registerProcedureHooks } from "./system/procedure-extensions.js";
import { configureDeprecatedData, registerMigrationSettings, warnUncoveredData } from "./system/migration.js";
import { closeRuleRegistration, openRuleRegistration, registerRule, registerRuleGroup } from "./system/rule-registry.js";
import { registerSettings } from "./system/settings.js";
import { migratePartyCampaignTerms } from "./system/campaign.js";
import { loadFilePartials, registerTemplateHelpers } from "./system/templates.js";

export { SYSTEM_ID };

/** The add-on API, built once; `game.gworld.api` holds it from `init` on. */
const api = createApi();

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialising GURPS system`);

  // The public API for add-on modules, in place before any of them is asked
  // to register anything (see src/system/api.ts for the contract).
  game.gworld = { api };

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;
  CONFIG.Actor.dataModels.vehicle = VehicleData;
  CONFIG.Actor.dataModels.party = PartyData;

  // Each kind of item gets its own picture rather than Foundry's one bag.
  CONFIG.Item.documentClass = GWorldItem;

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

  // Add-on modules register their rule groups and switches here, before the
  // settings that store them exist and before anything asks about a rule.
  openRuleRegistration();
  registerSettings();
  registerMigrationSettings();
  configureDeprecatedData();
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
  // So are the sheet's Stunned box and the stunned icon.
  registerStunSync();

  // A damage card is posted before anyone has decided who it hits, so the card
  // grows an apply control when it renders.
  registerChatHooks();
  registerSuppressionFire();
  registerSupersededPackHiding();
  registerSheetExtensionHooks();
  // The GM's Demolition tool: a charge set off against a door or a wall (p. 415).
  registerDemolitionTool();
  // Which party an actor is in, the members' refresh when a party changes,
  // and the party's members nested under it in the sidebar.
  registerPartyHooks();

  // Which way a token faces, drawn on it, and the keys that turn it a hex
  // side at a time.
  registerFacing();

  // An aim is lost by doing anything else with the turn, and a battle that
  // ran on costs everyone in it a point of fatigue when the tracker closes.
  registerAimTracking();
  registerEvaluateTracking();
  registerConcentrateTracking();
  registerBattleFatigue();
  // What a module keeps per combatant runs out at the turn, round or combat
  // boundary it asked for.
  registerCombatStateHooks();
  registerProcedureHooks(setCondition);
  registerConsciousnessTurns();

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.applications.sheets.ActorSheetV2);
  // A character that was set to the classic sheet, which is gone, opens on
  // this one: Foundry falls back to the default for a sheet it no longer has.
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldCharacterSheetV2, {
    types: ["character"],
    makeDefault: true,
    label: "GWORLD.Sheet.CharacterV2",
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "GWORLD.Sheet.Npc",
  });
  // An NPC is built like a character, so it is edited on the character's
  // sheet: the one-pane NPC sheet is for reading at the table, and opens
  // this one from its Edit button.
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldCharacterSheetV2, {
    types: ["npc"],
    label: "GWORLD.Sheet.NpcFullV2",
  });
  // A car in a chase is not a line on a shopping list (Campaigns pp. 462-469).
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldVehicleSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "GWORLD.Sheet.Vehicle",
  });
  // The people a campaign follows, on one page, and the terms it was set on.
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, GWorldPartySheet, {
    types: ["party"],
    makeDefault: true,
    label: "GWORLD.Sheet.Party",
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
  // An add-on module's item type opens on the generic sheet unless the module
  // registers one of its own.
  setGenericSheetRegistrar((type) => {
    DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GWorldGenericItemSheet, {
      types: [type],
      makeDefault: true,
      label: "GWORLD.Sheet.GenericItem",
    });
  });

  // Exposed for macros and for poking at the rules engine from the console.
  // The registry is here too, for a module that registers its rules from its
  // own `init` rather than from the `gworld.registerRules` hook.
  (globalThis as Record<string, unknown>).gworld = { rules, api, registry: { registerRuleGroup, registerRule } };
});

// From here on settings are read and sheets drawn, so a rule turning up now
// would be a switch nobody saw.
Hooks.once("setup", () => closeRuleRegistration());

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
  // What the compendia know about skills nobody on the sheet has learned,
  // so a weapon whose skill is missing is rolled at the book's default.
  void loadSkillCatalog();

  // A module that needs an API this system doesn't provide is worth the GM
  // hearing about now, rather than finding its rules quietly absent.
  // Before any module's ready work saves anything: data the world holds that
  // the system is about to stop defining, and no active module takes over.
  warnUncoveredData();
  warnIncompatibleModules();
  // The campaign's terms, kept on a party before #642, into the world settings.
  void migratePartyCampaignTerms();
  Hooks.callAll(READY_HOOK, api);
});

export { rules };
