import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_COLUMNS } from '../server/board.ts';
import { cleanJournalTitle, cleanPrTitle, inboxItems, ownPrs } from '../shared/inbox.ts';
import type { Board, GhItem, JournalSummary } from '../shared/types.ts';

const board = (cards: Board['cards'] = [], extra: Partial<Board> = {}): Board => ({
  version: 1,
  columns: structuredClone(DEFAULT_COLUMNS),
  cards,
  ...extra,
});

const journal = (file: string, status: JournalSummary['status'], prRefs: number[] = []): JournalSummary => ({
  file,
  date: file.slice(0, 10),
  title: file,
  objective: '',
  status,
  conclusion: null,
  nextActions: [],
  openQuestions: 0,
  modified: `${file.slice(0, 10)}T12:00:00Z`,
  ageDays: 0,
  prRefs,
  policies: { declared: [], mentioned: [] },
  editedAfterClose: false,
});

const pr = (number: number, createdAt: string, state: GhItem['state'] = 'OPEN'): GhItem => ({
  number,
  title: `feat: change ${number}`,
  state,
  url: `https://example.test/pull/${number}`,
  createdAt,
  updatedAt: createdAt,
});

test('open PRs, open journals and open issues no card links are listed, newest first', () => {
  const items = inboxItems(
    board(),
    [journal('2026-10-10-a.md', 'open'), journal('2026-10-01-b.md', 'stale')],
    [pr(5, '2026-10-12T00:00:00Z'), pr(4, '2026-10-02T00:00:00Z', 'MERGED')],
    [{ ...pr(2, '2026-10-11T00:00:00Z'), title: 'Bug' }],
  );
  assert.deepEqual(items.map((i) => i.key), ['pr:5', 'issue:2', 'journal:2026-10-10-a.md']);
});

test('items land in the column carrying their role', () => {
  const items = inboxItems(board(), [journal('2026-10-10-a.md', 'open')], [pr(5, '2026-10-12T00:00:00Z')], [pr(2, '2026-10-11T00:00:00Z')]);
  const where = Object.fromEntries(items.map((i) => [i.kind, i.suggest.column]));
  assert.deepEqual(where, { pr: 'review', issue: 'backlog', journal: 'doing' });
});

test('a board without roles lands everything in its first column (PRs fall back to active)', () => {
  const plain = board([], { columns: [{ id: 'todo', title: 'To do', led: 'empty' }, { id: 'wip', title: 'WIP', led: 'pulse', role: 'active' }] });
  const items = inboxItems(plain, [], [pr(5, '2026-10-12T00:00:00Z')], [pr(2, '2026-10-11T00:00:00Z')]);
  assert.deepEqual(Object.fromEntries(items.map((i) => [i.kind, i.suggest.column])), { pr: 'wip', issue: 'todo' });
});

test('linked work is covered; a journal on the board covers the PRs it opened', () => {
  const j = journal('2026-10-10-a.md', 'open', [7, 3]);
  const prs = [pr(7, '2026-10-11T00:00:00Z'), pr(3, '2026-08-01T00:00:00Z')];
  const items = inboxItems(board([{ id: 'c', title: 'C', column: 'doing', links: { journals: [j.file] } }]), [j], prs, []);
  assert.deepEqual(items.map((i) => i.key), ['pr:3'], '#7 is the journal\'s own PR; #3 is an older citation');
});

test('an open PR and the active journal that opened it are one item carrying both links', () => {
  const j = journal('2026-10-10-a.md', 'open', [7]);
  const items = inboxItems(board(), [j], [pr(7, '2026-10-11T00:00:00Z')], []);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].suggest.links, { prs: [7], journals: [j.file] });
});

test('dismissed items stay hidden', () => {
  const items = inboxItems(board([], { inboxDismissed: ['pr:5', 'issue:2'] }), [], [pr(5, '2026-10-12T00:00:00Z')], [pr(2, '2026-10-11T00:00:00Z')]);
  assert.deepEqual(items, []);
});

test('own PRs: opened from the day before the journal to three weeks after', () => {
  const j = journal('2026-10-10-a.md', 'open', [1, 2, 3]);
  const map = new Map([
    [1, pr(1, '2026-10-09T08:00:00Z')],
    [2, pr(2, '2026-10-31T08:00:00Z')],
    [3, pr(3, '2026-11-02T08:00:00Z')],
  ]);
  assert.deepEqual(ownPrs(j, map).map((p) => p.number), [1, 2]);
});

test('titles are cleaned for suggested cards', () => {
  assert.equal(cleanPrTitle('fix(scaffold): yarn installs twice'), 'Yarn installs twice');
  assert.equal(cleanJournalTitle('2026-10-01 — P4: `graph` query'), 'P4: graph query');
  assert.equal(cleanJournalTitle('Review (2026-10-05)'), 'Review');
});
