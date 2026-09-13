/**
 * The unarmed techniques on the sheet (GURPS Basic Set: Campaigns pp. 403-404).
 *
 * The rules were written and nothing could reach them. Two of the five are
 * strikes -- an elbow, a Karate blow on a single point -- and are a roll to
 * hit at a penalty. The other three are holds, and a hold is not an attack at
 * all: "Roll a Quick Contest ... If you win, you inflict crushing damage equal
 * to your margin of victory." So those roll the Contest and then say what the
 * margin did, through armour that only half counts.
 */

import { SYSTEM_ID } from "./constants.js";
import { rollQuickContest } from "./contest.js";
import { resolveSuccess } from "../rules/success.js";
import { swingDamage } from "../rules/damage.js";
import { formatDiceAdds } from "../rules/dice.js";
import {
  CHOKE_FP_PER_TURN,
  CHOKE_HOLD_BONUS,
  ARM_LOCK_HOLD_BONUS,
  LOCKED_DEFENSE_PENALTY,
  NECK_SNAP_PENALTY,
  armLockDamage,
  chokedCanStillFight,
  improvisedPenalty,
  lockAttack,
  lockDr,
  lockResistance,
  piercingStrike,
  techniqueModifier,
  techniqueSkills,
  wrenchWounding,
  type UnarmedTechnique,
} from "../rules/unarmed-techniques.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/technique.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.Technique.${key}`, data)
    : game.i18n.localize(`GWORLD.Technique.${key}`);

/** A skill level off the sheet, or null where the character lacks it. */
function levelOf(actor: any, skill: string): number | null {
  const found = actor?.system?.skillLevelByName?.(skill);
  return typeof found === "number" && Number.isFinite(found) ? found : null;
}

/**
 * What a technique is rolled against by this character (pp. 403-404).
 *
 * "Roll against your Judo at -2 or Wrestling at -3" -- so the better skill is
 * not simply the higher number but the higher number after its own penalty,
 * which is why every skill the technique allows is worked out and the best
 * kept. Null where they know none of them, which is not a default: the book
 * gives these techniques no default roll.
 */
export function techniqueTarget(
  actor: any,
  technique: UnarmedTechnique,
): { skill: string; level: number; modifier: number; target: number } | null {
  let best: { skill: string; level: number; modifier: number; target: number } | null = null;
  for (const skill of techniqueSkills(technique)) {
    const level = levelOf(actor, skill);
    const modifier = techniqueModifier(technique, skill);
    if (level === null || modifier === null) continue;
    const target = level + modifier;
    if (best === null || target > best.target) best = { skill, level, modifier, target };
  }
  return best;
}

/** What the victim brings to a hold: the two attributes it is resisted with, and their armour. */
export interface Victim {
  st: number;
  ht: number;
  /** Their own DR, from hide or scales. */
  naturalDr: number;
  /** True where that natural DR is Tough Skin, which a hold ignores. */
  toughSkin: boolean;
  rigidDr: number;
  flexibleDr: number;
}

/** One line of what a technique did or leaves behind. */
export interface TechniqueNote {
  key: string;
  data?: Record<string, unknown>;
  grave?: boolean;
}

/**
 * Uses a technique (pp. 403-404).
 *
 * The strikes roll to hit and say what a hit means. The holds roll the Quick
 * Contest and say what the margin did: an arm lock's margin is its damage, less
 * the DR a lock respects; a neck snap is swing damage at the neck's wounding
 * modifier. A choke is a hold that drains rather than damages.
 */
export async function useTechnique(options: {
  actor: any;
  technique: UnarmedTechnique;
  victim: Victim;
  /** For a wrench: "neck" or a limb. */
  location: string;
  /** True once the locked arm is already crippled. */
  crippled: boolean;
  /** How clumsy an improvised weapon is, 0 to 3 (p. 404). */
  clumsiness: number;
}): Promise<void> {
  const { actor, technique, victim } = options;
  if (!actor?.isOwner) return;

  const name = String(actor.name ?? "");
  const notes: TechniqueNote[] = [];
  const dr = lockDr({
    naturalDr: victim.naturalDr,
    toughSkin: victim.toughSkin,
    rigidDr: victim.rigidDr,
    flexibleDr: victim.flexibleDr,
  });

  // ── the holds: a Quick Contest, and what the margin did ──────────────────
  if (technique === "armLock" || technique === "neckSnap") {
    const strength = Number(actor.system?.attributes?.ST ?? 10) || 10;
    const attack =
      technique === "neckSnap"
        ? strength + NECK_SNAP_PENALTY
        : lockAttack({ judo: levelOf(actor, "Judo"), wrestling: levelOf(actor, "Wrestling"), strength });

    const result = await rollQuickContest({
      label: L(`Name.${technique}`),
      first: { actor, base: attack, note: technique === "neckSnap" ? "ST-4" : "" },
      second: {
        // The victim may be nobody on the map, but the card still names who won.
        actor: { name: L("Victim") },
        base: lockResistance({ strength: victim.st, health: victim.ht }),
        note: L("Resists"),
      },
    });

    if (result.outcome === "first") {
      if (technique === "armLock") {
        const hurt = armLockDamage({
          margin: result.marginOfVictory,
          dr,
          crippled: options.crippled,
        });
        notes.push(
          hurt.shockOnly
            ? { key: "ShockOnly" }
            : { key: "LockDamage", data: { damage: hurt.damage, dr }, grave: hurt.damage > 0 },
        );
      } else {
        // "If you win, you inflict swing/crushing damage on the neck or limb."
        const swing = swingDamage(strength);
        notes.push({
          key: "WrenchDamage",
          data: {
            damage: formatDiceAdds(swing),
            wounding: wrenchWounding(options.location || "neck"),
            dr,
          },
          grave: true,
        });
      }
    } else {
      notes.push({ key: "HoldFails" });
    }

    if (technique === "armLock") {
      notes.push({ key: "LockHolds", data: { bonus: ARM_LOCK_HOLD_BONUS, penalty: LOCKED_DEFENSE_PENALTY } });
    }
    // "Flexible armor has no effect!" -- worth saying when there is some.
    if (victim.flexibleDr > 0) notes.push({ key: "FlexibleIgnored", data: { dr: victim.flexibleDr } });
    await postNotes(actor, name, technique, notes);
    return;
  }

  // ── the strikes and the choke: a roll to hit ─────────────────────────────
  const aim = techniqueTarget(actor, technique);
  if (!aim) {
    ui.notifications?.warn(L("NoSkill", { skills: techniqueSkills(technique).join(", ") }));
    return;
  }

  const clumsy = improvisedPenalty(options.clumsiness);
  const target = aim.target + clumsy;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice[0]?.results ?? []).map((r: { result: number }) => r.result);
  const outcome = resolveSuccess(roll.total, target, dice);

  if (outcome.success) {
    if (technique === "piercingStrike") {
      const strike = piercingStrike();
      notes.push({ key: "Piercing", data: { damage: strike.damage, dr: strike.hurtsYourselfAtDr } });
    }
    if (technique === "chokeHold") {
      const fighting = chokedCanStillFight();
      notes.push({ key: "Choking", data: { fp: CHOKE_FP_PER_TURN, bonus: CHOKE_HOLD_BONUS }, grave: true });
      notes.push({ key: "ChokedFights", data: { penalty: fighting.penalty } });
    }
  }

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      title: L("Uses", { name, technique: L(`Name.${technique}`) }),
      rolled: true,
      skill: aim.skill,
      target,
      modifiers: [
        ...(aim.modifier !== 0 ? [{ label: L("TechniquePenalty"), value: aim.modifier }] : []),
        ...(clumsy !== 0 ? [{ label: L("Improvised"), value: clumsy }] : []),
      ],
      dice,
      total: roll.total,
      outcome,
      notes,
    }),
    rolls: [roll],
  });
}

async function postNotes(actor: any, name: string, technique: UnarmedTechnique, notes: TechniqueNote[]) {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      title: L("Uses", { name, technique: L(`Name.${technique}`) }),
      rolled: false,
      notes,
    }),
  });
}
