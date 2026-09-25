/**
 * Tab 4, Ranged: what changes a ranged attack, the Size and Speed/Range
 * Table, the three active defenses, wounding, and getting better again.
 */

import { BRACED_BONUS, MAX_EXTRA_AIM_TURNS, aimBonus } from "../../../rules/aim.js";
import {
  OPPORTUNITY_LINE_PENALTY,
  bulkPenalty,
  opportunityFirePenalty,
} from "../../../rules/attack-options.js";
import {
  COMPLETELY_CONCEALED_PENALTY,
  HALF_EXPOSED_PENALTY,
  SHOOT_THROUGH_PENALTY,
} from "../../../rules/cover.js";
import { WOUNDING_MODIFIERS } from "../../../rules/damage.js";
import { BLOCKS_PER_TURN, baseBlock, baseDodge, baseParry } from "../../../rules/defenses.js";
import { allOutAttackBonus } from "../../../rules/maneuvers.js";
import { POSTURE_EFFECTS } from "../../../rules/posture.js";
import { sizeModifier, speedRangeModifier } from "../../../rules/ranged.js";
import {
  BANDAGING_HP,
  FIRST_AID_CRITICAL_FAILURE_HP,
  FIRST_AID_TABLE,
  FP_PER_REST_MINUTES,
  healingMultiplier,
  naturalRecovery,
  wakingFrom,
} from "../../../rules/recovery.js";
import { UNFAMILIAR_PENALTY } from "../../../rules/tech-level.js";
import type { DamageType } from "../../../rules/types.js";
import { attackWithoutSight } from "../../../rules/visibility.js";
import { dice, inches, signed, span, times } from "../format.js";
import type { GmItem, GmRow, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** The printed rows below a yard, in inches. */
const SMALL_INCHES = [1 / 5, 1 / 3, 1 / 2, 2 / 3, 1, 1.5, 2, 3, 5, 8, 12, 18, 24];

/** The printed rows from a yard up: 1, 1.5, 2, 3, 5 and 7 in every factor of ten. */
function yardRows(upTo: number): number[] {
  const out: number[] = [];
  for (let scale = 1; scale <= upTo; scale *= 10) {
    for (const step of [1, 1.5, 2, 3, 5, 7]) {
      const yards = step * scale;
      if (yards <= upTo) out.push(yards);
    }
  }
  return out;
}

/** A length as the table writes it: 1,500 yd. */
function yardsText(yards: number): string {
  return `${yards.toLocaleString("en-US")} yd`;
}

/** The damage types in the order the Wounding Modifiers list them, weakest first. */
const WOUNDING_ORDER: readonly DamageType[] = [
  "pi-",
  "burn",
  "cor",
  "cr",
  "fat",
  "pi",
  "tox",
  "cut",
  "pi+",
  "imp",
  "pi++",
];

export const RANGED_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "rangedAttackModifiers",
    tab: "ranged",
    cite: "p. B548",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>): GmItem => ({
        term: t(partKey("rangedAttackModifiers", term)),
        text: t(partKey("rangedAttackModifiers", `${term}Text`), data),
      });
      const aimedThree = aimBonus({ turnsAimed: 3, accuracy: 0 });
      return {
        parts: [
          {
            content: {
              kind: "rules",
              items: [
                m("Aim", {
                  extra: signed(aimedThree.extraTurns),
                  turns: MAX_EXTRA_AIM_TURNS + 1,
                  braced: signed(BRACED_BONUS),
                }),
                m("Determined", { value: signed(allOutAttackBonus("determined", true)) }),
                m("MoveAndAttack", { value: signed(bulkPenalty(0, "moveAndAttack")) }),
                m("RangeAndSize"),
                m("RapidFire"),
                m("TargetPosture", { value: signed(POSTURE_EFFECTS.lying.target) }),
                m("HalfExposed", { value: signed(HALF_EXPOSED_PENALTY) }),
                m("ThroughCover", { value: signed(SHOOT_THROUGH_PENALTY) }),
                m("CannotSee", {
                  blind: signed(attackWithoutSight({ sight: "blind" }).modifier),
                  unseen: signed(attackWithoutSight({ sight: "foeUnseen" }).modifier),
                  located: signed(attackWithoutSight({ sight: "positionKnown" }).modifier),
                  concealed: signed(COMPLETELY_CONCEALED_PENALTY),
                }),
                m("Opportunity", {
                  two: signed(opportunityFirePenalty(2)),
                  four: signed(opportunityFirePenalty(4)),
                  six: signed(opportunityFirePenalty(6)),
                  ten: signed(opportunityFirePenalty(10)),
                  more: signed(opportunityFirePenalty(11)),
                  line: signed(OPPORTUNITY_LINE_PENALTY),
                }),
                m("CloseCombat"),
                m("Unfamiliar", { value: signed(UNFAMILIAR_PENALTY) }),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "sizeSpeedRange",
    tab: "ranged",
    cite: "p. B550",
    build: ({ t }) => {
      const rows: GmRow[] = [
        ...SMALL_INCHES.map((length) => ({
          cells: [signed(sizeModifier(length / 36)), inches(length), "0"],
        })),
        ...yardRows(100_000).map((yards) => ({
          cells: [signed(sizeModifier(yards)), yardsText(yards), signed(speedRangeModifier(yards))],
        })),
      ];
      return {
        parts: [
          {
            content: {
              kind: "table",
              columns: [
                t(`${K}.Column.SizeModifier`),
                t(`${K}.Column.Length`),
                t(`${K}.Column.SpeedRange`),
              ],
              rows,
            },
          },
        ],
        notes: [t(`${K}.Section.sizeSpeedRange.Note`)],
      };
    },
  }),
  section({
    id: "dodgeBlockParry",
    tab: "ranged",
    cite: "pp. B374-377",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>): GmItem => ({
        term: t(partKey("dodgeBlockParry", term)),
        text: t(partKey("dodgeBlockParry", `${term}Text`), data),
      });
      return {
        parts: [
          {
            content: {
              kind: "rules",
              items: [
                m("Dodge", { example: baseDodge(5.75) }),
                m("Parry", { example: baseParry(13) }),
                m("Block", { example: baseBlock(13), perTurn: BLOCKS_PER_TURN }),
                m("Halved"),
                m("Unbalanced"),
                m("Bullets"),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "woundingModifiers",
    tab: "ranged",
    cite: "p. B379",
    build: ({ t }) => ({
      parts: [
        {
          content: {
            kind: "table",
            columns: [
              t(`${K}.Column.DamageType`),
              t(`${K}.Column.Abbreviation`),
              t(`${K}.Column.Modifier`),
            ],
            rows: WOUNDING_ORDER.map((type) => ({
              cells: [
                t(`${K}.DamageType.${type}`),
                t(`GWORLD.DamageType.${type}`),
                times(WOUNDING_MODIFIERS[type]),
              ],
            })),
          },
        },
      ],
      notes: [t(`${K}.Section.woundingModifiers.Note`)],
    }),
  }),
  section({
    id: "firstAid",
    tab: "ranged",
    cite: "p. B424",
    build: ({ t }) => ({
      parts: [
        {
          content: {
            kind: "table",
            columns: [t(`${K}.Column.Tl`), t(`${K}.Column.Time`), t(`${K}.Column.HpRestored`)],
            rows: FIRST_AID_TABLE.map((row, index) => {
              const next = FIRST_AID_TABLE[index + 1];
              return {
                cells: [
                  span(row.fromTl, next ? next.fromTl - 1 : null),
                  t(`${K}.Minutes`, { value: row.minutes }),
                  dice(row.restored),
                ],
              };
            }),
          },
        },
      ],
      notes: [
        t(`${K}.Section.firstAid.Note`, {
          bandage: BANDAGING_HP,
          fumble: FIRST_AID_CRITICAL_FAILURE_HP,
        }),
      ],
    }),
  }),
  section({
    id: "naturalRecovery",
    tab: "ranged",
    cite: "pp. B424, B427",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>): GmItem => ({
        term: t(partKey("naturalRecovery", term)),
        text: t(partKey("naturalRecovery", `${term}Text`), data),
      });
      return {
        parts: [
          {
            content: {
              kind: "rules",
              items: [
                m("Daily", { hp: naturalRecovery(10) }),
                m("Large", { twenty: healingMultiplier(20), thirty: healingMultiplier(30) }),
                m("Fatigue", { minutes: FP_PER_REST_MINUTES }),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "unconsciousness",
    tab: "ranged",
    cite: "p. B423",
    build: ({ t }) => {
      const above = wakingFrom(1, 10);
      const zero = wakingFrom(0, 10);
      const deep = wakingFrom(-10, 10);
      return {
        parts: [
          {
            content: {
              kind: "table",
              columns: [t(`${K}.Column.HpLeft`), t(`${K}.Column.Waking`)],
              rows: [
                {
                  key: above.kind,
                  cells: [
                    t(`${K}.Waking.Positive`),
                    t(`${K}.Waking.Automatic`, { minutes: above.minutes }),
                  ],
                },
                {
                  key: zero.kind,
                  cells: [
                    t(`${K}.Waking.Zero`),
                    t(`${K}.Waking.Hourly`, { minutes: zero.minutes }),
                  ],
                },
                {
                  key: deep.kind,
                  cells: [
                    t(`${K}.Waking.MinusHp`),
                    t(`${K}.Waking.Mortal`, { hours: deep.minutes / 60 }),
                  ],
                },
              ],
            },
          },
        ],
      };
    },
  }),
];
