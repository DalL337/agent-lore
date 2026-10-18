import { roleOf } from '../shared/boardOps.ts';
import { inboxItems, ownPrs, type InboxItem } from '../shared/inbox.ts';
import type { Board, Card, GhItem, HudMeta, JournalSummary, RepoState } from '../shared/types.ts';

export type JournalFilter = 'attention' | 'open' | 'stale' | 'concluded' | 'closed' | 'all';

export const state = {
  meta: null as HudMeta | null,
  board: null as Board | null,
  boardError: null as string | null,
  journals: [] as JournalSummary[],
  journalsLoaded: false,
  journalsError: null as string | null,
  repo: null as RepoState | null,
  repoLoading: false,
  journalFilter: 'attention' as JournalFilter,
  journalQuery: '',
  showAllJournals: false,
  showAllDone: false,
  /** Area key the board is filtered to (null = none). Mirrored in ?area=. */
  areaFilter: null as string | null,
  /** Policy the journals are filtered to (null = none). Mirrored in ?policy=. */
  policyFilter: null as string | null,
  /** Card id mid-drag — renders wait until the drop lands. */
  dragging: null as string | null,
};

let renderer: () => void = () => {};
let pending = false;

export function setRenderer(fn: () => void) {
  renderer = fn;
}

export function rerender() {
  if (state.dragging) {
    pending = true;
    return;
  }
  pending = false;
  renderer();
}

export function flushRender() {
  if (pending) rerender();
}

function memo<K, V>(compute: (key: K) => V): (key: K) => V {
  let lastKey: K | undefined;
  let lastValue: V | undefined;
  return (key) => {
    if (key !== lastKey || lastValue === undefined) {
      lastKey = key;
      lastValue = compute(key);
    }
    return lastValue;
  };
}

const prIndex = memo((repo: RepoState | null) => new Map((repo?.prs ?? []).map((p) => [p.number, p] as const)));
const issueIndex = memo((repo: RepoState | null) => new Map((repo?.issues ?? []).map((p) => [p.number, p] as const)));
const journalIndex = memo((list: JournalSummary[]) => new Map(list.map((j) => [j.file, j] as const)));

export const pr = (n: number): GhItem | undefined => prIndex(state.repo).get(n);
export const issue = (n: number): GhItem | undefined => issueIndex(state.repo).get(n);
export const journal = (file: string): JournalSummary | undefined => journalIndex(state.journals).get(file);

/** The journals folder as the page names it: `.research/`. */
export const journalsDir = () => `${state.meta?.journals ?? '.research'}/`;

export function cardsForJournal(file: string): Card[] {
  return (state.board?.cards ?? []).filter((c) => c.links?.journals?.includes(file));
}

/** The PRs a journal opened (window rule lives in shared/inbox.ts). */
export const journalPrs = (j: JournalSummary): GhItem[] => ownPrs(j, prIndex(state.repo));

/** Live work no card points at yet. Recomputed per render; inputs are small. */
export function inbox(): InboxItem[] {
  if (!state.board || !state.journalsLoaded) return [];
  return inboxItems(state.board, state.journals, state.repo?.prs ?? [], state.repo?.issues ?? []);
}

/** Not concluded, but every PR of its own is closed and at least one merged. */
export function journalLooksDone(j: JournalSummary): boolean {
  if (j.status === 'concluded' || j.status === 'closed') return false;
  const own = journalPrs(j);
  return own.length > 0 && own.every((p) => p.state !== 'OPEN') && own.some((p) => p.state === 'MERGED');
}

/**
 * A card whose linked PRs are all merged. Not asked of the done column, nor of
 * the review column — a review or live pass waits on merged PRs by definition.
 */
export function cardLooksDone(card: Card): boolean {
  if (!state.board) return false;
  const role = roleOf(state.board, card.column);
  if (role === 'done' || role === 'review') return false;
  const prs = card.links?.prs ?? [];
  return prs.length > 0 && prs.every((n) => pr(n)?.state === 'MERGED');
}

/** Does a journal declare or mention the policy? */
export const journalUsesPolicy = (j: JournalSummary, name: string) =>
  j.policies.declared.includes(name) || j.policies.mentioned.includes(name);
