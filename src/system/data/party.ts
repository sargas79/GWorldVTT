/**
 * The Party Actor data model.
 *
 * A party is the people a campaign follows, kept together so the GM can see
 * them at once, and the terms the campaign was set on: the starting points
 * and the disadvantage limit (GURPS Basic Set: Characters pp. 10-11) and the
 * Tech Level (Characters p. 22). Each is a fact about the campaign rather than
 * about any one character, so it is set once here; a member's sheet reads it
 * from here rather than asking the player to copy it in. A term left blank is
 * not set, and each member keeps its own figure.
 *
 * Membership is a list of actor UUIDs, as a vehicle's crew is, in the order
 * the GM arranged them.
 */

import { afterPrepare, extensionsField } from "../data-extensions.js";
import { resolveMember } from "../party.js";
import type { CampaignTerms, MemberEntry } from "../party/roster.js";

const fields = foundry.data.fields;

/** A member as the party resolves it each preparation: the actor, or null when it is gone. */
export interface ResolvedMember {
  uuid: string;
  actor: any | null;
}

export class PartyData extends foundry.abstract.TypeDataModel {
  declare description: string;
  declare members: MemberEntry[];
  declare campaign: CampaignTerms;
  declare derived: { members: ResolvedMember[]; count: number; missing: number };

  static override defineSchema() {
    // Blank is "not set", which is why these are nullable with no default: a
    // new party changes nothing on anyone's sheet until the GM types a figure.
    const term = () => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 0 });
    return {
      /** Fields add-on modules keep on the party, one object per module. */
      extensions: extensionsField("Actor"),
      /** The GM's notes on the party. */
      description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
      members: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true, blank: false }),
        }),
        { required: true, initial: [] },
      ),
      campaign: new fields.SchemaField({
        tl: term(),
        startingPoints: term(),
        disadvantageLimit: term(),
      }),
    };
  }

  override prepareDerivedData(): void {
    const members = this.members.map(({ uuid }) => ({ uuid, actor: resolveMember(uuid) }));
    this.derived = {
      members,
      count: members.length,
      missing: members.filter((m) => !m.actor).length,
    };
    afterPrepare(this.parent);
  }
}
