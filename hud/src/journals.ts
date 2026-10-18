import type { JournalStatus, JournalSummary, Led } from '../shared/types.ts';
import { setJournalClosed, setPolicyFilter } from './actions.ts';
import { ghChip, policyChips } from './chips.ts';
import { ago, h, localStamp, mount } from './dom.ts';
import { openCardEditor, openJournal } from './drawer.ts';
import {
  cardsForJournal,
  journalLooksDone,
  journalPrs,
  journalsDir,
  journalUsesPolicy,
  rerender,
  state,
  type JournalFilter,
} from './state.ts';

const LIST_PREVIEW = 15;

export const STATUS_LED: Record<JournalStatus, Led> = {
  open: 'pulse',
  stale: 'amber',
  concluded: 'green',
  closed: 'empty',
};

const FILTERS: { id: JournalFilter; label: string; test: (j: JournalSummary) => boolean }[] = [
  { id: 'attention', label: 'Needs attention', test: (j) => j.status === 'open' || j.status === 'stale' },
  { id: 'open', label: 'Open', test: (j) => j.status === 'open' },
  { id: 'stale', label: 'Stale', test: (j) => j.status === 'stale' },
  { id: 'concluded', label: 'Concluded', test: (j) => j.status === 'concluded' },
  { id: 'closed', label: 'Closed', test: (j) => j.status === 'closed' },
  { id: 'all', label: 'All', test: () => true },
];

let shell: { root: HTMLElement; note: HTMLElement; pill: HTMLElement; filters: HTMLElement; list: HTMLElement } | null = null;

function build(root: HTMLElement) {
  const filters = h('div', { class: 'filters', role: 'tablist', 'aria-label': 'Journal filter' });
  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Filter journals…',
    'aria-label': 'Filter journals',
    value: state.journalQuery,
    oninput: () => {
      state.journalQuery = search.value;
      rerender();
    },
  });
  const note = h('span', { class: 'muted small' });
  const pill = h('span', { class: 'filter-slot' });
  const list = h('div', { class: 'jlist' });
  mount(root, h('div', { class: 'panel-head' }, h('h2', null, 'Journals'), note, pill), h('div', { class: 'panel-tools' }, filters, search), list);
  shell = { root, note, pill, filters, list };
}

const policyMatch = (j: JournalSummary) => !state.policyFilter || journalUsesPolicy(j, state.policyFilter);

/**
 * "Policy: research · 2 here ✕" — the journals lens, like the board's area
 * pill. It counts the matches in the current view, and offers All when every
 * match sits outside it (a lens restored from the URL can land like that).
 */
function renderPolicyPill(root: HTMLElement, visible: JournalSummary[]) {
  const p = state.policyFilter;
  if (!p) {
    mount(root);
    return;
  }
  const here = visible.filter(policyMatch).length;
  const total = state.journals.filter(policyMatch).length;
  mount(
    root,
    h(
      'span',
      { class: 'filter-pill', role: 'status' },
      h('span', null, 'Policy: ', h('strong', null, p)),
      h('span', { class: 'muted' }, `· ${here} here`),
      here === 0 && total > 0 && state.journalFilter !== 'all'
        ? h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                state.journalFilter = 'all';
                rerender();
              },
            },
            `${total} in All`,
          )
        : null,
      h(
        'button',
        { type: 'button', class: 'filter-clear', title: 'Clear the filter (Esc)', 'aria-label': 'Clear the policy filter', onclick: () => setPolicyFilter(null) },
        '✕',
      ),
    ),
  );
}

function row(j: JournalSummary) {
  const own = journalPrs(j);
  const cards = cardsForJournal(j.file);
  const looksDone = journalLooksDone(j);
  const live = j.status === 'open' || j.status === 'stale';
  const lens = state.policyFilter ? (policyMatch(j) ? ' is-match' : ' is-dim') : '';
  return h(
    'article',
    {
      class: `jrow${lens}`,
      tabindex: '0',
      'data-status': j.status,
      'aria-label': `${j.title}, ${j.status}`,
      onclick: () => void openJournal(j.file),
      onkeydown: (e: KeyboardEvent) => {
        if (e.target === e.currentTarget && e.key === 'Enter') void openJournal(j.file);
      },
    },
    h('span', { class: 'led', 'data-led': STATUS_LED[j.status], 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'jrow-main' },
      h(
        'div',
        { class: 'jrow-top' },
        h('time', { class: 'mono muted', datetime: j.date }, j.date),
        h('h3', null, j.title),
        h('span', { class: 'status-tag', 'data-status': j.status }, j.status),
      ),
      j.objective ? h('p', { class: 'jrow-obj' }, j.objective) : null,
      live && j.nextActions[0] ? h('p', { class: 'jrow-next' }, h('span', { class: 'mono' }, 'next → '), j.nextActions[0]) : null,
      !live && j.conclusion ? h('p', { class: 'jrow-next' }, h('span', { class: 'mono' }, 'concluded → '), j.conclusion) : null,
      h(
        'div',
        { class: 'jrow-meta' },
        h('span', { class: 'muted small' }, `touched ${ago(j.modified)}`),
        live && j.nextActions.length ? h('span', { class: 'muted small' }, `${j.nextActions.length} next`) : null,
        live && j.openQuestions ? h('span', { class: 'muted small' }, `${j.openQuestions} open questions`) : null,
        own.slice(0, 4).map((p) => ghChip(p.number, p)),
        policyChips(j),
        cards.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'chip chip-card',
              title: 'Open the board card',
              onclick: (e: Event) => {
                e.stopPropagation();
                openCardEditor(c);
              },
            },
            c.title,
          ),
        ),
      ),
      j.editedAfterClose && live
        ? h(
            'div',
            { class: 'hint hint-amber hint-row' },
            `Reopened: edited after you closed it on ${localStamp(j.override?.at)}.`,
            h(
              'button',
              {
                type: 'button',
                class: 'pill pill-quiet',
                onclick: (e: Event) => {
                  e.stopPropagation();
                  void setJournalClosed(j.file, true);
                },
              },
              'Close again',
            ),
          )
        : looksDone
        ? h(
            'div',
            { class: 'hint hint-row' },
            'Its PRs are merged but the journal has no Final Conclusions.',
            h(
              'button',
              {
                type: 'button',
                class: 'pill pill-quiet',
                onclick: (e: Event) => {
                  e.stopPropagation();
                  void setJournalClosed(j.file, true);
                },
              },
              'Mark closed',
            ),
          )
        : null,
    ),
  );
}

export function renderJournals(root: HTMLElement) {
  if (!shell || shell.root !== root) build(root);
  const { note, pill, filters, list } = shell!;
  const all = state.journals;
  const filter = FILTERS.find((f) => f.id === state.journalFilter) ?? FILTERS[0];
  const q = state.journalQuery.trim().toLowerCase();
  const matched = all.filter(
    (j) => filter.test(j) && (!q || `${j.file} ${j.title} ${j.objective}`.toLowerCase().includes(q)),
  );
  note.textContent = `${journalsDir()} — open = touched in the last 7 days`;
  renderPolicyPill(pill, matched);
  mount(
    filters,
    FILTERS.map((f) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'filter',
          'aria-selected': String(state.journalFilter === f.id),
          onclick: () => {
            state.journalFilter = f.id;
            rerender();
          },
        },
        f.label,
        h('span', { class: 'count' }, String(all.filter(f.test).length)),
      ),
    ),
  );
  if (state.journalsError) {
    mount(list, h('div', { class: 'banner banner-error', role: 'alert' }, state.journalsError));
    return;
  }
  if (!state.journalsLoaded) {
    mount(list, h('p', { class: 'muted' }, `Reading ${journalsDir()}…`));
    return;
  }
  if (!all.length) {
    mount(
      list,
      h(
        'p',
        { class: 'muted empty' },
        `No journals in ${journalsDir()} yet. Agents write one per investigation (research policy); they show up here as they are saved.`,
      ),
    );
    return;
  }
  const capped = !state.showAllJournals && matched.length > LIST_PREVIEW;
  mount(
    list,
    matched.length ? (capped ? matched.slice(0, LIST_PREVIEW) : matched).map(row) : h('p', { class: 'muted empty' }, 'No journals match.'),
    matched.length > LIST_PREVIEW
      ? h(
          'button',
          {
            type: 'button',
            class: 'pill pill-quiet list-more',
            onclick: () => {
              state.showAllJournals = !state.showAllJournals;
              rerender();
            },
          },
          capped ? `Show all ${matched.length}` : 'Show fewer',
        )
      : null,
  );
}
