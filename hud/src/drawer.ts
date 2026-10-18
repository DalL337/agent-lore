// Right-hand drawer: the Journals and GitHub panels, the journal reader, and
// the card editor. It is a stack — a panel, then a journal opened from it,
// then a card opened from that — with a back step, and it starts below the
// top bar so the nav and counts stay reachable while it is open.
//
// Push (the board narrows beside it) or overlay (it covers the board's
// right edge), chosen in its header and remembered per browser. Narrow
// windows always overlay: pushing there would leave the board no room.

import type { Card, CardLinks, CardPatch } from '../shared/types.ts';
import { deleteCard, saveCard, setJournalClosed, toast } from './actions.ts';
import { api } from './api.ts';
import { areas, ghChip, parseAreas, policyChips } from './chips.ts';
import { ago, h, localStamp, mount, type Child } from './dom.ts';
import { renderGithub } from './github.ts';
import { renderJournals } from './journals.ts';
import { renderMarkdown } from './markdown.ts';
import { cardsForJournal, journal, journalPrs, journalsDir, rerender, state, writePref } from './state.ts';

export type Panel = 'journals' | 'github';

type Entry =
  | { kind: 'journals' }
  | { kind: 'github' }
  | { kind: 'journal'; file: string }
  | { kind: 'card'; card: Card | null; column?: string };

const PANEL_TITLE: Record<Panel, string> = { journals: 'Journals', github: 'GitHub' };
/** Below this width the drawer overlays whatever the setting says. */
const PUSH_MIN_WIDTH = 1200;

const stack: Entry[] = [];
let drawer: HTMLElement | null = null;
let headEl: HTMLElement;
let bodyEl: HTMLElement;
let returnFocus: HTMLElement | null = null;
const wide = window.matchMedia(`(min-width: ${PUSH_MIN_WIDTH}px)`);

// The panels are long-lived elements: their search box and scroll position
// survive moving between a panel and a journal opened from it.
const panels: Record<Panel, HTMLElement> = {
  journals: h('div', { class: 'panel-body' }),
  github: h('div', { class: 'panel-body' }),
};

const top = () => stack[stack.length - 1];
const isPanel = (e: Entry | undefined): e is { kind: Panel } => e?.kind === 'journals' || e?.kind === 'github';

/** The panel the drawer is showing at its root, if it is open on one. */
export const openPanelName = (): Panel | null => (drawer?.classList.contains('open') && isPanel(stack[0]) ? stack[0].kind : null);

function ensure() {
  if (drawer) return;
  headEl = h('header', { class: 'drawer-head' });
  bodyEl = h('div', { class: 'drawer-body' });
  drawer = h('aside', { id: 'drawer', class: 'drawer', 'aria-hidden': 'true', 'aria-label': 'Details' }, headEl, bodyEl);
  document.body.append(drawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('open')) {
      e.preventDefault();
      back();
    }
  });
  wide.addEventListener('change', () => {
    layout();
    if (drawer?.classList.contains('open')) renderHead();
  });
}

/** Push or overlay, as set and as the window allows. */
function layout() {
  const open = !!drawer?.classList.contains('open');
  const push = open && state.drawerMode === 'push' && wide.matches;
  document.body.classList.toggle('drawer-push', push);
  drawer?.setAttribute('data-mode', push ? 'push' : 'overlay');
}

function modeSwitch() {
  // Show what is in effect: a narrow window overlays whatever the setting says.
  const effective = wide.matches ? state.drawerMode : 'overlay';
  const option = (mode: 'push' | 'overlay', label: string, title: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg',
        'aria-pressed': String(effective === mode),
        disabled: !wide.matches,
        title: wide.matches ? title : 'Push needs a wider window; the drawer overlays here',
        onclick: () => {
          state.drawerMode = mode;
          writePref('drawer-mode', mode);
          layout();
          renderHead();
        },
      },
      label,
    );
  return h(
    'span',
    { class: 'segmented', role: 'group', 'aria-label': 'Drawer placement' },
    option('push', 'Push', 'Narrow the board beside the drawer; nothing is covered'),
    option('overlay', 'Overlay', 'Cover the board’s right edge; the board keeps its width'),
  );
}

function entryTitle(e: Entry): Child {
  switch (e.kind) {
    case 'journals':
    case 'github':
      return PANEL_TITLE[e.kind];
    case 'journal':
      return h('span', { class: 'mono' }, e.file);
    case 'card':
      return e.card ? 'Edit card' : 'New card';
  }
}

function backLabel(e: Entry): string {
  if (isPanel(e)) return PANEL_TITLE[e.kind];
  if (e.kind === 'journal') return 'Journal';
  return 'Card';
}

function renderHead() {
  const prev = stack[stack.length - 2];
  mount(
    headEl,
    prev
      ? h('button', { type: 'button', class: 'pill pill-quiet drawer-back', title: 'Back (Esc)', onclick: back }, `← ${backLabel(prev)}`)
      : null,
    h('div', { class: 'drawer-title' }, entryTitle(top())),
    modeSwitch(),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', title: 'Close', onclick: closeDrawer }, '×'),
  );
  drawer!.setAttribute('aria-label', typeof entryTitle(top()) === 'string' ? (entryTitle(top()) as string) : 'Journal');
}

/** Mirror the open panel in the query string so a refresh reopens it. */
function syncUrl() {
  const url = new URL(location.href);
  const panel = openPanelName();
  if (panel) url.searchParams.set('panel', panel);
  else url.searchParams.delete('panel');
  if (panel === 'journals' && state.journalFilter !== 'attention') url.searchParams.set('jf', state.journalFilter);
  else url.searchParams.delete('jf');
  history.replaceState(null, '', url);
}

/** Render whatever is on top of the stack. */
function show() {
  ensure();
  if (!drawer!.classList.contains('open')) returnFocus = document.activeElement as HTMLElement | null;
  // Visible before rendering: the editor focuses its title, and a hidden
  // element cannot take focus.
  drawer!.classList.add('open');
  drawer!.setAttribute('aria-hidden', 'false');
  const entry = top();
  renderHead();
  switch (entry.kind) {
    case 'journals':
      renderJournals(panels.journals);
      mount(bodyEl, panels.journals);
      break;
    case 'github':
      renderGithub(panels.github);
      mount(bodyEl, panels.github);
      break;
    case 'journal':
      void renderReader(entry.file);
      break;
    case 'card':
      renderEditor(entry.card, entry.column);
      break;
  }
  if (!isPanel(entry)) bodyEl.scrollTop = 0;
  layout();
  syncUrl();
  rerender(); // nav and counts reflect the open panel
}

/** Nav and counts: open a panel at the root, or close it if it is already showing. */
export function togglePanel(panel: Panel) {
  if (openPanelName() === panel && stack.length === 1) closeDrawer();
  else openPanel(panel);
}

export function openPanel(panel: Panel) {
  stack.length = 0;
  stack.push({ kind: panel });
  show();
}

/** One step back; closing when the stack runs out. */
export function back() {
  stack.pop();
  if (stack.length) show();
  else closeDrawer();
}

export function closeDrawer() {
  stack.length = 0;
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  layout();
  syncUrl();
  returnFocus?.focus?.();
  rerender();
}

/** Keep an open panel live as the board, journals, and GitHub data change. */
export function renderDrawer() {
  const entry = top();
  if (!drawer?.classList.contains('open') || !isPanel(entry)) return;
  if (entry.kind === 'journals') renderJournals(panels.journals);
  else renderGithub(panels.github);
}

// ── Card editor ──────────────────────────────────────────────────────────

/** "76-83, 108" → [76..83, 108] */
function parseNumbers(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[\s,]+/)) {
    const range = /^#?(\d+)\s*[-–]\s*#?(\d+)$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let n = Math.min(a, b); n <= Math.max(a, b) && out.length < 500; n++) out.push(n);
    } else {
      const n = Number(part.replace(/^#/, ''));
      if (Number.isInteger(n) && n > 0) out.push(n);
    }
  }
  return [...new Set(out)];
}

/** [76..83, 108] → "76-83, 108" */
function formatNumbers(list: number[] = []): string {
  const sorted = [...list].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j;
  }
  return parts.join(', ');
}

const list = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function field(label: string, control: HTMLElement, hint?: string) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function openCardEditor(card: Card | null, column?: string) {
  if (!state.board) return;
  const current = top();
  // Re-opening the card already on top replaces it rather than stacking a copy.
  if (current?.kind === 'card' && drawer?.classList.contains('open')) stack.pop();
  stack.push({ kind: 'card', card, column });
  show();
}

function renderEditor(card: Card | null, column?: string) {
  const board = state.board;
  if (!board) return;
  const links = card?.links ?? {};
  const known = areas();
  const knownKeys = Object.keys(known);
  const title = h('input', { name: 'title', required: true, value: card?.title ?? '', placeholder: 'What needs doing?' });
  const col = h(
    'select',
    { name: 'column' },
    board.columns.map((c) => h('option', { value: c.id, selected: c.id === (card?.column ?? column ?? board.columns[0].id) }, c.title)),
  );
  const area = h('input', { name: 'area', value: (card?.area ?? []).join(' '), placeholder: knownKeys.slice(0, 2).join(' ') || 'api ui' });
  const notes = h('textarea', { name: 'notes', rows: '5', value: card?.notes ?? '' });
  const journals = h('textarea', { name: 'journals', rows: '2', value: (links.journals ?? []).join('\n'), placeholder: '2026-10-07-search-index.md' });
  const pick = h(
    'select',
    {
      class: 'pick',
      'aria-label': 'Link a journal',
      onchange: () => {
        if (!pick.value) return;
        const current = list(journals.value);
        if (!current.includes(pick.value)) journals.value = [...current, pick.value].join('\n');
        pick.value = '';
      },
    },
    h('option', { value: '' }, 'Link a recent journal…'),
    state.journals.slice(0, 60).map((j) => h('option', { value: j.file }, `${j.date}  ${j.title}`)),
  );
  const prs = h('input', { name: 'prs', value: formatNumbers(links.prs), placeholder: '108, 76-83' });
  const issues = h('input', { name: 'issues', value: formatNumbers(links.issues), placeholder: '12' });
  const docs = h('input', { name: 'docs', value: (links.docs ?? []).join(', '), placeholder: 'docs/adrs/012-storage.md' });
  const error = h('p', { class: 'field-error', role: 'alert' });

  const submit = async () => {
    const picked = parseAreas(area.value);
    const linkSet: CardLinks = {
      journals: list(journals.value),
      prs: parseNumbers(prs.value),
      issues: parseNumbers(issues.value),
      docs: list(docs.value),
    };
    for (const [k, v] of Object.entries(linkSet)) if (!v.length) delete linkSet[k as keyof CardLinks];
    // null = clear: an emptied field must overwrite what the card had.
    const payload: CardPatch = {
      ...card,
      title: title.value.trim(),
      column: col.value,
      area: picked.length ? picked : null,
      notes: notes.value.trim() || null,
      links: Object.keys(linkSet).length ? linkSet : null,
    };
    try {
      await saveCard(payload);
      back();
      toast(card ? 'Card saved' : 'Card added');
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : String(err);
    }
  };

  let armed = false;
  const del = card
    ? h(
        'button',
        {
          type: 'button',
          class: 'pill pill-danger',
          onclick: async () => {
            if (!armed) {
              armed = true;
              del!.textContent = 'Click again to delete';
              return;
            }
            try {
              await deleteCard(card.id);
              back();
              toast('Card deleted');
            } catch (err) {
              error.textContent = err instanceof Error ? err.message : String(err);
            }
          },
        },
        'Delete',
      )
    : null;

  const form = h(
    'form',
    {
      class: 'editor',
      onsubmit: (e: Event) => {
        e.preventDefault();
        void submit();
      },
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void submit();
        }
      },
    },
    field('Title', title),
    h(
      'div',
      { class: 'field-row' },
      field('Column', col),
      field(
        'Areas',
        area,
        knownKeys.length
          ? Object.entries(known).map(([k, v]) => `${k} ${v.split(':')[0]}`).join(' · ')
          : `No areas yet: add them under "areas" in ${state.meta?.boardFile ?? 'the board file'}`,
      ),
    ),
    field('Notes', notes),
    field('Journals', h('div', { class: 'stack' }, journals, pick), `One filename per line, from ${journalsDir()}`),
    h('div', { class: 'field-row' }, field('PRs', prs, 'Ranges work: 76-83'), field('Issues', issues)),
    field('Docs', docs, 'Repo-relative paths, comma-separated'),
    error,
    h(
      'div',
      { class: 'editor-actions' },
      h('button', { type: 'submit', class: 'pill pill-primary' }, card ? 'Save' : 'Add card'),
      h('button', { type: 'button', class: 'pill', onclick: back }, 'Cancel'),
      h('span', { class: 'spacer' }),
      del,
    ),
    card?.updated ? h('p', { class: 'muted small' }, `Created ${card.created ?? '—'} · updated ${card.updated} · id ${card.id}`) : null,
  );

  mount(bodyEl, form);
  title.focus();
}

// ── Journal reader ───────────────────────────────────────────────────────

export function openJournal(file: string) {
  const current = top();
  if (current?.kind === 'journal' && drawer?.classList.contains('open')) stack.pop();
  stack.push({ kind: 'journal', file });
  show();
}

async function renderReader(file: string) {
  const j = journal(file);
  mount(bodyEl, h('p', { class: 'muted' }, 'Loading…'));
  let text: string;
  try {
    text = (await api.journal(file)).text;
  } catch (err) {
    mount(bodyEl, h('div', { class: 'banner banner-error' }, err instanceof Error ? err.message : String(err)));
    return;
  }
  // The reader may have been left while the text loaded.
  const now = top();
  if (now?.kind !== 'journal' || now.file !== file) return;
  const cards = cardsForJournal(file);
  const own = j ? journalPrs(j) : [];
  const closable = j && (j.status === 'open' || j.status === 'stale');
  const body = h('div', { class: 'md' });
  body.innerHTML = renderMarkdown(text);

  mount(
    bodyEl,
    h(
      'div',
      { class: 'jmeta' },
      j ? h('span', { class: 'status-tag', 'data-status': j.status }, j.status) : null,
      j ? h('span', { class: 'muted' }, `started ${j.date} · touched ${ago(j.modified)}`) : null,
      h(
        'span',
        { class: 'jmeta-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'pill pill-quiet',
            onclick: () => {
              void navigator.clipboard?.writeText(`${journalsDir()}${file}`).then(() => toast('Path copied'));
            },
          },
          'Copy path',
        ),
        closable
          ? h('button', { type: 'button', class: 'pill', onclick: async () => { await setJournalClosed(file, true); show(); } }, 'Mark closed')
          : null,
        j?.status === 'closed'
          ? h('button', { type: 'button', class: 'pill', onclick: async () => { await setJournalClosed(file, false); show(); } }, 'Reopen')
          : null,
      ),
    ),
    j?.editedAfterClose
      ? h('p', { class: 'hint hint-amber' }, `Reopened: edited after you closed it on ${localStamp(j.override?.at)}.`)
      : null,
    own.length ? h('div', { class: 'card-links' }, own.slice(0, 8).map((p) => ghChip(p.number, p))) : null,
    j ? policyChips(j) : null,
    cards.length
      ? h(
          'div',
          { class: 'jmeta-cards' },
          h('span', { class: 'muted small' }, 'On the board:'),
          cards.map((c) => h('button', { type: 'button', class: 'chip chip-card', onclick: () => openCardEditor(c) }, c.title)),
        )
      : null,
    body,
  );
}
