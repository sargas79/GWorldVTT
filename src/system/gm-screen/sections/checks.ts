/**
 * Tab 8, Checks: the Fright Check Table, a place kept for a module's awe and
 * confusion checks, falling and collisions, and the Reaction Table.
 */

import { RESTRAINT_DR, collisionVelocity } from "../../../rules/collisions.js";
import {
  CONTROLLED_FALL_YARDS,
  LONGEST_TABULATED_FALL,
  TERMINAL_VELOCITY,
  fallingDamage,
  fallingVelocity,
} from "../../../rules/falling.js";
import { FRIGHT_CHECK_CEILING, FRIGHT_CHECK_TABLE, frightCheckResult } from "../../../rules/fright.js";
import { REACTION_TABLE, reactionFor } from "../../../rules/reactions.js";
import { span } from "../format.js";
import type { GmRow, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** The Falling Velocity Table, run together where a stretch of falls lands at one speed. */
function velocityRows(): GmRow[] {
  const rows: GmRow[] = [];
  let from = 1;
  for (let yards = 1; yards <= LONGEST_TABULATED_FALL; yards += 1) {
    const velocity = fallingVelocity(yards);
    if (yards === LONGEST_TABULATED_FALL || fallingVelocity(yards + 1) !== velocity) {
      rows.push({ cells: [span(from, yards), String(velocity)] });
      from = yards + 1;
    }
  }
  return rows;
}

export const CHECK_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "frightChecks",
    tab: "checks",
    cite: "pp. B360-361",
    build: ({ t }) => ({
      parts: [{
        content: {
          kind: "table",
          columns: [t(`${K}.Column.Total`), t(`${K}.Column.Effect`)],
          rows: FRIGHT_CHECK_TABLE.map((row) => ({
            key: String(row.from),
            cells: [
              span(row.from, row.to),
              t(`GWORLD.Fright.Effect.${row.effect}`) + (row.gmDecides ? ` ${t(`${K}.GmDecides`)}` : ""),
            ],
          })),
        },
      }],
      notes: [t(`${K}.Section.frightChecks.Note`, { cap: FRIGHT_CHECK_CEILING })],
    }),
    roll: { formula: "3d6", ask: "margin", rowFor: (total) => String(frightCheckResult(total).from) },
  }),
  section({ id: "aweConfusion", tab: "checks", slot: true, summary: false }),
  section({
    id: "fallingCollisions",
    tab: "checks",
    cite: "pp. B430-432",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>) => ({
        term: t(partKey("fallingCollisions", term)),
        text: t(partKey("fallingCollisions", `${term}Text`), data),
      });
      const example = fallingDamage({ hitPoints: 10, yardsFallen: 17 });
      return {
        parts: [
          {
            id: "fallingVelocity",
            heading: t(partKey("fallingCollisions", "Velocity")),
            cite: "p. B431",
            content: { kind: "table", columns: [t(`${K}.Column.FallYards`), t(`${K}.Column.Velocity`)], rows: velocityRows() },
            notes: [t(partKey("fallingCollisions", "VelocityNote"), { yards: LONGEST_TABULATED_FALL })],
          },
          {
            id: "falling",
            heading: t(partKey("fallingCollisions", "Falling")),
            cite: "pp. B430-431",
            content: {
              kind: "rules",
              items: [
                m("Damage", { velocity: example.velocity, dice: `${example.damage.dice}d` }),
                m("Soft"),
                m("Acrobatics", { yards: CONTROLLED_FALL_YARDS }),
                m("Terminal", { low: TERMINAL_VELOCITY.spreadEagled, high: TERMINAL_VELOCITY.swanDive }),
              ],
            },
          },
          {
            id: "collisions",
            heading: t(partKey("fallingCollisions", "Collisions")),
            cite: "pp. B430-432",
            content: {
              kind: "rules",
              items: [
                m("Closing", {
                  headOn: collisionVelocity({ angle: "headOn", velocity: 10, otherVelocity: 5 }),
                  rearEnd: collisionVelocity({ angle: "rearEnd", velocity: 10, otherVelocity: 5 }),
                }),
                m("Hard"),
                m("Sharp"),
                m("Overrun"),
                m("Restraints", { seatbelt: RESTRAINT_DR.seatbelt, airbag: RESTRAINT_DR.airbag }),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "reactions",
    tab: "checks",
    cite: "p. B560",
    build: ({ t }) => ({
      parts: [{
        content: {
          kind: "table",
          columns: [t(`${K}.Column.Roll`), t(`${K}.Column.Reaction`), t(`${K}.Column.Description`)],
          rows: REACTION_TABLE.map((band) => ({
            key: band.reaction,
            cells: [
              band.max !== null && band.min === Number.NEGATIVE_INFINITY ? t(`${K}.OrLess`, { value: band.max }) : span(band.min, band.max),
              t(`GWORLD.Reaction.${band.reaction}`),
              t(`${K}.Reaction.${band.reaction}`),
            ],
          })),
        },
      }],
      notes: [t(`${K}.Section.reactions.Note`)],
    }),
    roll: { formula: "3d6", ask: "modifier", rowFor: (total) => reactionFor(total) },
  }),
];
