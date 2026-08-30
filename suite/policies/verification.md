# Verification Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load when preparing
any PR, completing a milestone or slice, or changing an API or
architecture boundary.

## Rule 1 — The Standard Check Suite

*(Adopt-time slot.)* The project enumerates its actual check commands
here — this list, not an agent's recollection of it, is what "run the
checks" means. The suite should cover, where the stack supports each:

- **Structural enforcement** — architecture/boundary guards, import
  rules, contract checks, whatever enforcement code exists.
- **The full test suite** — and this policy names where the tests live,
  so "all tests pass" is a verifiable claim, not a vibe.
- **A production build** — dev servers hide build-only failures.
- **Zero-warning compilation** where the toolchain distinguishes
  warnings — warnings are the floor (`policies/implementation.md`
  Rule 5).

```
# Fill in on adoption, e.g.:
# node scripts/memory-lint.mjs   — memory web form (ships with the suite)
# npm run check        — guards + build
# npm run test         — full suite
# cargo build && cargo test   — zero warnings required
```

## Rule 2 — When to Run

Run the suite whenever any of the following is true: a milestone or
refactor slice is completed; a new module/domain is added; any change
affects an existing API, command, selector, or behavior; any
architecture boundary or import rule changes; any PR is being prepared.

Record pass/fail evidence in the related plan or checklist doc when one
exists.

## Rule 3 — Verify the Commit, Not Just the Tree

After committing, read the commit summary and check the files-changed
count against intent **before pushing**. Two silent failure modes this
catches in seconds:

- A pathspec commit (`git commit -m "..." <path>`) commits ONLY that
  pathspec and silently drops the rest of the staged index.
- A commit made on the wrong branch lands there silently.

Read the summary line; run `git status`; every time.

## Rule 4 — Verification Is Evidence, Not Ceremony

A check that was run but whose output wasn't read verifies nothing. When
a check fails, the failure is investigated under
`policies/research.md` discipline if nontrivial — never rerun-until-
green, never skipped with intent to fix later unless the owner has
explicitly accepted that debt, dated, in the relevant plan.
