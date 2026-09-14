/**
 * Item data models: traits, skills, and equipment (GURPS Lite pp. 8-22).
 */

import { SKILL_FAMILIES, type SkillFamily } from "../../rules/technique-skills.js";
import { TECHNIQUE_DEFAULT_FROM, type TechniqueDefaultFrom } from "../../rules/skills.js";
import { relativeLevelForPoints } from "../../rules/skills.js";
import { SPELL_CLASSES, spellRelativeLevel, type MagicStyle, type SpellClass, type SpellDifficulty } from "../../rules/magic.js";
import {
  netModifier,
  traitPoints,
  traitLevelName,
} from "../../rules/traits.js";
import type { Enchantment } from "../../rules/enchanting.js";
import { AMMUNITION_TYPES } from "../../rules/ammunition.js";
import { EQUIPMENT_QUALITIES, type EquipmentQuality } from "../../rules/wealth.js";
import {
  WEAPON_CLASSES,
  WEAPON_MATERIALS,
  WEAPON_QUALITIES,
  SHIELD_COMPOSITIONS,
  type ShieldComposition,
  type WeaponClass,
  type WeaponMaterial,
  type WeaponQuality,
} from "../../rules/weapon-quality.js";
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from "../gear-groups.js";
import { templateCost } from "../../rules/templates.js";
import type {
  ChoiceGroup,
  Template,
  TemplateEntry,
  TemplateKind,
} from "../../rules/templates.js";
import type { DamageType, Difficulty, SkillAttribute } from "../../rules/types.js";
import { extensionsField } from "../data-extensions.js";

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
    /**
     * An article whose price is a share of the wearer's monthly cost of
     * living rather than a figure of its own (GURPS Basic Set: Characters
     * p. 266): a complete wardrobe is all of it, ordinary clothes a fifth.
     * Zero for everything sold at a price.
     */
    costOfLivingPercent: new fields.NumberField({
      required: true,
      nullable: false,
      initial: 0,
      min: 0,
    }),
    /**
     * Legality Class (GURPS Basic Set: Characters p. 267), 0 banned to 4
     * open. Null for gear the book gives no class -- "ordinary clothing and
     * tools normally do not require a LC" -- which is not the same as banned.
     */
    lc: new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
      max: 4,
    }),
    /**
     * The spells enchanted onto it (GURPS Basic Set: Campaigns pp. 480-482),
     * each with a Power of its own. Six are effects on the item -- Accuracy,
     * Deflect, Fortify, Puissance, Power, Staff -- and the sheet reads them
     * into skill, DR, damage and defenses; any other is a spell the wearer
     * has on them or the user can cast, at the item's Power.
     */
    enchantments: new fields.ArrayField(
      new fields.SchemaField({
        spell: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** The level of an effect -- Fortify +2 -- or times a per-level spell was put on. */
        level: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 0 }),
        /** The lower of the enchanter's Enchant and the spell, when it was made. */
        power: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 15, min: 0 }),
        /** Energy it took, which is also its price. */
        energy: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        alwaysOn: new fields.BooleanField({ initial: false }),
        mageOnly: new fields.BooleanField({ initial: false }),
      }),
      { required: true, initial: [] },
    ),
  };
}

/** Fields shared by every item type. */
/**
 * The vehicle statistics the tables print (GURPS Basic Set: Campaigns
 * pp. 462-463).
 *
 * Shared, because a vehicle is two things: an entry in a catalogue that a
 * character owns, and a machine on the map that people ride in and shoot at.
 * Both read the same columns, so both are given the same fields rather than
 * one copying the other and drifting.
 */
export function vehicleStatFields() {
  return {
    /**
     * "The vehicle's ST and HP. These are equal for a powered vehicle." An
     * unpowered one has HP only, and its ST is zero.
     */
    stHp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10, min: 0 }),
    /** "The first number is Handling; the second is Stability Rating." */
    handling: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    stability: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 2, min: 0 }),
    /** "A measure of reliability and ruggedness." */
    ht: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10, min: 1 }),
    /**
     * How fragile it is, from the code beside HT: "c" for Combustible, "f"
     * for Flammable, "x" for Explosive. Blank for a vehicle that is none.
     */
    fragility: new fields.StringField({
      required: true, nullable: false, blank: true, initial: "",
      choices: ["", "c", "f", "x"],
    }),
    /** "The first number is Acceleration and the second is Top Speed, in yards/second." */
    acceleration: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 0 }),
    topSpeed: new fields.NumberField({ required: true, nullable: false, initial: 10, min: 0 }),
    /** "Loaded Weight, in tons ... with maximum payload and a full load of fuel." */
    loadedWeight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /** "The weight, in tons, of occupants and cargo the vehicle can carry." */
    load: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    sm: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    /** "The number of occupants ... given as 'crew+passengers'." */
    occupants: new fields.StringField({ required: true, blank: true, initial: "1" }),
    dr: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    /** "The travel distance, in miles, before the vehicle runs out of fuel." */
    range: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    skill: new fields.StringField({ required: true, blank: true, initial: "" }),
    /**
     * The Locations column as the tables print it: "G4W" is a large glass
     * window and four wheels, "2CX" two caterpillar tracks and an exposed
     * weapon mount (Campaigns pp. 463, 554).
     */
    locations: new fields.StringField({ required: true, blank: true, initial: "" }),
    locomotion: new fields.StringField({
      required: true, nullable: false, initial: "wheels",
      choices: ["wheels", "tracks", "legs", "runners", "water", "air"],
    }),
    roadBound: new fields.BooleanField({ initial: false }),
    /**
     * "For a watercraft, the minimum depth of water, in feet, it can safely
     * operate in." Zero for anything that is not a boat.
     */
    draft: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /**
     * "For an aircraft, the minimum speed, in yards/second, it must maintain
     * to take off and stay airborne. '0' means it can hover."
     */
    stall: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
  };
}

function descriptionFields() {
  return {
    description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
    /** Where this item is defined in GURPS Lite, e.g. "p. 14". */
    reference: new fields.StringField({ required: true, blank: true, initial: "" }),
    /** Fields add-on modules keep on the item, one object per module. */
    extensions: extensionsField("Item"),
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
  declare modifiers: Array<{ name: string; value: number }>;
  declare selfControl: number | null;
  declare talentSkills: string[];
  declare power: string;
  declare powerTalent: boolean;
  declare meleeModes: unknown[];
  declare rangedModes: unknown[];

  static override defineSchema() {
    return {
      ...descriptionFields(),
      category: new fields.StringField({
        required: true,
        nullable: false,
        initial: "advantage",
        choices: ["advantage", "disadvantage", "quirk", "perk"],
      }),
      /**
       * Enhancements and limitations (Characters pp. 101-102), each a name
       * and a percentage: Reliable +20, Costs Fatigue -40. They scale the
       * trait's cost, and `totalPoints` reads them.
       */
      modifiers: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        }),
        { required: true, initial: [] },
      ),
      /**
       * A disadvantage's self-control number (pp. 120-121): how often it can be
       * resisted, and so what it pays back. Null for a trait that has none.
       */
      selfControl: new fields.NumberField({
        required: true,
        nullable: true,
        integer: true,
        initial: null,
        choices: [6, 9, 12, 15],
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
      /**
       * The skills a Talent adds its level to (Characters pp. 89-91), one name
       * each; a specialty matches its base skill. Empty for every other
       * trait. A Talent from another book is only known this way; one of the
       * Basic Set's that predates the field is still read by name.
       */
      talentSkills: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false }),
        { required: true, initial: [] },
      ),
      /**
       * The power this trait belongs to, by the name its book gives it --
       * ESP, Telepathy (Characters pp. 254-257). Blank for a trait of no power,
       * and for a Basic Set psi ability, which its power modifier already files.
       */
      power: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** True for the power's Talent rather than one of its abilities. */
      powerTalent: new fields.BooleanField({ required: true, initial: false }),
      /**
       * The attacks this trait is, in the shape a weapon's are: Innate Attack
       * and its kin (Characters pp. 61-62), and a power's attacks. They join
       * the character's attack list beside
       * what is carried. Empty for every trait that is not an attack.
       */
      meleeModes: new fields.ArrayField(meleeModeField(), { required: true, initial: [] }),
      rangedModes: new fields.ArrayField(rangedModeField(), { required: true, initial: [] }),
    };
  }

  /** Total character points this trait costs, counting levels, modifiers and self-control. */
  get totalPoints(): number {
    return traitPoints({
      points: this.points,
      levels: this.levels,
      pointsPerLevel: this.pointsPerLevel,
      costTable: this.costTable,
      modifiers: (this.modifiers ?? []).map((m) => Number(m.value) || 0),
      selfControl: this.selfControl ?? null,
    });
  }

  /** The net of the modifiers, as a percentage, for showing beside the cost. */
  get netModifier(): number {
    return netModifier((this.modifiers ?? []).map((m) => Number(m.value) || 0));
  }

  /** The book's name for the level bought, where it names one. */
  get levelName(): string | null {
    return traitLevelName(this.levelNames, this.levels);
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
  declare studyHours: number;
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
        // "W" is a wildcard skill: Very Hard at three times the cost.
        choices: ["E", "A", "H", "VH", "W"],
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
      /**
       * Hours of study banked toward the next character point (Characters
       * p. 292): what is left over once the whole points have gone in.
       */
      studyHours: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
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
    /**
     * Whole dice added to a thrust or swing: a chainsaw is "sw+1d" (GURPS
     * Basic Set: Characters p. 274). Zero for nearly everything.
     */
    damageExtraDice: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
    }),
    /**
     * The table prints "spec." instead of damage: a net entangles, a lasso
     * catches, a garrote strangles (Characters pp. 272, 276). The mode rolls
     * to hit and its own rules say what a hit does.
     */
    damageSpecial: new fields.BooleanField({ initial: false }),
    /**
     * Burning damage with the Surge modifier, marked "sur" (Characters
     * p. 105): a blaster's shot, which does double damage to anything that
     * runs on electricity.
     */
    surge: new fields.BooleanField({ initial: false }),
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
    /**
     * A modifier to the roll to hit, where the weapon is used at a penalty
     * with its own skill: a thrust a data file lists as "-2 to hit" with
     * Spear, say. It is not a penalty to the skill, so the parry the skill
     * gives is unchanged.
     */
    skillModifier: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    /**
     * A blow that gets the unarmed skills' damage bonus when struck with one
     * of them: brass knuckles, a blackjack (Characters p. 271, note 3), or any
     * blow a data file marks the same way.
     */
    unarmedBonus: new fields.BooleanField({ initial: false }),
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
    /**
     * Damage per level of the trait carrying this mode (Characters p. 61):
     * "1d" per level, rolled as many dice as levels held. Only a trait has
     * levels to read, so a weapon leaves this off.
     */
    perLevel: new fields.BooleanField({ initial: false }),
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
    /**
     * Whole dice added to a thrust or swing: a chainsaw is "sw+1d" (GURPS
     * Basic Set: Characters p. 274). Zero for nearly everything.
     */
    damageExtraDice: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
    }),
    /**
     * The table prints "spec." instead of damage: a net entangles, a lasso
     * catches, a garrote strangles (Characters pp. 272, 276). The mode rolls
     * to hit and its own rules say what a hit does.
     */
    damageSpecial: new fields.BooleanField({ initial: false }),
    /**
     * Burning damage with the Surge modifier, marked "sur" (Characters
     * p. 105): a blaster's shot, which does double damage to anything that
     * runs on electricity.
     */
    surge: new fields.BooleanField({ initial: false }),
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
    /**
     * Shots in the weapon now (GURPS Basic Set: Campaigns p. 373). Firing
     * takes them off; a Reload puts them back and takes the Ready maneuvers
     * the Shots column lists.
     */
    loaded: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    /**
     * The weight of one full reload, in pounds -- the figure after the slash
     * in the table's Weight column (Characters p. 270), which the GCA file
     * does not carry. "Ammo cost is $20 times this weight" (p. 278).
     */
    reloadWeight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    /**
     * What it is loaded with (Characters pp. 275, 276, 279): hollow-point,
     * armour-piercing hard core, APDS, bodkin points, silver. Blank for the
     * ordinary round the table assumes.
     */
    ammunition: new fields.StringField({
      required: true,
      nullable: false,
      blank: true,
      initial: "",
      choices: [...AMMUNITION_TYPES],
    }),
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
     * Projectiles per shot, for a shotgun's "3x9" (Campaigns p. 409). One for
     * everything that fires a single bullet, arrow or bolt.
     */
    projectiles: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 1,
    }),
    /**
     * The mark after a firearm's ST (GURPS Basic Set: Characters p. 270).
     * "R" is a musket rest, which braces an aimed shot fired standing still;
     * "B" an attached bipod, which braces a prone shot and cuts the ST needed
     * to two-thirds; "M" a weapon usually fired from a mount, whose ST and
     * Bulk are ignored on it. Blank for a weapon carried and fired as it is.
     */
    mount: new fields.StringField({
      required: true,
      nullable: false,
      blank: true,
      initial: "",
      choices: ["", "rest", "bipod", "mounted"],
    }),
    /**
     * How the projectile finds its way (GURPS Basic Set: Campaigns p. 412).
     * "guided" is flown by the firer, who must Concentrate each turn and keep
     * the target in sight; "homing" steers itself and asks nothing of him once
     * launched. Both ignore range modifiers, and for both the 1/2D figure is
     * the projectile's speed in yards a second rather than the range past
     * which damage halves. Blank for an ordinary shell or bullet.
     */
    guidance: new fields.StringField({
      required: true,
      nullable: false,
      blank: true,
      initial: "",
      choices: ["", "guided", "homing"],
    }),
    /**
     * An attack that covers ground rather than striking a point (p. 413), like
     * a flamethrower or a gas cloud. "Active defenses don't protect against an
     * area attack, but victims may dive for cover or retreat out of the area",
     * and its damage does not fall off with distance the way an explosion's
     * does.
     */
    areaAttack: new fields.BooleanField({ initial: false }),
    /**
     * How wide a cone attack is at its widest, in yards (p. 413). The spread
     * is that width over the weapon's Max range; zero means the table does not
     * say, and the cone then spreads a yard per yard. Only read when
     * `areaAttack` is set.
     */
    coneMaxWidth: new fields.NumberField({
      required: true,
      nullable: false,
      initial: 0,
      min: 0,
    }),
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
     * Malfunction: the attack roll at or above which the weapon fails (GURPS
     * Basic Set: Campaigns p. 407). Most firearms are 17; a bow or a thrown
     * rock has none, which is what null means here rather than 18.
     */
    malfunction: new fields.NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null,
      min: 3,
      max: 18,
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
    /** Damage per level of the trait carrying this mode (Characters p. 61). */
    perLevel: new fields.BooleanField({ initial: false }),
    /**
     * A Malediction (Characters p. 106), and which: 1 takes -1 a yard, 2 the
     * Size and Speed/Range Table, 3 the Long-Distance Modifiers. It rolls
     * against Will, the victim may resist in a Quick Contest, and DR does
     * nothing against it. Zero for every ordinary ranged attack.
     */
    malediction: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
      max: 3,
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
  declare enchantments: Enchantment[];
  declare quantity: number;
  declare weight: number;
  declare cost: number;
  declare carried: boolean;
  declare equipped: boolean;
  declare category: EquipmentCategory;
  declare unready: boolean;
  declare quality: WeaponQuality;
  declare material: WeaponMaterial;
  declare weaponClass: WeaponClass;
  declare listCost: number;
  declare listWeight: number;
  declare hpLost: number;
  declare missedMaintenance: number;
  declare complexity: number;
  declare equipmentQuality: EquipmentQuality;
  declare forSkills: string[];
  declare meleeModes: unknown[];
  declare rangedModes: unknown[];
  declare vehicle: {
    stHp: number; handling: number; stability: number; ht: number;
    acceleration: number; topSpeed: number; loadedWeight: number; load: number;
    sm: number; occupants: string; dr: number; range: number; skill: string; locations: string;
    locomotion: "wheels" | "tracks" | "legs" | "runners" | "water" | "air"; roadBound: boolean;
    fragility: "" | "c" | "f" | "x"; draft: number; stall: number;
  };

  static override defineSchema() {
    return {
      ...descriptionFields(),
      ...physicalFields(),
      /**
       * Swung and not yet brought back up (Characters p. 270, the "‡"). Set
       * by an attack with a weapon that becomes unready, cleared by a Ready
       * maneuver; while set the weapon neither attacks nor parries.
       */
      unready: new fields.BooleanField({ initial: false }),
      /**
       * What kind of thing this is, for the Gear tab to sort by. Anything
       * with an attack mode is shown as a weapon whatever this says; the
       * field is for telling a tool kit from a week of rations.
       */
      category: new fields.StringField({
        required: true,
        nullable: false,
        initial: "misc",
        choices: [...EQUIPMENT_CATEGORIES],
      }),
      meleeModes: new fields.ArrayField(meleeModeField(), { required: true, initial: [] }),
      rangedModes: new fields.ArrayField(rangedModeField(), { required: true, initial: [] }),
      /**
       * The grade of a tool, and what it is worth to the skill that uses it
       * (GURPS Basic Set: Campaigns p. 345). Not the same axis as a weapon's
       * quality: this is the difference between a surgeon's crash kit and a
       * handful of leaves and clean mud.
       */
      equipmentQuality: new fields.StringField({
        required: true,
        nullable: false,
        initial: "basic",
        choices: [...EQUIPMENT_QUALITIES],
      }),
      /**
       * The skills this equipment is the tools of, by name. A skill on this
       * list is rolled at the grade's modifier while the item is carried.
       */
      forSkills: new fields.ArrayField(
        new fields.StringField({ required: true, blank: true, initial: "" }),
        { required: true, initial: [] },
      ),
      /**
       * The grade it was bought in (GURPS Basic Set: Characters p. 274). The
       * tables' prices buy good quality through TL6; a finer weapon cuts
       * deeper, shoots straighter and breaks less, a cheap one the reverse.
       */
      quality: new fields.StringField({
        required: true,
        nullable: false,
        initial: "good",
        choices: [...WEAPON_QUALITIES],
      }),
      /**
       * What the blade is made of, where it matters (p. 275): stone, bronze
       * and iron take no fine bonus and break as cheap against better metal;
       * silver is priced and breaks by its own paragraph. Blank for the
       * usual material of the weapon's TL.
       */
      material: new fields.StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: "",
        choices: [...WEAPON_MATERIALS],
      }),
      /**
       * The class it is priced in -- sword, cutting, crushing, firearm, bow --
       * as the compendium recorded it. Blank means the modes decide.
       */
      weaponClass: new fields.StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: "",
        choices: [...WEAPON_CLASSES],
      }),
      /**
       * The table's price, before quality (p. 274). The cost above is what
       * this one paid; the sheet works it out from this and the grade.
       */
      listCost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      /** The table's weight, before what it is made of. */
      listWeight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      /**
       * Damage the weapon has taken (Campaigns p. 483): struck at, or worn.
       * Against the HP its weight gives it, this says whether it still works.
       */
      hpLost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      /**
       * Maintenance checks missed (Campaigns p. 485). "Missed or failed
       * maintenance checks result in HT loss. This HT loss is cumulative",
       * and it is what the exposure roll is made against.
       */
      missedMaintenance: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      /**
       * The vehicle statistics (Campaigns pp. 462-463), read when the
       * category is "vehicle": ST/HP, Hnd/SR, HT, Move as acceleration and
       * top speed in yards a second, weights in tons, SM, occupants as
       * "crew+passengers", DR, range in miles, and the control skill.
       */
      /**
       * A computer's Complexity (GURPS Basic Set: Campaigns p. 472). "An
       * abstract measure of processing power... A computer's Complexity
       * determines what programs it can run." Zero for everything that is not
       * a computer, which is most things.
       */
      complexity: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),

      vehicle: new fields.SchemaField(vehicleStatFields()),
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

  declare enchantments: Enchantment[];
  declare listCost: number;
  declare listWeight: number;
  declare dr: number;
  declare drSplit: number | null;
  declare drSplitAppliesTo: DamageType[];
  declare locations: string[];
  declare flexible: boolean;
  declare frontOnly: boolean;
  declare concealable: boolean;
  declare blocksPeripheralVision: boolean;
  declare soleDr: number | null;
  declare quantity: number;
  declare weight: number;
  declare cost: number;
  declare carried: boolean;
  declare equipped: boolean;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      ...physicalFields(),
      /** The table's price and weight, before what it is made of. */
      listCost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      listWeight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
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
      /**
       * The "*" on the armour tables (GURPS Basic Set: Characters p. 282):
       * "Flexible armor is easier to conceal or wear under other armor, and
       * quicker to don or remove, but it is more vulnerable to blunt trauma
       * damage." Mail, leather and a ballistic vest; not a breastplate.
       */
      flexible: new fields.BooleanField({ initial: false }),
      /**
       * The "F" on the tables: "the DR only protects against attacks from
       * the front" (p. 282). A breastplate, partial barding.
       */
      frontOnly: new fields.BooleanField({ initial: false }),
      /**
       * "Concealable as or under clothing", the tables' footnote on light
       * armour (pp. 283, 285): what layering under other armour requires.
       */
      concealable: new fields.BooleanField({ initial: false }),
      /**
       * "Helmet gives wearer the No Peripheral Vision disadvantage (p. 151)
       * while worn" -- the footnote on the great helms (Characters p. 283).
       */
      blocksPeripheralVision: new fields.BooleanField({ initial: false }),
      /**
       * Footwear with a separate DR on the underside -- "sandals give DR 1 to
       * the underside of the foot" (p. 283), boots DR 2 with 5 on the sole.
       * Null for anything but footwear with a stated sole.
       */
      soleDr: new fields.NumberField({
        required: true,
        nullable: true,
        integer: true,
        initial: null,
        min: 0,
      }),
    };
  }
}

/** A shield, which adds its Defense Bonus to every active defense (GURPS Lite p. 19). */
export class ShieldData extends foundry.abstract.TypeDataModel {
  declare enchantments: Enchantment[];
  declare db: number;
  declare dr: number;
  declare hp: number | null;
  declare hpLost: number;
  declare composition: ShieldComposition;
  declare listCost: number;
  declare listWeight: number;
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
      /**
       * "The shield's DR and HP if using the optional Damage to Shields
       * rule. This DR protects the shield, not the wielder." (GURPS Basic
       * Set: Characters p. 287.) A force shield has DR but no HP to lose,
       * which is what null means.
       */
      dr: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      hp: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 }),
      /** Damage the shield has taken under Damage to Shields (Campaigns p. 484). */
      hpLost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      /**
       * What the shield is made of (GURPS Basic Set: Characters p. 287,
       * note 4): iron at TL3+ costs five times as much, weighs twice as
       * much and is +3 DR with twice the HP; a TL7+ plastic riot shield
       * weighs half. "Shield composition never affects DB."
       */
      composition: new fields.StringField({
        required: true,
        nullable: false,
        initial: "wood",
        choices: [...SHIELD_COMPOSITIONS],
      }),
      /** The table's price and weight, before what it is made of. */
      listCost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      listWeight: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
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

/**
 * An enhancement or limitation (GURPS Basic Set: Characters pp. 101-117),
 * as a compendium entry to be picked from rather than typed.
 *
 * A trait carries its modifiers as names and percentages; this is where the
 * names and percentages come from. A modifier is priced flat -- Ranged
 * +40% -- or by level from a table -- Area Effect +50%, +100% and on -- and
 * a few are neither, being special enough that the page prices them by
 * hand; those carry 0 and their page.
 */
export class ModifierData extends foundry.abstract.TypeDataModel {
  declare kind: "enhancement" | "limitation" | "special";
  declare value: number;
  declare costTable: number[];
  declare levelNames: string[];
  declare maxLevels: number;
  declare group: string;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      kind: new fields.StringField({
        required: true, nullable: false, initial: "enhancement",
        choices: ["enhancement", "limitation", "special"],
      }),
      /** The percentage, or the percentage a level, for one priced evenly. */
      value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      /** The percentage at each level, level 1 first, for one priced from a table. */
      costTable: new fields.ArrayField(
        new fields.NumberField({ required: true, nullable: false, integer: true }),
        { required: true, initial: [] },
      ),
      /** The book's name for each level, where it names them. */
      levelNames: new fields.ArrayField(
        new fields.StringField({ required: true, blank: true, initial: "" }),
        { required: true, initial: [] },
      ),
      /** The most levels the book allows, or 0 where it sets no limit. */
      maxLevels: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      /** The book's grouping: "General", "Attack Enhancements", and so on. */
      group: new fields.StringField({ required: true, blank: true, initial: "" }),
    };
  }

  /** The percentage at a level: the table's figure where there is one, else value x levels. */
  percentAt(levels: number): number {
    const level = Math.max(1, Math.floor(levels) || 1);
    if (this.costTable.length > 0) return this.costTable[Math.min(level, this.costTable.length) - 1] ?? 0;
    return this.value * level;
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
/** A default a technique may be bought up from besides its first. */
export interface TechniqueAlternateDefault {
  from: TechniqueDefaultFrom;
  /** The skill, for a default from a skill, its Parry or its Block. */
  skill: string;
  modifier: number;
}

export class TechniqueData extends foundry.abstract.TypeDataModel {
  declare difficulty: "A" | "H";
  declare prerequisite: string;
  declare defaultFrom: TechniqueDefaultFrom;
  declare alternateDefaults: TechniqueAlternateDefault[];
  declare skillFamilies: SkillFamily[];
  declare skillChoices: string[];
  declare kind: string;
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
      /**
       * What the default comes off: the prerequisite skill's level, or the
       * Parry or Block it gives, or Dodge, or an attribute (Neck Snap's "ST-4",
       * Characters p. 232).
       */
      defaultFrom: new fields.StringField({
        required: true, nullable: false, initial: "skill", choices: [...TECHNIQUE_DEFAULT_FROM],
      }),
      /**
       * The kinds of skill a technique written for "any Melee Weapon skill"
       * may be bought for (Characters p. 230). Set on a technique with no
       * prerequisite yet, which asks for one when a character takes it.
       */
      skillFamilies: new fields.ArrayField(
        new fields.StringField({ required: true, nullable: false, initial: "melee", choices: [...SKILL_FAMILIES] }),
        { required: true, initial: [] },
      ),
      /**
       * A technique kind an add-on module registered (`<module>.<key>`), which
       * works the level out its own way. Blank for an ordinary technique.
       */
      kind: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** Skills named outright that it may be bought for: Jam's Brawling or Karate. */
      skillChoices: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false }),
        { required: true, initial: [] },
      ),
      /**
       * Further defaults, the best of which the character uses: "Defaults:
       * Binding, DX-2, Judo-1, or Wrestling-2".
       */
      alternateDefaults: new fields.ArrayField(
        new fields.SchemaField({
          from: new fields.StringField({
            required: true, nullable: false, initial: "skill", choices: [...TECHNIQUE_DEFAULT_FROM],
          }),
          skill: new fields.StringField({ required: true, blank: true, initial: "" }),
          modifier: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
        }),
        { required: true, initial: [] },
      ),
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

/**
 * A character or racial template (GURPS Basic Set: Characters pp. 258-263).
 *
 * "A partially completed character sheet that contains only those traits
 * required for a character to fill a certain role believably." It is an item
 * rather than anything cleverer so that a GM can write one the same way they
 * write an advantage: make one in the Items directory, fill it in, drag it onto
 * a character.
 *
 * What it holds is a list of entries and a set of choice groups. An entry with
 * no group is something everybody who takes the template gets; one with a group
 * is an option in "select two skills from" or "20 points chosen from among".
 */
export class TemplateData extends foundry.abstract.TypeDataModel {
  declare kind: TemplateKind;
  declare statedCost: number;
  declare attributes: { ST: number; DX: number; IQ: number; HT: number };
  declare secondary: {
    hp: number; will: number; per: number; fp: number; basicSpeed: number; basicMove: number;
  };
  declare sizeModifier: number;
  declare attributeCost: number;
  declare entries: TemplateEntry[];
  declare choices: ChoiceGroup[];
  declare features: string[];
  declare tabooTraits: string[];
  declare derived: { cost: number; matchesStated: boolean };

  static override defineSchema() {
    const modifier = () =>
      new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 });

    return {
      ...descriptionFields(),
      kind: new fields.StringField({
        required: true,
        nullable: false,
        initial: "character",
        choices: ["character", "racial", "lens", "metaTrait"],
      }),
      /** What the book states the whole thing costs, for checking against. */
      statedCost: modifier(),
      /**
       * Attribute scores for a character template, modifiers for a racial one.
       * Which it is follows from `kind`: "ST 9 [-10]" is a score to buy, and
       * "ST+2" is a modifier to whatever was bought.
       */
      attributes: new fields.SchemaField({
        ST: modifier(), DX: modifier(), IQ: modifier(), HT: modifier(),
      }),
      secondary: new fields.SchemaField({
        hp: modifier(),
        will: modifier(),
        per: modifier(),
        fp: modifier(),
        basicSpeed: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
        basicMove: modifier(),
      }),
      sizeModifier: modifier(),
      /**
       * What the template says its attribute and secondary modifiers cost.
       *
       * Only a racial template uses it, and it exists because those modifiers
       * are otherwise free: the Dragon's "ST+15 (Size, -20%) [120]" costs 120
       * however little fifteen unmodified levels would come to.
       */
      attributeCost: modifier(),
      entries: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          itemType: new fields.StringField({
            required: true,
            nullable: false,
            initial: "trait",
            choices: ["trait", "skill", "technique", "language", "equipment"],
          }),
          points: modifier(),
          levels: new fields.NumberField({
            required: true, nullable: false, integer: true, initial: 0, min: 0,
          }),
          /** The compendium document to copy, where the entry names a real one. */
          uuid: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** The choice group this belongs to, or blank for a required entry. */
          group: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** "(A) DX+1 [2]-13", as the book prints it. */
          note: new fields.StringField({ required: true, blank: true, initial: "" }),
        }),
        { required: true, initial: [] },
      ),
      choices: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: true, blank: true, initial: "" }),
          label: new fields.StringField({ required: true, blank: true, initial: "" }),
          kind: new fields.StringField({
            required: true, nullable: false, initial: "count", choices: ["count", "points"],
          }),
          required: modifier(),
        }),
        { required: true, initial: [] },
      ),
      /** Notes that cost nothing: "sterility and an ordinary tail" (p. 261). */
      features: new fields.ArrayField(
        new fields.StringField({ required: true, blank: true, initial: "" }),
        { required: true, initial: [] },
      ),
      /** Traits members of the race may not have. Also free (p. 261). */
      tabooTraits: new fields.ArrayField(
        new fields.StringField({ required: true, blank: true, initial: "" }),
        { required: true, initial: [] },
      ),
    };
  }

  override prepareDerivedData(): void {
    const cost = templateCost(this.toTemplate());
    this.derived = {
      cost,
      // A template whose parts do not add up to what it says is not wrong --
      // the GM may have meant it -- but it is worth showing on the sheet.
      matchesStated: cost === this.statedCost,
    };
  }

  /** This item as the rules layer's plain object. */
  toTemplate(): Template {
    return {
      name: String((this.parent as { name?: string })?.name ?? ""),
      kind: this.kind,
      statedCost: this.statedCost,
      attributes: nonZero(this.attributes),
      secondary: nonZero(this.secondary),
      ...(this.sizeModifier ? { sizeModifier: this.sizeModifier } : {}),
      attributeCost: this.attributeCost,
      entries: this.entries.map((entry) => ({ ...entry })),
      choices: this.choices.map((choice) => ({ ...choice })),
      features: [...this.features],
      tabooTraits: [...this.tabooTraits],
    };
  }
}

/**
 * The entries of an object that are not zero.
 *
 * A schema field is always present and defaults to zero, but a template that
 * says nothing about IQ must not be read as saying IQ 0 -- "if an attribute or
 * secondary characteristic does not appear in the racial template, assume it is
 * unchanged from the human norm" (p. 261).
 */
function nonZero<T extends Record<string, number>>(values: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== 0) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

/** A figure a spell description gives, kept beside the text it was read from. */
function spellFigure(text: string) {
  return new fields.NumberField({ required: true, nullable: true, initial: null, min: 0, label: text });
}

/** What a spell resolves to on a character. */
export interface SpellDerived {
  /** The level it is cast at, or null when it cannot be cast at all. */
  level: number | null;
  /** The relative level the points bought under the standard system. */
  relativeLevel: number | null;
  /** Which arithmetic produced the level. */
  style: MagicStyle;
  /** Under the ritual style, the college skill the spell was read off, or null when the character lacks one. */
  collegeSkill: string | null;
  /** Under the ritual style, the technique levels the points bought, after the cap. */
  levels: number;
  /** Under the ritual style, true when the points bought more than the college skill allows. */
  cappedByCollege: boolean;
  /** True for a standard-style spell on somebody with no Magery at all. */
  needsMagery: boolean;
  /** Whether every prerequisite is met, and the clauses that are not. */
  prerequisitesMet: boolean;
  missing: string[];
}

/**
 * A spell (GURPS Basic Set: Characters pp. 235, 242-253).
 *
 * A spell is a skill with more written beside it: its colleges, its classes,
 * what it costs to cast and keep up, how long it takes and how long it lasts,
 * and what has to be known before it. The figures the casting rules read are
 * stored as numbers; the book's own wording is kept beside each, because some
 * spells say "Varies" or "1 to Magery" and a number alone cannot.
 *
 * One record serves both ways of learning magic. Under the standard system
 * the points walk the Skill Cost Table; under Ritual Magic (p. 242) they buy a
 * Hard technique off the college skill, starting `prerequisiteCount` below it.
 * Which applies is decided on the character, not on the spell.
 */
export class SpellData extends foundry.abstract.TypeDataModel {
  declare colleges: string[];
  declare difficulty: SpellDifficulty;
  declare points: number;
  declare bonus: number;
  declare classes: SpellClass[];
  declare resistedBy: string;
  declare castingTime: { seconds: number | null; text: string };
  declare duration: { seconds: number | null; text: string };
  declare energy: { cast: number | null; castMax: number | null; maintain: number | null; text: string };
  declare mageryRequired: number;
  declare prerequisiteCount: number;
  declare prerequisites: string;
  declare attack: {
    skill: string;
    damage: string;
    damageType: string;
    accuracy: number;
    halfDamageRange: number;
    maxRange: number;
    explosive: boolean;
    behavior: string;
    area: boolean;
  };
  declare derived: SpellDerived;

  static override defineSchema() {
    return {
      ...descriptionFields(),
      /**
       * The colleges the spell belongs to, the first being the one it is
       * filed under. A list rather than a choice, because "Some spells fall
       * into more than one college" (p. 239) and because a spell from another
       * book may name a college this one never heard of.
       */
      colleges: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false }),
        { required: true, initial: [] },
      ),
      /** "Most spells are IQ/Hard skills, but a few potent spells are IQ/Very Hard." */
      difficulty: new fields.StringField({
        required: true, nullable: false, initial: "H", choices: ["H", "VH"],
      }),
      points: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),
      /** Flat bonus from a talent, an item, or the GM. */
      bonus: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      /** "Each spell falls into one or more classes" (p. 239). */
      classes: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false, choices: [...SPELL_CLASSES] }),
        { required: true, initial: ["regular"] },
      ),
      /**
       * What a Resisted spell is resisted with: "HT", "Will", another spell,
       * or something the description names. Blank for a spell nobody resists.
       */
      resistedBy: new fields.StringField({ required: true, blank: true, initial: "" }),
      /** Time to cast. The seconds are the figure the concentration rule reads; null where the book says "Varies". */
      castingTime: new fields.SchemaField({
        seconds: spellFigure("seconds"),
        text: new fields.StringField({ required: true, blank: true, initial: "" }),
      }),
      /** How long it lasts before it has to be maintained. Null for an instant or permanent effect, which the text says. */
      duration: new fields.SchemaField({
        seconds: spellFigure("seconds"),
        text: new fields.StringField({ required: true, blank: true, initial: "" }),
      }),
      /**
       * Energy to cast and to maintain. `cast` is the least that can be spent
       * and `castMax` the most, for a spell whose effect scales with energy;
       * a fixed cost has the two equal. Null where only the text can say.
       */
      energy: new fields.SchemaField({
        cast: spellFigure("cast"),
        castMax: spellFigure("castMax"),
        maintain: spellFigure("maintain"),
        text: new fields.StringField({ required: true, blank: true, initial: "" }),
      }),
      /** The least Magery the spell can be learned with. Zero for a spell any mage may learn. */
      mageryRequired: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),
      /**
       * How many prerequisites the spell has, counting its prerequisites'
       * prerequisites: the "cumulative -1" a ritual mage starts at (p. 242).
       */
      prerequisiteCount: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),
      /**
       * The prerequisites as the book writes them -- "Magery 1, Create Fire,
       * Shape Fire" -- read by the rules engine's grammar. Text rather than a
       * structure so a GM can type one and a spell from another book can
       * carry whatever that book asks.
       */
      prerequisites: new fields.StringField({ required: true, blank: true, initial: "" }),
      /**
       * How a Missile or Melee spell is delivered once cast (pp. 240-241): the
       * skill it is thrown or struck with, and the damage each point of energy
       * buys. Blank on a spell that is neither.
       */
      attack: new fields.SchemaField({
        skill: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** Damage per point of energy, as dice: "1d", "1d-1". */
        damage: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** Blank where the spell's own description says what it does. */
        damageType: new fields.StringField({
          required: true, blank: true, initial: "",
          choices: ["", "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
        }),
        accuracy: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        halfDamageRange: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        maxRange: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        explosive: new fields.BooleanField({ initial: false }),
        /**
         * For a spell of another class that attacks: the add-on behavior
         * (`<module>.<key>`) that delivers it once cast. Blank for a Missile
         * or Melee spell, which the system delivers itself.
         */
        behavior: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** Damage to everyone in the spell's area, rather than an attack on one target. */
        area: new fields.BooleanField({ initial: false }),
      }),
    };
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    // The level needs the owning actor's IQ and Magery, and its magic style,
    // so it is resolved there. Alone, a spell can only say what its points
    // bought under the standard system.
    this.derived = {
      level: null,
      relativeLevel: spellRelativeLevel(this.points, this.difficulty),
      style: "standard",
      collegeSkill: null,
      levels: 0,
      cappedByCollege: false,
      needsMagery: false,
      prerequisitesMet: true,
      missing: [],
    };
  }

  /** The college the spell is filed under. */
  get college(): string {
    return this.colleges[0] ?? "";
  }
}
