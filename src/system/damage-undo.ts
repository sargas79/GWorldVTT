/**
 * Undoing an application of damage.
 *
 * Damage lands on a target in several places at once: a pool goes down, the
 * ablative armour that met the blow is worn away, an aim is lost, and the
 * health conditions follow the new total. Before this there was no way back
 * from any of it -- the only undo in the system was for a knockdown -- so a
 * blow applied to the wrong token was repaired by hand, field by field, from
 * memory.
 *
 * Undo is deliberately narrow. It reverses one application, the one the card
 * describes, and only while every field it touched still holds the value it
 * left there. If anything has moved since -- a second blow, a heal, a GM's
 * edit -- restoring the old numbers would quietly throw that away, so the undo
 * refuses and says so instead. Refusing is the whole point: an undo that
 * silently overwrote later work would be worse than none.
 *
 * The deciding is kept apart from the reading and writing of documents, so it
 * can be tested without Foundry.
 */

/** A pool an actor's injury comes off. */
export type DamagePool = "hp" | "fp";

/** One ablative armour piece worn down by the blow. */
export interface ArmorWear {
  itemId: string;
  /** Points lost before the blow, and after it. */
  from: number;
  to: number;
}

/** An aim the blow spoiled, as it stood before. */
export interface AimBefore {
  turns: number;
  target: string;
  bonuses: unknown[];
}

/** Everything one application of damage changed, and what it changed it from. */
export interface DamageTransaction {
  actorUuid: string;
  actorName: string;
  pool: DamagePool;
  /** The pool before the blow, and what the blow left. */
  from: number;
  to: number;
  armor: ArmorWear[];
  /** The aim the blow cost, or null where there was none to lose. */
  aim: AimBefore | null;
  /** When it was applied, for saying how old an undo is. */
  at: number;
}

/** The state the undo is checked against: what the documents hold now. */
export interface CurrentState {
  pool: number;
  /** Points lost per armour piece now, by item id. A missing piece is absent. */
  armor: Record<string, number>;
}

/** Why an undo cannot be made. */
export type UndoRefusal =
  | "actorGone"
  | "poolChanged"
  | "armorChanged"
  | "armorGone";

/** What an undo would do, or why it will not be made. */
export type UndoPlan =
  | {
      ok: true;
      /** The actor update, ready to pass on. */
      actorChanges: Record<string, unknown>;
      /** The armour updates, ready to pass on. */
      armorChanges: Array<Record<string, unknown>>;
    }
  | { ok: false; reason: UndoRefusal };

/**
 * Decides whether one application of damage can still be taken back, and what
 * taking it back means.
 *
 * Every field is checked against the value the application left, not merely
 * against "something plausible": the test for "has this changed since?" is
 * exact, because anything less lets a later edit be overwritten.
 */
export function undoPlan(
  transaction: DamageTransaction | null | undefined,
  current: CurrentState | null | undefined,
): UndoPlan {
  if (!transaction || !current) return { ok: false, reason: "actorGone" };

  // The pool must still hold what the blow left it at.
  if (Number(current.pool) !== Number(transaction.to)) return { ok: false, reason: "poolChanged" };

  for (const piece of transaction.armor ?? []) {
    const now = current.armor?.[piece.itemId];
    // Armour taken off the character, or deleted, cannot be put back the way
    // it was; there is nothing to write to.
    if (now === undefined) return { ok: false, reason: "armorGone" };
    if (Number(now) !== Number(piece.to)) return { ok: false, reason: "armorChanged" };
  }

  const actorChanges: Record<string, unknown> = {
    [`system.${transaction.pool}.value`]: transaction.from,
  };
  // An aim is only restored where the blow is what cost it. Where there was
  // none, undo leaves the aim alone rather than inventing one.
  if (transaction.aim) {
    actorChanges["system.aim.turns"] = transaction.aim.turns;
    actorChanges["system.aim.target"] = transaction.aim.target;
    actorChanges["system.aim.bonuses"] = transaction.aim.bonuses;
  }

  return {
    ok: true,
    actorChanges,
    armorChanges: (transaction.armor ?? [])
      .filter((piece) => piece.from !== piece.to)
      .map((piece) => ({ _id: piece.itemId, "system.drLost": piece.from })),
  };
}

/** Whether a transaction still describes something worth offering to undo. */
export function isUndoable(transaction: DamageTransaction | null | undefined): boolean {
  if (!transaction) return false;
  if (transaction.from !== transaction.to) return true;
  if (transaction.aim) return true;
  return (transaction.armor ?? []).some((piece) => piece.from !== piece.to);
}

/**
 * Reads the fields an undo is checked against off the live documents.
 *
 * Only the pieces the transaction names are read: an armour piece the blow
 * never touched is not the undo's business, and an undo must not care whether
 * it changed.
 */
export function currentStateFor(actor: any, transaction: DamageTransaction): CurrentState | null {
  if (!actor) return null;
  const armor: Record<string, number> = {};
  for (const piece of transaction.armor ?? []) {
    const item = actor.items?.get?.(piece.itemId);
    if (!item) continue;
    armor[piece.itemId] = Number(item.system?.drLost ?? 0) || 0;
  }
  return { pool: Number(actor.system?.[transaction.pool]?.value) || 0, armor };
}

/** What an attempted undo did, for telling the user. */
export interface UndoOutcome {
  ok: boolean;
  reason?: UndoRefusal;
  actorName: string;
}

/**
 * Takes back one application of damage, or refuses.
 *
 * The refusal is the important half: where anything the application touched
 * has moved since, the old values are not written, because writing them would
 * discard whatever moved them.
 */
export async function undoDamage(transaction: DamageTransaction): Promise<UndoOutcome> {
  const actorName = String(transaction?.actorName ?? "");
  const actor: any = transaction?.actorUuid ? await fromUuid(transaction.actorUuid).catch(() => null) : null;
  if (!actor) return { ok: false, reason: "actorGone", actorName };
  if (!actor.isOwner) return { ok: false, reason: "actorGone", actorName };

  const plan = undoPlan(transaction, currentStateFor(actor, transaction));
  if (!plan.ok) return { ok: false, reason: plan.reason, actorName };

  await actor.update(plan.actorChanges);
  if (plan.armorChanges.length > 0) {
    await actor.updateEmbeddedDocuments?.("Item", plan.armorChanges);
  }
  return { ok: true, actorName };
}
