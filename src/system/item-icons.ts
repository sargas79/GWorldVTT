/**
 * The picture an item gets when nobody has chosen one for it.
 *
 * The table itself lives in `tools/item-icons.mjs`, because the pictures are
 * decided in two places and only one of them is TypeScript: a character's own
 * items are resolved here at run time, and the compendium's are stamped into
 * the packs when they are built. The sidebar reads a pack's index, which
 * carries whatever was stored and never runs a document class, so an entry
 * that leaves its picture to be worked out later is an entry that shows a bag
 * in the compendium however well the run-time half behaves.
 *
 * An image somebody chose always wins. Only the bag -- or nothing at all -- is
 * treated as "no choice made", so a GM's own art comes through untouched.
 */

export {
  GENERIC_ITEM_ICON,
  defaultItemIcon,
  isGenericIcon,
  itemIcon,
} from "../../tools/item-icons.mjs";
