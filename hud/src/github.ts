import type { GhItem } from '../shared/types.ts';
import { ago, h, mount, realDate } from './dom.ts';
import { state } from './state.ts';

function item(it: GhItem, meta: string) {
  return h(
    'a',
    { class: 'gh-item', href: it.url, target: '_blank', rel: 'noreferrer', 'data-state': it.state },
    h('span', { class: 'mono gh-num' }, `#${it.number}`),
    h('span', { class: 'gh-title' }, it.title),
    h('span', { class: 'muted small gh-meta' }, meta),
  );
}

function group(title: string, items: HTMLElement[], empty: string) {
  return h(
    'div',
    { class: 'gh-group' },
    h('h3', null, title, h('span', { class: 'count' }, String(items.length))),
    items.length ? items : h('p', { class: 'muted small' }, empty),
  );
}

export function renderGithub(root: HTMLElement) {
  const repo = state.repo;
  if (!repo) {
    mount(root, h('p', { class: 'muted' }, state.repoLoading ? 'Asking GitHub…' : 'No GitHub data yet.'));
    return;
  }
  // Never fetched: say why, calmly — the board and journals work without GitHub.
  if (repo.error && !repo.lastGood) {
    mount(
      root,
      h('p', { class: 'muted' }, `No GitHub data: ${repo.error}.`),
      h('p', { class: 'muted small' }, 'The board and journals work without it; PR and issue chips and the Inbox fill in once gh can reach the repository.'),
    );
    return;
  }
  const openPrs = repo.prs.filter((p) => p.state === 'OPEN');
  const openIssues = repo.issues.filter((i) => i.state === 'OPEN');
  const merged = repo.prs
    .filter((p) => p.state === 'MERGED' && realDate(p.mergedAt))
    .sort((a, b) => b.mergedAt!.localeCompare(a.mergedAt!))
    .slice(0, 10);
  mount(
    root,
    repo.error
      ? h('div', { class: 'banner banner-error', role: 'alert' }, `GitHub refresh failed: ${repo.error}. Showing the last good fetch.`)
      : null,
    group(
      'Open pull requests',
      openPrs.map((p) => item(p, `${p.isDraft ? 'draft · ' : ''}${p.headRefName ?? ''} · ${ago(p.updatedAt)}`)),
      'None open.',
    ),
    group(
      'Open issues',
      openIssues.map((i) => item(i, `${(i.labels ?? []).join(', ') || 'unlabeled'} · ${ago(i.updatedAt)}`)),
      'None open.',
    ),
    group('Recently merged', merged.map((p) => item(p, ago(p.mergedAt))), 'Nothing merged yet.'),
  );
}
