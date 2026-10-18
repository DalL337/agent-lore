import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { listPolicies, policyName, resolveConfig } from '../server/config.ts';
import { declaredPolicies, mentionedPolicies } from '../server/journals.ts';
import { brief, startHud } from '../server/main.ts';
import type { Board } from '../shared/types.ts';
import { cleanup, demoRepo, emptyRepo } from './helpers.ts';

after(cleanup);

const hash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');

test('--data keeps the board outside the repository; the repository is only read', async () => {
  const repo = await demoRepo();
  const data = await emptyRepo();
  const repoBoard = path.join(repo, '.lore', 'board.json');
  const before = await hash(repoBoard);
  const repoFiles = (await readdir(repo, { recursive: true })).sort();

  const hud = await startHud({ repo, data, port: 0, clientDir: null, version: 'test' });
  try {
    assert.equal(hud.config.dataDir, path.resolve(data));
    assert.equal(hud.meta.boardFile, `${path.resolve(data).split(path.sep).join('/')}/board.json`, 'shown absolute: it is outside the repo');
    assert.equal(hud.meta.boardIgnored, null, 'git never sees a board outside the repo');
    const base = hud.url;
    const board = (await (await fetch(`${base}/api/board`)).json()) as Board;
    assert.equal(board.cards.length, 0, 'a fresh board in the data folder, not the repo one');
    const journals = (await (await fetch(`${base}/api/journals`)).json()) as unknown[];
    assert.equal(journals.length, 5, 'journals still come from the repository');
    await fetch(`${base}/api/board/card`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card: { title: 'Sandboxed' } }) });
    await fetch(`${base}/api/board/journal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: '2026-10-15-empty-states.md', state: 'closed' }) });
  } finally {
    await hud.close();
  }
  const written = JSON.parse(await readFile(path.join(data, 'board.json'), 'utf8')) as Board;
  assert.equal(written.cards[0].title, 'Sandboxed');
  assert.ok(written.journals?.['2026-10-15-empty-states.md'], 'close marks land in the data folder');
  assert.equal(await hash(repoBoard), before, "the repository's own board is untouched");
  assert.deepEqual((await readdir(repo, { recursive: true })).sort(), repoFiles, 'nothing new in the repository');
});

test('--data reads config.json from the data folder; relative paths resolve against the repo', async () => {
  const repo = await demoRepo();
  const data = await emptyRepo();
  await writeFile(path.join(data, 'config.json'), JSON.stringify({ journals: '.research', policies: 'lore/policies/reserved' }));
  const config = resolveConfig(repo, data);
  assert.equal(config.journalsDir, path.join(path.resolve(repo), '.research'));
  assert.deepEqual(listPolicies(config).map((p) => p.name), ['migration']);
  assert.match(await brief({ repo, data }), /No board yet/);
  assert.equal(existsSync(path.join(data, 'board.json')), false, 'the brief never creates a board');
});

test('policy files named *-policy.md read as the plain name', async () => {
  assert.equal(policyName('persistent-research-policy.md'), 'persistent-research');
  assert.equal(policyName('research.md'), 'research');
  const repo = await emptyRepo();
  await mkdir(path.join(repo, 'policies', 'reserved'), { recursive: true });
  await writeFile(path.join(repo, 'policies', 'git-policy.md'), '# Git');
  await writeFile(path.join(repo, 'policies', 'reserved', 'migration-policy.md'), '# Migration');
  assert.deepEqual(listPolicies(resolveConfig(repo)).map((p) => `${p.name}${p.reserved ? '*' : ''}`), ['git', 'migration*']);
});

test('mentions match a policy by its file stem as well as its name', () => {
  const keys = [{ name: 'persistent-research', stem: 'persistent-research-policy' }, { name: 'git', stem: 'git-policy' }];
  assert.deepEqual(mentionedPolicies('Followed Agents/docs/persistent-research-policy.md.', keys, []), ['persistent-research']);
  assert.deepEqual(mentionedPolicies('Per the git policy.', keys, []), ['git']);
  assert.deepEqual(mentionedPolicies('git rebase, research notes', keys, []), []);
  assert.deepEqual(declaredPolicies(['Policies: git-policy, research-policy.md']), ['git', 'research']);
});
