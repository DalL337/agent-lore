// End-to-end check of the CLI as a user runs it: `lore hud` (background
// start, reuse, status, the brief's pointer, stop), then `lore init`,
// `check` and `sync` in a scratch git repository. Needs the build
// (npm run build).

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const bin = path.join(root, 'bin', 'lore.mjs');
if (!existsSync(path.join(root, 'hud/dist/server/main.js'))) {
  console.error('cli.e2e: build the HUD first (npm run build)');
  process.exit(1);
}

const repo = await mkdtemp(path.join(tmpdir(), 'lore-cli-e2e-'));
await cp(path.join(root, 'hud/fixtures/demo'), repo, { recursive: true });
const lore = (...args) => {
  const r = spawnSync(process.execPath, [bin, ...args, '--repo', repo], { encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};
const registry = async () => JSON.parse(await readFile(path.join(repo, '.lore', 'hud.json'), 'utf8').catch(() => 'null'));

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

let pid = null;
try {
  const started = lore('hud', '--no-open');
  const entry = await registry();
  pid = entry?.pid ?? null;
  const meta = entry ? await fetch(`${entry.url}/api/meta`).then((r) => r.json()).catch(() => null) : null;
  check(
    'lore hud starts it in the background and returns',
    started.code === 0 && /in the background, pid \d+/.test(started.out) && entry && alive(entry.pid) && meta?.pid === entry.pid,
    `${entry?.url} pid ${entry?.pid}`,
  );
  check('it gets the repository’s stable port', entry && entry.port >= 5200 && entry.port < 6000, String(entry?.port));

  const again = lore('hud', '--no-open');
  check('lore hud again reuses the running one', again.code === 0 && /already running/.test(again.out) && (await registry())?.pid === pid);

  const status = lore('hud', 'status');
  check('lore hud status reports it', status.code === 0 && status.out.includes(`running → ${entry?.url}`));

  const brief = lore('brief');
  check('the brief points at it', brief.out.includes(`HUD: ${entry?.url} (running)`));

  const stopped = lore('hud', 'stop');
  await new Promise((r) => setTimeout(r, 300));
  check('lore hud stop stops it and clears the record', stopped.code === 0 && /stopped/.test(stopped.out) && !alive(pid) && (await registry()) === null);

  const after = lore('hud', 'status');
  check('status then says not running', /not running/.test(after.out));
} catch (err) {
  check('run', false, err.message);
} finally {
  if (pid && alive(pid)) process.kill(pid);
  await rm(repo, { recursive: true, force: true }).catch(() => {});
}

// lore init / check / sync, in a repository with a committed AGENTS.md.
const scratch = await mkdtemp(path.join(tmpdir(), 'lore-init-e2e-'));
const plain = await mkdtemp(path.join(tmpdir(), 'lore-nogit-e2e-'));
const gitIn = (...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'core.autocrlf=false', ...args], { cwd: scratch, encoding: 'utf8' });
const run = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
try {
  gitIn('init', '-q', '-b', 'main');
  await writeFile(path.join(scratch, 'AGENTS.md'), '# Acme\n\nRun the tests before every PR.\n');
  gitIn('add', '-A');
  gitIn('commit', '-q', '-m', 'init');
  const clean = () => gitIn('status', '--porcelain', '--untracked-files=all') === '';

  const dry = run(scratch, 'init', '--dry-run');
  check('lore init --dry-run lists the changes and writes nothing', dry.code === 0 && /would copy \d+ files/.test(dry.out) && !existsSync(path.join(scratch, 'lore')) && clean());

  const init = run(scratch, 'init', '--yes');
  check(
    'lore init installs LORE and git status stays empty',
    init.code === 0 && existsSync(path.join(scratch, 'lore', 'LORE.md')) && existsSync(path.join(scratch, 'AGENTS.override.md')) && clean(),
    init.code === 0 ? '' : init.out,
  );
  const again = run(scratch, 'init');
  check('lore init again changes nothing', again.code === 0 && /nothing changed/.test(again.out));
  check('lore check passes', run(scratch, 'check').code === 0);

  await appendFile(path.join(scratch, 'lore', 'LORE.md'), '\n## Acme\n\nShip on Fridays.\n');
  const stale = run(scratch, 'check');
  check('lore check fails once lore/LORE.md changes', stale.code === 1 && /AGENTS\.override\.md is out of date/.test(stale.out));
  const synced = run(scratch, 'sync');
  const override = await readFile(path.join(scratch, 'AGENTS.override.md'), 'utf8');
  check('lore sync regenerates, and check passes again', synced.code === 0 && override.includes('Ship on Fridays') && run(scratch, 'check').code === 0 && clean());

  const outside = run(plain, 'init');
  check('lore init outside git stops and says why', outside.code === 1 && /git init/.test(outside.out));
} catch (err) {
  check('init run', false, err.message);
} finally {
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
  await rm(plain, { recursive: true, force: true }).catch(() => {});
}

// Agents: the runtime and launcher, the session hook, connect, memory seed.
const wired = await mkdtemp(path.join(tmpdir(), 'lore-agents-e2e-'));
const memoryDir = await mkdtemp(path.join(tmpdir(), 'lore-memory-e2e-'));
let sessionPid = null;
// As the hooks run it: through .lore/lore.mjs, with CI unset (CI skips the HUD autostart).
const launcher = (...args) => {
  const r = spawnSync(process.execPath, [path.join(wired, '.lore', 'lore.mjs'), ...args], {
    cwd: wired,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, CI: '' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
try {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: wired });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: wired });
  const clean = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: wired, encoding: 'utf8' }) === '';

  const init = run(wired, 'init', '--agents', 'claude,codex', '--yes');
  const settings = JSON.parse(await readFile(path.join(wired, '.claude', 'settings.local.json'), 'utf8').catch(() => '{}'));
  check(
    'lore init --agents wires both: runtime, launcher, hooks; git status empty',
    init.code === 0 &&
      existsSync(path.join(wired, '.lore', 'runtime', 'bin', 'lore.mjs')) &&
      existsSync(path.join(wired, '.codex', 'hooks.json')) &&
      settings.hooks?.SessionStart?.length === 1 &&
      /trust LORE’s session hook/.test(init.out) &&
      clean(),
    init.code === 0 ? '' : init.out,
  );

  const started = launcher('session', '--agent', 'claude');
  sessionPid = JSON.parse(await readFile(path.join(wired, '.lore', 'hud.json'), 'utf8').catch(() => 'null'))?.pid ?? null;
  check(
    'the session hook prints the brief and starts the HUD',
    started.code === 0 && /=== LORE board/.test(started.out) && /HUD: http:\/\/127\.0\.0\.1:\d+ \(running\)/.test(started.out) && sessionPid !== null && alive(sessionPid),
    started.out.split('\n').find((l) => l.startsWith('HUD')) ?? started.out,
  );
  check('the brief names the launcher, which works without lore on PATH', started.out.includes('`node .lore/lore.mjs hud`'));
  const stopped = launcher('hud', 'stop');
  await new Promise((r) => setTimeout(r, 300));
  check('the launcher runs the rest of the CLI (hud stop)', stopped.code === 0 && /stopped/.test(stopped.out) && !alive(sessionPid));

  // Two sessions at once (an editor restoring several): one HUD between them.
  const together = await Promise.all(
    ['claude', 'codex'].map(
      (agent) =>
        new Promise((done) => {
          const child = spawn(process.execPath, [path.join(wired, '.lore', 'lore.mjs'), 'session', '--agent', agent], { cwd: wired, env: { ...process.env, CI: '' } });
          let out = '';
          child.stdout.on('data', (d) => (out += d));
          child.on('close', () => done(out.match(/HUD: (\S+) \(running\)/)?.[1] ?? null));
        }),
    ),
  );
  const shared = JSON.parse(await readFile(path.join(wired, '.lore', 'hud.json'), 'utf8').catch(() => 'null'));
  // Each start writes one header line to the log; the first session's start is already there.
  const starts = (await readFile(path.join(wired, '.lore', 'hud.log'), 'utf8')).split('\n').filter((l) => /^── \S+ lore hud /.test(l)).length;
  check(
    'two sessions starting together share one HUD',
    together[0] !== null && together[0] === together[1] && together[0] === shared?.url && starts === 2,
    `${together.join(' · ')} · ${starts - 1} start(s)`,
  );
  if (shared?.pid) sessionPid = shared.pid;
  launcher('hud', 'stop');

  const listing = launcher('connect');
  check('lore connect lists both as connected', /Claude Code\s+connected \(default\)/.test(listing.out) && /Codex\s+connected/.test(listing.out));

  const seeded = launcher('memory', 'seed', memoryDir);
  const guarded = JSON.parse(await readFile(path.join(wired, '.claude', 'settings.local.json'), 'utf8'));
  check(
    'lore memory seed shapes the hub and turns on the guard',
    seeded.code === 0 && existsSync(path.join(memoryDir, 'MEMORY.md')) && guarded.hooks?.PostToolUse?.[0]?.matcher === 'Write|Edit' && clean(),
    seeded.code === 0 ? '' : seeded.out,
  );

  const config = JSON.parse(await readFile(path.join(wired, '.lore', 'config.json'), 'utf8'));
  await writeFile(path.join(wired, '.lore', 'config.json'), JSON.stringify({ ...config, autostart: false }));
  const quiet = launcher('session', '--agent', 'codex');
  check('"autostart": false: the session brief, without starting the HUD', quiet.code === 0 && /HUD: not running/.test(quiet.out) && !existsSync(path.join(wired, '.lore', 'hud.json')));
} catch (err) {
  check('agents run', false, err.message);
} finally {
  if (sessionPid && alive(sessionPid)) process.kill(sessionPid);
  await rm(wired, { recursive: true, force: true }).catch(() => {});
  await rm(memoryDir, { recursive: true, force: true }).catch(() => {});
}

// Worktrees through git's own hook, update, and uninstall back to exactly where it started.
const fresh = await mkdtemp(path.join(tmpdir(), 'lore-uninstall-e2e-'));
const branch = `${fresh}-feature`;
let worktreePid = null;
/** Every file (with a hash) and folder, .git/info and .git/hooks included. */
const snapshot = (dir) => {
  const out = {};
  const visit = (rel) => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      const child = rel ? `${rel}/${name}` : name;
      if (child === '.git') {
        for (const sub of ['info', 'hooks']) visit(`.git/${sub}`);
      } else if (statSync(path.join(dir, child)).isDirectory()) {
        out[`${child}/`] = 'folder';
        visit(child);
      } else {
        out[child] = createHash('sha1').update(readFileSync(path.join(dir, child))).digest('hex');
      }
    }
  };
  visit('');
  return JSON.stringify(out);
};
try {
  const gitAt = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8' });
  gitAt(fresh, 'init', '-q', '-b', 'main');
  await writeFile(path.join(fresh, 'README.md'), '# app\n');
  gitAt(fresh, 'add', '-A');
  gitAt(fresh, 'commit', '-q', '-m', 'init');
  const before = snapshot(fresh);

  run(fresh, 'init', '--agents', 'claude,codex', '--yes');
  const added = gitAt(fresh, 'worktree', 'add', '-b', 'feature', branch);
  const copy = await readFile(path.join(branch, 'lore', 'LORE.md'), 'utf8').catch(() => '');
  check(
    'git worktree add: LORE’s hook sets the worktree up, pointing at the main checkout',
    copy.includes(`${fresh.split(path.sep).join('/')}/lore/policies/`) && existsSync(path.join(branch, '.claude', 'settings.local.json')) && gitAt(branch, 'status', '--porcelain', '--untracked-files=all') === '',
    added.split('\n').find((l) => l.startsWith('LORE')) ?? '',
  );
  const inWorktree = spawnSync(process.execPath, [path.join(fresh, '.lore', 'lore.mjs'), 'session', '--agent', 'claude', '--repo', branch], { cwd: branch, encoding: 'utf8', env: { ...process.env, CI: '' } });
  worktreePid = JSON.parse(await readFile(path.join(fresh, '.lore', 'hud.json'), 'utf8').catch(() => 'null'))?.pid ?? null;
  check('a session in the worktree: the brief names the main checkout’s board by absolute path', inWorktree.stdout.includes(`${fresh.split(path.sep).join('/')}/.lore/board.json`), inWorktree.stdout.split('\n')[0]);
  const updated = run(fresh, 'update');
  check('lore update: everything current', updated.code === 0 && /Everything LORE generates is current/.test(updated.out), updated.code === 0 ? '' : updated.out);

  const removed = run(fresh, 'uninstall');
  check('lore uninstall stops the HUD and empties the worktree of LORE', removed.code === 0 && (!worktreePid || !alive(worktreePid)) && gitAt(branch, 'status', '--porcelain', '--untracked-files=all') === '', removed.code === 0 ? '' : removed.out);
  gitAt(fresh, 'worktree', 'remove', branch);
  check('…and the repository is byte for byte as it was before lore init', snapshot(fresh) === before);
} catch (err) {
  check('uninstall run', false, err.message);
} finally {
  if (worktreePid && alive(worktreePid)) process.kill(worktreePid);
  await rm(branch, { recursive: true, force: true }).catch(() => {});
  await rm(fresh, { recursive: true, force: true }).catch(() => {});
}
process.exit(results.every(Boolean) ? 0 : 1);
