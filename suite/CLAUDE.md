@AGENTS.md

# CLAUDE.md

This repository's agent governance lives in **[AGENTS.md](AGENTS.md)**,
imported above.

Read it first, in full, before any other action. It carries the authority
order, the two maps (greenfield vs steady state), and the policy dispatch
table that says which of `policies/*` to load for the task at hand.

This file exists only as a pointer for harnesses that look for
`CLAUDE.md` by convention. `AGENTS.md` is the entry point of record; if
the two ever disagree, `AGENTS.md` wins and this file is what gets fixed.

> **Correction (2026-10-17):** Added the import line. Claude Code reads
> `AGENTS.md` on its own only when no `CLAUDE.md` is present, so a
> prose-only pointer here left loading `AGENTS.md` to the agent's
> discretion. The import loads it at session start.
