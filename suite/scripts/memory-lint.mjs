#!/usr/bin/env node
// memory-lint.mjs — the suite's first guard (AGENTS.md §1/§3).
//
// Checks the FORM of the memory web defined in policies/memory.md:
//   E1  memory/ exists but the hub (memory/INDEX.md) does not
//   E2  struck-through content (~~…~~) without a YYYY-MM-DD stamp on the entry
//   E3  malformed CLAIM  (need "CLAIM YYYY-MM-DDTHH:MM — <id> — scope: …")
//   E4  malformed RELEASE (need "RELEASE YYYY-MM-DD — <id> — …")
//   W1  unknown status word (may be a repo extension — declare it in the hub)
//   W2  multiple live claims in one node (allowed only with noted overlap,
//       which a lint cannot verify — so it warns, humans and agents decide)
//
// What it cannot check: append-only itself. A stateless lint sees form,
// not history; that discipline remains on the agent.
//
// Zero dependencies. Usage:  node scripts/memory-lint.mjs [repo-root] [--strict]
// Exit 1 on errors; --strict also fails warnings.
// The checks are the policy; the implementation is fungible — port this
// to your stack's language if Node isn't available.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const ROOT = args.find((a) => !a.startsWith('--')) ?? '.';
const MEM = join(ROOT, 'memory');
const VOCAB = new Set(['planned', 'in-progress', 'blocked', 'done', 'deprecated']);
const DATE = /\d{4}-\d{2}-\d{2}/;

const errors = [];
const warnings = [];

if (!existsSync(MEM)) {
  console.log('memory-lint: no memory/ directory — nothing to check.');
  process.exit(0);
}
if (!existsSync(join(MEM, 'INDEX.md'))) {
  errors.push(['E1', 'memory/INDEX.md', 0, 'memory/ exists but the hub (INDEX.md) does not']);
}

function* mdFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* mdFiles(p);
    else if (entry.endsWith('.md')) yield p;
  }
}

// Join wrapped bullet entries into logical lines: an indented line that is
// not itself a bullet continues the previous entry.
function logicalLines(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    if (/^\s+\S/.test(raw) && !/^\s*[-*]\s/.test(raw) && out.length > 0) {
      out[out.length - 1].text += ' ' + raw.trim();
    } else {
      out.push({ line: i + 1, text: raw });
    }
  });
  return out;
}

for (const file of mdFiles(MEM)) {
  const rel = relative(ROOT, file);
  const lines = logicalLines(readFileSync(file, 'utf8'));
  const claims = [];
  const releases = [];

  for (const { line, text } of lines) {
    const struck = /~~[^~]+~~/.test(text);
    if (struck && !DATE.test(text)) {
      errors.push(['E2', rel, line, 'struck content without a date stamp']);
    }

    let m;
    if ((m = text.match(/^\s*-\s*(~~\s*)?CLAIM\b(.*)$/))) {
      const body = m[2];
      const shape = body.match(/^\s*~{0,2}\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\s+—\s+([^—]+?)\s+—\s+scope:/);
      if (!shape) {
        errors.push(['E3', rel, line, 'malformed CLAIM (need "CLAIM YYYY-MM-DDTHH:MM — <id> — scope: …")']);
      } else {
        claims.push({ line, struck: Boolean(m[1]) || struck, ts: shape[1], id: shape[2].trim() });
      }
    } else if ((m = text.match(/^\s*-\s*(~~\s*)?RELEASE\b(.*)$/))) {
      const body = m[2];
      const shape = body.match(/^\s*~{0,2}\s*(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2})?\s+—\s+([^—]+?)(?:\s+—|$)/);
      if (!shape) {
        errors.push(['E4', rel, line, 'malformed RELEASE (need "RELEASE YYYY-MM-DD — <id> — …")']);
      } else {
        releases.push({ line, id: shape[2].trim() });
      }
    } else if ((m = text.match(/^\s*-\s*(~~\s*)?(\d{4}-\d{2}-\d{2})\s*—\s*([^—]+?)\s*—/))) {
      // dated ledger line: "- YYYY-MM-DD — <status> — …"
      const status = m[3].trim();
      if (!VOCAB.has(status)) {
        warnings.push(['W1', rel, line, `unknown status "${status}" — if a repo extension, declare it in the hub`]);
      }
    }
  }

  const live = claims.filter(
    (c) => !c.struck && !releases.some((r) => r.id === c.id && r.line > c.line)
  );
  if (live.length > 1) {
    warnings.push([
      'W2', rel, live[0].line,
      `${live.length} live claims in one node (${live.map((c) => c.id).join(', ')}) — allowed only with noted overlap`,
    ]);
  }
}

for (const [code, f, l, msg] of errors) console.error(`ERROR ${code}  ${f}:${l} — ${msg}`);
for (const [code, f, l, msg] of warnings) console.error(`warn  ${code}  ${f}:${l} — ${msg}`);
console.log(`memory-lint: ${errors.length} error(s), ${warnings.length} warning(s)${STRICT ? ' [strict]' : ''}`);
process.exit(errors.length > 0 || (STRICT && warnings.length > 0) ? 1 : 0);
