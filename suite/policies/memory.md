# Memory Usage Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load on first contact
with the repository and whenever configuring, reading, or writing its
operational memory. Resolve the chosen entry point from AGENTS.md §5.

## 0. Configured Memory

> **Addendum (2026-10-02, owner-directed memory adaptation):** The bundled
> web is an available backend. A project may instead point to existing
> agent-native memory, a company memory system, or another approved
> location. This section governs selection. Sections 1–7 describe the
> bundled web; their layout, identity files, content rules, append-only
> formatting, and git conventions apply when that backend is selected.

> **Erratum (2026-10-02, owner clarification of the web):** The navigable
> map and progressively specific rings in §§1–2 apply across storage
> providers. The earlier qualification of §§1–7 makes their storage-specific
> file layout, identity files, and mutation conventions conditional; it
> does not make the web's navigation model optional.

### Preserve the Navigable Rings

Give agents a discoverable repository hub, then a route through categories
that match the actual repository. The first ring names broad areas or
concerns. Each deeper ring narrows to a subsystem, workflow, feature, or
other working scope until the agent reaches the node that points to the
relevant code, decisions, task evidence, and current status.

For example, a route might be: repository hub → data storage → writes →
retry behavior → the owning code and journal. The categories follow the
repository; there is no universal taxonomy or prescribed number of rings.
Create narrower nodes as the work and information require them, and add
cross-links where another area matters to the current task.

Keep navigation nodes small: scope, the next useful links, and concise
status or pointers to status. Walk only the relevant branch and follow its
references to authoritative detail. Avoid loading every ring or all stored
memory to answer a question about one area. An agent that already knows
the appropriate node can resume there and use parent or cross-links when
the task broadens.

This structure can live in the bundled files, a provider's categories and
linked records, or another supported representation. If an existing
agent/company memory cannot expose a usable walk, configure a thin
navigation index elsewhere that points into that memory and the repository.
The index supplies routes; the existing records retain their authority and
content conventions. Record how the route maps to provider references or
scoped queries in AGENTS.md §5 so another agent can follow it too.

### Select the Existing Home First

Before creating a memory directory or registry, read the memory
configuration in [AGENTS.md §5](../AGENTS.md#memory-configuration), or the
configuration document it points to. Inspect established project and
company memory instructions. Use the selected system and its repository
scope. If its entry point already exposes the repository web, an agent can
orient there directly. Otherwise configure the navigation mapping or a
thin index that leads to its records; a replacement memory module is
unnecessary.

When no choice has been made, help the owner record one. The choices are
the bundled link web, an existing agent/company memory system, or another
location such as a shared file, document, or service. Identify how agents
find, read, and update the chosen home. Keep a discoverable pointer in
AGENTS.md even when the memory itself lives elsewhere.

An existing company's access, content, history, and retention conventions
continue to govern its system. Do not replace them with the bundled web's
folder layout or append-only file rules, migrate its records, or create a
competing copy of its knowledge without an owner decision. A pointer index
can provide the web's navigation while leaving those records in place.
A later backend change is recorded in the configuration and the chosen
decision record. The evolution process in §6 still applies, using the
configured locations.

### Keep the Repository Knowledge Findable

For the repository's operational records, preserve the useful role of
memory: find current status, the relevant artifacts, and enough dated
context to distinguish a current decision from one it superseded. Use the
provider's own representation for those records. Canonical code,
documentation, and task evidence remain authoritative; memory should
point to them and identify the status it records.

An agent's memory may also hold other material under that agent's or
company's conventions. LORE's link-web content rules describe the bundled
module, not every record an existing provider maintains. Research detail
continues to live in its task journal under [research policy](research.md),
with a link or reference from the chosen memory when it supports one.

### Match Coordination to Actual Visibility

Check who can see the chosen records, whether they survive a session, and
which agents can write them. Personal agent memory can aid its own
orientation while a separate shared record handles claims and handoffs.
Record that coordination location in AGENTS.md §5 and follow
[orchestration policy §0](orchestration.md#0-configured-coordination).
Do not assume a private memory, unsynced clone, or provider inaccessible to
another agent is a shared coordination channel.

When memory is unavailable or read-only, record that limit in the task
journal and use a configured fallback when available. Continue authorized
work that does not depend on unavailable knowledge or an unconfirmed
claim. Do not silently manufacture another store and treat it as the
configured source. Overlapping writes require a visible coordination
record or explicit sequencing through the owner.

### Apply the Matching Checks

The bundled `scripts/memory-lint.mjs` validates the bundled web's file
format at its supplied repository root. It does not validate an
agent-native or external store. The project's standard check suite
(`verification.md` Rule 1) names the applicable provider checks, if any,
and distinguishes unchecked capabilities from verified ones. The shipped
template guard can still check the template without making it the active
memory backend.

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
