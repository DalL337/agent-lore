// The Inbox: live work no card points at yet — open PRs, active journals, open
// issues. Pure, so the page and the agents' session brief compute the same list.

import { columnWithRole } from './boardOps.ts';
import type { Board, CardLinks, ColumnRole, GhItem, JournalSummary } from './types.ts';

export type InboxKind = 'pr' | 'journal' | 'issue';

export interface InboxItem {
  /** Dismiss key: `pr:120`, `issue:7`, `journal:<file>`. */
  key: string;
  kind: InboxKind;
  label: string;
  title: string;
  /** ISO time used for ordering and "ago". */
  when: string;
  url?: string;
  file?: string;
  /** What "Make card" creates. */
  suggest: { title: string; column: string; links: CardLinks };
}

/** A journal's own PRs are opened while its work runs; older numbers are citations. */
export const OWN_PR_WINDOW_DAYS = 21;

const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The PRs a journal's text points at that belong to ITS work: opened from the
 * day before the journal started to three weeks after. Older numbers in the
 * text are citations of earlier work, not this journal's PRs.
 */
export function ownPrs(j: JournalSummary, prs: Map<number, GhItem>): GhItem[] {
  const from = shiftDays(j.date, -1);
  const to = shiftDays(j.date, OWN_PR_WINDOW_DAYS);
  const out: GhItem[] = [];
  for (const n of j.prRefs) {
    const p = prs.get(n);
    const opened = p?.createdAt?.slice(0, 10);
    if (p && opened && opened >= from && opened <= to) out.push(p);
  }
  return out;
}

/** "fix(scaffold): yarn installs…" → "Yarn installs…" */
export function cleanPrTitle(title: string): string {
  const t = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim() || title;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "2026-10-01 — P4: `x`" / "Review (2026-10-05)" / "X — 2026-10-07" → the bare name. */
export function cleanJournalTitle(title: string): string {
  return (
    title
      .replace(/^\d{4}-\d{2}-\d{2}\s*[—–-]\s*/, '')
      .replace(/\s*[—–-]\s*\(?\d{4}-\d{2}-\d{2}\)?\s*$/, '')
      .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
      .replace(/`/g, '')
      .trim() || title
  );
}

export const INBOX_KEY = /^(pr|issue):\d+$|^journal:[\w.-]+\.md$/;

/** Where an Inbox kind lands: the first role the board assigns, else the first column. */
function landing(board: Board, roles: ColumnRole[]): string {
  for (const role of roles) {
    const col = columnWithRole(board, role);
    if (col) return col.id;
  }
  return board.columns[0].id;
}

export function inboxItems(
  board: Board,
  journals: JournalSummary[],
  prs: GhItem[],
  issues: GhItem[],
): InboxItem[] {
  const prMap = new Map(prs.map((p) => [p.number, p] as const));
  const dismissed = new Set(board.inboxDismissed ?? []);
  const linkedPrs = new Set<number>();
  const linkedIssues = new Set<number>();
  const linkedJournals = new Set<string>();
  for (const c of board.cards) {
    c.links?.prs?.forEach((n) => linkedPrs.add(n));
    c.links?.issues?.forEach((n) => linkedIssues.add(n));
    c.links?.journals?.forEach((f) => linkedJournals.add(f));
  }
  // A journal on the board covers the PRs it opened.
  const own = new Map(journals.map((j) => [j.file, ownPrs(j, prMap)] as const));
  for (const f of linkedJournals) own.get(f)?.forEach((p) => linkedPrs.add(p.number));

  const prColumn = landing(board, ['review', 'active']);
  const journalColumn = landing(board, ['active']);
  const issueColumn = landing(board, ['intake']);

  const active = journals.filter((j) => j.status === 'open');
  const items: InboxItem[] = [];
  const prItems = new Set<number>();

  for (const p of prs) {
    if (p.state !== 'OPEN' || linkedPrs.has(p.number) || dismissed.has(`pr:${p.number}`)) continue;
    const withJournals = active.filter((j) => own.get(j.file)?.some((x) => x.number === p.number)).map((j) => j.file);
    prItems.add(p.number);
    items.push({
      key: `pr:${p.number}`,
      kind: 'pr',
      label: `#${p.number}`,
      title: p.title,
      when: p.updatedAt,
      url: p.url,
      suggest: {
        title: cleanPrTitle(p.title),
        column: prColumn,
        links: { prs: [p.number], ...(withJournals.length ? { journals: withJournals } : {}) },
      },
    });
  }

  for (const j of active) {
    if (linkedJournals.has(j.file) || dismissed.has(`journal:${j.file}`)) continue;
    const mine = own.get(j.file) ?? [];
    // Tracked through its PR, or already offered as part of a PR item above.
    if (mine.some((p) => linkedPrs.has(p.number) || prItems.has(p.number))) continue;
    items.push({
      key: `journal:${j.file}`,
      kind: 'journal',
      label: j.date,
      title: j.title,
      when: j.modified,
      file: j.file,
      suggest: {
        title: cleanJournalTitle(j.title),
        column: journalColumn,
        links: { journals: [j.file], ...(mine.length ? { prs: mine.map((p) => p.number) } : {}) },
      },
    });
  }

  for (const i of issues) {
    if (i.state !== 'OPEN' || linkedIssues.has(i.number) || dismissed.has(`issue:${i.number}`)) continue;
    items.push({
      key: `issue:${i.number}`,
      kind: 'issue',
      label: `#${i.number}`,
      title: i.title,
      when: i.updatedAt,
      url: i.url,
      suggest: { title: i.title, column: issueColumn, links: { issues: [i.number] } },
    });
  }

  return items.sort((a, b) => b.when.localeCompare(a.when));
}
