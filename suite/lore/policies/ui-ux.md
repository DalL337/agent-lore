# UI/UX Policy

Scoped agent-governance procedure (LORE.md §1/§2). Load when building or
changing a graphical user interface — screens, components, layout,
styling, motion, interaction — and when the owner reacts to one in
testing. Terminal and command-line output are out of scope. These are
starting principles; this project's own lessons accumulate here with
their provenance.

*(Added 2026-11-02, owner-directed: the interface starts from what the
project has installed and learns from the owner's reactions in testing,
successes as well as failures.)*

A project's interface taste is earned the way its other rules are: from
what the owner sees, tries, and reacts to. This policy keeps those
reactions where every agent can find them, not in one session's memory.

## Rule 1 — Start From What Is Installed

Before the first interface task, take inventory. The survey is an
investigation (`lore/policies/research.md`, journal-first).

1. **The UI stack** — component libraries, styling system, icon sets,
   fonts, animation libraries. The project's manifests and lockfiles say
   what is installed; the tooling register (`docs/TOOLING.md`), when one
   exists, says why.
2. **The patterns in use** — where the theme or design tokens live, the
   spacing and type scale, color, motion durations and easing, and how
   existing screens show empty, loading, and error states.
3. **Propose the inventory to the owner**, then record what the owner
   approves in the table below.

*(Adopt-time slot, filled at the first interface task.)* Point at the
files that own each answer; don't copy lists the manifests or token
files already hold (`lore/policies/documentation.md` Rule 3).

| Field | Record at the first interface task |
|---|---|
| Component library | The project's vocabulary of components, and its manifest entry. |
| Styling | The CSS framework or approach; where the theme or tokens live. |
| Icons and type | The icon set; font families and where they load. |
| Motion | The animation library or CSS approach; where durations and easing are set. |
| States | How existing screens show empty, loading, and error. |

A project with no UI stack yet chooses one under
`lore/policies/tooling.md`; the inventory starts from what that decision
installs.

## Rule 2 — Build With the Vocabulary

Reach for the installed components and the project's tokens before
writing new ones. Adapt a library component through its theming or
configuration rather than forking or re-implementing it. Adding,
replacing, or upgrading a UI library is a tooling decision
(`lore/policies/tooling.md`).

Where the owner's recorded feedback (Rule 4) or an earned rule conflicts
with a library default, the feedback wins, applied through the library's
own customization points.

## Rule 3 — See It Before Calling It Done

Type checks and tests do not show how an interface looks or feels.
Before reporting interface work done, run it and look: the changed
screens, at the sizes the project supports, through the states the
change touches (empty, loading, error, long content), and any motion it
adds.

When the agent cannot see the interface — no browser or screenshot
tooling in the session — say so, and ask the owner for a live pass
instead of reporting the work done. Give the owner a localhost URL to
open and say what to try.

## Rule 4 — Record the Owner's Reactions

When the owner reacts to the interface in testing, record it in the
feedback log, `.lore/ui-feedback.md`, in the same session. Successes
count as much as failures: "that feels right" is recorded with the
values that produced it, so the next agent can repeat it instead of
rediscovering it.

Each entry records the date, what was tested (screen, component, state,
and size), the owner's reaction in their words or a faithful paraphrase,
and the outcome with concrete values:

```markdown
## 2026-11-02 — settings drawer, open and close
- Tested: opening and closing the settings drawer at desktop width.
- Owner: open was right; close felt abrupt.
- Outcome: kept the open at 420ms ease-out; close changed 120ms → 220ms.
  The owner confirmed the change.
```

The log is private by default: `.lore/` stays out of git. When the owner
sanctions it public, move it to the committed home the owner names and
add a dated note here saying where it went.

Before interface work, read the earned rules below and the log entries
for the screens being touched.

## Rule 5 — From Reactions to Rules

A single reaction is an observation, not a rule. Draft a rule when a
pattern repeats across entries, or when the owner says it applies
generally ("always", "everywhere", "from now on"). Draft it below,
dated, citing the log entries it came from; the owner ratifies, amends,
or rejects it (LORE.md §3).

A rule carries concrete values and the context they were tested in, so
a later agent can tell whether it transfers. "Drawers open at 420ms
ease-out and close at 220ms (settings drawer, 2026-11-02)" can be argued
with; "keep motion smooth" cannot.

## Earned Rules

*(None yet. Rules drafted under Rule 5 go here, each dated and citing
its log entries.)*
