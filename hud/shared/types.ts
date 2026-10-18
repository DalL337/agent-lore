// Shapes shared by the HUD server (server/) and the page (src/).
// board.json is hand-editable by agents: keep every field optional except the
// ones the board cannot render without (id, title, column).

export type Led = 'empty' | 'blue' | 'pulse' | 'amber' | 'red' | 'green';

/**
 * What a column means to the HUD, independent of its id or title: where Inbox
 * items land (intake: issues, active: journals, review: PRs), which column
 * collapses (done), and which counts the header shows.
 */
export type ColumnRole = 'intake' | 'active' | 'review' | 'blocked' | 'done';

export const COLUMN_ROLES: readonly ColumnRole[] = ['intake', 'active', 'review', 'blocked', 'done'];

export interface Column {
  id: string;
  title: string;
  led: Led;
  hint?: string;
  role?: ColumnRole;
}

export interface CardLinks {
  /** Journal filenames in the configured journals folder, e.g. `2026-10-07-search-index.md`. */
  journals?: string[];
  prs?: number[];
  issues?: number[];
  /** Repo-relative paths, e.g. `docs/adrs/012-storage.md`. */
  docs?: string[];
}

export interface Card {
  id: string;
  title: string;
  column: string;
  /** Area keys from the board's `areas`. */
  area?: string[];
  notes?: string;
  links?: CardLinks;
  created?: string;
  updated?: string;
}

/** A card edit: `null` clears a field (absent leaves it untouched). */
export type CardPatch = { [K in keyof Card]?: Card[K] | null };

export interface JournalOverride {
  state: 'closed';
  note?: string;
  /** When it was closed: ISO timestamp (a bare YYYY-MM-DD is read at day precision). */
  at: string;
}

export interface Board {
  version: 1;
  columns: Column[];
  cards: Card[];
  /** The repository's area taxonomy: key → description. Cards carry the keys. */
  areas?: Record<string, string>;
  /** Owner marks on journals (the journal files themselves are never edited). */
  journals?: Record<string, JournalOverride>;
  /** Inbox items the owner chose not to track: `pr:120`, `issue:7`, `journal:<file>`. */
  inboxDismissed?: string[];
}

export type JournalStatus = 'open' | 'stale' | 'concluded' | 'closed';

export interface JournalPolicies {
  /** Named on the journal's `Policies:` line. */
  declared: string[];
  /** Only referred to in the text (`research.md`, "research policy"). */
  mentioned: string[];
}

export interface JournalSummary {
  file: string;
  /** YYYY-MM-DD from the filename, else from mtime. */
  date: string;
  title: string;
  objective: string;
  status: JournalStatus;
  conclusion: string | null;
  nextActions: string[];
  openQuestions: number;
  /** ISO mtime — last time anyone wrote to the journal. */
  modified: string;
  ageDays: number;
  /** `#123` / `PR #123` references found in the text, newest number first. */
  prRefs: number[];
  policies: JournalPolicies;
  override?: JournalOverride;
  /** Closed by the owner, then written to afterwards — so it counts as live again. */
  editedAfterClose: boolean;
}

export interface PolicyRef {
  name: string;
  /** Repo-relative path, forward slashes. */
  path: string;
  reserved: boolean;
}

/** What the page needs to know about the repository it is showing. */
export interface HudMeta {
  repo: string;
  /** Journals folder, repo-relative. */
  journals: string;
  /** Board file, repo-relative. */
  boardFile: string;
  policies: PolicyRef[];
  /** false when git would show the board file as untracked (not ignored); null outside git. */
  boardIgnored: boolean | null;
  version: string;
}

export interface GhItem {
  number: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  headRefName?: string;
  isDraft?: boolean;
  labels?: string[];
}

export interface GitState {
  branch: string;
  head: string;
  subject: string;
  /** Lines in `git status --porcelain`. */
  dirty: number;
}

export interface RepoState {
  fetchedAt: string;
  /** Set when gh failed; prs/issues then hold the last good fetch (or nothing). */
  error?: string;
  /** With `error`: true when prs/issues come from an earlier successful fetch. */
  lastGood?: boolean;
  prs: GhItem[];
  issues: GhItem[];
  release: { tag: string; publishedAt: string; url: string } | null;
  git: GitState | null;
}
