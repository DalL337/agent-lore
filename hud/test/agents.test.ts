// Slice 3 of docs/plans/lore-init.md: finding the agents, wiring their
// session hooks into settings files the owner may already have, and the
// runtime and launchers in .lore/ that those hooks run.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { agentLaunch, claudeHooks, detectAgents, handoffPrompt, mergeHooks, type Machine } from '../server/agents.ts';
import { applyPlan, checkRepo, describePlan, newer, pending, planInit, type InitOptions, type InitPlan } from '../server/init.ts';
import { cleanup, emptyRepo } from './helpers.ts';

after(cleanup);

const SUITE = fileURLToPath(new URL('../../suite/lore', import.meta.url));
const slash = (p: string) => p.split(path.sep).join('/');

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
  });

async function write(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
}

async function repo(files: Record<string, string> = {}): Promise<string> {
  const dir = await emptyRepo();
  git(dir, 'init', '-q', '-b', 'main');
  await write(dir, files);
  // -f: Claude Code adds settings.local.json to the global git excludes.
  git(dir, 'add', '-A', '-f');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

/** A stand-in for the published package: its bin prints what it was asked to do. */
async function fakePackage(version = '9.1.0', marker = 'fake-lore'): Promise<string> {
  const dir = await emptyRepo();
  await write(dir, {
    'package.json': JSON.stringify({ name: '@dall337/lore', version }),
    'bin/lore.mjs': `console.log(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));\n`,
    'hud/dist/server/main.js': 'export {};\n',
    'hud/dist/client/index.html': '<!doctype html>\n',
    'suite/lore/LORE.md': '# LORE\n',
  });
  return dir;
}

const status = (dir: string) => git(dir, 'status', '--porcelain', '--untracked-files=all').trim();
const read = (dir: string, rel: string) => readFile(path.join(dir, rel), 'utf8');
const json = async (dir: string, rel: string) => JSON.parse(await read(dir, rel));

function run(cwd: string, extra: Partial<InitOptions>): InitPlan {
  const plan = planInit({ cwd, suiteDir: SUITE, ...extra });
  applyPlan(plan);
  return plan;
}

// ── Finding the agents ────────────────────────────────────────────────

test('agents are found on PATH, as an editor extension, or by their settings folder', async () => {
  const home = await emptyRepo();
  const bin = path.join(home, 'bin');
  await write(home, { 'bin/claude.cmd': '', '.vscode/extensions/openai.chatgpt-26.1.0-win32-x64/package.json': '{}' });
  const machine: Machine = { env: { PATH: bin, PATHEXT: '.EXE;.CMD' }, home, platform: 'win32' };
  assert.deepEqual(
    detectAgents(machine).map((d) => [d.id, d.via]),
    [
      ['claude', '`claude` on PATH'],
      ['codex', 'the VS Code extension'],
    ],
  );

  const bare = await emptyRepo();
  await mkdir(path.join(bare, '.codex'));
  const found = detectAgents({ env: { PATH: '' }, home: bare, platform: 'linux' });
  assert.deepEqual(found.map((d) => [d.id, d.found, d.via]), [
    ['claude', false, null],
    ['codex', true, '~/.codex'],
  ]);
});

// ── The hand-off ──────────────────────────────────────────────────────

test('the hand-off prompt: Claude seeds its memory first, Codex starts at the board; one line, nothing cmd.exe would change', () => {
  const claude = handoffPrompt('claude', 'node C:/work/app/.lore/lore.mjs');
  assert.match(claude, /1\) Your memory: .*run node C:\/work\/app\/\.lore\/lore\.mjs memory seed followed by that folder's path/);
  assert.match(claude, /ask me before changing anything/, 'existing memory is reported, not converted');
  assert.match(claude, /2\) The board is empty: fill it with me as lore\/policies\/board\.md section 3 describes\./);
  assert.match(claude, /3\) Go through the Provider Memory table in lore\/LORE\.md section 5/);
  const codex = handoffPrompt('codex');
  assert.doesNotMatch(codex, /memory seed/, 'Codex’s memories are left alone');
  assert.match(codex, /1\) The board is empty.* 2\) Go through the Provider Memory table/);
  for (const prompt of [claude, codex]) assert.doesNotMatch(prompt, /["%^&|<>!\r\n`]/);
});

test('launching an agent: its command on PATH, a .cmd shim through cmd.exe, or a reason it can’t be started', async () => {
  const home = await emptyRepo();
  await write(home, { 'win/claude.exe': '', 'win/codex.cmd': '', 'nix/claude': '' });
  const win: Machine = { env: { PATH: path.join(home, 'win'), PATHEXT: '.EXE;.CMD' }, home, platform: 'win32' };
  const prompt = handoffPrompt('claude');
  assert.deepEqual(agentLaunch('claude', prompt, win), { file: path.join(home, 'win', 'claude.exe'), args: [prompt], shell: false });
  assert.deepEqual(agentLaunch('codex', prompt, win), { file: `"${path.join(home, 'win', 'codex.cmd')}" "${prompt}"`, args: [], shell: true });
  assert.match((agentLaunch('codex', 'fix this & that', win) as { reason: string }).reason, /cmd\.exe script/);
  // (A POSIX PATH splits on ":", so this one needs a path without a drive letter.)
  if (process.platform !== 'win32') {
    assert.deepEqual(agentLaunch('claude', prompt, { env: { PATH: path.join(home, 'nix') }, home, platform: 'linux' }), { file: path.join(home, 'nix', 'claude'), args: [prompt], shell: false });
  }
  assert.deepEqual(agentLaunch('codex', prompt, { env: { PATH: '' }, home, platform: 'linux' }), { reason: 'codex isn\'t on PATH' });
});

test('the prompt reaches an agent behind an npm .cmd shim exactly as written', { skip: process.platform !== 'win32' && 'cmd.exe is Windows-only' }, async () => {
  const dir = await emptyRepo();
  const got = path.join(dir, 'argv.json');
  // npm's shims end by running node on the package with %*, as this one does.
  await write(dir, {
    'record.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(got)}, JSON.stringify(process.argv.slice(2)));\n`,
    'bin/claude.cmd': `@ECHO off\r\nSETLOCAL\r\nSET "_prog=${process.execPath}"\r\nendLocal & "%_prog%"  "${path.join(dir, 'record.mjs')}" %*\r\n`,
  });
  for (const id of ['claude', 'codex'] as const) {
    const prompt = handoffPrompt(id, `node ${slash(dir)}/.lore/lore.mjs`);
    const launch = agentLaunch('claude', prompt, { env: { PATH: path.join(dir, 'bin'), PATHEXT: '.EXE;.CMD' }, home: dir, platform: 'win32' });
    assert.ok('file' in launch && launch.shell);
    const run = spawnSync(launch.file, launch.args, { shell: launch.shell, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(await read(dir, 'argv.json')), [prompt]);
  }
});

// ── Merging hooks into settings files ─────────────────────────────────

test('hooks merge into the owner’s settings: their entries stay, LORE’s are replaced, and an unchanged file keeps its formatting', () => {
  const own = {
    permissions: { allow: ['Bash(npm test)'] },
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hello' }] }] },
  };
  const first = mergeHooks(JSON.stringify(own, null, 4), claudeHooks(false));
  assert.equal(first.error, undefined);
  const doc = JSON.parse(first.text!);
  assert.deepEqual(doc.permissions, own.permissions);
  assert.equal(doc.hooks.SessionStart.length, 2, 'the owner’s hook, then LORE’s');
  assert.equal(doc.hooks.SessionStart[0].hooks[0].command, 'echo hello');
  assert.deepEqual(doc.hooks.SessionStart[1].hooks[0].args.slice(0, 2), ['${CLAUDE_PROJECT_DIR}/.lore/lore.mjs', 'session']);

  assert.equal(mergeHooks(first.text!, claudeHooks(false)).text, first.text, 'merging again changes nothing');
  const tabbed = JSON.stringify(doc, null, '\t');
  assert.equal(mergeHooks(tabbed, claudeHooks(false)).text, tabbed, 'the owner’s formatting survives a no-op');

  const guarded = JSON.parse(mergeHooks(first.text!, claudeHooks(true)).text!);
  assert.equal(guarded.hooks.SessionStart.length, 2, 'replaced, not added twice');
  assert.equal(guarded.hooks.PostToolUse[0].matcher, 'Write|Edit');

  const removed = JSON.parse(mergeHooks(JSON.stringify(guarded), {}).text!);
  assert.deepEqual(removed, own, 'removing LORE’s hooks leaves exactly the owner’s');
  assert.match(mergeHooks('{ nope', {}).error!, /not valid JSON/);
});

// ── init with agents and a runtime ────────────────────────────────────

test('init with both agents: runtime, launchers, settings and hooks, all private and idempotent', async () => {
  const pkg = await fakePackage();
  const dir = await repo({ 'README.md': '# app\n' });
  const options = { packageDir: pkg, agents: ['claude', 'codex'] as const, defaultAgent: 'claude' as const };
  const plan = run(dir, { ...options, agents: [...options.agents] });

  assert.deepEqual(plan.agents, ['claude', 'codex']);
  assert.equal(plan.runtime, '9.1.0');
  for (const rel of ['.lore/runtime/bin/lore.mjs', '.lore/runtime/hud/dist/server/main.js', '.lore/runtime/suite/lore/LORE.md', '.lore/lore.mjs', '.lore/hud', '.lore/hud.cmd']) {
    assert.ok(existsSync(path.join(dir, rel)), rel);
  }
  assert.deepEqual(await json(dir, '.lore/config.json'), { agents: ['claude', 'codex'], agent: 'claude', autostart: true });

  const claude = await json(dir, '.claude/settings.local.json');
  assert.deepEqual(claude.hooks.SessionStart[0].hooks[0].args, ['${CLAUDE_PROJECT_DIR}/.lore/lore.mjs', 'session', '--agent', 'claude', '--repo', '${CLAUDE_PROJECT_DIR}']);
  assert.equal(claude.hooks.PostToolUse, undefined, 'no memory guard until Claude’s memory is seeded');
  const codex = await json(dir, '.codex/hooks.json');
  assert.equal(codex.hooks.SessionStart[0].hooks[0].command, `node "${slash(path.join(plan.root, '.lore', 'lore.mjs'))}" session --agent codex`);
  assert.match(plan.next.join('\n'), /\/hooks/, 'the owner is told to trust the Codex hook');

  const rules = await read(dir, '.git/info/exclude');
  assert.match(rules, /^\/\.claude\/settings\.local\.json$/m);
  assert.match(rules, /^\/\.codex\/hooks\.json$/m);
  assert.doesNotMatch(rules, /^\/\.lore\/lore\.mjs$/m, '/.lore/ already covers the launcher');
  assert.equal(status(dir), '', 'git status is empty');

  const again = planInit({ cwd: dir, suiteDir: SUITE, packageDir: pkg, agents: ['claude', 'codex'] });
  assert.equal(pending(again), false, JSON.stringify(again.changes.filter((c) => c.kind !== 'unchanged').map((c) => [c.path, c.kind])));
  assert.deepEqual(again.next, [], 'nothing to trust again when nothing changed');
  const check = checkRepo({ cwd: dir, suiteDir: SUITE, packageDir: pkg });
  assert.deepEqual([check.problems, check.visible], [[], []]);

  const lines = describePlan(plan).join('\n');
  assert.match(lines, /\.lore\/runtime\/\s+copied \d+ files: LORE 9\.1\.0/);
  assert.equal(lines.split('\n').filter((l) => /^\s+✓ \.lore\/runtime\//.test(l)).length, 1, 'the runtime is one line');
});

test('existing settings: config.json keeps the owner’s keys; settings.local.json keeps their permissions', async () => {
  const pkg = await fakePackage();
  const dir = await repo();
  await write(dir, {
    '.lore/config.json': JSON.stringify({ name: 'Widgets HQ', port: 5301 }),
    '.claude/settings.local.json': JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }),
  });
  run(dir, { packageDir: pkg, agents: ['claude'] });
  assert.deepEqual(await json(dir, '.lore/config.json'), { name: 'Widgets HQ', port: 5301, agents: ['claude'], autostart: true });
  const settings = await json(dir, '.claude/settings.local.json');
  assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)'] });
  assert.ok(settings.hooks.SessionStart);
  assert.ok(!existsSync(path.join(dir, '.codex', 'hooks.json')), 'only the agents asked for');
  assert.equal(status(dir), '');
});

test('committed or broken settings files are left alone, with a warning', async () => {
  const pkg = await fakePackage();
  const dir = await repo({ '.claude/settings.local.json': '{}\n', '.codex/hooks.json': '{}\n' });
  const plan = run(dir, { packageDir: pkg, agents: ['claude', 'codex'] });
  const kinds = Object.fromEntries(plan.changes.filter((c) => !c.group).map((c) => [c.path, c.kind]));
  assert.equal(kinds['.claude/settings.local.json'], 'skipped');
  assert.equal(kinds['.codex/hooks.json'], 'skipped');
  assert.equal(plan.warnings.length, 2);
  assert.equal(await read(dir, '.claude/settings.local.json'), '{}\n');
  assert.equal(status(dir), '');

  const broken = await repo();
  await write(broken, { '.claude/settings.local.json': '{ "permissions": ' });
  const plan2 = run(broken, { packageDir: pkg, agents: ['claude'] });
  assert.match(plan2.warnings.join('\n'), /not valid JSON/);
  assert.equal(await read(broken, '.claude/settings.local.json'), '{ "permissions": ');
});

test('sync keeps the wired agents; connect adds one; seeding Claude’s memory turns on the guard', async () => {
  const pkg = await fakePackage();
  const dir = await repo();
  run(dir, { packageDir: pkg, agents: ['claude'], defaultAgent: 'claude' });
  assert.equal(pending(planInit({ cwd: dir, suiteDir: SUITE, packageDir: pkg, sync: true })), false, 'sync reads the agents from config.json');

  const connect = run(dir, { packageDir: pkg, sync: true, agents: ['codex'] });
  assert.deepEqual(connect.agents, ['claude', 'codex']);
  assert.equal((await json(dir, '.lore/config.json')).agent, 'claude', 'the default stays');
  assert.ok(existsSync(path.join(dir, '.codex', 'hooks.json')));

  run(dir, { packageDir: pkg, sync: true, agents: ['claude'], claudeMemory: 'C:/Users/sam/.claude/projects/acme/memory' });
  const settings = await json(dir, '.claude/settings.local.json');
  assert.deepEqual(settings.hooks.PostToolUse[0].hooks[0].args, ['${CLAUDE_PROJECT_DIR}/lore/scripts/provider-memory.mjs', 'hook']);
  assert.equal((await json(dir, '.lore/config.json')).memory.claude, 'C:/Users/sam/.claude/projects/acme/memory');
  assert.equal(pending(planInit({ cwd: dir, suiteDir: SUITE, packageDir: pkg, sync: true })), false, 'the guard stays on through sync');
  assert.equal(status(dir), '');
});

test('the runtime follows the package: stale files go, a newer runtime is kept, and running from it copies nothing', async () => {
  const dir = await repo();
  run(dir, { packageDir: await fakePackage('9.1.0') });
  const stale = path.join(dir, '.lore', 'runtime', 'hud', 'dist', 'client', 'index-0ld.js');
  await writeFile(stale, '');
  const update = run(dir, { packageDir: await fakePackage('9.2.0'), sync: true });
  assert.ok(!existsSync(stale), 'files the package no longer has are removed');
  assert.equal((await json(dir, '.lore/runtime/package.json')).version, '9.2.0');
  assert.match(describePlan(update).join('\n'), /\.lore\/runtime\/\s+updated \d+ files?: LORE 9\.2\.0/);

  const older = planInit({ cwd: dir, suiteDir: SUITE, packageDir: await fakePackage('9.0.5'), sync: true });
  assert.ok(!older.changes.some((c) => c.group === '.lore/runtime/' && c.kind !== 'unchanged'));
  assert.match(older.warnings.join('\n'), /newer than this LORE 9\.0\.5/);

  const fromItself = planInit({ cwd: dir, suiteDir: SUITE, packageDir: path.join(dir, '.lore', 'runtime'), sync: true });
  assert.equal(pending(fromItself), false);
});

test('the launcher runs the copy in .lore/runtime/, or a runtime config.json names', async () => {
  const dir = await repo();
  run(dir, { packageDir: await fakePackage('9.1.0', 'from-runtime') });
  const launch = () => spawnSync(process.execPath, [path.join(dir, '.lore', 'lore.mjs'), 'brief', '--x'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(launch(), 'from-runtime ["brief","--x"]');

  const checkout = await fakePackage('10.0.0', 'from-checkout');
  const config = await json(dir, '.lore/config.json');
  await writeFile(path.join(dir, '.lore', 'config.json'), JSON.stringify({ ...config, runtime: checkout }));
  assert.equal(launch(), 'from-checkout ["brief","--x"]');
});

test('newer compares versions', () => {
  assert.equal(newer('0.10.0', '0.9.9'), true);
  assert.equal(newer('1.0.0', '1.0.0'), false);
  assert.equal(newer('1.0.0-beta.1', '0.9.0'), true);
  assert.equal(newer('0.2.0', '0.10.0'), false);
});
