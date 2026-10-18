import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { createBoardStore, DEFAULT_COLUMNS, validate } from '../server/board.ts';
import type { Board } from '../shared/types.ts';
import { cleanup, demoRepo, emptyRepo } from './helpers.ts';

after(cleanup);

const boardFile = (dir: string) => path.join(dir, '.lore', 'board.json');

test('a missing board is created with the default columns and roles on first read', async () => {
  const dir = await emptyRepo();
  const store = createBoardStore(boardFile(dir));
  assert.equal(await store.peek(), null, 'peek never creates the file');
  const board = await store.read();
  assert.deepEqual(board.columns.map((c) => c.role ?? null), DEFAULT_COLUMNS.map((c) => c.role ?? null));
  assert.deepEqual(board.cards, []);
  assert.deepEqual(board.areas, {});
  assert.ok(JSON.parse(await readFile(boardFile(dir), 'utf8')).version === 1);
});

test('upsert creates, merges, and null clears a field', async () => {
  const store = createBoardStore(boardFile(await emptyRepo()));
  let board = await store.upsert({ title: '  Write the docs  ', column: 'next', notes: 'draft', area: ['ops'] });
  const card = board.cards[0];
  assert.equal(card.title, 'Write the docs');
  assert.ok(card.id && card.created && card.updated);
  board = await store.upsert({ id: card.id, notes: null, links: { prs: [4] } });
  const updated = board.cards.find((c) => c.id === card.id)!;
  assert.equal(updated.notes, undefined);
  assert.deepEqual(updated.links, { prs: [4] });
  assert.deepEqual(updated.area, ['ops'], 'fields left out of a patch stay');
  assert.equal(updated.title, 'Write the docs', 'a patch without a title keeps the title');
  assert.equal(updated.column, 'next', 'a patch without a column never moves the card');
  await assert.rejects(store.upsert({ title: ' ' }), /needs a title/);
  await assert.rejects(store.upsert({ title: 'x', column: 'nope' }), /unknown column/);
});

test('move reorders within and across columns', async () => {
  const store = createBoardStore(boardFile(await demoRepo()));
  let board = await store.move('csv-import', 'next', 0);
  assert.deepEqual(board.cards.filter((c) => c.column === 'next').map((c) => c.id), ['csv-import', 'rate-limits']);
  board = await store.move('csv-import', 'next', 5);
  assert.deepEqual(board.cards.filter((c) => c.column === 'next').map((c) => c.id), ['rate-limits', 'csv-import']);
  await assert.rejects(store.move('missing', 'next', 0), /no card/);
});

test('an agent editing the file between operations is never clobbered', async () => {
  const file = boardFile(await demoRepo());
  const store = createBoardStore(file);
  await store.read();
  const onDisk = JSON.parse(await readFile(file, 'utf8')) as Board;
  onDisk.cards.push({ id: 'agent-card', title: 'Added by an agent', column: 'backlog' });
  (onDisk as unknown as Record<string, unknown>).agentNote = 'kept';
  await writeFile(file, JSON.stringify(onDisk));
  const board = await store.move('csv-import', 'done', 0);
  assert.ok(board.cards.some((c) => c.id === 'agent-card'));
  assert.equal((board as unknown as Record<string, unknown>).agentNote, 'kept', 'unknown top-level keys survive writes');
});

test('an unparseable board is reported and left untouched', async () => {
  const file = boardFile(await demoRepo());
  await writeFile(file, '{ "version": 1, "cards": [');
  const store = createBoardStore(file);
  await assert.rejects(store.upsert({ title: 'x' }), /not valid JSON/);
  assert.equal(await readFile(file, 'utf8'), '{ "version": 1, "cards": [');
});

test('validation: duplicate ids, unknown columns, roles and areas', () => {
  const base = (): Board => ({ version: 1, columns: structuredClone(DEFAULT_COLUMNS), cards: [], areas: {} });
  const dup = base();
  dup.cards = [{ id: 'a', title: 'A', column: 'next' }, { id: 'a', title: 'B', column: 'next' }];
  assert.throws(() => validate(dup), /duplicate card id/);
  const lost = base();
  lost.cards = [{ id: 'a', title: 'A', column: 'gone' }];
  assert.throws(() => validate(lost), /unknown column/);
  const twoDone = base();
  twoDone.columns[1].role = 'done';
  assert.throws(() => validate(twoDone), /more than one column/);
  const badRole = base();
  (badRole.columns[1] as { role: string }).role = 'later';
  assert.throws(() => validate(badRole), /unknown role/);
  const badAreas = base() as unknown as { areas: unknown };
  badAreas.areas = ['api'];
  assert.throws(() => validate(badAreas), /"areas" must map/);
  const badLed = base();
  (badLed.columns[0] as { led: string }).led = 'purple';
  assert.throws(() => validate(badLed), /unknown led/);
});

test('inbox dismissals take valid keys only and restore all with *', async () => {
  const store = createBoardStore(boardFile(await demoRepo()));
  await store.setInboxDismissed('pr:12', true);
  let board = await store.setInboxDismissed('journal:2026-10-16-export-format.md', true);
  assert.deepEqual(board.inboxDismissed, ['journal:2026-10-16-export-format.md', 'pr:12']);
  await assert.rejects(store.setInboxDismissed('journal:../x.md', true), /not an inbox key/);
  board = await store.setInboxDismissed('*', false);
  assert.deepEqual(board.inboxDismissed, []);
});

test('closing a journal stamps a full timestamp; null reopens', async () => {
  const store = createBoardStore(boardFile(await demoRepo()));
  let board = await store.setJournal('2026-10-15-empty-states.md', { state: 'closed' });
  assert.match(board.journals!['2026-10-15-empty-states.md'].at, /T\d{2}:\d{2}/);
  board = await store.setJournal('2026-10-15-empty-states.md', null);
  assert.equal(board.journals!['2026-10-15-empty-states.md'], undefined);
});
