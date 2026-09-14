## What belongs in the system

The system implements the GURPS Basic Set (and GURPS Lite, drawn from it), generic capabilities any book's data can use, and the add-on API (`game.gworld.api`). Every other book's rules, records and prose belong in an add-on module that registers them through the API.

- Never cite another book's pages, or name an add-on module, in `src`, `templates`, `lang` or `packs-src`. `npm run lint` runs `tools/check-book-neutral.mjs`, which fails on both.
- Its exception list covers only code due to leave the system, each entry with the open issue that removes it. Remove an entry when that code goes; the check fails on a stale one.
- A rule a module needs and can't reach is a book-neutral issue for the API, never a book's rule built into the system.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
