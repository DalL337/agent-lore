#!/usr/bin/env node
// agents-md-budget.mjs — keeps the AGENTS.md chain inside what Codex reads
// (LORE.md §3 and §5, provider memory table).
//
// Codex reads at most one instruction file per directory, AGENTS.override.md
// before AGENTS.md, skipping empty files, from the project root down to its
// working directory, and stops adding files once the combined size reaches
// project_doc_max_bytes (32 KiB by default). Guidance past that point is
// never read. This guard measures every root-to-directory chain in the
// repository against a 30 KiB budget, which leaves room for a global
// ~/.codex/AGENTS.md:
//
//   E1  a chain of instruction files over budget
//
// A directory holding its own .git (a worktree or submodule) is a separate
// project root with its own chain, so the walk does not enter it. Fallback
// filenames configured in Codex (project_doc_fallback_filenames) are not
// covered.
//
// Zero dependencies. Usage:
//   node lore/scripts/agents-md-budget.mjs [repo-root] [--max <bytes>]
// Exit 1 when any chain is over budget.
// The checks are the policy; the implementation is fungible.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const MAX = maxAt >= 0 ? Number(args[maxAt + 1]) : 30 * 1024;
const ROOT = args.find((a, i) => !a.startsWith('--') && (maxAt < 0 || i !== maxAt + 1)) ?? '.';
const SKIP = new Set(['.git', 'node_modules']);

function instructionFile(dir) {
  for (const name of ['AGENTS.override.md', 'AGENTS.md']) {
    const p = join(dir, name);
    if (existsSync(p) && statSync(p).isFile() && statSync(p).size > 0) {
      return { path: relative(ROOT, p).replace(/\\/g, '/'), size: statSync(p).size };
    }
  }
  return null;
}

const chains = [];
function walk(dir, chain) {
  const file = instructionFile(dir);
  const here = file ? [...chain, file] : chain;
  if (file) chains.push(here);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    const sub = join(dir, entry.name);
    if (existsSync(join(sub, '.git'))) continue;
    walk(sub, here);
  }
}
walk(ROOT, []);

if (chains.length === 0) {
  console.log('agents-md-budget: no AGENTS.md found — nothing to check.');
  process.exit(0);
}

const total = (chain) => chain.reduce((sum, f) => sum + f.size, 0);
const over = chains.filter((c) => total(c) > MAX);
for (const chain of over) {
  console.error(`ERROR E1  ${chain.at(-1).path} — chain is ${total(chain)} bytes, over the ${MAX}-byte budget: ` +
    chain.map((f) => `${f.path} (${f.size})`).join(' + '));
}
const largest = chains.reduce((a, b) => (total(b) > total(a) ? b : a));
console.log(`agents-md-budget: largest chain ${total(largest)} / ${MAX} bytes (${largest.at(-1).path}); ${over.length} over budget`);
process.exit(over.length > 0 ? 1 : 0);
