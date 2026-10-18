// board.json store. Every mutation is an OPERATION that re-reads the file from
// disk first, so an agent editing another card in the meantime is never
// clobbered by a stale copy held in the browser. Writes are atomic (tmp +
// rename) and serialized through one queue.

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { applyMove } from '../shared/boardOps.ts';
import { INBOX_KEY } from '../shared/inbox.ts';
import { COLUMN_ROLES, type Board, type Card, type CardPatch, type JournalOverride } from '../shared/types.ts';

export class BoardError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_COLUMNS: Board['columns'] = [
  { id: 'backlog', title: 'Backlog', led: 'empty', hint: 'Captured, not sequenced', role: 'intake' },
  { id: 'next', title: 'Next', led: 'blue', hint: 'Sequenced, ready to start' },
  { id: 'doing', title: 'In progress', led: 'pulse', hint: 'Active now', role: 'active' },
  { id: 'review', title: 'Waiting on owner', led: 'amber', hint: 'Reviews, rulings, merges', role: 'review' },
  { id: 'blocked', title: 'Blocked', led: 'red', hint: 'External dependency', role: 'blocked' },
  { id: 'done', title: 'Done', led: 'green', hint: 'Merged or shipped', role: 'done' },
];

const LEDS = new Set(['empty', 'blue', 'pulse', 'amber', 'red', 'green']);

export const emptyBoard = (): Board => ({ version: 1, columns: structuredClone(DEFAULT_COLUMNS), cards: [], areas: {}, journals: {} });

export function validate(raw: unknown): Board {
  const fail = (message: string): never => {
    throw new BoardError(`board.json: ${message}`, 500);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const b = raw as Partial<Board>;
  if (!Array.isArray(b.columns) || b.columns.length === 0) fail('"columns" must be a non-empty array');
  if (!Array.isArray(b.cards)) fail('"cards" must be an array');
  const columnIds = new Set<string>();
  const roles = new Set<string>();
  for (const col of b.columns!) {
    if (!col || typeof col.id !== 'string' || typeof col.title !== 'string') fail('every column needs a string "id" and "title"');
    if (columnIds.has(col.id)) fail(`duplicate column id "${col.id}"`);
    columnIds.add(col.id);
    if (!LEDS.has(col.led)) fail(`column "${col.id}" has unknown led "${String(col.led)}"`);
    if (col.role !== undefined) {
      if (!COLUMN_ROLES.includes(col.role)) fail(`column "${col.id}" has unknown role "${String(col.role)}" (${COLUMN_ROLES.join(', ')})`);
      if (roles.has(col.role)) fail(`role "${col.role}" is on more than one column`);
      roles.add(col.role);
    }
  }
  if (b.areas !== undefined && (!b.areas || typeof b.areas !== 'object' || Array.isArray(b.areas) || Object.values(b.areas).some((v) => typeof v !== 'string'))) {
    fail('"areas" must map area keys to descriptions');
  }
  const seen = new Set<string>();
  for (const card of b.cards!) {
    if (!card || typeof card.id !== 'string' || typeof card.title !== 'string') fail('every card needs a string "id" and "title"');
    if (seen.has(card.id)) fail(`duplicate card id "${card.id}"`);
    seen.add(card.id);
    if (!columnIds.has(card.column)) fail(`card "${card.id}" is in unknown column "${card.column}"`);
    if (card.area !== undefined && !(Array.isArray(card.area) && card.area.every((a) => typeof a === 'string'))) {
      fail(`card "${card.id}": "area" must be an array of area keys`);
    }
  }
  if (b.inboxDismissed !== undefined && !(Array.isArray(b.inboxDismissed) && b.inboxDismissed.every((k) => typeof k === 'string'))) {
    fail('"inboxDismissed" must be an array of strings');
  }
  // Spread first: top-level keys this code doesn't know (an agent's addition)
  // must survive the next write.
  return { ...b, version: 1, columns: b.columns!, cards: b.cards!, journals: b.journals ?? {} };
}

export function createBoardStore(boardPath: string) {
  let queue: Promise<unknown> = Promise.resolve();
  /** Text of our own last write — lets the file watcher ignore self-writes. */
  let lastWritten = '';

  /** `create: false` reports a missing board as null instead of seeding one. */
  async function load(create: boolean): Promise<Board | null> {
    let text: string;
    try {
      text = await fs.readFile(boardPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      if (!create) return null;
      const fresh = emptyBoard();
      await write(fresh);
      return fresh;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^﻿/, ''));
    } catch (err) {
      // Never overwrite a file we cannot parse — an agent may be mid-edit.
      throw new BoardError(`board.json is not valid JSON: ${(err as Error).message}`, 500);
    }
    return validate(parsed);
  }

  const read = async (): Promise<Board> => (await load(true))!;

  async function write(board: Board): Promise<void> {
    const text = JSON.stringify(board, null, 2) + '\n';
    const tmp = `${boardPath}.tmp`;
    await fs.mkdir(path.dirname(boardPath), { recursive: true });
    await fs.writeFile(tmp, text, 'utf8');
    lastWritten = text;
    // Windows: rename-over can fail briefly while an editor or AV holds the file.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, boardPath);
        return;
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
      }
    }
  }

  /** Serialize read-modify-write operations. */
  function mutate(op: (board: Board) => void): Promise<Board> {
    const run = queue.then(async () => {
      const board = await read();
      op(board);
      validate(board);
      await write(board);
      return board;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  function findCard(board: Board, id: string): Card {
    const card = board.cards.find((c) => c.id === id);
    if (!card) throw new BoardError(`no card with id "${id}"`, 404);
    return card;
  }

  return {
    read,
    peek: () => load(false),
    isOwnWrite: (text: string) => text === lastWritten,

    move(id: string, column: string, index: number) {
      return mutate((board) => {
        if (!board.columns.some((c) => c.id === column)) throw new BoardError(`unknown column "${column}"`);
        findCard(board, id);
        applyMove(board, id, column, index, today());
      });
    },

    /**
     * Create or merge-update a card. A field left out keeps the card's value
     * (title and column included); a `null` field clears it.
     */
    upsert(input: CardPatch) {
      return mutate((board) => {
        const existing = input.id ? board.cards.find((c) => c.id === input.id) : undefined;
        const title = (input.title ?? existing?.title ?? '').trim();
        if (!title) throw new BoardError('a card needs a title');
        const column = input.column ?? existing?.column ?? board.columns[0].id;
        if (!board.columns.some((c) => c.id === column)) throw new BoardError(`unknown column "${column}"`);
        const card = existing ?? ({ id: input.id || randomUUID(), created: today() } as Card);
        Object.assign(card, input, { id: card.id, title, column, updated: today() });
        for (const key of Object.keys(card) as (keyof Card)[]) {
          if (card[key] === null) delete card[key];
        }
        if (!existing) board.cards.push(card);
      });
    },

    remove(id: string) {
      return mutate((board) => {
        const card = findCard(board, id);
        board.cards.splice(board.cards.indexOf(card), 1);
      });
    },

    /** Dismiss (or restore) one Inbox item; `key === '*'` with dismissed=false restores all. */
    setInboxDismissed(key: string, dismissed: boolean) {
      if (key !== '*' && !INBOX_KEY.test(key)) return Promise.reject(new BoardError(`not an inbox key: ${key}`));
      return mutate((board) => {
        const set = new Set(board.inboxDismissed ?? []);
        if (key === '*') set.clear();
        else if (dismissed) set.add(key);
        else set.delete(key);
        board.inboxDismissed = [...set].sort();
      });
    },

    setJournal(file: string, override: Omit<JournalOverride, 'at'> | null) {
      return mutate((board) => {
        board.journals ??= {};
        // Full timestamp: a journal edited later the same day must still read as reopened.
        if (override) board.journals[file] = { ...override, at: new Date().toISOString() };
        else delete board.journals[file];
      });
    },
  };
}

export type BoardStore = ReturnType<typeof createBoardStore>;
