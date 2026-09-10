# Graph Report - GWorldVTT  (2026-09-10)

## Corpus Check
- 44 files · ~125,788 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 430 nodes · 796 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.88)
- Token cost: 90,796 input · 0 output

## Community Hubs (Navigation)
- Active Defenses
- Foundry Integration & Rolls
- Damage & Injury Pipeline
- Character Sheet Design
- Build Tooling & Dependencies
- Skill Levels & Defaults
- Foundry API Declarations
- Attributes & Encumbrance
- TypeScript Configuration
- Schema Field Types
- ApplicationV2 Sheet Classes
- DataModel Base Classes
- Code Formatting Config
- Dice Roller
- Dev Deploy Script
- Field Option Types
- Sheet Registration
- Skill Difficulty Notation
- Rich Text Field

## God Nodes (most connected - your core abstractions)
1. `GWorldCharacterSheet` - 19 edges
2. `compilerOptions` - 17 edges
3. `DataField` - 12 edges
4. `scripts` - 11 edges
5. `CharacterData` - 11 edges
6. `encumbranceState` - 9 edges
7. `GWorld character sheet design (5-tab shell)` - 9 edges
8. `weaponDamage()` - 8 edges
9. `dodge()` - 8 edges
10. `parseDiceAdds()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `src/rules — pure rules engine` --conceptually_related_to--> `GWorld character sheet design (5-tab shell)`  [AMBIGUOUS]
  README.md → design/Main.dc.html
- `GWorld character sheet design (5-tab shell)` --implements--> `Phase 2 — Character sheet`  [INFERRED]
  design/Main.dc.html → README.md
- `Secondary Characteristics with derivation formulas` --implements--> `src/rules — pure rules engine`  [INFERRED]
  design/Main.dc.html → README.md
- `Combat Reflexes advantage` --shares_data_with--> `Persistent sheet header (pools, defense strip)`  [INFERRED]
  design/Traits.dc.html → design/Main.dc.html
- `Skills tab` --shares_data_with--> `Parchment CSS variable palette`  [INFERRED]
  design/Skills.dc.html → design/Main.dc.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Five-tab character sheet shell sharing header, palette and character data** — design_main_dc_attributes_tab, design_skills_dc_skills_tab, design_traits_dc_traits_tab, design_equipment_dc_equipment_tab, design_description_dc_description_tab, design_main_dc_persistent_header, design_main_dc_parchment_palette [EXTRACTED 1.00]
- **Character point budget: ledger fed by attributes, traits, quirks, skills and languages** — design_main_dc_points_ledger, design_main_dc_basic_attributes, design_traits_dc_advantages, design_traits_dc_disadvantages, design_traits_dc_quirks, design_skills_dc_skills_tab, design_description_dc_languages, design_traits_dc_disadvantage_limit [EXTRACTED 1.00]
- **Active defense and movement derivation: attributes, gear, traits and encumbrance into the header strip** — design_main_dc_persistent_header, design_main_dc_secondary_characteristics, design_equipment_dc_armor_and_shields, design_equipment_dc_encumbrance_meter, design_traits_dc_combat_reflexes, design_traits_dc_enhanced_parry_broadsword, design_equipment_dc_weapon_attack_modes [INFERRED 0.85]

## Communities (21 total, 5 thin omitted)

### Community 0 - "Active Defenses"
Cohesion: 0.08
Nodes (42): baseBlock(), baseDodge(), baseParry(), block(), BlockContext, commonModifiers(), DefenseContext, DefenseModifier (+34 more)

### Community 1 - "Foundry Integration & Rolls"
Cohesion: 0.07
Nodes (23): basicSpeedPointCost(), secondaryPointCost(), SYSTEM_ID, describeOutcome(), dieResults(), handleDamageAction(), handleRollAction(), maybePromptModifiers() (+15 more)

### Community 2 - "Damage & Injury Pipeline"
Cohesion: 0.08
Nodes (46): applyDamageFloor(), computeInjury(), DAMAGE_TABLE, damageFloor(), damageForColumn(), damageRow(), diceAboveTable(), effectiveStrengthForWeapon() (+38 more)

### Community 3 - "Character Sheet Design"
Cohesion: 0.08
Nodes (40): Biography and Notes prose blocks, Description tab, Image & Looks fields (height, weight, appearance), Languages table (spoken/written/points), Armor & Shields (DR / DB), Encumbrance band meter (None → X-Heavy), Equipment tab, Gear list (qty, weight, cost) (+32 more)

### Community 4 - "Build Tooling & Dependencies"
Cohesion: 0.05
Nodes (37): eslint, @eslint/js, description, devDependencies, eslint, @eslint/js, prettier, @types/node (+29 more)

### Community 5 - "Skill Levels & Defaults"
Cohesion: 0.09
Nodes (23): defaultLevel(), DIFFICULTY_DEFAULT_PENALTY, DIFFICULTY_OFFSET, effectiveSkillLevel(), namedDefaultLevel(), pointsForRelativeLevel(), relativeLevelForPoints(), RULE_OF_20_CAP (+15 more)

### Community 6 - "Foundry API Declarations"
Cohesion: 0.06
Nodes (14): abstract, ActorSheetV2, api, applications, apps, data, fields, foundry (+6 more)

### Community 7 - "Attributes & Encumbrance"
Cohesion: 0.14
Nodes (24): ATTRIBUTE_BASELINE, ATTRIBUTE_COST_PER_LEVEL, attributePointCost(), attributesPointCost(), basicLift(), basicMove(), basicSpeed(), SECONDARY_COST_PER_LEVEL (+16 more)

### Community 8 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (26): DOM, DOM.Iterable, ES2023, node, src/**/*.ts, tools/**/*.mjs, *.ts, vitest/globals (+18 more)

### Community 9 - "Schema Field Types"
Cohesion: 0.10
Nodes (10): ArrayField, BooleanField, DataField, DocumentUUIDField, FilePathField, NumberField, ObjectField, SchemaField (+2 more)

### Community 10 - "ApplicationV2 Sheet Classes"
Cohesion: 0.18
Nodes (3): ApplicationV2, DialogV2, DocumentSheetV2

### Community 12 - "Code Formatting Config"
Cohesion: 0.33
Nodes (5): arrowParens, printWidth, semi, singleQuote, trailingComma

### Community 14 - "Dev Deploy Script"
Cohesion: 0.67
Nodes (3): loadConfig(), main(), projectRoot

### Community 15 - "Field Option Types"
Cohesion: 0.67
Nodes (3): DataFieldOptions, NumberFieldOptions, StringFieldOptions

## Ambiguous Edges - Review These
- `src/rules — pure rules engine` → `GWorld character sheet design (5-tab shell)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **105 isolated node(s):** `printWidth`, `singleQuote`, `semi`, `trailingComma`, `arrowParens` (+100 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `src/rules — pure rules engine` and `GWorld character sheet design (5-tab shell)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CharacterData` connect `Active Defenses` to `Foundry Integration & Rolls`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `printWidth`, `singleQuote`, `semi` to the rest of the system?**
  _105 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Active Defenses` be split into smaller, more focused modules?**
  _Cohesion score 0.08395989974937343 - nodes in this community are weakly interconnected._
- **Should `Foundry Integration & Rolls` be split into smaller, more focused modules?**
  _Cohesion score 0.06531204644412192 - nodes in this community are weakly interconnected._
- **Should `Damage & Injury Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.07982583454281568 - nodes in this community are weakly interconnected._
- **Should `Character Sheet Design` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._