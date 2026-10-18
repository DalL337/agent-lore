import type { Board, CardPatch, HudMeta, JournalSummary, RepoState } from '../shared/types.ts';

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  meta: () => call<HudMeta>('GET', '/meta'),
  board: () => call<Board>('GET', '/board'),
  move: (id: string, column: string, index: number) => call<Board>('POST', '/board/move', { id, column, index }),
  saveCard: (card: CardPatch) => call<Board>('POST', '/board/card', { card }),
  deleteCard: (id: string) => call<Board>('POST', '/board/delete', { id }),
  /** key '*' with dismissed=false restores every dismissed item. */
  inboxDismiss: (key: string, dismissed: boolean) => call<Board>('POST', '/board/inbox', { key, dismissed }),
  closeJournal: (file: string, closed: boolean) =>
    call<Board>('POST', '/board/journal', { file, state: closed ? 'closed' : null }),
  journals: () => call<JournalSummary[]>('GET', '/journals'),
  journal: (file: string) => call<{ file: string; text: string }>('GET', `/journal?file=${encodeURIComponent(file)}`),
  repo: (force = false) => call<RepoState>('GET', force ? '/repo?force=1' : '/repo'),
};
