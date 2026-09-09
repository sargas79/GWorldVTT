/**
 * The character Actor data model (GURPS Lite pp. 4-8).
 *
 * All derived values come from the pure rules engine; this class declares the
 * persisted schema and distributes the engine's outputs across the actor and
 * its embedded items.
 */

import { secondaryCharacteristics } from "../../rules/attributes.js";
import { baseParry, block, dodge, parry } from "../../rules/defenses.js";
import { encumbranceState } from "../../rules/encumbrance.js";
import { swingDamage, thrustDamage, weaponDamage } from "../../rules/damage.js";
import { formatDiceAdds, parseDiceAdds } from "../../rules/dice.js";
import { halveForReeling, healthStatus, isReeling } from "../../rules/injury.js";
import { effectiveSkillLevel, relativeLevelForPoints } from "../../rules/skills.js";
import { musclePoweredRange } from "../../rules/ranged.js";
import type { Attribute, DamageType, Difficulty, EncumbranceLevel, Posture } from "../../rules/types.js";

const fields = foundry.data.fields;

function attributeField(label: string) {
  return new fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial: 10,
    min: 1,
    label,
  });
}

function poolField() {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
    max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
  });
}

/** A resolved attack mode, ready for the Combat tab to render. */
export interface DerivedAttack {
  itemId: string;
  modeIndex: number;
  name: string;
  mode: string;
  skillName: string;
  skillLevel: number | null;
  damage: string;
  damageType: DamageType;
  reach: string;
  parry: number | null;
  minSt: number | null;
  /** Ranged only. */
  accuracy?: number;
  range?: string;
  rateOfFire?: number;
  shots?: string;
}

interface DefenseView {
  total: number;
  source: string;
  math: string;
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  declare attributes: { ST: number; DX: number; IQ: number; HT: number };
  declare bonuses: {
    hp: number; will: number; per: number; fp: number;
    basicSpeed: number; basicMove: number; dodge: number;
  };
  declare hp: { value: number; max: number };
  declare fp: { value: number; max: number };
  declare points: { starting: number; disadvantageLimit: number };
  declare tl: number;
  declare posture: Posture;
  declare conditions: { stunned: boolean; allOutDefense: boolean; blindToAttacker: boolean };
  declare details: {
    player: string; height: string; weight: string; age: string;
    appearance: string; biography: string; notes: string;
  };

  declare derived: ReturnType<CharacterData["buildDerived"]>;

  static override defineSchema() {
    return {
      attributes: new fields.SchemaField({
        ST: attributeField("GWORLD.Attribute.ST"),
        DX: attributeField("GWORLD.Attribute.DX"),
        IQ: attributeField("GWORLD.Attribute.IQ"),
        HT: attributeField("GWORLD.Attribute.HT"),
      }),

      // GURPS Lite ties every secondary characteristic to an attribute. These
      // bonuses let racial templates and GM rulings shift them without a
      // schema migration.
      bonuses: new fields.SchemaField({
        hp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        will: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        per: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        fp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        basicSpeed: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
        basicMove: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        dodge: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),

      hp: poolField(),
      fp: poolField(),

      points: new fields.SchemaField({
        starting: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 150 }),
        // A rule of thumb, not a hard cap (GURPS Lite p. 4).
        disadvantageLimit: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 75 }),
      }),

      tl: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 3 }),

      posture: new fields.StringField({
        required: true,
        nullable: false,
        initial: "standing",
        choices: ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"],
      }),

      conditions: new fields.SchemaField({
        stunned: new fields.BooleanField({ initial: false }),
        allOutDefense: new fields.BooleanField({ initial: false }),
        blindToAttacker: new fields.BooleanField({ initial: false }),
      }),

      details: new fields.SchemaField({
        player: new fields.StringField({ required: true, blank: true, initial: "" }),
        height: new fields.StringField({ required: true, blank: true, initial: "" }),
        weight: new fields.StringField({ required: true, blank: true, initial: "" }),
        age: new fields.StringField({ required: true, blank: true, initial: "" }),
        appearance: new fields.StringField({ required: true, blank: true, initial: "" }),
        biography: new fields.HTMLField({ required: true, blank: true, initial: "" }),
        notes: new fields.HTMLField({ required: true, blank: true, initial: "" }),
      }),
    };
  }

  /** Embedded items on the owning Actor, or an empty list when unparented. */
  private get items(): Array<Record<string, any>> {
    const actor = this.parent as { items?: Iterable<Record<string, any>> } | null;
    return actor?.items ? [...actor.items] : [];
  }

  private itemsOfType(type: string): Array<Record<string, any>> {
    return this.items.filter((i) => i.type === type);
  }

  /** The score of a skill by name, or null when the character lacks it. */
  private skillLevelByName(name: string): number | null {
    if (!name) return null;
    const wanted = name.trim().toLowerCase();
    for (const item of this.itemsOfType("skill")) {
      if (String(item.name).trim().toLowerCase() === wanted) {
        return item.system?.derived?.level ?? null;
      }
    }
    return null;
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    this.derived = this.buildDerived();
  }

  private buildDerived() {
    const attrs = this.attributes;

    const secondary = secondaryCharacteristics(attrs, {
      hp: this.bonuses.hp,
      will: this.bonuses.will,
      per: this.bonuses.per,
      fp: this.bonuses.fp,
      basicSpeed: this.bonuses.basicSpeed,
      basicMove: this.bonuses.basicMove,
    });

    this.hp.max = secondary.hp;
    this.fp.max = secondary.fp;

    // ── skills ──────────────────────────────────────────────────────────
    // Resolved here rather than on the item, because a skill's absolute level
    // needs the owning actor's attributes.
    const attributeScore = (a: Attribute) => attrs[a];
    for (const item of this.itemsOfType("skill")) {
      const sys = item.system as {
        attribute: Attribute; difficulty: Difficulty; points: number; bonus: number;
        defaults?: Array<{ attribute: Attribute; modifier: number }>;
        derived?: Record<string, unknown>;
      };
      const defaults = (sys.defaults ?? []).map(
        (d) => attributeScore(d.attribute) + d.modifier,
      );
      const resolved = effectiveSkillLevel({
        attributeScore: attributeScore(sys.attribute),
        difficulty: sys.difficulty,
        points: sys.points,
        bonus: sys.bonus,
        defaults,
      });
      sys.derived = {
        level: resolved?.level ?? null,
        fromDefault: resolved?.fromDefault ?? true,
        relativeLevel: relativeLevelForPoints(sys.points, sys.difficulty),
        hasDefault: defaults.length > 0,
      };
    }

    // ── protection ──────────────────────────────────────────────────────
    let dr = 0;
    const armorItems = this.itemsOfType("armor").filter((i) => i.system?.equipped);
    for (const item of armorItems) dr += Number(item.system?.dr ?? 0);

    const shieldItem = this.itemsOfType("shield").find((i) => i.system?.equipped) ?? null;
    const shieldDb = shieldItem ? Number(shieldItem.system?.db ?? 0) : 0;
    const shieldSkill = shieldItem ? this.skillLevelByName(shieldItem.system?.skill ?? "Shield") : null;

    // ── encumbrance ─────────────────────────────────────────────────────
    let carriedWeight = 0;
    for (const item of this.items) {
      const sys = item.system as { weight?: number; quantity?: number; carried?: boolean };
      if (sys?.carried === false || sys?.weight === undefined) continue;
      const w = Number(sys.weight ?? 0);
      const q = Number(sys.quantity ?? 1);
      if (Number.isFinite(w) && Number.isFinite(q)) carriedWeight += w * q;
    }
    const encumbrance = encumbranceState(carriedWeight, secondary.basicLift, secondary.basicMove);
    const reeling = isReeling(this.hp.value, this.hp.max);

    // ── attacks ─────────────────────────────────────────────────────────
    const melee: DerivedAttack[] = [];
    const ranged: DerivedAttack[] = [];

    const resolveDamage = (
      base: "thr" | "sw" | "fixed",
      modifier: number,
      formula: string,
      minSt: number | null,
    ): string => {
      if (base === "fixed") {
        const parsed = parseDiceAdds(formula);
        return parsed ? formatDiceAdds(parsed) : formula || "—";
      }
      return formatDiceAdds(weaponDamage(attrs.ST, base, modifier, minSt));
    };

    for (const item of this.itemsOfType("equipment")) {
      const sys = item.system as {
        meleeModes?: any[]; rangedModes?: any[]; equipped?: boolean;
      };

      (sys.meleeModes ?? []).forEach((mode: any, index: number) => {
        const skillLevel = this.skillLevelByName(mode.skill);
        melee.push({
          itemId: item.id,
          modeIndex: index,
          name: item.name,
          mode: mode.name ?? "",
          skillName: mode.skill ?? "",
          skillLevel,
          damage: resolveDamage(mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt),
          damageType: mode.damageType,
          reach: mode.reach ?? "C",
          parry:
            mode.canParry && skillLevel !== null
              ? baseParry(skillLevel) + (mode.parryModifier ?? 0)
              : null,
          minSt: mode.minSt ?? null,
        });
      });

      (sys.rangedModes ?? []).forEach((mode: any, index: number) => {
        // Bows and crossbows use their own ST for damage and range.
        const st = mode.weaponSt ?? attrs.ST;
        const range = mode.rangeIsStMultiple
          ? musclePoweredRange(st, mode.halfDamageRange, mode.maxRange)
          : { halfDamage: mode.halfDamageRange, max: mode.maxRange };

        ranged.push({
          itemId: item.id,
          modeIndex: index,
          name: item.name,
          mode: mode.name ?? "",
          skillName: mode.skill ?? "",
          skillLevel: this.skillLevelByName(mode.skill),
          damage: resolveDamage(mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt),
          damageType: mode.damageType,
          reach: "",
          parry: null,
          minSt: mode.minSt ?? null,
          accuracy: mode.accuracy ?? 0,
          range: range.halfDamage ? `${range.halfDamage} / ${range.max}` : String(range.max),
          rateOfFire: mode.rateOfFire ?? 1,
          shots: mode.shots ?? "",
        });
      });
    }

    // ── active defenses ─────────────────────────────────────────────────
    const defenseContext = {
      shieldDb,
      posture: this.posture,
      stunned: this.conditions.stunned,
      allOutDefenseIncreased: this.conditions.allOutDefense,
      cannotSeeAttacker: this.conditions.blindToAttacker,
    };

    const describe = (base: number, mods: Array<{ label: string; value: number }>): string =>
      [`${base} base`, ...mods.map((m) => `${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${m.label}`)].join(
        " ",
      );

    const dodgeResult = dodge(secondary.basicSpeed, {
      ...defenseContext,
      encumbrance: encumbrance.level as EncumbranceLevel,
      reeling,
    });

    // The best parry available across every equipped melee mode.
    const bestParry = melee.reduce<DerivedAttack | null>(
      (best, atk) => (atk.parry !== null && (best === null || atk.parry > (best.parry ?? -Infinity)) ? atk : best),
      null,
    );
    const parryResult =
      bestParry && bestParry.skillLevel !== null
        ? parry(bestParry.skillLevel, defenseContext)
        : null;

    const blockResult = shieldSkill !== null ? block(shieldSkill, defenseContext) : null;

    const defenses: { dodge: DefenseView; parry: DefenseView | null; block: DefenseView | null } = {
      dodge: {
        total: Math.max(1, dodgeResult.total + this.bonuses.dodge),
        source: `Basic Speed ${secondary.basicSpeed.toFixed(2)}`,
        math: describe(dodgeResult.base, dodgeResult.modifiers),
      },
      parry:
        parryResult && bestParry
          ? {
              total: parryResult.total,
              source: `${bestParry.skillName} ${bestParry.skillLevel}`,
              math: describe(parryResult.base, parryResult.modifiers),
            }
          : null,
      block:
        blockResult && shieldItem
          ? {
              total: blockResult.total,
              source: `${shieldItem.system?.skill ?? "Shield"} ${shieldSkill}`,
              math: describe(blockResult.base, blockResult.modifiers),
            }
          : null,
    };

    // ── points ledger ───────────────────────────────────────────────────
    const sumTraits = (category: string) =>
      this.itemsOfType("trait")
        .filter((i) => i.system?.category === category)
        .reduce((sum, i) => sum + (i.system?.totalPoints ?? i.system?.points ?? 0), 0);

    const attributePoints =
      (attrs.ST - 10) * 10 + (attrs.HT - 10) * 10 + (attrs.DX - 10) * 20 + (attrs.IQ - 10) * 20;
    const advantages = sumTraits("advantage") + sumTraits("perk");
    const disadvantages = sumTraits("disadvantage");
    const quirks = sumTraits("quirk");
    const skillPoints = this.itemsOfType("skill").reduce(
      (sum, i) => sum + Number(i.system?.points ?? 0),
      0,
    );
    const languagePoints = this.itemsOfType("language").reduce(
      (sum, i) => sum + Number(i.system?.totalPoints ?? 0),
      0,
    );

    const spent =
      attributePoints + advantages + disadvantages + quirks + skillPoints + languagePoints;

    return {
      will: secondary.will,
      per: secondary.per,
      basicLift: secondary.basicLift,
      basicSpeed: secondary.basicSpeed,
      basicMove: secondary.basicMove,
      move: reeling ? halveForReeling(encumbrance.move) : encumbrance.move,
      thrust: formatDiceAdds(thrustDamage(attrs.ST)),
      swing: formatDiceAdds(swingDamage(attrs.ST)),
      dr,
      shieldDb,
      shieldName: shieldItem?.name ?? null,
      armorName: armorItems[0]?.name ?? null,
      defenses,
      melee,
      ranged,
      encumbrance,
      status: healthStatus(this.hp.value, this.hp.max),
      reeling,
      points: {
        attributes: attributePoints,
        advantages,
        disadvantages,
        quirks,
        skills: skillPoints,
        languages: languagePoints,
        spent,
        starting: this.points.starting,
        remaining: this.points.starting - spent,
        // Disadvantages and quirks both count toward the campaign limit.
        disadvantageTotal: Math.abs(disadvantages + quirks),
        disadvantageLimit: this.points.disadvantageLimit,
      },
    };
  }
}
