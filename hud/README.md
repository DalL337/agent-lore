# LORE HUD

A local, private page for one repository's work: the **board** (one card
per unit of work), the **journals** agents keep under the research policy,
and an **Inbox** of live work no card tracks yet. Agents keep the board
current as work moves (`policies/board.md`); the page follows their edits
live.

```
lore hud          start it in the background and open it (or reopen the one already running)
lore hud status   is it running, and where
lore hud stop     stop it
lore brief        the board in a few lines, for an agent's session start
```

Options: `--repo <path>` (default: the current folder), `--data <dir>`,
`--port <n>`, `--no-open`, and `--foreground` to keep the HUD in the
terminal (Ctrl+C stops it).

- **One per repository.** A running HUD records itself in
  `<data>/hud.json`; `lore hud` reopens it instead of starting a second.
  The record is trusted only when the server at its address confirms its
  process id. The background server logs to `<data>/hud.log`.
- **A stable address.** Each repository gets its own port in 5200–5999,
  derived from where it lives, so its address can be bookmarked. Set
  `"port"` in `config.json` to choose one; `--port` overrides both (exact).
- **The board's title** is `"name"` from `config.json`, else the git
  remote's repository name, else the folder name.
- **Worktrees share one board.** LORE's private files (the board, the
  journals, an untracked `lore/` folder) exist only in the main checkout,
  so the HUD resolves them there from any linked worktree; branch and
  status come from the worktree it was started in.
- **It starts with your agent.** After `lore init`, each Claude Code or
  Codex session starts with a hook that runs `lore session`: it prints the
  brief, starts the HUD in the background if it isn't running (no browser
  tab), and keeps LORE's generated files current. `"autostart": false` in
  `config.json` stops it starting the HUD. `.lore/hud` opens the page
  without `lore` on your PATH.

`--data <dir>` keeps the board and settings in a folder outside the
repository instead of `<repo>/.lore/`. The repository is then only read:
journals, policies, `gh`, and git (with `GIT_OPTIONAL_LOCKS=0`, so not even
the git index is refreshed). It is a way to try the HUD on a repository
without adding anything to it.

## What it reads and writes

| | Where | Notes |
|---|---|---|
| Board | `<repo>/.lore/board.json` in the main checkout (or `<data>/board.json`) | Created on first run. Private: keep `/.lore/` out of git (`.git/info/exclude`). |
| Settings | `<repo>/.lore/config.json` (or `<data>/config.json`) | Optional: `{ "name": "…", "journals": ".research", "policies": "lore/policies", "port": 5231, "autostart": true }`; relative paths resolve against the main checkout. `lore init` adds `"agents"` (the ones it wired), `"agent"` (the default), and `"memory"` (Claude's seeded memory folder); `"runtime"` points the launcher at another LORE checkout. |
| Running instance | `<data>/hud.json`, `<data>/hud.log` | Written by the HUD while it runs; removed by `lore hud stop`. |
| Journals | `<repo>/.research/*.md` | Read only; the HUD never edits a journal. |
| Policies | `lore/policies/`, else `policies/` | Names for the journal policy tags; `research-policy.md` reads as `research`. |
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
