/**
 * The tooltip on a hit location's DR: what the figure is made of, line by
 * line, as the modules' `gworld.armorDr` listeners left it (since API 1.140.0).
 */

/** One line of a location's DR, as the actor's derived data keeps it. */
export interface LocationDrLine {
  label: string;
  dr: number;
  applies: boolean;
  reason?: string;
}

/**
 * The tooltip's HTML, or "" when there is nothing to name.
 *
 * The labels are item and trait names, and a listener's reasons are its own
 * text, so each is escaped: the tooltip is read as HTML, to break its lines.
 */
export function locationDrTooltip(
  location: { lines?: readonly LocationDrLine[]; locationDr?: number },
  format: (key: string, data: Record<string, string | number>) => string,
  escape: (text: string) => string,
): string {
  const rows = (location.lines ?? []).map((line) => {
    const data: Record<string, string | number> = { label: escape(line.label), dr: line.dr };
    if (line.reason) data.reason = escape(line.reason);
    // A refused line is named too: a player who sees their armour left out
    // should see who left it out and why.
    const key = line.applies ? "GWORLD.SheetV2.DrLine" : "GWORLD.SheetV2.DrLineRefused";
    return format(line.reason ? `${key}Why` : key, data);
  });
  const own = Number(location.locationDr) || 0;
  if (own > 0) rows.push(format("GWORLD.SheetV2.DrLineLocation", { dr: own }));
  return rows.join("<br>");
}
