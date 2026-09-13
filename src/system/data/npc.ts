/**
 * The NPC Actor data model.
 *
 * GURPS Lite draws no mechanical distinction between PCs and NPCs, so this
 * extends the character model and adds only what a GM needs at the table:
 * how many of them are in the scene, and how they behave.
 */

import { CharacterData } from "./character.js";

const fields = foundry.data.fields;

export class NpcData extends CharacterData {
  declare groupSize: number;
  declare tactics: string;
  declare swarm: {
    isSwarm: boolean;
    kind: "tiny" | "large";
    damage: string;
    flatInjury: number;
    damageType: string;
    flying: boolean;
    about: string;
  };

  static override defineSchema() {
    return {
      ...super.defineSchema(),

      /**
       * A swarm rather than a creature (Campaigns p. 461): "treat a group of
       * small creatures as a unit when it attacks". Its hit points are what
       * it takes to disperse it, and Injury Tolerance (Diffuse) caps what
       * any one blow does; this is the attack it makes and whether armour
       * keeps it out.
       */
      swarm: new fields.SchemaField({
        isSwarm: new fields.BooleanField({ initial: false }),
        /** Tiny ones get inside clothing after a few seconds; large ones never do. */
        kind: new fields.StringField({
          required: true, nullable: false, initial: "large", choices: ["tiny", "large"],
        }),
        /** Damage a turn as a formula, blank for a swarm that does a flat point. */
        damage: new fields.StringField({ required: true, blank: true, initial: "" }),
        /** A flat point of injury a turn, for the stingers. */
        flatInjury: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        damageType: new fields.StringField({ required: true, nullable: false, initial: "cut" }),
        /** Fliers are crushed by a shield; the rest are stamped on. */
        flying: new fields.BooleanField({ initial: false }),
        /** "About a dozen carnivorous bats", for the sheet to say what a swarm is. */
        about: new fields.StringField({ required: true, blank: true, initial: "" }),
      }),
      /** How many of this NPC are present, shown as "x4 in scene". */
      groupSize: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 1,
        min: 1,
      }),
      /** A one-line behavioural note: morale, tactics, when they break. */
      tactics: new fields.StringField({ required: true, blank: true, initial: "" }),
    };
  }
}
