/**
 * Rolling a Malediction (GURPS Basic Set: Characters p. 106).
 *
 * "Roll against your Will, applying the range penalties detailed below. Your
 * foe may choose to resist; if so, resolve the attack as a Quick Contest of
 * Will. You must win to affect the victim." So the attacker's half is a
 * success roll at a range penalty the Malediction's level sets, and the
 * victim's half is the same Quick Contest card a Resisted spell posts: a
 * button for each target, which they may roll or not. An Affliction delivered
 * this way is resisted with the attribute it names instead (HT, most often).
 *
 * The damage is rolled from the attack's damage cell afterwards, as for any
 * attack, and carries on its card that DR has no effect on it.
 */

import { measuredShot, promptForNumber, rollSuccess } from "./roll.js";
import { postResistCard } from "./spell-resistance.js";
import { targetedTokens } from "./targets.js";
import { maledictionRangeModifier, type MaledictionLevel } from "../rules/trait-attacks.js";

/**
 * Rolls the attacker's half of a Malediction from its attack row, and posts
 * the resistance card for whoever is targeted if it succeeds.
 */
export async function rollMalediction(actor: any, event: Event, target: HTMLElement): Promise<void> {
  const level = Math.max(0, Math.min(3, Number(target.dataset.malediction) || 0)) as MaledictionLevel;
  const base = Number(target.dataset.rollTarget);
  if (!level || !Number.isFinite(base)) return;
  const label = String(target.dataset.rollLabel ?? "");

  // The distance off the map, as a shot measures it; asked for where the
  // map cannot say, or on a shift-click.
  const measured = (event as MouseEvent).shiftKey ? null : measuredShot(actor);
  const yards = measured
    ? measured.rangeYards
    : await promptForNumber({
        title: label,
        label: game.i18n.localize("GWORLD.Malediction.DistancePrompt"),
        initial: 1,
      });
  if (yards === null) return;

  const penalty = maledictionRangeModifier(level, yards);
  const outcome = await rollSuccess({
    actor,
    base,
    label: game.i18n.format("GWORLD.Malediction.Label", { name: label, level }),
    kind: "skill",
    modifiers: penalty
      ? [{ label: game.i18n.format("GWORLD.Malediction.Range", { yards, level }), value: penalty }]
      : [],
  });
  if (!outcome?.success) return;

  const subjects = targetedTokens()
    .map((token: any) => token?.actor)
    .filter((subject: any) => subject?.uuid);
  if (subjects.length === 0) return;

  await postResistCard({
    caster: actor,
    spell: label,
    casterRoll: outcome.roll,
    casterEffective: outcome.effectiveSkill,
    // "A Quick Contest of Will", or the attribute an Affliction names.
    resistedBy: String(target.dataset.resistWith || "Will"),
    area: false,
    subjects,
    // Magic Resistance stops spells; a Malediction is an advantage.
    magical: false,
  });
}
