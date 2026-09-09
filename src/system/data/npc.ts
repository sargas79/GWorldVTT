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

  static override defineSchema() {
    return {
      ...super.defineSchema(),
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
