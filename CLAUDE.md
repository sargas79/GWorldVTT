## What belongs in the system

The system implements the GURPS Basic Set (and GURPS Lite, drawn from it), generic capabilities any book's data can use, and the add-on API (`game.gworld.api`). Every other book's rules, records and prose belong in an add-on module that registers them through the API.

- Never cite another book's pages, or name an add-on module, in `src`, `templates`, `lang` or `packs-src`. `npm run lint` runs `tools/check-book-neutral.mjs`, which fails on both.
- Its exception list covers only code due to leave the system, each entry with the open issue that removes it. Remove an entry when that code goes; the check fails on a stale one.
- A rule a module needs and can't reach is a book-neutral issue for the API, never a book's rule built into the system.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. Use it where it costs fewer tokens than searching, not first for every question.

Running it: Windows Smart App Control blocks `graphify.exe` on this machine. From the Bash tool, run `/c/Users/diego/.graphify-venv/Scripts/python.exe -m graphify <args>` exactly, with `PYTHONHASHSEED=0 ` in front for `update`. The user's permission rule allows only that form. Below, `graphify` means that command.

Pick the cheapest lookup:
- A known name or exact string (a function, a lang key, a setting): Grep for it directly, with `files_with_matches` or a `head_limit`. A query costs about 2,000 tokens; a search for a known name costs a few dozen.
- A named symbol or concept and what it connects to: `graphify explain "<name>"`.
- How two things connect: `graphify path "<A>" "<B>"`.
- An open-ended question about an unfamiliar area: `graphify query "<question>"`. Use a few specific terms (symbol and file names, not common words like "bonus" or "defense", which each pull in unrelated nodes). If the result is truncated, narrow the question or switch to `explain` before raising `--budget`.
- Don't look the same thing up twice: once the graph names the file and function, Read those lines rather than searching for them again. Read only the lines you need.
- GRAPH_REPORT.md and graphify-out/wiki/: only for a broad architecture review.
- After changing code, run `graphify update .` once at the end of the task, not after each edit (it is AST-only and costs no tokens).
