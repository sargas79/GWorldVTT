/**
 * Handlebars helpers and shared partials.
 *
 * The icon partials are inline SVG rather than a font, per the Industry design
 * system: Lucide geometry at stroke-width 1.5.
 */

declare const Handlebars: {
  registerHelper(name: string, fn: (...args: any[]) => unknown): void;
  registerPartial(name: string, source: string): void;
};

const ICONS: Record<string, string> = {
  "gworld.die": `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18"></rect>
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"></circle>
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"></circle>
  </svg>`,
  "gworld.info": `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path>
  </svg>`,
  "gworld.plus": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M12 5v14"></path><path d="M5 12h14"></path>
  </svg>`,
  "gworld.search": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
  </svg>`,
  "gworld.trash": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>
    <path d="M5 7l1 13h12l1-13"></path><path d="M9 7V4h6v3"></path>
  </svg>`,
  "gworld.lock": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <rect x="4" y="10" width="16" height="10"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
  </svg>`,
};

export function registerTemplateHelpers(): void {
  for (const [name, svg] of Object.entries(ICONS)) Handlebars.registerPartial(name, svg);

  /** Percentage of a pool that is filled, clamped to 0-100 for the bar width. */
  Handlebars.registerHelper("percent", (value: number, max: number) => {
    const v = Number(value);
    const m = Number(max);
    if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
  });

  /** Fixed-decimal formatting, e.g. Basic Speed as 6.00. */
  Handlebars.registerHelper("decimal", (value: number, places: number) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return "";
    const p = Number.isFinite(Number(places)) ? Number(places) : 2;
    // Whole numbers of pounds read better without trailing zeroes.
    return p === 1 && Number.isInteger(v) ? String(v) : v.toFixed(p);
  });

  /** A signed number, for reaction and skill modifiers. */
  Handlebars.registerHelper("signed", (value: number) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v === 0) return "0";
    return v > 0 ? `+${v}` : String(v);
  });

  /** Greater-than comparison, for conditionals the data cannot express directly. */
  Handlebars.registerHelper("gt", (a: number, b: number) => Number(a) > Number(b));

  /** String concatenation, used to build localization keys from data. */
  Handlebars.registerHelper("concat", (...args: unknown[]) => {
    args.pop(); // Handlebars appends its options object.
    return args.join("");
  });

  /** A skill's relative level, e.g. "DX+2", or its default when untrained. */
  Handlebars.registerHelper("relativeLabel", (skill: any) => {
    const system = skill?.system;
    if (!system) return "";
    const attribute = system.attribute;
    const relative = system.derived?.relativeLevel;

    if (relative === null || relative === undefined) {
      const best = (system.defaults ?? [])[0];
      return best ? `${best.attribute}${best.modifier >= 0 ? "+" : ""}${best.modifier}` : "—";
    }
    if (relative === 0) return attribute;
    return `${attribute}${relative > 0 ? "+" : ""}${relative}`;
  });
}
