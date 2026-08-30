# Tooling Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load at repository
birth, and afterward for any dependency addition, upgrade, replacement,
framework adoption, or language question. This policy owns the former
standalone dependency-change scope.

Tooling has two arms: **bootstrap** (the repo is being born) and
**steady state** (the stack evolves). Both arms end in the same place —
the tooling register.

## 1. Bootstrap — the research arm at repo birth

The user wants to make a thing. The path from that want to a stack:

1. **PRD first.** Take the owner's PRD if one exists; if not, create one
   with the owner before any tooling research
   (`policies/documentation.md` for the document kind). The PRD is the
   constraint set — platforms, performance envelope, team shape,
   licensing posture, longevity expectations. Tooling serves the PRD,
   never the reverse.
2. **Load `policies/research.md`.** Journal-first: tooling selection is an
   investigation and follows every research rule.
3. **Enumerate candidates** for each layer the PRD implies: language(s),
   framework(s), runtime dependencies, build tooling, test tooling.
4. **Evaluate each candidate against the criteria in §3.** Primary
   sources — repos, changelogs, advisories, license texts — not model
   memory. Claims that will shape the stack get verified before they are
   load-bearing.
5. **Build the tooling proposal and give it to the user:** per layer, the
   candidates considered, tradeoffs stated honestly, a recommendation
   with its reasoning, and every license named. The owner decides; the
   agent recommends.
6. **The owner's decisions birth the tooling register** (§2). Rejected
   candidates stay in the proposal with the reason — a future "should we
   switch to X?" starts by reading why X lost the first time.

## 2. The Tooling Register

`docs/TOOLING.md` — the living, authoritative record of what this project
builds with and why. All future stack questions reference it first.

- **The first entry is the license allowlist** *(adopt-time slot — the
  owner declares it: e.g. permissive-only such as MIT/Apache-2.0, or a
  broader compatibility rule)*, together with the exception procedure
  (§4).
- Every subsequent entry records: item, role in the stack, version and
  pinning policy, license, decision date, and a link to the rationale
  (proposal, journal, or ADR).
- The register follows amendment discipline
  (`policies/documentation.md`): dated addenda, struck-and-stamped
  supersessions, never silent rewrites. A register you can read
  chronologically is a register you can trust.

## 3. Selection Criteria

Weigh every candidate — bootstrap or steady state — on:

- **License** against the allowlist. A disqualifying license ends the
  evaluation unless the exception procedure is invoked.
- **Maintenance health** — release cadence, issue responsiveness, bus
  factor, governance. A brilliant abandoned library is a future
  migration.
- **Security posture** — advisory history, supply-chain surface,
  install-time behavior. Standing trust rules apply
  (`policies/security.md`): no silent downloads, pinned exact versions
  over `latest`, provenance is not by itself a safety signal.
- **Fit with the existing stack** — steady state only. The register says
  what already exists; a candidate that duplicates a capability already
  on the register needs a reason beyond preference.
- **Cost** — size, build-time impact, cognitive complexity, transitive
  dependency load.
- **Exit cost** — how hard is it to leave? Prefer candidates whose
  boundaries the project can wrap.

## 4. Steady State

Any future need — new dependency, major upgrade, replacement, new
framework or language — follows one loop:

1. **Register first.** Read what exists and why before proposing what's
   new. Weigh the initial tooling decisions; they are precedent, not
   scripture.
2. **Evaluate options** per §3, research-policy discipline for anything
   nontrivial.
3. **Present options and tradeoffs to the owner** — including "do
   nothing" and "build it" where they are real options. Help the owner
   weigh options and practices; do not pre-decide by presenting one
   candidate.
4. **Owner decides; register updated in the same unit of work** as the
   change itself. A dependency in the lockfile that the register doesn't
   explain is a defect.

**When no allowlist-compliant option exists,** the options are, in order
of preference: build the needed piece, vendor or wrap a compliant
alternative, or the owner grants an exception — dated, reasoned, and
recorded in the register. Exceptions are owner decisions only; an agent
never self-grants one.

### 4.1 Fast Path — Trivial Dev-Only Additions

The full loop is the default, not a tax on every test matcher. An
addition may take the fast path when **all** of the following hold:

- **License is on the allowlist** — no exception needed.
- **Dev-time only** — build, test, lint, or type tooling that ships in
  no production artifact.
- **No new execution or network surface** — in particular, no
  install-time script execution. Check the package's install hooks: a
  dependency that runs code at install time is an execution surface and
  exits the fast path regardless of how trivial it looks.
- **Pinned exact version.**

Fast path procedure: the agent adds the dependency and its register
entry in the same unit of work, the entry marked `fast path` and
recording the condition check. That recorded check stands as the
security review for the addition (`policies/security.md` Rule 1), and
the owner's PR review is the decision — no separate proposal round.

Any condition unclear or failing → the full loop, and
`policies/security.md` loads. When in doubt, the doubt is the answer:
full loop.

## 5. Research Standards

Tooling claims decay fast. Verify against primary sources at decision
time — repository activity, changelogs, advisory databases, the actual
license file in the actual repo — and record in the journal *how* each
load-bearing claim was verified. "Widely used" and "well maintained" are
hypotheses until checked.

## 6. Brownfield Adoption

An existing project adopting this suite does not audit its way to a
complete register on day one — a mature repository's transitive
dependency census is a project in itself, and most of the output would be
dead information.

- **Seed the register with the load-bearing decisions only:** the
  license allowlist, the language(s), framework(s), build and test
  tooling, and the top-level runtime dependencies a real stack question
  would reference. Each entry is stamped
  `recorded from existing state, <date>` in place of a decision
  rationale — an honest "this predates the register" beats a
  reconstructed justification.
- **Everything else registers by contact.** When steady-state work (§4)
  touches a dependency not yet on the register, it is added then, with
  whatever rationale is recoverable — or
  `pre-register, rationale unrecorded`.
- The register reaches completeness through work, not census. §4's "a
  dependency the register doesn't explain is a defect" applies **after**
  an area has been worked under this suite; before contact, it is merely
  not registered yet.
