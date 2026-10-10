/**
 * Making the NPC a sketch describes (GURPS Basic Set: Campaigns p. 502), and
 * the ways into the window that draws one.
 *
 * Kept apart from the window itself so the API can offer `create` without
 * loading Foundry's application classes, which exist only in the client. The
 * window registers itself here as the opener when it is loaded.
 */

import { sketchActorSystem, skillItemData, type NpcSketch } from "../rules/quick-npc.js";
import { entryItemFields } from "../rules/templates.js";

const K = "GWORLD.QuickNpc";
const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`${K}.${key}`, data) : game.i18n.localize(`${K}.${key}`);

let opener: (() => Promise<unknown>) | null = null;

/** Lets the window say how it is opened. Called once, when it is loaded. */
export function setQuickNpcOpener(open: () => Promise<unknown>): void {
  opener = open;
}

/** Opens the Quick NPC window, if the client has one. Resolves to it, or null. */
export async function openQuickNpc(): Promise<unknown> {
  if (!opener) return null;
  return opener();
}

/** The item data a sketch's rows become, the shelf's own documents where they came from one. */
async function sketchItems(sketch: NpcSketch): Promise<object[]> {
  const items: object[] = [];
  const fetch = async (uuid: string | undefined): Promise<any> => {
    if (!uuid) return null;
    try {
      const document: any = await fromUuid(uuid);
      if (!document) return null;
      const data = document.toObject();
      delete data._id;
      return data;
    } catch {
      return null;
    }
  };

  for (const skill of sketch.skills) {
    const priced = skillItemData(skill, sketch);
    const data = await fetch(skill.uuid);
    if (data) {
      data.system = { ...data.system, points: priced.system.points };
      items.push(data);
    } else {
      items.push(priced);
    }
  }
  for (const trait of sketch.traits) {
    const data = await fetch(trait.uuid);
    if (data) {
      // The card's points are the trait's total, read against how the
      // compendium entry prices itself, as a template's entries are.
      const cost: Record<string, unknown> = {
        ...entryItemFields(
          { name: trait.name, itemType: "trait", points: trait.points, ...(trait.levels ? { levels: trait.levels } : {}) },
          {
            name: String(data.name ?? ""),
            points: Number(data.system?.points) || 0,
            pointsPerLevel: Number(data.system?.pointsPerLevel) || 0,
            costTable: Array.isArray(data.system?.costTable) ? data.system.costTable : [],
          },
        ),
      };
      delete cost.name;
      data.system = { ...data.system, ...cost };
      items.push(data);
    } else {
      items.push({ name: trait.name, type: "trait", system: { points: trait.points, ...(trait.levels ? { levels: trait.levels } : {}) } });
    }
  }
  for (const gear of sketch.gear) {
    const data = await fetch(gear.uuid);
    if (data) items.push(data);
  }
  return items;
}

/**
 * Makes the NPC actor a sketch describes, and its token on the scene if
 * asked. Also the API's way in. Resolves to the actor, or null for a user who
 * may not create one.
 */
export async function createQuickNpc(
  sketch: NpcSketch,
  options: { folder?: string | null; from?: string[]; placeToken?: boolean } = {},
): Promise<any | null> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(L("GmOnly"));
    return null;
  }
  const system = sketchActorSystem(sketch);
  const from = options.from ?? [];
  const note = from.length ? L("NoteFrom", { templates: from.join(", ") }) : L("Note");
  const details = system.details as Record<string, string>;
  details.notes = sketch.notes ? `<p>${foundry.utils.escapeHTML(sketch.notes)}</p><p>${note}</p>` : `<p>${note}</p>`;
  const items = await sketchItems(sketch);
  const actor = await Actor.implementation.create({
    name: sketch.name.trim(),
    type: "npc",
    ...(options.folder ? { folder: options.folder } : {}),
    system,
    items,
  });
  if (!actor) return null;

  const scene = (globalThis as any).canvas?.scene;
  if (options.placeToken && scene) {
    try {
      const stage = (globalThis as any).canvas.stage;
      const grid = (globalThis as any).canvas.grid;
      const centre = { x: Number(stage?.pivot?.x) || 0, y: Number(stage?.pivot?.y) || 0 };
      const snapped = grid?.getSnappedPoint?.(centre, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX }) ?? centre;
      const token = await actor.getTokenDocument({ x: snapped.x, y: snapped.y });
      await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    } catch (error) {
      console.warn("gworld | the quick NPC's token could not be placed", error);
      ui.notifications?.warn(L("TokenFailed"));
    }
  }
  return actor;
}

/** The button in the Actors sidebar, beside Create Actor, for the GM. */
export function addQuickNpcButton(html: HTMLElement): void {
  if (!game.user?.isGM) return;
  const actions = html.querySelector<HTMLElement>(".directory-header .header-actions");
  if (!actions || actions.querySelector(".gworld-quick-npc-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gworld-quick-npc-open";
  button.innerHTML = `<i class="fa-solid fa-user-clock" inert></i> <span>${foundry.utils.escapeHTML(L("Open"))}</span>`;
  button.setAttribute("data-tooltip", L("OpenHint"));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void openQuickNpc();
  });
  actions.append(button);
}
