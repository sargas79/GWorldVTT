/** What every tab's sections share: where their words live. */

import type { GmSectionDef } from "../types.js";

/** The GM Screen's own strings. */
export const K = "GWORLD.GmScreen";

/** A system section, with its title and summary under `GWORLD.GmScreen.Section.<id>`. */
export function section(
  def: Omit<GmSectionDef, "title" | "summary"> & { title?: string; summary?: string | false },
): GmSectionDef {
  const { summary, ...rest } = def;
  return {
    ...rest,
    title: def.title ?? `${K}.Section.${def.id}.Title`,
    ...(summary === false ? {} : { summary: summary ?? `${K}.Section.${def.id}.Summary` }),
    module: null,
  };
}

/** A part's heading key, under the section's. */
export function partKey(sectionId: string, part: string): string {
  return `${K}.Section.${sectionId}.${part}`;
}
