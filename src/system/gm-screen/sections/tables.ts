/**
 * Tab 1, Tables: the four critical tables, what attribute and skill levels
 * mean, throwing, and cover.
 */

import { ATTRIBUTE_LEVELS } from "../../../rules/attributes.js";
import { CRITICAL_HEAD_BLOW, CRITICAL_HIT, CRITICAL_MISS, CRITICAL_MISS_UNARMED, criticalEntry, type CriticalEntry, type CriticalTable } from "../../../rules/criticals.js";
import { COMPLETELY_CONCEALED_PENALTY, SHOOT_THROUGH_PENALTY, coverShot } from "../../../rules/cover.js";
import { MAX_THROWABLE_MULTIPLE, THROWING_DISTANCE_TABLE, thrownDamagePerDie } from "../../../rules/physical.js";
import { WALLS } from "../../../rules/structures.js";
import { successChances } from "../../../rules/success.js";
import { percent, rollsOf, signed, span } from "../format.js";
import type { BuildContext, GmSectionContent, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** A critical table as the screen shows it: the rolls, and what they do. */
function criticalContent(rows: readonly CriticalEntry[], { t }: BuildContext, note: string): GmSectionContent {
  return {
    parts: [{
      content: {
        kind: "table",
        columns: [t(`${K}.Column.Roll`), t(`${K}.Column.Effect`)],
        rows: rows.map((row) => ({
          key: String(row.rolls[0]),
          cells: [
            rollsOf(row.rolls),
            t(`GWORLD.Critical.${row.effect}`) + (row.gmDecides ? ` ${t(`${K}.GmDecides`)}` : ""),
          ],
        })),
      },
    }],
    notes: [t(note)],
  };
}

/** Rolling on a critical table: the row is the automation's own. */
function criticalRoll(table: CriticalTable) {
  return { formula: "3d6", rowFor: (total: number) => String(criticalEntry(table, total).rolls[0]) };
}

/** The weight a thrown object's damage row runs up to, as a multiple of Basic Lift. */
const THROWN_BANDS: ReadonlyArray<[number, string]> = [
  [1 / 8, "BL/8"], [1 / 4, "BL/4"], [1 / 2, "BL/2"], [1, "BL"], [2, "2×BL"], [4, "4×BL"], [MAX_THROWABLE_MULTIPLE, `${MAX_THROWABLE_MULTIPLE}×BL`],
];

/** A thrown object's damage, as the table says it: thrust, and what it gains or loses per die. */
function thrownDamageText(perDie: number, t: BuildContext["t"]): string {
  if (perDie === 0) return t(`${K}.Thrown.Thrust`);
  if (perDie === -0.5) return t(`${K}.Thrown.PerTwoDice`, { value: "-1" });
  return t(`${K}.Thrown.PerDie`, { value: signed(perDie) });
}

export const TABLES_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "criticalHit",
    tab: "tables",
    cite: "p. B556",
    build: (context) => criticalContent(CRITICAL_HIT, context, `${K}.Section.criticalHit.Note`),
    roll: criticalRoll("hit"),
  }),
  section({
    id: "criticalHeadBlow",
    tab: "tables",
    cite: "p. B556",
    build: (context) => criticalContent(CRITICAL_HEAD_BLOW, context, `${K}.Section.criticalHeadBlow.Note`),
    roll: criticalRoll("headBlow"),
  }),
  section({
    id: "criticalMiss",
    tab: "tables",
    cite: "p. B556",
    build: (context) => criticalContent(CRITICAL_MISS, context, `${K}.Section.criticalMiss.Note`),
    roll: criticalRoll("miss"),
  }),
  section({
    id: "unarmedCriticalMiss",
    tab: "tables",
    cite: "p. B557",
    build: (context) => criticalContent(CRITICAL_MISS_UNARMED, context, `${K}.Section.unarmedCriticalMiss.Note`),
    roll: criticalRoll("missUnarmed"),
  }),
  section({
    id: "attributeSkillLevels",
    tab: "tables",
    cite: "pp. B14, B171",
    build: ({ t }) => {
      let from = Number.NEGATIVE_INFINITY;
      const levels = ATTRIBUTE_LEVELS.map((row) => {
        const text = from === Number.NEGATIVE_INFINITY ? t(`${K}.OrLess`, { value: row.upTo ?? 0 }) : span(from, row.upTo);
        from = (row.upTo ?? 0) + 1;
        return { cells: [text, t(`${K}.AttributeLevel.${row.level}`)] };
      });
      const chances = [];
      for (let skill = 3; skill <= 18; skill += 1) {
        const odds = successChances(skill);
        chances.push({ cells: [String(skill), percent(odds.success), percent(odds.criticalSuccess), percent(odds.criticalFailure)] });
      }
      return {
        parts: [
          {
            id: "attributeLevels",
            heading: t(partKey("attributeSkillLevels", "Attributes")),
            cite: "p. B14",
            content: { kind: "table", columns: [t(`${K}.Column.Score`), t(`${K}.Column.Level`)], rows: levels },
          },
          {
            id: "successChances",
            heading: t(partKey("attributeSkillLevels", "Chances")),
            cite: "p. B171",
            content: {
              kind: "table",
              columns: [t(`${K}.Column.EffectiveSkill`), t(`${K}.Column.Success`), t(`${K}.Column.CriticalSuccess`), t(`${K}.Column.CriticalFailure`)],
              rows: chances,
            },
          },
        ],
      };
    },
  }),
  section({
    id: "thrownDamage",
    tab: "tables",
    cite: "p. B355",
    build: ({ t }) => ({
      parts: [{
        content: {
          kind: "table",
          columns: [t(`${K}.Column.Weight`), t(`${K}.Column.Damage`)],
          rows: THROWN_BANDS.map(([ratio, label]) => ({
            cells: [t(`${K}.UpTo`, { value: label }), thrownDamageText(thrownDamagePerDie(ratio, 1) ?? 0, t)],
          })),
        },
      }],
      notes: [t(`${K}.Section.thrownDamage.Note`)],
    }),
  }),
  section({
    id: "throwingDistance",
    tab: "tables",
    cite: "p. B355",
    build: ({ t }) => ({
      parts: [{
        content: {
          kind: "table",
          columns: [t(`${K}.Column.WeightRatio`), t(`${K}.Column.DistanceModifier`)],
          rows: THROWING_DISTANCE_TABLE.map(([ratio, modifier]) => ({ cells: [String(ratio), `×${modifier}`] })),
        },
      }],
      notes: [t(`${K}.Section.throwingDistance.Note`, { max: MAX_THROWABLE_MULTIPLE })],
    }),
  }),
  section({
    id: "coverDr",
    tab: "tables",
    cite: "pp. B407, B558",
    build: ({ t }) => {
      const exposed = coverShot({ approach: "exposedLocation", halfExposed: true });
      const random = coverShot({ approach: "randomLocation" });
      return {
        parts: [
          {
            id: "coverShots",
            heading: t(partKey("coverDr", "Shots")),
            cite: "p. B407",
            content: {
              kind: "rules",
              items: [
                { term: t(partKey("coverDr", "Exposed")), text: t(partKey("coverDr", "ExposedText"), { value: signed(exposed.modifier) }) },
                { term: t(partKey("coverDr", "Random")), text: t(partKey("coverDr", "RandomText"), { from: random.strikesCoverOn ?? 4 }) },
                { term: t(partKey("coverDr", "Through")), text: t(partKey("coverDr", "ThroughText"), { value: signed(SHOOT_THROUGH_PENALTY), concealed: signed(COMPLETELY_CONCEALED_PENALTY) }) },
              ],
            },
          },
          {
            id: "coverWalls",
            heading: t(partKey("coverDr", "Walls")),
            cite: "p. B558",
            content: {
              kind: "table",
              columns: [t(`${K}.Column.Material`), t(`${K}.Column.Dr`), t(`${K}.Column.Hp`)],
              rows: WALLS.map((wall) => ({ cells: [wall.name, `${wall.dr}${wall.wearsAway ? "*" : ""}`, String(wall.hp)] })),
            },
            notes: [t(partKey("coverDr", "WallsNote"))],
          },
        ],
      };
    },
  }),
];
