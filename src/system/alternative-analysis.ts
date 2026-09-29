/**
 * Reads a character's traits for their alternative sets and point-powered
 * abilities (Basic Set Revised pp. 324-325). Kept apart from the sheet
 * actions so the actor's data model can import it.
 */

import {
  alternativeBilling,
  alternativeSets,
  alternativeUsable,
  type AlternativeMember,
  type AlternativeSet,
} from "../rules/alternative-abilities.js";

/** A trait as one of a set's members, at full price. */
export function memberOf(item: any): AlternativeMember {
  const system = item.system ?? {};
  const attacks = (system.meleeModes?.length ?? 0) + (system.rangedModes?.length ?? 0) > 0;
  return {
    id: String(item.id),
    group: String(system.alternativeGroup ?? ""),
    slots: Number(system.alternativeSlots ?? 1) || 1,
    // What the ability costs on its own, before the set makes it a fifth.
    cost: Number(system.totalPoints ?? system.points ?? 0) || 0,
    active: system.alternativeActive === true,
    disabled: system.alternativeDisabled === true,
    frozen: system.alternativeFrozen === true,
    attack: attacks,
  };
}

/** What a character's sets look like: the bill of each ability, the sets, and the traits that are inert. */
export interface AlternativeAnalysis {
  members: AlternativeMember[];
  sets: AlternativeSet[];
  /** What each ability of a set is billed, by item id. */
  billed: Map<string, number>;
  /** Trait ids whose effects don't count, with the reason. */
  inert: Map<string, "off" | "disabled" | "unpowered">;
}

/** Reads a character's trait items for their alternative sets and point-powered abilities. */
export function analyseAlternatives(items: readonly any[]): AlternativeAnalysis {
  const members = items.map(memberOf);
  const sets = alternativeSets(members);
  const billed = alternativeBilling(members);
  const inert = new Map<string, "off" | "disabled" | "unpowered">();
  items.forEach((item, i) => {
    const member = members[i]!;
    if (member.group.trim() && !alternativeUsable(member, sets)) {
      inert.set(member.id, sets.find((s) => s.members.includes(member.id))?.disabled ? "disabled" : "off");
    } else if (item.system?.pointPowered === true && item.system?.pointPoweredActive !== true) {
      inert.set(member.id, "unpowered");
    }
  });
  return { members, sets, billed, inert };
}

