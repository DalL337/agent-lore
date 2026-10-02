# AGENTS.md — Agent Governance Entry Point

> **Seed suite.** This governance suite was adopted from LORE — Living
> Operational Rules & Evidence — and is expected to diverge. It is
> read-and-adapt: when a rule here conflicts with this project's reality,
> fix the rule — with a dated note — rather than working around it. The
> transferable part is the method; the specifics are yours to earn.

## 1. Purpose and Authority

This file is the first thing an agent reads in this repository. Everything
in it is either a policy to follow or a pointer to the document that owns
the details.

Order of authority:

1. **Enforcement code** — guards, CI checks, and any ratified automated
   gate. The enforced floor. When prose and enforcement disagree, the
   enforcement wins and the prose gets fixed. The suite ships its first
   guard: `scripts/memory-lint.mjs`, which checks memory-web form
   (`policies/memory.md` §4). It is the model for what earned enforcement
   looks like — as rules prove out, they graduate from prose to guards.
2. **This file** — repository-wide process policy and the dispatch maps
   below.
3. **`policies/*`** — scoped procedures. Mandatory when a dispatch row
   matches the task; they own execution detail within their scope.
4. **Agent judgment** — governs everything the above does not. Judgment is
   not a fallback of last resort; it is the default state of an
   ungoverned scope, and the source of every future rule (§3).

## 2. Two Maps

An agent's first question is which map applies.

### 2.1 Greenfield — repository birth

If this repository has no established stack (no tooling register exists):

1. Load `policies/tooling.md`. Take the owner's PRD, or create one first.
2. Research candidates, build the tooling proposal, present it. The
   owner's decisions birth the **tooling register** — the living record
   every future stack question references.
3. Load `policies/memory.md`. Resolve the memory configuration (§5), use
   the established system when one exists, and bootstrap the bundled web
   only when that is the chosen backend.
4. Scaffold. Steady state begins.

### 2.2 Steady state — policy dispatch

Read the work request, match it against this table, and load ONLY the
policies the task needs — never the whole suite. A policy loads BEFORE
the work it governs begins. Failure to load a matching policy is an
execution error.

| When the task involves… | Load and follow |
|---|---|
| First contact with this repo; configuring, reading, or writing repository memory | `policies/memory.md` — resolve the configured web entry point (§5), then walk the relevant rings; bootstrap the bundled files only when selected |
| Research, investigation, debugging, architecture discovery, repository exploration, documentation review, root-cause analysis | `policies/research.md` — **before the first tool call** (journal-first) |
| Writing or changing code (any language) | `policies/implementation.md` |
| Branching, committing, pushing, opening PRs | `policies/git.md` |
| Preparing any PR, completing a milestone/slice, changing an API or architecture boundary | `policies/verification.md` |
| Creating or updating repo documents (ADRs, plans, briefs, PRDs, notes) | `policies/documentation.md` |
| Release work: version bumps, bundling, release builds | `policies/release.md` |
| Security-relevant work: new execution/network surface, supply-chain features, audit passes | `policies/security.md` |
| Owner-requested adversarial deep dive; creating or changing an enforcement point or a guarantee about state ownership, lifetime, or ordering | `policies/adversarial-check.md` — trace the guarantee through the system before calling the slice done or opening its PR |
| Owner-invoked creative mode; exploring an inventive direction, an unusual connection, or an unfinished idea | `policies/creative.md` — develop possibilities with the owner; evaluation begins when requested |
| More than one agent may touch this repo; starting or ending a session in a shared repo; handing work off | `policies/orchestration.md` (with `policies/memory.md`) |
| Adding, upgrading, or replacing dependencies, frameworks, or languages; any stack question | `policies/tooling.md` |

A task matching multiple rows loads multiple policies. A code slice that
ends in a PR loads implementation + git + verification; an investigation
that produces an ADR loads research + documentation; a dependency swap
loads tooling + security + git.

## 3. Provenance and Accumulation

This suite ships with **no incident history — deliberately.** The rules
below the entry point are starting principles distilled from a real
repository's lessons, with the incidents stripped. Your project's rules
will be earned here, on this repository, and they will carry their
origins.

**The accumulation loop is mandatory:**

1. A lesson emerges — a bug ships, a check gets skipped, an audit finds a
   loophole, a workflow fails in a way a rule would have prevented.
2. The agent drafts the rule in the policy that owns the scope, carrying
   the date and a description of the incident that produced it.
3. The owner ratifies, amends, or rejects. Ratified rules are policy.
4. The suite grows in place. Rules carry their origin on purpose: a rule
   whose origin you can read is a rule you can argue with when it stops
   fitting.

**Amendment discipline:** accepted rules grow by dated addenda and
corrections, never silent rewrites. History stays legible in the document
itself. (Full conventions: `policies/documentation.md`.)

**Housekeeping:** keep this suite free of personal or account data —
names, email addresses, account IDs, machine paths, third-party
identities. Rules describe *behavior* and cite roles ("the owner") and
artifacts (PR numbers, scripts, ADRs). Identity values live in local
config and agent memory, never in these files.

> **Addendum (2026-10-01, owner-directed policy expansion):** Added
> `policies/creative.md` for collaborative exploration and
> `policies/adversarial-check.md` for investigation of concrete guarantees.
> Their dispatch rows above define the triggers. Creative exploration
> moves into evaluation when the owner asks for it or selects a concrete
> proposal to develop.

> **Addendum (2026-10-02, owner-directed memory adaptation):** Memory may
> use the bundled web, an established agent or company system, or another
> location. The memory configuration in §5 is the entry point for that
> choice. Existing company and project conventions govern their stores;
> the bundled web's layout applies when that backend is selected.

> **Erratum (2026-10-02, owner clarification of the web):** The web's
> progression from repository categories to increasingly specific nodes is
> retained across providers. Configuration selects its storage and
> navigation mapping. A thin pointer index can expose those routes over
> existing agent or company memory without replacing its records.

## 4. Reserved Scopes

Empty policy files exist for scopes with no rules yet:

`planning` · `review` · `test-authoring` · `migration` ·
`failure-and-recovery`

An empty policy means no rules exist for that scope: proceed on general
judgment and this file, and when a lesson emerges, codify it there (with
provenance) rather than growing this file.

New scopes are allowed. When the first rule of a new kind needs a home,
create the stub in `policies/reserved/`, add its dispatch row, and place
the rule.

Two scopes from the ancestor suite were retired on generalization, their
duties absorbed: **dependency-change** lives in `policies/tooling.md`
(steady-state arm); **handoff** lives in `policies/orchestration.md` §5.

## 5. Adaptation Slots

Read-and-adapt means most of this suite works as shipped, but a handful of
decisions are the adopting project's to make. Fill these deliberately, and
early — each is flagged at its site:

- **Tooling register + license allowlist** — `policies/tooling.md` §2.
  The first register entry is the allowlist.
- **Standard check suite** — `policies/verification.md` Rule 1. Enumerate
  the project's actual commands.
- **Merged-branch stance** (delete vs retain) — `policies/git.md` §1.4.
- **Version string locations** — `policies/release.md` Rule 1. Enumerate
  every file that carries the version.
- **Memory storage and web entry point** — fill the memory configuration below;
  `policies/memory.md` §0 owns selection and coexistence. For the bundled
  web, also decide ignored vs committed per its §5.
- **Stale-claim threshold** — `policies/orchestration.md` §3.
- **Markdown lint stance** — `policies/documentation.md` Rule 6.

Keep the dispatch table in sync with what actually exists. A row pointing
at a policy this project deleted is a trap for the next agent.

### Memory Configuration

*(Adopt-time slot, added 2026-10-02.)* Record the chosen configuration in
this table, or replace it with a pointer to the project or company document
that owns the configuration. Honor an established choice before creating
a new store. These fields are prompts to fill, not a requirement to adopt
the bundled module.

| Field | Record on adoption |
|---|---|
| Storage provider | Bundled LORE files, agent-native/company memory, or an external store. |
| Web entry point | The repository-relative path, document reference, URI, or supported tool entry point for the repository's navigation hub. The bundled files start at `memory/INDEX.md`. |
| Navigation mapping | How broad repository categories lead through increasingly specific nodes to authoritative records; use provider links/categories or a thin index that points into the chosen store. |
| Scope and access | The repository's namespace or area; which agents can read and write; visibility across sessions, worktrees, and clones. |
| Coordination location | The same backend when it supports shared, verifiable claims; otherwise a separate shared file or service. |
| History and checks | The chosen provider's update/retention rules and the checks available for its records. |
| Fallback | An approved alternate location or how unavailable memory is reported; no silent competing store. |

An agent-native entry point that exposes the repository web can be used
directly. The bundled file module is optional; the navigation can use a
provider's own structure or a thin pointer index in another location.
An external store may be as small as a shared project note with those routes.
The [memory policy](policies/memory.md#0-configured-memory) defines how
these choices interact with the suite's default conventions.
