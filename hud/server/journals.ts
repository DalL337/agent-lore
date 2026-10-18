// Derives where each journal stands from the sections LORE's research policy
// makes every journal carry (Objective, Next Actions, Remaining Questions,
// Final Conclusions), and which policies it declares or mentions. Parsing is
// cached by mtime+size; only top-level `*.md` files are journals (subfolders
// hold tools, logs and harnesses).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JournalOverride, JournalPolicies, JournalStatus, JournalSummary } from '../shared/types.ts';

/** An open journal untouched for longer than this reads as stale. */
export const STALE_DAYS = 7;

const DAY_MS = 86_400_000;
const SAFE_NAME = /^[\w.-]+\.md$/;

interface Parsed {
  title: string;
  objective: string;
  conclusion: string | null;
  completeMarker: boolean;
  nextActions: string[];
  openQuestions: number;
  prRefs: number[];
  policies: JournalPolicies;
}

/** `## Next Actions (updated)` → `next actions`. */
function sectionKey(heading: string): string {
  return heading
    .replace(/\(.*?\)/g, '')
    .replace(/[*_`:]/g, '')
    .trim()
    .toLowerCase();
}

function splitSections(text: string): { title: string | null; sections: Map<string, string[]>; prose: string[] } {
  const sections = new Map<string, string[]>();
  const prose: string[] = [];
  let title: string | null = null;
  let current: string[] | null = null;
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      prose.push(line);
      const h1 = /^#\s+(.+)/.exec(line);
      if (h1 && title === null) {
        title = h1[1].trim();
        continue;
      }
      const h2 = /^##\s+(.+)/.exec(line);
      if (h2) {
        // Repeated headings ("Next Actions" then "Next Actions (final)"):
        // the LAST occurrence wins — it is the most recent state.
        current = [];
        sections.set(sectionKey(h2[1]), current);
        continue;
      }
    }
    current?.push(line);
  }
  return { title, sections, prose };
}

/** Markdown → one plain line for summaries. */
function collapse(lines: string[] | undefined, max: number): string {
  if (!lines) return '';
  const text = lines
    .join('\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '· ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^· /, '')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const LIST_ITEM = /^( ?)(?:[-*+]|\d+[.)])\s+(.*)$/;

function topLevelItems(lines: string[] | undefined): string[] {
  if (!lines) return [];
  const items: string[] = [];
  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    if (!m) continue;
    const body = m[2].trim();
    if (/^\[[xX]\]/.test(body) || /^~~/.test(body)) continue; // done / struck
    items.push(body.replace(/^\[ \]\s*/, ''));
  }
  return items;
}

const EMPTYISH = /^[\s(_*~—–-]*(pending|tbd|todo|none yet|not yet|n\/a|to be written|tbd\.)?[\s)_*.~—–-]*$/i;
/** A Next Actions list that only says the work is over ("None.", "Closed."). */
const NOTHING_NEXT = /^[*_~\s]*(none|closed|done|nothing|n\/a|complete|completed|shipped|merged|fixed)\b/i;
const COMPLETE = /^\s*[*_]*status[*_]*\s*:\s*[*_]*\s*(complete|completed|done|closed|shipped|merged|fixed)\b/im;
const PR_REF = /(?<![\w&/])#(\d{2,4})\b/g;
/** `Policies: research, implementation` / `**Policies:** research` / `- Policies: …` */
const POLICIES_LINE = /^\s*(?:[-*]\s+)?[*_]{0,2}policies[*_]{0,2}\s*:[*_]{0,2}\s*(.+)$/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A policy to look for in journal text: its name, and its file stem when
 * the file says more (`persistent-research-policy.md` → stem
 * `persistent-research-policy`, name `persistent-research`).
 */
export type PolicyKey = string | { name: string; stem?: string };

/** Names on the first `Policies:` line, normalized (`policies/research.md` → `research`). */
export function declaredPolicies(prose: string[]): string[] {
  for (const line of prose) {
    const m = POLICIES_LINE.exec(line);
    if (!m) continue;
    const names = m[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .split(/[\s,;·|]+/)
      .map((t) =>
        t
          .replace(/[`*_[\]()]/g, '')
          .replace(/^(?:\.\.\/)*(?:lore\/)?(?:policies\/)?(?:reserved\/)?/i, '')
          .replace(/\.md$/i, '')
          .replace(/-policy$/i, '')
          .toLowerCase(),
      )
      .filter((t) => /^[a-z0-9][a-z0-9-]*$/.test(t) && t !== 'policy' && t !== 'and');
    return [...new Set(names)];
  }
  return [];
}

/**
 * Known policies the text refers to — by file (`research.md`,
 * `persistent-research-policy.md`) or by name ("research policy") — minus
 * the declared ones.
 */
export function mentionedPolicies(text: string, policies: PolicyKey[], declared: string[]): string[] {
  const out: string[] = [];
  for (const p of policies) {
    const { name, stem } = typeof p === 'string' ? { name: p, stem: undefined } : p;
    if (declared.includes(name) || out.includes(name)) continue;
    const files = [...new Set([name, stem ?? name])].map(escapeRe).join('|');
    const e = escapeRe(name);
    if (new RegExp(`(?:^|[^\\w-])(?:${files})\\.md\\b|(?:^|[^\\w-])${e}[ -]polic(?:y|ies)\\b`, 'i').test(text)) out.push(name);
  }
  return out;
}

export function parseJournal(text: string, fallbackTitle: string, policyNames: PolicyKey[] = []): Parsed {
  const { title, sections, prose } = splitSections(text);
  const conclusionText = collapse(sections.get('final conclusions') ?? sections.get('final conclusion'), 360);
  const prRefs = [...new Set([...text.matchAll(PR_REF)].map((m) => Number(m[1])))].sort((a, b) => b - a);
  const nextLines = sections.get('next actions');
  const next = topLevelItems(nextLines);
  const nothingNext = next.length
    ? next.every((item) => NOTHING_NEXT.test(item))
    : NOTHING_NEXT.test(collapse(nextLines, 80));
  const declared = declaredPolicies(prose);
  return {
    title: title ?? fallbackTitle,
    objective: collapse(
      sections.get('objective') ?? sections.get('current objective') ?? sections.get('original request'),
      320,
    ),
    conclusion: EMPTYISH.test(conclusionText) ? null : conclusionText,
    completeMarker: COMPLETE.test(text) || nothingNext,
    nextActions: next.slice(0, 8).map((s) => (s.length > 220 ? `${s.slice(0, 219)}…` : s)),
    openQuestions: topLevelItems(sections.get('remaining questions')).filter((q) => !/✅|resolved|answered/i.test(q)).length,
    prRefs,
    policies: { declared, mentioned: mentionedPolicies(text, policyNames, declared) },
  };
}

/**
 * Was the journal written after it was closed? A close never touches the file,
 * so a later mtime means someone picked the work back up. A bare YYYY-MM-DD
 * close (hand-written) compares at day precision: only a later day counts.
 */
export function writtenAfter(mtime: Date, closedAt: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(closedAt)) return mtime.toISOString().slice(0, 10) > closedAt;
  const at = Date.parse(closedAt);
  return Number.isFinite(at) && mtime.getTime() > at;
}

export function createJournalIndex(journalsDir: string, policyNames: () => PolicyKey[] = () => []) {
  const cache = new Map<string, { key: string; parsed: Parsed }>();

  function resolve(file: string): string {
    if (!SAFE_NAME.test(file)) throw new Error(`not a journal name: ${file}`);
    const full = path.join(journalsDir, file);
    if (path.dirname(full) !== path.resolve(journalsDir)) throw new Error(`outside the journals folder: ${file}`);
    return full;
  }

  async function list(overrides: Record<string, JournalOverride> = {}): Promise<JournalSummary[]> {
    let names: string[];
    try {
      names = (await fs.readdir(journalsDir, { withFileTypes: true }))
        .filter((d) => d.isFile() && d.name.endsWith('.md'))
        .map((d) => d.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const known = policyNames();
    const knownKey = JSON.stringify(known);
    const now = Date.now();
    const out = await Promise.all(
      names.map(async (file): Promise<JournalSummary> => {
        const full = path.join(journalsDir, file);
        const stat = await fs.stat(full);
        const key = `${stat.mtimeMs}:${stat.size}:${knownKey}`;
        let hit = cache.get(file);
        if (!hit || hit.key !== key) {
          const slug = file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]/g, ' ');
          hit = { key, parsed: parseJournal(await fs.readFile(full, 'utf8'), slug, known) };
          cache.set(file, hit);
        }
        const p = hit.parsed;
        const ageDays = Math.floor((now - stat.mtimeMs) / DAY_MS);
        const override = overrides[file];
        const closed = override?.state === 'closed';
        const editedAfterClose = closed && writtenAfter(stat.mtime, override.at);
        let status: JournalStatus;
        if (closed && !editedAfterClose) status = 'closed';
        else if (p.conclusion !== null || p.completeMarker) status = 'concluded';
        else status = ageDays > STALE_DAYS ? 'stale' : 'open';
        return {
          file,
          date: /^\d{4}-\d{2}-\d{2}/.exec(file)?.[0] ?? stat.mtime.toISOString().slice(0, 10),
          title: p.title,
          objective: p.objective,
          status,
          conclusion: p.conclusion,
          nextActions: p.nextActions,
          openQuestions: p.openQuestions,
          modified: stat.mtime.toISOString(),
          ageDays,
          prRefs: p.prRefs,
          policies: p.policies,
          override,
          editedAfterClose,
        };
      }),
    );
    for (const name of cache.keys()) if (!names.includes(name)) cache.delete(name);
    return out.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async function read(file: string): Promise<string> {
    return fs.readFile(resolve(file), 'utf8');
  }

  return { list, read };
}

export type JournalIndex = ReturnType<typeof createJournalIndex>;
