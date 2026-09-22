/**
 * Trampling somebody underfoot (GURPS Basic Set: Campaigns p. 404).
 *
 * "You can trample a victim if your Size Modifier exceeds his by 2 or more --
 * or by only 1, if he's lying prone and you're not." So the victim has to be
 * targeted: the rule is about the two sizes, and there is no telling whether
 * it applies without knowing whose feet and whose ribs.
 *
 * The attack roll and the damage both go through the ordinary machinery --
 * `rollSuccess` and `rollDamage` -- so a trample lands on the chat card with
 * its apply buttons like any other blow. What is trampling's own is what is
 * rolled against, what defends, and the two ways damage is worked out.
 */

import { rollDamage, rollSuccess } from "./roll.js";
import { targetedTokens } from "./targets.js";
import { normalizeSkillName } from "../rules/skills.js";
import { canTrample, trampleDamage, trampleSkill } from "../rules/trampling.js";
import { formatDiceAdds } from "../rules/dice.js";

/** The level of a skill by name, or null when the character lacks it. */
function skillLevelOf(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    if (normalizeSkillName(String(item.name)) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" ? level : null;
  }
  return null;
}

/** Whether the character has hooves, which are worth a point a die here. */
function hasHooves(actor: any): boolean {
  return [...(actor?.items ?? [])].some((item: any) => {
    if (item.type !== "trait") return false;
    const name = String(item.name).trim().toLowerCase();
    return name === "claws (hooves)" || name === "hooves";
  });
}

/**
 * Tramples the targeted foe.
 *
 * An overrun -- "if you knock down a foe in a collision or slam and keep on
 * moving" -- is not rolled for at all: it is half ST of thrust and no
 * defense, so it goes straight to the damage.
 */
export async function trample(options: {
  actor: any;
  modifier: number;
  /** The automatic version, after a knockdown. */
  overrun: boolean;
}): Promise<void> {
  const { actor } = options;

  const targets = targetedTokens();
  if (targets.length !== 1) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Trample.OneTarget"));
    return;
  }
  const victim = targets[0]?.actor;
  if (!victim) return;

  const tramplerSm = Number(actor.system?.sm) || 0;
  const victimSm = Number(victim.system?.sm) || 0;
  const victimProne = ["lying", "crawling", "sitting", "kneeling"].includes(
    String(victim.system?.posture ?? "standing"),
  );
  const allowed = canTrample({ tramplerSm, victimSm, victimProne });
  if (!allowed.allowed) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Trample.TooSmall", {
        name: String(victim.name ?? ""),
        mine: tramplerSm,
        theirs: victimSm,
      }),
    );
    return;
  }

  const st = Number(actor.system?.derived?.strikingSt) || Number(actor.system?.attributes?.ST) || 10;
  const hooves = hasHooves(actor);
  const damage = trampleDamage({ st, hooves, overrun: options.overrun });

  if (!options.overrun) {
    const skill = trampleSkill(
      Number(actor.system?.derived?.attributes?.DX) || 10,
      skillLevelOf(actor, "Brawling"),
    );
    const outcome = await rollSuccess({
      actor,
      base: skill.level,
      label: game.i18n.format("GWORLD.Trample.Label", { name: String(victim.name ?? ""), from: skill.from }),
      kind: "attack",
      modifiers: options.modifier !== 0
        ? [{ label: game.i18n.localize("GWORLD.Chat.Situational"), value: options.modifier }]
        : [],
      unarmed: true,
    });
    if (!outcome?.success) return;
  }

  await rollDamage({
    actor,
    label: game.i18n.format(
      options.overrun ? "GWORLD.Trample.OverrunDamage" : "GWORLD.Trample.Damage",
      { name: String(victim.name ?? "") },
    ),
    // rollDamage takes the book's notation, "1d-4", and rolls it itself.
    formula: formatDiceAdds(damage),
    damageType: "cr",
    ...(hooves ? { modifiers: [] } : {}),
    // A much larger foot is a large-area injury, which the card now applies
    // rather than only mentions (since API 1.72.0).
    ...(allowed.largeArea ? { largeArea: true } : {}),
  });

  // The two things the rule says beside the numbers: the dodge is all the
  // victim gets, and a much larger foot is a large-area injury.
  const notes = [
    game.i18n.localize("GWORLD.Trample.DodgeOnly"),
    ...(allowed.largeArea ? [game.i18n.localize("GWORLD.Trample.LargeAreaHint")] : []),
    ...(allowed.needsProne ? [game.i18n.localize("GWORLD.Trample.OnlyBecauseProne")] : []),
  ];
  ui.notifications?.info(notes.join(" "));
}
