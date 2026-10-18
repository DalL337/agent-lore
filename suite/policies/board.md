# Board Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load when the LORE
board is this repository's work-status record (AGENTS.md §5, memory
configuration) and the task starts, moves, or finishes a unit of work;
and when the board is empty or missing and the owner wants it filled.

*(Added 2026-10-17, owner-directed: the board generalizes a project
kanban into LORE. Its first rule is that project's standing owner rule,
"keep the board current".)*

## 1. What the Board Is

The board (`.lore/board.json`, shown by `lore hud`) holds one card per
unit of work, in a column that says where the work stands. It is private
by default: `.lore/` stays out of git unless the owner opts in.

- **It is a status record, not a coordination substrate.** Claims stay at
  the configured coordination location (`policies/orchestration.md` §0).
  A card may link the node or record that holds the claim.
- **It points; it does not explain.** Detail lives in journals, docs,
  decision records, and PRs. A card's notes are a line or two.
- **When the board is the status record, memory nodes link cards** rather
  than keeping a second status ledger for the same work.
- **Cards never point into a harness's private memory.** Provider memory
  may point at card ids (`policies/memory.md` §0); anything another agent
  needs goes on the card, in a journal, or in a doc.

## 2. Keep It Current

When work moves, update the board in the same session:

| The work… | The card… |
|---|---|
| starts | exists in the active column, linked to its journal |
| opens a PR | links the PR |
| waits on the owner (review, ruling, merge, live pass) | moves to the review column |
| waits on something outside the repository | moves to blocked, with a one-line note |
| merges or ships | moves to done, with its PRs linked |

With the HUD running, use its API so the open page updates at once:
`POST /api/board/card` with `{ "card": { … } }` creates or updates,
`POST /api/board/move` with `{ "id", "column", "index" }` moves. Without
it, edit the file and keep it valid JSON; the HUD never overwrites a file
it cannot parse. A session that cannot write the board (a read-only
review, a worktree without `.lore/`) reports the implied changes instead.

## 3. Bootstrap an Empty Board

When the board is empty or missing and the owner asks to fill it:

1. **Journal first** (`policies/research.md`): the survey is an
   investigation.
2. **Read the repository:** README, docs and decision records, open PRs
   and issues (`gh`), recent history and branches, TODO and FIXME
   markers, existing journals.
3. **Propose areas:** the repository's broad categories, the same first
   ring as the memory web. Each is a short key and a one-line
   description.
4. **Propose cards:** units of work with their evidence links, each in a
   column. Open PRs, open issues, and active journals already appear in
   the HUD's Inbox; make those cards from the Inbox rather than by hand.
5. **Write only what the owner approves**, then link the journal from the
   cards it produced.

## 4. The Board File

```jsonc
{
  "version": 1,
  "columns": [
    // role tells the HUD what a column means: intake (issues land here),
    // active (journals), review (PRs, owner's attention), blocked, done.
    // Each role is on at most one column; a column may have none.
    { "id": "doing", "title": "In progress", "led": "pulse", "hint": "Active now", "role": "active" }
  ],
  "areas": { "api": "Public API: endpoints, SDK, versioning" },
  "cards": [
    {
      "id": "rate-limits",                 // unique; a readable slug
      "title": "Rate limits on the public API",
      "column": "next",                    // a column id
      "area": ["api"],                     // area keys
      "notes": "One or two lines.",
      "links": {
        "journals": ["2026-10-06-rate-limits.md"],  // in the journals folder
        "prs": [108], "issues": [12],
        "docs": ["docs/adrs/004-rate-limits.md"]    // repo-relative
      },
      "created": "2026-10-06", "updated": "2026-10-11"
    }
  ]
}
```

- Card order within a column is the order of the `cards` array.
- Moving work: change `column` and bump `updated`.
- In an update, a field left out keeps its value; `null` clears it.
- LEDs: `empty` · `blue` · `pulse` · `amber` · `red` · `green`.
- The HUD rejects duplicate ids, unknown columns, a role on two columns,
  and cards without an id or title.
- `journals` (owner close marks) and `inboxDismissed` belong to the HUD;
  leave them to it.
