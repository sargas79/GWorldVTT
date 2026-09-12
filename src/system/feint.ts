/**
 * A Feint that has landed and not yet been spent
 * (GURPS Basic Set: Campaigns p. 365).
 *
 * A Feint is unusual among combat options in that it pays off on a *later*
 * turn: you fake this second and strike the next, and the foe defends at a
 * penalty when you do. So something has to remember it in between, and it has
 * to be something that survives a reload and reaches the other clients -- the
 * defense card is drawn on the defender's screen, not the attacker's.
 *
 * A flag on the attacker's own actor does both. It also expires the way the
 * rule does: "A Feint is good for one second", so the next attack that actor
 * makes spends it, whether or not it is aimed at the foe who was feinted --
 * and a fight that moves on without that attack leaves it behind.
 *
 * Not handled: All-Out Attack (Double), where "the feint applies to both
 * attacks". The second attack here spends nothing, because the first already
 * did, so that combination needs the GM to apply the penalty by hand.
 */

import { SYSTEM_ID } from "./constants.js";
import { targetedTokens } from "./targets.js";
import { attributeOf } from "./attributes.js";

/** Where the pending feint is kept on the attacker. */
export const FEINT_FLAG = "feint";

interface PendingFeint {
  /** UUID of the actor who was feinted. */
  target: string;
  /** The penalty their defenses suffer, zero or negative. */
  penalty: number;
  /** The combat and round it was made in, when it was made during one. */
  combat?: string;
  round?: number;
}

/**
 * The combat and round a feint is being made in, if a fight is running.
 *
 * Read off globalThis rather than the `game` global directly, so that this is
 * answerable outside Foundry -- where there is no fight, and so nothing to
 * expire against.
 */
function nowInCombat(): { combat: string; round: number } | null {
  const combat = (globalThis as {
    game?: { combat?: { id?: string; round?: number } };
  }).game?.combat;
  if (!combat?.id) return null;
  return { combat: String(combat.id), round: Number(combat.round) || 0 };
}

/** Records a feint that landed, to be spent by the attacker's next attack. */
export async function recordFeint(
  attacker: any,
  target: string,
  penalty: number,
): Promise<void> {
  if (!attacker?.isOwner || penalty >= 0 || !target) return;
  await attacker.setFlag(SYSTEM_ID, FEINT_FLAG, {
    target,
    penalty,
    ...(nowInCombat() ?? {}),
  } satisfies PendingFeint);
}

/**
 * Whether a feint is still worth anything.
 *
 * "A Feint is good for one second", which is this round or the next: you fake
 * on your turn and strike on the following one. Outside a fight nothing counts
 * rounds, so nothing expires -- the next attack spends it whenever it comes.
 */
function stillGood(pending: PendingFeint): boolean {
  const now = nowInCombat();
  if (!now || pending.combat === undefined || pending.round === undefined) return true;
  if (pending.combat !== now.combat) return false;
  return now.round - pending.round <= 1;
}

/** Throws away a pending feint without applying it. */
export async function clearFeint(attacker: any): Promise<void> {
  if (!attacker?.isOwner) return;
  if (attacker.getFlag?.(SYSTEM_ID, FEINT_FLAG)) {
    await attacker.unsetFlag(SYSTEM_ID, FEINT_FLAG);
  }
}

/**
 * Spends a pending feint on the attack being rolled now.
 *
 * Returns the penalty when the attack is aimed at the foe who was feinted, and
 * zero otherwise -- but clears it either way, because the feint was good for
 * the one turn and this was it.
 */
export async function consumeFeint(attacker: any): Promise<number> {
  const pending = attacker?.getFlag?.(SYSTEM_ID, FEINT_FLAG) as PendingFeint | undefined;
  if (!pending?.target) return 0;

  await clearFeint(attacker);
  if (!stillGood(pending)) return 0;

  const aimedAt = targetedTokens().some(
    (token: any) => String(token?.actor?.uuid ?? "") === pending.target,
  );
  return aimedAt ? Number(pending.penalty) || 0 : 0;
}

/**
 * What a foe rolls to see through a feint.
 *
 * "roll a Quick Contest of Melee Weapon skills with your foe; if either of you
 * is unarmed, you may roll against an unarmed combat skill instead. Your
 * opponent may opt to roll against Cloak or Shield skill, if he is suitably
 * equipped and this would give him a better roll. If his DX is better than his
 * combat skills, he may roll against DX instead."
 *
 * Every one of those is "whichever is highest", so it is taken rather than
 * asked: the foe defends with their best, which is what they would choose.
 */
export function feintDefenseScore(foe: any): { score: number; source: string } {
  const dx = attributeOf(foe, "DX");
  let best = { score: dx, source: "DX" };

  // Every melee mode the foe has is a combat skill they could roll against,
  // armed or unarmed.
  const melee: any[] = foe?.system?.derived?.melee ?? [];
  for (const attack of melee) {
    const level = Number(attack?.skillLevel);
    if (Number.isFinite(level) && level > best.score) {
      best = { score: level, source: String(attack.skillName || attack.name || "") };
    }
  }

  // Cloak and Shield are named by the rule specifically, and are skills the foe
  // may have without any attack mode using them.
  for (const item of foe?.items ?? []) {
    if (item?.type !== "skill") continue;
    const name = String(item.name ?? "");
    if (!/^(cloak|shield)\b/i.test(name)) continue;
    const level = Number(item.system?.derived?.level);
    if (Number.isFinite(level) && level > best.score) best = { score: level, source: name };
  }

  return best;
}
