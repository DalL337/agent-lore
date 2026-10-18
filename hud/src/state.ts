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
  /** Push narrows the board beside the drawer; overlay covers it. Remembered per browser. */
  drawerMode: (readPref('drawer-mode') === 'overlay' ? 'overlay' : 'push') as 'push' | 'overlay',
  /** Columns the owner stacked or dealt out by hand (column id → stacked); the rest follow their role. */
  stackOverrides: {} as Record<string, boolean>,
};

/**
 * Per-viewer conveniences (drawer mode, stacked columns) live in this
 * browser's storage; a private window or blocked storage just means the
 * defaults every time.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`lore-hud:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`lore-hud:${key}`, value);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

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

/**
 * Is a column stacked (cards as overlapping title strips)? The owner's
 * choice wins; otherwise the low-attention columns stack: intake and done.
 */
export function isStacked(columnId: string): boolean {
  if (columnId in state.stackOverrides) return state.stackOverrides[columnId];
  const role = state.board ? roleOf(state.board, columnId) : undefined;
  return role === 'intake' || role === 'done';
}

/** Stack overrides are per repository: column ids repeat across boards. */
export function loadStackOverrides() {
  try {
    const raw = readPref(`stacked:${state.meta?.repo ?? ''}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    state.stackOverrides = parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    state.stackOverrides = {};
  }
}

export function setStacked(columnId: string, stacked: boolean) {
  state.stackOverrides = { ...state.stackOverrides, [columnId]: stacked };
  writePref(`stacked:${state.meta?.repo ?? ''}`, JSON.stringify(state.stackOverrides));
  rerender();
}

/** Does a journal declare or mention the policy? */
export const journalUsesPolicy = (j: JournalSummary, name: string) =>
  j.policies.declared.includes(name) || j.policies.mentioned.includes(name);
