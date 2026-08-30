# Documentation Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load when creating
or updating repo documents — ADRs, briefs, plans, RFCs, PRDs, notes.

## Rule 1 — Document Kinds: Home, Scope, Naming

Every repo document is one of these kinds. Pick the kind before writing;
don't blend scopes.

| Kind | Home + naming | Scope — what belongs in it |
|---|---|---|
| ADR | `docs/adrs/NNN-kebab-title.md` | **Normative decisions only** — what was decided and why, alternatives rejected, consequences. Detailed design does NOT belong here; the ADR cites the brief/plan as the canonical detailed design. |
| Brief / design doc | `docs/plans/**/brief-<topic>.md` | The full design: investigation evidence, mechanisms, trade-offs, open questions. May precede its ADR. |
| Build plan | `docs/plans/<area>/…-build-plan.md` | Delivery slices, each with Goal / Tasks / Tests / Acceptance. Owns sequencing, not decisions. |
| RFC / PRD | `docs/rfcs/`, `docs/prds/` | Early-shape proposals and product requirements. When an ADR supersedes parts of one, add a dated supersession note to the old doc — never silently rewrite it. |
| Tooling register | `docs/TOOLING.md` | The stack and its rationale (`policies/tooling.md` §2). |
| Research journal | `.research/<date>-<task>.md` (gitignored) | Investigation state per `policies/research.md`. Never a home for repo-facing content. |
| Memory | `memory/**` (gitignored by default) | The link web per `policies/memory.md`. Never a home for repo-facing content. |

Adapt homes and naming to the project's layout on adoption — then keep
this table true.

## Rule 2 — Amend, Never Rewrite

Accepted documents grow by dated addenda and blockquote errata
(`> **Erratum (date, context):** …`). ADR status is a **ledger**: every
state with its date and one-line context, original `Proposed` kept at the
bottom. History stays legible in the document itself.

ADR skeleton (house format): `# ADR-NNN: Title` → `## Status` (ledger) →
`## Date` → `## Context` → `## Decision` (numbered subsections) →
`## Consequences` (positive / costs) → `## Alternatives Considered` →
`## Scope Notes` → optional `## Implementation Follow-ups`.

## Rule 3 — Pointers Over Restatement

Never restate what another artifact owns. Enforcement code is the record
of what it enforces — cite it, don't copy its lists. Architecture docs
own architecture; code constants own values; the tooling register owns
the stack. A copied list is a future contradiction.

## Rule 4 — Provenance on Every Claim That Needs Trust

Date status changes and addenda. Attribute decisions ("owner decision,
date"). Name the PR that delivered a slice. When a document records an
empirical finding, say how it was verified. (This is the accumulation
convention of AGENTS.md §3 applied to all documents, not just policy.)

## Rule 5 — Documents Live in the Working Tree

Any document an agent creates for the repository must be present in the
local working tree when the turn ends. If it was committed on a branch,
leave that branch checked out (or otherwise ensure the file exists in the
tree) — do not switch away and let the doc vanish from the owner's view.
Do not park repo documents in scratch directories or out-of-tree
locations; the only out-of-tree content is agent memory and research
journals, which are governed by their own policies. When sharing a link
to a doc on an unmerged branch, prefer the PR "Files" URL over a branch
blob URL, and say explicitly the doc is pending merge.

Docs ride with their code (`policies/git.md` §2.3): a doc describing
unmerged behavior belongs on that branch, not the default branch.

## Rule 6 — Lint Stance

*(Adopt-time slot.)* The project declares whether markdown linting is a
quality gate. Default shipped stance: follow standard markdown
conventions; lint warnings are not a gate.

## Rule 7 — Agent-Drafted Specifics Are Unverified Until Checked

Proper nouns in an agent-drafted document are hypotheses, not facts:
entity and product names, people, URLs, versions, license identifiers,
citations, file paths, identifiers of every kind. They carry no authority
from having been written down fluently, and none from having survived
several readings — a specific that reads as settled is not the same as a
specific that was ever true.

This applies with full force to text inherited from an earlier session,
an earlier draft, or an earlier agent. Provenance *inside* the document
set is not verification; a fabricated name copied forward is still
fabricated at every hop, and each hop makes it look more established.

**Before a document becomes load-bearing** — a license, a register entry,
a published README, a contract, anything an outside reader will act on —
check every proper noun in it against something outside the document.
Ask of each: what evidence, outside this file, says this exists?

**Trap signature: the specific nobody remembers deciding.** When no one
can point to the moment a name was chosen, it was probably never chosen.
Ownership, attribution, and legal identity are the highest-severity
instance of this class — a fabricated holder in a license is an
unenforceable grant made in the name of a party that does not exist —
and they are also the least likely to be questioned, because those fields
are skimmed as boilerplate rather than read as claims.
