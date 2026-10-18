# LORE HUD

A local, private page for one repository's work: the **board** (one card
per unit of work), the **journals** agents keep under the research policy,
and an **Inbox** of live work no card tracks yet. Agents keep the board
current as work moves (`policies/board.md`); the page follows their edits
live.

```
lore hud [--repo <path>] [--port <n>] [--no-open]
```

It serves `http://127.0.0.1:5199` (the next free port if that one is
taken) and opens the browser. `lore brief` prints the same board as a few
lines for an agent's session start.

## What it reads and writes

| | Where | Notes |
|---|---|---|
| Board | `<repo>/.lore/board.json` | Created on first run. Private: keep `/.lore/` out of git (`.git/info/exclude`). |
| Settings | `<repo>/.lore/config.json` | Optional: `{ "journals": ".research", "policies": "lore/policies" }` |
| Journals | `<repo>/.research/*.md` | Read only; the HUD never edits a journal. |
| Policies | `lore/policies/`, else `policies/` | Names for the journal policy tags. |
| GitHub | `gh` CLI, if installed and logged in | Open PRs and issues, recent merges, the latest release. Optional. |

## On the page

- **Board.** The page is the board. Six columns by default. A column's
  `role` (intake, active, review, blocked, done) tells the HUD where Inbox
  items land, which columns stack, and which counts the header shows.
  Drag cards, or Alt+arrow keys on a focused card. Click an area chip to
  dim everything outside that area; Esc clears it.
- **Stacked columns.** Intake and done columns start stacked: each card is
  a one-line strip (areas and title) that opens in place on hover or
  keyboard focus. The three-bar button in any column header stacks it or
  deals it out; the choice is remembered per browser and repository.
  Dealt-out cards keep their notes to two lines and show three link chips
  plus a "+N" that names the rest.
- **Drawer.** *Journals* and *GitHub* in the top bar open their panel in a
  drawer below the bar (clicking again closes it); the journal and PR
  counts beside them open the same panels, Journals on the matching tab.
  A journal or card opened from a panel stacks on top of it, with a back
  step (Esc). The drawer pushes the board aside or overlays it, chosen in
  its header and remembered per browser; narrow windows always overlay.
  `?panel=journals&jf=stale` reopens a panel after a refresh.
- **Inbox.** Open PRs, active journals, and open issues that no card
  links to. A journal on the board covers the PRs it opened (those opened
  from the day before it started to three weeks after). *Make card*
  creates the card in the column for its kind; *Dismiss* hides an item
  for good (restorable).
- **Journals.** Status comes from the sections the research policy
  requires: *concluded* (Final Conclusions, a `Status: complete` line, or
  Next Actions that say the work is over), *open* (touched in the last 7
  days), *stale*, or *closed* by the owner. A journal written after it
  was closed reopens by itself. Policy tags: solid for the journal's
  `Policies:` line, dotted for policies it only mentions; click one to
  filter the list.
- **GitHub.** Open PRs and issues, recent merges. Without `gh` or a
  GitHub remote, the panel says why and everything else works.

## API

JSON over loopback; POST bodies must be `application/json`.

| Route | Does |
|---|---|
| `GET /api/meta` | repository name, journals folder, board file, policies |
| `GET /api/board` | the board |
| `POST /api/board/card` `{ card }` | create, or merge-update by `id` (`null` clears a field) |
| `POST /api/board/move` `{ id, column, index }` | move a card |
| `POST /api/board/delete` `{ id }` | delete a card |
| `POST /api/board/journal` `{ file, state: "closed" \| null }` | close or reopen a journal |
| `POST /api/board/inbox` `{ key, dismissed }` | dismiss or restore an Inbox item (`*` restores all) |
| `GET /api/journals`, `GET /api/journal?file=` | journal summaries; one journal's text |
| `GET /api/repo` | GitHub and git state (`?force` skips the one-minute cache) |
| `GET /api/events` | Server-Sent Events: `board`, `journals` when files change on disk |

Every board change re-reads the file first and writes atomically, so an
agent's edit made in between is never lost. A board file that is not
valid JSON is reported and left untouched.

## Security

The server binds to 127.0.0.1 and answers only requests addressed to
loopback by name or address, which stops DNS-rebinding pages. It refuses
cross-origin requests and non-JSON POSTs, reads journals only from the
journals folder, and serves the page only from its own build.

## Development

```
npm install
npm run typecheck     # TypeScript, no emit
npm test              # unit and API tests (Node runs the TypeScript directly)
npm run build         # page → hud/dist/client, server → hud/dist/server
npm run test:e2e      # build, then drive the page in headless Chrome
npm run demo          # build, then open the HUD on a throwaway copy of the demo repo
```

`hud/fixtures/demo` is a small made-up repository (a board, five
journals, policy stubs) used by the tests and the demo. The HUD resolves
`--repo` to its git top level, so the fixture only acts as its own
repository from a copy outside this checkout; the tests, the e2e run, and
`npm run demo` all copy it to the temp folder.

The page is plain TypeScript and DOM (no framework), bundled by Vite with
JetBrains Mono (SIL Open Font License, shipped in
`dist/client/licenses/`). The server uses Node built-ins only, so a built
HUD needs nothing from `node_modules` at run time.
