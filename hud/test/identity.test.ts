import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { defaultPortFor, repoNameFromUrl, resolveConfig } from '../server/config.ts';
import { liveInstance, readInstance, writeInstance } from '../server/instance.ts';
import { startHud } from '../server/main.ts';
import { cleanup, demoRepo, emptyRepo } from './helpers.ts';

after(cleanup);

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, stdio: 'ignore' });

async function gitRepo(): Promise<string> {
  const dir = await emptyRepo();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

test('the title: config name, else the remote repository name, else the folder', async () => {
  const plain = await emptyRepo();
  assert.equal(resolveConfig(plain).repoName, path.basename(plain), 'no git: the folder');

  const repo = await gitRepo();
  assert.equal(resolveConfig(repo).repoName, path.basename(repo), 'git without a remote: the folder');
  git(repo, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git');
  assert.equal(resolveConfig(repo).repoName, 'widgets', 'the remote names it, whatever the folder is called');

  await mkdir(path.join(repo, '.lore'), { recursive: true });
  await writeFile(path.join(repo, '.lore', 'config.json'), JSON.stringify({ name: 'Widgets HQ' }));
  assert.equal(resolveConfig(repo).repoName, 'Widgets HQ', 'config wins');
});

test('remote URLs in the usual forms', () => {
  assert.equal(repoNameFromUrl('https://github.com/acme/widgets.git'), 'widgets');
  assert.equal(repoNameFromUrl('git@github.com:acme/gadgets.git'), 'gadgets');
  assert.equal(repoNameFromUrl('ssh://git@host:2222/team/tools/'), 'tools');
  assert.equal(repoNameFromUrl('C:\\repos\\local-mirror'), 'local-mirror');
});

test('a worktree shares the main checkout: same board, journals, name', async () => {
  const main = await gitRepo();
  git(main, 'remote', 'add', 'origin', 'git@github.com:acme/widgets.git');
  const wt = `${main}-feature`;
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt);
  try {
    const fromWorktree = resolveConfig(wt);
    const fromMain = resolveConfig(main);
    assert.equal(path.resolve(fromWorktree.repoRoot), path.resolve(wt), 'git state still comes from the worktree');
    assert.equal(path.resolve(fromWorktree.mainRoot), path.resolve(main));
    assert.equal(fromWorktree.boardPath, fromMain.boardPath, 'one board for every worktree');
    assert.equal(fromWorktree.journalsDir, fromMain.journalsDir);
    assert.equal(fromWorktree.repoName, 'widgets');
  } finally {
    git(main, 'worktree', 'remove', '--force', wt);
  }
});

test('each repository gets a stable default port in 5200–5999; config can set one', async () => {
  const a = defaultPortFor('C:\\projects\\Litria');
  assert.equal(defaultPortFor('c:\\projects\\litria'), a, 'stable across drive-letter case');
  assert.ok(a >= 5200 && a < 6000);
  assert.notEqual(defaultPortFor('C:\\projects\\Lore'), a);
  const repo = await demoRepo();
  await writeFile(path.join(repo, '.lore', 'config.json'), JSON.stringify({ port: 5432 }));
  assert.equal(resolveConfig(repo).port, 5432);
});

test('a registered HUD records itself, is confirmed live, and clears on close', async () => {
  const repo = await demoRepo();
  const hud = await startHud({ repo, port: 0, clientDir: null, version: 'test', register: true });
  const entry = readInstance(hud.config);
  assert.equal(entry?.pid, process.pid);
  assert.equal(entry?.url, hud.url);
  assert.equal((await liveInstance(hud.config))?.pid, process.pid);
  await hud.close();
  assert.equal(existsSync(path.join(repo, '.lore', 'hud.json')), false);
  assert.equal(await liveInstance(hud.config), null);
});

test('a stale entry (dead process) is not mistaken for a running HUD', async () => {
  const config = resolveConfig(await demoRepo());
  writeInstance(config, { pid: 2_147_000_000, port: 5999, url: 'http://127.0.0.1:5999', version: 'old', startedAt: '2026-01-01T00:00:00Z', repo: 'x' });
  assert.equal(await liveInstance(config), null);
});
