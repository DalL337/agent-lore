// `lore init`, `sync`, `check`, `update`, `worktree`: install LORE into a
// repository and keep the files it generates current
// (docs/plans/lore-init.md). `lore uninstall` is in uninstall.ts.
//
// Every change is planned first, as data, then applied; --dry-run and
// `lore check` read the same plan without writing. Nothing committed is
// ever modified: LORE's own files go in lore/ (copied once, then the
// owner's to adapt), the agents reach lore/LORE.md through files LORE
// generates or through marked blocks in personal files, and the ignore
// rules go in .git/info/exclude, so `git status` stays clean.
//
// How each agent is wired (ruling D1):
//   Codex, and any tool that reads AGENTS.md
//     an AGENTS.override.md of the owner's  → a marked LORE block in it
//                                             (Codex reads it instead of AGENTS.md)
//     the project has an AGENTS.md          → AGENTS.override.md, generated: the
//                                             project's AGENTS.md, then LORE
//     neither                               → AGENTS.md, generated from lore/LORE.md
//   Claude Code
//     no CLAUDE.md, CLAUDE.local.md, or     → CLAUDE.md, generated: @lore/LORE.md
//     project AGENTS.md
//     otherwise                             → a marked block in CLAUDE.local.md:
//                                             @lore/LORE.md, and @AGENTS.md when the
//                                             project relies on Claude reading its
//                                             AGENTS.md (which any CLAUDE file stops)
//
// A file counts as LORE's ("ours") when it starts with LORE's header and git
// does not track it. Ours are regenerated, and removed when no longer needed;
// anything else is the owner's and is only ever given a marked block.
//
// Given the package it runs from, init also fills .lore/: a copy of that
// package in .lore/runtime/ (so hooks work with no global install and no
// network), the .lore/lore.mjs launcher the hooks call, .lore/hud for the
// owner, and config.json with the agents it wired. Each wired agent gets a
// session hook (agents.ts) that prints the board brief, starts the HUD and
// keeps these files current. A JSON file of the owner's that LORE merges
// into is kept as it was in .lore/originals/, for `lore uninstall`.
//
// Linked worktrees (2026-10-18, superseding the links of ruling D2): a
// worktree gets no link into the main checkout, because on Windows
// `git worktree remove` follows a directory junction and deletes what it
// points at. Each worktree gets generated files that point there instead:
// lore/LORE.md, a copy whose lore/, .lore/ and .research/ paths are the main
// checkout's, absolute; its own instruction files, built from that copy and
// the worktree's branch; and hooks that run the main checkout's launcher.
// Removing a worktree removes only those. A post-checkout git hook (in
// .git/hooks, never committed; a marked block in the owner's own hook) sets
// up each new worktree as git creates it.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENT_IDS, claudeHooks, codexHooks, hasLoreHooks, isAgentId, mainDirectories, mergeDirectories, mergeHooks, type AgentId, type HookEvents } from './agents.ts';
import { git, mainWorktree } from './config.ts';

export interface InitOptions {
  /** Where the command was run; LORE installs at the main checkout's root. */
  cwd: string;
  /** The suite's lore/ folder, shipped with the package. */
  suiteDir: string;
  /**
   * Share LORE through the repository: lore/ stays trackable and the rules
   * go in .gitignore too. Once chosen it sticks: a later run without the
   * flag keeps sharing.
   */
  commit?: boolean;
  /** `lore sync`: regenerate only; requires an installed lore/ and copies nothing. */
  sync?: boolean;
  /**
   * The LORE package running this (holding bin/, suite/ and hud/dist/):
   * copied to .lore/runtime/, with the launchers and the worktree git hook.
   * Without it, those are left alone.
   */
  packageDir?: string;
  /** Agents to wire, added to those config.json lists. Without it, the ones config.json lists. */
  agents?: AgentId[];
  /** The default agent (the one the hand-off opens), recorded in config.json. */
  defaultAgent?: AgentId;
  /** Claude's memory folder, once seeded (`lore memory seed`): turns on the memory guard hook. */
  claudeMemory?: string;
}

export type ChangeKind = 'create' | 'update' | 'remove' | 'unchanged' | 'skipped';

export interface Change {
  /** Path relative to the plan's root, with forward slashes. */
  path: string;
  kind: ChangeKind;
  why: string;
  /** New content, for create and update. */
  content?: string | Buffer;
  /** Shown as one line with the other changes in its group (a copied folder). */
  group?: string;
  /** File mode, for launchers and hooks (ignored on Windows). */
  mode?: number;
}

export interface InitPlan {
  /** The checkout this plan writes in: the main checkout, or a linked worktree. */
  root: string;
  /** The main checkout, where LORE itself lives. */
  main: string;
  /** This plan sets up a linked worktree. */
  worktree: boolean;
  /** Said once, before the changes: where LORE is going, if not where it was run. */
  notes: string[];
  warnings: string[];
  /** lore/LORE.md was already there: nothing in lore/ is touched. */
  installed: boolean;
  sync: boolean;
  /** LORE is shared through the repository: its rules are in .gitignore too, and lore/ is trackable. */
  commit: boolean;
  /** Paths in this checkout that LORE generates or keeps a block in (ignored with LORE). */
  managed: string[];
  changes: Change[];
  /** The agents wired, as config.json will list them. */
  agents: AgentId[];
  /** What only the owner can do, said after the changes (trusting a Codex hook). */
  next: string[];
  /** LORE's version in .lore/runtime/ once applied; null without a runtime. */
  runtime: string | null;
  /** Folders to remove once the plan has emptied them (uninstall). */
  prune: string[];
  /** What uninstall leaves, because it is the owner's. */
  kept: string[];
}

export class InitError extends Error {}

export const HEADER = '<!-- Generated by LORE';
export const MD_BEGIN = '<!-- lore:begin (managed by lore; edit lore/LORE.md instead) -->';
export const MD_END = '<!-- lore:end -->';
export const IGNORE_BEGIN = '# >>> LORE (managed by lore init; `lore uninstall` removes this block)';
export const IGNORE_END = '# <<< LORE';
export const HOOK_BEGIN = '# >>> LORE (lore init: each new worktree gets LORE; `lore uninstall` removes this block)';
export const HOOK_END = '# <<< LORE';
export const CODEX_DESCRIPTION = 'LORE: the board brief and HUD at session start (lore init). `lore sync` regenerates the LORE entry.';
/** The files LORE may generate, or keep a block or its hooks in, in any checkout. */
export const AGENT_FILES = ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.local.md', '.claude/settings.local.json', '.codex/hooks.json'];
/** JSON files of the owner's that LORE merges into, kept as they were for uninstall. */
export const ORIGINALS = '.lore/originals/';
/** Codex reads 32 KiB of instructions; LORE keeps 2 KiB of room (lore/scripts/agents-md-budget.mjs). */
const CODEX_BUDGET = 30 * 1024;

export const slash = (p: string) => p.split(path.sep).join('/');
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export interface FileState {
  exists: boolean;
  tracked: boolean;
  /** LORE's: generated (it starts with LORE's header) and not tracked. */
  ours: boolean;
  text: string | null;
}

export function fileState(root: string, rel: string): FileState {
  const text = readText(path.join(root, rel));
  const tracked = text !== null && git(root, ['ls-files', '--error-unmatch', '--', rel]) !== null;
  return { exists: text !== null, tracked, ours: !tracked && (text?.startsWith(HEADER) ?? false), text };
}

/** Does an untracked file in that checkout carry LORE: generated by it, or holding its block or hooks? */
export function marked(root: string, rel: string): boolean {
  const state = fileState(root, rel);
  if (!state.exists || state.tracked) return false;
  return state.ours || state.text!.includes(MD_BEGIN) || hasLoreHooks(state.text);
}

const LINK = /\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi;

/** Relative Markdown links in LORE.md point beside it; at the repository root they need lore/ in front. */
export function rebaseLinks(markdown: string): string {
  return markdown.replace(LINK, '](lore/$1)');
}

/**
 * LORE.md for a linked worktree: a note saying where LORE lives, then the
 * text with its links and its lore/, .lore/ and .research/ paths made
 * absolute to the main checkout.
 */
export function worktreeLore(main: string, markdown: string): string {
  const m = slash(path.resolve(main));
  const body = markdown
    .replace(LINK, (_all, rel: string) => `](${m}/lore/${rel})`)
    .replace(/(^|[\s`'"(\[])lore\//g, (_all, pre: string) => `${pre}${m}/lore/`)
    .replace(/(^|[\s`'"(\[])\.(lore|research)\//g, (_all, pre: string, name: string) => `${pre}${m}/.${name}/`);
  const note =
    `> **Linked worktree of \`${m}\`.** LORE lives only in the main checkout: its policies, scripts and ` +
    `memory template in \`${m}/lore/\`, the board in \`${m}/.lore/board.json\`, journals in \`${m}/.research/\`. ` +
    `The paths below point there. Read and edit LORE there, never in this worktree, whose \`lore/\` holds only a generated copy of this file.`;
  return `${note}\n\n${body}`;
}

function findBlock(text: string, begin: string, end: string): [number, number] | null {
  const start = text.indexOf(begin);
  const stop = start >= 0 ? text.indexOf(end, start) : -1;
  return start >= 0 && stop >= 0 ? [start, stop + end.length] : null;
}

/** `text` with the marked block replaced, or appended after a blank line. */
export function upsertBlock(text: string | null, begin: string, end: string, body: string): string {
  const block = `${begin}\n${body.trimEnd()}\n${end}\n`;
  const current = text ?? '';
  const at = findBlock(current, begin, end);
  if (at) return current.slice(0, at[0]) + block + current.slice(at[1]).replace(/^\r?\n/, '');
  if (!current.trim()) return block;
  return `${current}${current.endsWith('\n') ? '' : '\n'}\n${block}`;
}

/** `text` without the marked block: exactly the text it was added to, when it was added at the end. */
export function removeBlock(text: string, begin: string, end: string): string {
  const at = findBlock(text, begin, end);
  if (!at) return text;
  const before = text.slice(0, at[0]);
  const after = text.slice(at[1]).replace(/^\r?\n/, '');
  // At the end, the blank line before the block was LORE's too: the one "\n" upsertBlock added.
  return after ? before + after : /\r?\n\n$/.test(before) ? before.slice(0, -1) : before;
}

/** The owner's own text in a file LORE keeps a block in. */
const ownText = (text: string | null) => {
  if (!text) return '';
  const at = findBlock(text, MD_BEGIN, MD_END);
  return at ? text.slice(0, at[0]) + text.slice(at[1]) : text;
};

export function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(slash(path.relative(base, full)));
  }
  return out;
}

/** Where a command was run (that checkout's root) and the main checkout. */
export function locate(cwd: string): { here: string; main: string } {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) {
    throw new InitError('not a git repository. Run `git init` first, or try the HUD without installing anything: `lore hud --data <folder>`.');
  }
  const here = path.resolve(top);
  return { here, main: path.resolve(mainWorktree(here)) };
}

/** Every checkout of the repository that exists, the main one first. */
export function checkouts(main: string): string[] {
  const listed = (git(main, ['worktree', 'list', '--porcelain']) ?? '')
    .split(/\r?\n\r?\n/)
    .filter((block) => !/^bare$/m.test(block))
    .map((block) => /^worktree (.+)$/m.exec(block)?.[1])
    .filter((dir): dir is string => Boolean(dir))
    .map((dir) => path.resolve(dir))
    .filter((dir) => existsSync(dir));
  const first = path.resolve(main);
  return [first, ...listed.filter((dir) => dir !== first)];
}

/** Is LORE shared through the repository (its block is in the main checkout's .gitignore)? */
const sharedMode = (main: string) => readText(path.join(main, '.gitignore'))?.includes(IGNORE_BEGIN) ?? false;

// ── Planning ──────────────────────────────────────────────────────────

export interface Planner {
  root: string;
  main: string;
  changes: Change[];
  warnings: string[];
  next: string[];
  managed: Set<string>;
  /** Plan a generated file (or a file with LORE's block); `ignore: false` when an existing rule covers it. */
  put(rel: string, content: string | Buffer, why: string, extra?: { ignore?: boolean; mode?: number; group?: string }): ChangeKind;
  drop(rel: string, why: string, group?: string): void;
}

export function planner(root: string, main: string): Planner {
  const p: Planner = {
    root,
    main,
    changes: [],
    warnings: [],
    next: [],
    managed: new Set(),
    put(rel, content, why, extra = {}) {
      const file = path.join(root, rel);
      const current = existsSync(file) ? readFileSync(file) : null;
      const next = typeof content === 'string' ? Buffer.from(content) : content;
      const kind: ChangeKind = current === null ? 'create' : current.equals(next) ? 'unchanged' : 'update';
      p.changes.push({ path: rel, kind, why, content, mode: extra.mode, group: extra.group });
      if (extra.ignore !== false) p.managed.add(rel);
      return kind;
    },
    drop(rel, why, group) {
      p.changes.push({ path: rel, kind: 'remove', why, group });
    },
  };
  return p;
}

/** What copying the suite into lore/ takes: the missing files, LORE.md last so its presence means a complete copy. */
function planCopy(p: Planner, suiteDir: string) {
  const loreDir = path.join(p.root, 'lore');
  const suite = walk(suiteDir).sort((a, b) => Number(a === 'LORE.md') - Number(b === 'LORE.md'));
  if (existsSync(loreDir) && !statSync(loreDir).isDirectory()) {
    throw new InitError('lore is a file here; LORE installs into a lore/ folder. Rename it, then run `lore init` again.');
  }
  // A lore/ folder without LORE.md is either an interrupted copy (only suite
  // files, unchanged) or a folder of the owner's that LORE must not mix into.
  const existing = existsSync(loreDir) ? walk(loreDir) : [];
  const foreign = existing.find((rel) => !suite.includes(rel) || !readFileSync(path.join(loreDir, rel)).equals(readFileSync(path.join(suiteDir, rel))));
  if (foreign) {
    throw new InitError(`lore/ already exists and is not LORE's (it holds lore/${foreign}). LORE installs into lore/: rename that folder, then run \`lore init\` again.`);
  }
  for (const rel of suite.filter((r) => !existing.includes(r))) {
    p.put(`lore/${rel}`, readFileSync(path.join(suiteDir, rel)), 'LORE.md, policies, guard scripts, memory template', { ignore: false, group: 'lore/' });
  }
}

/** The agents' instruction files in a checkout, carrying `loreMd` (LORE as read from that checkout's root). */
function planInstructions(p: Planner, loreMd: string) {
  const agents = fileState(p.root, 'AGENTS.md');
  const override = fileState(p.root, 'AGENTS.override.md');
  const claude = fileState(p.root, 'CLAUDE.md');
  const claudeDir = fileState(p.root, '.claude/CLAUDE.md');
  const claudeLocal = fileState(p.root, 'CLAUDE.local.md');
  const projectAgents = agents.exists && !agents.ours;
  const projectClaude = (claude.exists && !claude.ours) || claudeDir.exists;

  // Codex, and any tool that reads AGENTS.md.
  if (override.exists && !override.ours) {
    if (agents.ours) p.drop('AGENTS.md', 'generated earlier; Codex reads your AGENTS.override.md instead');
    if (override.tracked) {
      p.warnings.push('Codex: your AGENTS.override.md is committed, and Codex reads it instead of AGENTS.md, so LORE cannot reach Codex without changing it. Add the contents of lore/LORE.md to it by hand.');
      p.changes.push({ path: 'AGENTS.override.md', kind: 'skipped', why: 'committed (see below)' });
    } else {
      p.put('AGENTS.override.md', upsertBlock(override.text, MD_BEGIN, MD_END, loreMd), 'LORE block in your AGENTS.override.md, for Codex');
    }
  } else if (projectAgents) {
    p.put(
      'AGENTS.override.md',
      `${HEADER}: this repository's AGENTS.md, then lore/LORE.md. Codex reads this file instead of AGENTS.md. Edit those two, not this one; \`lore sync\` regenerates it. -->\n\n${agents.text!.trimEnd()}\n\n---\n\n${loreMd}`,
      'your AGENTS.md + LORE, for Codex (AGENTS.md itself is untouched)',
    );
  } else {
    p.put(
      'AGENTS.md',
      `${HEADER} from lore/LORE.md for agents that read AGENTS.md (Codex and others). Edit lore/LORE.md, not this file; \`lore sync\` regenerates it. -->\n\n${loreMd}`,
      'LORE for Codex and other AGENTS.md readers',
    );
    if (override.ours) p.drop('AGENTS.override.md', 'generated earlier; this repository no longer has an AGENTS.md of its own');
  }

  // Claude Code.
  if (!projectClaude && !claudeLocal.exists && !projectAgents) {
    p.put(
      'CLAUDE.md',
      `${HEADER}. Claude Code reads LORE through the import below. Edit lore/LORE.md, not this file; \`lore sync\` regenerates it. -->\n\n@lore/LORE.md\n`,
      'imports lore/LORE.md for Claude Code',
    );
  } else {
    if (claude.ours) p.drop('CLAUDE.md', 'generated earlier; LORE now reaches Claude Code through CLAUDE.local.md');
    if (claudeLocal.tracked) {
      const imported = /^\s*@\.?\/?lore\/LORE\.md\s*$/m.test(claudeLocal.text!);
      if (!imported) p.warnings.push('Claude Code: your CLAUDE.local.md is committed, so LORE cannot add its import without changing it. Add the line `@lore/LORE.md` to it by hand.');
      p.changes.push({ path: 'CLAUDE.local.md', kind: 'skipped', why: imported ? 'committed; it already imports @lore/LORE.md' : 'committed (see below)' });
    } else {
      // Claude reads a project's AGENTS.md only while no CLAUDE file exists;
      // this block creates one, so it brings AGENTS.md along.
      const withAgents = projectAgents && !projectClaude && !/^\s*@\.?\/?AGENTS\.md\s*$/m.test(ownText(claudeLocal.text));
      p.put(
        'CLAUDE.local.md',
        upsertBlock(claudeLocal.text, MD_BEGIN, MD_END, `${withAgents ? '@AGENTS.md\n' : ''}@lore/LORE.md`),
        projectClaude
          ? 'imports lore/LORE.md for Claude Code (your CLAUDE.md is untouched)'
          : withAgents
            ? 'imports your AGENTS.md and lore/LORE.md for Claude Code'
            : 'imports lore/LORE.md for Claude Code',
      );
    }
  }
}

// ── .lore/: settings, the runtime and its launchers ──────────────────────

/** What a runtime copy holds: the package's published files. */
const RUNTIME_PARTS = ['package.json', 'bin', 'suite', 'hud/dist'];
const RUNTIME = '.lore/runtime/';

export function packageVersion(dir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/** Is version a later than b? (major.minor.patch; a pre-release tag is ignored) */
export function newer(a: string, b: string): boolean {
  const parts = (v: string) => v.split('-')[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/**
 * Bring .lore/runtime/ level with the package: copy what differs, remove
 * what the package no longer has (built files carry hashes in their names).
 * bin/lore.mjs goes last, so the launcher only finds a complete copy. A
 * newer runtime is kept; so is the runtime when this is it.
 */
function planRuntime(p: Planner, packageDir: string): string | null {
  const target = path.join(p.root, '.lore', 'runtime');
  const version = packageVersion(packageDir);
  if (path.resolve(packageDir) === path.resolve(target)) return version;
  const installed = packageVersion(target);
  if (installed && version && newer(installed, version)) {
    p.warnings.push(`.lore/runtime/ is LORE ${installed}, newer than this LORE ${version}: kept as it is. Run the newer \`lore\` to change it.`);
    return installed;
  }
  const source = RUNTIME_PARTS.flatMap((part) => {
    const full = path.join(packageDir, part);
    if (!existsSync(full)) return [];
    return statSync(full).isDirectory() ? walk(full).map((rel) => `${part}/${rel}`) : [part];
  }).sort((a, b) => Number(a === 'bin/lore.mjs') - Number(b === 'bin/lore.mjs'));
  const why = `${version ? `LORE ${version}` : 'LORE'}, which the hooks and launchers run`;
  for (const rel of source) p.put(`${RUNTIME}${rel}`, readFileSync(path.join(packageDir, rel)), why, { ignore: false, group: RUNTIME });
  const stale = existsSync(target) ? walk(target).filter((rel) => !source.includes(rel)) : [];
  for (const rel of stale) p.drop(`${RUNTIME}${rel}`, why, RUNTIME);
  return version;
}

/**
 * .lore/lore.mjs: how hooks and launchers run LORE in this repository.
 * Tries a "runtime" folder named in config.json, then .lore/runtime/, then
 * a global install, then npx, pinned to the version that wrote it.
 */
export function launcherScript(version: string | null): string {
  const spec = `@dall337/lore${version ? `@${version}` : ''}`;
  return `#!/usr/bin/env node
// Generated by LORE: runs LORE's command line for this repository. Edit
// nothing here; \`lore sync\` regenerates it. In order, it runs a "runtime"
// folder named in .lore/config.json (a LORE checkout or package), the copy
// in .lore/runtime/, a global \`lore\`, or npx ${spec}.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const win = process.platform === 'win32';
const binIn = (dir) => (dir && existsSync(path.join(dir, 'bin', 'lore.mjs')) ? path.join(dir, 'bin', 'lore.mjs') : null);

function configured() {
  try {
    const { runtime } = JSON.parse(readFileSync(path.join(here, 'config.json'), 'utf8').replace(/^\\uFEFF/, ''));
    return typeof runtime === 'string' && runtime.trim() ? path.resolve(here, '..', runtime.trim()) : null;
  } catch {
    return null;
  }
}

function globalInstall() {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const shim = path.join(dir, win ? 'lore.cmd' : 'lore');
    if (!existsSync(shim)) continue;
    if (win) return binIn(path.join(dir, 'node_modules', '@dall337', 'lore'));
    try {
      const real = realpathSync(shim);
      if (real.endsWith('lore.mjs')) return real;
    } catch {}
  }
  return null;
}

const found = binIn(configured()) ?? binIn(path.join(here, 'runtime')) ?? globalInstall();
if (found) {
  await import(pathToFileURL(found).href);
} else {
  const args = ['--yes', '${spec}', ...process.argv.slice(2)];
  const run = win
    ? spawnSync(['npx', ...args].map((a) => \`"\${a.replace(/"/g, '""')}"\`).join(' '), { stdio: 'inherit', shell: true })
    : spawnSync('npx', args, { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
`;
}

const HUD_SH = `#!/bin/sh
# Generated by LORE: opens this repository's HUD. \`lore sync\` regenerates it.
here="$(dirname "$0")"
exec node "$here/lore.mjs" hud --repo "$here/.." "$@"
`;

const HUD_CMD = [
  '@echo off',
  "rem Generated by LORE: opens this repository's HUD. `lore sync` regenerates it.",
  'node "%~dp0lore.mjs" hud --repo "%~dp0.." %*',
  '',
].join('\r\n');

export function readConfig(main: string): { text: string | null; config: Record<string, unknown> } {
  const text = readText(path.join(main, '.lore', 'config.json'));
  if (text === null || !text.trim()) return { text, config: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new InitError(`.lore/config.json is not valid JSON (${(err as Error).message}): fix it, then run this again.`);
  }
  if (!isObject(parsed)) throw new InitError('.lore/config.json is not a JSON object: fix it, then run this again.');
  return { text, config: parsed };
}

/** The keys LORE writes in config.json; the rest are the owner's. */
export const CONFIG_KEYS = ['agents', 'agent', 'autostart', 'memory'];

/** The agents config.json lists, plus those asked for; and Claude's seeded memory folder. */
function agentsOf(config: Record<string, unknown>, options: Pick<InitOptions, 'agents' | 'claudeMemory'>) {
  const listed = Array.isArray(config.agents) ? config.agents.filter(isAgentId) : [];
  const wired = AGENT_IDS.filter((id) => listed.includes(id) || (options.agents ?? []).includes(id));
  const memory = isObject(config.memory) ? config.memory : {};
  const claudeMemory = options.claudeMemory ?? (typeof memory.claude === 'string' ? memory.claude : undefined);
  return { wired, memory, claudeMemory };
}

/** Before LORE first merges into an owner's JSON file (main checkout only), keep it as it was. */
function keepOriginal(p: Planner, rel: string, text: string | null, untouched: boolean) {
  if (p.root !== p.main || text === null || !untouched || existsSync(path.join(p.main, ORIGINALS, rel))) return;
  p.put(`${ORIGINALS}${rel}`, text, 'your files as they were before LORE merged into them, for `lore uninstall`', { ignore: false, group: ORIGINALS });
}

// ── Hooks ─────────────────────────────────────────────────────────────

/** Each wired agent's session hook (and Claude's memory guard), merged into its settings file in this checkout. */
function planHooks(p: Planner, wired: AgentId[], claudeMemory: string | undefined, worktree: boolean) {
  const ours = mainDirectories(p.main);
  const settings = (rel: string, hooks: HookEvents | null, dirs: string[], why: string, create: Record<string, unknown> = {}) => {
    const state = fileState(p.root, rel);
    if (!hooks && !hasLoreHooks(state.text)) return false;
    if (state.tracked) {
      if (hooks) p.warnings.push(`${rel} is committed, so LORE cannot add its session hook without changing it: the agent still reads LORE, but starts without the board brief.`);
      p.changes.push({ path: rel, kind: 'skipped', why: 'committed (see below)' });
      return false;
    }
    let merged = mergeHooks(state.text, hooks ?? {}, create);
    if (merged.error === undefined) merged = mergeDirectories(merged.text, hooks ? dirs : [], ours);
    if (merged.error !== undefined) {
      p.warnings.push(`${rel} is ${merged.error}, so LORE left it alone. Fix it, then run \`lore sync\`.`);
      p.changes.push({ path: rel, kind: 'skipped', why: 'not valid JSON (see below)' });
      return false;
    }
    keepOriginal(p, rel, state.text, !hasLoreHooks(state.text));
    return p.put(rel, merged.text, why) !== 'unchanged';
  };
  settings(
    '.claude/settings.local.json',
    wired.includes('claude') ? claudeHooks(claudeMemory !== undefined, worktree ? p.main : undefined) : null,
    worktree ? ours : [],
    `Claude Code hooks: the board brief and HUD at session start${claudeMemory !== undefined ? ', and the memory guard' : ''}` +
      (worktree ? '; access to LORE in the main checkout' : ''),
  );
  const codex = settings('.codex/hooks.json', wired.includes('codex') ? codexHooks(p.main) : null, [], 'Codex hook: the board brief and HUD at session start', {
    description: CODEX_DESCRIPTION,
  });
  if (codex && wired.includes('codex')) {
    p.next.push(
      `Codex runs project hooks only once you trust them: open Codex in ${worktree ? 'this worktree' : 'this repository'}, trust the folder if it asks, then run /hooks and trust LORE’s session hook. It asks again whenever the hook changes.`,
    );
  }
}

/** What LORE's block in a post-checkout hook runs: set up the worktree git just made (or refresh it after a checkout). */
export function gitHookLine(main: string): string {
  const launcher = `${slash(path.resolve(main))}/.lore/lore.mjs`;
  return `if command -v node >/dev/null 2>&1; then node "${launcher}" worktree --hook "$@" || true; fi`;
}

/**
 * The post-checkout git hook that gives new worktrees LORE: a file of
 * LORE's own, or a marked block just after the shebang of the owner's.
 * Hooks in a folder of their own (core.hooksPath, as husky sets it) are left
 * alone: they are per worktree, or shared with other repositories.
 */
function planGitHook(p: Planner) {
  const hooks = git(p.main, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  const common = git(p.main, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!hooks || !common) return;
  if (path.resolve(hooks) !== path.resolve(common, 'hooks')) {
    p.warnings.push(
      `Worktrees: your git hooks live in ${slash(hooks)} (core.hooksPath, as husky sets it), where LORE does not write, so a new worktree doesn't get LORE as git creates it. A session in the main checkout, \`lore sync\`, or \`node .lore/lore.mjs worktree\` run in the worktree sets it up.`,
    );
    return;
  }
  const file = path.join(hooks, 'post-checkout');
  const rel = slash(path.relative(p.root, file));
  const line = gitHookLine(p.main);
  const block = `${HOOK_BEGIN}\n${line}\n${HOOK_END}\n`;
  const text = readText(file);
  const why = 'git hook: each new worktree gets LORE';
  // Git skips a hook that isn't executable (Git for Windows doesn't check).
  // An owner's hook stays as they set it: making it executable would turn
  // their disabled script back on.
  const runs = process.platform === 'win32' || text === null || (statSync(file).mode & 0o111) !== 0;
  const notRun = `Worktrees: your ${rel} isn't executable, so git skips it and a block of LORE's in it wouldn't run. To give new worktrees LORE as git creates them, make it executable (chmod +x) and run \`lore sync\`; until then a session in the main checkout, \`lore sync\`, or \`node .lore/lore.mjs worktree\` run in the worktree sets it up.`;
  if (text === null) {
    p.put(rel, `#!/bin/sh\n${block}`, why, { ignore: false, mode: 0o755 });
  } else if (findBlock(text, HOOK_BEGIN, HOOK_END)) {
    const alone = /^(#![^\n]*)?\s*$/.test(removeBlock(text, HOOK_BEGIN, HOOK_END));
    if (!alone && !runs) p.warnings.push(notRun);
    p.put(rel, upsertBlock(text, HOOK_BEGIN, HOOK_END, line), why, { ignore: false, mode: alone ? 0o755 : undefined });
  } else if (/^#!.*\b(sh|bash|dash|zsh)\b/.test(text.split('\n', 1)[0]) && !runs) {
    p.warnings.push(notRun);
    p.changes.push({ path: rel, kind: 'skipped', why: 'not executable (see below)' });
  } else if (/^#!.*\b(sh|bash|dash|zsh)\b/.test(text.split('\n', 1)[0])) {
    const cut = text.indexOf('\n') + 1 || text.length;
    p.put(rel, `${text.slice(0, cut)}${cut === text.length && !text.endsWith('\n') ? '\n' : ''}${block}${text.slice(cut)}`, 'LORE block in your post-checkout hook: each new worktree gets LORE', { ignore: false });
  } else {
    p.warnings.push(`Worktrees: your ${rel} is not a shell script, so LORE cannot add to it. To give new worktrees LORE, have it run: node "${slash(path.resolve(p.main))}/.lore/lore.mjs" worktree --hook <its three arguments>`);
    p.changes.push({ path: rel, kind: 'skipped', why: 'not a shell script (see below)' });
  }
}

// ── Ignore rules, and the Codex budget ──────────────────────────────────

/**
 * The rules that keep LORE out of git, in .git/info/exclude, which every
 * checkout shares: so they cover what LORE generates in all of them. When
 * LORE is shared through the repository, the main checkout's .gitignore
 * carries them too (without /lore/).
 */
function planIgnore(p: Planner, commit: boolean) {
  const files = new Set(p.managed);
  for (const dir of checkouts(p.main)) {
    if (dir === path.resolve(p.root)) continue;
    for (const rel of AGENT_FILES) if (marked(dir, rel)) files.add(rel);
  }
  const rules = [...(commit ? [] : ['/lore/']), '/.lore/', '/.research/', ...[...files].sort().map((f) => `/${f}`)].join('\n');
  const common = git(p.root, ['rev-parse', '--path-format=absolute', '--git-common-dir']) ?? path.join(p.main, '.git');
  const exclude = path.join(common, 'info', 'exclude');
  p.put(slash(path.relative(p.root, exclude)), upsertBlock(readText(exclude), IGNORE_BEGIN, IGNORE_END, rules), 'keeps LORE out of git in every checkout (local; never committed)', {
    ignore: false,
  });
  if (commit && p.root === p.main) {
    p.put('.gitignore', upsertBlock(readText(path.join(p.main, '.gitignore')), IGNORE_BEGIN, IGNORE_END, rules), 'shared: the board, journals and generated files stay private; lore/ is yours to commit', {
      ignore: false,
    });
  }
}

function planBudget(p: Planner) {
  const codex = p.changes.find((c) => c.content !== undefined && (c.path === 'AGENTS.override.md' || c.path === 'AGENTS.md'));
  const size = codex?.content === undefined ? 0 : Buffer.byteLength(codex.content);
  if (codex && size > CODEX_BUDGET) {
    p.warnings.push(
      `Codex: ${codex.path} comes to ${(size / 1024).toFixed(1)} KiB and Codex stops reading at 32 KiB, so the end of LORE would be cut off. Move detail out of AGENTS.md or lore/LORE.md into linked files (lore/LORE.md §3).`,
    );
  }
}

export function finish(p: Planner, rest: Pick<InitPlan, 'worktree' | 'notes' | 'installed' | 'sync' | 'commit' | 'agents' | 'runtime'>): InitPlan {
  return { root: p.root, main: p.main, warnings: p.warnings, managed: [...p.managed].sort(), changes: p.changes, next: p.next, prune: [], kept: [], ...rest };
}

/** The main checkout: LORE itself, its settings and runtime, the agents' files and hooks, the ignore rules. */
export function planInit(options: InitOptions): InitPlan {
  const { here, main } = locate(options.cwd);
  const notes: string[] = [];
  if (here !== main) notes.push(`this is a linked worktree: LORE goes in the main checkout, ${slash(main)}`);
  else if (path.resolve(options.cwd) !== here) notes.push(`working at the repository root, ${slash(here)}`);
  const p = planner(main, main);

  // 1. LORE itself: copied once, then the owner's to adapt.
  const installed = existsSync(path.join(main, 'lore', 'LORE.md'));
  const sync = options.sync ?? false;
  if (sync && !installed) throw new InitError('lore/LORE.md not found: run `lore init` first.');
  if (!installed) planCopy(p, options.suiteDir);
  const loreMd = rebaseLinks(readText(path.join(main, 'lore', 'LORE.md')) ?? readFileSync(path.join(options.suiteDir, 'LORE.md'), 'utf8'));

  // 2. The agents' instruction files.
  planInstructions(p, loreMd);

  // 3. .lore/: settings, and the runtime the hooks and launchers run.
  const { text: configText, config } = readConfig(main);
  const { wired, memory, claudeMemory } = agentsOf(config, options);
  if (options.agents || options.defaultAgent || options.claudeMemory || options.packageDir) {
    const settings: Record<string, unknown> = { ...config };
    if (options.agents) settings.agents = wired;
    if (options.defaultAgent) settings.agent = options.defaultAgent;
    if (options.claudeMemory) settings.memory = { ...memory, claude: options.claudeMemory };
    if (!('autostart' in settings)) settings.autostart = true;
    const same = configText !== null && JSON.stringify(settings) === JSON.stringify(config);
    keepOriginal(p, '.lore/config.json', configText, !CONFIG_KEYS.some((k) => k in config));
    p.put('.lore/config.json', same ? configText : `${JSON.stringify(settings, null, 2)}\n`, 'settings: the agents LORE wired, and HUD autostart', { ignore: false });
  }
  let runtime: string | null = null;
  if (options.packageDir) {
    runtime = planRuntime(p, options.packageDir);
    p.put('.lore/lore.mjs', launcherScript(runtime), 'runs LORE here: .lore/runtime/, else a global `lore`, else npx', { ignore: false, mode: 0o755 });
    const why = 'opens the board: `.lore/hud`, or `.lore\\hud` in PowerShell and cmd';
    p.put('.lore/hud', HUD_SH, why, { ignore: false, mode: 0o755, group: '.lore/hud, hud.cmd' });
    p.put('.lore/hud.cmd', HUD_CMD, why, { ignore: false, group: '.lore/hud, hud.cmd' });
  }

  // 4. The agents' session hooks; 5. the git hook for new worktrees.
  planHooks(p, wired, claudeMemory, false);
  if (options.packageDir) planGitHook(p);

  // 6. Ignore rules; 7. the Codex budget.
  const commit = options.commit === true || sharedMode(main);
  planIgnore(p, commit);
  planBudget(p);
  return finish(p, { worktree: false, notes, installed, sync, commit, agents: wired, runtime });
}

/**
 * A linked worktree: LORE.md as a copy pointing at the main checkout, the
 * instruction files built from it and this branch, and the agents' hooks
 * running the main checkout's launcher.
 */
export function planWorktree(options: { cwd: string }): InitPlan {
  const { here, main } = locate(options.cwd);
  if (here === main) throw new InitError('this is the main checkout, not a linked worktree: `lore sync` keeps it current.');
  const original = readText(path.join(main, 'lore', 'LORE.md'));
  if (original === null) throw new InitError(`LORE is not installed in the main checkout (${slash(main)}): run \`lore init\` there first.`);
  const p = planner(here, main);
  const commit = sharedMode(main);
  const own = fileState(here, 'lore/LORE.md');
  let loreMd: string | null = null;
  if (own.tracked) {
    loreMd = rebaseLinks(own.text!); // shared through the repository, and on this branch
  } else if (commit) {
    p.warnings.push('This branch has no lore/ yet (LORE is shared through the repository and not merged here), so agents here read LORE once it is.');
  } else if (own.exists && !own.ours) {
    p.warnings.push('This worktree has a lore/LORE.md of its own, so LORE left its files alone here.');
  } else {
    loreMd = worktreeLore(main, original);
    p.put(
      'lore/LORE.md',
      `${HEADER}: a copy of ${slash(main)}/lore/LORE.md for this linked worktree, pointing at the main checkout. Edit the original; \`lore sync\` regenerates this. -->\n\n${loreMd}`,
      `LORE for this worktree, pointing at ${slash(main)}/lore/`,
      { ignore: false },
    );
  }
  if (loreMd !== null) planInstructions(p, loreMd);
  const { wired, claudeMemory } = agentsOf(readConfig(main).config, {});
  planHooks(p, wired, claudeMemory, true);
  planIgnore(p, commit);
  planBudget(p);
  const notes = [`linked worktree of ${slash(main)}: agents here read LORE from there`];
  return finish(p, { worktree: true, notes, installed: true, sync: true, commit, agents: wired, runtime: null });
}

/** The suite files that differ from the installed lore/, or that it doesn't have (left as they are). */
export function suiteDrift(main: string, suiteDir: string): { differ: string[]; missing: string[] } {
  const lore = path.join(main, 'lore');
  const differ: string[] = [];
  const missing: string[] = [];
  for (const rel of walk(suiteDir)) {
    const mine = path.join(lore, rel);
    if (!existsSync(mine)) missing.push(rel);
    else if (!readFileSync(mine).equals(readFileSync(path.join(suiteDir, rel)))) differ.push(rel);
  }
  return { differ, missing };
}

/** Write a plan's creates, updates and removals, then remove the folders it emptied. */
export function applyPlan(plan: InitPlan) {
  for (const change of plan.changes) {
    const file = path.resolve(plan.root, change.path);
    if (change.kind === 'remove') rmSync(file, { force: true });
    if ((change.kind === 'create' || change.kind === 'update') && change.content !== undefined) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, change.content);
      if (change.mode !== undefined && process.platform !== 'win32') chmodSync(file, change.mode);
    }
  }
  for (const dir of [...plan.prune].sort((a, b) => b.length - a.length)) {
    try {
      rmdirSync(path.resolve(plan.root, dir));
    } catch {
      // not empty: something of the owner's is still in it
    }
  }
}

/** Does the plan change anything? */
export const pending = (plan: InitPlan) => plan.changes.some((c) => c.kind === 'create' || c.kind === 'update' || c.kind === 'remove');

const VERBS: Record<ChangeKind, [done: string, dry: string]> = {
  create: ['created', 'would create'],
  update: ['updated', 'would update'],
  remove: ['removed', 'would remove'],
  unchanged: ['current', 'current'],
  skipped: ['skipped', 'skipped'],
};

interface Entry {
  path: string;
  kind: ChangeKind;
  why: string;
  /** For a group: how many of its files change. */
  changed: number;
  group: boolean;
}

/** The plan's changes with each group (a copied folder) folded into one entry. */
function entries(plan: InitPlan): Entry[] {
  const out: Entry[] = [];
  for (const c of plan.changes) {
    const moves = c.kind === 'create' || c.kind === 'update' || c.kind === 'remove' ? 1 : 0;
    const entry = c.group ? out.find((e) => e.group && e.path === c.group) : undefined;
    if (!entry) {
      out.push({ path: c.group ?? c.path, kind: c.kind, why: c.why, changed: moves, group: c.group !== undefined });
    } else {
      entry.changed += moves;
      if (entry.kind !== c.kind) entry.kind = entry.changed ? 'update' : 'unchanged';
    }
  }
  return out;
}

/** The plan as the owner reads it: one line per file, each copied folder as one. */
export function describePlan(plan: InitPlan, dryRun = false): string[] {
  const at = dryRun ? 1 : 0;
  const pad = (p: string) => p.padEnd(28);
  const lines = plan.notes.map((n) => `  note  ${n}`);
  const list = entries(plan);
  if (!plan.sync && !plan.worktree && !list.some((e) => e.path === 'lore/')) {
    lines.push(`  ✓ ${pad('lore/')} already installed, and yours to adapt: init never changes it`);
  }
  for (const e of list) {
    // A copied folder (its group ends in /) says how many files moved.
    const folder = e.group && e.path.endsWith('/');
    const verb =
      folder && e.kind === 'create'
        ? `${dryRun ? 'would copy' : 'copied'} ${e.changed} file${e.changed === 1 ? '' : 's'}`
        : folder && (e.kind === 'update' || e.kind === 'remove')
          ? `${VERBS[e.kind][at]} ${e.changed} file${e.changed === 1 ? '' : 's'}`
          : VERBS[e.kind][at];
    lines.push(`  ${e.kind === 'skipped' ? '!' : '✓'} ${pad(e.path)} ${verb}: ${e.why}`);
  }
  for (const k of plan.kept) lines.push(`  · ${k}`);
  for (const w of plan.warnings) lines.push(`  ! ${w}`);
  return lines;
}

export interface CheckResult {
  root: string;
  /** Missing, stale or left-over generated files: `lore sync` fixes them. */
  problems: string[];
  /** What LORE cannot fix itself (a committed file in the way, the Codex budget). */
  warnings: string[];
  /** LORE's private paths that git would show: they should be ignored and are not. */
  visible: string[];
}

/**
 * `lore check`: in the main checkout and every linked worktree, is what LORE
 * generates present and current, and does git leave LORE's private files
 * alone?
 */
export function checkRepo(options: { cwd: string; suiteDir: string; packageDir?: string }): CheckResult {
  const { main } = locate(options.cwd);
  if (!existsSync(path.join(main, 'lore', 'LORE.md'))) {
    return { root: main, problems: ['LORE is not installed here (no lore/LORE.md): run `lore init`.'], warnings: [], visible: [] };
  }
  const problems: string[] = [];
  const warnings: string[] = [];
  const visible: string[] = [];
  for (const dir of checkouts(main)) {
    const where = dir === main ? '' : `${slash(path.relative(main, dir))}: `;
    let plan: InitPlan;
    try {
      plan = dir === main ? planInit({ ...options, cwd: main, sync: true }) : planWorktree({ cwd: dir });
    } catch (err) {
      problems.push(`${where}${(err as Error).message}`);
      continue;
    }
    for (const e of entries(plan)) {
      if (e.kind === 'create') problems.push(`${where}${e.path} is missing: \`lore sync\` restores it`);
      if (e.kind === 'update') problems.push(`${where}${e.path} is out of date: \`lore sync\` regenerates it`);
      if (e.kind === 'remove') problems.push(`${where}${e.path} is left over from an earlier setup: \`lore sync\` removes it`);
    }
    warnings.push(...plan.warnings.map((w) => `${where}${w}`));
    const privatePath = (p: string) =>
      p.startsWith('.lore/') || p.startsWith('.research/') || (!plan.commit && p.startsWith('lore/')) || plan.managed.includes(p);
    // What `git status` would list as untracked: files neither tracked nor ignored.
    const untracked = git(dir, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '';
    visible.push(...untracked.split('\0').filter((p) => p && privatePath(p)).map((p) => `${where}${p}`));
  }
  return { root: main, problems, warnings, visible };
}
