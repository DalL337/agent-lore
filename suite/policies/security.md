# Security Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load for
security-relevant work: anything creating a new execution or network
surface, dependency changes (with `policies/tooling.md`), supply-chain
features, or audit/review passes.

## Rule 1 — When a Security Review Is Mandatory

- A change introduces a **new execution surface** (anything that
  downloads, installs, or runs third-party code) or a **new network
  surface**.
- A privileged command or IPC boundary touches filesystem, process
  spawn, or network.
- Dependencies are added or materially upgraded. (A tooling fast-path
  addition's recorded condition check satisfies this —
  `policies/tooling.md` §4.1; everything else takes the full review.)
- A release or visibility milestone approaches (public flip, external
  beta).
- External intel lands — a post-mortem, advisory, or incident relevant
  to a surface this project has.
- Periodically, and after any major arc touching the above.

## Rule 2 — Method

- **Classify before designing.** Any "should the project download/run
  Z?" question starts with the class: (1) **verified artifact** — pin
  version + hash, verify before use, official distributors only;
  (2) **reference data** — cache, size-cap, treat as inert;
  (3) **project-owned execution** — never run it hidden; visible
  execution is the consent and the audit trail; (4) **system-owned
  toolchains** — detect and hint, never install.
- **Primary sources, adversarially verified.** The research policy
  applies to all security investigation; claims that shape design get
  verified against primary sources before they're load-bearing.
- **Standing trust rules:** no silent downloads, ever; pinned exact
  versions over `latest`; freshness risk gets an age gate; provenance is
  not a safety signal by itself — valid provenance has appeared on
  compromised packages.
- **Name the residual risk in the same breath as the mitigation.** Every
  posture statement lists what is NOT covered. User-facing safety claims
  are conservative and, where possible, test-enforced.

## Rule 3 — Deliverables

- **A living audit** is the home of observed security state: dated
  review ledger ("Last reviewed"), explicit scope line, checklist form,
  dependency scan results with commit refs, verified strengths, and
  blocked-upstream items carrying their reason and what unblocks them. A
  review pass appends a dated entry and refreshed scans — never rewrites
  history.
- **Scoped deep-dives** cover one surface each. If a premise dies, the
  document is parked with a dated banner explaining why and what a
  revival must re-scope — never silently deleted.
- **Security decisions that change behavior are ADRs**, not audit
  entries. The audit records observed state; the ADR records the
  decision. Cross-link both ways.
- Findings mid-arc that don't block the arc get journaled and surfaced
  to the owner with severity honestly stated — flagged where found,
  fixed before the surface goes live.

## Rule 4 — Chokepoint Exceptions Inherit Every Exemption

When a policy is enforced at a central chokepoint (a write manager, a
gateway, a validation layer), every ratified exception or bypass of that
chokepoint silently inherits an exemption from **every rule the
chokepoint carries — including rules added later.** Therefore:

- **Exceptions live in a register at the chokepoint.** An exception that
  isn't listed is a bug, not an exception.
- **Adding a rule to the chokepoint re-triggers an audit of the
  register.** Each exception either re-applies the new rule locally
  (documented at its site) or is explicitly recorded as deliberately
  exempt, with the reason.
- **Sweep for effect-equivalent paths, not just registered exceptions.**
  Ask: what user action produces this same effect through different
  code? (A rename produces a creation; a save-as produces a creation.)
  The loophole class hides in flows that don't share the guarded verb's
  name.
- **Refusals must be visible.** A chokepoint that blocks silently reads
  as a bug upstream, trains users to route around it, and hides the
  loophole class from live verification. Every refusal surfaces at
  whichever layer can show it. Ordering interacts with refusal:
  `policies/implementation.md` Rule 7 — a chokepoint that can refuse
  makes any state-first flow a drift trap.
