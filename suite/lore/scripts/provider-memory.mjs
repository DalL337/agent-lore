#!/usr/bin/env node
// provider-memory.mjs — guard for a harness's own memory index
// (lore/policies/memory.md §0, "Coexist with Provider-Native Memory").
//
// Where a provider lets the agent write its always-loaded index (Claude
// Code's MEMORY.md), LORE requires that index to be a links-only hub over
// area indexes: one per policy, reserved scopes included, plus the owner
// area and any repository areas. This script seeds that shape and checks it.
//
//   init  <memory-dir> [--repo <root>]   seed the hub and missing areas;
//                                        never overwrites an existing file
//   check <memory-dir> [--repo <root>] [--strict]
//   hook [--repo <root>]                 Claude Code PostToolUse mode: reads
//                                        the hook payload on stdin and checks
//                                        the memory directory a Write or Edit
//                                        touched (claude-settings-additions.json);
//                                        --repo defaults to CLAUDE_PROJECT_DIR
//
// Checks:
//   E1  the hub (MEMORY.md) is missing
//   E2  hub line that is not a heading or a link line (prose, status, notes)
//   E3  hub link to something other than an area index (area_*.md)
//   E4  area line that is not a heading, its one scope line, or a link line
//   E5  index link that does not resolve to a file in the memory directory
//   E6  file not reachable from the hub through area indexes
//   E7  hub over budget: half the provider's load cap
//   E8  missing area: the owner area, or (with policies under --repo) a
//       policy or reserved scope that has no area reachable from the hub
//   E9  area whose scope line names a policy file that does not exist
//   W1  area with more links than a walker can scan: split it into sub-areas
//   W2  index link line long enough that its hook is turning into prose
//
// Topic files, the memories themselves, keep the provider's format; only
// their reachability is checked. --repo defaults to the current directory,
// and the policy checks run only when it holds LORE's policies: lore/policies/,
// or policies/ in a repository that copied the suite into its root.
//
// Zero dependencies. Exit 1 on errors (--strict also fails warnings);
// hook mode exits 2 on any finding so Claude Code shows it to the agent.
// The checks are the policy; the implementation is fungible.

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';

const HUB = 'MEMORY.md';
const OWNER = 'area_owner.md';
const AREA = /^area_[^/\\]+\.md$/;
// Claude Code loads the first 200 lines or 25KB of MEMORY.md; budget half.
const HUB_MAX_LINES = 100;
const HUB_MAX_BYTES = 12_500;
const AREA_MAX_LINKS = 30;
const LINK_LINE_MAX = 200;
// Claude Code's default auto-memory location; LORE_PROVIDER_MEMORY_DIR
// covers a relocated one (autoMemoryDirectory).
const PROVIDER_DIR = /[\\/]\.claude[\\/]projects[\\/][^\\/]+[\\/]memory$/;

const HEADING = /^#{1,6}\s/;
// A bullet that leads with a markdown link, after an optional short badge.
const LINK_LINE = /^\s*[-*]\s+(?:[^\s[]{1,4}\s+)?\[[^\]]+\]\([^)]+\)/;
const LINKS = /\]\(([^)\s]+)\)/g;
const POLICY_REF = /`((?:lore\/)?policies\/[^`]+\.md)`/;

const areaFile = (name) => `area_${name}.md`;
const titleOf = (name) => name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
const snippet = (text) => (text.trim().length > 60 ? `${text.trim().slice(0, 57)}...` : text.trim());

// Lines after any leading YAML frontmatter, numbered as in the file.
function bodyLines(file) {
  const all = readFileSync(file, 'utf8').split(/\r?\n/).map((text, i) => ({ line: i + 1, text }));
  if (all[0]?.text.trim() === '---') {
    const end = all.findIndex((l, i) => i > 0 && l.text.trim() === '---');
    if (end > 0) return all.slice(end + 1);
  }
  return all;
}

/** Where the repository keeps LORE's policies: lore/policies/, else a root-level policies/. */
function policiesBase(repo) {
  return ['lore/policies', 'policies'].find((d) => existsSync(join(repo, d))) ?? null;
}

function policies(repo) {
  const out = [];
  const base = policiesBase(repo);
  if (!base) return out;
  for (const [sub, reserved] of [[base, false], [`${base}/reserved`, true]]) {
    const dir = join(repo, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith('.md') && statSync(join(dir, f)).isFile()) {
        out.push({ name: f.slice(0, -3), path: `${sub}/${f}`, reserved });
      }
    }
  }
  return out;
}

// `fresh` is a file the agent just wrote: in hook mode it gets until the
// next memory write to be linked, since writing a topic precedes linking it.
function check(dir, repo, fresh = null) {
  const errors = [];
  const warnings = [];
  const hubPath = join(dir, HUB);
  if (!existsSync(hubPath)) {
    errors.push(['E1', HUB, 0, 'the hub is missing; seed it with `provider-memory.mjs init`']);
    return { errors, warnings };
  }

  const raw = readFileSync(hubPath, 'utf8');
  const rawLines = raw.split(/\r?\n/);
  const lineCount = rawLines.at(-1) === '' ? rawLines.length - 1 : rawLines.length;
  const bytes = Buffer.byteLength(raw);
  if (lineCount > HUB_MAX_LINES || bytes > HUB_MAX_BYTES) {
    errors.push(['E7', HUB, 0, `hub is ${lineCount} lines / ${bytes} bytes; budget is ${HUB_MAX_LINES} lines / ${HUB_MAX_BYTES} bytes`]);
  }

  // Walk from the hub through index files only; a topic file's own links
  // do not make another topic reachable.
  const reached = new Set([HUB]);
  const scopes = new Map();
  const queue = [HUB];
  while (queue.length > 0) {
    const name = queue.shift();
    const isHub = name === HUB;
    let links = 0;
    let scope = null;
    for (const { line, text } of bodyLines(join(dir, name))) {
      if (!text.trim() || HEADING.test(text)) continue;
      if (LINK_LINE.test(text)) {
        links++;
        if (text.length > LINK_LINE_MAX) {
          warnings.push(['W2', name, line, `link line is ${text.length} chars; keep the hook to a short route description`]);
        }
        for (const [, target] of text.matchAll(LINKS)) {
          const file = target.split('#')[0].replace(/^\.\//, '');
          if (/^[a-z][a-z0-9+.-]*:/i.test(target) || file.startsWith('/') || file.includes('..') || !file) {
            errors.push(['E5', name, line, `link "${target}" must point to a file in the memory directory`]);
            continue;
          }
          if (!existsSync(join(dir, file))) {
            errors.push(['E5', name, line, `broken link: ${file} does not exist`]);
            continue;
          }
          const isArea = AREA.test(file);
          if (isHub && !isArea) {
            errors.push(['E3', name, line, `hub links ${file}; the hub links area indexes only — move the link into an area`]);
          }
          if (!reached.has(file)) {
            reached.add(file);
            if (isArea) queue.push(file);
          }
        }
        continue;
      }
      if (!isHub && scope === null && links === 0) {
        scope = text.trim();
        continue;
      }
      errors.push(isHub
        ? ['E2', name, line, `hub line is not a heading or a link: "${snippet(text)}"`]
        : ['E4', name, line, `area line is not a heading, its scope line, or a link: "${snippet(text)}"`]);
    }
    if (!isHub) scopes.set(name, scope ?? '');
    if (!isHub && links > AREA_MAX_LINKS) {
      warnings.push(['W1', name, 0, `${links} links; split this area into sub-areas linked from it`]);
    }
  }

  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.md') && statSync(join(dir, f)).isFile() && !reached.has(f) && f !== fresh) {
      errors.push(['E6', f, 0, 'not reachable from the hub; link it from an area']);
    }
  }

  if (!reached.has(OWNER)) {
    errors.push(['E8', HUB, 0, `no owner area: add ${OWNER} and link it from the hub (init does this)`]);
  }
  if (repo && policiesBase(repo)) {
    for (const p of policies(repo)) {
      if (!reached.has(areaFile(p.name))) {
        errors.push(['E8', HUB, 0, `no area for ${p.path}: add ${areaFile(p.name)} and link it from the hub (init does this)`]);
      }
    }
    for (const [name, scope] of scopes) {
      const m = scope.match(POLICY_REF);
      if (m && !existsSync(join(repo, m[1]))) {
        errors.push(['E9', name, 0, `scope names ${m[1]}, which does not exist in the repository`]);
      }
    }
  }
  return { errors, warnings };
}

function report({ errors, warnings }) {
  for (const [code, f, l, msg] of errors) console.error(`ERROR ${code}  ${f}:${l} — ${msg}`);
  for (const [code, f, l, msg] of warnings) console.error(`warn  ${code}  ${f}:${l} — ${msg}`);
}

function init(dir, repo) {
  mkdirSync(dir, { recursive: true });
  const hubPath = join(dir, HUB);
  const linked = new Set();
  if (existsSync(hubPath)) {
    let prose = 0;
    for (const { text } of bodyLines(hubPath)) {
      if (!text.trim() || HEADING.test(text)) continue;
      if (LINK_LINE.test(text)) {
        for (const [, target] of text.matchAll(LINKS)) linked.add(target.replace(/^\.\//, ''));
      } else prose++;
    }
    if (prose > 0) {
      console.error(`init: ${HUB} is not a links-only hub (${prose} line(s) of prose or status). ` +
        'Migrating it is an owner decision; init leaves the directory untouched.');
      return 1;
    }
  }

  const pols = policies(repo);
  if (pols.length === 0) console.error(`init: no policies under ${resolve(repo)}; seeding the owner area only`);
  const areas = [
    {
      file: OWNER, title: 'Owner', group: 'Owner',
      scope: 'Who the owner is and how they work. Open on first contact.',
      hook: 'who the owner is and how they work; open on first contact',
    },
    ...pols.map((p) => ({
      file: areaFile(p.name), title: titleOf(p.name),
      group: p.reserved ? 'Reserved scopes' : 'Policies',
      scope: p.reserved
        ? `Memories that apply when \`${p.path}\` is loaded. Reserved scope with no rules yet: a lesson filed here is a candidate for its first rule.`
        : `Memories that apply when \`${p.path}\` is loaded.`,
      hook: p.reserved ? `opened with ${p.path} (reserved, no rules yet)` : `opened with ${p.path}`,
    })),
  ];

  let created = 0;
  for (const a of areas) {
    if (!existsSync(join(dir, a.file))) {
      writeFileSync(join(dir, a.file), `# ${a.title}\n\n${a.scope}\n`);
      created++;
    }
  }

  const missing = areas.filter((a) => !linked.has(a.file));
  const line = (a) => `- [${a.title}](${a.file}) — ${a.hook}`;
  if (!existsSync(hubPath)) {
    const groups = ['Owner', 'Policies', 'Reserved scopes'];
    const sections = groups
      .map((g) => [g, missing.filter((a) => a.group === g)])
      .filter(([, as]) => as.length > 0)
      .map(([g, as]) => `## ${g}\n\n${as.map(line).join('\n')}\n`);
    writeFileSync(hubPath, `# Memory hub\n\n${sections.join('\n')}\n## Repository areas\n`);
  } else if (missing.length > 0) {
    appendFileSync(hubPath, `\n${missing.map(line).join('\n')}\n`);
  }
  console.log(`init: ${created} area file(s) created, ${missing.length} hub link(s) added; existing files untouched.`);
  return 0;
}

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => done(data));
  });
}

async function hook() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return 0; // not a hook payload; never break the session over it
  }
  const file = input?.tool_input?.file_path;
  if (typeof file !== 'string' || !file.endsWith('.md')) return 0;
  const dir = dirname(resolve(file));
  const relocated = process.env.LORE_PROVIDER_MEMORY_DIR;
  if (!PROVIDER_DIR.test(dir) && !(relocated && resolve(relocated) === dir)) return 0;

  // --repo: the main checkout, for a session in a linked worktree (which has no lore/policies/ of its own).
  const repo = repoAt >= 0 ? rest[repoAt + 1] : process.env.CLAUDE_PROJECT_DIR || input.cwd || '.';
  const result = check(dir, repo, basename(file));
  if (result.errors.length === 0 && result.warnings.length === 0) return 0;
  console.error(`provider-memory: ${dir}`);
  report(result);
  console.error('Fix these now: the index is a links-only hub over areas (lore/policies/memory.md §0).');
  return 2;
}

const [cmd, ...rest] = process.argv.slice(2);
const repoAt = rest.indexOf('--repo');
const REPO = repoAt >= 0 ? rest[repoAt + 1] : '.';
const DIR = rest.find((a, i) => !a.startsWith('--') && (repoAt < 0 || i !== repoAt + 1));
const STRICT = rest.includes('--strict');

if (cmd === 'hook') {
  process.exit(await hook());
} else if ((cmd === 'check' || cmd === 'init') && DIR && REPO) {
  if (cmd === 'init') process.exit(init(DIR, REPO));
  const result = check(DIR, REPO);
  report(result);
  console.log(`provider-memory: ${result.errors.length} error(s), ${result.warnings.length} warning(s)${STRICT ? ' [strict]' : ''}`);
  process.exit(result.errors.length > 0 || (STRICT && result.warnings.length > 0) ? 1 : 0);
} else {
  console.error('usage: provider-memory.mjs init|check <memory-dir> [--repo <root>] [--strict]\n       provider-memory.mjs hook   (Claude Code PostToolUse; payload on stdin)');
  process.exit(1);
}
