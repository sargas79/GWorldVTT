/**
 * How an item describes itself in one line.
 *
 * There are 630 skills in the compendium, and a list of 630 bare names is not
 * a list anyone can pick from: a skill without its attribute and difficulty is
 * just a word. Every type gets the statistic that actually distinguishes it.
 *
 * Kept apart from the picker that uses it so it can be tested without Foundry,
 * which the application class needs at import time.
 */

export function summarise(type: string, system: any): string {
  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

  switch (type) {
    case "skill":
      return `${system?.attribute ?? "?"}/${system?.difficulty ?? "?"}`;
    case "technique":
      return system?.prerequisite
        ? `${system.prerequisite}${system.defaultModifier ? ` ${system.defaultModifier}` : ""}`
        : "";
    case "trait": {
      // The table wins where there is one, exactly as totalPoints reads it:
      // Wealth is 10/20/30/50/75 and no single figure says that.
      const table: number[] = system?.costTable ?? [];
      if (table.length > 0) return table.join("/");
      if (system?.pointsPerLevel) return `${signed(system.pointsPerLevel)}/level`;
      return signed(system?.points ?? 0);
    }
    case "armor":
      return `DR ${system?.dr ?? 0}`;
    case "shield":
      return `DB ${system?.db ?? 0}`;
    case "language":
      return "";
    case "modifier": {
      // "+50%/+100%" for one priced by level, "+40%" for a flat one, and the
      // group for the handful the page prices by hand.
      const table: number[] = system?.costTable ?? [];
      if (table.length > 0) return table.map((v) => `${signed(v)}%`).join("/");
      if (system?.value) return `${signed(system.value)}%${system?.maxLevels === 1 ? "" : system?.maxLevels || system?.levelNames?.length ? "/level" : ""}`;
      return String(system?.group ?? "");
    }
    case "spell": {
      // A spell is told from another by where it is filed and what it costs:
      // "Fire · Missile · 1 to Magery" says more than IQ/H, which nearly
      // every spell is.
      const colleges: string[] = Array.isArray(system?.colleges) ? system.colleges : [];
      const classes: string[] = Array.isArray(system?.classes) ? system.classes : [];
      const cost = String(system?.energy?.text ?? "").trim();
      return [
        colleges.join("/"),
        classes.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join("/"),
        cost,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    default: {
      const weight = Number(system?.weight ?? 0);
      const cost = Number(system?.cost ?? 0);
      // Nothing rather than "$0, 0 lb", which says less than an empty cell.
      if (!weight && !cost) return "";
      return `$${cost}, ${weight} lb`;
    }
  }
}
