/**
 * Handlebars helpers and shared partials.
 *
 * The icon partials are inline SVG rather than a font, per the Industry design
 * system: Lucide geometry at stroke-width 1.5.
 */

import { SYSTEM_ID } from "./constants.js";

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
  // The new character sheet's sidebar, one per tab, and its pin. Lucide
  // geometry at the same stroke as the rest.
  "gworld.v2icon.overview": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect>
  </svg>`,
  "gworld.v2icon.skills": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="m12 3 9 5-9 5-9-5 9-5z"></path><path d="m3 13 9 5 9-5"></path><path d="m3 17.5 9 5 9-5"></path>
  </svg>`,
  "gworld.v2icon.traits": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M12 3l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.4 7 18.2l1.2-5.6L4 8.8l5.6-.6z"></path>
  </svg>`,
  "gworld.v2icon.combat": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 17.5 3 6V3h3l11.5 11.5"></path><path d="m13 19 6-6"></path><path d="m16 16 4 4"></path><path d="m19 21 2-2"></path>
    <path d="M14.5 6.5 18 3h3v3l-3.5 3.5"></path><path d="m5 14 4 4"></path><path d="m7 17-3 3"></path><path d="m3 19 2 2"></path>
  </svg>`,
  "gworld.v2icon.inventory": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="1"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M3 12h18"></path>
  </svg>`,
  "gworld.v2icon.journal": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"></path><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"></path>
  </svg>`,
  "gworld.v2icon.progression": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>
  </svg>`,
  "gworld.v2icon.build": `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 11V6a3 3 0 0 1 6 0v5"></path><path d="M5 11h14l-1 10H6z"></path><path d="M12 15v2"></path>
  </svg>`,
  "gworld.v2icon.magic": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path>
    <path d="M17.8 6.2 19 5"></path><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path>
  </svg>`,
  "gworld.v2icon.star": `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
    <path d="M12 3l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.4 7 18.2l1.2-5.6L4 8.8l5.6-.6z"></path>
  </svg>`,
  // Worn or held, for the Equip button on a row of gear.
  "gworld.v2icon.hand": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0v5"></path><path d="M14 10V4a2 2 0 0 0-4 0v6"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
  </svg>`,
  "gworld.v2icon.chevron": `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m6 9 6 6 6-6"></path>
  </svg>`,
  // The party sheet's tabs, and its rows' move buttons.
  "gworld.v2icon.members": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path>
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7"></path><path d="M17.5 13.6A6.5 6.5 0 0 1 21.5 20"></path>
  </svg>`,
  "gworld.v2icon.campaign": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 21V4"></path><path d="M5 4h13l-3 4.5 3 4.5H5"></path>
  </svg>`,
  "gworld.v2icon.arrowUp": `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>
  </svg>`,
  "gworld.v2icon.arrowDown": `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>
  </svg>`,
};

/**
 * Partials that are too long to keep as a string in this file.
 *
 * One entry of a template is a row of six fields, and it is rendered in three
 * different places on the item sheet -- required, inside a choice group, and
 * orphaned -- so it lives in its own file and is registered by name.
 */
const FILE_PARTIALS: Record<string, string> = {
  "gworld.templateEntry": `systems/${SYSTEM_ID}/templates/item/template-entry.hbs`,
  "gworld.addonSections": `systems/${SYSTEM_ID}/templates/actor/addon-sections.hbs`,
  "gworld.addonSheetSections": `systems/${SYSTEM_ID}/templates/actor/addon-sheet-sections.hbs`,
  "gworld.attackExtras": `systems/${SYSTEM_ID}/templates/actor/attack-extras.hbs`,
  // The new character sheet's own pieces.
  "gworld.v2.attackCard": `systems/${SYSTEM_ID}/templates/actor/v2/attack-card.hbs`,
  "gworld.v2.bodyOutline": `systems/${SYSTEM_ID}/templates/actor/v2/body-outline.hbs`,
  "gworld.v2.gearRow": `systems/${SYSTEM_ID}/templates/actor/v2/gear-row.hbs`,
  // The classic tabs' sections, one partial each, so both character sheets
  // draw them from one copy: a section a module's rule reads, or a button a
  // module decorates, is the same markup on either sheet.
  "gworld.part.attack-melee-affliction": `systems/${SYSTEM_ID}/templates/actor/parts/attack-melee-affliction.hbs`,
  "gworld.part.attack-melee-damage": `systems/${SYSTEM_ID}/templates/actor/parts/attack-melee-damage.hbs`,
  "gworld.part.attack-melee-roll": `systems/${SYSTEM_ID}/templates/actor/parts/attack-melee-roll.hbs`,
  "gworld.part.attack-ranged-affliction": `systems/${SYSTEM_ID}/templates/actor/parts/attack-ranged-affliction.hbs`,
  "gworld.part.attack-ranged-damage": `systems/${SYSTEM_ID}/templates/actor/parts/attack-ranged-damage.hbs`,
  "gworld.part.attack-ranged-roll": `systems/${SYSTEM_ID}/templates/actor/parts/attack-ranged-roll.hbs`,
  "gworld.part.attributes-basic": `systems/${SYSTEM_ID}/templates/actor/parts/attributes-basic.hbs`,
  "gworld.part.attributes-campaign": `systems/${SYSTEM_ID}/templates/actor/parts/attributes-campaign.hbs`,
  "gworld.part.attributes-damage": `systems/${SYSTEM_ID}/templates/actor/parts/attributes-damage.hbs`,
  "gworld.part.attributes-points": `systems/${SYSTEM_ID}/templates/actor/parts/attributes-points.hbs`,
  "gworld.part.attributes-secondary": `systems/${SYSTEM_ID}/templates/actor/parts/attributes-secondary.hbs`,
  "gworld.part.body-feats": `systems/${SYSTEM_ID}/templates/actor/parts/body-feats.hbs`,
  "gworld.part.body-hazards": `systems/${SYSTEM_ID}/templates/actor/parts/body-hazards.hbs`,
  "gworld.part.body-locations": `systems/${SYSTEM_ID}/templates/actor/parts/body-locations.hbs`,
  "gworld.part.body-protection": `systems/${SYSTEM_ID}/templates/actor/parts/body-protection.hbs`,
  "gworld.part.body-recovery": `systems/${SYSTEM_ID}/templates/actor/parts/body-recovery.hbs`,
  "gworld.part.combat-actions": `systems/${SYSTEM_ID}/templates/actor/parts/combat-actions.hbs`,
  "gworld.part.combat-defenses": `systems/${SYSTEM_ID}/templates/actor/parts/combat-defenses.hbs`,
  "gworld.part.combat-maneuver": `systems/${SYSTEM_ID}/templates/actor/parts/combat-maneuver.hbs`,
  "gworld.part.combat-melee": `systems/${SYSTEM_ID}/templates/actor/parts/combat-melee.hbs`,
  "gworld.part.combat-movement": `systems/${SYSTEM_ID}/templates/actor/parts/combat-movement.hbs`,
  "gworld.part.combat-ranged": `systems/${SYSTEM_ID}/templates/actor/parts/combat-ranged.hbs`,
  "gworld.part.description-appearance": `systems/${SYSTEM_ID}/templates/actor/parts/description-appearance.hbs`,
  "gworld.part.description-biography": `systems/${SYSTEM_ID}/templates/actor/parts/description-biography.hbs`,
  "gworld.part.description-languages": `systems/${SYSTEM_ID}/templates/actor/parts/description-languages.hbs`,
  "gworld.part.description-notes": `systems/${SYSTEM_ID}/templates/actor/parts/description-notes.hbs`,
  "gworld.part.description-npc": `systems/${SYSTEM_ID}/templates/actor/parts/description-npc.hbs`,
  "gworld.part.description-vitals": `systems/${SYSTEM_ID}/templates/actor/parts/description-vitals.hbs`,
  "gworld.part.gear-carried": `systems/${SYSTEM_ID}/templates/actor/parts/gear-carried.hbs`,
  "gworld.part.gear-encumbrance": `systems/${SYSTEM_ID}/templates/actor/parts/gear-encumbrance.hbs`,
  "gworld.part.gear-money": `systems/${SYSTEM_ID}/templates/actor/parts/gear-money.hbs`,
  "gworld.v2.money": `systems/${SYSTEM_ID}/templates/actor/v2/money.hbs`,
  "gworld.part.gear-stored": `systems/${SYSTEM_ID}/templates/actor/parts/gear-stored.hbs`,
  "gworld.part.magic-body": `systems/${SYSTEM_ID}/templates/actor/parts/magic-body.hbs`,
  "gworld.part.skills-point-spending": `systems/${SYSTEM_ID}/templates/actor/parts/skills-point-spending.hbs`,
  "gworld.part.skills-techniques": `systems/${SYSTEM_ID}/templates/actor/parts/skills-techniques.hbs`,
  "gworld.part.traits-disadvantage-limit": `systems/${SYSTEM_ID}/templates/actor/parts/traits-disadvantage-limit.hbs`,
  "gworld.part.traits-granted": `systems/${SYSTEM_ID}/templates/actor/parts/traits-granted.hbs`,
  "gworld.part.traits-psionics": `systems/${SYSTEM_ID}/templates/actor/parts/traits-psionics.hbs`,
  "gworld.part.traits-templates": `systems/${SYSTEM_ID}/templates/actor/parts/traits-templates.hbs`,
};

/** Loads the partials that live in files. Awaited during init. */
export async function loadFilePartials(): Promise<void> {
  await foundry.applications.handlebars.loadTemplates(FILE_PARTIALS);
}

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

  /**
   * Bonus lines as one line of text -- "Talent +2 · Equipment +1" -- with the
   * reason beside any line a module changed. For a tooltip.
   */
  Handlebars.registerHelper("bonusLines", (lines: unknown) =>
    (Array.isArray(lines) ? lines : [])
      .map((l: { label?: string; value?: number; reason?: string }) => {
        const v = Number(l?.value) || 0;
        return `${l?.label ?? ""} ${v >= 0 ? "+" : ""}${v}${l?.reason ? ` (${l.reason})` : ""}`;
      })
      .join(" · "));

  /** Greater-than comparison, for conditionals the data cannot express directly. */
  Handlebars.registerHelper("gt", (a: number, b: number) => Number(a) > Number(b));

  /** Equality, for selecting the current option of a hand-written select. */
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

  /** Any of these, for a section that appears when either of two rules is on. */
  Handlebars.registerHelper("or", (...args: unknown[]) => {
    args.pop(); // Handlebars appends its options object.
    return args.some(Boolean);
  });

  /** The first of two that is actually there, for a value written one way or the other. */
  Handlebars.registerHelper("either", (first: unknown, second: unknown) =>
    first === undefined || first === null || first === "" ? second : first,
  );

  /** A list as one line, for a field edited as text and stored as an array. */
  Handlebars.registerHelper("join", (list: unknown, separator: unknown) =>
    Array.isArray(list) ? list.join(typeof separator === "string" ? separator : ", ") : "",
  );

  /** All of these, for a control that needs a rule on and something to act on. */
  Handlebars.registerHelper("and", (...args: unknown[]) => {
    args.pop();
    return args.every(Boolean);
  });

  /** Whether a list holds a value, for checkbox sets such as armor locations. */
  Handlebars.registerHelper("includes", (list: unknown, value: unknown) =>
    Array.isArray(list) && list.includes(value),
  );

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
      if (!best) return "—";
      // A default from another skill shows that skill's name, not the schema's
      // unused attribute field — Broadsword reads "Shortsword-2", not "DX-2".
      const source = best.from === "skill" ? best.skill || "—" : best.attribute;
      return `${source}${best.modifier >= 0 ? "+" : ""}${best.modifier}`;
    }
    if (relative === 0) return attribute;
    return `${attribute}${relative > 0 ? "+" : ""}${relative}`;
  });
}
