# Research Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load **before the
first tool call** of any task involving research, investigation,
debugging, architecture discovery, repository exploration, documentation
review, root-cause analysis, or any task requiring more than a few tool
calls. Failure to follow this policy is an execution error.

## Bootstrap Checklist

☐ Read this document completely
☐ Create the research journal
☐ Record objective and success criteria
☐ Begin investigation

## Primary Objective

**Research must be resilient to interruption.** Assume execution may stop
at any time: session expiration, context limits, rate limits, model
replacement, restart, user interruption, process termination. At no point
should significant investigative work exist only inside a model's context
window.

The governing invariant:

> If execution stops unexpectedly, another agent must be able to continue
> after reading only the journal, without repeating completed work.

This invariant takes priority over convenience and speed.

## Rule 1 — Journal First

Before the first search, grep, file read, or tool call, create the
journal:

```
.research/<date>-<short-task-name>.md
```

(`.research/` is in-tree but gitignored by design.) The journal is the
authoritative record of the investigation from this moment on.

**Sub-agents create their own journals.** A sub-agent's investigation is
still an investigation: it gets its own journal, named to show lineage —
`.research/<date>-<parent-task>--sub-<label>.md`. The parent links every
sub-journal from its own journal and from its registry file
(`policies/memory.md` §3), and on the sub-agent's completion absorbs the
conclusions into its `## Current Findings` — by link and summary, not by
copy. Sub-journals follow every rule in this policy.

## Rule 2 — Record the Objective

The journal begins with: original request, current objective, success
criteria, known constraints, assumptions. This section is never
overwritten.

## Rule 3 — Log Every Investigation Step

Every significant action — searches, greps, file inspections, symbol
lookups, build/test runs, log and database inspection — gets an entry:
what was done, why, and **what was learned**. Relevant files and symbols
by name. Do not merely state that an action occurred.

## Rule 4 — Evidence, Not Chain of Thought

The journal is a technical notebook, not a reasoning dump. Record observed
facts, supporting code, documentation references, verified behavior,
rejected hypotheses (with why), confirmed conclusions. It must be
understandable by another engineer or agent with no access to hidden
reasoning.

## Rule 5 — Running Sections

Maintain continuously, so no future reader reconstructs state from raw
log entries:

- `## Current Findings` — every confirmed discovery, summarized.
- `## Remaining Questions` — unknowns, missing evidence, unverified
  assumptions, edge cases.
- `## Next Actions` — an ordered checklist of the next executable work
  items, always current.

## Rule 6 — Save Continuously

Append and save after every significant step. The maximum work lost to an
interruption is one investigation step.

## Rule 7 — Resume From the Journal

If interrupted: locate the journal, read it completely, reconstruct state,
continue from `## Next Actions`. Never restart an investigation blindly.

## Rule 8 — No Duplicate Investigation

Before any search, grep, or inspection, consult the journal. Completed
findings that remain valid are reused, not re-derived — unless
verification is explicitly the point.

## Rule 9 — Final Deliverable

A complete journal contains: Objective · Original Request · Investigation
Log · Evidence · Current Findings · Remaining Questions · Next Actions ·
Final Conclusions. The report presented to the owner derives from the
journal.

## Rule 10 — The Journal Is the Source of Truth

Conversation context is temporary; the journal is persistent. If they
disagree, prefer the journal. Write for multi-agent compatibility: no
assumed shared memory, no reliance on prior conversation context —
everything needed to resume exists inside the journal.

## Rule 11 — Link the Journal Into the Web

When the investigation touches an area with a memory node
(`policies/memory.md`), append a link to the journal in that node's link
table or ledger. The web is how a future agent *finds* the journal; a
journal only the writing agent knows about has failed half its purpose.
