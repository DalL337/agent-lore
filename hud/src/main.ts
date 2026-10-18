import './styles.css';
import { columnWithRole } from '../shared/boardOps.ts';
import type { ColumnRole } from '../shared/types.ts';
import { loadBoard, loadJournals, loadMeta, loadRepo, setAreaFilter, setPolicyFilter } from './actions.ts';
import { renderBoard, renderFilterPill } from './board.ts';
import { ago, h, mount, realDate } from './dom.ts';
import { closeDrawer, openCardEditor, openPanel, openPanelName, renderDrawer, togglePanel, type Panel } from './drawer.ts';
import { renderInbox } from './inbox.ts';
import { setRenderer, state, type JournalFilter } from './state.ts';

const REPO_POLL_MS = 120_000;
const JOURNAL_FILTERS: JournalFilter[] = ['attention', 'open', 'stale', 'concluded', 'closed', 'all'];

const status = h('div', { class: 'status' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' });
const refresh = h(
  'button',
  {
    type: 'button',
    class: 'icon-btn icon-btn-ring',
    title: 'Refresh: re-read the board and journals, ask GitHub again',
    'aria-label': 'Refresh',
    onclick: () => void Promise.all([loadMeta(), loadBoard(), loadJournals(), loadRepo(true)]),
  },
  '↻',
);
const brandName = h('span', { class: 'brand-name' }, '…');
const topbar = h(
  'header',
  { class: 'topbar' },
  h(
    'div',
    { class: 'brand' },
    h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    brandName,
    h('span', { class: 'brand-sub' }, 'LORE HUD'),
  ),
  nav,
  status,
  refresh,
);
const inboxEl = h('div', { id: 'inbox' });
const filterSlot = h('span', { class: 'filter-slot' });
const boardEl = h('div', { id: 'board' });

mount(
  document.getElementById('app')!,
  topbar,
  h(
    'main',
    null,
    h(
      'section',
      { id: 'board-section', 'aria-label': 'Board' },
      h(
        'div',
        { class: 'section-head' },
        h('h1', null, 'Board'),
        filterSlot,
        h('p', { class: 'muted small' }, 'Drag cards between columns. Alt+arrow keys move a focused card. Click an area chip to filter by area.'),
        h('span', { class: 'spacer' }),
        h(
          'button',
          {
            type: 'button',
            class: 'pill pill-primary',
            onclick: () => {
              const board = state.board;
              // New work starts in the first column after intake, if the board has one.
              const intake = board ? columnWithRole(board, 'intake') : undefined;
              const at = board && intake ? board.columns.indexOf(intake) + 1 : 0;
              openCardEditor(null, board?.columns[at]?.id ?? board?.columns[0]?.id);
            },
          },
          'New card',
        ),
      ),
      inboxEl,
      boardEl,
    ),
  ),
);

// The drawer starts below the top bar, whose height changes as it wraps.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
}).observe(topbar);

/** Open the journals panel on one status tab (from a count in the top bar). */
function openJournalsAt(filter: JournalFilter) {
  state.journalFilter = filter;
  openPanel('journals');
}

function badge(value: number, led?: string, title?: string) {
  return value > 0
    ? h('span', { class: 'nav-badge', title }, led ? h('span', { class: 'led', 'data-led': led, 'aria-hidden': 'true' }) : null, String(value))
    : null;
}

/** Board · Journals · GitHub: the last two open their drawer, with live counts as a hint of what's inside. */
function renderNav() {
  const open = openPanelName();
  const journalsOpen = state.journals.filter((j) => j.status === 'open').length;
  const stale = state.journals.filter((j) => j.status === 'stale').length;
  const prs = state.repo?.prs.filter((p) => p.state === 'OPEN').length ?? 0;
  const link = (panel: Panel, label: string, ...badges: (HTMLElement | null)[]) =>
    h(
      'button',
      {
        type: 'button',
        class: 'nav-link',
        'data-panel': panel,
        'aria-expanded': String(open === panel),
        'aria-controls': 'drawer',
        title: open === panel ? `Close ${label}` : `Open ${label}`,
        onclick: () => togglePanel(panel),
      },
      label,
      badges,
    );
  mount(
    nav,
    h(
      'button',
      {
        type: 'button',
        class: 'nav-link',
        title: 'Back to the board',
        onclick: () => {
          closeDrawer();
          window.scrollTo({ top: 0 });
        },
      },
      'Board',
    ),
    link('journals', 'Journals', badge(journalsOpen, 'pulse', `${journalsOpen} open`), badge(stale, 'amber', `${stale} stale`)),
    link('github', 'GitHub', badge(prs, undefined, `${prs} open PRs`)),
  );
}

function stat(label: string, value: string | number, led?: string, title?: string, onclick?: () => void) {
  return h(
    onclick ? 'button' : 'span',
    { class: `stat${onclick ? ' stat-btn' : ''}`, type: onclick ? 'button' : undefined, title, onclick },
    led ? h('span', { class: 'led', 'data-led': led, 'aria-hidden': 'true' }) : null,
    h('span', { class: 'stat-value' }, String(value)),
    h('span', { class: 'stat-label' }, label),
  );
}

const STATUS_ROLES: ColumnRole[] = ['active', 'review', 'blocked'];

function renderStatus() {
  const board = state.board;
  const j = state.journals;
  const repo = state.repo;
  const git = repo?.git;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const mergedWeek = repo?.prs.filter((p) => (realDate(p.mergedAt) ?? '') >= weekAgo).length ?? 0;
  brandName.textContent = state.meta?.repo ?? '…';
  mount(
    status,
    board
      ? STATUS_ROLES.map((role) => columnWithRole(board, role))
          .filter((c) => c !== undefined)
          .map((c) => stat(c.title.toLowerCase(), board.cards.filter((x) => x.column === c.id).length, c.led))
      : null,
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    stat('journals open', j.filter((x) => x.status === 'open').length, 'pulse', 'Show the open journals', () => openJournalsAt('open')),
    stat('stale', j.filter((x) => x.status === 'stale').length, 'amber', 'Journals not concluded and untouched for over 7 days — show them', () => openJournalsAt('stale')),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    repo ? stat('open PRs', repo.prs.filter((p) => p.state === 'OPEN').length, undefined, 'Show GitHub', () => openPanel('github')) : null,
    repo ? stat('merged in 7d', mergedWeek, 'green', 'Show GitHub', () => openPanel('github')) : null,
    git
      ? h(
          'span',
          { class: 'chip chip-git', title: git.subject },
          h('span', { class: 'mono' }, `${git.branch} @ ${git.head}`),
          git.dirty ? h('span', { class: 'dirty' }, ` · ${git.dirty} changed`) : ' · clean',
        )
      : null,
    repo?.release
      ? h(
          'a',
          { class: 'chip chip-release', href: repo.release.url, target: '_blank', rel: 'noreferrer' },
          h('span', { class: 'mono' }, repo.release.tag),
          ` · ${ago(repo.release.publishedAt)}`,
        )
      : null,
  );
  refresh.toggleAttribute('data-busy', state.repoLoading);
}

setRenderer(() => {
  renderNav();
  renderStatus();
  renderInbox(inboxEl);
  renderFilterPill(filterSlot);
  renderBoard(boardEl);
  renderDrawer();
});

// ?area=, ?policy=, ?panel= and ?jf= restore the lenses and the open panel after a refresh.
const params = new URLSearchParams(location.search);
state.areaFilter = params.get('area');
state.policyFilter = params.get('policy');
const jf = params.get('jf') as JournalFilter | null;
if (jf && JOURNAL_FILTERS.includes(jf)) state.journalFilter = jf;

// Esc clears a lens — unless the drawer is open: then Esc belongs to the
// drawer. This listener is registered before the drawer's (which is lazy), so
// it sees the drawer still open on that same keypress.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || document.querySelector('.drawer.open')) return;
  if (state.areaFilter) setAreaFilter(null);
  else if (state.policyFilter) setPolicyFilter(null);
});

void loadMeta();
void loadBoard();
void loadJournals();
void loadRepo();
const panel = params.get('panel');
if (panel === 'journals' || panel === 'github') openPanel(panel);

// Live: the server pushes when the board file or a journal changes on disk.
const events = new EventSource('/api/events');
events.addEventListener('board', () => {
  void loadBoard();
  void loadJournals();
});
events.addEventListener('journals', () => void loadJournals());
setInterval(() => void loadRepo(), REPO_POLL_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loadRepo();
});
