import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { brief } from '../server/main.ts';
import { cleanup, demoRepo, emptyRepo } from './helpers.ts';

after(cleanup);

test('brief lists working columns, journals and untracked journals, and points at the board policy', async () => {
  const text = await brief({ repo: await demoRepo() });
  assert.match(text, /^=== LORE board · lore-hud-demo-/);
  assert.match(text, /In progress \(1\): Empty states for first-run users/);
  assert.match(text, /Waiting on owner \(1\): Search index rollout/);
  assert.match(text, /Blocked \(1\): Webhook retries/);
  assert.doesNotMatch(text, /^Backlog \(/m, 'intake and done are summarized, not listed');
  assert.match(text, /Backlog 2 · Done 2 \(top: Retry failed writes\)/);
  assert.match(text, /Journals \(\.research\): 2 open · 1 stale · 2 concluded/);
  assert.match(text, /Inbox — active journals no card links .*2026-10-16-export-format/);
  assert.match(text, /\(lore\/policies\/board\.md\)\.$/);
});

test('brief never creates a board', async () => {
  const dir = await emptyRepo();
  const text = await brief({ repo: dir });
  assert.match(text, /No board yet/);
  assert.equal(existsSync(path.join(dir, '.lore', 'board.json')), false);
});

test('brief reports an unreadable board instead of failing', async () => {
  const dir = await demoRepo();
  await writeFile(path.join(dir, '.lore', 'board.json'), '{ nope');
  assert.match(await brief({ repo: dir }), /\.lore\/board\.json unreadable: board\.json is not valid JSON/);
});
