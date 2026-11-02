# Innovate Policy

Scoped agent-governance procedure (LORE.md §1/§2). Load when suggesting
an innovation, demonstrating or deciding one, and when the owner wants a
creative direction (`lore/policies/creative.md`) made real. These are
starting principles; this project's own lessons accumulate here with
their provenance.

*(Added 2026-11-02, owner-directed: innovations are grounded in the
owner's feedback, judged through a demo the owner can use, and recorded
privately; an approved innovation gets its own brief and ADR.)*

An innovation is a change nobody requested yet — a new capability,
interaction, or approach — proposed for adoption. Creative mode explores
without evaluating; this policy takes one idea to the owner's decision.
Requested features and bug fixes don't pass through here; their own
policies govern them directly.

## 1. Ground It in the Owner's Feedback

Innovations answer what the owner has reacted to. Look for evidence in:

- **the UI/UX feedback log** (`.lore/ui-feedback.md`,
  `lore/policies/ui-ux.md`) — friction that recurs across entries is the
  strongest signal;
- **the owner's comments** in sessions, PR reviews, and journals;
- **board cards** that keep returning to review or sit blocked;
- **earlier innovation records** (`.lore/innovation/`) — a rejected idea
  stays rejected until the evidence behind its rejection changes. Say
  what changed.

Every suggestion cites its evidence. An idea with no owner feedback
behind it may still be suggested, labeled as the agent's own.

## 2. Suggest Without Derailing

Agents may suggest innovations unprompted. A suggestion:

- **waits for a natural break** — the end-of-task report, or a moment
  when the owner is choosing what comes next. It never interrupts the
  task in progress.
- **never expands the current task**, its branch, or its PR, and is
  never built without the owner's go-ahead.
- **is short** — what it is, the evidence behind it (§1), and what a
  demo would let the owner try.

Start the innovation's record (§7) when making the suggestion. If the
owner doesn't take it up in that session, it becomes a card in the
board's intake column (`lore/policies/board.md`), linking the record, so
it is neither lost nor suggested twice. "Not now" parks a suggestion; it
is not a rejection.

## 3. Consult the Connecting Policies

Before building a demo, read the proposal against the dispatch table
(LORE.md §2.2) as if it were a task: which rows would building it match?
Load those policies and let them shape the proposal before the owner
sees it — a new dependency brings in `lore/policies/tooling.md` and
`lore/policies/security.md`; an interface change brings in
`lore/policies/ui-ux.md`; a new guarantee about state brings in
`lore/policies/adversarial-check.md`.

Record in the innovation record which policies were consulted and what
each one changed. The demo itself is code: `lore/policies/implementation.md`
and `lore/policies/git.md` apply to building it.

## 4. Demonstrate It on Localhost

The owner judges an innovation by using it. When the owner asks to see
a suggestion, build the smallest demo that lets them try what matters,
and hand over a localhost URL with what to try.

- **Build it in its own worktree and branch** (`lore/policies/git.md`
  §1), so a rejected idea leaves the main checkout untouched.
- **Bind to loopback only** (`127.0.0.1`), never all interfaces: a demo
  server is a new network surface (`lore/policies/security.md` Rule 1).
  Choose a port that doesn't collide with the HUD or the project's own
  dev server. Tell the owner the URL and how to stop the server.
- **Use stand-in data** realistic enough to show the idea — never real
  secrets or personal data.
- **Stop the server** when the evaluation ends.

When the idea has nothing to interact with — a process or rule change —
describe it concretely with a worked example instead, and say why there
is no demo.

## 5. Iterate With the Owner

The owner's reactions while using the demo are the evaluation. Record
them in the innovation record as they come: the date, what was tried,
the reaction, and the change made. Reactions to an interface also go in
the UI/UX feedback log (`lore/policies/ui-ux.md` Rule 4). Iterate on the
demo's branch until the owner decides.

## 6. Decide

Only the owner approves or rejects an innovation.

- **Approved** — the record becomes the innovation's brief: complete it
  with the design, the evidence, what the demo showed, and open
  questions (`lore/policies/documentation.md` Rule 1). Write its ADR in
  the house format, status `Accepted`, standing on its own because the
  brief is internal (`lore/policies/documentation.md` Rule 2 addendum).
  Add a board card for the build. The build is ordinary work under its
  own policies; agree with the owner whether it starts from the demo
  branch or fresh.
- **Rejected** — add the owner's reason to the record's status ledger,
  dated, in the owner's words. Stop the demo and remove its worktree;
  keep the record.
- **Parked** — the record's status says so, and its card stays in the
  intake column.

## 7. The Innovation Record

One file per innovation, from suggestion to decision:
`.lore/innovation/<date>-<topic>.md`. It is internal: `.lore/` stays out
of git. When the owner sanctions a record public, move it to
`docs/plans/` as a brief (`lore/policies/documentation.md` Rule 1) and
note the move, dated, in the ADR if one exists.

The status ledger keeps every state with its date, newest first, the
original suggestion at the bottom:

```markdown
# Innovation: <title>

## Status
- 2026-11-05 — Approved by the owner after the demo → ADR-007
- 2026-11-03 — Demonstrated at http://127.0.0.1:5180 (branch innovate/<topic>)
- 2026-11-02 — Suggested by the agent in an end-of-task report

## Evidence
## Policies Consulted
## Demo and Feedback
## Brief
(Written on approval.)
```
