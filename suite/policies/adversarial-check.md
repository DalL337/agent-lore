# Adversarial Check Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load for an
owner-requested adversarial deep dive, or before calling a slice done or
opening its PR when it creates or changes an enforcement point or a
guarantee about state ownership, lifetime, or ordering. These are starting
principles; this project's own findings and lessons accumulate here with
their provenance.

This policy triggers a fresh investigation through the system. State the
important guarantees, trace the actual behavior that supports them, and
actively seek counterexamples. Use the implementation, its explanation,
and its tests as evidence to investigate. A convincing account or a green
test suite does not establish what its evidence never exercised.

## Rule 1 — Scope Follows the Guarantee

Applies to access and disclosure decisions; trust-boundary parsing and
validation; resource limits; check-then-act operations; concurrency fences;
and state or lifecycle signals another module relies on, such as "ready,"
"loaded," "saved," or "still current." It also applies to a review target
the owner explicitly selects for an adversarial deep dive.

Routine styling, copy, and changes outside these guarantees do not trigger
the pass. Security-review obligations remain in the
[security policy](security.md); the normal check suite remains in the
[verification policy](verification.md).

Include upstream and downstream code the selected guarantee depends on,
even when that code predates the slice or lives in another module. If a
consumer trusts a signal, the producer and the conditions under which it
emits that signal are in scope. Trace until the guarantee has a supported
foundation or a concrete unresolved assumption.

Record unrelated findings separately, with their severity and evidence.
Keep their repair outside the slice unless the owner expands its scope.

## Rule 2 — Investigate Independently

Reconstruct behavior from the real entry points and execution paths.
Use the author's account to orient the investigation, then establish each
important claim through source inspection and, where possible, execution.
Read reused helpers and callers; follow transformations, ownership changes,
and side effects across module boundaries.

Actively look for the missing connection: individually reasonable pieces
can rely on incompatible assumptions when composed. Inspect what tests
substitute or hand directly to a consumer. A test that supplies a ready
signal establishes behavior under that supplied signal; investigate whether
the real producer emits it under the correct conditions.

The author or a reviewer can perform this pass. A second agent is optional;
do not spawn subagents by default. Independent investigation is required
regardless of who performs it.

## Rule 3 — The Deep Dive

1. **State the claims.** Write one sentence per important guarantee,
   including guarantees implied by the interface. Identify the input,
   state, or observable outcome it covers.
2. **Trace the full chain.** Follow the real input through normalization,
   checks, state transitions, side effects, and consumers. Locate the
   producer of every trusted signal and the object ultimately acted on.
   Cite the relevant paths and symbols.
3. **Expose the assumptions.** Identify what must be true about identity,
   timing, ownership, ordering, platform behavior, and failure handling.
   Establish where each condition is enforced. Keep an unsupported
   assumption visible as an investigation target.
4. **Explore alternate paths.** Trace other routes to the same effect,
   including retries, reopening, cancellation, restoration, errors, and
   stale work completing after a context switch. Apply Rule 4's questions
   where they affect the guarantee.
5. **Construct counterexamples.** Choose inputs and transitions that could
   invalidate those assumptions. Exercise the real chain where practical.
   For a race, introduce a test seam inside the exact check/use window and
   change the state there; a change made before the check does not exercise
   that window. Use disposable fixtures for destructive scenarios.
6. **Demonstrate the failure.** Run a suspected reproduction against the
   unfixed code. Preserve the script or test, observed output, revision,
   and relevant environment. If execution is impractical, record why and
   keep the finding qualified under Rule 5.
7. **Verify the repair.** Run the same reproduction, unchanged, against the
   fix. Verify each affected platform or environment where behavior differs;
   name outstanding coverage explicitly. Examine new assumptions introduced
   by the fix, including a second-order failure in its own checks.

## Rule 4 — Questions That Open the Trace

These questions are prompts for investigation. Follow the relevant answer
into the code and behavior; checking a box is not evidence.

- **Identity and lifetime.** Is the object checked the object used? Can a
  name, alias, copied identifier, counter, or reopened session identify a
  different object or generation? What survives a context switch?
- **Check versus use.** What can change after validation or authorization
  and before the operation? Is the eventual handle, snapshot, or state still
  covered by the check? Does resolving a name change which object is acted
  on?
- **Producer versus consumer.** Does a signal certify work its producer
  actually completed for this context? Trace synchronous completion,
  delayed completion, empty data, restoration, cleanup, and re-entry.
- **Ordering and refusal.** Can state announce success before a refusable
  side effect succeeds? What happens after partial failure, cancellation,
  duplicate execution, or a late result?
- **Bounds.** Are limits enforced on what is actually read, allocated,
  processed, and emitted, including encoding, aggregate work, and concurrent
  callers? Exercise the exact limit and the smallest input beyond it.
- **Alternate routes and observations.** Can another operation produce the
  guarded effect? Can names, counts, errors, or timing expose something
  withheld? Follow the exception and effect-equivalent-path method in
  [security policy Rule 4](security.md#rule-4--chokepoint-exceptions-inherit-every-exemption).
- **Failure and platform differences.** What do missing state, failed OS
  queries, unsupported behavior, and each supported platform do to the
  guarantee? For a permission decision, an unresolved check must refuse.
  Distinguish the behavior actually exercised from behavior inferred by
  inspection.

## Rule 5 — Evidence Status

Every finding has an explicit status. Report only what its evidence proves.

| Status | Meaning | Required evidence |
|---|---|---|
| **Suspected** | Inspection or reasoning indicates a possible failure. | The claim, source references, and a proposed reproduction. |
| **Reproduced** | The unfixed code demonstrated the failure. | A repeatable test or script, observed output, revision, and relevant environment. |
| **Verified fixed** | The same reproduction succeeds against the repair. | The unchanged reproduction and the run proving the corrected behavior in each claimed environment. |

A source-inspection finding begins as `suspected`, including a peer
reviewer's finding. A property established only by inspection is reported
as `suspected, confirmed by inspection`, with its citations; it is not
called reproduced. A passing functional test does not establish a resource
bound that it never measured.

When behavior differs by platform or environment, qualify status for each.
A repair that has not been exercised is described as `fix applied,
unverified`, alongside the last established finding status. Do not report
it as verified fixed.

A failed reproduction attempt stays in the record. Keep the finding
suspected, or explicitly withdraw it with the evidence and reason. Failure
to reproduce does not establish safety. State the status whenever the
finding is reported in a journal, PR, or conversation.

## Rule 6 — Budget and Completion

Perform one pass per selected guarantee per slice; repeat for guarantees
affected by later changes. Scale the number of guarantees and experiments
to the change and its consequences. Keep each selected guarantee's trace
deep enough to examine its dependencies. Do not replace that investigation
with a shallow checklist to meet a line count or time budget.

A plausible disclosure, write, execution, data-loss, or wrong-context
failure needs a deliberate reproduction attempt and before/after evidence
for its repair. Lower-impact concerns can remain suspected with a clear
note. If a trace cannot be completed within the available scope, record the
unresolved assumption and what would establish it; do not call that
guarantee verified.

Log the pass in the slice's research journal under the
[research policy](research.md). Record the guarantees, the important trace
references, short attack verdicts, findings with their statuses, and
remaining gaps. A PR summary links that record and states material findings
and unresolved verification.

Planted mistakes remain useful for checking the failures already imagined.
This pass actively searches for additional failure modes. When a later
review finds a flaw the pass should have caught, append the project's own
lesson with its date, provenance, evidence, and the question or tracing
habit it sharpens, following AGENTS.md §3.
