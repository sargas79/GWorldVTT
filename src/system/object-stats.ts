/**
 * What a weapon or shield is as an object (GURPS Basic Set: Campaigns
 * pp. 483-484): its DR, HP and HT, worked out in one place and offered to the
 * modules through `gworld.objectStats`.
 */

import { settleObjectStats, weaponObjectStats, type ObjectStats } from "../rules/breakage.js";
import { weaponClassOf, type WeaponClass, type WeaponMaterial } from "../rules/weapon-quality.js";
import type { DamageType } from "../rules/types.js";
import { DATA_HOOKS, effectiveWeight } from "./data-extensions.js";

/** A weapon's or shield's DR, HP and HT as an object, and what modules said about them. */
export interface ItemObjectStats extends ObjectStats {
  notes: string[];
}

/** What an item is made of and how it is used, which its object stats are read from. */
export interface WeaponMake {
  material: WeaponMaterial;
  skill: string;
  firearm: boolean;
  weight: number;
}

/** The modes, skills and class of an equipment or shield item. */
export function weaponMakeOf(item: any) {
  const sys = item?.system ?? {};
  const melee: any[] = sys.meleeModes ?? [];
  const ranged: any[] = sys.rangedModes ?? [];
  const modes = [...melee, ...ranged];
  const skills = modes.map((m) => String(m.skill ?? ""));
  const types = modes.map((m) => String(m.damageType ?? "")) as DamageType[];
  const material = String(sys.material ?? "") as WeaponMaterial;
  const weaponClass = (String(sys.weaponClass ?? "") ||
    weaponClassOf({
      skills,
      damageTypes: types,
      hasMalfunction: ranged.some((m) => m.malfunction),
      isFencing: melee.some((m) => m.isFencing),
    })) as WeaponClass;
  const firearm = weaponClass === "firearm";
  const weight = effectiveWeight(item);
  return { melee, ranged, skills, types, material, weaponClass, firearm, weight, skill: skills[0] ?? "" };
}

/**
 * A weapon's or shield's DR, HP and HT as an object (Campaigns pp. 483-484),
 * and the one place they are worked out: breakage, striking at a weapon,
 * shield damage, repairs and the sheets all read them from here.
 *
 * A shield's DR and HP are the table's own (Characters p. 287); a weapon's
 * come from its weight and what it is made of (Campaigns p. 483). Modules
 * then have their say through `gworld.objectStats` -- a rugged gun, a cheap
 * one, a reinforced case -- with `{ item, actor, kind, dr, hp, ht, notes }`.
 * A listener that throws changes nothing.
 *
 * `make` is what the caller already knows about the item, to save reading it
 * again.
 */
export function objectStats(item: any, make: WeaponMake = weaponMakeOf(item)): ItemObjectStats {
  const sys = item?.system ?? {};
  const base = weaponObjectStats({
    material: make.material,
    skill: make.skill,
    firearm: make.firearm,
    weightLbs: make.weight,
    ...(item?.type === "shield" ? { shield: { dr: Number(sys.dr ?? 0) || 0, hp: Number(sys.hp ?? 0) || 0 } } : {}),
  });
  const context = { item, actor: item?.actor ?? null, kind: base.kind, dr: base.dr, hp: base.hp, ht: base.ht, notes: [] as string[] };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.objectStats, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.objectStats} listener failed`, error);
    return { ...base, notes: [] };
  }
  return settleObjectStats(base, context);
}
