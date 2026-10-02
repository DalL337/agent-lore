# LORE — Living Operational Rules & Evidence

Every mature project develops institutional lore — why a strange guard
exists, what once broke, where the bodies are buried. Normally that lore
lives in one person's head and disappears when they leave. Coding agents
have it worse: they start every session with no memory at all, so the
same lesson gets re-learned, or re-broken, forever.

**LORE** makes that lore explicit, persistent, navigable, and
enforceable. It is a read-and-adapt governance suite for agent-driven
development, giving agents a walkable web of repository knowledge with
configurable storage, scoped policy dispatch, claim-based coordination,
and a path for lessons to mature into automated guards — built so that agents
learn and build policy *with* their developers, not for them.

The name is the design brief, letter by letter: **Living** — each
repository adapts and grows its own version. **Operational** — these
rules govern actual work. **Rules** — earned through incidents and
ratified by the owner. **Evidence** — provenance, journals, ledgers,
registers, and guards.

## Where this came from

LORE was not designed up front. It accumulated — rule by rule, on a
working repository, each one written the day something went wrong that a
rule would have prevented. Some were cheap to learn. Others were not.
The pattern never changed: the lesson was real, it was obvious in
hindsight, and then a later session made the same mistake anyway —
because the lesson had been learned by a person, or by a context window,
and lived nowhere durable enough to outlast either.

None of those incidents are in here. They belonged to that project, and
handing them to you would produce rules you inherited rather than earned
— which is the exact failure this suite exists to prevent. So what ships
is the shape of the lessons with the stories removed, plus the machinery
for your own to accumulate in their place.

This is the thing I wish had existed on the first day of that project.
Not a set of answers — somewhere for answers to go, and the habit of
putting them there. Take it and let it fill up with yours.

The transferable part is the method — dispatch-table policy loading,
provenance-carrying rules, append-only memory, claim-based orchestration
— not the specifics. Copy it into a project, point agents at
`AGENTS.md`, and let it diverge.

## Adopting

**Copy the contents of `suite/` into your repository root** — with one
exception, `gitignore-additions.txt`, whose default-location rules you
*append* to the `.gitignore` you already have when those locations are used:

```gitignore
/memory/      # agent memory web (policies/memory.md §5)
/.research/   # research journals (policies/research.md)
```

Keep the leading slashes. Unanchored, `memory/` matches at every level
and would silently ignore a `src/memory/` module in your own source tree.

Then:

1. Read `AGENTS.md` §5 and fill the adopt-time slots, including the memory
   backend and entry point. Use an established company or agent memory
   system when one is already chosen.
2. Greenfield project: run the tooling bootstrap (`policies/tooling.md`
   §1). Existing project: seed the register per `policies/tooling.md` §6
   — load-bearing decisions now, the rest by contact — then orient through
   the configured memory. Bootstrap the bundled web when it is selected.
3. Delete what doesn't fit. Keep the dispatch table true.

### Choose the Memory Home

*Added 2026-10-02.* The bundled memory module is optional. Point LORE at
the agent's existing memory, a company memory system, the bundled link
web, or a separate shared file, document, or service. Record the entry
point and access method in `AGENTS.md` §5, or point that section at the
existing configuration document.

Existing company and provider conventions continue to govern their stores.
LORE does not require a replacement module or a duplicate map. When agent
memory is private, choose a shared coordination location for claims and
handoffs. Full selection and coexistence rules: `policies/memory.md` §0.

> **Clarification (2026-10-02, owner definition of the web):** Preserve the
> navigation: a repository hub leads through relevant categories, with
> each ring becoming more specific until it points to the needed artifacts
> and status. Agents walk the relevant branch instead of loading everything.
> Storage can be the bundled files, the existing provider's linked records,
> or another location. If the provider cannot expose those routes directly,
> a thin index can point into it while leaving its records authoritative.

The ignore snippet above describes the default local directories; append
the rules needed for the locations you use. The shipped memory guard checks
the bundled web's format; it does not validate a different provider.

## What's in `suite/` — the part you copy

- **`AGENTS.md`** — the agent entry point: authority order, the
  greenfield map (PRD → tooling research → memory selection → scaffold),
  the steady-state dispatch table, the rule-accumulation loop, reserved
  scopes, and the adopt-time slots.
- **`CLAUDE.md`** — a pointer to `AGENTS.md`, for harnesses that look for
  that filename by convention.
- **`policies/`** — scoped procedures, loaded per-task:
  research · implementation · git · verification · documentation ·
  release · security · **orchestration** (multi-agent coordination) ·
  **memory** (walkable repository web with configurable storage) ·
  **tooling** (PRD-driven stack research + the living tooling register).
- **`policies/creative.md`** — collaborative exploration of unfinished
  ideas and connections across disciplines, following the owner's pace
  (added 2026-10-01).
- **`policies/adversarial-check.md`** — deep tracing of concrete
  guarantees, deliberate counterexamples, and evidence-qualified findings
  (added 2026-10-01).
- **`policies/reserved/`** — empty scopes that accumulate rules as
  lessons are learned.
- **`scripts/memory-lint.mjs`** — the suite's first guard: checks
  memory-web form (dated ledgers, stamped strikes, well-formed claims,
  multiple-live-claim detection). Zero-dependency Node; the checks are
  the policy, the implementation is fungible — port it if your stack
  lacks Node.
- **`memory/INDEX.md`** — a seeded, empty hub for the optional bundled web.
- **`gitignore-additions.txt`** — the two ignore rules, as a snippet that
  cannot clobber your `.gitignore` by being copied.

## The philosophy in one paragraph

This suite ships with no incident history, deliberately. Rules are earned:
when something goes wrong, the agent drafts the rule where the next agent
will look for it, carrying the date and the incident, and the owner
ratifies it. A rule whose origin you can read is a rule you can argue
with when it stops fitting. Agents learn and build policy *with* their
developers — the suite is the place that learning accumulates.

## License, and what it's actually meant to mean

MIT — see `License.md`. Because MIT's notice-retention clause was never
the point, here is the intent stated plainly, as an explicit additional
grant from the copyright holder:

> **Take it. Change it. Ship it.** You do not need to carry this
> license, this copyright notice, or any attribution into your
> repository, your `AGENTS.md`, or your policy files. Adopt it whole,
> adopt one policy, gut it and keep only the dispatch table — no
> credit required, no notice required, no obligations back.

Nothing in LORE is meant to constrain the next person. It is a thing that
helped one project; use it, learn your own lessons, and codify them your
own way. If you keep the tree wholesale and want to leave `License.md` in
place, that's welcome — but it is a courtesy, not a condition.
