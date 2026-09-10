/**
 * Item data models: traits, skills, and equipment (GURPS Lite pp. 8-22).
 */

import { relativeLevelForPoints } from "../../rules/skills.js";
import type { Attribute, DamageType, Difficulty } from "../../rules/types.js";

const fields = foundry.data.fields;

/** Fields shared by everything that appears in a character's inventory. */
function physicalFields() {
  return {
    quantity: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 0,
    }),
    weight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    cost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /** Carried items count towards encumbrance; stored ones do not. */
    carried: new fields.BooleanField({ initial: true }),
    equipped: new fields.BooleanField({ initial: false }),
    tl: new fields.StringField({ required: true, blank: true, initial: "" }),
  };
}

/** Fields shared by every item type. */
function descriptionFields() {
  return {
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    /** Where this item is defined in GURPS Lite, e.g. "p. 14". */
    reference: new fields.StringField({ required: true, blank: true, initial: "" }),
  };
}

/**
 * An advantage, disadvantage, quirk, or perk (GURPS Lite pp. 8-12).
 *
 * All four are the same mechanical object distinguished only by point value and
 * convention, so they share one data model.
 */
export class TraitData extends foundry.abstract.TypeDataModel {
  declare points: number;
  declare category: "advantage" | "disadvantage" | "quirk" | "perk";
  declare levels: number;
  declare pointsPerLevel: number;
  declare reactionModifier: number;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      category: new fields.StringField({
        required: true,
        nullable: false,
        initial: "advantage",
        choices: ["advantage", "disadvantage", "quirk", "perk"],
      }),
      /** Flat point cost, used when the trait has no levels. */
      points: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      /** Number of levels bought, for levelled traits such as Charisma. */
      levels: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      pointsPerLevel: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
      }),
      /** A flat modifier this trait applies to reaction rolls (GURPS Lite p. 3). */
      reactionModifier: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
      }),
    };
  }

  /** Total character points this trait costs, counting levels. */
  get totalPoints(): number {
    return this.points + this.levels * this.pointsPerLevel;
  }
}

/** A skill (GURPS Lite pp. 12-17). */
export class SkillData extends foundry.abstract.TypeDataModel {
  declare attribute: Attribute;
  declare difficulty: Difficulty;
  declare points: number;
  declare bonus: number;
  declare defaults: Array<{ attribute: Attribute; modifier: number }>;
  declare techLevel: string;
  declare derived: { level: number | null; relativeLevel: number | null; fromDefault: boolean };

  static override defineSchema() {
    return {
      ...descriptionFields(),
      attribute: new fields.StringField({
        required: true,
        nullable: false,
        initial: "DX",
        choices: ["ST", "DX", "IQ", "HT"],
      }),
      difficulty: new fields.StringField({
        required: true,
        nullable: false,
        initial: "A",
        choices: ["E", "A", "H"],
      }),
      points: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      /** Flat bonus from talents, equipment, or GM ruling. */
      bonus: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      /**
       * Listed defaults, e.g. Acting defaults to IQ-5. An empty array means the
       * skill has no default and cannot be used untrained.
       */
      defaults: new fields.ArrayField(
        new fields.SchemaField({
          attribute: new fields.StringField({
            required: true,
            nullable: false,
            initial: "DX",
            choices: ["ST", "DX", "IQ", "HT"],
          }),
          modifier: new fields.NumberField({
            required: true,
            nullable: false,
            integer: true,
            initial: 0,
          }),
        }),
        { required: true, initial: [] },
      ),
      /** Set for skills marked /TL, recording which tech level was learned. */
      techLevel: new fields.StringField({ required: true, blank: true, initial: "" }),
    };
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();

    // The absolute level needs the owning actor's attributes, so it is resolved
    // on the actor. Here we can only report the relative level bought.
    const relativeLevel = relativeLevelForPoints(this.points, this.difficulty);
    this.derived = { level: null, relativeLevel, fromDefault: relativeLevel === null };
  }
}

/** A single way of attacking with a weapon in melee (GURPS Lite p. 20). */
function meleeModeField() {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** The skill used, by name, e.g. "Broadsword". */
    skill: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** ST-based damage uses thr or sw; fixed damage ignores ST entirely. */
    damageBase: new fields.StringField({
      required: true,
      nullable: false,
      initial: "thr",
      choices: ["thr", "sw", "fixed"],
    }),
    damageModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    /** Used only when damageBase is "fixed", e.g. "2d+2". */
    damageFormula: new fields.StringField({ required: true, blank: true, initial: "" }),
    damageType: new fields.StringField({
      required: true,
      nullable: false,
      initial: "cr",
      choices: ["burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
    }),
    armorDivisor: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 1 }),
    reach: new fields.StringField({ required: true, blank: true, initial: "C" }),
    /** Weapon parry modifier: -1 for a knife, +2 for a quarterstaff. */
    parryModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    /** Some weapons, such as flails, cannot be parried with at all. */
    canParry: new fields.BooleanField({ initial: true }),
    /** Attacks made with this weapon are at -4 to the defender's Parry. */
    isFlail: new fields.BooleanField({ initial: false }),
    minSt: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
    twoHanded: new fields.BooleanField({ initial: false }),
    /** The weapon becomes unready after each attack unless ST is high enough. */
    unreadyAfterAttack: new fields.BooleanField({ initial: false }),
  });
}

/** A single way of attacking with a weapon at range (GURPS Lite p. 19). */
function rangedModeField() {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, blank: true, initial: "" }),
    skill: new fields.StringField({ required: true, blank: true, initial: "" }),
    damageBase: new fields.StringField({
      required: true,
      nullable: false,
      initial: "fixed",
      choices: ["thr", "sw", "fixed"],
    }),
    damageModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    damageFormula: new fields.StringField({ required: true, blank: true, initial: "" }),
    damageType: new fields.StringField({
      required: true,
      nullable: false,
      initial: "pi",
      choices: ["burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
    }),
    armorDivisor: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 1 }),
    /** Accuracy, added to skill after an Aim maneuver. */
    accuracy: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    /** Built-in scope bonus, listed separately as in "7+2". */
    scopeBonus: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    halfDamageRange: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    maxRange: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /**
     * Muscle-powered weapons list range as a multiple of ST rather than a fixed
     * distance, e.g. x10/x15 (GURPS Lite p. 19).
     */
    rangeIsStMultiple: new fields.BooleanField({ initial: false }),
    rateOfFire: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 1,
    }),
    shots: new fields.StringField({ required: true, blank: true, initial: "" }),
    minSt: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
    twoHanded: new fields.BooleanField({ initial: false }),
    /** Bows and crossbows have their own ST, used instead of the wielder's. */
    weaponSt: new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
    }),
    thrown: new fields.BooleanField({ initial: false }),
  });
}

/**
 * A piece of equipment.
 *
 * Weapons are equipment carrying attack modes rather than a separate item type,
 * because GURPS weapon tables give one line per way of using a weapon: a
 * quarterstaff can swing or thrust, under either Staff or Two-Handed Sword.
 * Modes model that directly instead of forcing duplicate items.
 */
export class EquipmentData extends foundry.abstract.TypeDataModel {
  declare quantity: number;
  declare weight: number;
  declare cost: number;
  declare carried: boolean;
  declare equipped: boolean;
  declare meleeModes: unknown[];
  declare rangedModes: unknown[];

  static override defineSchema() {
    return {
      ...descriptionFields(),
      ...physicalFields(),
      meleeModes: new fields.ArrayField(meleeModeField(), { required: true, initial: [] }),
      rangedModes: new fields.ArrayField(rangedModeField(), { required: true, initial: [] }),
    };
  }

  /** Whether this item can be used to attack at all. */
  get isWeapon(): boolean {
    return this.meleeModes.length > 0 || this.rangedModes.length > 0;
  }
}

/** Worn armor, which provides Damage Resistance (GURPS Lite p. 18). */
export class ArmorData extends foundry.abstract.TypeDataModel {
  declare dr: number;
  declare locations: string[];
  declare quantity: number;
  declare weight: number;
  declare cost: number;
  declare carried: boolean;
  declare equipped: boolean;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      ...physicalFields(),
      dr: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
      }),

      /**
       * Locations this armor covers (GURPS Basic Set: Campaigns p. 398). A
       * breastplate protects the torso and vitals but not the limbs, so DR is
       * summed per location rather than applied to every hit.
       *
       * An empty list means whole-body coverage, which keeps armor written for
       * the Lite rules working unchanged.
       */
      locations: new fields.ArrayField(
        new fields.StringField({
          required: true,
          nullable: false,
          initial: "torso",
          choices: [
            "torso", "skull", "eye", "face", "neck",
            "vitals", "groin", "arm", "leg", "hand", "foot",
          ],
        }),
        { required: true, initial: [] },
      ),
    };
  }
}

/** A shield, which adds its Defense Bonus to every active defense (GURPS Lite p. 19). */
export class ShieldData extends foundry.abstract.TypeDataModel {
  declare db: number;
  declare skill: string;
  declare quantity: number;
  declare weight: number;
  declare cost: number;
  declare carried: boolean;
  declare equipped: boolean;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      ...physicalFields(),
      db: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 1,
        min: 0,
      }),
      skill: new fields.StringField({ required: true, blank: true, initial: "Shield" }),
    };
  }
}

/** A known language and its comprehension levels (GURPS Lite p. 7). */
export class LanguageData extends foundry.abstract.TypeDataModel {
  declare spoken: "none" | "broken" | "accented" | "native";
  declare written: "none" | "broken" | "accented" | "native";
  declare isNative: boolean;

  static override defineSchema() {
    const level = (initial: string) =>
      new fields.StringField({
        required: true,
        nullable: false,
        initial,
        choices: ["none", "broken", "accented", "native"],
      });

    return {
      ...descriptionFields(),
      spoken: level("native"),
      written: level("native"),
      /** The one free native language costs no points. */
      isNative: new fields.BooleanField({ initial: false }),
    };
  }

  /** Point cost by comprehension level (GURPS Lite p. 7). */
  static readonly LEVEL_COST: Record<string, number> = {
    none: 0,
    broken: 1,
    accented: 2,
    native: 3,
  };

  get totalPoints(): number {
    if (this.isNative) return 0;
    return (
      (LanguageData.LEVEL_COST[this.spoken] ?? 0) + (LanguageData.LEVEL_COST[this.written] ?? 0)
    );
  }
}

export type { DamageType };
