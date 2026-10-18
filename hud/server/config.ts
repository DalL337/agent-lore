// Where the HUD finds things for the repository it is pointed at.
//
// LORE's private files (the board, settings, journals, an untracked lore/
// folder) are gitignored, so they exist only in the main checkout: a linked
// worktree never gets a copy. Everything LORE-private therefore resolves
// against the MAIN checkout, and every worktree shares one board. Git and
// GitHub state come from the working tree the HUD was started in.
//
// Private data lives in the data folder: <main>/.lore/ by default, or any
// folder given with --data, which keeps every write out of the repository.
// Journals, policies, a display name, and a port can be set in
// <data>/config.json:
//
//   { "name": "Litria", "journals": ".research", "policies": "lore/policies", "port": 5231 }
//
// Relative paths there resolve against the main checkout.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PolicyRef } from '../shared/types.ts';

export interface HudConfig {
  /** The working tree the HUD was started in: git and gh run here. */
  repoRoot: string;
  /** The main checkout: LORE's private files live here. Same as repoRoot outside a linked worktree. */
  mainRoot: string;
  /** Shown as the board's title: config "name", else the git remote's repository name, else the folder. */
  repoName: string;
  dataDir: string;
  boardPath: string;
  journalsDir: string;
  /** Policies folder (holding `reserved/`), or null when the repo has none. */
  policiesDir: string | null;
  /** Port from config.json, if the owner set one. */
  port: number | null;
}

interface ConfigFile {
  name?: unknown;
  journals?: unknown;
  policies?: unknown;
  port?: unknown;
}

// LORE's installed layout first, then the older copy-into-root layout, then
// this repository's own source tree.
const POLICY_DIRS = ['lore/policies', 'policies', 'suite/lore/policies'];

const slashes = (p: string) => p.split(path.sep).join('/');
const inside = (root: string, full: string) => {
  const r = path.relative(root, full);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/** Forward-slash path relative to the main checkout. */
export const rel = (config: HudConfig, full: string) => slashes(path.relative(config.mainRoot, full));

/** A path as the owner should read it: relative inside the main checkout, absolute outside it. */
export const display = (config: HudConfig, full: string) =>
  inside(config.mainRoot, full) ? rel(config, full) : slashes(path.resolve(full));

/** Read-only git: never takes the index lock or refreshes it. */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
  } catch {
    return null;
  }
}

/** The main checkout of a repository: the first worktree git lists, unless that one is bare. */
function mainWorktree(repoRoot: string): string {
  const list = git(repoRoot, ['worktree', 'list', '--porcelain']);
  const first = list?.split(/\r?\n\r?\n/)[0] ?? '';
  const dir = /^worktree (.+)$/m.exec(first)?.[1];
  return dir && !/^bare$/m.test(first) ? path.resolve(dir) : repoRoot;
}

/** "https://github.com/acme/widgets.git" or "git@github.com:acme/widgets.git" → "widgets". */
export function repoNameFromUrl(url: string): string | null {
  const name = url.trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop()?.replace(/\.git$/i, '');
  return name || null;
}

function remoteName(repoRoot: string): string | null {
  const remotes = git(repoRoot, ['remote'])?.split(/\r?\n/).filter(Boolean) ?? [];
  const remote = remotes.includes('origin') ? 'origin' : remotes[0];
  const url = remote ? git(repoRoot, ['remote', 'get-url', remote]) : null;
  return url ? repoNameFromUrl(url) : null;
}

function readConfigFile(dataDir: string): ConfigFile {
  const file = path.join(dataDir, 'config.json');
  if (!existsSync(file)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return value && typeof value === 'object' ? (value as ConfigFile) : {};
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`);
  }
}

export function resolveConfig(repo: string, data?: string): HudConfig {
  const start = path.resolve(repo);
  if (!existsSync(start) || !statSync(start).isDirectory()) throw new Error(`not a directory: ${start}`);
  const top = git(start, ['rev-parse', '--show-toplevel']);
  const repoRoot = path.resolve(top || start);
  const mainRoot = top ? mainWorktree(repoRoot) : repoRoot;
  const dataDir = data ? path.resolve(data) : path.join(mainRoot, '.lore');
  const file = readConfigFile(dataDir);
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const pick = (value: unknown) => (text(value) ? path.resolve(mainRoot, text(value)!) : null);

  const configuredPolicies = pick(file.policies);
  const policiesDir =
    configuredPolicies ?? POLICY_DIRS.map((d) => path.join(mainRoot, d)).find((d) => existsSync(d) && statSync(d).isDirectory()) ?? null;
  const port = Number.isInteger(file.port) && (file.port as number) > 0 && (file.port as number) < 65536 ? (file.port as number) : null;

  return {
    repoRoot,
    mainRoot,
    repoName: text(file.name) ?? (top ? remoteName(repoRoot) : null) ?? path.basename(mainRoot),
    dataDir,
    boardPath: path.join(dataDir, 'board.json'),
    journalsDir: pick(file.journals) ?? path.join(mainRoot, '.research'),
    policiesDir,
    port,
  };
}

/**
 * A stable default port for one repository, so its address can be
 * bookmarked: derived from the main checkout's path, in 5200–5999.
 */
export function defaultPortFor(mainRoot: string): number {
  const key = path.resolve(mainRoot).toLowerCase();
  return 5200 + (parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16) % 800);
}

/**
 * A policy's name from its file: `research.md` → `research`, and a
 * `-policy` suffix (`persistent-research-policy.md`) is dropped too.
 */
export const policyName = (file: string) => path.basename(file, '.md').replace(/-policy$/i, '');

/** The repository's policies, reserved scopes included, from the policies folder. */
export function listPolicies(config: HudConfig): PolicyRef[] {
  const dir = config.policiesDir;
  if (!dir) return [];
  const out: PolicyRef[] = [];
  for (const [sub, reserved] of [[dir, false], [path.join(dir, 'reserved'), true]] as const) {
    if (!existsSync(sub)) continue;
    for (const f of readdirSync(sub).sort()) {
      const full = path.join(sub, f);
      if (f.endsWith('.md') && statSync(full).isFile()) out.push({ name: policyName(f), path: display(config, full), reserved });
    }
  }
  return out;
}

/**
 * Would git leave the board file out of commits? true = ignored, false = it
 * would show as untracked, null = not a git repository (or git missing), or
 * the board lives outside the main checkout, where git never sees it.
 */
export function boardIgnored(config: HudConfig): boolean | null {
  if (!inside(config.mainRoot, config.boardPath)) return null;
  try {
    execFileSync('git', ['check-ignore', '-q', rel(config, config.boardPath)], {
      cwd: config.mainRoot,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return true;
  } catch (err) {
    return (err as { status?: number }).status === 1 ? false : null;
  }
}
