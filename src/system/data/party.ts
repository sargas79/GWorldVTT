/**
 * The Party Actor data model.
 *
 * A party is the people a campaign follows, kept together so the GM can see
 * them at once. The terms the campaign was set on -- starting points,
 * disadvantage limit, Tech Level -- are world settings (campaign.ts), so a
 * character keeps them whether or not it is in a party (#642).
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
  /** @deprecated The terms before #642; read only by the migration. */
  declare campaign: CampaignTerms;
  declare derived: { members: ResolvedMember[]; count: number; missing: number };

  static override defineSchema() {
    // The terms a party held before #642. Nothing reads them but the
    // migration that copies them into the world settings; kept so a world
    // updating from an earlier version still has them to copy.
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
