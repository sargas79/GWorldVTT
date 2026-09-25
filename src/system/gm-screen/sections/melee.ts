/**
 * Tab 3, Melee: what changes a melee attack and an active defense, what lost
 * HP and FP do, when a roll is critical, and the Rules of 14, 16 and 20.
 */

import { acrobaticDefenseModifier, bareHandedParryModifier, dodge, flailDefenseModifier, multipleParryPenalty, parry, thrownParryModifier } from "../../../rules/defenses.js";
import { DECEPTIVE_SKILL_FLOOR, RAPID_STRIKE_PENALTY, deceptiveAttack, dualWeaponAttack } from "../../../rules/attack-options.js";
import { FEVERISH_DEFENSE_BONUS } from "../../../rules/extra-effort.js";
import { fatigueStatus } from "../../../rules/fatigue.js";
import { FRIGHT_CHECK_CEILING } from "../../../rules/fright.js";
import { GRAPPLED_DX_PENALTY } from "../../../rules/grappling.js";
import { MAX_SHOCK_PENALTY, consciousnessRollPenalty, healthStatus, shockPenalty } from "../../../rules/injury.js";
import { STUN_DEFENSE_PENALTY } from "../../../rules/knockdown.js";
import { MAX_EVALUATE_BONUS, MOVE_AND_ATTACK_PENALTY, WILD_SWING_SKILL_CAP, allOutAttackBonus, wildSwingPenalty } from "../../../rules/maneuvers.js";
import { chinkPenalty, disarmPenalty } from "../../../rules/melee-situations.js";
import { POSTURE_EFFECTS } from "../../../rules/posture.js";
import { RULE_OF_20_CAP } from "../../../rules/skills.js";
import { ruleOf16 } from "../../../rules/spell-attacks.js";
import { criticalRange } from "../../../rules/success.js";
import { arcDefense, retreatBonus } from "../../../rules/tactical.js";
import { UNFAMILIAR_PENALTY } from "../../../rules/tech-level.js";
import { attackWithoutSight, defendWithoutSight } from "../../../rules/visibility.js";
import { signed, span } from "../format.js";
import type { GmItem, GmRow, GmSectionDef } from "../types.js";
import { K, partKey, section } from "./shared.js";

/** Rows of effective skill that criticals treat alike, run together: "7-15". */
function criticalRows(): GmRow[] {
  const rows: Array<{ from: number; to: number; success: number; failure: number }> = [];
  for (let skill = 3; skill <= 16; skill += 1) {
    const { successUpTo, failureFrom } = criticalRange(skill);
    const last = rows[rows.length - 1];
    if (last && last.success === successUpTo && last.failure === failureFrom) last.to = skill;
    else rows.push({ from: skill, to: skill, success: successUpTo, failure: failureFrom });
  }
  return rows.map((row, index) => ({
    cells: [
      span(row.from, index === rows.length - 1 ? null : row.to),
      span(3, row.success),
      row.failure >= 18 ? "18" : span(row.failure, null),
    ],
  }));
}

export const MELEE_SECTIONS: readonly GmSectionDef[] = [
  section({
    id: "meleeAttackModifiers",
    tab: "melee",
    cite: "p. B547",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>): GmItem => ({
        term: t(partKey("meleeAttackModifiers", term)),
        text: t(partKey("meleeAttackModifiers", `${term}Text`), data),
      });
      const dual = dualWeaponAttack({});
      const blind = attackWithoutSight({ sight: "blind" });
      return {
        parts: [{
          content: {
            kind: "rules",
            items: [
              m("Determined", { value: signed(allOutAttackBonus("determined")) }),
              m("Evaluate", { max: signed(MAX_EVALUATE_BONUS) }),
              m("MoveAndAttack", { value: signed(MOVE_AND_ATTACK_PENALTY), cap: WILD_SWING_SKILL_CAP }),
              m("Deceptive", { attack: signed(deceptiveAttack(20, 1).attackPenalty), defense: signed(deceptiveAttack(20, 1).defensePenalty), floor: DECEPTIVE_SKILL_FLOOR }),
              m("RapidStrike", { value: signed(RAPID_STRIKE_PENALTY) }),
              m("DualWeapon", { value: signed(dual.primary), offHand: signed(dual.offHand) }),
              m("Posture", { low: signed(POSTURE_EFFECTS.kneeling.attack), lying: signed(POSTURE_EFFECTS.lying.attack) }),
              m("Grappled", { value: signed(GRAPPLED_DX_PENALTY) }),
              m("Shock", { value: signed(shockPenalty(1)), max: signed(MAX_SHOCK_PENALTY) }),
              m("CannotSee", {
                blind: signed(blind.modifier),
                accustomed: signed(attackWithoutSight({ sight: "blind", accustomedToBlindness: true }).modifier),
                unseen: signed(attackWithoutSight({ sight: "foeUnseen" }).modifier),
                located: signed(attackWithoutSight({ sight: "positionKnown" }).modifier),
              }),
              m("WildSwing", { value: signed(wildSwingPenalty(0)), cap: WILD_SWING_SKILL_CAP }),
              m("Chinks", { torso: signed(chinkPenalty("torso")), other: signed(chinkPenalty("skull")) }),
              m("Disarm", { value: signed(disarmPenalty(false)) }),
              m("Unfamiliar", { value: signed(UNFAMILIAR_PENALTY) }),
              m("HitLocation"),
            ],
          },
        }],
      };
    },
  }),
  section({
    id: "activeDefenseModifiers",
    tab: "melee",
    cite: "p. B548",
    build: ({ t }) => {
      const m = (term: string, data?: Record<string, string | number>): GmItem => ({
        term: t(partKey("activeDefenseModifiers", term)),
        text: t(partKey("activeDefenseModifiers", `${term}Text`), data),
      });
      const side = arcDefense({ arc: "side" });
      // Read off the defense functions themselves: what the option adds to a Dodge or Parry of 10.
      const gain = (with_: number, without: number) => signed(with_ - without);
      const behind = arcDefense({ arc: "back", vision: { peripheral: true } });
      return {
        parts: [{
          content: {
            kind: "rules",
            items: [
              m("AllOutDefense", { value: gain(parry(14, { allOutDefenseIncreased: true }).total, parry(14).total) }),
              m("Retreat", {
                dodge: signed(retreatBonus({ defense: "dodge" })),
                other: signed(retreatBonus({ defense: "block" })),
                fencing: signed(retreatBonus({ defense: "parry", isFencing: true })),
              }),
              m("Acrobatic", { success: signed(acrobaticDefenseModifier(true)), failure: signed(acrobaticDefenseModifier(false)) }),
              m("Feverish", { value: signed(FEVERISH_DEFENSE_BONUS) }),
              m("Shield"),
              m("CombatReflexes", { value: gain(dodge(7, { combatReflexes: true }).total, dodge(7).total) }),
              m("Posture", { low: signed(POSTURE_EFFECTS.kneeling.defense), lying: signed(POSTURE_EFFECTS.lying.defense) }),
              m("Side", { value: signed(side.modifier) }),
              m("Behind", { value: signed(behind.modifier), parry: signed(behind.parryModifier) }),
              m("Stunned", { value: signed(STUN_DEFENSE_PENALTY) }),
              m("CannotSee", { value: signed(defendWithoutSight({ aware: true }).modifier) }),
              m("Deceptive"),
              m("MultipleParry", {
                value: signed(multipleParryPenalty(1, { fencing: false, trained: false })),
                fencing: signed(multipleParryPenalty(1, { fencing: true, trained: false })),
                both: signed(multipleParryPenalty(1, { fencing: true, trained: true })),
              }),
              m("Unarmed", { value: signed(bareHandedParryModifier({ parrySkill: "Brawling", bareHanded: true, attackIsWeapon: true, attackIsThrust: false })) }),
              m("Thrown", { value: signed(thrownParryModifier(5)), small: signed(thrownParryModifier(1)) }),
              m("Flail", { parry: signed(flailDefenseModifier("flail", "parry")), block: signed(flailDefenseModifier("flail", "block")) }),
              m("DualTarget", { value: signed(dualWeaponAttack({ sameTarget: true }).defensePenalty) }),
              m("Encumbrance", { value: gain(dodge(7, { encumbrance: 1 }).total, dodge(7).total) }),
            ],
          },
        }],
      };
    },
  }),
  section({
    id: "lostHitPoints",
    tab: "melee",
    cite: "p. B419",
    build: ({ t }) => {
      // Probed at 10 HP, so the rows are the automation's thresholds and not a copy of them.
      const at = (hp: number) => healthStatus(hp, 10);
      const rows: GmRow[] = [
        { key: at(3), cells: [t(`${K}.Hp.BelowThird`), t(`${K}.Hp.Reeling`)] },
        { key: at(0), cells: [t(`${K}.Hp.Zero`), t(`${K}.Hp.ZeroText`, { value: signed(consciousnessRollPenalty(-10, 10)) })] },
        { key: "deathCheck", cells: [t(`${K}.Hp.MinusHp`), t(`${K}.Hp.MinusHpText`)] },
        { key: at(-50), cells: [t(`${K}.Hp.MinusFive`), t(`${K}.Hp.Dead`)] },
        { key: at(-100), cells: [t(`${K}.Hp.MinusTen`), t(`${K}.Hp.Destroyed`)] },
      ];
      return { parts: [{ content: { kind: "table", columns: [t(`${K}.Column.HpLeft`), t(`${K}.Column.Effect`)], rows } }] };
    },
  }),
  section({
    id: "lostFatiguePoints",
    tab: "melee",
    cite: "p. B426",
    build: ({ t }) => {
      const at = (fp: number) => fatigueStatus(fp, 10);
      const rows: GmRow[] = [
        { key: at(3), cells: [t(`${K}.Fp.BelowThird`), t(`${K}.Fp.VeryTired`)] },
        { key: at(0), cells: [t(`${K}.Fp.Zero`), t(`${K}.Fp.ZeroText`)] },
        { key: at(-10), cells: [t(`${K}.Fp.MinusFp`), t(`${K}.Fp.Unconscious`)] },
      ];
      return { parts: [{ content: { kind: "table", columns: [t(`${K}.Column.FpLeft`), t(`${K}.Column.Effect`)], rows } }] };
    },
  }),
  section({
    id: "criticals",
    tab: "melee",
    cite: "p. B348",
    build: ({ t }) => ({
      parts: [{
        content: {
          kind: "table",
          columns: [t(`${K}.Column.EffectiveSkill`), t(`${K}.Column.CriticalSuccess`), t(`${K}.Column.CriticalFailure`)],
          rows: criticalRows(),
        },
      }],
      notes: [t(`${K}.Section.criticals.Note`)],
    }),
  }),
  section({
    id: "rulesOf",
    tab: "melee",
    cite: "pp. B173, B349, B360",
    build: ({ t }) => ({
      parts: [
        { id: "ruleOf14", heading: t(partKey("rulesOf", "Fourteen")), cite: "p. B360", content: { kind: "rules", items: [{ term: t(partKey("rulesOf", "FourteenTerm")), text: t(partKey("rulesOf", "FourteenText"), { cap: FRIGHT_CHECK_CEILING, fail: FRIGHT_CHECK_CEILING + 1 }) }] } },
        { id: "ruleOf16", heading: t(partKey("rulesOf", "Sixteen")), cite: "p. B349", content: { kind: "rules", items: [{ term: t(partKey("rulesOf", "SixteenTerm")), text: t(partKey("rulesOf", "SixteenText"), { cap: ruleOf16(99, 0) }) }] } },
        { id: "ruleOf20", heading: t(partKey("rulesOf", "Twenty")), cite: "p. B173", content: { kind: "rules", items: [{ term: t(partKey("rulesOf", "TwentyTerm")), text: t(partKey("rulesOf", "TwentyText"), { cap: RULE_OF_20_CAP }) }] } },
      ],
    }),
  }),
];
