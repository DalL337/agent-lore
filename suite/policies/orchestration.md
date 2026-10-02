# Orchestration Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load whenever more
than one agent may touch this repository in overlapping time, whenever
starting or ending a session in a shared repository, and whenever work is
being split across agents or handed off between them.

**The coordination substrate is the memory web** (`policies/memory.md`).
Claims live at memory nodes; there is no separate coordination board. One
substrate serves as both map and ledger: an orchestrating agent assigns
areas by writing claims at nodes, and a working agent walks to its node
and sees scope, neighbors, status, and what is already done — in one
place. If this unification stops fitting a project, the owner and agents
may split the substrates; that is a structural decision recorded in the
memory hub.

## 0. Configured Coordination

> **Erratum (2026-10-02, owner-directed memory adaptation):** Resolve the
> coordination location in AGENTS.md §5 before using the web-specific
> procedures below. Memory and coordination may share a provider or live
> in separate places. The earlier single-web description is the bundled
> default; a configured agent or company memory remains governed by its
> own conventions.

Use the configured shared location for sessions, scope claims, releases,
dependencies, and handoff pointers. "Node" and "hub" refer to the web's
logical navigation across providers; the concrete registry files and paths
below describe the bundled implementation. Use the configured navigation
mapping to find another provider's corresponding project area and records.
Preserve exact claimant identity, scope, confirmation of the claim, visible
release, and handoff evidence;
the provider's supported representation governs the storage format.

All participating agents must be able to see the same coordination state
and confirm their claims there. Private agent memory, a read-only memory
provider, or separate unsynced memories can still help orientation; record
claims in the separately configured shared location. A project note or
shared file can provide that location without a dedicated memory module.

If no accessible shared location exists, sequence overlapping work through
the owner. Do not infer another agent's agreement from a private claim.
The configured provider's visibility and confirmation are what establish
coordination; merely having a memory module does not establish them.

> **Addendum (2026-10-02, navigation clarification):** A separate shared
> coordination record is linked from the relevant working node in the web.
> Walking from broad scope to specific work should reveal its claim and
> handoff location even when that record and the memory use different stores.

## 1. Roles

- **Owner** — the human. Final authority on scope disputes, merge order,
  and everything else.
- **Orchestrator** — an optional coordinating agent. May partition work,
  write claims on behalf of workers, and sequence merges. An orchestrator
  is a convenience, not a requirement; the claim rules below work
  peer-to-peer without one.
- **Primary agents** — registered in `memory/agents/<platform>.md` under
  the identity scheme of memory policy §3: platform-rooted path ids,
  discriminated (by area or session date) only when multiple instances of
  the same platform are live. Claim, work, release — always under the
  exact full id registered this session.
- **Sub-agents** — act under their parent's claim and identity. They never
  claim, never register, and report findings to the parent, who appends to
  the web on their behalf. Sub-agents DO keep their own research journals
  (`policies/research.md` Rule 1) — a journal is lineage-named work
  product, not registration.

## 2. Claims

A primary's session entry (memory policy §3) must exist **before its
first claim** — every claim carries the exact full id registered for this
session, and self-recognition depends on it.

Before working an area:

1. **Walk the web** to the most specific node that covers the intended
   work.
2. **Check the claims section** of that node and its parent ring.
3. **Write a claim** — an appended, dated entry, timestamped to the
   minute (claim ordering may need to be decided by it, step 4):

   ```
   - CLAIM 2026-08-30T14:02 — claude-code/frontend — scope: retry logic
     in <path> — branch: feat/example — deliverable: PR
   ```

4. **Re-read the node and confirm the claim survived.** Checking and
   writing are separate operations on a shared file: two agents can both
   see a node unclaimed and both write, and one write can clobber the
   other. After appending, read the node back and verify your claim is
   present AND is the only live claim on that scope.
   - Your claim is missing → the other write won the file. Do not
     re-append; coordinate before touching the scope.
   - Two live claims on the same scope → the earlier timestamp holds;
     the later claimant strikes its own claim with a dated note and
     yields. Identical or ambiguous timestamps → both stop and escalate
     (§3).
   - A detected conflict is the system working. A silent clobber is the
     failure. This confirmation step is what converts one into the
     other.

5. Work. On completion or session end, **append a release**:

   ```
   - RELEASE 2026-08-31 — claude-code/frontend — done, PR #52;
     remainder noted in ledger
   ```

Claims obey the memory policy's append-only discipline: released and
superseded claims are struck and stamped, never deleted.

**Claim the most specific node that covers the work.** A claim at an area
node when the work touches one leaf blocks neighbors for no reason;
matching claim granularity to node granularity is what lets parallel work
happen at all.

## 3. Conflicts

- **Recognition is by exact full id** (memory policy §3). A claim signed
  by your platform under a different or missing discriminator is a
  *sibling's* claim, not yours — treat it as any other agent's active
  claim until coordination proves otherwise.
- **An active claim on your target means you do not work it.** Coordinate
  with the claim holder (through the owner or orchestrator if there is no
  direct channel), or take adjacent unclaimed work.
- **Overlapping claims:** proceed only if the work is file-disjoint and
  both claims note the overlap. Otherwise the later claimant yields.
- **Agents never silently resolve scope disputes between themselves.**
  Escalate to the owner or orchestrator with both claims stated plainly.
- **Stale claims:** a claim with no ledger activity past the project's
  threshold *(adopt-time slot — suggested default: one session or 24
  hours, whichever the owner prefers)* may be flagged and superseded —
  with a dated note naming the staleness, never silently. The prior
  claimant's work-in-progress branch is left untouched; supersession takes
  over the *scope*, not the branch.

## 4. Partitioning

- **Partition along architecture boundaries, not file lists.** Domains,
  modules, subsystems — seams the codebase already respects. File-list
  partitions leak the moment an interface changes.
- **One unit of work, one branch, one agent** (`policies/git.md`). Two
  agents on one branch is a merge accident with extra steps.
- **Cross-claim dependencies get sequenced explicitly.** If B's work needs
  A's merged first, that ordering is appended at the hub or a coordination
  node — not held in anyone's context window.

## 5. Handoff (absorbed scope)

This policy owns the former standalone handoff scope. Ending a session
mid-work:

1. Append status to the owning node's ledger: what is done, what remains,
   next actions in order.
2. Link the research journal (`policies/research.md` — the journal is
   where the detail lives; the node just points).
3. Release the claim, or annotate it if the same agent expects to resume.

A successor agent resumes from **node + journal, never from scratch**. If
a successor cannot reconstruct the state of work from those two artifacts,
the handoff was defective — codify what was missing as a rule here.

## 6. Visibility Assumptions

The web coordinates only agents who can see it.

- **Default assumption: one shared working tree** (or clones on the same
  machine sharing the `memory/` directory).
- **Separate clones or machines:** the web must be committed or otherwise
  synced before parallel work starts — see `policies/memory.md` §5. This
  is an owner call. Running parallel agents against invisible-to-each-
  other memory is how two agents claim the same scope in good faith.
- Branch discipline (`policies/git.md`) is the backstop: even when
  coordination fails, one-unit-one-branch keeps collisions reviewable
  instead of destructive.
