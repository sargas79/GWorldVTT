/**
 * Rolling on a table from the GM Screen: the dice, anything the table asks
 * first (a Fright Check's margin, a reaction's modifiers), and a chat card
 * naming the row the total landed on -- found by the automation's own lookup,
 * so the card and the screen's highlighted row always agree.
 */

import { SYSTEM_ID } from "../constants.js";
import { successRollMessageMode } from "../roll.js";
import { buildSection, rollSpec, sectionDef } from "./assemble.js";
import { K } from "./sections/shared.js";
import { hiddenTabs, mayOpen } from "./settings.js";
import type { BuildContext, GmTable } from "./types.js";

export const ROLL_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/gm-screen-roll.hbs`;

/** Fired on the roller's client after a roll from the screen, so an open screen can mark the row. */
export const ROLLED_HOOK = "gworld.gmScreenRolled";

/** What a roll from the screen came to. */
export interface ScreenRoll {
  section: string;
  total: number;
  /** The key of the row it landed on. */
  row: string;
  /** Which side, for a location that has one: the table's for an arm or leg, a 1d's for a hand or foot. */
  side: { die: number | null; side: "right" | "left" } | null;
}

/** The context the screen builds with, in this user's language. */
export function foundryContext(): BuildContext {
  const g = game as any;
  return {
    t: (key, data) => (data ? g.i18n.format(key, data) : g.i18n.localize(key)),
    moduleTitle: (id) => g.modules?.get(id)?.title ?? id,
  };
}

/** The chat modes a roll can go out in, with this user's current one first chosen. */
function messageModes(): { current: string; modes: Array<{ id: string; label: string }> } {
  const g = game as any;
  const known: Record<string, { label?: string }> = (CONFIG as any).ChatMessage?.modes ?? {
    public: { label: "CHAT.RollPublic" },
    gm: { label: "CHAT.RollPrivate" },
    blind: { label: "CHAT.RollBlind" },
    self: { label: "CHAT.RollSelf" },
  };
  let setting: unknown;
  for (const key of ["messageMode", "rollMode"]) {
    try {
      setting = g.settings.get("core", key);
      if (setting) break;
    } catch {
      // Not a setting in this version of Foundry.
    }
  }
  const current =
    successRollMessageMode({ rollMode: setting }) ?? Object.keys(known)[0] ?? "public";
  return {
    current,
    modes: Object.entries(known).map(([id, mode]) => ({
      id,
      label: g.i18n.localize(mode?.label ?? id),
    })),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Asks what a table needs before its roll: the margin of failure, or the
 * reaction modifiers, and which chat mode it goes out in. Null if cancelled.
 */
async function ask(
  kind: "margin" | "modifier",
  title: string,
): Promise<{ extra: number; messageMode: string } | null> {
  const g = game as any;
  const t = (key: string, data?: Record<string, string | number>) =>
    data ? g.i18n.format(`${K}.${key}`, data) : g.i18n.localize(`${K}.${key}`);
  const { current, modes } = messageModes();
  const start = kind === "margin" ? 1 : 0;
  const min = kind === "margin" ? 1 : -99;
  const content = `
    <div class="gs-ask" data-kind="${kind}">
      <p>${escapeHtml(t(`Ask.${kind}Hint`))}</p>
      <label class="gs-ask-label" for="gs-ask-extra">${escapeHtml(t(`Ask.${kind}`))}</label>
      <div class="gs-ask-row">
        <div class="gs-step">
          <button type="button" data-step="-1" aria-label="${escapeHtml(t("Ask.Decrease"))}">−</button>
          <input id="gs-ask-extra" name="extra" type="number" value="${start}" min="${min}" max="99" step="1" />
          <button type="button" data-step="1" aria-label="${escapeHtml(t("Ask.Increase"))}">+</button>
        </div>
        <div class="gs-ask-preview"><span>${escapeHtml(t("Ask.Possible"))}</span><b data-preview></b></div>
      </div>
      <label class="gs-ask-mode">
        <span>${escapeHtml(t("Ask.RollMode"))}</span>
        <select name="messageMode">${modes.map((mode) => `<option value="${escapeHtml(mode.id)}"${mode.id === current ? " selected" : ""}>${escapeHtml(mode.label)}</option>`).join("")}</select>
      </label>
    </div>`;
  const read = (root: HTMLElement | null) =>
    Math.max(
      min,
      Math.min(
        99,
        Math.round(Number(root?.querySelector<HTMLInputElement>('[name="extra"]')?.value) || 0),
      ),
    );
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    classes: ["gworld", "gworld-gm-screen-ask"],
    content,
    ok: {
      label: t("Ask.Roll"),
      icon: "fa-solid fa-dice",
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return {
          extra: read(root),
          messageMode:
            root?.querySelector<HTMLSelectElement>('[name="messageMode"]')?.value ?? current,
        };
      },
    },
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement | null = dialog?.element ?? null;
      const input = root?.querySelector<HTMLInputElement>('[name="extra"]');
      const preview = root?.querySelector<HTMLElement>("[data-preview]");
      const okButton = root?.querySelector<HTMLButtonElement>('button[data-action="ok"]');
      const update = () => {
        const extra = read(root);
        if (preview) preview.textContent = `${3 + extra} – ${18 + extra}`;
        if (okButton) {
          const label = okButton.querySelector("span") ?? okButton;
          label.textContent = t("Ask.RollWith", {
            sign: extra < 0 ? "−" : "+",
            value: Math.abs(extra),
          });
        }
      };
      for (const step of root?.querySelectorAll<HTMLButtonElement>("[data-step]") ?? []) {
        step.addEventListener("click", () => {
          if (input) input.value = String(read(root) + Number(step.dataset.step));
          update();
        });
      }
      input?.addEventListener("input", update);
      update();
    },
    rejectClose: false,
  } as any);
  return result && typeof result === "object"
    ? (result as { extra: number; messageMode: string })
    : null;
}

/**
 * Whether this user may roll on a section: a GM on any, a player only where
 * the screen would show it to them -- the screen open to players, the tab
 * not kept back, the section not the GM's alone. Otherwise the card would
 * give away what the screen keeps from them.
 */
export function mayRollOn(def: { tab: string; gmOnly?: boolean }): boolean {
  if ((game as any).user?.isGM === true) return true;
  return mayOpen() && def.gmOnly !== true && !hiddenTabs().includes(def.tab);
}

/** The row's words for the card: what it is called, and what it says. */
function describeRow(
  table: GmTable | undefined,
  key: string,
): { cells: string[]; roll: string; result: string; detail: string } | null {
  const found = table?.rows.find((row) => row.key === key);
  if (!table || !found) return null;
  return {
    cells: found.cells,
    roll: found.cells[0] ?? "",
    result: found.cells[1] ?? "",
    // A three-column table's last column is what the result means: the reaction's description.
    detail: table.columns.length === 3 ? (found.cells[2] ?? "") : "",
  };
}

/**
 * Rolls on a section and posts the card. `extra` skips the question a table
 * would ask (a margin, a modifier); `messageMode` chooses who sees the card.
 * Null where the section is not rolled on, or the question was cancelled.
 */
export async function rollOnSection(
  id: string,
  options: { extra?: number; messageMode?: string } = {},
): Promise<ScreenRoll | null> {
  const spec = rollSpec(id);
  const def = sectionDef(id);
  if (!spec || !def || !mayRollOn(def)) return null;
  const context = foundryContext();
  const section = buildSection(def, context);
  if (!section) return null;

  let extra = Number(options.extra) || 0;
  let messageMode = options.messageMode ?? null;
  if (spec.ask && options.extra === undefined) {
    const asked = await ask(spec.ask, section.title);
    if (!asked) return null;
    extra = asked.extra;
    messageMode = asked.messageMode;
  }

  const formula = extra
    ? `${spec.formula} ${extra < 0 ? "-" : "+"} ${Math.abs(extra)}`
    : spec.formula;
  const roll = new Roll(formula);
  await roll.evaluate();
  const total = Number(roll.total);
  const row = spec.rowFor(total);

  let side: ScreenRoll["side"] = null;
  const rolls: any[] = [roll];
  if (spec.side) {
    let die: number | null = null;
    if (spec.side.needsDie(total)) {
      const sideRoll = new Roll("1d6");
      await sideRoll.evaluate();
      rolls.push(sideRoll);
      die = Number(sideRoll.total);
    }
    const which = spec.side.of(total, die ?? undefined);
    if (which) side = { die, side: which };
  }

  const table = section.parts.find((part) => part.content.kind === "table")?.content as
    GmTable | undefined;
  const described = describeRow(table, row);
  const dice: number[] =
    (roll as any).dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  const content = await foundry.applications.handlebars.renderTemplate(ROLL_TEMPLATE, {
    title: section.title,
    cite: section.cite,
    section: id,
    row,
    dice,
    extra: extra ? `${extra < 0 ? "−" : "+"} ${Math.abs(extra)}` : "",
    total,
    rollCell: described?.roll ?? String(total),
    result: described?.result ?? context.t(`${K}.Card.NoRow`, { total }),
    detail: described?.detail ?? "",
    side: side
      ? side.die === null
        ? context.t(`${K}.Card.SideOnly`, { side: context.t(`${K}.Card.${side.side}`) })
        : context.t(`${K}.Card.Side`, { side: context.t(`${K}.Card.${side.side}`), die: side.die })
      : "",
  });
  const mode = messageMode ? successRollMessageMode({ rollMode: messageMode }) : null;
  await ChatMessage.implementation.create(
    {
      speaker: ChatMessage.implementation.getSpeaker(),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content,
      rolls,
      flags: { [SYSTEM_ID]: { gmScreen: { section: id, row, total } } },
    },
    mode ? { messageMode: mode } : {},
  );

  const result: ScreenRoll = { section: id, total, row, side };
  Hooks.callAll(ROLLED_HOOK, result);
  return result;
}
