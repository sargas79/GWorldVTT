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

import { vehicleDrLabel } from "../../rules/vehicle-combat.js";

/** One figure of the row: its column heading and its value. */
export interface StatLine {
  label: string;
  value: string;
  /**
   * True where the value is words rather than a figure.
   *
   * The panel sets a figure in the condensed display face, which is right for
   * "DR 4" and wrong for "Armor-piercing hard core" or a calibre like
   * "7.62mmS", where telling similar letterforms apart is the whole job.
   */
  words?: boolean;
}

/** A group of figures: the armour, the shield, the vehicle, the rounds. */
export interface StatBlock {
  key: string;
  title: string;
  lines: StatLine[];
}

/**
 * A weapon table, laid out as the book's and as a character sheet prints
 * it: one row per attack mode under the table's column headings. Ranged:
 * Mode, Damage, Acc, Range, RoF, Shots, Lvl, ST, Bulk, Rcl, Notes. Melee:
 * Mode, Damage, Reach, Parry, Lvl, ST, Notes.
 */
export interface WeaponTable {
  key: "ranged" | "melee";
  title: string;
  columns: string[];
  rows: string[][];
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
  scopeFixed?: boolean;
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
  /** A shield's DR and HP as an object, once modules have had their say; its own fields where absent. */
  objectStats?: { dr: number; hp: number } | null;
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

/** The table's dash for a column the row has nothing in. */
const DASH = "–";

const levelCell = (attack: GearAttack): string => {
  const level = attack.skillLevel;
  return level === null || level === undefined || !Number.isFinite(Number(level)) ? DASH : String(level);
};

/** The ST column: the figure with its marks, † for two hands and R, B or M for how a firearm is braced. */
const stCell = (attack: GearAttack, mode: Record<string, any>): string => {
  const minSt = number(attack.minSt);
  if (minSt === null || minSt <= 0) return DASH;
  const mount = MOUNT_MARKS[String(mode.mount ?? "")] ?? "";
  return `${minSt}${stMark(attack)}${mount}`;
};

/** A melee mode's row: Mode, Damage, Reach, Parry, Lvl, ST, Notes (Characters p. 271). */
function meleeRow(attack: GearAttack, mode: Record<string, any>, L: Localize): string[] {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const parry = attack.parry === null || attack.parry === undefined
    ? S("NoParry")
    : `${attack.parry}${attack.unbalanced ? "U" : ""}${attack.isFencing ? "F" : ""}`;
  // The skill is the Lvl column's business; the notes are the table's marks.
  return [attack.mode || S("Melee"), damageLine(attack), attack.reach || DASH, parry, levelCell(attack), stCell(attack, mode), ""];
}

/** A ranged mode's row: Mode, Damage, Acc, Range, RoF, Shots, Lvl, ST, Bulk, Rcl, Notes (Characters p. 270). */
function rangedRow(attack: GearAttack, mode: Record<string, any>, L: Localize): string[] {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const accuracy = number(attack.accuracy);
  const scope = number(attack.scopeBonus);
  const acc = accuracy === null ? DASH : `${accuracy}${scope ? `+${scope}` : ""}`;
  const rof = number(attack.rateOfFire);
  const projectiles = number(attack.projectiles) ?? 1;
  const rofCell = rof === null || rof <= 0 ? DASH : `${rof}${projectiles > 1 ? `×${projectiles}` : ""}`;
  const shots = String(attack.shots ?? "").trim() || DASH;
  const bulk = number(attack.bulk);
  const recoil = number(attack.recoil);

  const notes: string[] = [];
  const capacity = number(attack.shotsCapacity) ?? 0;
  if (scope && attack.scopeFixed) notes.push(S("FixedScope"));
  if (capacity > 0) notes.push(S("LoadedNote").replace("{loaded}", String(number(attack.shotsLoaded) ?? 0)).replace("{capacity}", String(capacity)));
  const ammunition = String(attack.ammunition ?? mode.ammunition ?? "");
  if (ammunition) notes.push(L(`GWORLD.Ammunition.${ammunition}`));
  if (attack.malfunction !== null && attack.malfunction !== undefined) notes.push(`${S("Malf")} ${attack.malfunction}`);
  const weaponSt = number(mode.weaponSt);
  if (weaponSt !== null && weaponSt > 0) notes.push(`${S("WeaponSt")} ${weaponSt}`);
  const reloadWeight = number(mode.reloadWeight);
  if (reloadWeight !== null && reloadWeight > 0) notes.push(`${S("ReloadWeight")} ${figure(reloadWeight)} lb`);

  return [
    attack.mode || S("Ranged"),
    damageLine(attack),
    acc,
    attack.range || DASH,
    rofCell,
    shots,
    levelCell(attack),
    stCell(attack, mode),
    bulk === null || bulk === 0 ? DASH : String(bulk),
    recoil === null || recoil <= 0 ? DASH : String(recoil),
    notes.join("; "),
  ];
}

/** One weapon's place in a sheet-wide table: its name, and its rows. */
export interface WeaponTableGroup {
  name: string;
  /** A weapon with one mode is one row, named for the weapon; with several, the name heads the modes. */
  single: boolean;
  rows: string[][];
}

/** A sheet-wide weapon table: the columns, and every carried weapon under them. */
export interface SheetWeaponTable {
  key: "ranged" | "melee";
  title: string;
  columns: string[];
  groups: WeaponTableGroup[];
}

/**
 * The sheet's weapon tables, as a character sheet prints them: every carried
 * weapon's modes under one set of column headings, a weapon with one mode as
 * a row named for the weapon and one with several as a heading over its
 * modes. Melee first, then ranged; a table nobody's weapon fills is left out.
 */
export function weaponTablesOf(items: ReadonlyArray<{ name: string; tables: readonly WeaponTable[] }>): SheetWeaponTable[] {
  const out: SheetWeaponTable[] = [];
  for (const key of ["melee", "ranged"] as const) {
    const groups: WeaponTableGroup[] = [];
    let columns: string[] = [];
    let title = "";
    for (const item of items) {
      const table = item.tables.find((t) => t.key === key);
      if (!table || table.rows.length === 0) continue;
      columns = table.columns;
      title = table.title;
      const single = table.rows.length === 1;
      groups.push({
        name: item.name,
        single,
        rows: single ? [[item.name, ...table.rows[0]!.slice(1)]] : table.rows,
      });
    }
    if (groups.length) out.push({ key, title, columns, groups });
  }
  return out;
}

/** The two weapon tables an item's modes fill, leaving out an empty one. */
function weaponTables(system: Record<string, any>, attacks: readonly GearAttack[], L: Localize): WeaponTable[] {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const C = (key: string) => L(`GWORLD.Column.${key}`);
  const rangedModes: Array<Record<string, any>> = Array.isArray(system.rangedModes) ? system.rangedModes : [];
  const meleeModes: Array<Record<string, any>> = Array.isArray(system.meleeModes) ? system.meleeModes : [];
  const ranged = attacks.filter((a) => a.ranged).map((a, i) => rangedRow(a, rangedModes[a.modeIndex ?? i] ?? {}, L));
  const melee = attacks.filter((a) => !a.ranged).map((a, i) => meleeRow(a, meleeModes[a.modeIndex ?? i] ?? {}, L));
  const tables: WeaponTable[] = [];
  if (melee.length) {
    tables.push({ key: "melee", title: S("MeleeAttacks"), columns: [S("Mode"), C("Damage"), C("Reach"), L("GWORLD.Secondary.Parry"), S("Lvl"), S("ST"), C("Notes")], rows: melee });
  }
  if (ranged.length) {
    tables.push({ key: "ranged", title: S("RangedAttacks"), columns: [S("Mode"), C("Damage"), C("Acc"), C("Range"), C("RoF"), C("Shots"), S("Lvl"), S("ST"), S("Bulk"), S("Rcl"), C("Notes")], rows: ranged });
  }
  return tables;
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
function shieldBlock(system: Record<string, any>, L: Localize, stats?: { dr: number; hp: number } | null): StatBlock {
  const S = (key: string) => L(`GWORLD.SheetV2.Stat.${key}`);
  const lines: StatLine[] = [{ label: S("DB"), value: String(number(system.db) ?? 0) }];
  const dr = stats ? stats.dr : number(system.dr);
  if (dr !== null && dr > 0) lines.push({ label: L("GWORLD.Column.DR"), value: String(dr) });
  const hp = stats ? stats.hp : number(system.hp);
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
    { label: L("GWORLD.Column.DR"), value: vehicleDrLabel({ dr: number(vehicle.dr) ?? 0, drOther: number(vehicle.drOther) }) },
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
      { label: L("GWORLD.Ammunition.Kind"), value: L(`GWORLD.Ammunition.${kind || "none"}`), words: true },
      { label: L("GWORLD.Ammunition.Fits"), value: fits || S("FitsAnything"), words: true },
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
 * What a piece of gear's panel prints: the weapon tables its modes fill,
 * one row each; then the armour, shield, vehicle or ammunition figures; and
 * the item's own lines apart.
 */
export function gearStatistics(item: GearItemLike, attacks: readonly GearAttack[], L: Localize): { tables: WeaponTable[]; blocks: StatBlock[]; lines: StatLine[] } {
  const system = item.system ?? {};
  const blocks: StatBlock[] = [];
  const tables = weaponTables(system, attacks, L);

  if (item.type === "equipment" && system.category === "ammunition") blocks.push(ammunitionBlock(system, L));
  if (item.type === "armor") blocks.push(armorBlock(system, L));
  if (item.type === "shield") blocks.push(shieldBlock(system, L, item.objectStats));
  if (item.type === "equipment" && system.category === "vehicle" && system.vehicle) blocks.push(vehicleBlock(system.vehicle, L));

  return { tables, blocks, lines: generalLines(item, L) };
}
