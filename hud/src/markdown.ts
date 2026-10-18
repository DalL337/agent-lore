// Minimal journal renderer: headings, lists, fences, tables, quotes, inline
// code/bold/strike/links. Everything is escaped first; only http(s) links
// become anchors.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function inline(src: string): string {
  return src
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="md-ref" title="$2">$1</span>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    })
    .join('');
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(src: string): string {
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  /** Open list item — wrapped continuation lines join it. */
  let item: { depth: number; mark: string; body: string } | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    if (quote.length) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    if (item) {
      out.push(
        `<div class="md-li" style="--depth:${item.depth}"><span class="md-mark">${item.mark}</span><span>${inline(item.body)}</span></div>`,
      );
    }
    para = [];
    quote = [];
    item = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (item && /^\s{2,}\S/.test(line) && !/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      item.body += ` ${line.trim()}`;
      continue;
    }

    if (/^\s*```/.test(line)) {
      flush();
      const buf: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows: string[] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i]);
      i--;
      const body = rows.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r));
      const [head, ...rest] = body;
      if (!head) continue;
      out.push(
        `<div class="md-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      let body = li[3];
      let mark = /\d/.test(li[2]) ? esc(li[2]) : '•';
      const box = /^\[([ xX])\]\s*/.exec(body);
      if (box) {
        mark = box[1] === ' ' ? '☐' : '☑';
        body = body.slice(box[0].length);
      }
      item = { depth: Math.floor(li[1].replace(/\t/g, '  ').length / 2), mark, body };
      continue;
    }

    if (/^>/.test(line)) {
      if (!quote.length) flush();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }

    if (!line.trim()) {
      flush();
    } else {
      if (item || quote.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}
