/**
 * Tab 6, Combat: skill modifiers, the Damage Table, the combat rules a fight
 * reaches for mid-turn -- blunt trauma, rapid fire, hurting yourself, evading,
 * slams and the whole of grappling -- and who can see what around a hex.
 */

import { evadeModifier, slamDamage, slamToHit } from "../../../rules/attack-options.js";
import { MAX_TABULATED_ST, tabulatedDamage } from "../../../rules/damage.js";
import { bluntTrauma } from "../../../rules/falling.js";
import {
  GRAPPLED_DX_PENALTY,
  GRAPPLING_SKILLS,
  breakFree,
  chokeModifier,
  extraArmBonus,
  pinModifier,
  takedownModifier,
} from "../../../rules/grappling.js";
import { HURTING_YOURSELF_DR, hurtingYourself } from "../../../rules/hurting-yourself.js";
import { rapidFireBonus, rapidFireHits } from "../../../rules/ranged.js";
import { grappleSizeBonus } from "../../../rules/size.js";
import { arcDefense, attackArc, hexDirection, type Arc } from "../../../rules/tactical.js";
import { EXTRA_TIME, TASK_DIFFICULTY } from "../../../rules/task-difficulty.js";
import { UNFAMILIAR_PENALTY } from "../../../rules/tech-level.js";
import { equipmentQualityModifier } from "../../../rules/wealth.js";
import { signed, span } from "../format.js";
import type { BuildContext, GmItem, GmRow, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** A term and its text under a section's own keys. */
function itemsOf(sectionId: string, t: BuildContext["t"]) {
  return (term: string, data?: Record<string, string | number>): GmItem => ({
    term: t(partKey(sectionId, term)),
    text: t(partKey(sectionId, `${term}Text`), data),
  });
}

/** The Rapid Fire table's bands, as shots fired: 2-4 is +0, then the steps the bonus climbs by. */
function rapidFireRows(): GmRow[] {
  const rows: GmRow[] = [];
  let from = 2;
  for (let shots = 2; shots <= 200; shots += 1) {
    const next = rapidFireBonus(shots + 1);
    if (next !== rapidFireBonus(shots) || shots === 200) {
      rows.push({
        cells: [span(from, shots === 200 ? null : shots), signed(rapidFireBonus(shots))],
      });
      from = shots + 1;
    }
  }
  return rows;
}

/** The Damage Table's rows: every ST to 40, then every fifth point. */
function damageRows(): GmRow[] {
  const rows: GmRow[] = [];
  for (let st = 1; st <= MAX_TABULATED_ST; st += 1) {
    const row = tabulatedDamage(st);
    if (row) rows.push({ key: String(st), cells: [String(st), row.thrust, row.swing] });
  }
  return rows;
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A figure's hex and the six around it, each shaded for the arc an attack
 * from there falls in: drawn from `attackArc`, so the picture is the rule.
 * Flat-topped hexes, the figure facing up.
 */
export function visionHexSvg(t: BuildContext["t"]): string {
  const radius = 34;
  const step = Math.sqrt(3) * radius;
  const cx = 130;
  const cy = 130;
  const hex = (x: number, y: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i;
      return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
    }).join(" ");
  const label: Record<Arc, string> = {
    front: t(`${K}.Arc.front`),
    side: t(`${K}.Arc.side`),
    back: t(`${K}.Arc.back`),
  };
  const cells: string[] = [];
  for (let direction = 0; direction < 6; direction += 1) {
    const { arc, side } = attackArc(0, hexDirection(direction));
    const angle = -Math.PI / 2 + (Math.PI / 3) * direction;
    const x = cx + step * Math.cos(angle);
    const y = cy + step * Math.sin(angle);
    const name = side ? t(`${K}.Arc.${side}`) : label[arc];
    cells.push(
      `<polygon class="gs-arc gs-arc-${arc}" points="${hex(x, y)}"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${escape(name)}</text>`,
    );
  }
  const figure = `<polygon class="gs-arc gs-arc-self" points="${hex(cx, cy)}"/><path class="gs-facing" d="M ${cx} ${cy - 18} L ${cx + 10} ${cy + 8} L ${cx} ${cy + 2} L ${cx - 10} ${cy + 8} Z"/>`;
  return `<svg class="gs-vision" viewBox="0 0 260 260" role="img" aria-label="${escape(t(`${K}.Section.visionHexDiagram.Title`))}">${cells.join("")}${figure}</svg>`;
}

export const COMBAT_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "skillModifiers",
    tab: "combat",
    cite: "pp. B345-346",
    build: ({ t }) => ({
      parts: [
        {
          id: "taskDifficulty",
          heading: t(partKey("skillModifiers", "Difficulty")),
          cite: "p. B345",
          content: {
            kind: "table",
            columns: [t(`${K}.Column.Task`), t(`${K}.Column.Modifier`)],
            rows: TASK_DIFFICULTY.map((row) => ({
              cells: [t(`${K}.Task.${row.difficulty}`), signed(row.modifier)],
            })),
          },
        },
        {
          id: "equipmentModifiers",
          heading: t(partKey("skillModifiers", "Equipment")),
          cite: "p. B345",
          content: {
            kind: "table",
            columns: [
              t(`${K}.Column.Equipment`),
              t(`${K}.Column.Technological`),
              t(`${K}.Column.OtherSkills`),
            ],
            rows: (["none", "improvised", "basic", "good", "fine"] as const)
              .map((quality) => ({
                cells: [
                  t(`${K}.Quality.${quality}`),
                  signed(equipmentQualityModifier(quality, { technological: true })),
                  signed(equipmentQualityModifier(quality, { technological: false })),
                ],
              }))
              .concat([
                {
                  cells: [
                    t(`${K}.Quality.best`),
                    t(`${K}.Quality.bestText`, {
                      min: signed(equipmentQualityModifier("best", { tl: 0 })),
                    }),
                    t(`${K}.Quality.bestText`, {
                      min: signed(equipmentQualityModifier("best", { tl: 0 })),
                    }),
                  ],
                },
              ]),
          },
          notes: [
            t(partKey("skillModifiers", "Unfamiliar"), { value: signed(UNFAMILIAR_PENALTY) }),
          ],
        },
        {
          id: "timeSpent",
          heading: t(partKey("skillModifiers", "Time")),
          cite: "p. B346",
          content: {
            kind: "table",
            columns: [t(`${K}.Column.TimeTaken`), t(`${K}.Column.Modifier`)],
            rows: EXTRA_TIME.map((row) => ({
              cells: [t(`${K}.TimesUsual`, { value: row.multiple }), signed(row.bonus)],
            })),
          },
        },
      ],
    }),
  }),
  section({
    id: "damageTable",
    tab: "combat",
    cite: "p. B16",
    build: ({ t }) => ({
      parts: [
        {
          content: {
            kind: "table",
            columns: [t(`${K}.Column.St`), t(`${K}.Column.Thrust`), t(`${K}.Column.Swing`)],
            rows: damageRows(),
          },
        },
      ],
      notes: [t(`${K}.Section.damageTable.Note`, { st: MAX_TABULATED_ST })],
    }),
  }),
  section({
    id: "combatRules",
    tab: "combat",
    cite: "pp. B373, B379",
    build: ({ t }) => {
      const m = itemsOf("combatRules", t);
      return {
        parts: [
          {
            id: "bluntTrauma",
            heading: t(partKey("combatRules", "BluntTrauma")),
            cite: "p. B379",
            content: {
              kind: "rules",
              items: [
                m("Crushing", { value: bluntTrauma({ stopped: 10, penetrated: false }) }),
                m("Other", {
                  value: bluntTrauma({ stopped: 10, penetrated: false, crushing: false }),
                }),
                m("Penetrated"),
              ],
            },
          },
          {
            id: "rapidFire",
            heading: t(partKey("combatRules", "RapidFire")),
            cite: "p. B373",
            content: {
              kind: "table",
              columns: [t(`${K}.Column.Shots`), t(`${K}.Column.Bonus`)],
              rows: rapidFireRows(),
            },
            notes: [
              t(partKey("combatRules", "RapidFireHits"), {
                example: rapidFireHits({ margin: 4, shotsFired: 10, recoil: 2 }),
              }),
            ],
          },
          {
            id: "hurtingYourself",
            heading: t(partKey("combatRules", "Hurting")),
            cite: "p. B379",
            content: {
              kind: "rules",
              items: [
                m("HurtingWhen", { dr: HURTING_YOURSELF_DR }),
                m("HurtingHow", {
                  example: hurtingYourself({ basicDamage: 12, targetDr: 5, ownDr: 0 }).damage,
                }),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "closeCombat",
    tab: "combat",
    cite: "pp. B368, B371-372",
    build: ({ t }) => {
      const m = itemsOf("closeCombat", t);
      const small = slamDamage(25, 1);
      return {
        parts: [
          {
            id: "evade",
            heading: t(partKey("closeCombat", "Evade")),
            cite: "p. B368",
            content: {
              kind: "table",
              columns: [t(`${K}.Column.Situation`), t(`${K}.Column.Modifier`)],
              rows: [
                {
                  cells: [
                    t(`${K}.Evade.standing`),
                    signed(evadeModifier({ foePosture: "standing" })),
                  ],
                },
                {
                  cells: [
                    t(`${K}.Evade.kneeling`),
                    signed(evadeModifier({ foePosture: "kneeling" })),
                  ],
                },
                { cells: [t(`${K}.Evade.lying`), signed(evadeModifier({ foePosture: "lying" }))] },
                { cells: [t(`${K}.Evade.side`), signed(evadeModifier({ approach: "side" }))] },
                { cells: [t(`${K}.Evade.back`), signed(evadeModifier({ approach: "back" }))] },
              ],
            },
            notes: [t(partKey("closeCombat", "EvadeNote"))],
          },
          {
            id: "slam",
            heading: t(partKey("closeCombat", "Slam")),
            cite: "pp. B371-372",
            content: {
              kind: "rules",
              items: [
                m("SlamRoll", { bonus: signed(slamToHit("flyingTackle")) }),
                m("SlamDamage", { small: `${small.dice}d${small.modifier}` }),
                m("SlamResult"),
                m("Shove"),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "unarmedCombat",
    tab: "combat",
    cite: "pp. B370-371",
    build: ({ t }) => {
      const m = itemsOf("unarmedCombat", t);
      const oneHand = breakFree({ hands: 1 });
      const twoHands = breakFree({ hands: 2 });
      const pinned = breakFree({ pinned: true });
      const pinnedOne = breakFree({ pinned: true, hands: 1 });
      return {
        parts: [
          {
            id: "grabbing",
            heading: t(partKey("unarmedCombat", "Grabbing")),
            content: {
              kind: "rules",
              items: [
                m("Grab", { skills: GRAPPLING_SKILLS.join(", ") }),
                m("Held", { value: signed(GRAPPLED_DX_PENALTY) }),
                m("Arms", { value: signed(extraArmBonus(3)) }),
                m("Size", { value: signed(grappleSizeBonus(1, 0)) }),
              ],
            },
          },
          {
            id: "grappling",
            heading: t(partKey("unarmedCombat", "Grappling")),
            content: {
              kind: "rules",
              items: [
                m("BreakFree", {
                  one: signed(oneHand.grapplerBonus),
                  two: signed(twoHands.grapplerBonus),
                  pinnedTwo: signed(pinned.grapplerBonus),
                  pinnedOne: signed(pinnedOne.grapplerBonus),
                  seconds: pinned.secondsBetweenAttempts,
                }),
                m("Stunned", {
                  value: signed(
                    breakFree({ grapplerStunned: true }).grapplerBonus - twoHands.grapplerBonus,
                  ),
                }),
              ],
            },
          },
          {
            id: "takedown",
            heading: t(partKey("unarmedCombat", "Takedown")),
            content: {
              kind: "rules",
              items: [
                m("TakedownRoll", {
                  kneeling: signed(takedownModifier("kneeling")),
                  lying: signed(takedownModifier("lying")),
                }),
              ],
            },
          },
          {
            id: "pin",
            heading: t(partKey("unarmedCombat", "Pin")),
            content: {
              kind: "rules",
              items: [
                m("PinRoll", {
                  size: signed(pinModifier({ sizeModifier: 1 })),
                  hands: signed(pinModifier({ freeHands: 2, foeFreeHands: 0 })),
                }),
              ],
            },
          },
          {
            id: "strangle",
            heading: t(partKey("unarmedCombat", "Strangle")),
            content: {
              kind: "rules",
              items: [
                m("ChokeRoll", {
                  one: signed(chokeModifier({ hands: 1 })),
                  extra: signed(chokeModifier({ hands: 3 })),
                  torso: signed(chokeModifier({ aroundTorso: true })),
                }),
                m("ChokeDamage"),
              ],
            },
          },
        ],
      };
    },
  }),
  section({
    id: "visionHexDiagram",
    tab: "combat",
    cite: "pp. B386, B390-391",
    build: ({ t }) => {
      const side = arcDefense({ arc: "side" });
      const back = arcDefense({ arc: "back" });
      const peripheral = arcDefense({ arc: "back", vision: { peripheral: true } });
      return {
        parts: [
          {
            content: {
              kind: "diagram",
              svg: visionHexSvg(t),
              legend: [
                { term: t(`${K}.Arc.front`), text: t(partKey("visionHexDiagram", "Front")) },
                {
                  term: t(`${K}.Arc.side`),
                  text: t(partKey("visionHexDiagram", "Side"), { value: signed(side.modifier) }),
                },
                {
                  term: t(`${K}.Arc.back`),
                  text: back.helpless
                    ? t(partKey("visionHexDiagram", "Back"), {
                        value: signed(peripheral.modifier),
                        parry: signed(peripheral.parryModifier),
                      })
                    : "",
                },
              ],
            },
          },
        ],
      };
    },
  }),
];
