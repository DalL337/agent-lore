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
3. Load `policies/memory.md`. Bootstrap the memory web.
4. Scaffold. Steady state begins.

### 2.2 Steady state — policy dispatch

Read the work request, match it against this table, and load ONLY the
policies the task needs — never the whole suite. A policy loads BEFORE
the work it governs begins. Failure to load a matching policy is an
execution error.

| When the task involves… | Load and follow |
|---|---|
| First contact with this repo, or no memory web exists | `policies/memory.md` — orient by walking the web; bootstrap it if absent |
| Research, investigation, debugging, architecture discovery, repository exploration, documentation review, root-cause analysis | `policies/research.md` — **before the first tool call** (journal-first) |
| Writing or changing code (any language) | `policies/implementation.md` |
| Branching, committing, pushing, opening PRs | `policies/git.md` |
| Preparing any PR, completing a milestone/slice, changing an API or architecture boundary | `policies/verification.md` |
| Creating or updating repo documents (ADRs, plans, briefs, PRDs, notes) | `policies/documentation.md` |
| Release work: version bumps, bundling, release builds | `policies/release.md` |
| Security-relevant work: new execution/network surface, supply-chain features, audit passes | `policies/security.md` |
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
- **Memory web git status** (ignored vs committed) —
  `policies/memory.md` §5.
- **Stale-claim threshold** — `policies/orchestration.md` §3.
- **Markdown lint stance** — `policies/documentation.md` Rule 6.

Keep the dispatch table in sync with what actually exists. A row pointing
at a policy this project deleted is a trap for the next agent.
