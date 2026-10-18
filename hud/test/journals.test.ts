import assert from 'node:assert/strict';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { createJournalIndex, declaredPolicies, mentionedPolicies, parseJournal, writtenAfter } from '../server/journals.ts';
import { cleanup, demoRepo } from './helpers.ts';

after(cleanup);

const NAMES = ['board', 'documentation', 'git', 'implementation', 'research', 'verification', 'migration'];

test('status: concluded, complete marker, open, stale', async () => {
  const dir = await demoRepo();
  const list = await createJournalIndex(path.join(dir, '.research'), () => NAMES).list();
  const by = Object.fromEntries(list.map((j) => [j.file, j]));
  assert.equal(by['2026-10-12-search-index.md'].status, 'concluded', 'non-empty Final Conclusions');
  assert.equal(by['2026-10-09-retry-writes.md'].status, 'concluded', 'Status: complete');
  assert.equal(by['2026-10-15-empty-states.md'].status, 'open', '"Pending." is not a conclusion');
  assert.equal(by['2026-09-20-cache-eviction.md'].status, 'stale', 'untouched for over a week');
  assert.equal(by['2026-10-15-empty-states.md'].openQuestions, 1);
  assert.deepEqual(by['2026-10-12-search-index.md'].prRefs, [14]);
  assert.equal(list[list.length - 1].file, '2026-09-20-cache-eviction.md', 'newest first');
});

test('policies: declared on the Policies: line, mentioned in text', async () => {
  const dir = await demoRepo();
  const list = await createJournalIndex(path.join(dir, '.research'), () => NAMES).list();
  const by = Object.fromEntries(list.map((j) => [j.file, j.policies]));
  assert.deepEqual(by['2026-10-15-empty-states.md'], { declared: ['research', 'implementation'], mentioned: [] });
  assert.deepEqual(by['2026-10-09-retry-writes.md'], { declared: ['research', 'git', 'verification'], mentioned: [] });
  assert.deepEqual(by['2026-10-12-search-index.md'], { declared: [], mentioned: ['verification'] });
  assert.deepEqual(by['2026-10-16-export-format.md'], { declared: [], mentioned: ['documentation'] });
  assert.deepEqual(by['2026-09-20-cache-eviction.md'], { declared: [], mentioned: [] });
});

test('declared names normalize paths, links, and markdown', () => {
  assert.deepEqual(declaredPolicies(['- **Policies:** `policies/research.md`, [git](../lore/policies/git.md); reserved/migration.md']), ['research', 'git', 'migration']);
  assert.deepEqual(declaredPolicies(['policies: research and implementation']), ['research', 'implementation']);
  assert.deepEqual(declaredPolicies(['No policy line here']), []);
});

test('mentions need a policy-shaped reference, not the bare word', () => {
  assert.deepEqual(mentionedPolicies('We used git to bisect and kept research notes.', NAMES, []), []);
  assert.deepEqual(mentionedPolicies('Per the git policy and research.md.', NAMES, []), ['git', 'research']);
  assert.deepEqual(mentionedPolicies('See lore/policies/reserved/migration.md', NAMES, []), ['migration']);
  assert.deepEqual(mentionedPolicies('Per research.md', NAMES, ['research']), [], 'declared names are not repeated as mentions');
});

test('a policies line inside a code fence is not a declaration', () => {
  const parsed = parseJournal('# T\n\n```\nPolicies: git\n```\n', 'fallback', NAMES);
  assert.deepEqual(parsed.policies.declared, []);
});

test('closed journals reopen when written after the close', async () => {
  const dir = await demoRepo();
  const journalsDir = path.join(dir, '.research');
  const index = createJournalIndex(journalsDir, () => NAMES);
  const file = '2026-10-15-empty-states.md';
  const closedAt = new Date(Date.now() - 60_000).toISOString();
  const before = new Date(Date.now() - 120_000);
  await utimes(path.join(journalsDir, file), before, before);
  let j = (await index.list({ [file]: { state: 'closed', at: closedAt } })).find((x) => x.file === file)!;
  assert.equal(j.status, 'closed');
  assert.equal(j.editedAfterClose, false);
  await utimes(path.join(journalsDir, file), new Date(), new Date());
  j = (await index.list({ [file]: { state: 'closed', at: closedAt } })).find((x) => x.file === file)!;
  assert.equal(j.status, 'open');
  assert.equal(j.editedAfterClose, true);
});

test('a date-only close compares by day', () => {
  assert.equal(writtenAfter(new Date('2026-10-07T23:00:00Z'), '2026-10-07'), false);
  assert.equal(writtenAfter(new Date('2026-10-08T00:30:00Z'), '2026-10-07'), true);
});

test('journal reads refuse anything outside the journals folder', async () => {
  const dir = await demoRepo();
  const index = createJournalIndex(path.join(dir, '.research'));
  await assert.rejects(index.read('../.lore/board.json'), /not a journal name/);
  await assert.rejects(index.read('..\\x.md'), /not a journal name/);
  assert.match(await index.read('2026-10-12-search-index.md'), /Search index rollout/);
});

test('a missing journals folder is an empty list', async () => {
  assert.deepEqual(await createJournalIndex(path.join(await demoRepo(), 'nope')).list(), []);
});
