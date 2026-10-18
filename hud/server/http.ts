// The HUD's local server: the built page, the API (`/api/*`), and a
// Server-Sent Events stream (`/api/events`) that pushes `board` when
// board.json changes on disk (an agent edited it) and `journals` when a
// journal changes. Node built-ins only.
//
// It binds to loopback and answers only requests addressed to loopback by
// name or address (the Host check defeats DNS rebinding), refuses
// cross-origin requests, and takes POST bodies as JSON only, so a page on
// another site cannot drive the board through the owner's browser.

import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { CardPatch, HudMeta } from '../shared/types.ts';
import { BoardError, type BoardStore } from './board.ts';
import type { JournalIndex } from './journals.ts';

export interface HudContext {
  board: BoardStore;
  journals: JournalIndex;
  repo: { get(force?: boolean): Promise<unknown> };
  meta(): HudMeta;
  /** Built page (index.html + assets), or null to serve the API alone. */
  clientDir: string | null;
  /** Directories to watch: board file's folder, journals folder. */
  watch: { boardPath: string; journalsDir: string };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new BoardError('request body too large', 413);
    chunks.push(chunk as Buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object') throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new BoardError('request body must be a JSON object');
  }
}

/** Names, mtimes and sizes of the watched files: what counts as a change. */
async function snapshot(dir: string, accept: (file: string) => boolean): Promise<string> {
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter(accept).sort();
  const parts = await Promise.all(
    names.map(async (f) => {
      const s = await fs.stat(path.join(dir, f)).catch(() => null);
      return s ? `${f}:${s.mtimeMs}:${s.size}` : '';
    }),
  );
  return parts.join('|');
}

/**
 * Debounced fs.watch on one directory that fires only when a watched file's
 * name, mtime or size changed. Windows also reports access-time updates, so
 * merely reading an old journal would otherwise count as an edit. A missing
 * directory (no journals yet) or a dropped watcher is retried, so a folder
 * created later still goes live.
 */
function watchDir(dir: string, accept: (file: string) => boolean, fire: () => void) {
  let watcher: FSWatcher | null = null;
  let timer: NodeJS.Timeout | undefined;
  let last: Promise<string> = snapshot(dir, accept);
  const settle = async () => {
    const [before, now] = [await last, await snapshot(dir, accept)];
    last = Promise.resolve(now);
    if (now !== before) fire();
  };
  const arm = () => {
    if (watcher) return;
    try {
      watcher = watch(dir, (_event, file) => {
        if (file && !accept(file.toString())) return;
        clearTimeout(timer);
        timer = setTimeout(() => void settle(), 200);
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      watcher = null;
    }
  };
  arm();
  const retry = setInterval(arm, 3000);
  retry.unref();
  return () => {
    clearInterval(retry);
    clearTimeout(timer);
    watcher?.close();
  };
}

const LOOPBACK = (host: string | undefined, port: number) =>
  host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;

async function serveStatic(req: IncomingMessage, res: ServerResponse, clientDir: string) {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  } catch {
    return send(res, 400, { error: 'bad path' });
  }
  if (pathname === '/') pathname = '/index.html';
  const root = path.resolve(clientDir);
  const full = path.resolve(root, `.${pathname}`);
  if (!full.startsWith(root + path.sep)) return send(res, 404, { error: 'not found' });
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return send(res, 404, { error: 'not found' });
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream');
    // Built assets carry content hashes; the page itself must always be fresh.
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.end();
    res.end(await fs.readFile(full));
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function createHudServer(ctx: HudContext): { server: Server; close(): Promise<void> } {
  const clients = new Set<ServerResponse>();
  const push = (event: string) => {
    for (const res of clients) res.write(`event: ${event}\ndata: {}\n\n`);
  };

  const stopBoard = watchDir(path.dirname(ctx.watch.boardPath), (f) => f === path.basename(ctx.watch.boardPath), async () => {
    const text = await fs.readFile(ctx.watch.boardPath, 'utf8').catch(() => '');
    if (!ctx.board.isOwnWrite(text)) push('board');
  });
  const stopJournals = watchDir(ctx.watch.journalsDir, (f) => f.endsWith('.md'), () => push('journals'));
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25_000);
  heartbeat.unref();

  async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    const route = `${req.method} ${url.pathname.slice(4)}`;
    const origin = req.headers.origin;
    if (origin && (origin === 'null' || new URL(origin).host !== req.headers.host)) {
      throw new BoardError('cross-origin request refused', 403);
    }
    if (req.method === 'POST' && !String(req.headers['content-type']).startsWith('application/json')) {
      throw new BoardError('POST bodies must be application/json', 415);
    }
    switch (route) {
      case 'GET /meta':
        return send(res, 200, ctx.meta());
      case 'GET /events': {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      case 'GET /board':
        return send(res, 200, await ctx.board.read());
      case 'POST /board/move': {
        const b = await readJson(req);
        return send(res, 200, await ctx.board.move(String(b.id), String(b.column), Number(b.index)));
      }
      case 'POST /board/card': {
        const b = await readJson(req);
        return send(res, 200, await ctx.board.upsert((b.card ?? {}) as CardPatch));
      }
      case 'POST /board/delete': {
        const b = await readJson(req);
        return send(res, 200, await ctx.board.remove(String(b.id)));
      }
      case 'POST /board/journal': {
        const b = await readJson(req);
        const override = b.state === 'closed' ? { state: 'closed' as const, note: b.note ? String(b.note) : undefined } : null;
        return send(res, 200, await ctx.board.setJournal(String(b.file), override));
      }
      case 'POST /board/inbox': {
        const b = await readJson(req);
        return send(res, 200, await ctx.board.setInboxDismissed(String(b.key), b.dismissed !== false));
      }
      case 'GET /journals': {
        const overrides = (await ctx.board.read().catch(() => null))?.journals ?? {};
        return send(res, 200, await ctx.journals.list(overrides));
      }
      case 'GET /journal': {
        const file = url.searchParams.get('file') ?? '';
        return send(res, 200, { file, text: await ctx.journals.read(file) });
      }
      case 'GET /repo':
        return send(res, 200, await ctx.repo.get(url.searchParams.has('force')));
      default:
        return send(res, 404, { error: `no route ${route}` });
    }
  }

  const server = createServer(async (req, res) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    if (!LOOPBACK(req.headers.host, port)) return send(res, 403, { error: 'this server answers loopback requests only' });
    const url = new URL(req.url ?? '/', 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if ((req.method === 'GET' || req.method === 'HEAD') && ctx.clientDir) return await serveStatic(req, res, ctx.clientDir);
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      const status = err instanceof BoardError ? err.status : 500;
      if (!res.headersSent) send(res, status, { error: (err as Error).message });
      else res.end();
    }
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        stopBoard();
        stopJournals();
        clearInterval(heartbeat);
        for (const res of clients) res.end();
        clients.clear();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
