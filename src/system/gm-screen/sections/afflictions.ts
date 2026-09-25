/**
 * Tab 7, Afflictions: every condition the book names, with what it costs, and
 * a place kept for a module's posture-and-hit-location table.
 */

import {
  AGONY_FP_PER_MINUTE,
  COMA_CHECK_HOURS,
  PAIN_GRADES,
  RETCHING_FP,
  SEIZURE_FP_DICE,
  TORTURE_BONUS,
  afflictionEffect,
  afflictionsOf,
  painPenalty,
  type Affliction,
  type AfflictionSeverity,
} from "../../../rules/afflictions.js";
import { signed } from "../format.js";
import type { BuildContext, GmPart, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** An affliction's figures, in a few words: "DX -3, IQ -1; cannot use Stealth". */
function figures(affliction: Affliction, t: BuildContext["t"]): string {
  const effect = afflictionEffect(affliction);
  const out: string[] = [];
  const attributes: Array<[string, number]> = [["DX", effect.dx], ["IQ", effect.iq], ["ST", effect.st], ["HT", effect.ht]];
  for (const [name, value] of attributes) if (value) out.push(`${name} ${signed(value)}`);
  if (effect.selfControl) out.push(t(`${K}.Affliction.SelfControl`, { value: signed(effect.selfControl) }));
  if (effect.defense) out.push(t(`${K}.Affliction.Defense`, { value: signed(effect.defense) }));
  if (effect.helpless) out.push(t("GWORLD.Affliction.NoAction"));
  if (effect.fallsDown) out.push(t("GWORLD.Affliction.FallsDown"));
  for (const skill of effect.forbids) out.push(t("GWORLD.Affliction.Forbids", { skill }));
  return out.join("; ");
}

function severityPart(severity: AfflictionSeverity, t: BuildContext["t"]): GmPart {
  return {
    id: `afflictions.${severity}`,
    heading: t(`GWORLD.Affliction.Severity.${severity}`),
    content: {
      kind: "table",
      columns: [t(`${K}.Column.Condition`), t(`${K}.Column.Figures`), t(`${K}.Column.Effect`)],
      rows: afflictionsOf(severity).map((affliction) => ({
        key: affliction,
        cells: [t(`GWORLD.Affliction.Name.${affliction}`), figures(affliction, t), t(`GWORLD.Affliction.What.${affliction}`)],
      })),
    },
  };
}

export const AFFLICTION_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "afflictions",
    tab: "afflictions",
    cite: "pp. B428-429",
    build: ({ t }) => ({
      parts: [
        severityPart("irritating", t),
        severityPart("incapacitating", t),
        severityPart("mortal", t),
        {
          id: "pain",
          heading: t(partKey("afflictions", "Pain")),
          cite: "pp. B428-429",
          content: {
            kind: "table",
            columns: [t(`${K}.Column.Pain`), t(`${K}.Column.Normal`), t(`${K}.Column.HighPain`), t(`${K}.Column.LowPain`)],
            rows: PAIN_GRADES.map((grade) => ({
              cells: [
                t(`GWORLD.Affliction.Name.${grade}Pain`),
                signed(painPenalty(grade)),
                signed(painPenalty(grade, "high")),
                signed(painPenalty(grade, "low")),
              ],
            })),
          },
          notes: [t(partKey("afflictions", "PainNote"), {
            agony: AGONY_FP_PER_MINUTE,
            torture: signed(TORTURE_BONUS),
            retching: RETCHING_FP,
            seizure: SEIZURE_FP_DICE,
            coma: COMA_CHECK_HOURS,
          })],
        },
      ],
    }),
  }),
  section({ id: "postureHitLocations", tab: "afflictions", slot: true, summary: false }),
];
