import { roleOf } from '../shared/boardOps.ts';
import type { Card, Column } from '../shared/types.ts';
import { moveCard, setAreaFilter, toggleAreaFilter } from './actions.ts';
import { areaName, ghChip, ledColor } from './chips.ts';
import { h, mount } from './dom.ts';
import { openCardEditor, openJournal } from './drawer.ts';
import { cardLooksDone, flushRender, issue, journal, journalsDir, pr, rerender, state } from './state.ts';

const DONE_PREVIEW = 8;

const shortJournal = (file: string) => {
  const slug = file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return slug.length > 26 ? `${slug.slice(0, 25)}…` : slug;
};

function linksRow(card: Card) {
  const links = card.links ?? {};
  const chips: HTMLElement[] = [];
  for (const file of links.journals ?? []) {
    const j = journal(file);
    chips.push(
      h(
        'button',
        {
          type: 'button',
          class: 'chip chip-journal',
          'data-status': state.journalsLoaded ? (j?.status ?? 'missing') : 'loading',
          title: j ? `${j.title} — ${j.status}` : `${file} — not in ${journalsDir()}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            void openJournal(file);
          },
        },
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        shortJournal(file),
      ),
    );
  }
  const prs = links.prs ?? [];
  if (prs.length > 3 && !state.repo) {
    // No GitHub data yet: show the count only, never a fake "0/N merged".
    chips.push(h('span', { class: 'chip chip-gh', 'data-state': 'UNKNOWN', title: 'GitHub data still loading' }, h('span', { class: 'mono' }, `${prs.length} PRs`)));
  } else if (prs.length > 3) {
    const merged = prs.filter((n) => pr(n)?.state === 'MERGED').length;
    const open = prs.some((n) => pr(n)?.state === 'OPEN');
    chips.push(
      h(
        'span',
        {
          class: 'chip chip-gh',
          'data-state': open ? 'OPEN' : merged === prs.length ? 'MERGED' : 'MIXED',
          title: prs.map((n) => `#${n} ${pr(n)?.state.toLowerCase() ?? '?'} ${pr(n)?.title ?? ''}`).join('\n'),
        },
        h('span', { class: 'mono' }, `${prs.length} PRs`),
        ` ${merged}/${prs.length} merged`,
      ),
    );
  } else {
    for (const n of prs) chips.push(ghChip(n, pr(n)));
  }
  for (const n of links.issues ?? []) chips.push(ghChip(n, issue(n), 'issue'));
  for (const doc of links.docs ?? []) {
    chips.push(h('span', { class: 'chip chip-quiet', title: doc }, doc.split('/').pop() ?? doc));
  }
  return chips.length ? h('div', { class: 'card-links' }, chips) : null;
}

// ── Drag and drop ────────────────────────────────────────────────────────

let dropLine: HTMLElement | null = null;
const line = () => (dropLine ??= h('div', { class: 'drop-line', 'aria-hidden': 'true' }));

function dropIndex(body: HTMLElement, y: number) {
  const cards = [...body.querySelectorAll<HTMLElement>('.card:not(.dragging)')];
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return { index: i, before: cards[i] as Element | null };
  }
  return { index: cards.length, before: null };
}

function wireDrop(body: HTMLElement, column: string) {
  body.addEventListener('dragover', (e) => {
    if (!state.dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    body.classList.add('drop-target');
    const { before } = dropIndex(body, e.clientY);
    const ph = line();
    if (before) {
      if (ph.nextSibling !== before) body.insertBefore(ph, before);
    } else if (body.lastElementChild !== ph) {
      body.append(ph);
    }
  });
  body.addEventListener('dragleave', (e) => {
    if (body.contains(e.relatedTarget as Node | null)) return;
    body.classList.remove('drop-target');
    if (dropLine?.parentElement === body) dropLine.remove();
  });
  body.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = state.dragging ?? e.dataTransfer?.getData('text/plain');
    const { index } = dropIndex(body, e.clientY);
    body.classList.remove('drop-target');
    dropLine?.remove();
    state.dragging = null;
    if (id) void moveCard(id, column, index);
  });
}

async function keyboardMove(card: Card, e: KeyboardEvent) {
  const board = state.board;
  if (!board) return;
  const cols = board.columns.map((c) => c.id);
  const inColumn = board.cards.filter((c) => c.column === card.column);
  const at = inColumn.indexOf(card);
  let target: [string, number] | null = null;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const next = cols[cols.indexOf(card.column) + (e.key === 'ArrowLeft' ? -1 : 1)];
    if (next) target = [next, 0];
  } else if (e.key === 'ArrowUp' && at > 0) {
    target = [card.column, at - 1];
  } else if (e.key === 'ArrowDown' && at < inColumn.length - 1) {
    target = [card.column, at + 1];
  }
  if (!target) return;
  e.preventDefault();
  await moveCard(card.id, ...target);
  document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(card.id)}"]`)?.focus();
}

// ── Rendering ────────────────────────────────────────────────────────────

const matchesFilter = (card: Card) => !state.areaFilter || !!card.area?.includes(state.areaFilter);

function areaChip(a: string) {
  const active = state.areaFilter === a;
  const name = areaName(a);
  return h(
    'button',
    {
      type: 'button',
      class: 'area',
      'aria-pressed': String(active),
      title: active ? `${name}. Click to clear the filter.` : `${name}. Click to filter the board to ${a}.`,
      onclick: (e: Event) => {
        e.stopPropagation(); // the card's own click opens the editor
        toggleAreaFilter(a);
      },
    },
    a,
  );
}

function renderCard(card: Card) {
  const filtered = !!state.areaFilter;
  const el = h(
    'article',
    {
      class: `card${filtered ? (matchesFilter(card) ? ' is-match' : ' is-dim') : ''}`,
      tabindex: '0',
      draggable: 'true',
      'data-id': card.id,
      'aria-label': `${card.title}. Enter to open, Alt+arrows to move.`,
      onclick: () => openCardEditor(card),
      onkeydown: (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget) return; // keys on a chip button stay the chip's
        if (e.altKey) void keyboardMove(card, e);
        else if (e.key === 'Enter') openCardEditor(card);
      },
    },
    card.area?.length ? h('div', { class: 'card-areas' }, card.area.map(areaChip)) : null,
    h('h3', { class: 'card-title' }, card.title),
    card.notes ? h('p', { class: 'card-notes' }, card.notes) : null,
    linksRow(card),
    cardLooksDone(card) ? h('p', { class: 'hint' }, 'Every linked PR is merged. Move to Done?') : null,
  );
  el.addEventListener('dragstart', (e) => {
    state.dragging = card.id;
    e.dataTransfer?.setData('text/plain', card.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dropLine?.remove();
    document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    state.dragging = null;
    flushRender();
  });
  return el;
}

function renderColumn(col: Column) {
  const all = state.board!.cards.filter((c) => c.column === col.id);
  const filter = state.areaFilter;
  const matching = filter ? all.filter(matchesFilter).length : all.length;
  const isDone = roleOf(state.board!, col.id) === 'done';
  // While filtering, the done column shows everything: a match must never hide below the fold.
  const collapsed = isDone && all.length > DONE_PREVIEW && !state.showAllDone && !filter;
  const shown = collapsed ? all.slice(0, DONE_PREVIEW) : all;
  const body = h(
    'div',
    { class: 'col-body', 'data-column': col.id },
    shown.map(renderCard),
    all.length === 0 ? h('p', { class: 'col-empty' }, 'Nothing here') : null,
  );
  wireDrop(body, col.id);
  return h(
    'section',
    { class: 'col', style: `--led: var(--led-${ledColor(col.led)})`, 'aria-label': col.title },
    h(
      'header',
      { class: 'col-head' },
      h('span', { class: 'led', 'data-led': col.led, 'aria-hidden': 'true' }),
      h('h2', null, col.title),
      filter
        ? h(
            'span',
            {
              class: `count${matching ? ' count-match' : ''}`,
              title: `${matching} of ${all.length} cards in ${col.title} are ${filter}`,
            },
            `${matching} / ${all.length}`,
          )
        : h('span', { class: 'count' }, String(all.length)),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          title: `Add a card to ${col.title}`,
          'aria-label': `Add a card to ${col.title}`,
          onclick: () => openCardEditor(null, col.id),
        },
        '+',
      ),
    ),
    col.hint ? h('p', { class: 'col-hint' }, col.hint) : null,
    body,
    isDone && all.length > DONE_PREVIEW && !filter
      ? h(
          'button',
          {
            type: 'button',
            class: 'pill pill-quiet col-more',
            onclick: () => {
              state.showAllDone = !state.showAllDone;
              rerender();
            },
          },
          state.showAllDone ? 'Show fewer' : `Show all ${all.length}`,
        )
      : null,
  );
}

/** "Filtering: api, Public API · 13 cards ✕" — says what's dimmed and why. */
export function renderFilterPill(root: HTMLElement) {
  const a = state.areaFilter;
  if (!a || !state.board) {
    mount(root);
    return;
  }
  const count = state.board.cards.filter(matchesFilter).length;
  const name = areaName(a).split(':')[0];
  mount(
    root,
    h(
      'span',
      { class: 'filter-pill', role: 'status' },
      h('span', { class: 'area area-static', 'aria-hidden': 'true' }, a),
      h('span', null, 'Filtering: ', h('strong', null, name)),
      h('span', { class: 'muted' }, `· ${count} card${count === 1 ? '' : 's'}`),
      h(
        'button',
        { type: 'button', class: 'filter-clear', title: 'Clear the filter (Esc)', 'aria-label': 'Clear the filter', onclick: () => setAreaFilter(null) },
        '✕',
      ),
    ),
  );
}

/** First run: what the board is for and how it fills. */
function welcome() {
  return h(
    'section',
    { class: 'welcome panel', 'aria-label': 'Getting started' },
    h('h2', null, 'This board is empty'),
    h(
      'ul',
      null,
      h('li', null, h('strong', null, 'Tracked work: '), 'the Inbox above lists open PRs, open issues and active journals. ', h('em', null, 'Make card'), ' turns each into a card.'),
      h('li', null, h('strong', null, 'Everything else: '), 'ask your agent to bootstrap the board. It reads the repository, proposes areas and cards, and writes the ones you approve.'),
      h('li', null, h('strong', null, 'By hand: '), h('em', null, 'New card'), ', or the + on any column.'),
    ),
  );
}

/** The board file would show up in `git status`: say how to keep it private. */
function visibilityBanner() {
  const meta = state.meta;
  if (!meta || meta.boardIgnored !== false) return null;
  return h(
    'p',
    { class: 'hint hint-amber banner-note', role: 'note' },
    `git would show ${meta.boardFile} as untracked. To keep the board private, add `,
    h('code', null, '/.lore/'),
    ' to ',
    h('code', null, '.git/info/exclude'),
    '.',
  );
}

export function renderBoard(root: HTMLElement) {
  const error = state.boardError ? h('div', { class: 'banner banner-error', role: 'alert' }, state.boardError) : null;
  if (!state.board) {
    mount(root, error ?? h('p', { class: 'muted' }, 'Loading board…'));
    return;
  }
  mount(
    root,
    error,
    visibilityBanner(),
    state.board.cards.length === 0 ? welcome() : null,
    h('div', { class: 'board' }, state.board.columns.map(renderColumn)),
  );
}
