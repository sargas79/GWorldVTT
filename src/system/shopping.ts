/**
 * Shopping (GURPS Basic Set: Characters pp. 25-27, 265-266).
 *
 * A character is written up with gear bought out of their starting wealth:
 * the Gear figure on the sheet is that spending, and it is read against
 * starting wealth rather than against the cash in hand. What is bought
 * afterwards is another thing entirely -- it comes out of the money on the
 * sheet, and the money goes down.
 *
 * So the picker and the inventory each have two buttons and not one. Add
 * puts a thing on the sheet and charges nothing, which is how a character is
 * built; Buy pays for it out of the cash, which is how one shops. The cash
 * is moved by `adjustCash`, so a purchase lands in the chat beside every
 * other movement of money and the table can see where it went.
 */

import { clothingCost, purchase } from "../rules/wealth.js";
import { adjustCash } from "./life.js";
import { effectiveCost } from "./data-extensions.js";
import { planAddition, type PlannedItem } from "./picker-merge.js";

/** The gear types that are paid for in cash rather than bought with points. */
const GEAR_TYPES = new Set(["equipment", "armor", "shield"]);

/** Whether a thing is bought with money at all: gear is, a skill is not. */
export function isGear(type: unknown): boolean {
  return GEAR_TYPES.has(String(type ?? ""));
}

/**
 * What one of these costs this character.
 *
 * Nearly everything is sold at a price. An article of clothing is sold at a
 * share of the wearer's monthly cost of living (Characters p. 266), so what
 * it costs is a fact about who is buying it, and the sheet's own Gear figure
 * prices it the same way.
 */
export function unitPrice(actor: any, source: { system?: Record<string, any> | null } | null): number {
  const share = Number(source?.system?.costOfLivingPercent ?? 0) || 0;
  const status = Number(actor?.system?.derived?.wealth?.status) || 0;
  const price = share > 0 ? clothingCost(share, status) : effectiveCost(source);
  return Math.round((Number(price) || 0) * 100) / 100;
}

/** The money on the sheet. */
function cashOf(actor: any): number {
  return Number(actor?.system?.money) || 0;
}

function S(key: string, data?: Record<string, unknown>): string {
  return data ? game.i18n.format(`GWORLD.Shopping.${key}`, data) : game.i18n.localize(`GWORLD.Shopping.${key}`);
}

/**
 * How many to buy, with what they cost and what that leaves.
 *
 * The total follows the field as it is typed: the question a shopper asks is
 * "how many can I afford", and answering it should not mean buying one to
 * find out. Coming up short is shown rather than forbidden -- a GM may let a
 * character owe for it, and the sheet's cash goes negative just as it does
 * for a month of living they could not pay for.
 */
async function askHowMany(options: { actor: any; name: string; price: number; label: string; initial?: number }): Promise<number | null> {
  const { actor, price } = options;
  const escape = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
  const money = cashOf(actor);
  // A record that comes by the box -- twenty arrows, a week of rations --
  // offers the box, since that is what the list is quoting.
  const initial = Math.max(1, Math.floor(Number(options.initial ?? 1)) || 1);
  const line = (quantity: number) => {
    const sum = purchase({ price, quantity, money });
    return sum.short > 0
      ? `${S("Total", { total: sum.total })} &middot; <span class="gworld-short">${escape(S("Short", { amount: sum.short }))}</span>`
      : `${S("Total", { total: sum.total })} &middot; ${escape(S("CashAfter", { amount: sum.moneyAfter }))}`;
  };

  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title: S("Title", { name: options.name }) },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="ihint">${escape(S("Each", { price }))} &middot; ${escape(S("CashNow", { amount: money }))}</p>
      <label style="display:flex;align-items:center;gap:8px">
        <span>${escape(S("HowMany"))}</span>
        <input type="number" name="quantity" value="${initial}" min="1" step="1" autofocus style="width:90px">
      </label>
      <p class="ihint" data-shopping-total>${line(initial)}</p>
    </div>`,
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      const total = root.querySelector<HTMLElement>("[data-shopping-total]");
      const field = root.querySelector<HTMLInputElement>('input[name="quantity"]');
      if (!total || !field) return;
      field.addEventListener("input", () => {
        total.innerHTML = line(Math.max(0, Math.floor(Number(field.value) || 0)));
      });
    },
    ok: {
      label: options.label,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return { quantity: Number(form?.querySelector<HTMLInputElement>('input[name="quantity"]')?.value) || 0 };
      },
    },
    rejectClose: false,
  });
  if (!asked || typeof asked !== "object") return null;
  const quantity = Math.max(0, Math.floor(Number((asked as { quantity: number }).quantity) || 0));
  return quantity > 0 ? quantity : null;
}

/**
 * Takes the price out of the cash and says so in the chat.
 *
 * Something given away costs nothing and moves no money, so it leaves no
 * line: there is nothing to account for.
 */
export async function payFor(actor: any, total: number, note: string): Promise<void> {
  if (total <= 0) return;
  await adjustCash({ actor, amount: -total, note });
}

/** The chat line a purchase leaves: "3 × Rope, 3/8"". */
export function purchaseNote(quantity: number, name: string): string {
  return S("Note", { quantity, name });
}

/**
 * Buys a thing the character does not have yet, from a compendium entry or
 * from any item data.
 *
 * What is bought is added the way the picker adds it -- a second rope joins
 * the rope already carried, a second suit of armour is its own suit -- and
 * then paid for. Returns what the purchase came to, or null if it was called
 * off.
 */
export async function buyGear(options: {
  actor: any;
  data: Record<string, any>;
  /** How many, or unasked for the dialog to ask. */
  quantity?: number;
}): Promise<number | null> {
  const { actor, data } = options;
  if (!actor?.isOwner || !data) return null;
  if (!isGear(data.type)) return null;

  const name = String(data.name ?? "");
  const price = unitPrice(actor, data);
  const quantity =
    options.quantity ??
    (await askHowMany({ actor, name, price, label: S("Buy"), initial: Number(data.system?.quantity ?? 1) }));
  if (quantity === null || quantity <= 0) return null;

  const sum = purchase({ price, quantity, money: cashOf(actor) });
  const existing: PlannedItem[] = [...(actor.items ?? [])].map((item: any) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    system: item.system,
  }));
  // The whole record goes in as the source, not a copy of its name and
  // statistics: what is created keeps the entry's picture, description and
  // everything else the compendium holds.
  const plan = planAddition({
    source: data as PlannedItem,
    existing,
    chosen: { quantity: sum.quantity },
  });

  if (plan.action === "update") await actor.items.get(plan.itemId)?.update(plan.changes);
  else await actor.createEmbeddedDocuments("Item", [plan.data]);

  await payFor(actor, sum.total, purchaseNote(sum.quantity, name));
  ui.notifications?.info(S("Bought", { quantity: sum.quantity, name, total: sum.total }));
  if (sum.short > 0) ui.notifications?.warn(S("Short", { amount: sum.short }));
  return sum.total;
}

/**
 * Buys more of something already on the sheet.
 *
 * The quantity of that very item goes up, whatever kind it is: pressing Buy
 * on a suit of armour is asking for more of that suit, which is not the same
 * question as adding a second one from the list.
 */
export async function buyMore(actor: any, item: any, quantity?: number): Promise<number | null> {
  if (!actor?.isOwner || !item) return null;
  if (!isGear(item.type)) return null;

  const name = String(item.name ?? "");
  const price = unitPrice(actor, item);
  const asked = quantity ?? (await askHowMany({ actor, name, price, label: S("BuyMore") }));
  if (asked === null || asked <= 0) return null;

  const sum = purchase({ price, quantity: asked, money: cashOf(actor) });
  const held = Math.max(0, Math.floor(Number(item.system?.quantity ?? 1)) || 0);
  await item.update({ "system.quantity": held + sum.quantity });

  await payFor(actor, sum.total, purchaseNote(sum.quantity, name));
  ui.notifications?.info(S("Bought", { quantity: sum.quantity, name, total: sum.total }));
  if (sum.short > 0) ui.notifications?.warn(S("Short", { amount: sum.short }));
  return sum.total;
}
