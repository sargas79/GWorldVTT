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
import { baseParry, bestParryOption, block, dodge, parry } from "../../rules/defenses.js";
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
import {
  effectiveSkillLevel,
  namedDefaultLevel,
  normalizeSkillName,
  relativeLevelForPoints,
  resolveTechnique,
  techniqueLevelsForPoints,
} from "../../rules/skills.js";
import { musclePoweredRange } from "../../rules/ranged.js";
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
   * An unbalanced weapon cannot parry in a turn it has attacked in
   * (p. 269, the "U" in the Parry column).
   */
  unbalanced: boolean;
  /** A fencing weapon, marked "F", which defends by its own rules. */
  isFencing: boolean;
  /** Ranged only. */
  accuracy?: number;
  /** A built-in scope's bonus, which the table lists separately as in "7+2". */
  scopeBonus?: number;
  range?: string;
  rateOfFire?: number;
  /** Recoil, which decides how many of a burst's shots hit. */
  recoil?: number;
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
  declare points: { starting: number; disadvantageLimit: number };
  declare tl: number;
  declare sm: number;
  declare maneuver: Maneuver;
  declare evaluateTurns: number;
  declare allOutDefenseOption: "increased" | "double";
  declare allOutDefenseTarget: "dodge" | "parry" | "block";
  declare posture: Posture;
  declare handedness: "right" | "left";
  declare conditions: {
    stunned: boolean;
    allOutDefense: boolean;
    blindToAttacker: boolean;
    attackedThisTurn: boolean;
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
          damageRollable: parseDiceAdds(meleeDamage) !== null,
          reach: mode.reach ?? "C",
          parry:
            mode.canParry && skillLevel !== null
              ? baseParry(skillLevel) + (mode.parryModifier ?? 0)
              : null,
          minSt: mode.minSt ?? null,
          unbalanced: Boolean(mode.unbalanced),
          isFencing: Boolean(mode.isFencing),
          explosive: Boolean(mode.explosive),
          fragmentation: mode.fragmentation ?? "",
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
          damageRollable: parseDiceAdds(rangedDamage) !== null,
          reach: "",
          parry: null,
          minSt: mode.minSt ?? null,
          accuracy: mode.accuracy ?? 0,
          scopeBonus: mode.scopeBonus ?? 0,
          range: range.halfDamage ? `${range.halfDamage} / ${range.max}` : String(range.max),
          rateOfFire: mode.rateOfFire ?? 1,
          recoil: mode.recoil ?? 0,
          shots: mode.shots ?? "",
          unbalanced: false,
          isFencing: false,
          explosive: Boolean(mode.explosive),
          fragmentation: mode.fragmentation ?? "",
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

    const contextFor = (which: "dodge" | "parry" | "block") => ({
      shieldDb,
      posture: this.posture,
      stunned: this.conditions.stunned,
      allOutDefenseIncreased: increasing && this.allOutDefenseTarget === which,
      cannotSeeAttacker: this.conditions.blindToAttacker,
    });

    const describe = (base: number, mods: Array<{ label: string; value: number }>): string =>
      [`${base} base`, ...mods.map((m) => `${m.value >= 0 ? "+" : "−"}${Math.abs(m.value)} ${m.label}`)].join(
        " ",
      );

    const dodgeResult = dodge(secondary.basicSpeed, {
      ...contextFor("dodge"),
      encumbrance: encumbrance.level as EncumbranceLevel,
      reeling,
    });

    // The best parry available across every equipped melee mode.
    //
    // An unbalanced weapon is out of the running on a turn its wielder has
    // already attacked in: an axe swung this turn is not coming back in time to
    // turn a blade (p. 269). It stays available on a turn nothing was swung, so
    // the flag is read here rather than baked into the parry score.
    const bestParry = bestParryOption(melee, this.conditions.attackedThisTurn);
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
      move: reeling ? halveForReeling(encumbrance.move) : encumbrance.move,
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
      status: healthStatus(this.hp.value, this.hp.max),
      reeling,
      points: {
        attributes: attributePoints,
        secondaries: secondaryPoints,
        advantages,
        disadvantages,
        quirks,
        skills: skillPoints,
        techniques: techniquePoints,
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
