/**
 * Tab 2, Hit Locations and Wounds: every location with everything that
 * changes there, the ones modules add under the Basic Set's they belong to,
 * and what a wound does after it lands.
 */

import { BLEEDING_CRITICAL_HP, BLEEDING_HP, MINUTES_TO_STOP_BLEEDING, bleedingModifier } from "../../../rules/bleeding.js";
import {
  HIT_LOCATIONS,
  HIT_LOCATION_ORDER,
  canTargetFromArc,
  missByOneHitsTorso,
  randomHitLocation,
  woundingModifierAt,
  type HitLocation,
} from "../../../rules/hit-locations.js";
import { MAX_SHOCK_PENALTY, shockPenalty } from "../../../rules/injury.js";
import { STUN_DEFENSE_PENALTY, knockdownModifier } from "../../../rules/knockdown.js";
import { knockback } from "../../../rules/maneuvers.js";
import { MORTAL_WOUND_MINUTES, TRAUMA_MAINTENANCE_MINUTES, cripplingRelief } from "../../../rules/mortal-wounds.js";
import { traitEffects } from "../../../rules/trait-effects.js";
import type { DamageType } from "../../../rules/types.js";
import { registeredHitLocations, type AddonHitLocation } from "../../combat-extensions.js";
import { signed, span, times } from "../format.js";
import type { BuildContext, GmRow, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** The damage types the table gives a column, in the book's order; fatigue ignores where it lands. */
const TYPES: readonly DamageType[] = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn", "cor", "tox"];

/** The 3d rolls that land on each location, read off the automation's own table. */
function rollsByLocation(): Map<HitLocation, string> {
  const runs = new Map<HitLocation, Array<[number, number]>>();
  for (let roll = 3; roll <= 18; roll += 1) {
    const { location } = randomHitLocation(roll);
    const list = runs.get(location) ?? [];
    const last = list[list.length - 1];
    if (last && last[1] === roll - 1) last[1] = roll;
    else list.push([roll, roll]);
    runs.set(location, list);
  }
  return new Map([...runs].map(([location, list]) => [location, list.map(([a, b]) => span(a, b)).join(", ")]));
}

/** Where a part is crippled, as a share of HP: over HP/2 for a limb. */
function crippling(divisor: number | null): string {
  return divisor === null ? "—" : `> HP/${divisor}`;
}

const CRIPPLING_DIVISOR: Record<string, number | null> = { none: null, limb: 2, extremity: 3, eye: 10 };

/** What else there is to know about a location, in a word or two each. */
function locationNotes(location: HitLocation, t: BuildContext["t"]): string {
  const info = HIT_LOCATIONS[location];
  const notes: string[] = [];
  if (info.deliberateOnly) notes.push(t(`${K}.HitLocation.AimedOnly`));
  if (info.targetableBy.length > 0) notes.push(t(`${K}.HitLocation.ImpalingPiercing`));
  if (missByOneHitsTorso(location)) notes.push(t(`${K}.HitLocation.MissByOne`));
  if (!canTargetFromArc(location, "back")) notes.push(t(`${K}.HitLocation.NotFromBehind`));
  if (location === "vitals") notes.push(t(`${K}.HitLocation.TightBeam`, { value: times(woundingModifierAt("burn", "vitals", { tightBeam: true })) }));
  if (location === "skull" || location === "eye") notes.push(t(`${K}.HitLocation.NotToxic`));
  return notes.join("; ");
}

/** A registered location's row: its own figures, or its parent's where it has none. */
function addonRow(added: AddonHitLocation, { t, moduleTitle }: BuildContext): GmRow {
  const parent = HIT_LOCATIONS[added.parent];
  const wounding = TYPES.map((type) => {
    const own = added.wounding(type);
    return times(own === null ? woundingModifierAt(type, added.parent) : own);
  });
  const divisor = added.cripplingDivisor === undefined ? CRIPPLING_DIVISOR[parent.cripplingKind] ?? null : added.cripplingDivisor;
  const notes = [
    added.damageTypes.length ? t(`${K}.HitLocation.Types`, { types: added.damageTypes.join(", ") }) : "",
    added.arcs ? t(`${K}.HitLocation.Arcs`, { arcs: added.arcs.map((arc) => t(`${K}.Arc.${arc}`)).join(", ") }) : "",
  ].filter(Boolean).join("; ");
  return {
    depth: 1,
    source: moduleTitle(added.module),
    cells: [
      "—",
      added.label,
      signed(added.penalty),
      String(parent.extraDr + added.extraDr),
      ...wounding,
      signed(parent.knockdown + added.knockdown),
      crippling(divisor),
      notes,
    ],
  };
}

export const WOUNDS_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "hitLocations",
    tab: "wounds",
    wide: true,
    cite: "pp. B398-400, B552",
    build: (context) => {
      const { t } = context;
      const rolls = rollsByLocation();
      const added = registeredHitLocations();
      const rows: GmRow[] = [];
      for (const location of HIT_LOCATION_ORDER) {
        const info = HIT_LOCATIONS[location];
        rows.push({
          key: location,
          cells: [
            rolls.get(location) ?? "—",
            t(`GWORLD.HitLocation.${location}`),
            signed(info.toHit),
            String(info.extraDr),
            ...TYPES.map((type) => times(woundingModifierAt(type, location))),
            signed(knockdownModifier({ majorWound: true, hitLocation: location })),
            crippling(CRIPPLING_DIVISOR[info.cripplingKind] ?? null),
            locationNotes(location, t),
          ],
        });
        for (const own of added.filter((a) => a.parent === location)) rows.push(addonRow(own, context));
      }
      return {
        parts: [{
          content: {
            kind: "table",
            columns: [
              t(`${K}.Column.Roll`),
              t(`${K}.Column.Location`),
              t(`${K}.Column.Penalty`),
              t(`${K}.Column.ExtraDr`),
              ...TYPES.map((type) => t(`GWORLD.DamageType.${type}`)),
              t(`${K}.Column.Knockdown`),
              t(`${K}.Column.Crippling`),
              t(`${K}.Column.Notes`),
            ],
            rows,
            groups: [
              { label: "", span: 2 },
              { label: t(`${K}.Group.ToHit`), span: 2 },
              { label: t(`${K}.Group.Wounding`), span: TYPES.length },
              { label: t(`${K}.Group.Injury`), span: 2 },
              { label: "", span: 1 },
            ],
            pinned: 2,
            centered: Array.from({ length: TYPES.length + 4 }, (_, i) => i + 2),
          },
        }],
        notes: [t(`${K}.Section.hitLocations.Note`)],
      };
    },
    roll: {
      formula: "3d6",
      rowFor: (total) => randomHitLocation(total).location,
      sideFor: (row) => row === "hand" || row === "foot",
    },
  }),
  section({
    id: "wounds",
    tab: "wounds",
    cite: "pp. B377-423",
    build: ({ t }) => {
      const p = (part: string, data?: Record<string, string | number>) => t(partKey("wounds", part), data);
      // A 12-point crushing blow against ST 12 shows the arithmetic: ST-2 is 10, so one yard.
      const shove = knockback({ basicDamage: 20, type: "cr", penetratedDr: true, targetStrength: 12 });
      return {
        parts: [
          {
            id: "shock",
            heading: p("Shock"),
            cite: "p. B419",
            content: {
              kind: "rules",
              items: [
                { term: p("ShockPerHp"), text: p("ShockPerHpText", { value: signed(shockPenalty(1)), max: signed(MAX_SHOCK_PENALTY) }) },
                { term: p("ShockDefense"), text: p("ShockDefenseText") },
              ],
            },
          },
          {
            id: "knockback",
            heading: p("Knockback"),
            cite: "p. B378",
            content: {
              kind: "rules",
              items: [
                { term: p("KnockbackDistance"), text: p("KnockbackDistanceText", { damage: 20, st: 12, yards: shove.yards }) },
                { term: p("KnockbackCutting"), text: p("KnockbackCuttingText") },
                { term: p("KnockbackStanding"), text: p("KnockbackStandingText", { value: signed(shove.fallRollPenalty || -1) }) },
              ],
            },
          },
          {
            id: "majorWound",
            heading: p("MajorWound"),
            cite: "p. B420",
            content: { kind: "rules", items: [{ term: p("MajorWound"), text: p("MajorWoundText") }] },
          },
          {
            id: "knockdownStunning",
            heading: p("Knockdown"),
            cite: "p. B420",
            content: {
              kind: "table",
              columns: [t(`${K}.Column.MajorWoundTo`), t(`${K}.Column.HtModifier`)],
              rows: [
                { cells: [p("KnockdownElsewhere"), signed(knockdownModifier({ majorWound: true, hitLocation: "torso" }))] },
                { cells: [p("KnockdownFace"), signed(knockdownModifier({ majorWound: true, hitLocation: "face" }))] },
                { cells: [p("KnockdownSkull"), signed(knockdownModifier({ majorWound: true, hitLocation: "skull" }))] },
                { cells: [p("KnockdownHighPain"), signed(traitEffects([{ name: "High Pain Threshold" }]).knockdown)] },
                { cells: [p("KnockdownLowPain"), signed(traitEffects([{ name: "Low Pain Threshold" }]).knockdown)] },
              ],
            },
            notes: [p("KnockdownNote")],
          },
          {
            id: "effectsOfStun",
            heading: p("Stun"),
            cite: "p. B420",
            content: {
              kind: "rules",
              items: [
                { term: p("StunDefense"), text: p("StunDefenseText", { value: signed(STUN_DEFENSE_PENALTY) }) },
                { term: p("StunAction"), text: p("StunActionText") },
                { term: p("StunRecover"), text: p("StunRecoverText") },
              ],
            },
          },
          {
            id: "cripplingInjury",
            heading: p("Crippling"),
            cite: "pp. B420-422",
            content: {
              kind: "rules",
              items: [
                { term: p("CripplingThreshold"), text: p("CripplingThresholdText") },
                { term: p("CripplingExcess"), text: p("CripplingExcessText") },
                { term: p("CripplingDuration"), text: p("CripplingDurationText") },
                { term: p("CripplingLasting"), text: p("CripplingLastingText", { tl7: cripplingRelief(7), tl6: cripplingRelief(6), tl5: cripplingRelief(5) }) },
              ],
            },
          },
          {
            id: "mortalWounds",
            heading: p("Mortal"),
            cite: "p. B423",
            content: {
              kind: "rules",
              items: [
                { term: p("MortalWhen"), text: p("MortalWhenText") },
                { term: p("MortalRoll"), text: p("MortalRollText", { minutes: MORTAL_WOUND_MINUTES }) },
                { term: p("MortalTrauma"), text: p("MortalTraumaText", { minutes: TRAUMA_MAINTENANCE_MINUTES }) },
              ],
            },
          },
          {
            id: "bleeding",
            heading: p("Bleeding"),
            cite: "p. B420",
            content: {
              kind: "rules",
              items: [
                { term: p("BleedingWho"), text: p("BleedingWhoText") },
                { term: p("BleedingRoll"), text: p("BleedingRollText", { value: signed(bleedingModifier(5)) }) },
                { term: p("BleedingLoss"), text: p("BleedingLossText", { hp: BLEEDING_HP, critical: BLEEDING_CRITICAL_HP }) },
                { term: p("BleedingStops"), text: p("BleedingStopsText", { minutes: MINUTES_TO_STOP_BLEEDING }) },
              ],
            },
          },
        ],
      };
    },
  }),
];
