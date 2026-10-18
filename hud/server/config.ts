// Where the HUD finds things for the repository it is pointed at.
//
// Private data (the board, settings) lives in the data folder: <repo>/.lore/
// by default, or any folder given with --data, which keeps every write out
// of the repository (trying LORE on a repo without touching it). Journals
// and policies default to LORE's layout and can be redirected from
// <data>/config.json:
//
//   { "journals": ".research", "policies": "lore/policies" }
//
// Relative paths there resolve against the repository root.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PolicyRef } from '../shared/types.ts';

export interface HudConfig {
  repoRoot: string;
  repoName: string;
  dataDir: string;
  boardPath: string;
  journalsDir: string;
  /** Policies folder (holding `reserved/`), or null when the repo has none. */
  policiesDir: string | null;
}

interface ConfigFile {
  journals?: unknown;
  policies?: unknown;
}

// LORE's installed layout first, then the copy-into-root layout, then this
// repository's own source tree.
const POLICY_DIRS = ['lore/policies', 'policies', 'suite/policies'];

const slashes = (p: string) => p.split(path.sep).join('/');
const inside = (root: string, full: string) => {
  const r = path.relative(root, full);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/** Forward-slash, repo-relative form of a path inside the repository. */
export const rel = (config: HudConfig, full: string) => slashes(path.relative(config.repoRoot, full));

/** A path as the owner should read it: repo-relative inside the repository, absolute outside it. */
export const display = (config: HudConfig, full: string) =>
  inside(config.repoRoot, full) ? rel(config, full) : slashes(path.resolve(full));

function gitTopLevel(dir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
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
  const repoRoot = path.resolve(gitTopLevel(start) ?? start);
  const dataDir = data ? path.resolve(data) : path.join(repoRoot, '.lore');
  const file = readConfigFile(dataDir);
  const pick = (value: unknown) => (typeof value === 'string' && value.trim() ? path.resolve(repoRoot, value.trim()) : null);

  const configuredPolicies = pick(file.policies);
  const policiesDir =
    configuredPolicies ?? POLICY_DIRS.map((d) => path.join(repoRoot, d)).find((d) => existsSync(d) && statSync(d).isDirectory()) ?? null;

  return {
    repoRoot,
    repoName: path.basename(repoRoot),
    dataDir,
    boardPath: path.join(dataDir, 'board.json'),
    journalsDir: pick(file.journals) ?? path.join(repoRoot, '.research'),
    policiesDir,
  };
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
 * the board lives outside the repository, where git never sees it.
 */
export function boardIgnored(config: HudConfig): boolean | null {
  if (!inside(config.repoRoot, config.boardPath)) return null;
  try {
    execFileSync('git', ['check-ignore', '-q', rel(config, config.boardPath)], {
      cwd: config.repoRoot,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return true;
  } catch (err) {
    return (err as { status?: number }).status === 1 ? false : null;
  }
}
