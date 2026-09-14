import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Registries are module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../sheet-extensions.js");
}

const globals = globalThis as Record<string, unknown>;

/** A stand-in for the few DOM calls the module makes, since the tests run without a DOM. */
class FakeElement {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  className = "";
  type = "";
  title = "";
  listeners: Array<(event: { preventDefault(): void }) => unknown> = [];
  constructor(dataset: Record<string, string> = {}) { Object.assign(this.dataset, dataset); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(...nodes: FakeElement[]) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  before(...nodes: FakeElement[]) {
    const siblings = this.parent!.children;
    for (const n of nodes) n.parent = this.parent;
    siblings.splice(siblings.indexOf(this), 0, ...nodes);
  }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  get lastElementChild(): FakeElement | null { return this.children.at(-1) ?? null; }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(selector: string): FakeElement[] {
    const attr = /\[data-([a-z-]+)(?:="([^"]*)")?\]/.exec(selector)!;
    const key = attr[1]!.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    return this.all().filter((e) => key in e.dataset && (attr[2] === undefined || e.dataset[key] === attr[2]));
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(_type: string, listener: (event: { preventDefault(): void }) => unknown) { this.listeners.push(listener); }
  click() { for (const l of this.listeners) void l({ preventDefault() {} }); }
}

const el = (dataset: Record<string, string> = {}, ...children: FakeElement[]) => {
  const e = new FakeElement(dataset);
  e.append(...children);
  return e;
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.document = { createElement: () => new FakeElement() };
  globals.foundry = {
    applications: {
      handlebars: {
        loadTemplates: vi.fn(async () => undefined),
        renderTemplate: vi.fn(async (template: string, data: Record<string, unknown>) => `<p>${template}:${String(data.label ?? "")}:${String(data.editable)}</p>`),
      },
    },
  };
});

afterEach(() => {
  delete globals.foundry;
  delete globals.document;
  delete globals.game;
  delete globals.fromUuid;
  vi.restoreAllMocks();
});

/** Sheet and chat extension points for add-on modules (sargas79/GWorldVTT#240). */
describe("sheet sections", () => {
  it("renders a module's sections where they were registered, for the documents they're shown on", async () => {
    const api = await load();
    expect(api.registerSheetSection({
      module: "test-addon", key: "focus", sheet: "character", tab: "magic", position: "start",
      template: "modules/test-addon/focus.hbs", context: () => ({ label: "Focus" }), visible: (actor) => actor.type === "character",
    })).toBe("test-addon.focus");
    api.registerSheetSection({ module: "test-addon", key: "notes", sheet: "character", tab: "magic", template: "modules/test-addon/notes.hbs" });
    api.registerSheetSection({ module: "test-addon", key: "item", sheet: "item", template: "modules/test-addon/item.hbs" });

    const sections = await api.renderSections("character", "magic", { type: "character" }, { isEditable: true });
    expect(sections.start).toEqual([{ id: "test-addon.focus", html: "<p>modules/test-addon/focus.hbs:Focus:true</p>" }]);
    expect(sections.end.map((s) => s.id)).toEqual(["test-addon.notes"]);
    expect((await api.renderSections("character", "magic", { type: "npc" }, {})).start).toEqual([]);
    expect((await api.renderSections("item", "body", {}, {})).end.map((s) => s.id)).toEqual(["test-addon.item"]);
    expect((await api.renderSections("character", "gear", {}, {})).end).toEqual([]);
  });

  it("refuses a character section with no tab, and a key used twice", async () => {
    const api = await load();
    expect(api.registerSheetSection({ module: "test-addon", key: "a", sheet: "character", template: "a.hbs" })).toBeNull();
    expect(api.registerSheetSection({ module: "test-addon", key: "a", sheet: "item", template: "a.hbs" })).toBe("test-addon.a");
    expect(api.registerSheetSection({ module: "test-addon", key: "a", sheet: "item", template: "b.hbs" })).toBeNull();
  });

  it("binds listeners once, and only for an owner", async () => {
    const api = await load();
    const listeners = vi.fn();
    api.registerSheetSection({ module: "test-addon", key: "focus", sheet: "item", template: "focus.hbs", listeners });
    const root = el({}, el({ addonSection: "test-addon.focus" })) as unknown as HTMLElement;
    api.bindSectionListeners(root, { isOwner: false }, {});
    expect(listeners).not.toHaveBeenCalled();
    api.bindSectionListeners(root, { isOwner: true }, {});
    api.bindSectionListeners(root, { isOwner: true }, {});
    expect(listeners).toHaveBeenCalledTimes(1);
  });
});

describe("row actions", () => {
  const sword = { id: "s1", type: "equipment", system: { loaded: false } };
  const actor = (isOwner: boolean) => ({ isOwner, items: { get: (id: string) => (id === "s1" ? sword : undefined) } });

  it("puts a button before the row's delete button, for an owner and the item types it names", async () => {
    const api = await load();
    api.registerRowAction({ module: "test-addon", key: "load", itemTypes: ["equipment"], label: "Load", icon: "fa-solid fa-bolt", visible: (item) => !item.system.loaded, run: () => {} });
    const remove = el({ action: "deleteItem" });
    const fake = el({}, el({ itemId: "s1" }, el(), el({}, remove)));
    const root = fake as unknown as HTMLElement;
    api.decorateItemRows(root, actor(false));
    expect(root.querySelector("[data-addon-row-action]")).toBeNull();
    api.decorateItemRows(root, actor(true));
    api.decorateItemRows(root, actor(true));
    const buttons = fake.querySelectorAll("[data-addon-row-action]");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.dataset.action).toBe("addonRowAction");
    const cell = remove.parent!.children;
    expect(cell.indexOf(buttons[0]!) + 1).toBe(cell.indexOf(remove));
  });

  it("runs only for an owner, on an item it applies to", async () => {
    const api = await load();
    const run = vi.fn();
    api.registerRowAction({ module: "test-addon", key: "load", itemTypes: ["equipment"], label: "Load", run });
    await api.runRowAction(actor(false), "s1", "test-addon.load");
    await api.runRowAction(actor(true), "missing", "test-addon.load");
    expect(run).not.toHaveBeenCalled();
    await api.runRowAction(actor(true), "s1", "test-addon.load");
    expect(run).toHaveBeenCalledWith(sword, expect.objectContaining({ isOwner: true }));
  });
});

describe("chat cards", () => {
  const owner = { id: "p1", isGM: false };
  const stranger = { id: "p2", isGM: false };
  const gm = { id: "gm", isGM: true };
  const hero = { uuid: "Actor.hero", testUserPermission: (user: { id: string }) => user.id === "p1" };

  it("lets the actor's owner or the GM press an owner button, and only the GM a GM button", async () => {
    const api = await load();
    expect(api.mayPress("owner", owner, {}, hero)).toBe(true);
    expect(api.mayPress("owner", stranger, {}, hero)).toBe(false);
    expect(api.mayPress("owner", gm, {}, hero)).toBe(true);
    expect(api.mayPress("gm", owner, {}, hero)).toBe(false);
    expect(api.mayPress("gm", gm, {}, null)).toBe(true);
    // A card with no actor belongs to whoever posted it.
    expect(api.mayPress("owner", stranger, { author: { id: "p2" } }, null)).toBe(true);
    expect(api.mayPress("owner", owner, { author: { id: "p2" } }, null)).toBe(false);
  });

  it("wires the buttons a viewer may press, and removes the rest", async () => {
    const api = await load();
    const resist = vi.fn();
    const overrule = vi.fn();
    api.registerChatCard({
      module: "test-addon", key: "curse", template: "curse.hbs",
      actions: { resist, overrule: { permission: "gm", run: overrule } },
    });
    globals.fromUuid = async () => hero;
    globals.game = { user: owner };
    const message = { getFlag: () => ({ card: "test-addon.curse", data: { power: 3 }, actorUuid: "Actor.hero" }) };
    const fake = el({}, el({ addonCardAction: "resist" }), el({ addonCardAction: "overrule" }), el({ addonCardAction: "unknown" }));
    await api.addAddonCardControls(message, fake as unknown as HTMLElement);
    const left = fake.children.map((b) => b.dataset.addonCardAction);
    expect(left).toEqual(["resist"]);
    fake.children[0]!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(resist).toHaveBeenCalledWith(expect.objectContaining({ data: { power: 3 }, actor: hero, user: owner }));
    expect(overrule).not.toHaveBeenCalled();
  });

  it("leaves a card whose module isn't running without buttons", async () => {
    const api = await load();
    globals.fromUuid = async () => null;
    globals.game = { user: gm };
    const text = el();
    const fake = el({}, text, el({ addonCardAction: "resist" }));
    await api.addAddonCardControls({ getFlag: () => ({ card: "gone.curse", data: {}, actorUuid: null }) }, fake as unknown as HTMLElement);
    expect(fake.children).toEqual([text]);
  });

  it("refuses an action with an unknown permission", async () => {
    const api = await load();
    expect(api.registerChatCard({ module: "test-addon", key: "bad", template: "x.hbs", actions: { go: { permission: "anyone" as never, run: () => {} } } })).toBeNull();
  });
});

describe("GM tools", () => {
  const gm = { id: "gm", isGM: true };

  it("adds a button to the token controls that only the GM sees", async () => {
    const api = await load();
    const open = vi.fn();
    expect(api.registerGmTool({ module: "test-addon", key: "tracker", label: "Tracker", open })).toBe("test-addon.tracker");
    const controls = { tokens: { tools: { select: { name: "select" } } } } as Record<string, any>;
    globals.game = { user: gm };
    api.addGmTools(controls, gm);
    const tool = controls.tokens.tools["gworld-test-addon.tracker"];
    expect(tool).toMatchObject({ title: "Tracker", button: true, visible: true, order: 2 });
    tool.onChange();
    expect(open).toHaveBeenCalledTimes(1);

    const playerControls = { tokens: { tools: {} } } as Record<string, any>;
    api.addGmTools(playerControls, { id: "p1", isGM: false });
    expect(playerControls.tokens.tools["gworld-test-addon.tracker"].visible).toBe(false);
  });
});
