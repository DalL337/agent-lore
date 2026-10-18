// Slice 4 of docs/plans/lore-init.md: linked worktrees, the git hook that
// sets them up, `lore uninstall`, and what `lore update` reports.
//
// Worktrees get generated files pointing at the main checkout, never links:
// on Windows `git worktree remove` follows a directory junction and deletes
// what it points at (seen with Git 2.49), so the test that matters most here
// removes a worktree and checks the main checkout's LORE is all still there.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mainDirectories } from '../server/agents.ts';
import { applyPlan, checkRepo, pending, planInit, planWorktree, removeBlock, suiteDrift, upsertBlock, worktreeLore, type InitOptions } from '../server/init.ts';
import { planUninstall } from '../server/uninstall.ts';
import { cleanup, emptyRepo } from './helpers.ts';

after(cleanup);

const SUITE = fileURLToPath(new URL('../../suite/lore', import.meta.url));
const slash = (p: string) => p.split(path.sep).join('/');
const made: string[] = [];
after(() => Promise.all(made.map((d) => rm(d, { recursive: true, force: true }))));

const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

async function write(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
}

async function repo(files: Record<string, string> = {}): Promise<string> {
  const dir = await emptyRepo();
  git(dir, ['init', '-q', '-b', 'main']);
  await write(dir, files);
  git(dir, ['add', '-A', '-f']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', 'init']);
  return dir;
}

/** A stand-in for the published package; its bin logs each call to $LORE_TEST_LOG. */
async function fakePackage(): Promise<string> {
  const dir = await emptyRepo();
  await write(dir, {
    'package.json': JSON.stringify({ name: '@dall337/lore', version: '9.1.0' }),
    'bin/lore.mjs':
      "import { appendFileSync } from 'node:fs';\nif (process.env.LORE_TEST_LOG) appendFileSync(process.env.LORE_TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n",
    'hud/dist/server/main.js': 'export {};\n',
  });
  return dir;
}

/** A worktree beside the repository, removed after the tests. */
function addWorktree(main: string, branch: string, env: NodeJS.ProcessEnv = {}, existing = false): string {
  const dir = `${main}-${branch}`;
  made.push(dir);
  git(main, ['worktree', 'add', '-q', ...(existing ? [] : ['-b', branch]), dir, ...(existing ? [branch] : [])], env);
  return dir;
}

function run(cwd: string, extra: Partial<InitOptions> = {}) {
  const plan = planInit({ cwd, suiteDir: SUITE, ...extra });
  applyPlan(plan);
  return plan;
}
const setUp = (dir: string) => {
  const plan = planWorktree({ cwd: dir });
  applyPlan(plan);
  return plan;
};
const status = (dir: string) => git(dir, ['status', '--porcelain', '--untracked-files=all']).trim();
const read = (dir: string, rel: string) => readFile(path.join(dir, rel), 'utf8');
const json = async (dir: string, rel: string) => JSON.parse(await read(dir, rel));

/** Every file and folder of a checkout (with .git/info and .git/hooks, not the rest of .git), with a hash of each file. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (rel: string) => {
    const full = path.join(dir, rel);
    for (const name of readdirSync(full).sort()) {
      const child = rel ? `${rel}/${name}` : name;
      if (child === '.git') {
        for (const sub of ['info', 'hooks']) if (existsSync(path.join(dir, '.git', sub))) visit(`.git/${sub}`);
        continue;
      }
      if (statSync(path.join(dir, child)).isDirectory()) {
        out[`${child}/`] = 'folder';
        visit(child);
      } else {
        out[child] = createHash('sha1').update(readFileSync(path.join(dir, child))).digest('hex');
      }
    }
  };
  visit('');
  return out;
}

function uninstall(dir: string, all = false) {
  const plans = planUninstall({ cwd: dir, suiteDir: SUITE, all });
  for (const plan of plans) applyPlan(plan);
  return plans;
}

// ── Worktrees ─────────────────────────────────────────────────────────

test('a worktree gets LORE pointing at the main checkout, and removing it leaves the main checkout’s LORE whole', async () => {
  const main = await repo({ 'README.md': '# app\n' });
  run(main, { packageDir: await fakePackage(), agents: ['claude', 'codex'] });
  const before = snapshot(main);
  const wt = addWorktree(main, 'feature');
  const plan = setUp(wt);
  const m = slash(main);

  const copy = await read(wt, 'lore/LORE.md');
  assert.match(copy, /^<!-- Generated by LORE: a copy of /);
  assert.match(copy, /Linked worktree of `/);
  assert.ok(copy.includes(`](${m}/lore/policies/memory.md#`), 'links go to the main checkout’s policies');
  assert.doesNotMatch(copy, /\]\(policies\//);
  assert.deepEqual(readdirSync(path.join(wt, 'lore')), ['LORE.md'], 'the worktree’s lore/ holds only the copy: no link to delete through');
  assert.ok((await read(wt, 'AGENTS.md')).includes(`${m}/lore/`));
  assert.match(await read(wt, 'CLAUDE.md'), /^@lore\/LORE\.md$/m);

  const claude = await json(wt, '.claude/settings.local.json');
  assert.equal(claude.hooks.SessionStart[0].hooks[0].args[0], `${m}/.lore/lore.mjs`, 'the main checkout’s launcher, by absolute path');
  assert.deepEqual(claude.permissions.additionalDirectories, mainDirectories(main));
  assert.equal((await json(wt, '.codex/hooks.json')).hooks.SessionStart[0].hooks[0].command, `node "${m}/.lore/lore.mjs" session --agent codex`);
  assert.equal(plan.next.length, 1, 'Codex must be trusted in the worktree too');

  assert.equal(status(wt), '', 'the worktree’s git status is empty');
  assert.equal(status(main), '');
  assert.equal(pending(planWorktree({ cwd: wt })), false, 'a second run changes nothing');
  const check = checkRepo({ cwd: main, suiteDir: SUITE });
  assert.deepEqual([check.problems, check.visible], [[], []], '`lore check` covers the worktree too');

  git(main, ['worktree', 'remove', '--force', wt]);
  assert.deepEqual(snapshot(main), before, 'the main checkout is exactly as it was: lore/ and .lore/ whole');
});

test('a worktree on a branch with its own AGENTS.md: its files differ from main’s, and the shared ignore rules cover both', async () => {
  const main = await repo({ 'README.md': '# app\n' });
  git(main, ['checkout', '-q', '-b', 'docs']);
  await write(main, { 'AGENTS.md': '# Acme on the docs branch\n' });
  git(main, ['add', 'AGENTS.md']);
  git(main, ['commit', '-q', '-m', 'agents']);
  git(main, ['checkout', '-q', 'main']);
  run(main);
  const wt = addWorktree(main, 'docs', {}, true);
  setUp(wt);

  assert.ok(existsSync(path.join(main, 'AGENTS.md')) && existsSync(path.join(main, 'CLAUDE.md')), 'main: generated AGENTS.md and CLAUDE.md');
  assert.match(await read(wt, 'AGENTS.override.md'), /Acme on the docs branch/);
  assert.match(await read(wt, 'CLAUDE.local.md'), /@AGENTS\.md\n@lore\/LORE\.md/);
  const rules = await read(main, '.git/info/exclude');
  for (const rule of ['/AGENTS.md', '/CLAUDE.md', '/AGENTS.override.md', '/CLAUDE.local.md']) assert.match(rules, new RegExp(`^${rule.replace('.', '\\.')}$`, 'm'), rule);
  assert.equal(status(main), '');
  assert.equal(status(wt), '');
  assert.equal(pending(planInit({ cwd: main, suiteDir: SUITE, sync: true })), false, 'syncing main keeps the worktree’s rules');
  assert.equal(pending(planWorktree({ cwd: wt })), false);
});

test('the git hook: git runs it for each new worktree, and it joins a hook of the owner’s rather than replacing it', async () => {
  const main = await repo();
  await write(main, { '.git/hooks/post-checkout': '#!/bin/sh\necho "owner hook ran" >> "$(git rev-parse --git-common-dir)/owner.log"\n' });
  chmodSync(path.join(main, '.git/hooks/post-checkout'), 0o755);
  run(main, { packageDir: await fakePackage(), agents: [] });
  const hook = await read(main, '.git/hooks/post-checkout');
  assert.ok(hook.startsWith('#!/bin/sh\n# >>> LORE'), 'LORE’s block right after the shebang');
  assert.match(hook, /echo "owner hook ran"/, 'the owner’s hook is still all there');

  const log = path.join(await emptyRepo(), 'calls.log');
  const wt = addWorktree(main, 'feature', { LORE_TEST_LOG: log });
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['worktree', '--hook']);
  assert.equal(calls[0][4], '1', 'git says it was a branch checkout');
  assert.match(await read(main, '.git/owner.log'), /owner hook ran/);
  assert.ok(existsSync(wt));

  uninstall(main);
  assert.equal(await read(main, '.git/hooks/post-checkout'), '#!/bin/sh\necho "owner hook ran" >> "$(git rev-parse --git-common-dir)/owner.log"\n', 'uninstall gives the owner’s hook back exactly');
  if (process.platform !== 'win32') assert.equal(statSync(path.join(main, '.git/hooks/post-checkout')).mode & 0o777, 0o755, 'and still executable');
});

test('an owner’s hook that isn’t executable stays as it is: git skips it, so LORE warns instead of joining it', { skip: process.platform === 'win32' && 'Windows has no executable bit' }, async () => {
  const main = await repo();
  const hook = '#!/bin/sh\necho "switched off"\n';
  await write(main, { '.git/hooks/post-checkout': hook });
  chmodSync(path.join(main, '.git/hooks/post-checkout'), 0o644);
  const plan = run(main, { packageDir: await fakePackage(), agents: [] });
  assert.match(plan.warnings.join('\n'), /isn't executable, so git skips it/);
  assert.equal(await read(main, '.git/hooks/post-checkout'), hook);
  assert.equal(statSync(path.join(main, '.git/hooks/post-checkout')).mode & 0o777, 0o644, 'not switched back on');
  assert.equal(status(main), '');

  // Once the owner makes it executable, sync joins it.
  chmodSync(path.join(main, '.git/hooks/post-checkout'), 0o755);
  run(main, { packageDir: await fakePackage(), agents: [], sync: true });
  assert.match(await read(main, '.git/hooks/post-checkout'), /^#!\/bin\/sh\n# >>> LORE/);
});

test('a hook LORE can’t join, or hooks in a folder of their own (husky), are left alone with a warning', async () => {
  const pkg = await fakePackage();
  const node = await repo();
  await write(node, { '.git/hooks/post-checkout': '#!/usr/bin/env node\nconsole.log("mine")\n' });
  const plan = run(node, { packageDir: pkg, agents: [] });
  assert.match(plan.warnings.join('\n'), /not a shell script/);
  assert.equal(await read(node, '.git/hooks/post-checkout'), '#!/usr/bin/env node\nconsole.log("mine")\n');

  const husky = await repo();
  git(husky, ['config', 'core.hooksPath', '.husky/_']);
  const plan2 = run(husky, { packageDir: pkg, agents: [] });
  assert.match(plan2.warnings.join('\n'), /core\.hooksPath/);
  assert.ok(!existsSync(path.join(husky, '.husky')) && !existsSync(path.join(husky, '.git', 'hooks', 'post-checkout')));
});

test('worktreeLore points links and lore/, .lore/ and .research/ paths at the main checkout, and nothing else', () => {
  const root = path.resolve('/repo');
  const m = slash(root);
  const text = worktreeLore(root, '[m](policies/memory.md) `lore/scripts/x.mjs` `.lore/board.json` `.research/` [w](https://x.test/lore/) research/notes and src/lore/y');
  assert.ok(text.includes(`[m](${m}/lore/policies/memory.md)`));
  assert.ok(text.includes(`\`${m}/lore/scripts/x.mjs\` \`${m}/.lore/board.json\` \`${m}/.research/\``));
  assert.ok(text.includes('[w](https://x.test/lore/) research/notes and src/lore/y'), 'URLs, other folders and nested lore/ paths stay');
});

// ── Uninstall ─────────────────────────────────────────────────────────

test('uninstall after init: the repository is byte for byte what it was', async () => {
  const main = await repo({ 'README.md': '# app\n' });
  const before = snapshot(main);
  run(main, { packageDir: await fakePackage(), agents: ['claude', 'codex'], defaultAgent: 'claude' });
  const wt = addWorktree(main, 'feature');
  setUp(wt);
  assert.notDeepEqual(snapshot(main), before);

  uninstall(main);
  assert.equal(status(wt), '', 'the worktree is clean');
  assert.deepEqual(readdirSync(wt).sort(), ['.git', 'README.md'], 'and holds nothing of LORE’s');
  git(main, ['worktree', 'remove', wt]); // no --force needed: nothing of LORE's is left in it
  assert.deepEqual(snapshot(main), before);
});

test('uninstall gives the owner’s files back exactly: blocks out of their text, their settings as they were', async () => {
  const main = await repo({ 'AGENTS.md': '# Acme\n', 'CLAUDE.md': '# Acme for Claude\n' });
  await write(main, {
    'CLAUDE.local.md': 'Call me Sam.\n\n\n',
    '.claude/settings.local.json': '{"permissions":{"allow":["Bash(npm test)"]}}',
    'AGENTS.override.md': '# My override\n',
  });
  const before = snapshot(main);
  run(main, { packageDir: await fakePackage(), agents: ['claude', 'codex'] });
  assert.match(await read(main, 'CLAUDE.local.md'), /lore:begin/);
  assert.ok((await json(main, '.claude/settings.local.json')).hooks);

  uninstall(main);
  assert.deepEqual(snapshot(main), before);
});

test('uninstall keeps what the owner made theirs, still private; --all removes it, but never journals', async () => {
  const main = await repo();
  run(main, { packageDir: await fakePackage(), agents: ['claude'] });
  await writeFile(path.join(main, 'lore', 'policies', 'git.md'), '# Git, our way\n');
  await write(main, { '.lore/board.json': '{"columns":[],"cards":[]}\n', '.research/2026-10-18-notes.md': '# Notes\n' });

  const [plan] = uninstall(main);
  assert.ok(existsSync(path.join(main, 'lore', 'policies', 'git.md')), 'adapted lore/ stays');
  assert.ok(existsSync(path.join(main, '.lore', 'board.json')), 'the board stays');
  assert.ok(!existsSync(path.join(main, '.lore', 'runtime')) && !existsSync(path.join(main, '.lore', 'lore.mjs')) && !existsSync(path.join(main, 'CLAUDE.md')));
  assert.match(plan.kept.join('\n'), /adaptations/);
  assert.match(await read(main, '.git/info/exclude'), /# >>> LORE[^\n]*\n\/lore\/\n\/\.lore\/\n\/\.research\/\n# <<< LORE/, 'only the rules for what stays');
  assert.equal(status(main), '', 'and it stays private');

  uninstall(main, true);
  assert.ok(!existsSync(path.join(main, 'lore')) && !existsSync(path.join(main, '.lore')));
  assert.ok(existsSync(path.join(main, '.research', '2026-10-18-notes.md')), 'journals are never deleted');
  assert.match(await read(main, '.git/info/exclude'), /^\/\.research\/$/m, 'and stay ignored');
  assert.equal(status(main), '');
});

// ── Update, and the blocks' exactness ─────────────────────────────────

test('suiteDrift lists the suite files the owner’s lore/ differs from or lacks', async () => {
  const main = await repo();
  run(main);
  await writeFile(path.join(main, 'lore', 'policies', 'git.md'), '# Git, our way\n');
  await rm(path.join(main, 'lore', 'policies', 'creative.md'));
  assert.deepEqual(suiteDrift(main, SUITE), { differ: ['policies/git.md'], missing: ['policies/creative.md'] });
});

test('a block appended and removed leaves the text exactly as it was', () => {
  for (const text of ['mine\n', 'mine\n\n\n', 'a\nb\n', '# x\r\n']) {
    assert.equal(removeBlock(upsertBlock(text, '# >', '# <', 'one'), '# >', '# <'), text, JSON.stringify(text));
  }
});
