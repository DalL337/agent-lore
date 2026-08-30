# Git Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load when branching,
committing, pushing, or opening PRs.

## 1. Branch Lifecycle

Each coherent unit of work gets its own new branch, opened from the
default branch.

**A coherent unit of work is any one of:** a feature; a refactor or
migration; a chore (cleanup, test infrastructure, dependency updates, CI
fixes); a bug fix touching multiple files or areas; a documentation pass
beyond a single targeted edit.

1. **One unit, one branch.** Do not pile unrelated work onto an existing
   branch — even if it's still open, even if it isn't merged, even if the
   same area was touched recently. New work means a new branch.

2. **Branch from the default branch, not from another feature branch.**
   Branching off a feature branch inherits its unmerged commits, which
   corrupts the new branch's diff and creates merge-ordering hazards.

3. **Default interpretation rule.** When the owner says "branch, stage,
   commit, push" — or any equivalent for taking new work to the remote —
   the default is **always create a new branch off the default branch
   first**. Reusing an existing branch must be stated explicitly. If the
   current branch is anything other than the default and the owner has
   not explicitly said "use the current branch," **stop and ask** before
   staging.

4. **Merged-branch stance** *(adopt-time slot — the owner picks one and
   the choice is recorded here)*:
   - **Delete on merge** — reuse becomes physically impossible; the
     simplest guardrail.
   - **Retain after merge** — a merged branch stays addressable by name,
     but the guardrail deletion provided now has to stand as a rule: **a
     merged branch is CLOSED for new work.** The branch may still be
     checked out; nothing but this rule stops the next commit landing on
     it — and that commit becomes the orphan described below. Under
     retention, before staging anything, confirm the current branch has
     not already shipped (e.g.
     `gh pr list --state merged --head "$(git branch --show-current)"`).
     Any output means stop and branch off a freshly pulled default.

5. **Allowed reuse:** in-review PR feedback goes on the PR's branch;
   coherent multi-commit units per the bucketing rules; hotfixes to a
   release branch where the project has them.

**Why this rule exists:** without it, unrelated changesets accumulate on
one branch. When that branch's PR merges from a snapshot, commits pushed
after the snapshot become orphans that never reach the default branch —
silently breaking it when merged code references things that exist only
on the still-active feature branch. One unit per branch makes the class
structurally impossible.

## 2. Branch + PR vs Direct Push

1. **Branch + PR is required for risky changes:** runtime behavior or UX
   changes; anything under the source directories; build or app config
   that can affect shipped behavior; refactors, dependency updates,
   anything with regression risk; and enforcement code itself (guard and
   check scripts) — it is the floor everything else stands on.
2. **Direct push may be allowed for low-risk changes** — docs, plans, and
   notes only; non-behavioral metadata; the finalized release version
   bump — if the project permits it. When uncertain, branch + PR.
3. **Docs ride with their code.** A doc describing unmerged behavior
   belongs on that behavior's branch, not on the default branch.

## 3. Commit Bucketing

Group by intent: code changes separate from docs; docs and plans in their
own commit; release bumps in their own commit, last (see
`policies/release.md`).

## 4. Pre-Push Checklist

- Confirm branch context (`git branch --show-current`).
- Verify the branch is appropriate for this work — new unit means new
  branch (§1); under retention, verify it hasn't already shipped.
- Review staged files (`git status --short`).
- Ensure commit scope matches the file set — and after committing, read
  the files-changed count in the commit output
  (`policies/verification.md` Rule 3).
- Run the relevant checks for code changes (`policies/verification.md`).

## 5. Commit Identity

The repository has exactly one valid author/committer identity, pinned
per-clone in local git config — never recorded in these files, never
guessed, never copied from a session banner.

- **Verify before pushing, every clone, every time:**
  `git log -1 --format="%an <%ae>"`. Session banners, environment
  variables, and the platform's "current user" are not evidence of what
  git will stamp.
- **Never author with a personal email address.** Use the forge's noreply
  address so private contact details never enter commit metadata, message
  trailers, or file contents — check all three surfaces.
- **A misconfigured identity is not cosmetic.** A wrong author can
  attribute the codebase to an unrelated third party. Identity drift on a
  fresh clone is a blocking defect: fix config before the first commit.
- Wrong identity on work already committed: stop and surface it to the
  owner rather than pushing — the fix is a history rewrite, which is the
  owner's call.
