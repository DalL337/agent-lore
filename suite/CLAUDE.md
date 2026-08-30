# CLAUDE.md

This repository's agent governance lives in **[AGENTS.md](AGENTS.md)**.

Read it first, in full, before any other action. It carries the authority
order, the two maps (greenfield vs steady state), and the policy dispatch
table that says which of `policies/*` to load for the task at hand.

This file exists only as a pointer for harnesses that look for
`CLAUDE.md` by convention. `AGENTS.md` is the entry point of record; if
the two ever disagree, `AGENTS.md` wins and this file is what gets fixed.
