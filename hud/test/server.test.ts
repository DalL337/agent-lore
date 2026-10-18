import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startHud, type RunningHud } from '../server/main.ts';
import type { Board } from '../shared/types.ts';
import { cleanup, demoRepo } from './helpers.ts';

let hud: RunningHud;
let repo: string;
let port: number;

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: () => unknown;
}

function call(method: string, pathname: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: {
          ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text, json: () => JSON.parse(text) }));
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

before(async () => {
  repo = await demoRepo();
  const client = path.join(repo, 'client');
  await mkdir(path.join(client, 'assets'), { recursive: true });
  await writeFile(path.join(client, 'index.html'), '<!doctype html><title>t</title>');
  await writeFile(path.join(client, 'assets', 'app.js'), 'export {};');
  hud = await startHud({ repo, port: 0, clientDir: client, version: 'test' });
  port = Number(new URL(hud.url).port);
});

after(async () => {
  await hud.close();
  await cleanup();
});

test('meta describes the repository', async () => {
  const meta = (await call('GET', '/api/meta')).json() as Record<string, unknown>;
  assert.equal(meta.repo, path.basename(repo));
  assert.equal(meta.journals, '.research');
  assert.equal(meta.boardFile, '.lore/board.json');
  assert.equal(meta.version, 'test');
  const names = (meta.policies as { name: string; reserved: boolean }[]).map((p) => `${p.name}${p.reserved ? '*' : ''}`);
  assert.deepEqual(names, ['board', 'documentation', 'git', 'implementation', 'research', 'verification', 'migration*']);
});

test('board and journals read through the API', async () => {
  const board = (await call('GET', '/api/board')).json() as Board;
  assert.equal(board.cards.length, 8);
  assert.equal(board.areas?.api, 'Public API: endpoints, SDK, versioning');
  const journals = (await call('GET', '/api/journals')).json() as { file: string }[];
  assert.equal(journals.length, 5);
  const one = (await call('GET', '/api/journal?file=2026-10-12-search-index.md')).json() as { text: string };
  assert.match(one.text, /Final Conclusions/);
});

test('card create, move, update, delete', async () => {
  let board = (await call('POST', '/api/board/card', { body: { card: { title: 'From the API', column: 'next' } } })).json() as Board;
  const card = board.cards.find((c) => c.title === 'From the API')!;
  board = (await call('POST', '/api/board/move', { body: { id: card.id, column: 'doing', index: 0 } })).json() as Board;
  assert.equal(board.cards.find((c) => c.id === card.id)!.column, 'doing');
  board = (await call('POST', '/api/board/card', { body: { card: { id: card.id, title: 'Renamed', notes: 'n' } } })).json() as Board;
  assert.equal(board.cards.find((c) => c.id === card.id)!.title, 'Renamed');
  board = (await call('POST', '/api/board/delete', { body: { id: card.id } })).json() as Board;
  assert.ok(!board.cards.some((c) => c.id === card.id));
});

test('errors: 404 route and card, 400 bad body, 415 non-JSON POST', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('POST', '/api/board/delete', { body: { id: 'missing' } })).status, 404);
  assert.equal((await call('POST', '/api/board/card', { body: '[1,2', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await call('POST', '/api/board/card', { body: 'title=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await call('GET', '/api/journal?file=..%2F.lore%2Fboard.json')).status, 500);
});

test('cross-origin and non-loopback Host requests are refused', async () => {
  const cross = await call('POST', '/api/board/card', { body: { card: { title: 'x' } }, headers: { Origin: 'https://evil.test' } });
  assert.equal(cross.status, 403);
  const rebound = await call('GET', '/api/board', { headers: { Host: `evil.test:${port}` } });
  assert.equal(rebound.status, 403, 'DNS rebinding: a foreign Host never reaches the API');
  const sameOrigin = await call('GET', '/api/board', { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(sameOrigin.status, 200);
  const named = await call('GET', '/api/meta', { headers: { Host: `localhost:${port}` } });
  assert.equal(named.status, 200);
});

test('the page is served; paths outside it are not', async () => {
  const index = await call('GET', '/');
  assert.equal(index.status, 200);
  assert.match(String(index.headers['content-type']), /text\/html/);
  assert.equal(index.headers['cache-control'], 'no-store');
  const asset = await call('GET', '/assets/app.js');
  assert.match(String(asset.headers['cache-control']), /immutable/);
  assert.equal((await call('GET', '/../.lore/board.json')).status, 404);
  assert.equal((await call('GET', '/%2e%2e/.lore/board.json')).status, 404);
  assert.equal((await call('GET', '/missing.js')).status, 404);
});

test('an outside edit to the board file is pushed over the event stream; our own writes are not', async () => {
  const events: string[] = [];
  const stream = request({ host: '127.0.0.1', port, path: '/api/events' });
  const opened = new Promise<void>((resolve) => {
    stream.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        for (const m of chunk.matchAll(/^event: (\w+)/gm)) events.push(m[1]);
      });
      resolve();
    });
  });
  stream.end();
  await opened;
  await call('POST', '/api/board/card', { body: { card: { title: 'Own write', column: 'next' } } });
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(events.length, 0, `the server ignores its own write (got: ${events.join(', ')})`);
  const file = path.join(repo, '.lore', 'board.json');
  const board = JSON.parse(await readFile(file, 'utf8')) as Board;
  board.cards.push({ id: 'outside', title: 'Edited by hand', column: 'backlog' });
  await writeFile(file, JSON.stringify(board, null, 2));
  for (let i = 0; i < 40 && !events.includes('board'); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(events.includes('board'));

  // Reading a journal is not an edit, even where the OS reports the access
  // (Windows does for a file whose access time is old); editing one is.
  const journal = path.join(repo, '.research', '2026-10-16-export-format.md');
  const old = new Date(Date.now() - 40 * 86_400_000);
  await utimes(journal, old, old);
  for (let i = 0; i < 40 && !events.includes('journals'); i++) await new Promise((r) => setTimeout(r, 100));
  events.length = 0;
  await call('GET', '/api/journal?file=2026-10-16-export-format.md');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(events.length, 0, `a read pushes nothing (got: ${events.join(', ')})`);
  await appendFile(journal, '\n2. Ask the owner.\n');
  for (let i = 0; i < 40 && !events.includes('journals'); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(events.includes('journals'));
  stream.destroy();
});
