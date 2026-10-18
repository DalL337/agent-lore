// GitHub (via the gh CLI the owner is already logged in with) + local git.
// gh results are cached for a minute and a failed fetch keeps serving the last
// good data with the error attached — the board never goes blank because the
// network blinked. Without gh, or outside git, the panels say so and the
// board works on.

import { execFile } from 'node:child_process';
import type { GhItem, GitState, RepoState } from '../shared/types.ts';

const GH_TTL_MS = 60_000;

// Read-only on the repository: without this, `git status` may refresh the
// index file (and take its lock) in the checkout it is only looking at.
const READ_ONLY_GIT = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };

function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: READ_ONLY_GIT },
      (err, stdout, stderr) => {
        if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') reject(new Error(`${cmd} is not installed`));
        else if (err) reject(new Error(`${cmd} ${args[0]} ${args[1] ?? ''}: ${(stderr || err.message).trim()}`));
        else resolve(stdout);
      },
    );
  });
}

/** gh's failure, in the words the owner needs. */
export function explainGhError(message: string): string {
  if (/gh is not installed/.test(message)) return 'the gh CLI is not installed';
  if (/not a git repository/i.test(message)) return 'this folder is not a git repository';
  if (/no git remotes|none of the git remotes|could not determine (base )?repo/i.test(message)) return 'this repository has no GitHub remote';
  if (/gh auth login|not logged in|authentication|HTTP 401/i.test(message)) return 'gh is not logged in (run `gh auth login`)';
  return message;
}

interface RawItem extends Omit<GhItem, 'labels'> {
  labels?: { name: string }[];
}

export function createRepoState(repoRoot: string) {
  let cached: Omit<RepoState, 'git'> | null = null;
  let cachedAt = 0;
  let inflight: Promise<Omit<RepoState, 'git'>> | null = null;

  async function fetchGitHub(): Promise<Omit<RepoState, 'git'>> {
    const [prs, issues, release] = await Promise.all([
      run('gh', ['pr', 'list', '--state', 'all', '--limit', '400', '--json',
        'number,title,state,url,createdAt,updatedAt,mergedAt,closedAt,headRefName,isDraft'], repoRoot),
      run('gh', ['issue', 'list', '--state', 'all', '--limit', '400', '--json',
        'number,title,state,url,createdAt,updatedAt,closedAt,labels'], repoRoot),
      run('gh', ['release', 'view', '--json', 'tagName,publishedAt,url'], repoRoot).catch(() => 'null'),
    ]);
    const rel = JSON.parse(release) as { tagName: string; publishedAt: string; url: string } | null;
    return {
      fetchedAt: new Date().toISOString(),
      prs: JSON.parse(prs) as GhItem[],
      issues: (JSON.parse(issues) as RawItem[]).map((i) => ({ ...i, labels: (i.labels ?? []).map((l) => l.name) })),
      release: rel ? { tag: rel.tagName, publishedAt: rel.publishedAt, url: rel.url } : null,
    };
  }

  async function github(force: boolean): Promise<Omit<RepoState, 'git'>> {
    if (!force && cached && Date.now() - cachedAt < GH_TTL_MS) return cached;
    inflight ??= fetchGitHub()
      .then((fresh) => {
        cached = fresh;
        cachedAt = Date.now();
        return fresh;
      })
      .catch((err: Error) => ({
        ...(cached ?? { prs: [], issues: [], release: null }),
        fetchedAt: cached?.fetchedAt ?? new Date().toISOString(),
        error: explainGhError(err.message),
        lastGood: cached !== null,
      }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  async function git(): Promise<GitState | null> {
    try {
      const [branch, log, status] = await Promise.all([
        run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
        run('git', ['log', '-1', '--format=%h%x09%s'], repoRoot),
        run('git', ['status', '--porcelain'], repoRoot),
      ]);
      const [head, ...subject] = log.trim().split('\t');
      return {
        branch: branch.trim(),
        head,
        subject: subject.join('\t'),
        dirty: status.split('\n').filter(Boolean).length,
      };
    } catch {
      return null;
    }
  }

  return {
    async get(force = false): Promise<RepoState> {
      const [gh, g] = await Promise.all([github(force), git()]);
      return { ...gh, git: g };
    },
  };
}
