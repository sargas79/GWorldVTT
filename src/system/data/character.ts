/**
 * The character Actor data model (GURPS Lite pp. 4-8).
 *
 * All derived values come from the pure rules engine; this class declares the
 * persisted schema and distributes the engine's outputs across the actor and
 * its embedded items.
 */

import {
  BASIC_SPEED_STEP,
  basicLift,
  basicSpeedPointCost,
  secondaryCharacteristics,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { beastAttacks, beastTraitsFrom, naturalAttacks } from "../../rules/natural-attacks.js";
import { becomesUnreadyAfterAttack } from "../../rules/readiness.js";
import { aimBonus } from "../../rules/aim.js";
import { regenerationRate } from "../../rules/recovery.js";
import { catalogSkill, defaultLevelFrom } from "../skill-catalog.js";
import { isUnarmedSkill } from "../../rules/criticals.js";
import { reachForSize } from "../../rules/size.js";
import { pointsLedger, type PointAward } from "../../rules/character-points.js";
import {
  afterSuperJump,
  impairedAttacks,
  lameCombatPenalty,
  lameMove,
  traitEffects,
  type TraitEffects,
} from "../../rules/trait-effects.js";
import { talentBonusFor, talentBonuses } from "../../rules/talents.js";
import { charismaInfluenceBonus, reactionSources } from "../../rules/social.js";
import { nudityDefenseBonus, nudityMoveBonus, type Dress } from "../../rules/cinematic.js";
import { senseScores } from "../../rules/senses.js";
import {
  clothingCost, costOfLiving, equipmentQualityModifier, gearCost, monthlyIncomeFromTraits, monthlyPay,
  pointsForMoney, signatureGearPoints, signatureGearValue, startingWealth, statusFrom, wealthFrom,
  type EquipmentQuality,
  type WealthLevel,
} from "../../rules/wealth.js";
import { agingRollsPerYear, lifespanFrom } from "../../rules/aging.js";
import { culturallyAdaptable, languagePenalty, type Comprehension } from "../../rules/languages.js";
import { sleepPeriodFrom } from "../../rules/sleep.js";
import { radiationRow, radiationToleranceFrom, remainingDose } from "../../rules/radiation.js";
import { baseParry, bestParryOption, block, dodge, parry } from "../../rules/defenses.js";
import {
  materialArmorDivisor,
  minStPenalty,
  qualityAccuracyBonus,
  qualityDamageBonus,
  qualityMalfunction,
  qualityRangeMultiplier,
  weaponClassOf,
  type WeaponClass,
  type WeaponMaterial,
  type WeaponQuality,
} from "../../rules/weapon-quality.js";
import { layeringAt, layeringPenalty } from "../../rules/layered-armor.js";
import { shieldGivesDb, shieldState } from "../../rules/shield-damage.js";
import {
  ammunitionEffect,
  calibreOf,
  fullLoad,
  parseShots,
  reloadTime,
  type AmmunitionType,
} from "../../rules/ammunition.js";
import {
  brokenWeaponKindFor,
  isSolidCrushing,
  resistsBreakage,
  unarmedAttackWeight,
  weaponCondition,
  weaponHitPoints,
  weaponState,
  type WeaponCondition,
} from "../../rules/breakage.js";
import { usableInCloseCombat } from "../../rules/tactical.js";
import { isRuleOn } from "../optional-rules.js";
import { encumbranceState } from "../../rules/encumbrance.js";
import { splitSummary, type ArmorPiece } from "../../rules/armor.js";
import { HIT_LOCATIONS, HIT_LOCATION_ORDER, type HitLocation } from "../../rules/hit-locations.js";
import {
  MANEUVERS,
  MANEUVER_ORDER,
  canDefendWith,
  canParryWith,
  evaluateBonus,
  type Maneuver,
} from "../../rules/maneuvers.js";
import { swingDamage, thrustDamage, weaponDamage } from "../../rules/damage.js";
import { formatDiceAdds, parseDiceAdds } from "../../rules/dice.js";
import { halveForReeling, healthStatus, isReeling } from "../../rules/injury.js";
import { fatigueStatus, isVeryTired } from "../../rules/fatigue.js";
import {
  INFLUENCE_SKILLS,
  automaticSkillBonus,
} from "../../rules/reactions.js";
import { mountedDefensePenalty } from "../../rules/mounted.js";
import { supportEffect } from "../../rules/accessories.js";
import { penaltyEffects, strengthForDamage } from "../../rules/attribute-penalties.js";
import { afflictionsOn, painThresholdOf } from "../afflictions.js";
import { powersOf } from "../../rules/powers.js";
import {
  effectiveSkillLevel,
  namedDefaultLevel,
  normalizeSkillName,
  relativeLevelForPoints,
  resolveTechnique,
  techniqueLevelsForPoints,
} from "../../rules/skills.js";
import { musclePoweredRange } from "../../rules/ranged.js";
import {
  checkPrerequisites,
  collegeSkillNames,
  magicSkillBonus,
  magicStyleFor,
  mageryForStyle,
  parsePrerequisites,
  ritualSpellLevel,
  spellLevel,
  spellRelativeLevel,
  type KnownSpell,
  type MagicStyle,
  type MagicStylePreference,
  type MagicTalent,
} from "../../rules/magic.js";
import { activeSpellCounts, type ManaLevel } from "../../rules/casting.js";
import { readEnchantments, type ItemMagic } from "../../rules/enchanting.js";
import { currentMana } from "../casting.js";
import { addModifier } from "../../rules/dice.js";
import type { SpellDerived } from "./items.js";

/** A spell running on a character, as stored. */
export interface ActiveSpell {
  id: string;
  itemId: string;
  name: string;
  castCost: number;
  maintainCost: number | null;
  durationSeconds: number | null;
  expiresAt: number | null;
  startedAt: number;
  concentrating: boolean;
  permanent: boolean;
}
import {
  broadJumpFeet,
  highJumpInches,
  jumpingMove,
  liftCapacities,
  pacedMove,
  sprintMove,
  waterMove,
  type JumpInput,
} from "../../rules/physical.js";
import type {
  DamageType, Difficulty, EncumbranceLevel, Posture, SkillAttribute,
} from "../../rules/types.js";

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
  /** The weapon's own parry modifier: -1 for a knife, +2 for a quarterstaff. */
  parryModifier: number;
  minSt: number | null;
  armorDivisor: number;
  /** False when the damage formula cannot be parsed, so the UI can omit the roll. */
  damageRollable: boolean;
  /** An explosive attack, which also hurts everyone near what it struck. */
  explosive: boolean;
  /** Fragmentation thrown, as a dice formula. Blank when it throws none. */
  fragmentation: string;
  /**
   * False when this weapon cannot be used where the character is standing --
   * a reach-1 weapon while sharing a hex with a foe.
   */
  usable: boolean;
  /**
   * True when the skill is not on the sheet and the level shown is the
   * book's default for it -- anybody can pull a trigger, at DX-4.
   */
  atDefault: boolean;
  /** True for a punch or a kick, which every character has and no item carries. */
  natural: boolean;
  /** True while the weapon is unready and cannot attack or parry (p. 270). */
  unready: boolean;
  /** True when a swing of this weapon will leave it unready in these hands. */
  readiesAfterAttack: boolean;
  /** Projectiles per shot: nine for a shotgun, one for everything else. Ranged only. */
  projectiles?: number;
  /** The 1/2D range in yards, inside a tenth of which pellets strike as one. Ranged only. */
  halfDamageRange?: number;
  /** The Max range in yards, which is how far a steered projectile can fly. Ranged only. */
  maxRange?: number;
  /**
   * How the projectile steers, blank for one that does not (Campaigns p. 412).
   * A steered weapon reads 1/2D as its speed rather than a damage threshold.
   */
  guidance?: string;
  /** True for an attack that covers ground rather than striking a point (p. 413). */
  areaAttack?: boolean;
  /** A cone's widest, in yards; zero where the table does not say. */
  coneMaxWidth?: number;
  /** True for a punch, kick, bite or grapple, which fumbles on its own table. */
  unarmed: boolean;
  /**
   * True for a weapon thrown by hand rather than shot. Ranged only, and only
   * read by the rules that treat a hurled rock as the arm that hurled it
   * (Campaigns p. 417).
   */
  thrown?: boolean;
  /**
   * True when the damage comes off the Damage Table -- thrust or swing scaled
   * by ST. The bonuses that only apply to muscle-powered blows read this; a
   * force sword's flat 8d is not one of them.
   */
  stBased: boolean;
  /** "thr" or "sw" for an ST-based weapon, blank otherwise: what a pulled blow re-reads. */
  damageBase?: string;
  /** The weapon's flat damage modifier on top of its base, for the same. */
  damageModifier?: number;
  /** For a punch or a kick, which one: re-derived whole at a pulled ST. */
  naturalKey?: string;
  /** An affliction, which is resisted rather than damaging. */
  affliction: boolean;
  /** The attribute it is resisted with, e.g. "HT". Blank when not an affliction. */
  afflictionAttribute: string;
  /** The penalty to that resistance roll. */
  afflictionModifier: number;
  /**
   * An unbalanced weapon cannot parry in a turn it has attacked in
   * (p. 269, the "U" in the Parry column).
   */
  unbalanced: boolean;
  /** A fencing weapon, marked "F", which defends by its own rules. */
  isFencing: boolean;
  /**
   * The weapon's weight, which decides whether a parry can meet it and
   * whether the parrying weapon breaks (Campaigns p. 376). A punch weighs a
   * tenth of the ST behind it.
   */
  weight: number;
  /** The grade the weapon was bought in (Characters p. 274). */
  quality: WeaponQuality;
  /** What the blade is made of, where the record says (p. 275). */
  material: WeaponMaterial;
  /** True for a weapon that rolls again on a "weapon breaks" fumble (Campaigns p. 556). */
  resistsBreakage: boolean;
  /** The skill penalty for a weapon needing more ST than the wielder has (p. 270). Zero or negative. */
  minStPenalty: number;
  /** What state the weapon is in after the damage it has taken (Campaigns p. 484). */
  condition: WeaponCondition;
  /** True when the weapon needs two hands, which lets a parry meet twice the weight. */
  twoHanded: boolean;
  /** True for a swing, which is what blade composition compares (p. 275). */
  swung: boolean;
  /**
   * Shots in the weapon and shots it holds (Campaigns p. 373), for a
   * ranged mode whose column counts them. Both zero where it does not.
   */
  shotsLoaded?: number;
  shotsCapacity?: number;
  /** Seconds a full reload takes, or null where the column gives none. */
  reloadSeconds?: number | null;
  /** True when the weapon can be reloaded from the sheet at all. */
  reloadable?: boolean;
  /** True when the count is kept and has reached zero. */
  empty?: boolean;
  /** What it is loaded with, where that changes the shot (pp. 276, 279). */
  ammunition?: AmmunitionType;
  /** Ranged only. */
  accuracy?: number;
  /**
   * Malf.: the attack roll at or above which the weapon fails (Campaigns
   * p. 407). Null for anything that cannot jam, such as a bow.
   */
  malfunction?: number | null;
  /** A built-in scope's bonus, which the table lists separately as in "7+2". */
  scopeBonus?: number;
  range?: string;
  rateOfFire?: number;
  /** Recoil, which decides how many of a burst's shots hit. */
  recoil?: number;
  /** Bulk, the penalty for firing on the move or in close combat. */
  bulk?: number;
  shots?: string;
}

interface DefenseView {
  total: number;
  /** How the score was arrived at, for display. Never parsed. */
  source: string;
  math: string;
  /**
   * The skill this defense is rolled with, as a bare name. Kept apart from
   * `source`, which reads "Rapier 14" and is for a human: retreating gives a
   * fencing parry +3 rather than +1, and that rule has to match on the skill
   * itself rather than on a sentence about it.
   */
  skillName: string;
  /**
   * The weapon a parry is made with, for Parrying Heavy Weapons (Campaigns
   * p. 376): its weight, grade and material, and whether it is a pair of
   * bare hands, which cannot snap.
   */
  weapon?: {
    itemId: string;
    weight: number;
    quality: WeaponQuality;
    material: WeaponMaterial;
    twoHanded: boolean;
    natural: boolean;
  };
  /** Whether the weapon parried with is a fencing weapon, which retreats better. */
  isFencing: boolean;
}

/**
 * The mana where this character is, for what their magic items can do. Read
 * defensively: derived data is prepared while the world is still loading,
 * before the settings a mana level lives in can be asked.
 */
function manaHere(): ManaLevel {
  try {
    return isRuleOn("manaLevels") ? currentMana() : "normal";
  } catch {
    return "normal";
  }
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  declare attributes: { ST: number; DX: number; IQ: number; HT: number };
  declare bonuses: {
    hp: number; will: number; per: number; fp: number;
    basicSpeed: number; basicMove: number; dodge: number;
  };
  declare purchased: {
    hp: number; will: number; per: number; fp: number;
    basicSpeed: number; basicMove: number;
  };
  declare hp: { value: number; max: number };
  declare fp: { value: number; max: number };
  declare mounted: boolean;
  declare racial: { ST: number; DX: number; IQ: number; HT: number };
  declare templates: Array<{
    name: string;
    kind: "character" | "racial" | "lens" | "metaTrait";
    uuid: string;
    attributeCost: number;
    granted: Record<string, number>;
    previous: Record<string, number>;
    written: Record<string, number>;
    at: number | null;
    itemIds: string[];
  }>;
  declare magic: { style: MagicStylePreference };
  declare activeSpells: ActiveSpell[];
  declare attributePenalties: { ST: number; DX: number; IQ: number; HT: number };
  declare dress: { state: Dress; topless: boolean };
  declare entangled: {
    kind: "" | "net" | "smallNet" | "bolas" | "lariat";
    successes: number;
    failures: number;
    mustBeCut: boolean;
    where: string;
    running: boolean;
  };
  declare points: {
    starting: number;
    disadvantageLimit: number;
    tradedForMoney: number;
    awards: PointAward[];
  };
  declare tl: number;
  declare sm: number;
  declare maneuver: Maneuver;
  declare evaluateTurns: number;
  declare aim: { turns: number; braced: boolean };
  declare allOutAttackOption: "determined" | "double" | "feint" | "strong" | "suppression";
  declare allOutDefenseOption: "increased" | "double";
  declare allOutDefenseTarget: "dodge" | "parry" | "block";
  declare posture: Posture;
  declare handedness: "right" | "left";
  declare wait: { trigger: string; hexesWatched: number; coveringLine: boolean };
  declare conditions: {
    stunned: boolean;
    allOutDefense: boolean;
    blindToAttacker: boolean;
    attackedThisTurn: boolean;
    closeCombat: boolean;
  };
  declare money: number;
  declare radiation: { dose: number; at: number };
  declare job: { title: string; skill: string; level: string; kind: "wage" | "freelance"; risk: string };
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

      /**
       * Levels GRANTED from outside the point budget: racial templates, GM
       * rulings, magic items. These change the derived value but are never
       * billed to the character.
       */
      bonuses: new fields.SchemaField({
        hp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        will: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        per: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        fp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        basicSpeed: new fields.NumberField({
          required: true, nullable: false, initial: 0, step: BASIC_SPEED_STEP,
        }),
        basicMove: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        dodge: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),

      /**
       * Levels BOUGHT with character points (GURPS Basic Set: Characters
       * pp. 14-17). Only these are billed to the points ledger.
       *
       * Basic Speed carries step 0.25 so an off-step value is rejected at the
       * data boundary rather than reaching the pricing helper, which would
       * otherwise charge nothing for an adjustment that still moved the score.
       */
      purchased: new fields.SchemaField({
        hp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        will: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        per: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        fp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        basicSpeed: new fields.NumberField({
          required: true, nullable: false, initial: 0, step: BASIC_SPEED_STEP,
        }),
        basicMove: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),

      hp: poolField(),
      fp: poolField(),

      points: new fields.SchemaField({
        starting: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 150 }),
        // A rule of thumb, not a hard cap (GURPS Lite p. 4).
        disadvantageLimit: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 75 }),
        /**
         * Points traded for money (Characters p. 26). "Unlike Wealth, points
         * traded for money do not appear on your character sheet -- they are
         * gone", so they are held here rather than as a trait, and spend
         * from the points the character was built on.
         */
        tradedForMoney: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        /**
         * Points earned since the character was made, one award at a time
         * (Campaigns pp. 292-294). The log is the record rather than a running
         * total, because "account for what has been spent" means being able to
         * say where every point came from -- and a total nobody can explain is
         * the thing a ledger exists to prevent.
         */
        awards: new fields.ArrayField(
          new fields.SchemaField({
            points: new fields.NumberField({
              required: true,
              nullable: false,
              integer: true,
              initial: 0,
            }),
            note: new fields.StringField({ required: true, blank: true, initial: "" }),
            /** Epoch milliseconds, for ordering the log. */
            at: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          }),
          { required: true, initial: [] },
        ),
      }),

      /**
       * How much they are wearing, for Bulletproof Nudity (Campaigns p. 417).
       * Ordinary clothing unless the rule is in play and somebody says
       * otherwise; it changes nothing while the rule is off.
       */
      dress: new fields.SchemaField({
        state: new fields.StringField({
          required: true, nullable: false, initial: "clothed",
          choices: ["clothed", "bares", "skimpy", "nude"],
        }),
        /** The book's extra +1 for a bare chest, which the player sets. */
        topless: new fields.BooleanField({ initial: false }),
      }),

      /**
       * Caught in a net, a bolas or a lariat (Campaigns pp. 410-411). The
       * book counts three successes to get out, and for a net three failures
       * in a row to be past getting out at all, so the count lives here
       * rather than in somebody's head.
       */
      entangled: new fields.SchemaField({
        kind: new fields.StringField({
          required: true, nullable: false, blank: true, initial: "",
          choices: ["", "net", "smallNet", "bolas", "lariat"],
        }),
        successes: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        failures: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        /** True past three failures running: "he must be cut free." */
        mustBeCut: new fields.BooleanField({ initial: false }),
        /**
         * Where it caught them (Campaigns pp. 410-411). A bolas does something
         * different to every part of the body, and a lariat round the neck is
         * a different Contest from one round the arm, so the escape is not the
         * whole of what is happening to them.
         */
        where: new fields.StringField({
          required: true, nullable: false, blank: true, initial: "",
          choices: ["", "torso", "arm", "hand", "weapon", "leg", "foot", "neck"],
        }),
        /** True where they were running when it caught them, which is what trips them. */
        running: new fields.BooleanField({ initial: false }),
      }),

      tl: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 3 }),

      /**
       * Size Modifier (GURPS Basic Set: Characters p. 19). Humans are SM 0.
       * It is a bonus for others to hit you and a penalty to be missed.
       */
      sm: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),

      /**
       * The maneuver taken this turn. It stays in effect until the next one is
       * chosen, and governs which active defenses are available
       * (GURPS Basic Set: Campaigns pp. 363-367).
       */
      maneuver: new fields.StringField({
        required: true,
        nullable: false,
        initial: "doNothing",
        choices: [...MANEUVER_ORDER],
      }),

      /** Consecutive Evaluate maneuvers taken, which accumulate +1 each to +3. */
      evaluateTurns: new fields.NumberField({
        required: true, nullable: false, integer: true, initial: 0, min: 0,
      }),

      /**
       * The Aim maneuver as it stands (Campaigns p. 364): how many turns have
       * been spent on it, and whether the weapon is braced. Lost -- turns back
       * to zero -- by firing, by being hurt, by defending, or by doing
       * anything else with the turn.
       */
      aim: new fields.SchemaField({
        turns: new fields.NumberField({
          required: true, nullable: false, integer: true, initial: 0, min: 0,
        }),
        braced: new fields.BooleanField({ initial: false }),
      }),

      /**
       * All-Out Attack option (GURPS Basic Set: Campaigns p. 365), which "you
       * must specify ... before you attack". Determined is +4 to hit in melee
       * and +1 at range; Strong is +2 damage, or +1 a die, for ST-based melee;
       * Double and Feint are a second action the table takes; Suppression Fire
       * is the ranged option for RoF 5+.
       */
      allOutAttackOption: new fields.StringField({
        required: true, nullable: false, initial: "determined",
        choices: ["determined", "double", "feint", "strong", "suppression"],
      }),

      /**
       * All-Out Defense option (GURPS Basic Set: Campaigns p. 366). Increased
       * Defense is +2 to ONE defense, named by `allOutDefenseTarget`; Double
       * Defense instead allows a second, different defense against one attack.
       */
      allOutDefenseOption: new fields.StringField({
        required: true, nullable: false, initial: "increased",
        choices: ["increased", "double"],
      }),
      allOutDefenseTarget: new fields.StringField({
        required: true, nullable: false, initial: "dodge",
        choices: ["dodge", "parry", "block"],
      }),

      posture: new fields.StringField({
        required: true,
        nullable: false,
        initial: "standing",
        choices: ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"],
      }),

      /** In the saddle, which caps active defenses by Riding (Campaigns p. 397). */
      mounted: new fields.BooleanField({ initial: false }),

      /**
       * Attribute levels a racial template granted (Characters p. 261).
       *
       * Apart from the bought ones because they are not billed: "there is no
       * added point cost for any of this! You paid for these bonuses or
       * penalties when you paid your racial cost." What the racial cost was is
       * recorded on the template entry below.
       */
      racial: new fields.SchemaField({
        ST: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        DX: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        IQ: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        HT: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),

      /**
       * The templates this character was built from (Characters pp. 258-263).
       *
       * Kept so that a template can be taken off again: applying one creates
       * items and moves numbers, and nothing else on the sheet would remember
       * which of them came from where.
       */
      templates: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          kind: new fields.StringField({
            required: true, nullable: false, initial: "character",
            choices: ["character", "racial", "lens", "metaTrait"],
          }),
          /** The template item this came from, for showing what it says. */
          uuid: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** Points billed for the modifiers themselves; a racial cost. */
          attributeCost: new fields.NumberField({
            required: true, nullable: false, integer: true, initial: 0,
          }),
          /** Attribute levels this one granted, so they can be given back. */
          granted: new fields.SchemaField({
            ST: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            DX: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            IQ: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            HT: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            hp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            will: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            per: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            fp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            basicSpeed: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
            basicMove: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
            /** Size, which stacks and comes back off with the rest. */
            sm: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
          }),
          /**
           * What the sheet held before, keyed by the path each value came
           * from ("attributes.ST", "purchased.hp"). Free-form because which
           * paths a template writes depends on the template.
           */
          previous: new fields.ObjectField({ required: true, initial: {} }),
          /**
           * What the template wrote to each of those paths. Removal puts a
           * value back only while it still reads this: one the player has
           * changed since is theirs, and is left alone.
           */
          written: new fields.ObjectField({ required: true, initial: {} }),
          /**
           * When it was applied, so an item edited since can be told from
           * one left as granted. Null on records made before this was kept.
           */
          at: new fields.NumberField({ required: true, nullable: true, initial: null }),
          /** The items it added, so removing it removes exactly those. */
          itemIds: new fields.ArrayField(
            new fields.StringField({ required: true, blank: true, initial: "" }),
            { required: true, initial: [] },
          ),
          /**
           * Items an earlier template added that this one raised, and what
           * they were, so taking it off lowers them again (p. 259).
           */
          raised: new fields.ArrayField(
            new fields.SchemaField({
              id: new fields.StringField({ required: true, blank: true, initial: "" }),
              points: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
              levels: new fields.NumberField({ required: false, nullable: true, initial: null }),
            }),
            { required: true, initial: [] },
          ),
        }),
        { required: true, initial: [] },
      ),

      /**
       * How this character's spells are read (Characters pp. 235, 242):
       * bought as skills off IQ plus Magery, or as techniques off a college
       * skill under Ritual Magic. "Auto" follows the traits -- Ritual Magery
       * without Magery means ritual -- and the two named choices override it
       * for a character who has both, or a GM who says otherwise.
       */
      magic: new fields.SchemaField({
        style: new fields.StringField({
          required: true,
          nullable: false,
          initial: "auto",
          choices: ["auto", "standard", "ritual"],
        }),
      }),

      /**
       * The spells this character has running (Characters pp. 237-238). Each
       * is what the sheet needs to keep it up or let it go: when it runs out
       * in world time, what maintaining it costs, and whether it is being
       * concentrated on, which is what decides the penalty on the next
       * casting. A permanent spell is not kept, since it carries no penalty
       * and nothing about it changes.
       */
      activeSpells: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: true, blank: false }),
          itemId: new fields.StringField({ required: true, blank: true, initial: "" }),
          name: new fields.StringField({ required: true, blank: true, initial: "" }),
          /** Energy the casting cost, after skill. */
          castCost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
          /** Energy to keep it up another interval, after skill; null where it cannot be kept up. */
          maintainCost: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 }),
          /** One interval of duration in seconds, or null where the book does not count it. */
          durationSeconds: new fields.NumberField({ required: true, nullable: true, initial: null, min: 0 }),
          /** World time at which it runs out, or null for a spell kept until dropped. */
          expiresAt: new fields.NumberField({ required: true, nullable: true, initial: null }),
          startedAt: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
          concentrating: new fields.BooleanField({ initial: false }),
          permanent: new fields.BooleanField({ initial: false }),
        }),
        { required: true, initial: [] },
      ),

      /**
       * Attributes something has temporarily knocked down (Campaigns p. 421).
       *
       * Kept apart from the attributes themselves, because a temporary penalty
       * is deliberately not the same thing as a lower attribute: it must not
       * touch hit points, Basic Speed, Basic Move, FP or any active defense.
       */
      attributePenalties: new fields.SchemaField({
        ST: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
        DX: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
        IQ: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
        HT: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, max: 0 }),
      }),

      /**
       * Which hand holds the weapon. In tactical combat the shield is on the
       * other side, and which side an attack comes from decides whether either
       * can be brought to bear (GURPS Basic Set: Campaigns p. 390).
       */
      handedness: new fields.StringField({
        required: true,
        nullable: false,
        initial: "right",
        choices: ["right", "left"],
      }),

      /**
       * A Wait maneuver's declared trigger and, for a ranged weapon, the area
       * being covered (GURPS Basic Set: Campaigns pp. 366, 390). A Wait only
       * works if you say in advance both what you are watching for and what
       * you will do, so both are written down rather than remembered.
       */
      wait: new fields.SchemaField({
        trigger: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** Hexes covered with a ready ranged weapon. One costs no penalty. */
        hexesWatched: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 1,
          min: 1,
        }),
        /** Watching a single straight line instead of an area, which is a flat -2. */
        coveringLine: new fields.BooleanField({ initial: false }),
      }),

      conditions: new fields.SchemaField({
        stunned: new fields.BooleanField({ initial: false }),
        allOutDefense: new fields.BooleanField({ initial: false }),
        blindToAttacker: new fields.BooleanField({ initial: false }),
        /**
         * Whether this character has already attacked this turn. An unbalanced
         * weapon cannot parry in a turn it has attacked in, or attack in a turn
         * it has parried (GURPS Basic Set: Characters p. 269, the "U" in the
         * Parry column), so the parry it offers depends on what has already
         * happened this turn and nothing else on the sheet can say.
         */
        attackedThisTurn: new fields.BooleanField({ initial: false }),
        /**
         * Sharing a hex with a foe (GURPS Basic Set: Campaigns p. 391). Only a
         * weapon that reaches close can be used there, and a ranged weapon
         * takes its Bulk in place of the speed/range penalty.
         */
        closeCombat: new fields.BooleanField({ initial: false }),
      }),

      /**
       * The radiation carried (Campaigns p. 435): the accumulated dose in
       * rads as of the moment it was last written, which is what it heals
       * from -- after thirty days, ten rads a day, to a tenth that stays.
       */
      radiation: new fields.SchemaField({
        dose: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        at: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      }),

      /** Cash in hand, in $ (Characters p. 25). Starting wealth less the gear is where it begins. */
      money: new fields.NumberField({ required: true, nullable: false, initial: 0 }),

      /**
       * A job (Campaigns pp. 516-518): what it is called, the skill it is
       * rolled against each month, the level of Wealth it pays at, and what
       * a critical failure brings down.
       */
      job: new fields.SchemaField({
        title: new fields.StringField({ required: true, blank: true, initial: "" }),
        skill: new fields.StringField({ required: true, blank: true, initial: "" }),
        level: new fields.StringField({
          required: true, nullable: false, initial: "average",
          choices: ["poor", "struggling", "average", "comfortable", "wealthy", "veryWealthy", "filthyRich"],
        }),
        /** A fixed wage, or freelance work paid by the margin (p. 516). */
        kind: new fields.StringField({
          required: true, nullable: false, initial: "wage", choices: ["wage", "freelance"],
        }),
        risk: new fields.StringField({ required: true, blank: true, initial: "" }),
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

  /**
   * What this body can do, given ST, Basic Lift and Move
   * (GURPS Basic Set: Campaigns pp. 349-355).
   *
   * Derived rather than looked up, because every one of these is arithmetic on
   * numbers already on the sheet, and a player who wants to know whether they
   * can clear the pit should be able to read it rather than work it out.
   *
   * Move here is Move after encumbrance, which is what a jump and a sprint
   * actually have to work with.
   */
  #physicalFeats(
    attrs: Record<string, number>,
    basicLift: number,
    move: number,
    traits: TraitEffects,
  ) {
    // "you may substitute half your skill level, rounded down, for Basic Move"
    // -- so the jump uses whichever of the two is better.
    const jump = jumpingMove(move, this.skillLevelByName("Jumping"));

    // "Those with Enhanced Move (Ground) may apply their movement multiplier to
    // Basic Move before inserting it into these formulas when they have a
    // running start. This is instead of adding the number of yards run!"
    //
    // The ceiling of twice the standing jump is not applied to that. It is
    // stated as part of the add-the-yards-you-ran rule, which Enhanced Move
    // replaces rather than extends, and the book's own example -- "a horse with
    // Basic Move 6 and Enhanced Move 1 makes running jumps as if its Basic Move
    // were 12" -- reads as a plain recomputation at the higher Move.
    const runningJump = (formula: (input: JumpInput) => number) =>
      traits.enhancedMove > 1
        ? formula({ move: jump * traits.enhancedMove })
        : formula({ move: jump, runningStartYards: 1 });

    // "Those who have Super Jump double the final jumping distance for each
    // level of that advantage. This is cumulative with the effects of Enhanced
    // Move!" -- so it is applied last, to whatever the rest came to.
    const leap = (distance: number) => afterSuperJump(distance, traits.superJump);

    return {
      jumping: {
        move: jump,
        high: leap(highJumpInches({ move: jump })),
        broad: leap(broadJumpFeet({ move: jump })),
        // One yard of run, which is the shortest run there is and the one a
        // fighter in a corridor actually gets -- unless Enhanced Move makes the
        // run itself the multiplier.
        highRunning: leap(runningJump(highJumpInches)),
        broadRunning: leap(runningJump(broadJumpFeet)),
      },
      lift: liftCapacities(basicLift),
      running: { sprint: sprintMove(move), paced: pacedMove(move) },
      swimming: {
        // "+2 water Move" for wearing nothing at all (Campaigns p. 417).
        move:
          waterMove(move, traits.aquatic) +
          (isRuleOn("bulletproofNudity")
            ? nudityMoveBonus(this.dress?.state ?? "clothed").water
            : 0),
        // "Swimming defaults to HT-4", and Climbing to DX-5: someone who never
        // learned either can still try.
        skill: this.skillLevelByName("Swimming") ?? (attrs.HT ?? 10) - 4,
      },
      climbing: { skill: this.skillLevelByName("Climbing") ?? (attrs.DX ?? 10) - 5 },
      // "Roll against DX-3 to hit a specific target, or against DX to lob
      // something into a general area", or Throwing skill for what fits in a
      // hand.
      throwing: {
        skill: this.skillLevelByName("Throwing") ?? (attrs.DX ?? 10) - 3,
        strength: attrs.ST ?? 10,
        basicLift,
      },
      lifting: { skill: this.skillLevelByName("Lifting") },
    };
  }

  /**
   * What an Influence skill nobody bought is rolled at (Characters pp. 187-224).
   *
   * All six default to an attribute at a penalty, and the penalties differ:
   * Fast-Talk and Streetwise are IQ-5, Diplomacy is IQ-6, Intimidation is
   * Will-5, Savoir-Faire is IQ-4, and Sex Appeal is HT-3.
   */
  private influenceDefault(
    name: string,
    attrs: { IQ?: number; HT?: number },
    will: number,
  ): number {
    const iq = attrs.IQ ?? 10;
    switch (name) {
      case "Diplomacy":
        return iq - 6;
      case "Savoir-Faire":
        return iq - 4;
      case "Sex Appeal":
        return (attrs.HT ?? 10) - 3;
      case "Intimidation":
        return will - 5;
      default:
        return iq - 5;
    }
  }

  /**
   * Levels bought in a technique, by name.
   *
   * A technique's own line on the sheet shows its level; what a dialog needs is
   * how many levels were bought, since that is what buys a penalty back.
   */
  private techniqueLevelsByName(name: string): number {
    const wanted = name.trim().toLowerCase();
    for (const item of this.itemsOfType("technique")) {
      if (String(item.name ?? "").trim().toLowerCase() !== wanted) continue;
      return Number((item.system as { derived?: { levels?: number } })?.derived?.levels) || 0;
    }
    return 0;
  }

  /** The score of a skill by name, or null when the character lacks it. */
  private skillLevelByName(name: string): number | null {
    if (!name) return null;
    // Compared through normalizeSkillName, because the book writes a skill's
    // "/TL" marker in the skill's own name and leaves it off everywhere it
    // refers to that skill: a revolver is used with "Guns (Pistol)", and the
    // skill it means is "Guns/TL (Pistol)".
    const wanted = normalizeSkillName(name);
    for (const item of this.itemsOfType("skill")) {
      if (normalizeSkillName(String(item.name)) === wanted) {
        return item.system?.derived?.level ?? null;
      }
    }
    return null;
  }

  /**
   * What the money comes to (Characters pp. 25-27, 265; Campaigns p. 517).
   *
   * Starting wealth is the tech level's figure times the level of Wealth;
   * the gear is what has been spent of it; the cost of living is what a
   * month at this Status costs; and the job pays at the level of Wealth it
   * was written for.
   */
  #wealth(traits: ReadonlyArray<{ name: string; levels?: number }>) {
    const standing = wealthFrom(traits);
    const status = statusFrom(traits);
    const tl = Number(this.tl) || 0;
    const gear = gearCost(
      this.items
        .filter((i) => i.system && typeof i.system.cost === "number")
        .map((i) => ({
          // Clothing is priced off the wearer's Status (p. 266).
          cost: this.#priceOf(i, status),
          quantity: Number(i.system.quantity ?? 1),
        })),
    );
    const jobLevel = String(this.job?.level ?? "average") as Exclude<WealthLevel, "multimillionaire" | "deadBroke">;
    const starting = startingWealth(tl, standing);
    const monthly = monthlyIncomeFromTraits(traits, starting);
    // Points spent on money and on Signature Gear, which buy from the
    // campaign's average rather than from this character's own wealth
    // (Characters pp. 26, 85).
    const traded = Math.max(0, Number(this.points?.tradedForMoney ?? 0) || 0);
    const signaturePoints = signatureGearPoints(traits);
    return {
      tradedPoints: traded,
      tradedForMoney: pointsForMoney(traded, tl),
      signatureGearPoints: signaturePoints,
      signatureGear: signatureGearValue(signaturePoints, tl),
      level: standing.level,
      multimillionaire: standing.multimillionaire,
      startingWealth: starting,
      gearCost: gear,
      money: Number(this.money) || 0,
      status,
      costOfLiving: costOfLiving(status),
      // Independent Income and Debt, a percentage of starting wealth a month (p. 26).
      independentIncome: monthly.income,
      debt: monthly.debt,
      averagePay: monthlyPay(tl, "average"),
      jobPay: this.job?.title ? monthlyPay(tl, jobLevel) : 0,
      jobKind: String(this.job?.kind ?? "wage"),
    };
  }

  /**
   * What an item costs this character (Characters p. 266).
   *
   * Nearly everything is sold at a price. An article of clothing is sold at
   * a share of the wearer's monthly cost of living, so its price is a fact
   * about who is wearing it.
   */
  #priceOf(item: any, status: number): number {
    const share = Number(item.system?.costOfLivingPercent ?? 0) || 0;
    if (share > 0) return clothingCost(share, status);
    return Number(item.system?.cost ?? 0) || 0;
  }

  /**
   * What the tools carried are worth to the skills they serve (Campaigns
   * p. 345), by skill name. The best grade carried wins: nobody operates
   * with the crash kit and the leaves at once.
   */
  #equipmentBonuses(tl: number): Record<string, number> {
    const best: Record<string, number> = {};
    if (!isRuleOn("equipmentModifiers")) return best;
    for (const item of this.itemsOfType("equipment")) {
      const sys = item.system as any;
      if (sys?.carried === false) continue;
      const skills: string[] = Array.isArray(sys?.forSkills) ? sys.forSkills : [];
      if (skills.length === 0) continue;
      const bonus = equipmentQualityModifier(String(sys.equipmentQuality ?? "basic") as EquipmentQuality, { tl });
      for (const raw of skills) {
        const skill = String(raw ?? "").trim();
        if (!skill) continue;
        if (best[skill] === undefined || bonus > best[skill]) best[skill] = bonus;
      }
    }
    return best;
  }

  /** What is left of the dose written on the sheet, as of now (Campaigns p. 435). */
  #radiation() {
    const stored = this.radiation ?? { dose: 0, at: 0 };
    const days = stored.at > 0 ? (Date.now() - stored.at) / 86400000 : 0;
    const dose = Math.round(remainingDose(Number(stored.dose) || 0, days) * 10) / 10;
    const row = radiationRow(dose);
    return { dose, htModifier: row?.htModifier ?? 0, exposed: dose >= 1 };
  }

  /** How old, and how often the aging roll comes round (Campaigns p. 444). */
  #aging(traits: ReadonlyArray<{ name: string; levels?: number }>) {
    const lifespan = lifespanFrom(traits);
    const parsed = parseInt(String(this.details?.age ?? ""), 10);
    const age = Number.isFinite(parsed) ? parsed : null;
    return {
      age,
      rollsPerYear: age === null ? 0 : agingRollsPerYear(age, lifespan),
      longevity: lifespan.longevity,
      unaging: lifespan.unaging,
      lifespanMultiplier: lifespan.multiplier,
    };
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();
    this.derived = this.buildDerived();
  }

  /**
   * What this character's spells come to (Characters pp. 235, 242).
   *
   * Under the standard system a spell is a skill off IQ plus Magery. Under
   * Ritual Magic it is a technique off the college skill, at -1 per
   * prerequisite, and a ritual mage "can ignore the spell's prerequisites
   * under the standard system" -- so the check is only made for the standard
   * style. Either way the level lands on the item, where the tab reads it.
   */
  #resolveSpells(
    attrs: Record<string, number>,
    will: number,
    per: number,
    talent: MagicTalent,
    magicResistance: number,
  ) {
    const style: MagicStyle = magicStyleFor(this.magic?.style ?? "auto", talent);
    const magery = mageryForStyle(style, talent);
    const spells = this.itemsOfType("spell");

    // Every spell on the sheet, for the prerequisites that count them. A
    // spell with no points is written down but not known (p. 235), which the
    // checker decides for itself from the points.
    const knownSpells: KnownSpell[] = spells.map((item) => ({
      name: String(item.name ?? ""),
      colleges: (item.system?.colleges ?? []) as string[],
      points: Number(item.system?.points ?? 0),
    }));
    const traitNames = new Set(
      this.itemsOfType("trait").map((t) => normalizeSkillName(String(t.name ?? ""))),
    );
    const context = {
      magery,
      attributes: { ...attrs, Will: will, Per: per } as Record<SkillAttribute, number>,
      spells: knownSpells,
      hasTrait: (name: string) => traitNames.has(normalizeSkillName(name)),
      hasSkill: (name: string) => this.skillLevelByName(name) !== null,
    };

    for (const item of spells) {
      const sys = item.system as {
        difficulty: "H" | "VH"; points: number; bonus: number; colleges: string[];
        prerequisiteCount: number; prerequisites: string; mageryRequired: number;
        derived?: SpellDerived;
      };
      const points = Number(sys.points ?? 0);
      const bonus = Number(sys.bonus ?? 0);
      const relativeLevel = spellRelativeLevel(points, sys.difficulty);

      if (style === "ritual") {
        // The best college skill the spell can be read off; a spell of two
        // colleges belongs to both and a ritual mage uses whichever they know.
        let collegeSkill: string | null = null;
        let collegeLevel: number | null = null;
        for (const college of sys.colleges ?? []) {
          for (const name of collegeSkillNames(college)) {
            const level = this.skillLevelByName(name);
            if (level !== null && (collegeLevel === null || level > collegeLevel)) {
              collegeSkill = name;
              collegeLevel = level;
            }
          }
        }
        const resolved =
          collegeLevel === null
            ? null
            : ritualSpellLevel({
                collegeLevel,
                prerequisiteCount: Number(sys.prerequisiteCount ?? 0),
                points,
                bonus,
              });
        sys.derived = {
          level: resolved?.level ?? null,
          relativeLevel,
          style,
          collegeSkill,
          levels: resolved?.levels ?? 0,
          cappedByCollege: resolved?.cappedByCollege ?? false,
          needsMagery: false,
          prerequisitesMet: true,
          missing: [],
        };
        continue;
      }

      // The Magery the spell requires is a field of its own as well as
      // whatever the prerequisite line says, so a spell that states only
      // "Magery 2" in its field is still held to it.
      const mageryRequired = Number(sys.mageryRequired ?? 0);
      const clauses = parsePrerequisites(String(sys.prerequisites ?? ""));
      if (mageryRequired > 0) clauses.push([{ kind: "magery", level: mageryRequired }]);
      const check = checkPrerequisites(clauses, context);
      sys.derived = {
        level: spellLevel({ iq: attrs.IQ ?? 10, magery, points, difficulty: sys.difficulty, bonus }),
        relativeLevel,
        style,
        collegeSkill: null,
        levels: 0,
        cappedByCollege: false,
        needsMagery: magery === null,
        prerequisitesMet: check.met,
        missing: check.missing,
      };
    }

    return {
      style,
      preference: this.magic?.style ?? "auto",
      magery,
      // What the traits say, whichever style is in use, for the tab's header.
      standardMagery: talent.magery,
      ritualMagery: talent.ritualMagery,
      magicResistance,
      // What the spells still running cost the next casting (p. 238).
      ...activeSpellCounts(this.activeSpells ?? []),
    };
  }

  private buildDerived() {
    // What this character's traits do to the numbers. Read first, because a
    // few of them are the numbers: Extra ST is a point of ST wherever ST is
    // read, and everything below reads it.
    const heldTraits = this.itemsOfType("trait").map((item) => ({
      name: String(item.name ?? ""),
      levels: Number(item.system?.levels ?? 0),
      // Injury Tolerance keeps its kind in its modifiers, and Temperature
      // Tolerance which side of the thermometer it was bought for.
      modifiers: ((item.system?.modifiers ?? []) as Array<{ name?: string }>).map((m) =>
        String(m.name ?? ""),
      ),
      // A reaction modifier typed onto the trait by the GM.
      reactionModifier: Number(item.system?.reactionModifier ?? 0) || 0,
      // A Talent's own list of skills, which is all a Talent from another book has.
      talentSkills: ((item.system?.talentSkills ?? []) as unknown[]).map((s) => String(s)),
      // The power the trait belongs to, and whether it is that power's Talent,
      // as a book's entry states them; a Talent's cap is its maximum level.
      power: String(item.system?.power ?? ""),
      powerTalent: item.system?.powerTalent === true,
      maxLevels: Number(item.system?.maxLevels ?? 0) || 0,
    }));
    const traits = traitEffects(heldTraits);
    // What the afflictions on this character come to (pp. 428-429). Read once,
    // because the penalties reach the attributes, the defenses and the sheet.
    // Pain Threshold changes what pain and agony cost (p. 428).
    const afflicted = afflictionsOn(this.parent, painThresholdOf(traits));
    // Levels of the Appearance advantage: Attractive is 1, and nothing below
    // it counts for Bulletproof Nudity (p. 417).
    const appearanceLevels = Math.max(
      0,
      ...heldTraits
        .filter((t) => t.name.trim().toLowerCase() === "appearance")
        .map((t) => Math.max(1, Math.floor(t.levels) || 1)),
    );
    // Talents: a level each to every skill on the talent's list (p. 89).
    const talents = talentBonuses(heldTraits);

    // The attributes as bought on the sheet, plus what traits add to them.
    // The points ledger bills the bought figure; the trait bills itself.
    // A racial template's modifiers move the score alongside the bought
    // levels and the traits, and are billed by neither: the racial cost paid
    // for them (Characters p. 261).
    const bought = this.attributes;
    const racial = this.racial;
    const attrs = {
      ST: bought.ST + traits.attributes.ST + racial.ST,
      DX: bought.DX + traits.attributes.DX + racial.DX,
      IQ: bought.IQ + traits.attributes.IQ + racial.IQ,
      HT: bought.HT + traits.attributes.HT + racial.HT,
    };
    // Striking ST counts for damage alone and Lifting ST for what can be
    // carried, so each is its own figure rather than a change to ST.
    // Arm ST is both: strength "for the purpose of lifting or striking with
    // that arm", and for nothing that is not done with the arms.
    // "ST reductions affect the damage you inflict with muscle-powered
    // weapons" (p. 421), so a temporary ST penalty comes off the ST damage is
    // looked up at -- and only there: it leaves HP, Basic Lift and every other
    // ST-based figure alone, which is why it is applied to this and not to ST.
    // Very tired is different, and deliberately absent: halved ST "does not
    // affect ST-based quantities, such as HP and damage" (p. 426).
    const strikingSt = strengthForDamage({
      strength: attrs.ST + traits.strikingSt + traits.armSt,
      penalties: { ST: this.attributePenalties.ST },
    });
    const liftingSt = attrs.ST + traits.liftingSt + traits.armSt;

    // Granted and purchased levels both move the score; only purchased ones
    // are billed, which is why they are stored apart. Levels bought as traits
    // are billed by the trait.
    const p = this.purchased;
    const b = this.bonuses;
    const t = traits.secondary;
    const secondary = secondaryCharacteristics(attrs, {
      hp: b.hp + p.hp + t.hp,
      will: b.will + p.will + t.will,
      per: b.per + p.per + t.per,
      fp: b.fp + p.fp + t.fp,
      basicSpeed: b.basicSpeed + p.basicSpeed + t.basicSpeed,
      basicMove: b.basicMove + p.basicMove + t.basicMove,
    });
    secondary.basicLift = basicLift(liftingSt);
    // Lame legs are read here, before encumbrance takes its share: half of
    // Basic Speed, or 2, or none (p. 141).
    secondary.basicMove = lameMove(secondary.basicMove, traits.lame, secondary.basicSpeed);
    // "Total nudity ... adds +1 to Move and +2 water Move" (p. 417). It goes
    // on Basic Move, before encumbrance takes its share -- somebody wearing
    // nothing is not carrying their clothes either.
    const bare = isRuleOn("bulletproofNudity")
      ? nudityMoveBonus(this.dress?.state ?? "clothed")
      : { move: 0, water: 0 };
    secondary.basicMove += bare.move;

    this.hp.max = secondary.hp;
    this.fp.max = secondary.fp;

    // ── skills ──────────────────────────────────────────────────────────
    // Resolved here rather than on the item, because a skill's absolute level
    // needs the owning actor's attributes.
    //
    // Will and Per are secondary characteristics, so a skill based on either
    // has to wait for them to be derived above.
    // "Wearing an extra layer of armor anywhere but on the head gives -1 to
    // DX and DX-based skills" (Characters p. 286). One funnel feeds every
    // skill's level, so the penalty is applied where DX is read.
    const wornPieces = this.itemsOfType("armor")
      .filter((item: any) => item.system?.equipped)
      .map((item: any) => ({
        dr: Number(item.system?.dr ?? 0),
        drSplit: item.system?.drSplit ?? null,
        drSplitAppliesTo: item.system?.drSplitAppliesTo ?? [],
        locations: item.system?.locations ?? [],
        flexible: item.system?.flexible === true,
        frontOnly: item.system?.frontOnly === true,
        concealable: item.system?.concealable === true,
      }));
    const layering = isRuleOn("layeredArmor") ? layeringPenalty(wornPieces) : 0;

    const attributeScore = (a: SkillAttribute): number => {
      if (a === "Will") return secondary.will;
      if (a === "Per") return secondary.per;
      return a === "DX" ? attrs.DX + layering : attrs[a];
    };

    // "The quality of your equipment modifies your skill rolls for tasks
    // that normally require equipment" (Campaigns p. 345): what is carried,
    // by the skill it is the tools of.
    const toolBonuses = this.#equipmentBonuses(Number(this.tl) || 0);

    const skillItems = this.itemsOfType("skill");

    // What the character's Magery is, before the skills it adds to are read.
    const talent: MagicTalent = { magery: traits.magery, ritualMagery: traits.ritualMagery };

    // Pass one: levels that depend only on attributes.
    for (const item of skillItems) {
      const sys = item.system as {
        attribute: SkillAttribute; difficulty: Difficulty; points: number; bonus: number;
        defaults?: Array<{ from: string; attribute: SkillAttribute; skill: string; modifier: number }>;
        derived?: Record<string, unknown>;
      };
      // namedDefaultLevel applies the Rule of 20, so a Per 25 default at -5
      // lands on 15 rather than 20.
      const attributeDefaults = (sys.defaults ?? [])
        .filter((d) => d.from !== "skill")
        .map((d) => namedDefaultLevel(attributeScore(d.attribute), d.modifier));

      // Magery goes on Thaumatology (p. 66), and Ritual Magery on the ritual
      // style's core and college skills (p. 242): the one place a trait adds
      // to a skill by name rather than through an attribute.
      // What the talents add to this skill by name, on top of anything typed
      // into the skill's own bonus field.
      const talentBonus = talentBonusFor(String(item.name ?? ""), talents, {
        difficulty: sys.difficulty,
        wildcardsExcluded: isRuleOn("talentsSkipWildcards"),
      });
      // The tools of this trade, if any are carried (Campaigns p. 345).
      const toolBonus = toolBonuses[String(item.name ?? "").trim()] ?? 0;
      const resolved = effectiveSkillLevel({
        attributeScore: attributeScore(sys.attribute),
        difficulty: sys.difficulty,
        points: sys.points,
        bonus: sys.bonus + magicSkillBonus(String(item.name ?? ""), talent) + talentBonus + toolBonus,
        defaults: attributeDefaults,
      });
      sys.derived = {
        level: resolved?.level ?? null,
        fromDefault: resolved?.fromDefault ?? true,
        relativeLevel: relativeLevelForPoints(sys.points, sys.difficulty),
        hasDefault: attributeDefaults.length > 0,
        talentBonus,
        toolBonus,
      };
    }

    // Pass two: defaults that come from another skill. A skill defaulting from
    // one the character also lacks resolves against that skill's own default,
    // which pass one has already settled.
    for (const item of skillItems) {
      const sys = item.system as any;
      const skillDefaults = (sys.defaults ?? [])
        .filter((d: any) => d.from === "skill")
        .map((d: any) => {
          const source = this.skillLevelByName(d.skill);
          return source === null ? null : source + d.modifier;
        })
        .filter((v: number | null): v is number => v !== null);

      if (!skillDefaults.length) continue;
      const best = Math.max(...skillDefaults);
      if (sys.derived.level === null || best > sys.derived.level) {
        sys.derived.level = best;
        sys.derived.fromDefault = true;
        sys.derived.hasDefault = true;
      }
    }

    // ── techniques ──────────────────────────────────────────────────────
    for (const item of this.itemsOfType("technique")) {
      const sys = item.system as any;
      const prerequisiteLevel = this.skillLevelByName(sys.prerequisite);
      if (prerequisiteLevel === null) {
        sys.derived = { level: null, levels: 0, cappedByPrerequisite: false };
        continue;
      }
      sys.derived = resolveTechnique({
        prerequisiteLevel,
        defaultModifier: sys.defaultModifier,
        levels: techniqueLevelsForPoints(sys.points, sys.difficulty),
        maxRelativeToPrerequisite: sys.maxRelativeToPrerequisite,
      });
    }

    // ── spells ──────────────────────────────────────────────────────────
    const magic = this.#resolveSpells(attrs, secondary.will, secondary.per, talent, traits.magicResistance);

    // ── magic items ─────────────────────────────────────────────────────
    // What the enchantments on the gear come to where the character is
    // (Campaigns pp. 480-482): an item's Power is -5 in low mana and nothing
    // with none, and an effect whose Power does not reach 15 here does nothing.
    const mana = manaHere();
    const magicOf = (item: Record<string, any>): ItemMagic =>
      readEnchantments(isRuleOn("magicItems") ? (item.system?.enchantments ?? []) : [], mana);
    const magicItems = this.items
      .filter((i) => ["equipment", "armor", "shield"].includes(i.type) && (i.system?.enchantments ?? []).length > 0)
      .filter((i) => i.system?.carried !== false)
      .map((i) => ({
        itemId: String(i.id),
        name: String(i.name ?? ""),
        equipped: Boolean(i.system?.equipped),
        magic: magicOf(i),
      }));

    // ── protection ──────────────────────────────────────────────────────
    // DR is tracked per location: a breastplate covering torso and vitals must
    // not protect the head. Armor listing no locations covers the whole body,
    // which keeps items written for the Lite rules working.
    const drByLocation = Object.fromEntries(
      HIT_LOCATION_ORDER.map((loc) => [loc, HIT_LOCATIONS[loc].extraDr]),
    ) as Record<HitLocation, number>;

    const armorItems = this.itemsOfType("armor").filter((i) => i.system?.equipped);
    const worn: ArmorPiece[] = armorItems.map((item) => ({
      // Fortify "Increases the DR of clothing or a suit of armor" (p. 480).
      dr: Number(item.system?.dr ?? 0) + magicOf(item).fortify,
      drSplit: item.system?.drSplit ?? null,
      drSplitAppliesTo: item.system?.drSplitAppliesTo ?? [],
      locations: item.system?.locations ?? [],
    }));

    // The Damage Resistance advantage is armour the character is: it covers
    // everything, which is what an empty location list means here, and it goes
    // in with the rest so the sheet shows the DR the damage pipeline will
    // actually subtract.
    if (traits.damageResistance > 0) {
      worn.push({
        dr: traits.damageResistance,
        drSplit: null,
        drSplitAppliesTo: [],
        locations: [],
      });
    }

    // Armour written "4/2" stops one kind of attack better than another, and two
    // passes are not enough to describe that: mail takes its lower DR against
    // crushing alone while a ballistic vest takes its lower against five more
    // types, so worn together against an impaling attack the total is neither
    // the all-cutting nor the all-crushing sum. Each location is resolved across
    // every damage type instead, and grouped.
    // The headline figure is each location's own highest band, not the DR
    // against any one damage type. Reading it from a cutting pass assumed
    // cutting is always the base, and the sheet lets a GM tick "cut" among the
    // types a split applies to -- armour at 4/2 against crushing and cutting
    // would then have headlined as 2 while its profile led with 4.
    const profiles = Object.fromEntries(
      HIT_LOCATION_ORDER.map((loc) => [loc, splitSummary(worn, loc)]),
    ) as Record<HitLocation, ReturnType<typeof splitSummary>>;
    for (const loc of HIT_LOCATION_ORDER) drByLocation[loc] = profiles[loc].bands[0]?.dr ?? 0;

    // The headline DR figure stays the torso, which is what an unaimed blow hits.
    const dr = drByLocation.torso;

    const shieldItem = this.itemsOfType("shield").find((i) => i.system?.equipped) ?? null;
    // "If the shield is disabled or destroyed, it no longer provides its DB,
    // but it still encumbers you until dropped" (Campaigns p. 484).
    const shieldHp = shieldItem ? Number(shieldItem.system?.hp ?? 0) || 0 : 0;
    const shieldBroken =
      isRuleOn("damageToShields") && shieldHp > 0 &&
      !shieldGivesDb(shieldState(Number(shieldItem?.system?.hpLost ?? 0) || 0, shieldHp));
    const shieldDb = shieldItem && !shieldBroken ? Number(shieldItem.system?.db ?? 0) : 0;
    // Deflect "Adds a Defense Bonus to armor, clothing, a shield, or a weapon.
    // This adds to all active defense rolls made by the user" (p. 480).
    const deflectDb = this.items
      .filter((i) => ["equipment", "armor", "shield"].includes(i.type) && i.system?.equipped)
      .reduce((sum, i) => sum + magicOf(i).deflect, 0);
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
    // Fatigue has a chart of its own, with the same two halvings on it: someone
    // who has not eaten in three days moves and dodges like someone bleeding.
    const veryTired = isVeryTired(this.fp.value, this.fp.max);

    // ── attacks ─────────────────────────────────────────────────────────
    const melee: DerivedAttack[] = [];
    const ranged: DerivedAttack[] = [];

    /**
     * The ST is passed in rather than closed over, because a bow or crossbow
     * rolls damage from its own ST and not the archer's (GURPS Basic Set:
     * Characters p. 270). Reading attrs.ST here made the range obey that rule
     * while the damage quietly ignored it.
     */
    const resolveDamage = (
      st: number,
      base: "thr" | "sw" | "fixed",
      modifier: number,
      formula: string,
      minSt: number | null,
      extraDice = 0,
    ): string => {
      if (base === "fixed") {
        const parsed = parseDiceAdds(formula);
        return parsed ? formatDiceAdds(parsed) : formula || "—";
      }
      return formatDiceAdds(weaponDamage(st, base, modifier, minSt, extraDice));
    };
    // "spec." on the table (Characters p. 269): the weapon's own rules say
    // what a hit does, and there is no damage to roll.
    const SPECIAL = game.i18n.localize("GWORLD.Item.SpecialDamageShort");

    // A shield is a weapon as well as a defense: bashing with it is an ordinary
    // melee attack (GURPS Basic Set: Characters p. 273). Only an equipped one
    // is on the list, since you cannot hit anyone with a shield in your pack.
    const armed = [
      ...this.itemsOfType("equipment"),
      ...this.itemsOfType("shield").filter((i) => i.system?.equipped),
    ];

    // "-3 to use any skill that requires the use of your legs, including all
    // Melee Weapon and unarmed combat skills (but not ranged combat skills)"
    // (p. 141): read into the melee levels, so the parry built on them follows.
    const legs = lameCombatPenalty(traits.lame);

    /**
     * The level a weapon's skill is rolled at: the character's own if they
     * have the skill, else the book's default for it. A pistol in the hands
     * of somebody who never learned Guns is still a pistol, at DX-4.
     */
    const weaponSkill = (name: string, melee = false): { level: number | null; atDefault: boolean } => {
      const own = this.skillLevelByName(name);
      if (own !== null) return { level: own + (melee ? legs : 0), atDefault: false };
      const listed = catalogSkill(name);
      if (!listed) return { level: null, atDefault: false };
      const level = defaultLevelFrom(
        listed.defaults,
        attributeScore,
        (other) => this.skillLevelByName(other),
      );
      return { level: level === null ? null : level + (melee ? legs : 0), atDefault: level !== null };
    };

    for (const item of armed) {
      const sys = item.system as {
        meleeModes?: any[]; rangedModes?: any[]; equipped?: boolean;
      };
      // Accuracy adds to the user's skill with the weapon and Puissance to
      // its basic damage (Campaigns pp. 480-481).
      const magic = magicOf(item);
      const enchantedSkill = (found: { level: number | null; atDefault: boolean }) =>
        found.level === null ? found : { ...found, level: found.level + magic.accuracy };

      // The grade it was bought in and what it is made of (Characters
      // pp. 274-275): a fine blade cuts a point deeper, a fine rifle is a
      // point more accurate and jams a point later, a stone edge faces
      // double DR. And what it is as an object (Campaigns p. 483): its
      // weight, and the DR and HP that weight gives it, which say whether it
      // still works and whether a parry can meet it.
      const modesOf = [...(sys.meleeModes ?? []), ...(sys.rangedModes ?? [])];
      const skillsOf = modesOf.map((m: any) => String(m.skill ?? ""));
      const typesOf = modesOf.map((m: any) => String(m.damageType ?? "") as DamageType);
      const quality = (isRuleOn("weaponQuality") ? String((sys as any).quality ?? "good") : "good") as WeaponQuality;
      const material = String((sys as any).material ?? "") as WeaponMaterial;
      const weaponClass = (String((sys as any).weaponClass ?? "") ||
        weaponClassOf({
          skills: skillsOf,
          damageTypes: typesOf,
          hasMalfunction: (sys.rangedModes ?? []).some((m: any) => m.malfunction),
          isFencing: (sys.meleeModes ?? []).some((m: any) => m.isFencing),
        })) as WeaponClass;
      const firearm = weaponClass === "firearm";
      const weight = Number((sys as any).weight ?? 0) || 0;
      const objectHp = item.type === "shield" ? Number((sys as any).hp ?? 0) || 0 : weaponHitPoints(weight, firearm);
      const hpLost = Number((sys as any).hpLost ?? 0) || 0;
      const condition: WeaponCondition =
        isRuleOn("weaponBreakage") && objectHp > 0 ? weaponCondition(weaponState(hpLost, objectHp)) : "sound";
      const brokenKind = brokenWeaponKindFor({
        skill: skillsOf[0] ?? "",
        weightLbs: weight,
        ranged: (sys.meleeModes ?? []).length === 0,
      });
      // "An extremely light weapon... or a missile weapon... is useless even
      // when merely disabled" (Campaigns p. 485); anything destroyed is.
      const wrecked =
        condition === "destroyed" ||
        (condition === "disabled" && (brokenKind === "light" || brokenKind === "missile"));
      const resists = resistsBreakage({
        quality,
        solidCrushing: isSolidCrushing(skillsOf[0] ?? "", typesOf),
        magic: Array.isArray((sys as any).enchantments) && (sys as any).enchantments.length > 0,
        firearm,
        wheelLockOrGuidedOrBeam: skillsOf.some((s) => /Beam Weapons|Guided Missile/i.test(s)),
      });
      const withQuality = (damage: string, type: DamageType): string => {
        const bonus = qualityDamageBonus(quality, type, material);
        if (!bonus) return damage;
        const parsed = parseDiceAdds(damage);
        return parsed ? formatDiceAdds(addModifier(parsed, bonus)) : damage;
      };
      // What a weapon takes to hold depends on what is holding it up
      // (Campaigns p. 411): a bipod under a prone shooter cuts the ST
      // requirement to two thirds, and a mount lifts it entirely. The field
      // recording which was already on every ranged mode and had never been
      // read by anything.
      const supported = (minSt: number | null, mount: string) =>
        supportEffect({
          support: mount === "mounted" ? "tripod" : mount === "bipod" ? "bipod" : "hands",
          minimumSt: minSt,
          prone: this.posture === "lying",
        }).minimumSt;
      const lacking = isRuleOn("minimumSt")
        ? (minSt: number | null, mount = "") => minStPenalty(attrs.ST, supported(minSt, mount))
        : () => 0;
      const short = (found: { level: number | null; atDefault: boolean }, minSt: number | null) =>
        found.level === null ? found : { ...found, level: found.level + lacking(minSt) };
      const withPuissance = (damage: string): string => {
        if (!magic.puissance) return damage;
        const parsed = parseDiceAdds(damage);
        return parsed ? formatDiceAdds(addModifier(parsed, magic.puissance)) : damage;
      };

      // Swung and not yet readied again: the whole item is down, whichever of
      // its modes was used.
      const unready = Boolean((sys as any).unready);

      (sys.meleeModes ?? []).forEach((mode: any, index: number) => {
        const { level: skillLevel, atDefault } = short(enchantedSkill(weaponSkill(mode.skill, true)), mode.minSt ?? null);
        const meleeDamage = mode.damageSpecial ? SPECIAL : withQuality(withPuissance(resolveDamage(
          strikingSt, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
          Number(mode.damageExtraDice ?? 0) || 0,
        )), mode.damageType);
        melee.push({
          itemId: item.id,
          modeIndex: index,
          name: item.name,
          mode: mode.name ?? "",
          skillName: mode.skill ?? "",
          skillLevel,
          atDefault,
          natural: false,
          unready,
          // "‡ ... becomes unready after you attack with it, unless you have
          // at least 1.5 times the listed ST" -- and it is the arms that hold it.
          readiesAfterAttack: becomesUnreadyAfterAttack({
            unreadyAfterAttack: Boolean(mode.unreadyAfterAttack),
            st: strikingSt,
            minSt: mode.minSt ?? null,
          }),
          damage: meleeDamage,
          damageType: mode.damageSpecial ? "" : mode.damageType,
          // "A stone blade has an armor divisor of (0.5)" (Characters p. 275).
          armorDivisor: materialArmorDivisor(material, mode.damageType) ?? mode.armorDivisor ?? 1,
          damageRollable: !mode.affliction && !mode.damageSpecial && parseDiceAdds(meleeDamage) !== null,
          weight,
          quality,
          material,
          resistsBreakage: resists,
          minStPenalty: lacking(mode.minSt ?? null),
          condition,
          twoHanded: Boolean(mode.twoHanded),
          swung: mode.damageBase === "sw",
          // A big fighter's arms are longer, so their weapons reach further
          // (Campaigns p. 402). Only the upper end moves.
          reach: reachForSize(String(mode.reach ?? "C"), this.sm),
          parry:
            mode.canParry && skillLevel !== null
              ? baseParry(skillLevel) + (mode.parryModifier ?? 0) + traits.enhancedParry.all
              : null,
          parryModifier: Number(mode.parryModifier ?? 0) || 0,
          minSt: mode.minSt ?? null,
          // Inside a foe's hex only a weapon that reaches close is any use --
          // and "you cannot use two-handed weapons" with One Arm (p. 147).
          usable:
            (!isRuleOn("closeCombat") ||
              !this.conditions.closeCombat ||
              usableInCloseCombat(String(mode.reach ?? "C"))) &&
            !(traits.oneArm && Boolean(mode.twoHanded)) &&
            !wrecked,
          unbalanced: Boolean(mode.unbalanced),
          isFencing: Boolean(mode.isFencing),
          // Which critical miss table a fumble is read on is decided by the
          // skill: a Karate kick fumbles differently from a dropped axe.
          unarmed: isUnarmedSkill(mode.skill),
          stBased: mode.damageBase === "thr" || mode.damageBase === "sw",
          damageBase: String(mode.damageBase ?? ""),
          damageModifier: Number(mode.damageModifier ?? 0) || 0,
          explosive: Boolean(mode.explosive),
          fragmentation: mode.fragmentation ?? "",
          affliction: Boolean(mode.affliction),
          afflictionAttribute: mode.afflictionAttribute ?? "",
          afflictionModifier: Number(mode.afflictionModifier ?? 0),
        });
      });

      (sys.rangedModes ?? []).forEach((mode: any, index: number) => {
        // Bows and crossbows use their own ST for damage and range; a thrown
        // weapon uses the thrower's, Striking ST included.
        const st = mode.weaponSt ?? strikingSt;
        // "Thrown weapons, and arrows and bolts, use the rules under Melee
        // Weapon Quality" (Characters p. 276): the cutting and impaling bonus
        // is theirs; a firearm's fine grade is in its Acc and Malf. instead.
        const rangedDamage = mode.damageSpecial ? SPECIAL : (firearm ? (d: string) => d : (d: string) => withQuality(d, mode.damageType))(
          withPuissance(resolveDamage(
            st, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
            Number(mode.damageExtraDice ?? 0) || 0,
          )),
        );
        // What it is loaded with changes the wound, the divisor, the range
        // and, for APDS, the damage (Characters pp. 276, 279).
        const round = isRuleOn("ammunitionTypes")
          ? ammunitionEffect((mode.ammunition ?? "") as AmmunitionType, {
              damageType: mode.damageType,
              armorDivisor: materialArmorDivisor(material, mode.damageType) ?? mode.armorDivisor ?? 1,
              calibreMm: calibreOf(String(item.name ?? "")),
              tl: Number((sys as any).tl) || 0,
              bow: weaponClass === "bow",
            })
          : null;
        const loadedDamage = (damage: string): string => {
          if (!round?.perDieBonus) return damage;
          const parsed = parseDiceAdds(damage);
          return parsed ? formatDiceAdds(addModifier(parsed, round.perDieBonus * parsed.dice)) : damage;
        };
        const stretch = qualityRangeMultiplier(weaponClass, quality) * (round?.rangeMultiplier ?? 1);
        const baseRange = mode.rangeIsStMultiple
          ? musclePoweredRange(mode.weaponSt ?? attrs.ST, mode.halfDamageRange, mode.maxRange)
          : { halfDamage: mode.halfDamageRange, max: mode.maxRange };
        const range = {
          halfDamage: Math.round((Number(baseRange.halfDamage) || 0) * stretch),
          max: Math.round((Number(baseRange.max) || 0) * stretch),
        };
        // The count of shots (Campaigns p. 373): what the column holds, and
        // what is in the weapon now. A thrown weapon keeps no count.
        const shotsEntry = parseShots(String(mode.shots ?? ""));
        const shotsCapacity = isRuleOn("reloading") && !shotsEntry.thrown ? fullLoad(shotsEntry) : 0;
        const shotsLoaded = shotsCapacity > 0 ? Math.min(shotsCapacity, Math.max(0, Number(mode.loaded ?? 0) || 0)) : 0;
        const { level: skillLevel, atDefault } = short(enchantedSkill(weaponSkill(mode.skill)), mode.minSt ?? null);

        ranged.push({
          itemId: item.id,
          modeIndex: index,
          name: item.name,
          mode: mode.name ?? "",
          skillName: mode.skill ?? "",
          skillLevel,
          atDefault,
          natural: false,
          unready: false,
          readiesAfterAttack: false,
          projectiles: Math.max(1, Number(mode.projectiles ?? 1)),
          halfDamageRange: Number(range.halfDamage ?? 0) || 0,
          maxRange: Number(range.max ?? 0) || 0,
          guidance: String(mode.guidance ?? ""),
          areaAttack: Boolean(mode.areaAttack),
          coneMaxWidth: Number(mode.coneMaxWidth ?? 0) || 0,
          damage: loadedDamage(rangedDamage),
          damageType: mode.damageSpecial ? "" : (round?.damageType ?? mode.damageType),
          armorDivisor: round?.armorDivisor ?? materialArmorDivisor(material, mode.damageType) ?? mode.armorDivisor ?? 1,
          shotsLoaded,
          shotsCapacity,
          reloadSeconds: shotsCapacity > 0 ? reloadTime(shotsEntry, shotsCapacity) : null,
          reloadable: shotsCapacity > 0 && shotsLoaded < shotsCapacity,
          empty: shotsCapacity > 0 && shotsLoaded === 0,
          ammunition: (mode.ammunition ?? "") as AmmunitionType,
          damageRollable: !mode.affliction && !mode.damageSpecial && parseDiceAdds(rangedDamage) !== null,
          reach: "",
          parry: null,
          parryModifier: 0,
          minSt: mode.minSt ?? null,
          weight,
          quality,
          material,
          resistsBreakage: resists,
          minStPenalty: lacking(mode.minSt ?? null, String(mode.mount ?? "")),
          condition,
          twoHanded: Boolean(mode.twoHanded),
          swung: mode.damageBase === "sw",
          // "+1 to Acc" for a fine firearm, "-1 Acc" for a cheap thrown weapon.
          accuracy: (mode.accuracy ?? 0) + qualityAccuracyBonus(weaponClass, quality, Boolean(mode.thrown)),
          scopeBonus: mode.scopeBonus ?? 0,
          range: range.halfDamage ? `${range.halfDamage} / ${range.max}` : String(range.max),
          rateOfFire: mode.rateOfFire ?? 1,
          recoil: mode.recoil ?? 0,
          bulk: mode.bulk ?? 0,
          // "+1 to Malf." for a fine firearm, -1 for a cheap one (Campaigns p. 407).
          malfunction: qualityMalfunction(mode.malfunction ?? null, quality),
          shots: mode.shots ?? "",
          usable: !wrecked,
          unbalanced: false,
          isFencing: false,
          // A ranged attack never reads the unarmed miss table: a thrown rock
          // fumbles as a weapon does, whatever threw it.
          unarmed: false,
          thrown: Boolean(mode.thrown),
          stBased: mode.damageBase === "thr" || mode.damageBase === "sw",
          damageBase: String(mode.damageBase ?? ""),
          damageModifier: Number(mode.damageModifier ?? 0) || 0,
          explosive: Boolean(mode.explosive),
          fragmentation: mode.fragmentation ?? "",
          affliction: Boolean(mode.affliction),
          afflictionAttribute: mode.afflictionAttribute ?? "",
          afflictionModifier: Number(mode.afflictionModifier ?? 0),
        });
      });
    }

    // ── natural attacks ─────────────────────────────────────────────────
    // A punch and a kick, which everybody has (Characters p. 271). They sit
    // in the melee list like any weapon, so a character with nothing in hand
    // still has an attack to roll -- and the kick's -2 is already in its level.
    //
    // Everybody upright with hands, that is. A horse has no fist to throw,
    // and its kick is the one "Damage for Animals" gives it (Campaigns
    // p. 460); a snake has neither; a falcon's talons are its claws and not
    // a boot. So a creature built along the ground, or without the hands to
    // make a fist, takes its unarmed attacks from its traits alone. A
    // gorilla keeps both: it stands up and it has hands.
    const beast = beastTraitsFrom(heldTraits.map((t) => t.name));
    const unarmedIsItsOwn =
      beast.horizontal === true || beast.legless === true || beast.handless === true;
    for (const attack of unarmedIsItsOwn ? [] : naturalAttacks({
      st: strikingSt,
      // A punch and a kick are DX-based like any weapon skill, so an extra
      // layer of armour costs them the same -1 (Characters p. 286).
      dx: attrs.DX + layering,
      skills: {
        ...(this.skillLevelByName("Brawling") !== null ? { Brawling: this.skillLevelByName("Brawling")! } : {}),
        ...(this.skillLevelByName("Boxing") !== null ? { Boxing: this.skillLevelByName("Boxing")! } : {}),
        ...(this.skillLevelByName("Karate") !== null ? { Karate: this.skillLevelByName("Karate")! } : {}),
      },
    })) {
      melee.push({
        itemId: "",
        modeIndex: 0,
        name: game.i18n.localize(`GWORLD.Natural.${attack.key}`),
        naturalKey: attack.key,
        mode: attack.skillName,
        skillName: attack.skillName,
        skillLevel: attack.skillLevel + legs,
        atDefault: false,
        natural: true,
        unready: false,
        readiesAfterAttack: false,
        damage: formatDiceAdds(attack.damage),
        damageType: "cr",
        armorDivisor: 1,
        damageRollable: true,
        reach: reachForSize(attack.reach, this.sm),
        // Enhanced Parry (Bare Hands) is exactly this parry and no other.
        parry: attack.canParry
          ? baseParry(attack.skillLevel + legs) + traits.enhancedParry.all + traits.enhancedParry.bareHands
          : null,
        parryModifier: 0,
        minSt: null,
        usable: true,
        unbalanced: false,
        isFencing: false,
        // "Treat a punch, kick, bite, etc. as a weapon with an effective
        // weight of 1/10 the attacker's ST" (Campaigns p. 376).
        weight: unarmedAttackWeight(attrs.ST),
        quality: "good",
        material: "",
        resistsBreakage: false,
        minStPenalty: 0,
        condition: "sound",
        twoHanded: false,
        swung: false,
        unarmed: true,
        stBased: true,
        explosive: false,
        fragmentation: "",
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      });
    }

    // A beast's bite, claws and strikers (Campaigns p. 460), read off the
    // traits it carries; nothing for a character with none of them.
    const brawling = this.skillLevelByName("Brawling");
    for (const attack of beastAttacks({
      st: strikingSt,
      dx: attrs.DX,
      skills: brawling !== null ? { Brawling: brawling } : {},
      beast,
    })) {
      melee.push({
        itemId: "",
        modeIndex: 0,
        name: attack.key === "striker" ? attack.skillName : game.i18n.localize(`GWORLD.Natural.${attack.key}`),
        mode: attack.key === "striker" ? game.i18n.localize("GWORLD.Natural.striker") : attack.skillName,
        skillName: attack.key === "striker" ? (brawling !== null ? "Brawling" : "DX") : attack.skillName,
        skillLevel: attack.skillLevel + legs,
        atDefault: false,
        natural: true,
        unready: false,
        readiesAfterAttack: false,
        damage: formatDiceAdds(attack.damage),
        damageType: attack.damageType,
        armorDivisor: 1,
        damageRollable: true,
        reach: reachForSize(attack.reach, this.sm),
        parry: null,
        parryModifier: 0,
        minSt: null,
        usable: true,
        unbalanced: false,
        isFencing: false,
        // "Treat a punch, kick, bite, etc. as a weapon with an effective
        // weight of 1/10 the attacker's ST" (Campaigns p. 376).
        weight: unarmedAttackWeight(attrs.ST),
        quality: "good",
        material: "",
        resistsBreakage: false,
        minStPenalty: 0,
        condition: "sound",
        twoHanded: false,
        swung: false,
        unarmed: true,
        stBased: true,
        explosive: false,
        fragmentation: "",
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      });
    }

    // ── active defenses ─────────────────────────────────────────────────
    // All-Out Attack forfeits every defense; Move and Attack forbids parrying.
    const defenseAvailable = canDefendWith(this.maneuver);
    const parryAvailable = defenseAvailable && canParryWith(this.maneuver);

    // Increased Defense raises one named defense by 2; it is not a blanket
    // bonus, so each defense asks whether it is the one chosen.
    const increasing =
      (this.conditions.allOutDefense || this.maneuver === "allOutDefense") &&
      this.allOutDefenseOption === "increased";

    // A rider defends at the mercy of their Riding skill; somebody on foot is
    // not asked. Riding defaults to DX-5 for anybody who never learned it.
    const ridingSkill = this.skillLevelByName("Riding") ?? (attrs.DX ?? 10) - 5;
    const mountedPenalty = this.mounted ? mountedDefensePenalty(ridingSkill) : 0;

    // Enhanced Dodge, Parry and Block each raise the one defense they name (p. 51).
    const enhancedFor = { dodge: traits.enhancedDodge, parry: traits.enhancedParry.all, block: traits.enhancedBlock };
    // "PCs with Attractive or better appearance can get a bonus to active
    // defenses simply by undressing!" (Campaigns p. 417).
    const undressed = isRuleOn("bulletproofNudity")
      ? nudityDefenseBonus({
          dress: this.dress?.state ?? "clothed",
          appearance: appearanceLevels,
          topless: this.dress?.topless === true,
        })
      : 0;

    const contextFor = (which: "dodge" | "parry" | "block") => ({
      shieldDb: shieldDb + deflectDb,
      undressed,
      posture: this.posture,
      mountedPenalty,
      stunned: this.conditions.stunned,
      // "In addition to their other effects, you're effectively stunned (-4 to
      // active defenses)" (p. 428). Nausea is -1 on its own.
      afflicted: afflicted.effect.defense,
      allOutDefenseIncreased: increasing && this.allOutDefenseTarget === which,
      cannotSeeAttacker: this.conditions.blindToAttacker,
      combatReflexes: traits.activeDefense > 0,
      enhanced: enhancedFor[which],
    });

    const describe = (base: number, mods: Array<{ label: string; value: number }>): string =>
      [`${base} base`, ...mods.map((m) => `${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${m.label}`)].join(
        " ",
      );

    const dodgeResult = dodge(secondary.basicSpeed, {
      ...contextFor("dodge"),
      encumbrance: encumbrance.level as EncumbranceLevel,
      reeling,
      veryTired,
    });

    // The best parry available across every equipped melee mode.
    //
    // An unbalanced weapon is out of the running on a turn its wielder has
    // already attacked in: an axe swung this turn is not coming back in time to
    // turn a blade (p. 269). It stays available on a turn nothing was swung, so
    // the flag is read here rather than baked into the parry score.
    // An unready weapon is not in a position to parry either.
    const bestParry = bestParryOption(
      melee.filter((atk) => atk.usable && !atk.unready),
      this.conditions.attackedThisTurn,
    );
    const parryResult =
      parryAvailable && bestParry && bestParry.skillLevel !== null
        ? parry(bestParry.skillLevel, {
            ...contextFor("parry"),
            // The weapon's own figure: a quarterstaff parries at +2, a knife at
            // -1 (Characters p. 269), and a bare-handed parry adds Enhanced
            // Parry (Bare Hands) as if it were the weapon's.
            weaponParryModifier:
              bestParry.parryModifier + (bestParry.natural ? traits.enhancedParry.bareHands : 0),
          })
        : null;

    const blockResult =
      defenseAvailable && shieldSkill !== null ? block(shieldSkill, contextFor("block")) : null;

    const defenses: { dodge: DefenseView | null; parry: DefenseView | null; block: DefenseView | null } = {
      dodge: !defenseAvailable ? null : {
        total: Math.max(1, dodgeResult.total + this.bonuses.dodge),
        source: `Basic Speed ${secondary.basicSpeed.toFixed(2)}`,
        math: describe(dodgeResult.base, dodgeResult.modifiers),
        skillName: "",
        isFencing: false,
      },
      parry:
        parryResult && bestParry
          ? {
              total: parryResult.total,
              source: `${bestParry.skillName} ${bestParry.skillLevel}`,
              math: describe(parryResult.base, parryResult.modifiers),
              skillName: bestParry.skillName,
              isFencing: bestParry.isFencing,
              weapon: {
                itemId: bestParry.itemId,
                weight: bestParry.weight,
                quality: bestParry.quality,
                material: bestParry.material,
                twoHanded: bestParry.twoHanded,
                natural: bestParry.natural,
              },
            }
          : null,
      block:
        blockResult && shieldItem
          ? {
              total: blockResult.total,
              source: `${shieldItem.system?.skill ?? "Shield"} ${shieldSkill}`,
              math: describe(blockResult.base, blockResult.modifiers),
              skillName: String(shieldItem.system?.skill ?? "Shield"),
              isFencing: false,
            }
          : null,
    };

    // ── points ledger ───────────────────────────────────────────────────
    const sumTraits = (category: string) =>
      this.itemsOfType("trait")
        .filter((i) => i.system?.category === category)
        .reduce((sum, i) => sum + (i.system?.totalPoints ?? i.system?.points ?? 0), 0);

    // Billed on what was bought as an attribute; a level of Extra ST is
    // billed by the trait that bought it.
    const attributePoints =
      (bought.ST - 10) * 10 + (bought.HT - 10) * 10 + (bought.DX - 10) * 20 + (bought.IQ - 10) * 20;
    const advantages = sumTraits("advantage") + sumTraits("perk");
    const disadvantages = sumTraits("disadvantage");
    const quirks = sumTraits("quirk");
    const skillPoints = this.itemsOfType("skill").reduce(
      (sum, i) => sum + Number(i.system?.points ?? 0),
      0,
    );
    const techniquePoints = this.itemsOfType("technique").reduce(
      (sum, i) => sum + Number(i.system?.points ?? 0),
      0,
    );
    const languagePoints = this.itemsOfType("language").reduce(
      (sum, i) => sum + Number(i.system?.totalPoints ?? 0),
      0,
    );
    // "Each magic spell is a separate skill, learned just like any other
    // skill" (p. 235), and billed like one -- on its own line, because a
    // mage wants to know what the magic came to.
    const spellPoints = this.itemsOfType("spell").reduce(
      (sum, i) => sum + Number(i.system?.points ?? 0),
      0,
    );

    // Only purchased levels are billed. Granted ones (racial templates, GM
    // rulings) move the score for free.
    const secondaryPoints =
      secondaryPointCost("hp", p.hp) +
      secondaryPointCost("will", p.will) +
      secondaryPointCost("per", p.per) +
      secondaryPointCost("fp", p.fp) +
      secondaryPointCost("basicMove", p.basicMove) +
      basicSpeedPointCost(p.basicSpeed);

    // What the templates themselves cost. Only the modifiers are billed here:
    // every trait and skill a template granted is an item of its own and bills
    // itself, so charging the template's whole stated cost would count them
    // twice (Characters pp. 258, 261).
    const templatePoints = (this.templates ?? []).reduce(
      (sum, applied) => sum + Number(applied.attributeCost ?? 0),
      0,
    );

    const spent =
      attributePoints + secondaryPoints + advantages + disadvantages + quirks +
      skillPoints + techniquePoints + languagePoints + templatePoints + spellPoints;

    // Worked out once, beside the spending it is measured against.
    const ledger = pointsLedger({
      starting: this.points.starting,
      awards: this.points.awards ?? [],
      spent,
    });

    return {
      maneuver: {
        key: this.maneuver,
        label: MANEUVERS[this.maneuver].label,
        labelKey: `GWORLD.Maneuver.${this.maneuver}`,
        defenseAvailable,
        parryAvailable,
        movement: MANEUVERS[this.maneuver].movement,
      },
      evaluateBonus: this.maneuver === "evaluate" ? evaluateBonus(this.evaluateTurns) : 0,
      // The aim as it stands, and what it is worth against a weapon of Acc 0:
      // the +1 and +2 for the extra turns, and the +1 for bracing. Each
      // weapon adds its own Accuracy when the shot is taken.
      aim: {
        active: this.maneuver === "aim",
        turns: this.aim?.turns ?? 0,
        braced: Boolean(this.aim?.braced),
        extra: this.maneuver === "aim"
          ? aimBonus({ turnsAimed: this.aim?.turns ?? 0, accuracy: 0, braced: Boolean(this.aim?.braced) }).total
          : 0,
      },
      // One attack a turn, plus a level of Extra Attack for each beyond it.
      attacksPerTurn: 1 + traits.extraAttacks,
      extraArms: traits.extraArms,
      // What the eyes take off an attack, by kind, each under its own name
      // (pp. 123, 147) -- as things stand on the sheet; the roll itself asks
      // again, knowing whether the shot was aimed.
      attackPenalties: {
        melee: impairedAttacks(traits, { ranged: false, closeCombat: this.conditions.closeCombat }),
        ranged: impairedAttacks(traits, { ranged: true, aimed: this.maneuver === "aim" && (this.aim?.turns ?? 0) > 0 }),
      },
      // What the legs take off every melee skill (p. 141), for the chip.
      legPenalty: legs,
      // The eyes brought to the dark and to the range, for the attack dialog.
      vision: {
        nightVision: traits.nightVision,
        darkVision: traits.darkVision,
        infravision: traits.infravision,
        blindness: traits.blindness,
        nearsighted: traits.badSight === "nearsighted",
      },
      // The four senses as Perception rolls, each after the traits that
      // sharpen or blunt it (pp. 35, 124, 129, 138).
      senses: senseScores(secondary.per, traits),
      // What the social traits do to a reaction roll, and Charisma's bonus
      // to the Influence roll itself (pp. 21-29, 41).
      // The powers a character holds, the abilities under each and what its
      // Talent is worth to a roll using them (Characters pp. 254-255): the
      // Basic Set's six, and any a book's entries name (Monster Hunters 1 p. 40).
      powers: powersOf(heldTraits),
      // "In a few cases, skill 20+ gives an automatic +2 to reactions.
      // Diplomacy and Fast-Talk work this way if you are allowed to talk -- as
      // does Merchant skill, during commercial transactions" (p. 494). Offered
      // as conditional sources, since only the table knows who is talking.
      reactions: [
        ...reactionSources(heldTraits),
        ...(["Diplomacy", "Fast-Talk"] as const)
          .filter((skill) => automaticSkillBonus(this.skillLevelByName(skill) ?? 0))
          .map((skill) => ({ label: skill, value: 2, condition: "talking" as const })),
        ...(automaticSkillBonus(this.skillLevelByName("Merchant") ?? 0)
          ? [{ label: "Merchant", value: 2, condition: "commercial" as const }]
          : []),
      ],
      charismaInfluence: charismaInfluenceBonus(heldTraits),
      // Fit's bonus to every HT roll, for the rolls made outside this block.
      healthRollBonus: traits.htRolls,
      wealth: this.#wealth(heldTraits),
      aging: this.#aging(heldTraits),
      // Each language with what using it costs (Characters p. 24), and
      // whether an unfamiliar culture costs anything at all (p. 46).
      languages: this.itemsOfType("language").map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        spoken: String(item.system?.spoken ?? "none") as Comprehension,
        written: String(item.system?.written ?? "none") as Comprehension,
        spokenPenalty: languagePenalty(String(item.system?.spoken ?? "none") as Comprehension),
        writtenPenalty: languagePenalty(String(item.system?.written ?? "none") as Comprehension),
      })),
      culturallyAdaptable: culturallyAdaptable(heldTraits),
      // How long a night has to be (Campaigns p. 427; Characters pp. 50, 65, 136).
      sleepPeriod: sleepPeriodFrom(heldTraits),
      // The dose as it stands today, and what the table says of it (Campaigns pp. 435-436).
      radiation: this.#radiation(),
      radiationTolerance: radiationToleranceFrom(heldTraits),
      regeneration: regenerationRate(traits.regeneration),
      // The attributes as everything else reads them: bought plus what traits
      // add. The sheet's inputs edit the bought figure and show this one.
      attributes: attrs,
      attributeBonuses: traits.attributes,
      strikingSt,
      liftingSt,
      will: secondary.will,
      per: secondary.per,
      basicLift: secondary.basicLift,
      // What is worn over what (Characters pp. 283, 286): the -1 for an extra
      // layer, whether any of it is layered where it should not be, and a
      // great helm that takes the corner of the wearer's eye.
      armorNotes: {
        layeringPenalty: layering,
        illegalLayering:
          isRuleOn("layeredArmor") &&
          HIT_LOCATION_ORDER.some((location) => !layeringAt(wornPieces, location).legal),
        noPeripheralVision:
          isRuleOn("frontArmor") &&
          this.itemsOfType("armor").some(
            (item: any) => item.system?.equipped && item.system?.blocksPeripheralVision,
          ),
        frontOnly: wornPieces.some((piece) => piece.frontOnly),
      },
      shieldBroken,
      basicSpeed: secondary.basicSpeed,
      basicMove: secondary.basicMove,
      move: [reeling, veryTired].reduce(
        (move, halve) => (halve ? halveForReeling(move) : move),
        encumbrance.move,
      ),
      thrust: formatDiceAdds(thrustDamage(strikingSt)),
      swing: formatDiceAdds(swingDamage(strikingSt)),
      dr,
      drByLocation,
      hitLocations: HIT_LOCATION_ORDER.map((key) => {
        // Where a location is protected unevenly it carries every distinct DR
        // with the damage each applies to, rather than a number that is only
        // right against some of what lands there.
        const { splits, bands } = profiles[key];
        const [ordinary, ...exceptions] = bands;
        return {
          key,
          label: HIT_LOCATIONS[key].label,
          toHit: HIT_LOCATIONS[key].toHit,
          dr: ordinary?.dr ?? 0,
          splits,
          // The keys travel as keys. Joining them here would put raw codes
          // like "pi+" on the sheet in every locale.
          exceptions: exceptions.map((band) => ({ dr: band.dr, types: band.types })),
        };
      }),
      shieldDb,
      shieldName: shieldItem?.name ?? null,
      armorName: armorItems[0]?.name ?? null,
      defenses,
      melee,
      ranged,
      encumbrance,
      feats: this.#physicalFeats(attrs, secondary.basicLift, encumbrance.move, traits),
      // What each Influence skill is worth to this character (Campaigns
      // p. 359). An unbought one is not left out: it defaults, and the dialog
      // shows the default so the player can see what they are risking.
      influence: Object.fromEntries(
        INFLUENCE_SKILLS.map((name: string) => [
          name,
          this.skillLevelByName(name) ?? this.influenceDefault(name, attrs, secondary.will),
        ]),
      ),

      // The two techniques that change a roll made from a dialog rather than
      // from their own line on the sheet (Campaigns p. 417).
      techniques: {
        dualWeaponAttack: this.techniqueLevelsByName("Dual-Weapon Attack"),
        offHandWeaponTraining: this.techniqueLevelsByName("Off-Hand Weapon Training"),
      },
      recovery: {
        // First Aid is IQ/Easy, so someone who never learned it defaults to
        // IQ-4 and can still bandage a friend (Characters p. 195).
        firstAid: this.skillLevelByName("First Aid") ?? (attrs.IQ ?? 10) - 4,
        // A drinker rolls "the higher of HT or Carousing" (Campaigns p. 439).
        // Carousing is HT/Easy: somebody who never learned it defaults to HT-4,
        // which is never the higher of the two and so never used -- but the
        // number is here rather than absent, so the card can show what it beat.
        carousing: this.skillLevelByName("Carousing") ?? (attrs.HT ?? 10) - 4,
      },
      traitEffects: traits,
      magic: { ...magic, mana, items: magicItems },
      // Unkillable is not dead at -5xHP; only destruction at -10xHP is the end.
      status: healthStatus(this.hp.value, this.hp.max, { unkillable: traits.unkillable }),
      reeling,
      mounted: this.mounted,
      ridingSkill,
      // What this character was built from, for the sheet to list and unpick.
      templates: (this.templates ?? []).map((applied) => ({ ...applied })),
      // What a temporary penalty comes to, for the rolls that read it. The
      // penalties themselves stay where they were entered; this is only their
      // arithmetic, IQ dragging Will and Per with it (Campaigns p. 421).
      // A temporary penalty the GM typed in, plus whatever the afflictions on
      // the token come to (pp. 428-429). Folding them together here is what
      // makes an affliction reach every roll: anything that already reads a
      // lowered DX picks up a coughing fit without being told about
      // afflictions at all.
      attributePenalties: penaltyEffects({
        ST: this.attributePenalties.ST,
        DX: this.attributePenalties.DX + afflicted.effect.dx,
        IQ: this.attributePenalties.IQ + afflicted.effect.iq,
        HT: this.attributePenalties.HT,
      }),
      // What is on the token, and what it costs, for the sheet to say so.
      afflictions: {
        active: afflicted.active,
        names: afflicted.active.map((key) => `GWORLD.Affliction.Name.${key}`),
        effect: afflicted.effect,
        helpless: afflicted.effect.helpless,
      },
      fatigue: {
        status: fatigueStatus(this.fp.value, this.fp.max),
        veryTired,
        // "Halve your Move, Dodge, and ST (round up). This does not affect
        // ST-based quantities, such as HP and damage" -- so this is the score
        // ST rolls are made against, and not the one Basic Lift comes from.
        strength: veryTired ? halveForReeling(attrs.ST ?? 10) : (attrs.ST ?? 10),
      },
      points: {
        attributes: attributePoints,
        secondaries: secondaryPoints,
        templates: templatePoints,
        advantages,
        disadvantages,
        quirks,
        skills: skillPoints,
        techniques: techniquePoints,
        languages: languagePoints,
        spells: spellPoints,
        // What they started with, what they have earned since, and what is
        // left after the sheet is paid for -- three numbers rather than one,
        // because they answer three different questions.
        ...ledger,
        awards: this.points.awards ?? [],
        // Kept under its old name as well: "remaining" is what callers already
        // ask for, and it now counts against the whole budget rather than
        // against the starting points alone.
        remaining: ledger.unspent,
        // Disadvantages and quirks both count toward the campaign limit.
        disadvantageTotal: Math.abs(disadvantages + quirks),
        disadvantageLimit: this.points.disadvantageLimit,
      },
    };
  }
}
