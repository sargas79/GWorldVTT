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
import { naturalAttacks } from "../../rules/natural-attacks.js";
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
import { senseScores } from "../../rules/senses.js";
import { baseParry, bestParryOption, block, dodge, parry } from "../../rules/defenses.js";
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
import { INFLUENCE_SKILLS } from "../../rules/reactions.js";
import { mountedDefensePenalty } from "../../rules/mounted.js";
import { penaltyEffects } from "../../rules/attribute-penalties.js";
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
  /** True for a punch, kick, bite or grapple, which fumbles on its own table. */
  unarmed: boolean;
  /**
   * True when the damage comes off the Damage Table -- thrust or swing scaled
   * by ST. The bonuses that only apply to muscle-powered blows read this; a
   * force sword's flat 8d is not one of them.
   */
  stBased: boolean;
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
    itemIds: string[];
  }>;
  declare magic: { style: MagicStylePreference };
  declare activeSpells: ActiveSpell[];
  declare attributePenalties: { ST: number; DX: number; IQ: number; HT: number };
  declare points: {
    starting: number;
    disadvantageLimit: number;
    awards: PointAward[];
  };
  declare tl: number;
  declare sm: number;
  declare maneuver: Maneuver;
  declare evaluateTurns: number;
  declare aim: { turns: number; braced: boolean };
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
          /** The items it added, so removing it removes exactly those. */
          itemIds: new fields.ArrayField(
            new fields.StringField({ required: true, blank: true, initial: "" }),
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
        move: waterMove(move, traits.aquatic),
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
    }));
    const traits = traitEffects(heldTraits);
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
    const strikingSt = attrs.ST + traits.strikingSt + traits.armSt;
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
    // Lame legs are read here, before encumbrance takes its share (p. 141).
    secondary.basicMove = lameMove(secondary.basicMove, traits.lame);

    this.hp.max = secondary.hp;
    this.fp.max = secondary.fp;

    // ── skills ──────────────────────────────────────────────────────────
    // Resolved here rather than on the item, because a skill's absolute level
    // needs the owning actor's attributes.
    //
    // Will and Per are secondary characteristics, so a skill based on either
    // has to wait for them to be derived above.
    const attributeScore = (a: SkillAttribute): number => {
      if (a === "Will") return secondary.will;
      if (a === "Per") return secondary.per;
      return attrs[a];
    };

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
      const talentBonus = talentBonusFor(String(item.name ?? ""), talents);
      const resolved = effectiveSkillLevel({
        attributeScore: attributeScore(sys.attribute),
        difficulty: sys.difficulty,
        points: sys.points,
        bonus: sys.bonus + magicSkillBonus(String(item.name ?? ""), talent) + talentBonus,
        defaults: attributeDefaults,
      });
      sys.derived = {
        level: resolved?.level ?? null,
        fromDefault: resolved?.fromDefault ?? true,
        relativeLevel: relativeLevelForPoints(sys.points, sys.difficulty),
        hasDefault: attributeDefaults.length > 0,
        talentBonus,
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
    const shieldDb = shieldItem ? Number(shieldItem.system?.db ?? 0) : 0;
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
    ): string => {
      if (base === "fixed") {
        const parsed = parseDiceAdds(formula);
        return parsed ? formatDiceAdds(parsed) : formula || "—";
      }
      return formatDiceAdds(weaponDamage(st, base, modifier, minSt));
    };

    // A shield is a weapon as well as a defense: bashing with it is an ordinary
    // melee attack (GURPS Basic Set: Characters p. 273). Only an equipped one
    // is on the list, since you cannot hit anyone with a shield in your pack.
    const armed = [
      ...this.itemsOfType("equipment"),
      ...this.itemsOfType("shield").filter((i) => i.system?.equipped),
    ];

    /**
     * The level a weapon's skill is rolled at: the character's own if they
     * have the skill, else the book's default for it. A pistol in the hands
     * of somebody who never learned Guns is still a pistol, at DX-4.
     */
    const weaponSkill = (name: string): { level: number | null; atDefault: boolean } => {
      const own = this.skillLevelByName(name);
      if (own !== null) return { level: own, atDefault: false };
      const listed = catalogSkill(name);
      if (!listed) return { level: null, atDefault: false };
      const level = defaultLevelFrom(
        listed.defaults,
        attributeScore,
        (other) => this.skillLevelByName(other),
      );
      return { level, atDefault: level !== null };
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
      const withPuissance = (damage: string): string => {
        if (!magic.puissance) return damage;
        const parsed = parseDiceAdds(damage);
        return parsed ? formatDiceAdds(addModifier(parsed, magic.puissance)) : damage;
      };

      // Swung and not yet readied again: the whole item is down, whichever of
      // its modes was used.
      const unready = Boolean((sys as any).unready);

      (sys.meleeModes ?? []).forEach((mode: any, index: number) => {
        const { level: skillLevel, atDefault } = enchantedSkill(weaponSkill(mode.skill));
        const meleeDamage = withPuissance(resolveDamage(
          strikingSt, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
        ));
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
          damageType: mode.damageType,
          armorDivisor: mode.armorDivisor ?? 1,
          damageRollable: !mode.affliction && parseDiceAdds(meleeDamage) !== null,
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
            !(traits.oneArm && Boolean(mode.twoHanded)),
          unbalanced: Boolean(mode.unbalanced),
          isFencing: Boolean(mode.isFencing),
          // Which critical miss table a fumble is read on is decided by the
          // skill: a Karate kick fumbles differently from a dropped axe.
          unarmed: isUnarmedSkill(mode.skill),
          stBased: mode.damageBase === "thr" || mode.damageBase === "sw",
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
        const rangedDamage = withPuissance(resolveDamage(
          st, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
        ));
        const range = mode.rangeIsStMultiple
          ? musclePoweredRange(mode.weaponSt ?? attrs.ST, mode.halfDamageRange, mode.maxRange)
          : { halfDamage: mode.halfDamageRange, max: mode.maxRange };
        const { level: skillLevel, atDefault } = enchantedSkill(weaponSkill(mode.skill));

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
          damage: rangedDamage,
          damageType: mode.damageType,
          armorDivisor: mode.armorDivisor ?? 1,
          damageRollable: !mode.affliction && parseDiceAdds(rangedDamage) !== null,
          reach: "",
          parry: null,
          parryModifier: 0,
          minSt: mode.minSt ?? null,
          accuracy: mode.accuracy ?? 0,
          scopeBonus: mode.scopeBonus ?? 0,
          range: range.halfDamage ? `${range.halfDamage} / ${range.max}` : String(range.max),
          rateOfFire: mode.rateOfFire ?? 1,
          recoil: mode.recoil ?? 0,
          bulk: mode.bulk ?? 0,
          malfunction: mode.malfunction ?? null,
          shots: mode.shots ?? "",
          usable: true,
          unbalanced: false,
          isFencing: false,
          // A ranged attack never reads the unarmed miss table: a thrown rock
          // fumbles as a weapon does, whatever threw it.
          unarmed: false,
          stBased: mode.damageBase === "thr" || mode.damageBase === "sw",
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
    for (const attack of naturalAttacks({
      st: strikingSt,
      dx: attrs.DX,
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
        mode: attack.skillName,
        skillName: attack.skillName,
        skillLevel: attack.skillLevel,
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
          ? baseParry(attack.skillLevel) + traits.enhancedParry.all + traits.enhancedParry.bareHands
          : null,
        parryModifier: 0,
        minSt: null,
        usable: true,
        unbalanced: false,
        isFencing: false,
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

    // Enhanced Dodge, Parry and Block each raise the one defense they name
    // (p. 51); Lame lowers all three (p. 141).
    const enhancedFor = { dodge: traits.enhancedDodge, parry: traits.enhancedParry.all, block: traits.enhancedBlock };
    const contextFor = (which: "dodge" | "parry" | "block") => ({
      shieldDb: shieldDb + deflectDb,
      posture: this.posture,
      mountedPenalty,
      stunned: this.conditions.stunned,
      allOutDefenseIncreased: increasing && this.allOutDefenseTarget === which,
      cannotSeeAttacker: this.conditions.blindToAttacker,
      combatReflexes: traits.activeDefense > 0,
      enhanced: enhancedFor[which],
      lame: lameCombatPenalty(traits.lame),
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
      // What the physical disadvantages take off an attack, by kind, each
      // under its own name (pp. 123, 141, 147).
      attackPenalties: {
        melee: impairedAttacks(traits, false),
        ranged: impairedAttacks(traits, true),
      },
      // The eyes brought to the dark, for the attack dialog to read.
      vision: {
        nightVision: traits.nightVision,
        darkVision: traits.darkVision,
        infravision: traits.infravision,
        blindness: traits.blindness,
      },
      // The four senses as Perception rolls, each after the traits that
      // sharpen or blunt it (pp. 35, 124, 129, 138).
      senses: senseScores(secondary.per, traits),
      // What the social traits do to a reaction roll, and Charisma's bonus
      // to the Influence roll itself (pp. 21-29, 41).
      reactions: reactionSources(heldTraits),
      charismaInfluence: charismaInfluenceBonus(heldTraits),
      // Fit's bonus to every HT roll, for the rolls made outside this block.
      healthRollBonus: traits.htRolls,
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
      attributePenalties: penaltyEffects(this.attributePenalties),
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
