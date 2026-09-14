/**
 * Where an add-on module puts what it shows and what it asks the table to do.
 *
 *   - **Sheet sections:** a module's own template, rendered at the start or
 *     end of a character sheet tab or of the item sheet, with its listeners
 *     bound for those who own the document.
 *   - **Row actions:** buttons on the rows of the system's own items on a
 *     character sheet, for those who own the character.
 *   - **Chat cards:** a card from the module's template, whose buttons call
 *     the module's handlers for those allowed to press them.
 *   - **GM tools:** buttons in the token controls, for the GM.
 *
 * Every callback a module gives is guarded: one that throws is logged and the
 * sheet, card or control goes on without it.
 */

import { SYSTEM_ID } from "./constants.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

function safely<T>(what: string, run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    console.warn(`gworld | ${what} failed`, error);
    return fallback;
  }
}

function validKey(module: unknown, key: unknown): module is string {
  return typeof module === "string" && IDENTIFIER.test(module) && typeof key === "string" && IDENTIFIER.test(key);
}

/** Loads a module's template ahead of time, so the first render doesn't wait on it. */
function preload(template: string): void {
  const loader = (globalThis as any).foundry?.applications?.handlebars?.loadTemplates;
  if (typeof loader !== "function") return;
  Promise.resolve(loader([template])).catch((error: unknown) => console.warn(`gworld | template ${template} could not be loaded`, error));
}

async function render(template: string, data: object): Promise<string> {
  return foundry.applications.handlebars.renderTemplate(template, data);
}

// ── sheet sections ─────────────────────────────────────────────────────────

/** The character sheet's tabs a section can go in. */
const CHARACTER_TABS = ["attributes", "skills", "magic", "traits", "combat", "body", "gear", "description"] as const;

export interface SheetSectionRegistration {
  module: string;
  key: string;
  sheet: "character" | "item";
  /** For the character sheet, the tab. The item sheet has one body, so it takes none. */
  tab?: (typeof CHARACTER_TABS)[number];
  position?: "start" | "end";
  /** A Handlebars template path, e.g. `modules/<module>/templates/section.hbs`. */
  template: string;
  /** The data the template renders with. The system adds `document`, `editable` and `owner`. */
  context?: (document: any, sheet: any) => object | Promise<object>;
  /** Binds the section's listeners. Called only for a user who owns the document. */
  listeners?: (element: HTMLElement, document: any, sheet: any) => void;
  /** Whether the section is shown for this document. Defaults to always. */
  visible?: (document: any) => boolean;
}

interface SheetSection extends Required<Omit<SheetSectionRegistration, "tab" | "context" | "listeners">> {
  id: string;
  tab: string;
  context: NonNullable<SheetSectionRegistration["context"]>;
  listeners: SheetSectionRegistration["listeners"] | null;
}

const sections: SheetSection[] = [];

/** Registers a section on a sheet. Returns its `<module>.<key>`, or null. */
export function registerSheetSection(registration: SheetSectionRegistration): string | null {
  const r = registration ?? ({} as SheetSectionRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `sheet section ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (r.sheet !== "character" && r.sheet !== "item") return refuse(what, 'sheet must be "character" or "item"');
  if (r.sheet === "character" && !CHARACTER_TABS.includes(r.tab as never)) return refuse(what, `tab must be one of ${CHARACTER_TABS.join(", ")}`);
  if (r.position !== undefined && r.position !== "start" && r.position !== "end") return refuse(what, 'position must be "start" or "end"');
  if (typeof r.template !== "string" || !r.template) return refuse(what, "it has no template");
  if (sections.some((s) => s.id === id)) return refuse(what, "that key is already registered");
  sections.push({
    id,
    module: r.module,
    key: r.key,
    sheet: r.sheet,
    tab: r.sheet === "character" ? String(r.tab) : "body",
    position: r.position ?? "end",
    template: r.template,
    context: typeof r.context === "function" ? r.context : () => ({}),
    listeners: typeof r.listeners === "function" ? r.listeners : null,
    visible: typeof r.visible === "function" ? r.visible : () => true,
  });
  preload(r.template);
  return id;
}

/** The sections shown on this sheet's tab, in registration order. */
function sectionsFor(sheet: "character" | "item", tab: string, document: any): SheetSection[] {
  return sections.filter((s) => s.sheet === sheet && s.tab === tab && safely(`sheet section ${s.id}`, () => s.visible(document) === true, false));
}

/** Renders the sections for a tab: `{ start, end }`, each a list of `{ id, html }`. */
export async function renderSections(sheet: "character" | "item", tab: string, document: any, app: any): Promise<{
  start: Array<{ id: string; html: string }>;
  end: Array<{ id: string; html: string }>;
}> {
  const out = { start: [] as Array<{ id: string; html: string }>, end: [] as Array<{ id: string; html: string }> };
  for (const section of sectionsFor(sheet, tab, document)) {
    try {
      const data = await section.context(document, app);
      const html = await render(section.template, {
        ...(data ?? {}),
        document,
        editable: Boolean(app?.isEditable),
        owner: Boolean(document?.isOwner),
      });
      out[section.position].push({ id: section.id, html });
    } catch (error) {
      console.warn(`gworld | sheet section ${section.id} failed to render`, error);
    }
  }
  return out;
}

/** Binds each rendered section's listeners, for a user who owns the document. */
export function bindSectionListeners(root: HTMLElement, document: any, app: any): void {
  if (!document?.isOwner) return;
  for (const element of root.querySelectorAll<HTMLElement>("[data-addon-section]")) {
    // A part the sheet didn't redraw this time keeps the listeners it has.
    if (element.dataset.addonBound) continue;
    element.dataset.addonBound = "true";
    const section = sections.find((s) => s.id === element.dataset.addonSection);
    if (!section?.listeners) continue;
    safely(`sheet section ${section.id} listeners`, () => section.listeners!(element, document, app), undefined);
  }
}

// ── row actions ────────────────────────────────────────────────────────────

export interface RowActionRegistration {
  module: string;
  key: string;
  /** The item types whose rows get the button. */
  itemTypes: string[];
  label: string;
  /** Font Awesome classes. */
  icon?: string;
  visible?: (item: any, actor: any) => boolean;
  run: (item: any, actor: any) => unknown;
}

interface RowAction {
  id: string;
  itemTypes: string[];
  label: string;
  icon: string;
  visible: (item: any, actor: any) => boolean;
  run: (item: any, actor: any) => unknown;
}

const rowActions: RowAction[] = [];

/** Registers a button on item rows of the character sheet. Returns its `<module>.<key>`, or null. */
export function registerRowAction(registration: RowActionRegistration): string | null {
  const r = registration ?? ({} as RowActionRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `row action ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (!Array.isArray(r.itemTypes) || r.itemTypes.length === 0 || r.itemTypes.some((t) => typeof t !== "string")) return refuse(what, "itemTypes must be a list of item types");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.run !== "function") return refuse(what, "it has no run function");
  if (rowActions.some((a) => a.id === id)) return refuse(what, "that key is already registered");
  rowActions.push({
    id,
    itemTypes: [...r.itemTypes],
    label: r.label.trim(),
    icon: typeof r.icon === "string" && r.icon ? r.icon : "fa-solid fa-play",
    visible: typeof r.visible === "function" ? r.visible : () => true,
    run: r.run,
  });
  return id;
}

/** The row actions shown for an item on this actor's sheet. */
function rowActionsFor(item: any, actor: any): Array<{ id: string; label: string; icon: string }> {
  return rowActions
    .filter((a) => a.itemTypes.includes(String(item?.type ?? "")) && safely(`row action ${a.id}`, () => a.visible(item, actor) === true, false))
    .map((a) => ({ id: a.id, label: a.label, icon: a.icon }));
}

/**
 * Puts the registered buttons on every item row of a rendered character
 * sheet, before the row's delete button where it has one. Only for a user who
 * owns the character: a viewer's sheet shows none.
 */
export function decorateItemRows(root: HTMLElement, actor: any): void {
  if (!actor?.isOwner || rowActions.length === 0) return;
  for (const row of root.querySelectorAll<HTMLElement>("[data-item-id]")) {
    if (row.querySelector("[data-addon-row-action]")) continue;
    const item = actor.items?.get?.(row.dataset.itemId);
    if (!item) continue;
    const actions = rowActionsFor(item, actor);
    if (actions.length === 0) continue;
    const buttons = actions.map((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "iconbtn rollable addon-row-action";
      button.dataset.action = "addonRowAction";
      button.dataset.addonRowAction = action.id;
      button.title = action.label;
      button.setAttribute("aria-label", action.label);
      const icon = document.createElement("i");
      icon.className = action.icon;
      button.append(icon);
      return button;
    });
    const remove = row.querySelector<HTMLElement>('[data-action="deleteItem"]');
    if (remove) remove.before(...buttons);
    else (row.lastElementChild ?? row).append(...buttons);
  }
}

/** Runs a row action on the item whose row it was clicked in. */
export async function runRowAction(actor: any, itemId: string, id: string): Promise<void> {
  if (!actor?.isOwner) return;
  const item = actor.items?.get?.(itemId);
  const action = rowActions.find((a) => a.id === id);
  if (!item || !action || !action.itemTypes.includes(item.type)) return;
  if (!safely(`row action ${id}`, () => action.visible(item, actor) === true, false)) return;
  try {
    await action.run(item, actor);
  } catch (error) {
    console.warn(`gworld | row action ${id} failed`, error);
  }
}

// ── chat cards ─────────────────────────────────────────────────────────────

/** Who may press a card's button: whoever owns the card's actor (or wrote the card, if it has none), or only the GM. */
export type CardPermission = "owner" | "gm";

export interface ChatCardAction {
  permission?: CardPermission;
  /** Whether the button is offered on this card to this user. Defaults to always. */
  visible?: (message: any, data: any, user: any) => boolean;
  run: (context: { message: any; data: any; actor: any; button: HTMLElement; user: any }) => unknown;
}

export interface ChatCardRegistration {
  module: string;
  key: string;
  /** A Handlebars template. Buttons carry `data-addon-card-action="<name>"`. */
  template: string;
  actions?: Record<string, ChatCardAction | ChatCardAction["run"]>;
}

interface ChatCard {
  id: string;
  template: string;
  actions: Record<string, Required<Omit<ChatCardAction, "visible">> & { visible: NonNullable<ChatCardAction["visible"]> }>;
}

const cards = new Map<string, ChatCard>();

/** The message flag a module's card is recorded under. */
const ADDON_CARD_FLAG = "addonCard";

/** Registers a chat card. Returns its `<module>.<key>`, or null. */
export function registerChatCard(registration: ChatCardRegistration): string | null {
  const r = registration ?? ({} as ChatCardRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `chat card ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.template !== "string" || !r.template) return refuse(what, "it has no template");
  if (cards.has(id)) return refuse(what, "that key is already registered");
  const actions: ChatCard["actions"] = {};
  for (const [name, action] of Object.entries(r.actions ?? {})) {
    const run = typeof action === "function" ? action : action?.run;
    if (!IDENTIFIER.test(name) || typeof run !== "function") return refuse(what, `action "${name}" is malformed`);
    const permission = typeof action === "function" ? "owner" : action.permission ?? "owner";
    if (permission !== "owner" && permission !== "gm") return refuse(what, `action "${name}" has an unknown permission`);
    const visible = typeof action === "function" ? undefined : action.visible;
    actions[name] = { permission, run, visible: typeof visible === "function" ? visible : () => true };
  }
  cards.set(id, { id, template: r.template, actions });
  preload(r.template);
  return id;
}

/** What a module's card stores on its message. */
export interface AddonCardFlag {
  card: string;
  data: Record<string, unknown>;
  actorUuid: string | null;
}

/**
 * Posts a module's card: its template rendered with `data`, and the card's
 * key, data and actor kept on the message for its buttons.
 */
export async function postChatCard(
  id: string,
  data: Record<string, unknown> = {},
  options: { actor?: any; whisper?: string[]; rollMode?: string } = {},
): Promise<unknown> {
  const card = cards.get(id);
  if (!card) {
    console.warn(`gworld | chat card ${id} is not registered`);
    return null;
  }
  const actor = options.actor ?? null;
  const content = await render(card.template, { ...data, actor });
  const flag: AddonCardFlag = { card: id, data, actorUuid: actor?.uuid ?? null };
  return ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker(actor ? { actor } : {}),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat addon-card" data-addon-card="${id}">${content}</div>`,
    ...(options.whisper ? { whisper: options.whisper } : {}),
    flags: { [SYSTEM_ID]: { [ADDON_CARD_FLAG]: flag } },
  });
}

/** Whether a user may press a button with this permission on this card. */
export function mayPress(permission: CardPermission, user: any, message: any, actor: any): boolean {
  if (user?.isGM) return true;
  if (permission === "gm") return false;
  if (actor) return Boolean(actor.testUserPermission?.(user, "OWNER"));
  return Boolean(message?.author?.id && message.author.id === user?.id);
}

/**
 * Wires a rendered module card: each button the viewer may press calls its
 * handler, and the rest are removed. A card whose module isn't running keeps
 * its text and loses its buttons.
 */
export async function addAddonCardControls(message: any, html: HTMLElement): Promise<void> {
  const flag = message?.getFlag?.(SYSTEM_ID, ADDON_CARD_FLAG) as AddonCardFlag | undefined;
  if (!flag?.card) return;
  const buttons = [...html.querySelectorAll<HTMLElement>("[data-addon-card-action]")];
  if (buttons.length === 0) return;
  const card = cards.get(flag.card);
  const actor: any = flag.actorUuid ? await fromUuid(flag.actorUuid).catch(() => null) : null;
  const user = game.user;
  for (const button of buttons) {
    const name = button.dataset.addonCardAction ?? "";
    const action = card?.actions[name];
    const allowed = action
      && mayPress(action.permission, user, message, actor)
      && safely(`chat card ${flag.card} ${name}`, () => action.visible(message, flag.data, user) === true, false);
    if (!allowed) {
      button.remove();
      continue;
    }
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (button.hasAttribute("disabled")) return;
      button.setAttribute("disabled", "");
      try {
        await action.run({ message, data: flag.data, actor, button, user });
      } catch (error) {
        console.warn(`gworld | chat card ${flag.card} ${name} failed`, error);
      } finally {
        button.removeAttribute("disabled");
      }
    });
  }
}

// ── GM tools ───────────────────────────────────────────────────────────────

export interface GmToolRegistration {
  module: string;
  key: string;
  label: string;
  icon?: string;
  open: () => unknown;
  /** Whether the tool is offered. Defaults to always. */
  visible?: () => boolean;
}

const gmTools: Array<{ id: string; label: string; icon: string; open: () => unknown; visible: () => boolean }> = [];

/** Registers a GM tool, a button in the token controls. Returns its `<module>.<key>`, or null. */
export function registerGmTool(registration: GmToolRegistration): string | null {
  const r = registration ?? ({} as GmToolRegistration);
  const id = `${r.module}.${r.key}`;
  const what = `GM tool ${id}`;
  if (!validKey(r.module, r.key)) return refuse(what, "the module id or key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.open !== "function") return refuse(what, "it has no open function");
  if (gmTools.some((t) => t.id === id)) return refuse(what, "that key is already registered");
  gmTools.push({
    id,
    label: r.label.trim(),
    icon: typeof r.icon === "string" && r.icon ? r.icon : "fa-solid fa-toolbox",
    open: r.open,
    visible: typeof r.visible === "function" ? r.visible : () => true,
  });
  return id;
}

/**
 * Adds the GM tools to the token controls, as buttons only the GM sees. Called
 * from `getSceneControlButtons` with the controls Foundry is building.
 */
export function addGmTools(controls: Record<string, any>, user: any): void {
  const tokens = controls?.tokens;
  if (!tokens) return;
  tokens.tools ??= {};
  const base = Object.keys(tokens.tools).length;
  gmTools.forEach((tool, index) => {
    tokens.tools[`gworld-${tool.id}`] = {
      name: `gworld-${tool.id}`,
      title: tool.label,
      icon: tool.icon,
      order: base + index + 1,
      button: true,
      visible: Boolean(user?.isGM) && safely(`GM tool ${tool.id}`, () => tool.visible() === true, false),
      onChange: () => {
        if (!game.user?.isGM) return;
        void Promise.resolve(safely(`GM tool ${tool.id}`, () => tool.open(), undefined)).catch((error) =>
          console.warn(`gworld | GM tool ${tool.id} failed`, error));
      },
    };
  });
}

/** Registers the hooks this module needs. Called once, at init. */
export function registerSheetExtensionHooks(): void {
  Hooks.on("getSceneControlButtons", (controls: Record<string, any>) => addGmTools(controls, game.user));
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => {
    void addAddonCardControls(message, html);
  });
}

/** What the API exposes. */
export const sheetsApi = Object.freeze({ registerSheetSection, registerRowAction, registerGmTool });
export const chatApi = Object.freeze({ registerChatCard, post: postChatCard });
