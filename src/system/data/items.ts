/**
 * Item data models: traits, skills, and equipment (GURPS Lite pp. 8-22).
 */

import { relativeLevelForPoints } from "../../rules/skills.js";
import { traitPoints } from "../../rules/traits.js";
import type { DamageType, Difficulty, SkillAttribute } from "../../rules/types.js";

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
  declare costTable: number[];
  declare levelNames: string[];
  declare maxLevels: number;
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
      /**
       * Total cost at each level, for traits the book prices from a table
       * rather than at a flat rate per level. Wealth runs 10/20/30/50/75 and
       * Appearance 4/12/12/16/16/20, neither of which any per-level figure
       * reproduces. Empty for the great majority of traits, which are priced
       * evenly; when set, it is what `totalPoints` reads.
       */
      costTable: new fields.ArrayField(
        new fields.NumberField({ required: true, nullable: false, integer: true }),
        { required: true, initial: [] },
      ),
      /**
       * The book's name for each level, level 1 first. Players name Wealth by
       * its steps -- Comfortable, Filthy Rich -- rather than by a number. An
       * entry may be blank where the book names only some levels.
       */
      levelNames: new fields.ArrayField(
        new fields.StringField({ required: true, blank: true, initial: "" }),
        { required: true, initial: [] },
      ),
      /** Highest level the book allows, or 0 where it sets no limit. */
      maxLevels: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
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
    return traitPoints(this);
  }

  /** The book's name for the level bought, where it names one. */
  get levelName(): string | null {
    return this.levelNames[this.levels - 1] || null;
  }
}

/** A skill (GURPS Lite pp. 12-17). */
export class SkillData extends foundry.abstract.TypeDataModel {
  declare attribute: SkillAttribute;
  declare difficulty: Difficulty;
  declare points: number;
  declare bonus: number;
  declare defaults: Array<{ from: "attribute" | "skill"; attribute: SkillAttribute; skill: string; modifier: number }>;
  declare techLevel: string;
  declare derived: { level: number | null; relativeLevel: number | null; fromDefault: boolean };

  static override defineSchema() {
    return {
      ...descriptionFields(),
      attribute: new fields.StringField({
        required: true,
        nullable: false,
        initial: "DX",
        choices: ["ST", "DX", "IQ", "HT", "Will", "Per"],
      }),
      difficulty: new fields.StringField({
        required: true,
        nullable: false,
        initial: "A",
        choices: ["E", "A", "H", "VH"],
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
          /**
           * Where the default comes from. GURPS Lite defaults only from an
           * attribute; the Basic Set also defaults from other skills, e.g.
           * Broadsword defaults to Shortsword-2.
           */
          from: new fields.StringField({
            required: true, nullable: false, initial: "attribute",
            choices: ["attribute", "skill"],
          }),
          attribute: new fields.StringField({
            required: true,
            nullable: false,
            initial: "DX",
            choices: ["ST", "DX", "IQ", "HT", "Will", "Per"],
          }),
          /** Skill name, used when `from` is "skill". */
          skill: new fields.StringField({ required: true, blank: true, initial: "" }),
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
    /**
     * Armour divisor. Above 1 it divides the target's DR; below 1 it multiplies
     * it, so a wooden stake at (0.5) faces double DR (GURPS Basic Set:
     * Characters p. 269). The bound was 1, which made that unrepresentable.
     */
    armorDivisor: new fields.NumberField({
      required: true,
      nullable: false,
      initial: 1,
      min: 0.1,
    }),
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
    /**
     * An unbalanced weapon cannot parry in a turn it has already attacked in, or
     * vice versa (GURPS Basic Set: Characters p. 269, the "U" in the Parry
     * column). This is a separate rule from {@link unreadyAfterAttack}, which is
     * about the weapon needing to be readied again.
     */
    unbalanced: new fields.BooleanField({ initial: false }),
    /**
     * A fencing weapon, marked "F" in the Parry column. Fencing weapons defend
     * by their own rules (GURPS Basic Set: Campaigns p. 404), notably a larger
     * bonus for retreating.
     */
    isFencing: new fields.BooleanField({ initial: false }),
    /**
     * An explosive attack, marked "ex" after its damage type (GURPS Basic Set:
     * Campaigns p. 414). It does its listed damage to whoever it struck and
     * collateral damage to everyone within twice its dice in yards.
     */
    explosive: new fields.BooleanField({ initial: false }),
    /**
     * Fragmentation thrown by the explosion, as a dice formula -- the "[2d]"
     * in "cr ex [2d]". Blank when the explosive throws none.
     */
    fragmentation: new fields.StringField({ required: true, blank: true, initial: "" }),
    /**
     * An affliction rather than damage (GURPS Basic Set: Characters p. 35).
     * The target resists with an attribute roll at a penalty -- "HT-4 aff" --
     * and what failing does is the weapon's own business, which the compendium
     * does not carry because it is written in prose.
     */
    affliction: new fields.BooleanField({ initial: false }),
    /** The attribute the target resists with. Blank when this is not an affliction. */
    afflictionAttribute: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** The penalty to that resistance roll, zero or negative. */
    afflictionModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      max: 0,
    }),
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
    /**
     * Armour divisor. Above 1 it divides the target's DR; below 1 it multiplies
     * it, so a wooden stake at (0.5) faces double DR (GURPS Basic Set:
     * Characters p. 269). The bound was 1, which made that unrepresentable.
     */
    armorDivisor: new fields.NumberField({
      required: true,
      nullable: false,
      initial: 1,
      min: 0.1,
    }),
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
    /**
     * How unwieldy the weapon is, as a penalty: it applies when firing from a
     * vehicle or in close combat, and to attempts to keep the weapon hidden
     * (GURPS Basic Set: Characters p. 270). Zero or negative, never positive.
     */
    bulk: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      max: 0,
    }),
    /**
     * Recoil: how much each shot after the first throws off the aim, when
     * firing more than one (GURPS Basic Set: Characters p. 269). A muscle-
     * powered weapon has none, which the table prints as 1 and this as 0.
     */
    recoil: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
    }),
    /**
     * An explosive attack, marked "ex" after its damage type (GURPS Basic Set:
     * Campaigns p. 414). It does its listed damage to whoever it struck and
     * collateral damage to everyone within twice its dice in yards.
     */
    explosive: new fields.BooleanField({ initial: false }),
    /**
     * Fragmentation thrown by the explosion, as a dice formula -- the "[2d]"
     * in "cr ex [2d]". Blank when the explosive throws none.
     */
    fragmentation: new fields.StringField({ required: true, blank: true, initial: "" }),
    /**
     * An affliction rather than damage (GURPS Basic Set: Characters p. 35).
     * The target resists with an attribute roll at a penalty -- "HT-4 aff" --
     * and what failing does is the weapon's own business, which the compendium
     * does not carry because it is written in prose.
     */
    affliction: new fields.BooleanField({ initial: false }),
    /** The attribute the target resists with. Blank when this is not an affliction. */
    afflictionAttribute: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** The penalty to that resistance roll, zero or negative. */
    afflictionModifier: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      max: 0,
    }),
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
  /**
   * The split DR is only meaningful as a pair, and the second figure is the
   * lower one. The pack validator checks this too, but a document edited on the
   * sheet never passes through that, and a "lower" DR above the main one would
   * make drAgainst return the larger number for the damage it is meant to
   * protect against least.
   */
  static override validateJoint(data: Record<string, any>): void {
    const split = data.drSplit ?? null;
    const against = data.drSplitAppliesTo ?? [];

    if (split === null && against.length > 0) {
      throw new Error("Armor names damage for a split DR without giving the second DR.");
    }
    if (split !== null && against.length === 0) {
      throw new Error("Armor has a split DR without saying which damage it applies to.");
    }
    if (split !== null && split > (data.dr ?? 0)) {
      throw new Error(`Split DR ${split} must not exceed the armor's DR of ${data.dr}.`);
    }
    // Both armour tables agree that crushing takes the lower figure, so a split
    // without it has been read from neither of them.
    if (split !== null && !against.includes("cr")) {
      throw new Error("A split DR must apply to crushing, which both armour tables agree on.");
    }
  }

  declare dr: number;
  declare drSplit: number | null;
  declare drSplitAppliesTo: DamageType[];
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
      /**
       * The second, lower DR of armour written "4/2", and the damage types it
       * applies to. Which types those are depends on the table the armour came
       * from -- see SPLIT_AGAINST in the rules engine -- so they are stored with
       * the piece rather than inferred from it.
       */
      drSplit: new fields.NumberField({
        required: true,
        nullable: true,
        integer: true,
        initial: null,
        min: 0,
      }),
      drSplitAppliesTo: new fields.ArrayField(
        new fields.StringField({
          required: true,
          nullable: false,
          blank: false,
          choices: ["burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
        }),
        { required: true, initial: [] },
      ),

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
  declare meleeModes: unknown[];
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
      /**
       * Bashing someone with the shield (GURPS Basic Set: Characters p. 273).
       * A shield is a weapon as well as a defense, and the same field shape as
       * a weapon's modes is used so the Combat tab can render both alike.
       */
      meleeModes: new fields.ArrayField(meleeModeField(), { required: true, initial: [] }),
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

/**
 * A technique: a specialised feat bought up from a penalty against a
 * prerequisite skill (GURPS Basic Set: Characters pp. 229-233).
 *
 * Kicking, for instance, defaults to Karate-2, and points buy that -2 off.
 */
export class TechniqueData extends foundry.abstract.TypeDataModel {
  declare difficulty: "A" | "H";
  declare prerequisite: string;
  declare defaultModifier: number;
  declare points: number;
  declare maxRelativeToPrerequisite: number;
  declare derived: { level: number | null; levels: number; cappedByPrerequisite: boolean };

  static override defineSchema() {
    return {
      ...descriptionFields(),
      /** Techniques are only ever Average or Hard. */
      difficulty: new fields.StringField({
        required: true, nullable: false, initial: "A", choices: ["A", "H"],
      }),
      /** The skill this technique defaults from, by name. */
      prerequisite: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** The default penalty, e.g. -2 for Kicking off Karate. Negative. */
      defaultModifier: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, max: 0,
      }),
      points: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),
      /**
       * The technique's ceiling, relative to the prerequisite skill's level.
       * Zero -- the common case -- means it may reach that skill but not
       * exceed it. Some techniques are allowed past it: Arm Lock caps at the
       * prerequisite +4 and Kicking at +5 (p. 230), so this is not bounded
       * above.
       */
      maxRelativeToPrerequisite: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0,
      }),
    };
  }
}
