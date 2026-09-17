/**
 * A piece of gear's table row, as its detail panel prints it.
 *
 * The book describes a weapon by its row on the weapon table (GURPS Basic
 * Set: Characters pp. 271-281) and armour by its row on the armour table
 * (pp. 282-285): damage, reach and parry; accuracy, range, rate of fire,
 * shots, bulk and recoil; DR and what it covers. A player looking at their
 * gun wants that row, not the price and a paragraph. Every figure here is
 * one the item already carries or the sheet has already worked out for its
 * attack; nothing is invented, and a figure the item does not have is left
 * out rather than printed as a zero.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

/** One figure of the row: its column heading and its value. */
export interface StatLine {
  label: string;
  value: string;
}

/** A group of figures: one attack mode, the armour, the vehicle, or the item itself. */
export interface StatBlock {
  key: string;
  title: string;
  lines: StatLine[];
}

/** Localises a key, formatting it with data when there is any. */
export type Localize = (key: string, data?: Record<string, unknown>) => string;

/**
 * What the sheet has worked out for one attack mode of the item, as
 * `derived.melee` and `derived.ranged` carry it.
 */
export interface GearAttack {
  ranged: boolean;
  mode?: string;
  modeIndex?: number;
  skillName?: string;
  skillLevel?: number | null;
  damage: string;
  damageType: string;
  armorDivisor?: number;
  reach?: string;
  parry?: number | null;
  unbalanced?: boolean;
  isFencing?: boolean;
  minSt?: number | null;
  twoHanded?: boolean;
  readiesAfterAttack?: boolean;
  accuracy?: number;
  scopeBonus?: number;
  range?: string;
  rateOfFire?: number;
  projectiles?: number;
  shots?: string;
  shotsLoaded?: number;
  shotsCapacity?: number;
  reloadSeconds?: number | null;
  bulk?: number;
  recoil?: number;
  malfunction?: number | null;
  ammunition?: string;
}

/** The item itself: its type and its stored fields. */
export interface GearItemLike {
  type: string;
  system?: Record<string, any> | null;
}

const number = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** A figure printed as the table prints it: whole where it is whole, else to two places. */
const figure = (value: number): string => (Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100));

/** "(2)" after a damage that has an armour divisor other than one. */
const divisor = (value: unknown): string => {
  const n = number(value);
  return n !== null && n !== 1 && n > 0 ? ` (${figure(n)})` : "";
};

/** The mark after a weapon's ST: † for two hands, ‡ where it also needs readying (p. 270). */
const stMark = (attack: GearAttack): string => (attack.twoHanded ? (attack.readiesAfterAttack ? "‡" : "†") : "");

/** The mark after a firearm's ST for how it is braced (p. 270): R, B or M. */
const MOUNT_MARKS: Record<string, string> = { rest: "R", bipod: "B", mounted: "M" };

function damageLine(attack: GearAttack): string {
  const type = attack.damageType ? ` ${attack.damageType}` : "";
  return `${attack.damage}${type}${divisor(attack.armorDivisor)}`;
}

function skillLine(attack: GearAttack): string | null {
  const name = String(attack.skillName ?? "").trim();
  if (!name) return null;
  const level = attack.skillLevel;
  return level === null || level === undefined || !Number.isFinite(Number(level)) ? name : `${name} ${level}`;
}

/** The melee half of the row: Damage, Reach, Parry, ST (p. 271). */
function meleeBlock(attack: GearAttack, L: Localize, index: number): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [{ label: L("GWORLD.Column.Damage"), value: damageLine(attack) }];
  if (attack.reach) lines.push({ label: L("GWORLD.Column.Reach"), value: attack.reach });
  const parry = attack.parry === null || attack.parry === undefined
    ? S("NoParry")
    : `${attack.parry}${attack.unbalanced ? "U" : ""}${attack.isFencing ? "F" : ""}`;
  lines.push({ label: L("GWORLD.Secondary.Parry"), value: parry });
  const minSt = number(attack.minSt);
  if (minSt !== null && minSt > 0) lines.push({ label: S("ST"), value: `${minSt}${stMark(attack)}` });
  const skill = skillLine(attack);
  if (skill) lines.push({ label: L("GWORLD.Column.Skill"), value: skill });
  return { key: `melee:${index}`, title: attack.mode || S("Melee"), lines };
}

/** The ranged row: Damage, Acc, Range, RoF, Shots, ST, Bulk, Rcl (p. 270). */
function rangedBlock(attack: GearAttack, mode: Record<string, any>, L: Localize, index: number): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [{ label: L("GWORLD.Column.Damage"), value: damageLine(attack) }];

  const accuracy = number(attack.accuracy);
  if (accuracy !== null) {
    const scope = number(attack.scopeBonus);
    lines.push({ label: L("GWORLD.Column.Acc"), value: `${accuracy}${scope ? `+${scope}` : ""}` });
  }
  if (attack.range) lines.push({ label: L("GWORLD.Column.Range"), value: attack.range });

  const rof = number(attack.rateOfFire);
  if (rof !== null && rof > 0) {
    const projectiles = number(attack.projectiles) ?? 1;
    lines.push({ label: L("GWORLD.Column.RoF"), value: `${rof}${projectiles > 1 ? `×${projectiles}` : ""}` });
  }

  const capacity = number(attack.shotsCapacity) ?? 0;
  if (capacity > 0) {
    const loaded = number(attack.shotsLoaded) ?? 0;
    const seconds = attack.reloadSeconds;
    lines.push({
      label: L("GWORLD.Column.Shots"),
      value: `${loaded} / ${capacity}${seconds !== null && seconds !== undefined ? ` (${seconds})` : ""}`,
    });
  } else if (attack.shots) {
    lines.push({ label: L("GWORLD.Column.Shots"), value: String(attack.shots) });
  }

  const minSt = number(attack.minSt);
  if (minSt !== null && minSt > 0) {
    const mount = MOUNT_MARKS[String(mode.mount ?? "")] ?? "";
    lines.push({ label: S("ST"), value: `${minSt}${stMark(attack)}${mount}` });
  }
  const weaponSt = number(mode.weaponSt);
  if (weaponSt !== null && weaponSt > 0) lines.push({ label: S("WeaponSt"), value: String(weaponSt) });

  const bulk = number(attack.bulk);
  if (bulk !== null && bulk !== 0) lines.push({ label: S("Bulk"), value: String(bulk) });
  const recoil = number(attack.recoil);
  if (recoil !== null && recoil > 0) lines.push({ label: S("Rcl"), value: String(recoil) });
  if (attack.malfunction !== null && attack.malfunction !== undefined) {
    lines.push({ label: S("Malf"), value: String(attack.malfunction) });
  }

  const ammunition = String(attack.ammunition ?? mode.ammunition ?? "");
  if (ammunition) lines.push({ label: L("GWORLD.Item.Ammunition"), value: L(`GWORLD.Ammunition.${ammunition}`) });
  const reloadWeight = number(mode.reloadWeight);
  if (reloadWeight !== null && reloadWeight > 0) lines.push({ label: S("ReloadWeight"), value: `${figure(reloadWeight)} lb` });

  const skill = skillLine(attack);
  if (skill) lines.push({ label: L("GWORLD.Column.Skill"), value: skill });
  return { key: `ranged:${index}`, title: attack.mode || S("Ranged"), lines };
}

/** The armour row: DR, what it covers, and the table's marks (pp. 282-285). */
function armorBlock(system: Record<string, any>, L: Localize): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [];

  const dr = number(system.dr) ?? 0;
  const split = number(system.drSplit);
  const appliesTo: string[] = Array.isArray(system.drSplitAppliesTo) ? system.drSplitAppliesTo.map(String) : [];
  const drText = split !== null && split > 0 && split !== dr
    ? `${dr}/${split}${appliesTo.length ? ` (${split} ${S("Against")} ${appliesTo.join(", ")})` : ""}`
    : String(dr);
  lines.push({ label: L("GWORLD.Column.DR"), value: drText });

  const locations: string[] = Array.isArray(system.locations) ? system.locations.map(String) : [];
  lines.push({
    label: S("Covers"),
    value: locations.length ? locations.map((key) => L(`GWORLD.HitLocation.${key}`)).join(", ") : L("GWORLD.Item.WholeBody"),
  });

  const byLocation: Array<{ locations?: unknown; dr?: unknown }> = Array.isArray(system.drByLocation) ? system.drByLocation : [];
  for (const exception of byLocation) {
    const where: string[] = Array.isArray(exception.locations) ? exception.locations.map(String) : [];
    if (!where.length) continue;
    lines.push({ label: where.map((key) => L(`GWORLD.HitLocation.${key}`)).join(", "), value: `${L("GWORLD.Column.DR")} ${number(exception.dr) ?? 0}` });
  }
  const sole = number(system.soleDr);
  if (sole !== null && sole > 0) lines.push({ label: S("SoleDr"), value: String(sole) });

  const marks: string[] = [];
  if (system.flexible) marks.push(S("Flexible"));
  if (system.frontOnly) marks.push(S("FrontOnly"));
  if (system.concealable) marks.push(S("Concealable"));
  if (system.blocksPeripheralVision) marks.push(S("NoPeripheralVision"));
  if (marks.length) lines.push({ label: L("GWORLD.Column.Notes"), value: marks.join(", ") });

  const hardened = number(system.hardened);
  if (hardened !== null && hardened > 0) lines.push({ label: S("Hardened"), value: String(hardened) });
  if (system.ablative && system.ablative !== "none") lines.push({ label: S("Ablative"), value: String(system.ablative) });
  if (system.forceField) lines.push({ label: S("ForceField"), value: S("Yes") });
  if (system.environmentSuit) lines.push({ label: S("EnvironmentSuit"), value: String(system.environmentSuit) });

  return { key: "armor", title: S("Armor"), lines };
}

/** The shield row: DB, DR and HP (Characters p. 287; Campaigns p. 484). */
function shieldBlock(system: Record<string, any>, L: Localize): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [{ label: S("DB"), value: String(number(system.db) ?? 0) }];
  const dr = number(system.dr);
  if (dr !== null && dr > 0) lines.push({ label: L("GWORLD.Column.DR"), value: String(dr) });
  const hp = number(system.hp);
  if (hp !== null && hp > 0) {
    const lost = number(system.hpLost) ?? 0;
    lines.push({ label: S("HP"), value: lost > 0 ? `${hp - lost} / ${hp}` : String(hp) });
  }
  const hardened = number(system.hardened);
  if (hardened !== null && hardened > 0) lines.push({ label: S("Hardened"), value: String(hardened) });
  return { key: "shield", title: S("Shield"), lines };
}

/** The vehicle row (Campaigns pp. 462-463). */
function vehicleBlock(vehicle: Record<string, any>, L: Localize): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [
    { label: S("StHp"), value: String(number(vehicle.stHp) ?? 0) },
    { label: S("HndSr"), value: `${number(vehicle.handling) ?? 0}/${number(vehicle.stability) ?? 0}` },
    { label: S("HT"), value: `${number(vehicle.ht) ?? 0}${vehicle.fragility ? String(vehicle.fragility) : ""}` },
    { label: S("Move"), value: `${figure(number(vehicle.acceleration) ?? 0)}/${figure(number(vehicle.topSpeed) ?? 0)}` },
    { label: S("LWt"), value: figure(number(vehicle.loadedWeight) ?? 0) },
    { label: S("Load"), value: figure(number(vehicle.load) ?? 0) },
    { label: S("SM"), value: String(number(vehicle.sm) ?? 0) },
    { label: S("Occ"), value: String(vehicle.occupants ?? "") },
    { label: L("GWORLD.Column.DR"), value: String(number(vehicle.dr) ?? 0) },
  ];
  const range = number(vehicle.range);
  if (range !== null && range > 0) lines.push({ label: L("GWORLD.Column.Range"), value: figure(range) });
  if (vehicle.skill) lines.push({ label: L("GWORLD.Column.Skill"), value: String(vehicle.skill) });
  return { key: "vehicle", title: S("Vehicle"), lines };
}

/** A box of rounds: what it fits and what a weapon fires it as (Characters p. 278). */
function ammunitionBlock(system: Record<string, any>, L: Localize): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const kind = String(system.ammunition?.kind ?? "");
  const fits = String(system.ammunition?.fits ?? "").trim();
  return {
    key: "ammunition",
    title: S("Ammunition"),
    lines: [
      { label: L("GWORLD.Ammunition.Kind"), value: L(`GWORLD.Ammunition.${kind || "none"}`) },
      { label: L("GWORLD.Ammunition.Fits"), value: fits || S("FitsAnything") },
    ],
  };
}

/** The item's own figures beside the price: TL, the grade it was bought in, and the list price it was priced from. */
function generalLines(item: GearItemLike, L: Localize): StatLine[] {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const system = item.system ?? {};
  const lines: StatLine[] = [];
  if (system.tl) lines.push({ label: L("GWORLD.Column.TechLevel"), value: String(system.tl) });

  const grade: string[] = [];
  if (system.quality && system.quality !== "good") grade.push(L(`GWORLD.Quality.${system.quality}`));
  if (system.material) grade.push(L(`GWORLD.Material.${system.material}`));
  if (system.equipmentQuality && system.equipmentQuality !== "basic") grade.push(L(`GWORLD.EquipmentQuality.${system.equipmentQuality}`));
  if (grade.length) lines.push({ label: L("GWORLD.Item.Quality"), value: grade.join(", ") });

  const cost = number(system.cost) ?? 0;
  const listCost = number(system.listCost);
  if (listCost !== null && listCost > 0 && listCost !== cost) lines.push({ label: S("ListCost"), value: `$${figure(listCost)}` });
  const weight = number(system.weight) ?? 0;
  const listWeight = number(system.listWeight);
  if (listWeight !== null && listWeight > 0 && listWeight !== weight) lines.push({ label: S("ListWeight"), value: `${figure(listWeight)} lb` });

  const living = number(system.costOfLivingPercent);
  if (living !== null && living > 0) lines.push({ label: S("CostOfLiving"), value: `${figure(living)}%` });
  return lines;
}

/**
 * The blocks a piece of gear's panel prints: one per attack mode, then the
 * armour, shield or vehicle figures, with the item's own lines apart.
 */
export function gearStatistics(item: GearItemLike, attacks: readonly GearAttack[], L: Localize): { blocks: StatBlock[]; lines: StatLine[] } {
  const system = item.system ?? {};
  const blocks: StatBlock[] = [];

  attacks.forEach((attack, index) => {
    if (attack.ranged) {
      const modes: Array<Record<string, any>> = Array.isArray(system.rangedModes) ? system.rangedModes : [];
      blocks.push(rangedBlock(attack, modes[attack.modeIndex ?? index] ?? {}, L, index));
    } else {
      blocks.push(meleeBlock(attack, L, index));
    }
  });

  if (item.type === "equipment" && system.category === "ammunition") blocks.push(ammunitionBlock(system, L));
  if (item.type === "armor") blocks.push(armorBlock(system, L));
  if (item.type === "shield") blocks.push(shieldBlock(system, L));
  if (item.type === "equipment" && system.category === "vehicle" && system.vehicle) blocks.push(vehicleBlock(system.vehicle, L));

  return { blocks, lines: generalLines(item, L) };
}
