/**
 * The character Actor data model (GURPS Lite pp. 4-8).
 *
 * All derived values come from the pure rules engine; this class is only
 * responsible for declaring the persisted schema and wiring the engine's
 * outputs onto the document.
 */

import { secondaryCharacteristics } from "../../rules/attributes.js";
import { dodge } from "../../rules/defenses.js";
import { encumbranceState } from "../../rules/encumbrance.js";
import { swingDamage, thrustDamage } from "../../rules/damage.js";
import { formatDiceAdds } from "../../rules/dice.js";
import { healthStatus, isReeling } from "../../rules/injury.js";
import type { EncumbranceLevel, Posture } from "../../rules/types.js";

const fields = foundry.data.fields;

/** An attribute field: whole numbers, defaulting to the human average of 10. */
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

/** A resource pool tracked on token bars, such as HP or FP. */
function poolField() {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
    // Max is recomputed in prepareDerivedData, but must exist in the schema for
    // Foundry's token bar attributes to resolve it.
    max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
  });
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  // These are populated by Foundry from the schema; declared for typing only.
  declare attributes: { ST: number; DX: number; IQ: number; HT: number };
  declare bonuses: {
    hp: number;
    will: number;
    per: number;
    fp: number;
    basicSpeed: number;
    basicMove: number;
    dodge: number;
  };
  declare hp: { value: number; max: number };
  declare fp: { value: number; max: number };
  declare points: { starting: number; disadvantageLimit: number };
  declare tl: number;
  declare posture: Posture;
  declare conditions: { stunned: boolean };
  declare details: {
    player: string;
    height: string;
    weight: string;
    age: string;
    appearance: string;
    biography: string;
    notes: string;
  };

  /** Derived values, recomputed on every data preparation pass. */
  declare derived: {
    will: number;
    per: number;
    basicLift: number;
    basicSpeed: number;
    basicMove: number;
    move: number;
    dodge: number;
    thrust: string;
    swing: string;
    encumbrance: {
      level: EncumbranceLevel;
      key: string;
      carriedWeight: number;
      overloaded: boolean;
    };
    status: string;
    reeling: boolean;
  };

  static override defineSchema() {
    return {
      attributes: new fields.SchemaField({
        ST: attributeField("GWORLD.Attribute.ST"),
        DX: attributeField("GWORLD.Attribute.DX"),
        IQ: attributeField("GWORLD.Attribute.IQ"),
        HT: attributeField("GWORLD.Attribute.HT"),
      }),

      // GURPS Lite ties every secondary characteristic to an attribute and offers
      // no way to buy them separately. These bonuses exist so racial templates and
      // GM rulings can shift them without a schema migration.
      bonuses: new fields.SchemaField({
        hp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        will: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        per: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        fp: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        basicSpeed: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
        basicMove: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
        }),
        dodge: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
        }),
      }),

      hp: poolField(),
      fp: poolField(),

      points: new fields.SchemaField({
        starting: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 100,
        }),
        // A rule of thumb, not a hard cap: hold disadvantages to 50% of starting
        // points (GURPS Lite p. 4).
        disadvantageLimit: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 50,
        }),
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

  /**
   * Total weight of every carried item, in pounds.
   *
   * Reads from the parent Actor's items when there is one, so the model still
   * works standalone in tests.
   */
  get carriedWeight(): number {
    const actor = this.parent as { items?: Iterable<{ system?: Record<string, unknown> }> } | null;
    if (!actor?.items) return 0;

    let total = 0;
    for (const item of actor.items) {
      const system = item.system as { weight?: number; quantity?: number; carried?: boolean };
      if (system?.carried === false) continue;
      const weight = Number(system?.weight ?? 0);
      const quantity = Number(system?.quantity ?? 1);
      if (Number.isFinite(weight) && Number.isFinite(quantity)) total += weight * quantity;
    }
    return total;
  }

  override prepareDerivedData(): void {
    super.prepareDerivedData();

    const secondary = secondaryCharacteristics(this.attributes, {
      hp: this.bonuses.hp,
      will: this.bonuses.will,
      per: this.bonuses.per,
      fp: this.bonuses.fp,
      basicSpeed: this.bonuses.basicSpeed,
      basicMove: this.bonuses.basicMove,
    });

    // HP and FP maxima are derived, but their current values are persisted.
    this.hp.max = secondary.hp;
    this.fp.max = secondary.fp;

    const carriedWeight = this.carriedWeight;
    const encumbrance = encumbranceState(
      carriedWeight,
      secondary.basicLift,
      secondary.basicMove,
    );

    const reeling = isReeling(this.hp.value, this.hp.max);

    const dodgeResult = dodge(secondary.basicSpeed, {
      encumbrance: encumbrance.level,
      reeling,
      posture: this.posture,
      stunned: this.conditions.stunned,
    });

    this.derived = {
      will: secondary.will,
      per: secondary.per,
      basicLift: secondary.basicLift,
      basicSpeed: secondary.basicSpeed,
      basicMove: secondary.basicMove,
      move: reeling ? Math.ceil(encumbrance.move / 2) : encumbrance.move,
      dodge: Math.max(1, dodgeResult.total + this.bonuses.dodge),
      thrust: formatDiceAdds(thrustDamage(this.attributes.ST)),
      swing: formatDiceAdds(swingDamage(this.attributes.ST)),
      encumbrance: {
        level: encumbrance.level,
        key: encumbrance.key,
        carriedWeight,
        overloaded: encumbrance.overloaded,
      },
      status: healthStatus(this.hp.value, this.hp.max),
      reeling,
    };
  }
}
