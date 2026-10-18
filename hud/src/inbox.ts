// Inbox strip above the board: live work no card points at yet.

import type { InboxItem } from '../shared/inbox.ts';
import { makeCardFrom, setInboxDismissed } from './actions.ts';
import { ago, h, mount } from './dom.ts';
import { openJournal } from './drawer.ts';
import { inbox, state } from './state.ts';

const KIND_LABEL = { pr: 'PR', journal: 'Journal', issue: 'Issue' } as const;
const PREVIEW = 6;
let expanded = false;

function row(item: InboxItem) {
  const column = state.board?.columns.find((c) => c.id === item.suggest.column)?.title ?? item.suggest.column;
  // Journal titles often repeat the date the label already shows; use the cleaned name.
  const text = item.kind === 'journal' ? item.suggest.title : item.title;
  const titleEl = item.url
    ? h('a', { class: 'inbox-title', href: item.url, target: '_blank', rel: 'noreferrer', title: item.title }, text)
    : h(
        'button',
        { type: 'button', class: 'inbox-title', title: 'Read the journal', onclick: () => item.file && void openJournal(item.file) },
        text,
      );
  return h(
    'div',
    { class: 'inbox-row', 'data-kind': item.kind },
    h('span', { class: 'inbox-kind' }, KIND_LABEL[item.kind]),
    h('span', { class: 'mono muted inbox-label' }, item.label),
    titleEl,
    h('span', { class: 'muted small inbox-when' }, ago(item.when)),
    h(
      'span',
      { class: 'inbox-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'pill pill-primary',
          title: `Create a card in ${column}, linked to this ${KIND_LABEL[item.kind].toLowerCase()}`,
          onclick: () => void makeCardFrom(item),
        },
        `Make card → ${column}`,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'pill pill-quiet',
          title: 'Not board-worthy: hide it from the Inbox (restorable)',
          onclick: () => void setInboxDismissed(item.key, true),
        },
        'Dismiss',
      ),
    ),
  );
}

export function renderInbox(root: HTMLElement) {
  if (!state.board || !state.journalsLoaded) {
    mount(root);
    return;
  }
  const items = inbox();
  const dismissed = state.board.inboxDismissed?.length ?? 0;
  const restore =
    dismissed > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            title: 'Bring every dismissed item back into the Inbox',
            onclick: () => void setInboxDismissed('*', false),
          },
          `restore ${dismissed} dismissed`,
        )
      : null;

  if (!items.length) {
    mount(
      root,
      h(
        'div',
        { class: 'inbox inbox-clear' },
        h('span', { class: 'led', 'data-led': 'green', 'aria-hidden': 'true' }),
        h('span', { class: 'inbox-heading' }, 'Inbox'),
        h('span', { class: 'muted small' }, state.repo ? 'Everything active is on the board.' : 'Everything active is on the board (GitHub still loading).'),
        restore,
      ),
    );
    return;
  }

  const shown = expanded ? items : items.slice(0, PREVIEW);
  mount(
    root,
    h(
      'section',
      { class: 'inbox', 'aria-label': 'Inbox: work not on the board yet' },
      h(
        'header',
        { class: 'inbox-head' },
        h('span', { class: 'led', 'data-led': 'amber', 'aria-hidden': 'true' }),
        h('span', { class: 'inbox-heading' }, 'Inbox'),
        h('span', { class: 'count' }, String(items.length)),
        h('span', { class: 'muted small' }, 'Open PRs, active journals and open issues that no card links to yet.'),
        h('span', { class: 'spacer' }),
        restore,
      ),
      shown.map(row),
      items.length > PREVIEW
        ? h(
            'button',
            {
              type: 'button',
              class: 'link-btn inbox-more',
              onclick: () => {
                expanded = !expanded;
                renderInbox(root);
              },
            },
            expanded ? 'Show fewer' : `Show all ${items.length}`,
          )
        : null,
    ),
  );
}
