# Implementation Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load when writing or
changing code in any language. These are starting principles distilled
from real debugging sessions on the ancestor repository, provenance
stripped (AGENTS.md §3); they apply to any codebase with concurrency,
cross-platform targets, external side effects, or stateful UI. Your
project's own rules accumulate here, dated, with their incidents.

## Rule 1 — Effects Idempotent Under Re-Fire

Development modes of modern frameworks deliberately double-fire effects
and lifecycle hooks. Any effect that creates a backend resource — process
spawn, session start, socket open, database connection — must be
idempotent: guard with a started-flag, deduplicate the underlying promise
so a second call reuses the first, and return a cleanup that tears the
resource down. Assume every effect runs twice and design accordingly.
Corollary: state-updater functions must be pure — never perform side
effects inside one; dev modes double-fire those too.

## Rule 2 — Platform-Specific Code Isolation

Platform-dependent code lives behind real compile-time or runtime gates,
never inline in shared business logic. Use gates that actually exclude
the other platform's code from compilation where the language offers them
(a runtime `if` on the platform still compiles — and can still break —
every branch). Centralize platform checks in one module; ad-hoc platform
conditionals scattered through shared logic are the defect pattern.

## Rule 3 — Dev-Only Safety Nets Are Gated

Dev-mode workarounds — orphan-process cleanup, verbose logging, mock
fallbacks — must be gated so they cannot ship in production builds, and
must carry a comment saying why they exist so no future reader mistakes a
safety net for a feature.

## Rule 4 — Preserve Expensive Stateful Instances

Components with expensive internal state (terminal emulators, code
editors, video players, map views, 3D canvases) should be hidden and
shown by visibility toggling, not destroyed and recreated by conditional
rendering. Teardown-and-rebuild loses internal state and pays
initialization cost on every toggle. Know your framework's teardown
semantics and choose the mechanism that preserves the instance.

## Rule 5 — Dead Code Carries Its Reason

Zero-warning builds are the floor, but "unused" is a claim to verify, not
obey: a constant may be read textually by a script; an item may be
ratified-decision prep awaiting its consumer. Suppress warnings per-site
only, with a comment naming the future consumer; never blanket
suppressions. Remove the suppression when the consumer lands. Genuinely
dead code is deleted — version history remembers it.

## Rule 6 — Visual Changes Get Visual Verification

Any change whose acceptance criterion is "how it looks" — styling, canvas
drawing, layout, state/hover treatments — is verified by *looking at the
rendered output* before the PR, not shipped on geometry math. Build a
minimal repro of the real structure and styles, render it headlessly,
and read the screenshot: magnified to catch hairline features, and at 1×
because that is what the user sees. Faint and stateful styling especially:
screenshot the state, don't reason about it.

## Rule 7 — State Follows the Authoritative Side Effect

In any flow pairing an in-memory state mutation with a refusable external
operation (disk write, network call, database commit): run every check
that can refuse the operation *before* the state write — or run the
operation first and derive state from its result. Never commit state on
the assumption the operation will succeed; a refusal then leaves state
pointing at things that never materialized, and reconciliation has to
guess. The operation's result object is the authority; a discarded
success flag is a silent divergence waiting for its trigger. When
auditing, look for state mutations issued above the external call — that
ordering is the trap's signature.

## Rule 8 — Removal Refactors: Grep the Identifier Dead

After removing any identifier — parameter, export, prop, handler — grep
it repo-wide before calling the removal done: imports *and* bare uses. A
parameter list and the object literal that forwards it are separate
sites; assembler and binding layers that repackage values are the classic
repeat offenders. Bundlers can build free identifiers without complaint
and unit tests may never execute the render path, so every check can pass
while the app crashes live. If the lint chain has an undefined-reference
rule, keep it; until it does, the grep is mandatory.

## Rule 9 — Persistent State Is Born Sync-Ready

- New persistent entity types get a globally-unique identifier at birth —
  a UUID, never an autoincrement, rowid, timestamp, or process-local
  counter. Machine-local uniqueness collides the day replicas merge
  (multi-user sync, imports, cross-machine copies); retrofitting identity
  is a migration, preventing new instances is free.
- New persistent tables and columns declare, at creation, which side of a
  future sync line they live on — shared project truth vs
  per-user/per-machine. A one-line comment at the schema site suffices;
  the point is that the classification is decided at birth, not by
  archaeology later.
