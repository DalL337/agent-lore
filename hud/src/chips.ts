import type { GhItem, JournalSummary, Led } from '../shared/types.ts';
import { togglePolicyFilter } from './actions.ts';
import { h } from './dom.ts';
import { state } from './state.ts';

/** The board's area taxonomy (key → description), from board.json. */
export const areas = (): Record<string, string> => state.board?.areas ?? {};
export const areaName = (key: string) => areas()[key] ?? key;

/** "api, UI" → known keys in their board spelling; unknown keys kept as typed. */
export function parseAreas(text: string): string[] {
  const known = Object.keys(areas());
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)) {
    const key = known.find((k) => k.toLowerCase() === raw.toLowerCase()) ?? raw;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

export const ledColor = (led: Led) => (led === 'pulse' ? 'blue' : led);

export function ghChip(n: number, item: GhItem | undefined, kind: 'pr' | 'issue' = 'pr') {
  const missing = state.repo ? `#${n} not found on GitHub` : `#${n}: GitHub data still loading`;
  return h(
    item ? 'a' : 'span',
    {
      class: 'chip chip-gh',
      'data-state': item?.state ?? 'UNKNOWN',
      href: item?.url,
      target: item ? '_blank' : undefined,
      rel: item ? 'noreferrer' : undefined,
      title: item ? `${kind === 'pr' ? 'PR' : 'Issue'} #${n}: ${item.title}` : missing,
      onclick: (e: Event) => e.stopPropagation(),
    },
    h('span', { class: 'mono' }, `#${n}`),
    item ? ` ${item.state.toLowerCase()}` : '',
  );
}

/**
 * A journal's policies: solid = declared on its `Policies:` line, dotted =
 * only mentioned. Clicking one filters the journals to that policy.
 */
export function policyChips(j: JournalSummary) {
  const known = new Set((state.meta?.policies ?? []).map((p) => p.name));
  const chip = (name: string, kind: 'declared' | 'mentioned') => {
    const active = state.policyFilter === name;
    const unknown = !known.has(name);
    return h(
      'button',
      {
        type: 'button',
        class: 'chip chip-policy',
        'data-kind': kind,
        'data-unknown': unknown ? 'true' : undefined,
        'aria-pressed': String(active),
        title:
          (kind === 'declared' ? `Declared on the journal's Policies: line` : `Mentioned in the journal, not declared`) +
          (unknown ? ` — no ${name}.md among the repository's policies` : '') +
          (active ? '. Click to clear the filter.' : `. Click to show journals that use ${name}.`),
        onclick: (e: Event) => {
          e.stopPropagation();
          togglePolicyFilter(name);
        },
      },
      name,
    );
  };
  const all = [...j.policies.declared.map((n) => chip(n, 'declared')), ...j.policies.mentioned.map((n) => chip(n, 'mentioned'))];
  return all.length ? h('span', { class: 'policy-chips' }, all) : null;
}
