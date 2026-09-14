import { afterEach, describe, expect, it, vi } from "vitest";

import { addResistControls, postResistance } from "../spell-resistance.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "fromUuid", "document", "game"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Just enough of an element for the resistance controls. */
class FakeElement {
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  className = "";
  type = "";
  textContent = "";
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  addEventListener() {}
  querySelector(selector: string) { return selector === ".gworld-chat" ? this : null; }
}

/** A character with the scores a resistance roll reads. */
const subject = (uuid: string, ht: number, will: number) => ({
  uuid, name: uuid, isOwner: true,
  system: { derived: { attributes: { HT: ht }, will, magic: { magicResistance: 0 } } },
});

/** What a module's resistance card offers each subject (sargas79/GWorldVTT#268). */
describe("a module's resistance card", () => {
  it("records the attributes to resist with, and offers each subject the best of them", async () => {
    const create = vi.fn(async (data: unknown) => data);
    globals.ChatMessage = { implementation: { create, getSpeaker: () => ({}) } };
    globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
    globals.foundry = { applications: { handlebars: { renderTemplate: async () => "<div></div>" } } };
    const tough = subject("Actor.tough", 14, 9);
    const stubborn = subject("Actor.stubborn", 9, 13);

    await postResistance({ caster: { name: "Caster" }, label: "Hex", casterRoll: 8, casterEffective: 15, subjects: [tough, stubborn], resistWith: ["HT", "Will", "Nonsense"], ruleOf16: false });
    const flag = (create.mock.calls[0]![0] as { flags: { gworld: { resist: Record<string, unknown> } } }).flags.gworld.resist;
    expect(flag).toMatchObject({ spell: "Hex", resistedBy: "HT / Will", resistWith: ["HT", "Will"], ruleOf16: false });

    globals.fromUuid = async (uuid: string) => (uuid === tough.uuid ? tough : stubborn);
    globals.document = { createElement: () => new FakeElement() };
    globals.game = { i18n: { localize: () => "Resist" } };
    const root = new FakeElement();
    await addResistControls({ getFlag: () => flag }, root as unknown as HTMLElement);
    const labels = root.children.map((row) => row.children[1]!.textContent);
    expect(labels).toEqual(["Resist HT / Will 14", "Resist HT / Will 13"]);
  });

  it("resists with Will when no attribute is named", async () => {
    const create = vi.fn(async (data: unknown) => data);
    globals.ChatMessage = { implementation: { create, getSpeaker: () => ({}) } };
    globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
    globals.foundry = { applications: { handlebars: { renderTemplate: async () => "<div></div>" } } };
    await postResistance({ caster: {}, label: "Hex", casterRoll: 8, casterEffective: 15, subjects: [] });
    const flag = (create.mock.calls[0]![0] as { flags: { gworld: { resist: Record<string, unknown> } } }).flags.gworld.resist;
    expect(flag).toMatchObject({ resistedBy: "Will", resistWith: ["Will"] });
    expect(flag).not.toHaveProperty("ruleOf16");
  });
});
