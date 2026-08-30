# Release Policy

Scoped agent-governance procedure (AGENTS.md §1/§2). Load for release
work: version bumps, bundling, release builds.

## Rule 1 — The Version Lives in N Places; Enumerate Them

Every project carries its version string in more places than the obvious
manifest: package manifests, lockfiles (often more than once per file),
platform config, documentation banners. **On adoption, this policy's
first job is to enumerate every location** *(adopt-time slot)* — and to
keep the enumeration current, because a bump that follows a stale list
literally ships with locations stale.

```
# Fill in on adoption — every file carrying the version string, e.g.:
# package.json · package-lock.json (root AND packages[""]) ·
# platform config · Cargo.toml · Cargo.lock · docs banner
```

- Every bump updates **all locations in the same commit**.
- **The gate:** a repo-wide search for the OLD version string before
  committing — zero hits outside ignored directories.

## Rule 2 — Versioning Scheme

*(Adopt-time slot.)* The project declares its scheme here. Recommended
default: semver, valid for every packaging target the project ships to.
If the project uses a pre-release iteration suffix (`1.0.1-1`,
`1.0.1-2`, …), record here what the bare version is reserved for and who
decides when it's spent.

## Rule 3 — Sequence

Version bumps land **last**: merge code branches first, push docs and
plans, bump after the release scope is locked (`policies/git.md` §3).
Release bumps get their own commit.

## Rule 4 — Artifacts and Their Prerequisites

Enumerate here, on adoption: pre-release staging steps (bundled runtimes,
sidecars, assets), the exact release build command, and any artifacts
that must be archived per released version (e.g. sourcemaps or debug
symbols that crash reporting depends on for symbolication). A release
whose symbols weren't archived is a release whose crash reports can't be
read.

## Rule 5 — Verify the Release Artifact Is a Release Artifact

Dev-mode configuration leaks into release builds — dev-server URLs,
debug endpoints, unminified bundles — and the resulting binary looks
built while being broken standalone. The release artifact is verified by
**running it in isolation from the dev environment** before it ships. If
the project's toolchain has a known wrong-command trap (a plain release
compile that still targets the dev server), name the correct command
here the first time it burns a session.
