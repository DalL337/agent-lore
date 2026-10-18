// Entry points for the `lore` CLI: `startHud` serves the HUD for one
// repository; `brief` prints the board summary agents see at session start.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { columnWithRole } from '../shared/boardOps.ts';
import { inboxItems } from '../shared/inbox.ts';
import type { Board, HudMeta } from '../shared/types.ts';
import { createBoardStore } from './board.ts';
import { boardIgnored, display, listPolicies, resolveConfig, type HudConfig } from './config.ts';
import { createHudServer } from './http.ts';
import { createJournalIndex } from './journals.ts';
import { createRepoState } from './repo.ts';

export interface StartOptions {
  repo: string;
  /** Data folder (board, settings); defaults to <repo>/.lore. Outside the repo, the HUD never writes into it. */
  data?: string;
  port?: number;
  version?: string;
  /** Built page; defaults to the client build next to this server build. */
  clientDir?: string | null;
}

export interface RunningHud {
  url: string;
  config: HudConfig;
  meta: HudMeta;
  close(): Promise<void>;
}

const DEFAULT_PORT = 5199;
const PORT_TRIES = 10;

function defaultClientDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, '..', 'client'), path.join(here, '..', 'dist', 'client')]) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

function services(config: HudConfig, version: string) {
  const board = createBoardStore(config.boardPath);
  const policyNames = () => listPolicies(config).map((p) => ({ name: p.name, stem: path.basename(p.path, '.md') }));
  const journals = createJournalIndex(config.journalsDir, policyNames);
  const meta = (): HudMeta => ({
    repo: config.repoName,
    journals: display(config, config.journalsDir),
    boardFile: display(config, config.boardPath),
    policies: listPolicies(config),
    boardIgnored: boardIgnored(config),
    version,
  });
  return { board, journals, meta };
}

export async function startHud(options: StartOptions): Promise<RunningHud> {
  const config = resolveConfig(options.repo, options.data);
  const { board, journals, meta } = services(config, options.version ?? 'dev');
  const hud = createHudServer({
    board,
    journals,
    repo: createRepoState(config.repoRoot),
    meta,
    clientDir: options.clientDir === undefined ? defaultClientDir() : options.clientDir,
    watch: { boardPath: config.boardPath, journalsDir: config.journalsDir },
  });

  // A taken port tries the next few (unless one was asked for explicitly: 0 = any).
  const first = options.port ?? DEFAULT_PORT;
  const tries = options.port === undefined ? PORT_TRIES : 1;
  let port = first;
  for (let i = 0; ; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        hud.server.once('error', reject);
        hud.server.listen(port, '127.0.0.1', () => {
          hud.server.off('error', reject);
          resolve();
        });
      });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || i + 1 >= tries) throw err;
      port += 1;
    }
  }
  const address = hud.server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { url: `http://127.0.0.1:${actual}`, config, meta: meta(), close: hud.close };
}

const MAX_TITLES = 6;
const clip = (s: string, n = 52) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The board in a few lines, for an agent's session start. Offline and
 * read-only: it never creates the board and never calls GitHub.
 */
export async function brief(options: { repo: string; data?: string }): Promise<string> {
  const config = resolveConfig(options.repo, options.data);
  const { board: store, journals, meta } = services(config, 'brief');
  const m = meta();
  const out = [`=== LORE board · ${m.repo} (${m.boardFile} · \`lore hud\` to open it) ===`];

  let board: Board | null = null;
  try {
    board = await store.peek();
    if (!board) {
      out.push(`No board yet. Ask the owner whether to bootstrap one, or run \`lore hud\` to start an empty board.`);
    } else if (board.cards.length === 0) {
      out.push(`The board is empty: bootstrap it with the owner (read the repository, propose areas and cards, write what they approve).`);
    } else {
      const quiet = new Set([columnWithRole(board, 'intake')?.id, columnWithRole(board, 'done')?.id]);
      for (const col of board.columns) {
        const cards = board.cards.filter((c) => c.column === col.id);
        if (quiet.has(col.id) || !cards.length) continue;
        const titles = cards.slice(0, MAX_TITLES).map((c) => clip(c.title));
        const more = cards.length > MAX_TITLES ? ` · +${cards.length - MAX_TITLES}` : '';
        out.push(`${col.title} (${cards.length}): ${titles.join(' · ')}${more}`);
      }
      const intake = columnWithRole(board, 'intake');
      const done = columnWithRole(board, 'done');
      const count = (id?: string) => board!.cards.filter((c) => c.column === id).length;
      const top = done && board.cards.find((c) => c.column === done.id);
      const tail = [
        intake ? `${intake.title} ${count(intake.id)}` : null,
        done ? `${done.title} ${count(done.id)}${top ? ` (top: ${clip(top.title, 44)})` : ''}` : null,
      ].filter(Boolean);
      if (tail.length) out.push(tail.join(' · '));
    }
  } catch (err) {
    out.push(`${m.boardFile} unreadable: ${(err as Error).message} — fix it before relying on the board.`);
  }

  try {
    const list = await journals.list(board?.journals ?? {});
    const by = (s: string) => list.filter((j) => j.status === s);
    const open = by('open');
    if (list.length) {
      out.push(
        `Journals (${m.journals}): ${open.length} open · ${by('stale').length} stale · ${by('concluded').length} concluded` +
          (open.length ? ` — newest open: ${open.slice(0, 3).map((j) => clip(j.file.replace(/\.md$/, ''), 40)).join(', ')}` : ''),
      );
    }
    if (board && board.cards.length) {
      // Same rule as the page's Inbox, minus GitHub (the brief stays offline).
      const untracked = inboxItems(board, list, [], []);
      if (untracked.length) {
        out.push(
          `Inbox — active journals no card links (add or link a card if this is your work): ` +
            untracked.slice(0, 4).map((i) => clip((i.file ?? i.label).replace(/\.md$/, ''), 44)).join(', ') +
            (untracked.length > 4 ? ` · +${untracked.length - 4}` : ''),
        );
      }
    }
  } catch {
    // The journal summary is a nicety; the board lines above are what matter.
  }

  const policy = m.policies.find((p) => p.name === 'board');
  out.push(
    `Keep the board current: when work moves — it starts, a PR opens or merges, a ruling is owed — update ${m.boardFile} in the same session` +
      (policy ? ` (${policy.path}).` : '.'),
  );
  return out.join('\n');
}
