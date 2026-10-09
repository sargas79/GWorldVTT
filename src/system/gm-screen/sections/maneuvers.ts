/**
 * Tab 5, Maneuvers: the Maneuver Table with every option under the maneuver
 * it belongs to, the extra effort a fighter can spend FP on, and posture.
 */

import { RAPID_STRIKE_PENALTY } from "../../../rules/attack-options.js";
import {
  EXTRA_EFFORT_FP,
  EXTRA_EFFORT_STEP,
  FEVERISH_DEFENSE_BONUS,
  extraEffortModifier,
  flurryOfBlowsPenalty,
  mightyBlowsBonus,
} from "../../../rules/extra-effort.js";
import {
  COMBAT_EXTRAS,
  COMBAT_EXTRA_FP,
  GIANT_STEP_STEPS,
  GREAT_LUNGE_REACH,
  HEROIC_CHARGE_FALL_PENALTY,
  type CombatExtra,
} from "../../../rules/extra-effort-extras.js";
import {
  MANEUVERS,
  MANEUVER_ORDER,
  MAX_EVALUATE_BONUS,
  MOVE_AND_ATTACK_PENALTY,
  WILD_SWING_SKILL_CAP,
  allOutAttackBonus,
  strongAttackDamageBonus,
  type AllOutAttackOption,
  type DefenseAllowance,
  type MovementAllowance,
} from "../../../rules/maneuvers.js";
import { POSTURE_EFFECTS, postureMove } from "../../../rules/posture.js";
import type { Posture } from "../../../rules/types.js";
import { registeredExtraEfforts, registeredManeuvers } from "../../combat-extensions.js";
import { SYSTEM_ID } from "../../constants.js";
import { signed } from "../format.js";
import type { BuildContext, GmRow, GmSectionDef } from "../types.js";
import { K, section } from "./shared.js";

function movement(allowance: MovementAllowance, t: BuildContext["t"]): string {
  return t(`${K}.Move.${allowance}`);
}

function defense(allowance: DefenseAllowance, t: BuildContext["t"]): string {
  if (allowance === "none") return t("GWORLD.Maneuver.NoDefense");
  if (allowance === "dodgeAndBlockOnly") return t("GWORLD.Maneuver.NoParry");
  return t("GWORLD.Maneuver.AnyDefense");
}

/** The All-Out Attack options, each with what it is worth. */
function allOutAttackRows(t: BuildContext["t"]): GmRow[] {
  const options: AllOutAttackOption[] = ["determined", "double", "feint", "strong", "suppression"];
  return options.map((option) => ({
    depth: 1,
    cells: [
      t(`GWORLD.Maneuver.AllOutAttackOption.${option}`),
      "",
      "",
      t(`${K}.Maneuver.Aoa.${option}`, {
        melee: signed(allOutAttackBonus(option)),
        ranged: signed(allOutAttackBonus(option, true)),
        damage: signed(strongAttackDamageBonus(1)),
      }),
    ],
  }));
}

/** The combat options of one kind, by name, for the note on the cap. */
function extrasOfKind(kind: "offensive" | "defensive", t: BuildContext["t"]): string {
  return (Object.keys(COMBAT_EXTRAS) as CombatExtra[])
    .filter((extra) => COMBAT_EXTRAS[extra] === kind)
    .map((extra) => t(`GWORLD.ExtraEffort.Extra.${extra}`))
    .join(", ");
}

const POSTURES: readonly Posture[] = [
  "standing",
  "crouching",
  "kneeling",
  "crawling",
  "sitting",
  "lying",
];

export const MANEUVER_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "maneuvers",
    tab: "maneuvers",
    wide: true,
    cite: "pp. B363-366",
    build: ({ t, moduleTitle }) => {
      const rows: GmRow[] = [];
      for (const key of MANEUVER_ORDER) {
        const info = MANEUVERS[key];
        rows.push({
          key,
          cells: [
            t(`GWORLD.Maneuver.${key}`),
            movement(info.movement, t),
            defense(info.defense, t),
            t(`${K}.Maneuver.${key}`, {
              evaluate: signed(1),
              max: signed(MAX_EVALUATE_BONUS),
              penalty: signed(MOVE_AND_ATTACK_PENALTY),
              cap: WILD_SWING_SKILL_CAP,
            }),
          ],
        });
        if (key === "allOutAttack") rows.push(...allOutAttackRows(t));
        if (key === "allOutDefense") {
          rows.push(
            {
              depth: 1,
              cells: [t("GWORLD.Maneuver.Increased"), "", "", t(`${K}.Maneuver.Aod.increased`)],
            },
            {
              depth: 1,
              cells: [t("GWORLD.Maneuver.Double"), "", "", t(`${K}.Maneuver.Aod.double`)],
            },
          );
        }
      }
      for (const added of registeredManeuvers()) {
        rows.push({
          source: moduleTitle(added.module),
          cells: [
            added.label,
            movement(added.movement, t),
            defense(added.defense, t),
            added.options.map((o) => o.label).join(", "),
          ],
        });
      }
      return {
        parts: [
          {
            content: {
              kind: "table",
              columns: [
                t(`${K}.Column.Maneuver`),
                t(`${K}.Column.Move`),
                t(`${K}.Column.ActiveDefense`),
                t(`${K}.Column.Description`),
              ],
              rows,
            },
          },
        ],
      };
    },
  }),
  section({
    id: "extraEffort",
    tab: "maneuvers",
    cite: "pp. B356-357; Basic Set Revised p. 571",
    build: ({ t, moduleTitle }) => {
      const fp = (value: number) => t(`${K}.Fp.Cost`, { value });
      const rows: GmRow[] = [
        {
          cells: [
            t("GWORLD.ExtraEffort.Feverish"),
            fp(EXTRA_EFFORT_FP),
            t(`${K}.Effort.Feverish`, { value: signed(FEVERISH_DEFENSE_BONUS) }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.Flurry"),
            fp(EXTRA_EFFORT_FP),
            t(`${K}.Effort.Flurry`, {
              from: signed(RAPID_STRIKE_PENALTY),
              to: signed(flurryOfBlowsPenalty()),
            }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.Extra.giantStep"),
            fp(COMBAT_EXTRA_FP),
            t(`${K}.Effort.GiantStep`, { steps: GIANT_STEP_STEPS }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.Extra.greatLunge"),
            fp(COMBAT_EXTRA_FP),
            t(`${K}.Effort.GreatLunge`, { reach: GREAT_LUNGE_REACH }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.Extra.heroicCharge"),
            fp(COMBAT_EXTRA_FP),
            t(`${K}.Effort.HeroicCharge`, {
              penalty: signed(MOVE_AND_ATTACK_PENALTY),
              fall: signed(HEROIC_CHARGE_FALL_PENALTY),
            }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.MightyBlows"),
            fp(EXTRA_EFFORT_FP),
            t(`${K}.Effort.MightyBlows`, { value: signed(mightyBlowsBonus(1)) }),
          ],
        },
        {
          cells: [
            t("GWORLD.ExtraEffort.Extra.rapidRecovery"),
            fp(COMBAT_EXTRA_FP),
            t(`${K}.Effort.RapidRecovery`),
          ],
        },
        // The system's own options are the rows above; only an add-on's follow, with its badge.
        ...registeredExtraEfforts()
          .filter((effort) => effort.module !== SYSTEM_ID)
          .map((effort) => ({
            source: moduleTitle(effort.module),
            cells: [effort.label, fp(effort.fp), t(`${K}.Effort.${effort.kind}`)],
          })),
      ];
      return {
        parts: [
          {
            content: {
              kind: "table",
              columns: [t(`${K}.Column.Option`), t(`${K}.Column.Cost`), t(`${K}.Column.Effect`)],
              rows,
            },
          },
        ],
        notes: [
          t(`${K}.Section.extraEffort.Note`, {
            step: EXTRA_EFFORT_STEP,
            penalty: signed(extraEffortModifier(EXTRA_EFFORT_STEP)),
            fp: EXTRA_EFFORT_FP,
          }),
          t(`${K}.Section.extraEffort.Cap`, {
            offensive: extrasOfKind("offensive", t),
            defensive: extrasOfKind("defensive", t),
          }),
        ],
      };
    },
  }),
  section({
    id: "posture",
    tab: "maneuvers",
    cite: "p. B551",
    build: ({ t }) => ({
      parts: [
        {
          content: {
            kind: "table",
            columns: [
              t(`${K}.Column.Posture`),
              t(`${K}.Column.Attack`),
              t(`${K}.Column.Defense`),
              t(`${K}.Column.Target`),
              t(`${K}.Column.Movement`),
            ],
            rows: POSTURES.map((posture) => {
              const effects = POSTURE_EFFECTS[posture];
              return {
                key: posture,
                cells: [
                  t(`GWORLD.Posture.${posture}`),
                  signed(effects.attack),
                  signed(effects.defense),
                  signed(effects.target),
                  t(`${K}.PostureMove.${posture}`, { example: postureMove(6, posture) }),
                ],
              };
            }),
          },
        },
      ],
      notes: [t(`${K}.Section.posture.Note`)],
    }),
  }),
];
