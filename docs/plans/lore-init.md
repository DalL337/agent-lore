# Plan: `lore init`

*Written 2026-10-18 from the owner's rulings in the planning session; each
ruling below is settled. Status: planned, not started.*

## Goal

`npx @dall337/lore init`, run in any git repository, sets LORE up, starts the
HUD, and hands off to the owner's agent to fill the board, leaving
`git status` clean. One command, private by default, fully reversible
(`lore uninstall`).

## Rulings

| # | Ruling |
|---|---|
| D1 | LORE's entry document lives at **`lore/LORE.md`**, the one editable copy in every repository. Claude imports it (`@lore/LORE.md`); Codex reads a generated copy. The policies' references to "AGENTS.md" become "LORE.md". |
| D2 | **Worktrees:** a local git `post-checkout` hook (in `.git/hooks`, never committed) links LORE's files into each new worktree, and chains to an existing hook manager (husky, `core.hooksPath`) rather than replacing it. |
| D3 | `suite/` ships in its **installed shape**: `suite/lore/LORE.md`, `suite/lore/policies/…`, `suite/lore/scripts/…`, `suite/lore/memory/INDEX.md`. `init` copies it file for file. |
| D4 | `init` and `update` touch only files they generated (marked as generated) and the runtime, never the owner's adapted policies. **`lore uninstall`** removes exactly what `init` added. |
| Privacy | **Private by default, no prompt.** Ignore rules go in `.git/info/exclude`. Journals are never committed in any mode (research policy). Teams that want to share policies through the repository use `lore init --commit`, which puts the rules in `.gitignore` for the private parts and leaves `lore/` trackable. |
| HUD | **Auto-starts** from the agents' session-start hook, in the background and without opening a browser tab; the brief shows its address. The tab opens once at the end of `init` and whenever the owner runs `lore hud`. `config.json` `"autostart": false` turns it off. |
| Agents | `init` **detects** the installed agents (Claude Code, Codex), wires every one it finds, and **asks which is the default**: the one launched for the hand-off and named in the brief. None found → skip, and say `lore connect claude` / `lore connect codex` adds one later. |
| Memory | **Claude's memory is seeded during the hand-off, not by `init`.** Claude knows its own memory folder (`init` would have to guess it from the path, and drive-letter case alone produces two folders). The bootstrap prompt's first step: if Claude has no memory for this repository, run `lore memory seed <its memory folder>` (the hub of policy areas, policies/memory.md §0); if memory already exists, report what is there and ask the owner before converting it. Codex's generated memories are left alone. |
| Runtime | (2026-10-17) A per-repository copy in `.lore/runtime/` by default; launchers and hooks resolve local copy → global `lore` → `npx @dall337/lore@<pinned>`; `"runtime"` in `config.json` overrides. |

> **Addendum (2026-10-18, D2 superseded at the owner's choice):** worktrees
> get no links. On Git for Windows 2.49 a plain `git worktree remove`
> (with or without `--force`) followed a directory junction and deleted
> the main checkout's `lore/`; `git clean`, `rmdir /s`, `rm -rf` and
> PowerShell's `Remove-Item` did not, and true symlinks need Developer
> Mode. So each worktree gets generated files that point at the main
> checkout: `lore/LORE.md` as a copy whose `lore/`, `.lore/` and
> `.research/` paths are absolute to it, its own instruction files from
> that copy and its branch, and hooks running the main checkout's
> launcher (Claude's settings also grant those three folders as
> additional directories). Claude Code did not load an absolute `@` import
> from outside the project, hence the copy. The `post-checkout` hook stays
> as D2 describes, joining an owner's shell hook as a marked block; with
> `core.hooksPath` (husky), hooks are per worktree or shared with other
> repositories, so LORE leaves them alone and a session in the main
> checkout, `lore sync` or `lore worktree` sets new worktrees up instead.

## What the owner sees

```
$ npx @dall337/lore init
LORE 0.2.0 · repo: acme-notes (git, main checkout)
Found: Claude Code ✓  Codex ✓  gh ✓ (logged in)  Node 24 ✓
Your AGENTS.md is committed → LORE goes alongside it; nothing committed changes.

  ✓ lore/          policies, scripts, memory template   (private)
  ✓ .lore/         board, settings, HUD runtime          (private)
  ✓ Claude Code    CLAUDE.local.md · session-start brief + HUD autostart
  ✓ Codex          AGENTS.override.md · session-start brief (trust it once in /hooks)
  ✓ worktrees      new worktrees get LORE automatically
? Default agent: (Claude Code) / Codex

  HUD → http://127.0.0.1:5486  (opened)
? Open Claude Code now to fill the board with you? (Y/n)
```

`--yes` takes every default (agents and scripts can run it); `--dry-run`
lists every file it would touch and writes nothing.

## Behavior by repository state

| State | `init` does |
|---|---|
| No `AGENTS.md`, no `CLAUDE.md` | Generates root `AGENTS.md` (Codex) and `CLAUDE.md` (`@lore/LORE.md`), both private. |
| `AGENTS.md` committed | Never touched. Generates `AGENTS.override.md` = the project's `AGENTS.md` + LORE's section (Codex); a marked block in `CLAUDE.local.md` (Claude). |
| `CLAUDE.md` committed | Never touched. A marked block in `CLAUDE.local.md` imports `@lore/LORE.md`. |
| `CLAUDE.local.md`, `.claude/settings.local.json`, `.codex/hooks.json` exist | Adds a marked block or hook entry; leaves everything else as it was. |
| Already initialized | Changes nothing; reports what is current and what `lore update` would refresh. |
| Run in a subfolder | Works at the git root and says so. |
| Not a git repository | Stops; suggests `git init`, or `lore hud --data <dir>` to try the HUD. |
| Codex instruction chain over 30 KiB | Warns (the budget guard), e.g. a large `AGENTS.md` plus LORE in `AGENTS.override.md`. |

Generated files open with a header: generated by LORE, edit `lore/LORE.md`,
regenerate with `lore sync`. `lore check` reports a generated file that has
drifted from its source, and the session hooks regenerate it.

## Files `init` writes (all private by default)

| Path | Purpose |
|---|---|
| `lore/` | LORE.md, policies (with `reserved/`), guard scripts, memory template |
| `.lore/` | `board.json`, `config.json`, `runtime/` (the CLI and the built HUD), `hud`/`hud.cmd` launchers, `hud.json` and `hud.log` while running |
| `AGENTS.md` or `AGENTS.override.md` | Generated, for Codex |
| `CLAUDE.md` or a block in `CLAUDE.local.md` | Claude's import of `@lore/LORE.md` |
| `.claude/settings.local.json` | Claude Code hooks: `SessionStart` runs `lore brief` (stdout becomes context; well under the 10,000-character cap) and autostarts the HUD; `PostToolUse` runs the provider-memory guard |
| `.codex/hooks.json` | Codex `SessionStart` hook running `lore brief`; Codex runs it only after the owner trusts it once in `/hooks` (and again after it changes) |
| `.git/hooks/post-checkout` | The worktree hook (D2, as amended above) |
| `.git/info/exclude` | The ignore rules, in a marked block |

Claude Code adds `settings.local.json` to the global git excludes only when
Claude Code itself creates it, and `CLAUDE.local.md` is never ignored
automatically, so `init` lists both in `.git/info/exclude`.

## Build order

One PR per slice, each tested the way the HUD is.

1. **Installed shape and two checks.** D3's layout; guard and CI paths;
   the LORE.md rename across the suite. Check in practice what the docs
   leave open: (a) whether `@` imports work in `CLAUDE.local.md` (fallback:
   an inlined copy kept current by `lore sync`); (b) that
   `AGENTS.override.md` behaves as documented in a real Codex session.
2. **`init` core.** Preflight (git, Node, root), copying, generating and
   marking the instruction files, ignore rules, idempotence, `--dry-run`,
   `--yes`, `--commit`, `lore sync`, `lore check`. Tests build a scratch
   repository for each row of the behavior table and assert
   **`git status --porcelain` is empty** afterwards, and that a second run
   changes nothing.
3. **Runtime and agent hooks.** `.lore/runtime` and the launchers that
   resolve local → global → npx; the Claude and Codex session hooks;
   HUD autostart; agent detection and the default prompt; `lore connect`;
   `lore memory seed`; filling the provider memory table.
4. **Worktrees, update, uninstall.** The `post-checkout` hook with
   chaining (no links: see the D2 addendum); `lore update` (runtime and generated files only);
   `lore uninstall` (removes exactly what `init` added; tested by init →
   uninstall → the repository is byte-identical to before).
5. **Hand-off and release.** Open the HUD; offer to launch the default
   agent with the bootstrap prompt (seed memory, then policies/board.md
   §3); a manual end-to-end run on a real repository; release 0.2.0 through
   the staged flow (GitHub Release → staged → owner approves on npmjs.com).

## Risks and open checks

- **Codex hook trust.** Codex runs a repository's hooks only after the
  owner trusts each one in `/hooks`, and again whenever it changes. That
  step can't be removed; `init` explains it at the right moment.
- **`CLAUDE.local.md` imports** are unconfirmed in the docs (slice 1 checks).
- **Existing hook managers** must be chained, not replaced (slice 4).
- **Windows links** (resolved 2026-10-18: no links at all; see the D2
  addendum). Planned: directory junctions for `lore/`; files are copied or
  regenerated.
- **Generated-file drift:** `lore check` reports it; the session hooks
  regenerate.

## Sources

- [Codex hooks](https://developers.openai.com/codex/hooks) · [Codex AGENTS.md discovery](https://developers.openai.com/codex/guides/agents-md)
- [Claude Code memory and imports](https://code.claude.com/docs/en/memory.md) · [settings](https://code.claude.com/docs/en/settings.md) · [permissions and trust](https://code.claude.com/docs/en/permissions.md) · [hooks](https://code.claude.com/docs/en/hooks.md) · [worktrees](https://code.claude.com/docs/en/worktrees.md)
- Rulings from earlier sessions: provider memory (PR #2), HUD (PRs #3–#6), publishing (PRs #7–#8).
