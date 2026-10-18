import './styles.css';
import { columnWithRole } from '../shared/boardOps.ts';
import type { ColumnRole } from '../shared/types.ts';
import { loadBoard, loadJournals, loadMeta, loadRepo, setAreaFilter, setPolicyFilter } from './actions.ts';
import { renderBoard, renderFilterPill } from './board.ts';
import { ago, h, mount, realDate } from './dom.ts';
import { openCardEditor } from './drawer.ts';
import { renderGithub } from './github.ts';
import { renderInbox } from './inbox.ts';
import { renderJournals } from './journals.ts';
import { setRenderer, state } from './state.ts';

const REPO_POLL_MS = 120_000;

const status = h('div', { class: 'status' });
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
const inboxEl = h('div', { id: 'inbox' });
const filterSlot = h('span', { class: 'filter-slot' });
const boardEl = h('div', { id: 'board' });
const journalsEl = h('section', { id: 'journals', class: 'panel' });
const githubEl = h('div', { id: 'github' });
const githubStamp = h('span', { class: 'muted small' });

mount(
  document.getElementById('app')!,
  h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      brandName,
      h('span', { class: 'brand-sub' }, 'LORE HUD'),
    ),
    h(
      'nav',
      { class: 'nav', 'aria-label': 'Sections' },
      h('a', { href: '#board-section' }, 'Board'),
      h('a', { href: '#journals' }, 'Journals'),
      h('a', { href: '#github-section' }, 'GitHub'),
    ),
    status,
    refresh,
  ),
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
    h(
      'div',
      { class: 'lower' },
      journalsEl,
      h(
        'section',
        { id: 'github-section', class: 'panel', 'aria-label': 'GitHub' },
        h('div', { class: 'panel-head' }, h('h2', null, 'GitHub'), githubStamp),
        githubEl,
      ),
    ),
  ),
);

function stat(label: string, value: string | number, led?: string, title?: string) {
  return h(
    'span',
    { class: 'stat', title },
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
    stat('journals open', j.filter((x) => x.status === 'open').length, 'pulse'),
    stat('stale', j.filter((x) => x.status === 'stale').length, 'amber', 'Journals not concluded and untouched for over 7 days'),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    repo ? stat('open PRs', repo.prs.filter((p) => p.state === 'OPEN').length) : null,
    repo ? stat('merged in 7d', mergedWeek, 'green') : null,
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
  githubStamp.textContent = state.repoLoading
    ? 'asking GitHub…'
    : repo?.error && !repo.lastGood
      ? 'unavailable'
      : repo
        ? `fetched ${ago(repo.fetchedAt)}`
        : '';
  refresh.toggleAttribute('data-busy', state.repoLoading);
}

setRenderer(() => {
  renderStatus();
  renderInbox(inboxEl);
  renderFilterPill(filterSlot);
  renderBoard(boardEl);
  renderJournals(journalsEl);
  renderGithub(githubEl);
});

// ?area= and ?policy= restore the lenses after a refresh.
const params = new URLSearchParams(location.search);
state.areaFilter = params.get('area');
state.policyFilter = params.get('policy');

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
