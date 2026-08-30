# Memory Usage Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load on first contact
with the repository, whenever no memory web exists, and whenever reading or
writing agent memory. This policy is the entry point to everything agents
collectively know about this repository.

## 1. What Memory Is

The repository is the truth. Memory is the **map** — a shared, persistent,
walkable web of links with a status overlay. An agent (or sub-agent) walks
the web from the hub outward, each hop growing more specific, until it
arrives at the place that says what needs work versus what is done, and
where the details live.

Memory never contains the specifics of a given edit, creation, or feature.
It contains **links** — to repo paths, docs, ADRs, plans, journals,
branches, PRs — and **status**. The moment a node starts explaining *how*
something works instead of pointing at where that's recorded, it has
drifted into being a second copy of the repo, and second copies rot.

## 2. Shape — the Web

```
memory/
  INDEX.md              ← the hub. Every walk starts here.
  agents/
    <agent-id>.md       ← one per primary agent (§3)
  <area>.md             ← first-ring nodes: broad areas of the repo
  <area>/
    <subarea>.md        ← deeper rings: increasingly specific
```

- **The hub** (`memory/INDEX.md`) links every first-ring node, the agent
  registry, and any structural decisions about memory itself (§6). It
  carries no repo detail of its own.
- **Area nodes** cover a broad concern — a domain, a subsystem, a
  long-running arc. Each links deeper nodes, the owning repo paths, and
  the governing docs.
- **Leaf nodes** are the most specific: a feature, a migration, a
  component family. This is where status lives at working granularity.

Each node carries, in order:

1. A one-line scope statement — what this node maps.
2. A **link table** — where the relevant truth lives.
3. A **status ledger** — dated entries (§4).
4. A **claims section** — active and released claims
   (`policies/orchestration.md`).

Node granularity follows need, not symmetry. Rings grow when a node's
ledger gets crowded enough that walkers can't find things — that crowding
is the signal to split, by appending links to new child nodes.

## 3. Identity, Registration, and Who Writes

**Identity is the platform — the harness, not the model.** Claude Code,
Codex, Grok: whatever agent harness is running is the identity. Models
swap inside a harness mid-session; the model in use is session metadata
in the registry entry, never an identity segment, so a model change
cannot orphan live claims.

**Identity is a path, deepened only as uniqueness demands** — the same
granularity principle as the web's rings. A discriminator's only job is
uniqueness among *live* agents:

- One live instance of a platform: the platform name is the whole id —
  `claude-code`.
- Multiple live instances of the same platform: each takes a
  discriminator segment — **by assigned area when the work is
  partitioned** (`claude-code/frontend`, `claude-code/backend`), **by
  session date otherwise** (`claude-code/2026-08-30-a`). Area
  discriminators are self-documenting but can drift if scope moves
  mid-session; if an instance's work leaves its named area, coordinate
  and re-register rather than working under a misleading name.
- **Sub-agents carry the parent id plus their assigned task,** deepening
  area → focus → file only as needed to be unique among live siblings:
  `claude-code/research--frontend`, and only if two research subs share
  an area, `claude-code/research--frontend--auth-forms`. Sub-agent ids
  appear in journal names and the parent's session entry — never as
  registry files.

**One registry file per platform, not per instance:**
`memory/agents/<platform>.md`. Sessions are dated appended entries, each
recording the full id used that session (with any discriminator), the
model in use, claims taken, journal links, and sub-agents spawned with
their ids. The platform file is a longitudinal ledger of everything that
platform has done in this repository — worth more than a directory of
one-session fragments.

**Self-recognition rule.** Agents have no memory across context windows.
At session start, a primary appends its session entry **before its first
claim**; thereafter, a claim is yours only if it carries the exact full
id you registered this session. "That's my platform, so it's probably
mine" is not recognition — a claim signed by your platform under a
different or missing discriminator belongs to a sibling until
coordination proves otherwise.

- **The web itself is shared.** All primary agents append to the same hub
  and nodes. There is no per-agent fork of the map.
- A primary agent entering a repository with no web **bootstraps it** as
  part of orientation: create the hub, register itself, and lay down
  first-ring nodes for the areas it can already name. A sparse honest web
  beats a speculative complete one — rings grow as work reaches them.
- **Sub-agents read the web freely but do not register and do not claim.**
  Their findings route through the parent agent, which appends on their
  behalf under its own identity.

## 4. Append-Only Discipline

**No edits. No deletions. Ever.** The web's history is part of its value —
a future agent reading a node should be able to see not just what is true
but what used to be believed.

- **Deprecation, not removal.** When a link or entry stops being true,
  strike it through and stamp it, then append the replacement **in the
  same slot, immediately adjacent** — never at the bottom of the file:

  ```
  - ~~[Write manager](src/fs/writeManager.js)~~ — deprecated 2026-08-30,
    superseded by split below
  - [Write pipeline](src/fs/pipeline/) — appended 2026-08-30
  ```

  Current truth must be findable where the old truth was. Making devs or
  agents scroll to the bottom to discover the live link is a policy
  violation, not a style choice.

- **Status changes are new ledger lines,** dated, never rewrites of old
  ones:

  ```
  - 2026-08-12 — in-progress — claimed, branch feat/example (agent-a)
  - 2026-08-19 — done — merged PR #41, journal .research/2026-08-12-example.md
  ```

- Status vocabulary: `planned` · `in-progress` · `blocked` · `done` ·
  `deprecated`. Extend it per repo if needed — by an appended dated note
  in the hub, so every walker shares one vocabulary.

**Node retirement — the entropy release valve.** Append-only means struck
content accumulates, and a node whose dead weight drowns its live signal
has stopped being a map. When a walker can no longer find current truth
at a glance:

1. **Spawn a successor node** carrying only the live links and the open
   tail of the ledger, opening with a birth line:
   `Successor of <old-node>, retired YYYY-MM-DD — full history there.`
2. **Retire the old node with a banner at the TOP** — dated, pointing
   forward to the successor — and never append to it again. It stays in
   place as the archive.
3. **Re-point the parents:** strike-and-stamp every hub and parent link
   to the retired node, replacement in-slot pointing at the successor.

Nothing is deleted; retirement is archival, so the append-only discipline
holds. Note that splitting a crowded node into children (§2) is not a
substitute — splitting copies the crowding into the children. Retirement
is how dead weight actually leaves the walking path.

**Form is guard-enforced.** `scripts/memory-lint.mjs` checks the
mechanics this section defines — dated ledger lines, stamped strikes,
well-formed claims and releases — and flags multiple live claims in one
node. The script is the enforcement of record for the formats it checks
(AGENTS.md §1); run it per `policies/verification.md`. What it cannot
check is append-only itself: a stateless lint sees form, not history.
That discipline remains on the agent.

## 5. Git Status

**Gitignored by default** (`memory/` in `.gitignore`), unless the owner
says differently — that call is the owner's, made once and recorded in
the hub.

The tradeoff to surface when asking: ignored memory is invisible to other
clones. The web coordinates only agents who can see it. Same working tree,
no problem. Agents operating from separate clones or machines need the web
committed (or otherwise synced) before parallel work starts —
`policies/orchestration.md` §6.

**Deciding late is the expensive direction.** The ignored→committed flip
is retroactive and irreversible in one motion: every entry ever written
becomes public simultaneously, and append-only means the back-history
cannot be removed afterward — only struck, which leaves the text in
place. Agents write into an ignored web with the working assumption that
it is local operational state, so it accumulates internal names, machine
paths, unreleased project names, and candid status notes at a standard
no one set for publication.

Therefore: **make this call before the web has a history, not after.** If
the decision is deferred, treat the web as if it were already public
while it stays undecided. And if a flip to committed is made on a web
that already has depth, it is a review, not a toggle — read the whole
web first, and treat anything unpublishable as a reason to keep it
ignored rather than a thing to quietly restate.

**Git worktrees are a special trap.** Worktree-per-agent is a common
parallel-agent pattern, and each worktree is a separate working tree — a
gitignored `memory/` does NOT propagate between worktrees of the same
repository. Two agents working in sibling worktrees will each see (or
each create) a private web while believing they share one, which defeats
every coordination guarantee in `policies/orchestration.md`. Before
parallel worktree work starts, one of: symlink `memory/` into every
worktree from a single canonical location, commit the web, or don't run
the agents in parallel. Owner call, recorded in the hub.

## 6. Convention Evolution

Memory conventions are lab-shaped and will keep changing. If a platform
vendor (Anthropic, Cursor, or whoever) ships a first-party memory
convention:

- The new convention **may be discussed and adopted, or declined.** The
  discussion happens with the owner; agents do not migrate memory
  unilaterally.
- The decision is **structural and locked per repo**: a dated entry in the
  hub records what was adopted or declined and why.
- A new convention may live as a **separate memory space alongside the
  web** rather than replacing it. The web remains the authoritative map
  until a dated hub decision says otherwise. Bridges between spaces (a
  link from the hub into the new space) are cheap and preferred over
  migration until the new convention has proven itself.

## 7. What Memory Is Not

- **Not a research journal.** Investigation state lives in `.research/`
  per `policies/research.md`; nodes *link* journals.
- **Not repo documentation.** ADRs, plans, and briefs live in `docs/` per
  `policies/documentation.md`; nodes *link* them.
- **Not a changelog.** Git history is the changelog.
- **Not a scratchpad.** Nothing exploratory; the web records what has been
  established and where to find it.
