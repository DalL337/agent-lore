/// <reference types="vite/client" />

export type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown>;

/** Tiny element builder: `h('div', { class: 'x', onclick }, 'text', h('b', null, 'bold'))`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Swap a region's content in one go. */
export function mount(target: Element, ...children: Child[]) {
  target.replaceChildren();
  append(target, children);
}

export function ago(iso: string | undefined | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 60) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

/** A stored stamp in the viewer's local time: "2026-10-07 20:54" (date-only stamps pass through). */
export function localStamp(iso: string | undefined): string {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** gh can report a missing timestamp as the zero time instead of null. */
export const realDate = (iso: string | null | undefined) => (iso && !iso.startsWith('0001') ? iso : null);
