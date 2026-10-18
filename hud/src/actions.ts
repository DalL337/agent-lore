import { applyMove } from '../shared/boardOps.ts';
import type { InboxItem } from '../shared/inbox.ts';
import type { CardPatch } from '../shared/types.ts';
import { api } from './api.ts';
import { h, todayIso } from './dom.ts';
import { rerender, state } from './state.ts';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function toast(text: string, kind: 'info' | 'error' = 'info') {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${kind}` }, text);
  host.append(el);
  setTimeout(() => el.classList.add('toast-out'), kind === 'error' ? 6000 : 2600);
  setTimeout(() => el.remove(), kind === 'error' ? 6400 : 3000);
}

export async function loadMeta() {
  try {
    state.meta = await api.meta();
    document.title = `${state.meta.repo} · LORE HUD`;
  } catch (err) {
    toast(`HUD: ${message(err)}`, 'error');
  }
  rerender();
}

export async function loadBoard() {
  try {
    state.board = await api.board();
    state.boardError = null;
  } catch (err) {
    state.boardError = message(err);
  }
  rerender();
}

export async function loadJournals() {
  try {
    state.journals = await api.journals();
    state.journalsError = null;
  } catch (err) {
    state.journalsError = message(err);
  }
  state.journalsLoaded = true;
  rerender();
}

export async function loadRepo(force = false) {
  state.repoLoading = true;
  rerender();
  try {
    state.repo = await api.repo(force);
  } catch (err) {
    toast(`GitHub: ${message(err)}`, 'error');
  }
  state.repoLoading = false;
  rerender();
}

export async function moveCard(id: string, column: string, index: number) {
  if (!state.board) return;
  const before = structuredClone(state.board);
  const from = state.board.cards.find((c) => c.id === id)?.column;
  try {
    applyMove(state.board, id, column, index, todayIso());
  } catch {
    return;
  }
  rerender();
  try {
    state.board = await api.move(id, column, index);
    if (from !== column) {
      toast(`Moved to ${state.board.columns.find((c) => c.id === column)?.title ?? column}`);
    }
  } catch (err) {
    state.board = before;
    toast(`Move failed: ${message(err)}`, 'error');
  }
  rerender();
}

/** Throws so the editor can show the error next to the field. */
export async function saveCard(card: CardPatch) {
  state.board = await api.saveCard(card);
  rerender();
}

export async function deleteCard(id: string) {
  state.board = await api.deleteCard(id);
  rerender();
}

/** Mirror a lens in the query string so a refresh keeps it; the #hash stays free for the nav links. */
function setParam(name: string, value: string | null) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  history.replaceState(null, '', url);
}

/** Area filter: a visual lens (non-matching cards dim, nothing is hidden or locked). */
export function setAreaFilter(area: string | null) {
  state.areaFilter = area;
  setParam('area', area);
  rerender();
}

/** Clicking the active key clears; any other key replaces it. */
export const toggleAreaFilter = (area: string) => setAreaFilter(state.areaFilter === area ? null : area);

/** Policy filter: the same lens over the journals. */
export function setPolicyFilter(policy: string | null) {
  state.policyFilter = policy;
  setParam('policy', policy);
  rerender();
}

export const togglePolicyFilter = (policy: string) => setPolicyFilter(state.policyFilter === policy ? null : policy);

/** One click: the Inbox item becomes a card in its suggested column. */
export async function makeCardFrom(item: InboxItem) {
  try {
    state.board = await api.saveCard({ ...item.suggest });
    rerender();
    const column = state.board.columns.find((c) => c.id === item.suggest.column)?.title ?? item.suggest.column;
    toast(`Added to ${column}. Click the card to edit it.`);
  } catch (err) {
    toast(message(err), 'error');
  }
}

export async function setInboxDismissed(key: string, dismissed: boolean) {
  try {
    state.board = await api.inboxDismiss(key, dismissed);
    rerender();
  } catch (err) {
    toast(message(err), 'error');
  }
}

export async function setJournalClosed(file: string, closed: boolean) {
  try {
    state.board = await api.closeJournal(file, closed);
    await loadJournals();
    toast(closed ? 'Journal marked closed' : 'Journal reopened');
  } catch (err) {
    toast(message(err), 'error');
  }
}
