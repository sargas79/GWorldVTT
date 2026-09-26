/**
 * Shows a character's trait, skill or gear to the table: a card in the chat
 * with its figures, and its description folded underneath for anyone who
 * clicks it open. Everybody can read the card, whether or not they can see
 * the character sheet it came from.
 */

import { SYSTEM_ID } from "./constants.js";
import { itemCardData } from "./item-card-facts.js";

const ITEM_CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/item-card.hbs`;

/** Posts an item's card to the chat, spoken by the actor that has it. */
export async function postItemCard(item: any): Promise<void> {
  if (!item) return;
  const L = (key: string) => (key ? game.i18n.localize(key) : "");
  const data = itemCardData(item);
  const actor = item.parent?.documentName === "Actor" ? item.parent : null;
  const text = String(item.system?.description ?? "");
  // Enriched here, with the item to resolve its relative links, and with its
  // secrets left out: the card is for everyone.
  const description = text.trim()
    ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(text, { relativeTo: item, secrets: false })
    : "";

  const content = await foundry.applications.handlebars.renderTemplate(ITEM_CARD_TEMPLATE, {
    name: data.name,
    img: String(item.img ?? ""),
    kinds: data.kinds.map(L).join(" · "),
    facts: data.facts.map((fact) => ({ label: L(fact.label), value: fact.value })),
    description,
    reference: String(item.system?.reference ?? ""),
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker(actor ? { actor } : {}),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });
}
