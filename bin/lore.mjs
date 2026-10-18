#!/usr/bin/env node
// lore — LORE's command line.
//
//   lore init       [--repo <path>] [--dry-run] [--commit] [--yes]
//   lore sync       [--repo <path>] [--dry-run]
//   lore check      [--repo <path>]
//   lore hud        [--repo <path>] [--data <dir>] [--port <n>] [--no-open] [--foreground]
//   lore hud status [--repo <path>] [--data <dir>]
//   lore hud stop   [--repo <path>] [--data <dir>]
//   lore brief      [--repo <path>] [--data <dir>]
//
// `lore init` installs LORE into the repository, privately (see
// hud/server/init.ts); `lore sync` regenerates what it generated after
// lore/LORE.md changes; `lore check` reports drift and exits 1.
// `lore hud` runs the HUD in the background (one per repository) and opens
// it; run again, it reopens the one already running. --foreground keeps it
// in this terminal instead. --data keeps the board and settings in a folder
// outside the repository, so the HUD only reads the repository.
// The commands run from the prebuilt files in hud/dist (npm run build).

import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, truncateSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const self = fileURLToPath(import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const suiteDir = path.join(root, 'suite', 'lore');
const [command, ...args] = process.argv.slice(2);
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error(`lore: needs Node 20 or later (this is ${process.version})`);
  process.exit(1);
}
const sub = command === 'hud' && (args[0] === 'stop' || args[0] === 'status') ? args[0] : null;

const flag = (name) => args.includes(name);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`${name} needs a value`);
  return value;
}
function fail(message) {
  console.error(`lore: ${message}`);
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadServer() {
  const built = new URL('../hud/dist/server/main.js', import.meta.url);
  if (!existsSync(built)) fail(`the HUD is not built yet — run \`npm run build\` in ${root}`);
  return import(built.href);
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

const target = () => ({ repo: path.resolve(option('--repo') ?? process.cwd()), data: option('--data') && path.resolve(option('--data')) });

function portOption() {
  const text = option('--port');
  const port = text === undefined ? undefined : Number(text);
  if (port !== undefined && !(Number.isInteger(port) && port >= 0 && port < 65536)) fail('--port must be a port number');
  return port;
}

async function describe(url) {
  const { getJson } = await loadServer();
  const meta = await getJson(`${url}/api/meta`).catch(() => null);
  if (!meta) return;
  console.log(`  board    ${meta.boardFile}`);
  console.log(`  journals ${meta.journals}`);
  if (meta.boardIgnored === false) {
    console.log(`  note     git would show ${meta.boardFile} as untracked: add /.lore/ to .git/info/exclude to keep it private`);
  }
}

/** Run the server here, recorded so `lore hud` and `lore hud stop` can find it. */
async function foreground() {
  const { startHud } = await loadServer();
  const { repo, data } = target();
  const hud = await startHud({ repo, data, port: portOption(), version, register: true }).catch((err) => fail(err.message));
  console.log(`LORE HUD · ${hud.config.repoName} → ${hud.url}   (pid ${process.pid}, started ${new Date().toISOString()})`);
  await describe(hud.url);
  console.log('Ctrl+C to stop.');
  if (!flag('--no-open')) openBrowser(hud.url);
  const stop = () => hud.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

/** Start (or reuse) the repository's HUD in the background, then open it. */
async function background() {
  const { findHud } = await loadServer();
  const { repo, data } = target();
  const port = portOption();
  const found = await findHud({ repo, data }).catch((err) => fail(err.message));
  if (found.live) {
    console.log(`LORE HUD · ${found.config.repoName} is already running → ${found.live.url}`);
    if (port !== undefined && port !== found.live.port) console.log(`  note     it is on port ${found.live.port}; \`lore hud stop\` first to move it to ${port}`);
    if (!flag('--no-open')) openBrowser(found.live.url);
    return;
  }

  // The server's output goes to a small log in the data folder.
  const { dataDir } = found.config;
  mkdirSync(dataDir, { recursive: true });
  const logPath = path.join(dataDir, 'hud.log');
  if (existsSync(logPath) && statSync(logPath).size > 256 * 1024) truncateSync(logPath, 0);
  const log = openSync(logPath, 'a');
  writeSync(log, `\n── ${new Date().toISOString()} lore hud ${version}\n`);
  const childArgs = [self, 'hud', '--foreground', '--no-open', '--repo', repo, ...(data ? ['--data', data] : []), ...(port !== undefined ? ['--port', String(port)] : [])];
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  closeSync(log);
  let exited = null;
  child.on('exit', (code) => (exited = code ?? 1));
  child.unref();

  for (let i = 0; i < 80; i++) {
    await wait(125);
    if (exited !== null) {
      const tail = readFileSync(logPath, 'utf8').trim().split('\n').slice(-6).join('\n');
      fail(`the HUD stopped while starting (exit ${exited}). From ${logPath}:\n${tail}`);
    }
    const now = await findHud({ repo, data });
    if (now.live?.pid === child.pid) {
      console.log(`LORE HUD · ${now.config.repoName} → ${now.live.url}   (in the background, pid ${child.pid})`);
      await describe(now.live.url);
      console.log(`  stop     lore hud stop   ·   log ${logPath}`);
      if (!flag('--no-open')) openBrowser(now.live.url);
      // Nothing holds the event loop (the server is detached and unreferenced),
      // so returning ends this process cleanly.
      child.removeAllListeners('exit');
      return;
    }
  }
  fail(`the HUD did not come up within 10s; see ${logPath}`);
}

async function status() {
  const { findHud } = await loadServer();
  const { config, live } = await findHud(target()).catch((err) => fail(err.message));
  if (!live) {
    console.log(`LORE HUD · ${config.repoName}: not running. \`lore hud\` starts it.`);
    return;
  }
  console.log(`LORE HUD · ${config.repoName}: running → ${live.url}`);
  console.log(`  pid ${live.pid} · version ${live.version} · since ${live.startedAt}`);
}

async function stop() {
  const { stopHud, findHud } = await loadServer();
  const { config } = await findHud(target()).catch((err) => fail(err.message));
  const stopped = await stopHud(target());
  console.log(stopped ? `LORE HUD · ${config.repoName}: stopped (was ${stopped.url}, pid ${stopped.pid}).` : `LORE HUD · ${config.repoName}: was not running.`);
}

function nameOf(server, dir) {
  try {
    return server.resolveConfig(dir).repoName;
  } catch {
    return path.basename(dir);
  }
}

/** `lore init`, or `lore sync` (regenerate only). Nothing here prompts yet, so --yes is accepted and changes nothing. */
async function install(sync) {
  const server = await loadServer();
  const dryRun = flag('--dry-run');
  let plan;
  try {
    plan = server.planInit({ cwd: target().repo, suiteDir, commit: flag('--commit'), sync });
  } catch (err) {
    fail(err.message);
  }
  console.log(`LORE ${version} · ${sync ? 'sync' : 'init'} · ${nameOf(server, plan.root)}${dryRun ? ' · dry run: nothing is written' : ''}`);
  for (const line of server.describePlan(plan, dryRun)) console.log(line);
  const changed = server.pending(plan);
  if (changed && !dryRun) server.applyPlan(plan);
  console.log('');
  if (!changed) console.log(sync ? 'Everything LORE generates is current.' : 'Already set up: nothing changed.');
  else if (dryRun) console.log('Run it again without --dry-run to make these changes.');
  else if (sync) console.log('Synced.');
  else {
    console.log(
      plan.commit
        ? 'Shared: lore/ and the .gitignore block are yours to commit; the board, journals and generated files stay private.'
        : 'Private: none of it shows in git status. `lore init --commit` shares lore/ through the repository instead.',
    );
    console.log('Next: adapt lore/LORE.md and lore/policies/ to this repository (then `lore sync`); `lore hud` opens the board.');
  }
}

async function check() {
  const server = await loadServer();
  let result;
  try {
    result = server.checkRepo({ cwd: target().repo, suiteDir });
  } catch (err) {
    fail(err.message);
  }
  const name = nameOf(server, result.root);
  const failed = result.problems.length > 0 || result.visible.length > 0;
  if (!failed && !result.warnings.length) {
    console.log(`LORE ${version} · check · ${name}: everything LORE generates is current, and git ignores LORE's private files.`);
    return;
  }
  console.log(`LORE ${version} · check · ${name}`);
  for (const problem of result.problems) console.log(`  ✗ ${problem}`);
  if (result.visible.length) {
    const some = result.visible.slice(0, 3).join(', ') + (result.visible.length > 3 ? `, +${result.visible.length - 3}` : '');
    console.log(`  ✗ git would show ${result.visible.length} of LORE's private files (${some}); \`lore sync\` restores LORE's ignore rules`);
  }
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
  if (failed) process.exit(1);
}

const USAGE = `lore ${version}

  lore init       install LORE in this repository, privately (nothing shows in git status)
  lore sync       regenerate the files LORE generates, after editing lore/LORE.md
  lore check      report generated files that are missing or stale (exit 1)
  lore hud        open the HUD for a repository (starts it in the background, or reopens it)
  lore hud status say whether this repository's HUD is running, and where
  lore hud stop   stop it
  lore brief      print the board summary for an agent

  --repo <path>   the repository (default: the current folder)
  --dry-run      init, sync: list what would change and write nothing
  --commit       init: share lore/ through the repository (rules in .gitignore, not .git/info/exclude)
  --data <dir>   keep the board and settings outside the repository (default <main checkout>/.lore)
  --port <n>     exact port (default: the repository's own stable port)
  --no-open      don't open the browser
  --foreground   keep the HUD in this terminal (Ctrl+C stops it)`;

if (command === 'init' || command === 'sync') {
  await install(command === 'sync');
} else if (command === 'check') {
  await check();
} else if (command === 'hud' && sub === 'status') {
  await status();
} else if (command === 'hud' && sub === 'stop') {
  await stop();
} else if (command === 'hud') {
  await (flag('--foreground') ? foreground() : background());
} else if (command === 'brief') {
  const { brief } = await loadServer();
  // A brief must never block a session: report and exit 0.
  try {
    console.log(await brief(target()));
  } catch (err) {
    console.log(`LORE board brief unavailable: ${err.message}`);
  }
} else if (!command || command === '--help' || command === '-h' || command === 'help') {
  console.log(USAGE);
} else if (command === '--version' || command === '-v') {
  console.log(version);
} else {
  fail(`unknown command "${command}"\n\n${USAGE}`);
}
