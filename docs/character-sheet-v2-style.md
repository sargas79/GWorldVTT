# Character sheet V2: headings, panels and layout

The standard every tab of the V2 character sheet follows, and that a new
panel or tab must follow too. The styles are in `src/styles/sheet-v2.css`
(the "Headings" and "Columns side by side end level" blocks), and
`src/system/__tests__/sheet-v2-headings.test.ts` fails on a template that
breaks the heading and panel rules.

## Headings

There are four kinds of heading. Each looks the same on every tab.

| Kind | Markup | Look | Used for |
| --- | --- | --- | --- |
| Panel title | `<h2 class="v2-ph">`, or `<div class="v2-ph v2-ph-tools"><h2>…</h2>…tools…</div>` | 17px heading font, semibold, uppercase, 0.05em tracking, a 1px rule under it across the panel | The first line of every panel: Vitals, Defenses, Attacks, Money, Improvements… |
| Group band | `<summary class="v2-group-head"><span class="v2-group-title">` | The panel title's type on a `--v2-panel-2` band, with a chevron | A foldable group in a list column (DX-based, Advantages, Stored) and the drawers under Combat and the Overview |
| Record title | `<header class="v2-detail-head"><h3>` | 22px heading font, uppercase, white on the steel band | The name of the thing a detail panel shows: a skill, trait, item, improvement or journal entry |
| Sub-heading | `<h3 class="v2-sh">` or `<h4 class="v2-sh">`; `<h4>` in a `.v2-box` | 14px heading font, uppercase, 0.06em tracking, muted | A part inside a panel: Job under Money, a kind under Related, a page in a journal entry, a box's header |

- **A title's figures sit beside it, never in a second heading.** Points, a
  count or a hint go in `<span class="v2-ph-meta">` in a panel title, or
  `<span class="v2-group-sub">` in a group band: 12px body font, sentence
  case, muted.
- **Tools sit at the right of the panel title.** A search box, a filter or
  an Add button goes in the `.v2-ph-tools` row, not under the title.
- **A title is one line.** Keep the words short enough for the narrowest
  column the panel sits in ("Categories", not "Advancement categories").
- **The shared partials follow the standard too.** A partial in
  `templates/actor/parts/` heads its section with `<div class="ish">`. On
  this sheet `.ish` is drawn as a panel title; in a panel of a list column
  (`.v2-group-panel`) it is drawn as a group band; in a drawer it is a
  sub-heading, and a drawer's first `.ish` is hidden because the band
  already names it. A V2 template never writes `.ish` itself: it uses
  `.v2-ph`.
- **The record title is always steel.** Red is kept for a state (a buy that
  overspends), never for the kind of record; a trait's category shows on its
  badge.

## Panels

- **Every panel is the one cream surface** (`.v2-panel`, `--v2-panel`).
  There are no dark panels; the dark frame is the page between panels.
- **A card inside a panel** (an attack, a readied item, a journal entry, a
  related link, a category) is set off by `--v2-panel-2` and a 1px
  `--v2-panel-line` edge.
- **A panel with nothing in it is not drawn.** A panel whose partials all
  render nothing, and a drawer whose rules are all off, disappear rather
  than leave an empty box.

## Layout: no empty space

- **Columns side by side end level.** A multi-column grid stretches its
  columns to the row's height, and the last panel of each column grows to
  take the slack.
- **The column that is usually shorter ends in a list.** The slack then
  becomes room in a list rather than an empty block: the Overview's Active
  skills and Active modifiers, Combat's Combat log, the Journal's entry list,
  page and Related, Progression's Improvements.
- **A list that scrolls fills its column; it does not set the height.** Give
  it `flex: 1 1 0` and a `min-height`, not a `max-height`, so the
  neighbouring panels decide the row's height and the list shows as many
  rows as fit.
- **Never put a fixed block of figures last in a column that is usually the
  shorter.** It would stretch into an empty panel. Move it up, or move a
  list under it.
- **Panels that would sit side by side at very different heights stack
  instead.** Inventory's Readied and Equipped run full width, their cards in
  rows.
- **A detail panel is as tall as its column** (Skills, Traits, Inventory,
  Progression): it is a reading pane, not a card with frame under it.
- **The last panel of a tab may run to the foot of the tab** when growing
  gives room to use, as the Journal's Notes editor does.

Check a layout change with a sparse character (one attack, no conditions,
no spells) and a full one, at the default sheet width and at the 980px and
700px container widths, before calling it done.
