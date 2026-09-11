/**
 * The character Actor data model (GURPS Lite pp. 4-8).
 *
 * All derived values come from the pure rules engine; this class declares the
 * persisted schema and distributes the engine's outputs across the actor and
 * its embedded items.
 */

import {
  BASIC_SPEED_STEP,
  basicSpeedPointCost,
  secondaryCharacteristics,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { isUnarmedSkill } from "../../rules/criticals.js";
import { reachForSize } from "../../rules/size.js";
import { pointsLedger, type PointAward } from "../../rules/character-points.js";
import { afterSuperJump, traitEffects, type TraitEffects } from "../../rules/trait-effects.js";
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

  private buildDerived() {
    const attrs = this.attributes;

    // Granted and purchased levels both move the score; only purchased ones
    // are billed, which is why they are stored apart.
    const p = this.purchased;
    const b = this.bonuses;
    const secondary = secondaryCharacteristics(attrs, {
      hp: b.hp + p.hp,
      will: b.will + p.will,
      per: b.per + p.per,
      fp: b.fp + p.fp,
      basicSpeed: b.basicSpeed + p.basicSpeed,
      basicMove: b.basicMove + p.basicMove,
    });

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

      const resolved = effectiveSkillLevel({
        attributeScore: attributeScore(sys.attribute),
        difficulty: sys.difficulty,
        points: sys.points,
        bonus: sys.bonus,
        defaults: attributeDefaults,
      });
      sys.derived = {
        level: resolved?.level ?? null,
        fromDefault: resolved?.fromDefault ?? true,
        relativeLevel: relativeLevelForPoints(sys.points, sys.difficulty),
        hasDefault: attributeDefaults.length > 0,
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

    // What this character's traits do to the numbers. Read once, here, so that
    // every rule downstream asks the same question of the same answer.
    const traits = traitEffects(
      this.itemsOfType("trait").map((item) => ({
        name: String(item.name ?? ""),
        levels: Number(item.system?.levels ?? 0),
      })),
    );

    // ── protection ──────────────────────────────────────────────────────
    // DR is tracked per location: a breastplate covering torso and vitals must
    // not protect the head. Armor listing no locations covers the whole body,
    // which keeps items written for the Lite rules working.
    const drByLocation = Object.fromEntries(
      HIT_LOCATION_ORDER.map((loc) => [loc, HIT_LOCATIONS[loc].extraDr]),
    ) as Record<HitLocation, number>;

    const armorItems = this.itemsOfType("armor").filter((i) => i.system?.equipped);
    const worn: ArmorPiece[] = armorItems.map((item) => ({
      dr: Number(item.system?.dr ?? 0),
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

    for (const item of armed) {
      const sys = item.system as {
        meleeModes?: any[]; rangedModes?: any[]; equipped?: boolean;
      };

      (sys.meleeModes ?? []).forEach((mode: any, index: number) => {
        const skillLevel = this.skillLevelByName(mode.skill);
        const meleeDamage = resolveDamage(
          attrs.ST, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
        );
        melee.push({
          itemId: item.id,
          modeIndex: index,
          name: item.name,
          mode: mode.name ?? "",
          skillName: mode.skill ?? "",
          skillLevel,
          damage: meleeDamage,
          damageType: mode.damageType,
          armorDivisor: mode.armorDivisor ?? 1,
          damageRollable: !mode.affliction && parseDiceAdds(meleeDamage) !== null,
          // A big fighter's arms are longer, so their weapons reach further
          // (Campaigns p. 402). Only the upper end moves.
          reach: reachForSize(String(mode.reach ?? "C"), this.sm),
          parry:
            mode.canParry && skillLevel !== null
              ? baseParry(skillLevel) + (mode.parryModifier ?? 0)
              : null,
          minSt: mode.minSt ?? null,
          // Inside a foe's hex only a weapon that reaches close is any use.
          usable:
            !isRuleOn("closeCombat") ||
            !this.conditions.closeCombat ||
            usableInCloseCombat(String(mode.reach ?? "C")),
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
        // Bows and crossbows use their own ST for damage and range.
        const st = mode.weaponSt ?? attrs.ST;
        const rangedDamage = resolveDamage(
          st, mode.damageBase, mode.damageModifier, mode.damageFormula, mode.minSt,
        );
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
          damage: rangedDamage,
          damageType: mode.damageType,
          armorDivisor: mode.armorDivisor ?? 1,
          damageRollable: !mode.affliction && parseDiceAdds(rangedDamage) !== null,
          reach: "",
          parry: null,
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

    const contextFor = (which: "dodge" | "parry" | "block") => ({
      shieldDb,
      posture: this.posture,
      mountedPenalty,
      stunned: this.conditions.stunned,
      allOutDefenseIncreased: increasing && this.allOutDefenseTarget === which,
      cannotSeeAttacker: this.conditions.blindToAttacker,
      combatReflexes: traits.activeDefense > 0,
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
    const bestParry = bestParryOption(
      melee.filter((atk) => atk.usable),
      this.conditions.attackedThisTurn,
    );
    const parryResult =
      parryAvailable && bestParry && bestParry.skillLevel !== null
        ? parry(bestParry.skillLevel, contextFor("parry"))
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

    const attributePoints =
      (attrs.ST - 10) * 10 + (attrs.HT - 10) * 10 + (attrs.DX - 10) * 20 + (attrs.IQ - 10) * 20;
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

    // Only purchased levels are billed. Granted ones (racial templates, GM
    // rulings) move the score for free.
    const secondaryPoints =
      secondaryPointCost("hp", p.hp) +
      secondaryPointCost("will", p.will) +
      secondaryPointCost("per", p.per) +
      secondaryPointCost("fp", p.fp) +
      secondaryPointCost("basicMove", p.basicMove) +
      basicSpeedPointCost(p.basicSpeed);

    const spent =
      attributePoints + secondaryPoints + advantages + disadvantages + quirks +
      skillPoints + techniquePoints + languagePoints;

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
      will: secondary.will,
      per: secondary.per,
      basicLift: secondary.basicLift,
      basicSpeed: secondary.basicSpeed,
      basicMove: secondary.basicMove,
      move: [reeling, veryTired].reduce(
        (move, halve) => (halve ? halveForReeling(move) : move),
        encumbrance.move,
      ),
      thrust: formatDiceAdds(thrustDamage(attrs.ST)),
      swing: formatDiceAdds(swingDamage(attrs.ST)),
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
      status: healthStatus(this.hp.value, this.hp.max),
      reeling,
      mounted: this.mounted,
      ridingSkill,
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
        advantages,
        disadvantages,
        quirks,
        skills: skillPoints,
        techniques: techniquePoints,
        languages: languagePoints,
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
