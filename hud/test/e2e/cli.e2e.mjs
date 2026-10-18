// End-to-end check of the CLI as a user runs it: `lore hud` (background
// start, reuse, status, the brief's pointer, stop), then `lore init`,
// `check` and `sync` in a scratch git repository. Needs the build
// (npm run build).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
process.exit(results.every(Boolean) ? 0 : 1);
