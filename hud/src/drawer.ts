// Right-hand drawer: card editor and journal reader. Non-modal — the board
// stays live and usable behind it.

import type { Card, CardLinks, CardPatch } from '../shared/types.ts';
import { deleteCard, saveCard, setJournalClosed, toast } from './actions.ts';
import { api } from './api.ts';
import { areas, ghChip, parseAreas, policyChips } from './chips.ts';
import { ago, h, localStamp, mount, type Child } from './dom.ts';
import { renderMarkdown } from './markdown.ts';
import { cardsForJournal, journal, journalPrs, journalsDir, state } from './state.ts';

let drawer: HTMLElement | null = null;
let titleEl: HTMLElement;
let bodyEl: HTMLElement;
let returnFocus: HTMLElement | null = null;

function ensure() {
  if (drawer) return;
  titleEl = h('div', { class: 'drawer-title' });
  bodyEl = h('div', { class: 'drawer-body' });
  drawer = h(
    'aside',
    { class: 'drawer', 'aria-hidden': 'true', 'aria-label': 'Details' },
    h(
      'header',
      { class: 'drawer-head' },
      titleEl,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', title: 'Close (Esc)', onclick: closeDrawer }, '×'),
    ),
    bodyEl,
  );
  document.body.append(drawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('open')) closeDrawer();
  });
}

function open(title: Child, ...content: Child[]) {
  ensure();
  if (!drawer!.classList.contains('open')) returnFocus = document.activeElement as HTMLElement | null;
  mount(titleEl, title);
  mount(bodyEl, ...content);
  bodyEl.scrollTop = 0;
  drawer!.classList.add('open');
  drawer!.setAttribute('aria-hidden', 'false');
}

export function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  returnFocus?.focus?.();
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
      closeDrawer();
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
              closeDrawer();
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
      h('button', { type: 'button', class: 'pill', onclick: closeDrawer }, 'Cancel'),
      h('span', { class: 'spacer' }),
      del,
    ),
    card?.updated ? h('p', { class: 'muted small' }, `Created ${card.created ?? '—'} · updated ${card.updated} · id ${card.id}`) : null,
  );

  open(h('span', null, card ? 'Edit card' : 'New card'), form);
  title.focus();
}

// ── Journal reader ───────────────────────────────────────────────────────

export async function openJournal(file: string) {
  const j = journal(file);
  open(h('span', { class: 'mono' }, file), h('p', { class: 'muted' }, 'Loading…'));
  let text: string;
  try {
    text = (await api.journal(file)).text;
  } catch (err) {
    mount(bodyEl, h('div', { class: 'banner banner-error' }, err instanceof Error ? err.message : String(err)));
    return;
  }
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
          ? h('button', { type: 'button', class: 'pill', onclick: async () => { await setJournalClosed(file, true); void openJournal(file); } }, 'Mark closed')
          : null,
        j?.status === 'closed'
          ? h('button', { type: 'button', class: 'pill', onclick: async () => { await setJournalClosed(file, false); void openJournal(file); } }, 'Reopen')
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
