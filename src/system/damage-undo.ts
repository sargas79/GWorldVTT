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
 * What follows from the blow goes back with it (#984): the conditions and other
 * effects it put on the token or took off, the radiation it dosed them with,
 * and the shield that took it. Rolls the card still offers for the victim --
 * knockdown, consciousness, death -- are withdrawn, since the wound they
 * follow from is gone.
 *
 * The deciding is kept apart from the reading and writing of documents, so it
 * can be tested without Foundry.
 */

import { SYSTEM_ID } from "./constants.js";
import { SHIELD_NOTE_FLAG } from "./shields.js";
import { syncHealthConditions } from "./conditions.js";

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

/** The effects a blow put on its victim, and the ones it took off. */
export interface EffectChanges {
  /** Ids of the effects the blow created: conditions among them. */
  added: string[];
  /** The effects the blow deleted, as data to create them again. */
  removed: Array<Record<string, unknown>>;
}

/** A radiation dose and when it was last added to. */
export interface RadiationDose {
  dose: number;
  at: number;
}

/** What a shield is carrying of the blows it has taken. */
export interface ShieldState {
  hpLost: number;
  equipped: boolean;
}

/** The shield that took the blow (Campaigns p. 484), and the note that sent it there. */
export interface ShieldWear {
  itemId: string;
  from: ShieldState;
  to: ShieldState;
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
  /** The effects the blow added and removed (since API 1.196.0). */
  effects?: EffectChanges;
  /** The radiation it dosed the victim with, before and after (since API 1.196.0). */
  radiation?: { from: RadiationDose; to: RadiationDose } | null;
  /** The shield that took it, whose note it used up (since API 1.196.0). */
  shield?: ShieldWear | null;
}

/** The state the undo is checked against: what the documents hold now. */
export interface CurrentState {
  pool: number;
  /** Points lost per armour piece now, by item id. A missing piece is absent. */
  armor: Record<string, number>;
  /** The actor's effects now, by id, with the conditions each carries. */
  effects?: Array<{ id: string; statuses: string[] }>;
  /** The radiation dose now. */
  radiationDose?: number;
  /** The shield that took the blow, now; null when it is gone. */
  shield?: ShieldState | null;
  /** The shield a pending note names now, if any. */
  shieldNote?: string | null;
}

/** Why an undo cannot be made. */
export type UndoRefusal =
  | "actorGone"
  | "poolChanged"
  | "armorChanged"
  | "armorGone"
  | "radiationChanged"
  | "shieldChanged"
  | "shieldGone";

/** What an undo would do, or why it will not be made. */
export type UndoPlan =
  | {
      ok: true;
      /** The actor update, ready to pass on. */
      actorChanges: Record<string, unknown>;
      /** The armour updates, ready to pass on. */
      armorChanges: Array<Record<string, unknown>>;
      /** The effects the blow added that are still there, to delete. */
      effectsToDelete: string[];
      /** The effects the blow took off, to create again. */
      effectsToCreate: Array<Record<string, unknown>>;
      /** The shield update, if the blow went into one. */
      shieldChanges: Array<Record<string, unknown>>;
      /** The shield note to leave on the victim again, if the blow used it up. */
      shieldNote: string | null;
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

  // A dose is checked as the pool is: anything since -- another dose, or the
  // GM clearing it -- would be thrown away by writing the old one back.
  const radiation = transaction.radiation ?? null;
  if (radiation && Number(current.radiationDose ?? 0) !== Number(radiation.to.dose)) {
    return { ok: false, reason: "radiationChanged" };
  }

  const shield = transaction.shield ?? null;
  if (shield) {
    if (!current.shield) return { ok: false, reason: "shieldGone" };
    if (Number(current.shield.hpLost) !== Number(shield.to.hpLost) || current.shield.equipped !== shield.to.equipped) {
      return { ok: false, reason: "shieldChanged" };
    }
  }

  const actorChanges: Record<string, unknown> = {
    [`system.${transaction.pool}.value`]: transaction.from,
  };
  if (radiation) {
    actorChanges["system.radiation.dose"] = radiation.from.dose;
    actorChanges["system.radiation.at"] = radiation.from.at;
  }
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
    ...effectsPlan(transaction.effects, current.effects ?? []),
    shieldChanges: shield
      ? [{ _id: shield.itemId, "system.hpLost": shield.from.hpLost, "system.equipped": shield.from.equipped }]
      : [],
    // The note goes back so the next blow lands where this one should have,
    // unless a newer defense has left one of its own.
    shieldNote: shield && !current.shieldNote ? shield.itemId : null,
  };
}

/**
 * Which effects an undo deletes and which it puts back.
 *
 * An effect the blow added that somebody has since removed is simply gone:
 * nothing is overwritten by leaving it gone, so it is no reason to refuse. An
 * effect the blow took off comes back only where nothing now carries its
 * condition, so an undo never puts a second Stunned beside the first.
 */
function effectsPlan(
  changes: EffectChanges | undefined,
  now: Array<{ id: string; statuses: string[] }>,
): { effectsToDelete: string[]; effectsToCreate: Array<Record<string, unknown>> } {
  const ids = new Set(now.map((effect) => effect.id));
  const statuses = new Set(now.flatMap((effect) => effect.statuses));
  return {
    effectsToDelete: (changes?.added ?? []).filter((id) => ids.has(id)),
    effectsToCreate: (changes?.removed ?? []).filter((data) => {
      if (ids.has(String(data._id ?? ""))) return false;
      const carried = Array.isArray(data.statuses) ? (data.statuses as unknown[]).map(String) : [];
      return !carried.some((status) => statuses.has(status));
    }),
  };
}

/** The flag on an applied-damage card listing the victims whose damage was undone. */
export const DAMAGE_UNDONE_FLAG = "damageUndone";

/**
 * The actors whose damage a card has undone, by uuid. The rolls the card
 * offered them -- knockdown, consciousness, death -- went with the wound.
 */
export function undoneOn(message: any): Set<string> {
  const stored = message?.getFlag?.(SYSTEM_ID, DAMAGE_UNDONE_FLAG);
  return new Set(Array.isArray(stored) ? stored.map(String) : []);
}

/** Whether a transaction still describes something worth offering to undo. */
export function isUndoable(transaction: DamageTransaction | null | undefined): boolean {
  if (!transaction) return false;
  if (transaction.from !== transaction.to) return true;
  if (transaction.aim) return true;
  if (transaction.radiation || transaction.shield) return true;
  if ((transaction.effects?.added.length ?? 0) > 0 || (transaction.effects?.removed.length ?? 0) > 0) return true;
  return (transaction.armor ?? []).some((piece) => piece.from !== piece.to);
}

/** What a blow may change on its victim besides the pool and armour, read before and after it. */
export interface SideEffectSnapshot {
  /** The actor's own effects, by id, as data. */
  effects: Record<string, Record<string, unknown>>;
  radiation: RadiationDose;
  /** The shield a pending note names, and its state. */
  shieldNote: string | null;
  shield: ShieldState | null;
}

/**
 * Reads what a blow may change besides the pool, so it can be compared
 * afterwards. `shieldId` names the shield to read where the note no longer
 * does: after the blow has spent it.
 */
export function sideEffectSnapshot(actor: any, shieldId: string | null = null): SideEffectSnapshot {
  const effects: Record<string, Record<string, unknown>> = {};
  for (const effect of actor?.effects ?? []) {
    if (!effect?.id) continue;
    effects[String(effect.id)] = typeof effect.toObject === "function" ? effect.toObject() : { ...effect };
  }
  const noted = actor?.getFlag?.(SYSTEM_ID, SHIELD_NOTE_FLAG);
  const shieldNote = noted ? String(noted) : null;
  const item = actor?.items?.get?.(shieldId ?? shieldNote ?? "");
  return {
    effects,
    radiation: {
      dose: Number(actor?.system?.radiation?.dose) || 0,
      at: Number(actor?.system?.radiation?.at) || 0,
    },
    shieldNote,
    shield: item ? { hpLost: Number(item.system?.hpLost) || 0, equipped: item.system?.equipped !== false } : null,
  };
}

/**
 * What a blow changed besides the pool and armour, from the snapshots either
 * side of it: effects created and deleted, a dose, and a shield it went into.
 */
export function sideEffectsBetween(
  before: SideEffectSnapshot,
  after: SideEffectSnapshot,
): Pick<DamageTransaction, "effects" | "radiation" | "shield"> {
  const added = Object.keys(after.effects).filter((id) => !(id in before.effects));
  const removed = Object.keys(before.effects).filter((id) => !(id in after.effects)).map((id) => before.effects[id]!);
  const dosed = before.radiation.dose !== after.radiation.dose || before.radiation.at !== after.radiation.at;
  // The note is spent by the blow that goes into the shield, and that is the
  // only way a card's blow reaches one.
  const shielded = before.shieldNote && !after.shieldNote && before.shield
    ? { itemId: before.shieldNote, from: before.shield, to: after.shield ?? before.shield }
    : null;
  return {
    effects: { added, removed },
    radiation: dosed ? { from: before.radiation, to: after.radiation } : null,
    shield: shielded,
  };
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
  const snapshot = sideEffectSnapshot(actor, transaction.shield?.itemId ?? null);
  const armor: Record<string, number> = {};
  for (const piece of transaction.armor ?? []) {
    const item = actor.items?.get?.(piece.itemId);
    if (!item) continue;
    armor[piece.itemId] = Number(item.system?.drLost ?? 0) || 0;
  }
  return {
    pool: Number(actor.system?.[transaction.pool]?.value) || 0,
    armor,
    effects: Object.entries(snapshot.effects).map(([id, data]) => ({
      id,
      statuses: Array.isArray(data.statuses) ? (data.statuses as unknown[]).map(String) : [],
    })),
    radiationDose: snapshot.radiation.dose,
    shield: transaction.shield ? snapshot.shield : null,
    shieldNote: snapshot.shieldNote,
  };
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

  // The blow's conditions come off before the pool goes back, so nothing that
  // listens to the pool sees them standing on a body that is whole again.
  if (plan.effectsToDelete.length > 0) {
    await actor.deleteEmbeddedDocuments?.("ActiveEffect", plan.effectsToDelete);
  }
  await actor.update(plan.actorChanges);
  const items = [...plan.armorChanges, ...plan.shieldChanges];
  if (items.length > 0) await actor.updateEmbeddedDocuments?.("Item", items);
  if (plan.effectsToCreate.length > 0) {
    await actor.createEmbeddedDocuments?.("ActiveEffect", plan.effectsToCreate, { keepId: true });
  }
  if (plan.shieldNote) await actor.setFlag?.(SYSTEM_ID, SHIELD_NOTE_FLAG, plan.shieldNote);
  // The pool decides reeling and dead, so they follow what has come back.
  await syncHealthConditions(actor);
  return { ok: true, actorName };
}
