#!/usr/bin/env node
// lore — LORE's command line.
//
//   lore init       [--repo <path>] [--dry-run] [--commit] [--agents <list>] [--yes]
//   lore sync       [--repo <path>] [--dry-run]
//   lore check      [--repo <path>]
//   lore connect    [claude|codex] [--repo <path>]
//   lore memory     seed|check <memory-dir> [--repo <path>]
//   lore hud        [--repo <path>] [--data <dir>] [--port <n>] [--no-open] [--foreground]
//   lore hud status [--repo <path>] [--data <dir>]
//   lore hud stop   [--repo <path>] [--data <dir>]
//   lore brief      [--repo <path>] [--data <dir>]
//   lore session    [--repo <path>] [--agent <id>]   (the agents' session hook)
//
// `lore init` installs LORE into the repository, privately (see
// hud/server/init.ts), and wires the agents it finds (hud/server/agents.ts);
// `lore sync` regenerates what it generated after lore/LORE.md changes;
// `lore check` reports drift and exits 1; `lore connect` wires another agent.
// `lore session` is what the agents' hooks run: it keeps those files current,
// starts the HUD, and prints the brief.
// `lore hud` runs the HUD in the background (one per repository) and opens
// it; run again, it reopens the one already running. --foreground keeps it
// in this terminal instead. --data keeps the board and settings in a folder
// outside the repository, so the HUD only reads the repository.
// The commands run from the prebuilt files in hud/dist (npm run build).

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, truncateSync, writeSync } from 'node:fs';
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
// How an agent can run LORE again here: through the repository's launcher
// when that is how this started (`lore` may not be on PATH).
const cli = /[\\/]\.lore[\\/]lore\.mjs$/.test(process.argv[1] ?? '') ? 'node .lore/lore.mjs' : 'lore';
const hudLauncher = process.platform === 'win32' ? '.lore\\hud' : '.lore/hud';

const VALUED = new Set(['--repo', '--data', '--port', '--agents', '--agent']);
const positionals = args.filter((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
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

/**
 * Start the repository's HUD in the background, unless it is running.
 * Resolves once it answers, or after `waitMs` with `live: null` while it is
 * still starting. Throws if it exits while starting.
 */
async function startBackground({ repo, data, port, waitMs = 10_000 }) {
  const { findHud } = await loadServer();
  const found = await findHud({ repo, data });
  if (found.live) return { ...found, started: false };
  const { dataDir } = found.config;
  mkdirSync(dataDir, { recursive: true });

  // Sessions can start together (an editor restoring several at once): one
  // takes the lock and starts the HUD, the others wait for it.
  const lockPath = path.join(dataDir, 'hud.starting');
  const otherStart = async () => {
    for (let waited = 0; waited < waitMs; waited += 125) {
      await wait(125);
      const now = await findHud({ repo, data });
      if (now.live) return { ...now, started: false };
    }
    return { config: found.config, live: null, started: false };
  };
  try {
    closeSync(openSync(lockPath, 'wx'));
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    let age;
    try {
      age = Date.now() - statSync(lockPath).mtimeMs;
    } catch {
      return otherStart(); // released just now: that start has finished
    }
    if (age < 15_000) return otherStart();
    rmSync(lockPath, { force: true }); // left by a start that died
    closeSync(openSync(lockPath, 'wx'));
  }
  try {
    const now = await findHud({ repo, data });
    if (now.live) return { ...now, started: false };
    return await spawnHud({ repo, data, port, waitMs, found });
  } finally {
    rmSync(lockPath, { force: true });
  }
}

async function spawnHud({ repo, data, port, waitMs, found }) {
  const { findHud } = await loadServer();
  const { dataDir } = found.config;
  // The server's output goes to a small log in the data folder.
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

  try {
    for (let waited = 0; waited < waitMs; waited += 125) {
      await wait(125);
      if (exited !== null) {
        const tail = readFileSync(logPath, 'utf8').trim().split('\n').slice(-6).join('\n');
        throw new Error(`the HUD stopped while starting (exit ${exited}). From ${logPath}:\n${tail}`);
      }
      const now = await findHud({ repo, data });
      if (now.live?.pid === child.pid) return { ...now, started: true, pid: child.pid, logPath };
    }
    return { config: found.config, live: null, started: true, pid: child.pid, logPath };
  } finally {
    // Nothing else holds the event loop (the server is detached and
    // unreferenced), so returning ends this process cleanly.
    child.removeAllListeners('exit');
  }
}

/** `lore hud`: start (or reuse) the repository's HUD in the background, then open it. */
async function background() {
  const { repo, data } = target();
  const port = portOption();
  const result = await startBackground({ repo, data, port }).catch((err) => fail(err.message));
  const { config, live } = result;
  if (!result.started && !live) fail('another start of this HUD did not finish within 10s; see `lore hud status`');
  if (!result.started) {
    console.log(`LORE HUD · ${config.repoName} is already running → ${live.url}`);
    if (port !== undefined && port !== live.port) console.log(`  note     it is on port ${live.port}; \`lore hud stop\` first to move it to ${port}`);
    if (!flag('--no-open')) openBrowser(live.url);
    return;
  }
  if (!live) fail(`the HUD did not come up within 10s; see ${result.logPath}`);
  console.log(`LORE HUD · ${config.repoName} → ${live.url}   (in the background, pid ${result.pid})`);
  await describe(live.url);
  console.log(`  stop     lore hud stop   ·   log ${result.logPath}`);
  if (!flag('--no-open')) openBrowser(live.url);
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

function configOf(server) {
  try {
    return server.resolveConfig(target().repo);
  } catch (err) {
    fail(err.message);
  }
}

/** .lore/config.json as it stands ({} when missing or unreadable). */
function settingsOf(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, '.lore', 'config.json'), 'utf8').replace(/^﻿/, ''));
  } catch {
    return {};
  }
}

const changedPaths = (plan) => [...new Set(plan.changes.filter((c) => c.kind === 'create' || c.kind === 'update' || c.kind === 'remove').map((c) => c.group ?? c.path))];

/** --agents claude,codex (or none) names them; otherwise init looks for them. */
function chooseAgents(server) {
  const listed = option('--agents');
  if (listed === undefined) {
    const found = server.detectAgents();
    return { ids: found.filter((f) => f.found).map((f) => f.id), found };
  }
  const ids = listed === 'none' ? [] : listed.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !server.isAgentId(id));
  if (unknown.length) fail(`--agents: unknown agent ${unknown.join(', ')} (use claude, codex, or none)`);
  return { ids, found: null };
}

/** gh: null when missing, else whether it is logged in. */
function ghStatus() {
  const run = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 8000, windowsHide: true });
  return run.error ? null : run.status === 0;
}

function foundLine(found) {
  const gh = ghStatus();
  const parts = [
    ...found.map((f) => `${f.name} ${f.found ? '✓' : '–'}`),
    gh === null ? 'gh – (the HUD’s GitHub pane needs it)' : gh ? 'gh ✓' : 'gh ✓ (not logged in: `gh auth login`)',
    `Node ${process.versions.node.split('.')[0]} ✓`,
  ];
  return `Found: ${parts.join('  ')}`;
}

/** The default agent: asked when there is a choice and someone to ask. */
async function askDefault(server, ids) {
  if (ids.length < 2 || flag('--yes') || flag('--dry-run') || !process.stdin.isTTY || !process.stdout.isTTY) return ids[0];
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const menu = ids.map((id, i) => `[${i + 1}] ${server.AGENT_NAMES[id]}`).join('  ');
  const answer = (await rl.question(`? Default agent, the one LORE hands off to: ${menu}  (Enter: 1) `)).trim();
  rl.close();
  const n = Number(answer || '1');
  return ids[Number.isInteger(n) && n >= 1 && n <= ids.length ? n - 1 : 0];
}

function plan(server, options) {
  try {
    return server.planInit({ cwd: target().repo, suiteDir, packageDir: root, ...options });
  } catch (err) {
    fail(err.message);
  }
}

/** Print and (unless --dry-run) apply a plan; true when it changed something. */
function carryOut(server, planned) {
  const dryRun = flag('--dry-run');
  for (const line of server.describePlan(planned, dryRun)) console.log(line);
  const changed = server.pending(planned);
  if (changed && !dryRun) server.applyPlan(planned);
  console.log('');
  return changed;
}

/** `lore init`, or `lore sync` (regenerate only). */
async function install(sync) {
  const server = await loadServer();
  const dryRun = flag('--dry-run');
  const { ids, found } = sync ? { ids: undefined, found: null } : chooseAgents(server);
  let planned = plan(server, { commit: flag('--commit'), sync, agents: ids });
  console.log(`LORE ${version} · ${sync ? 'sync' : 'init'} · ${nameOf(server, planned.root)}${dryRun ? ' · dry run: nothing is written' : ''}`);
  if (found) console.log(foundLine(found));
  if (!sync && planned.agents.length && !server.isAgentId(settingsOf(planned.root).agent)) {
    const defaultAgent = await askDefault(server, planned.agents);
    planned = plan(server, { commit: flag('--commit'), agents: ids, defaultAgent });
  }
  const changed = carryOut(server, planned);
  if (!changed) console.log(sync ? 'Everything LORE generates is current.' : 'Already set up: nothing changed.');
  else if (dryRun) console.log('Run it again without --dry-run to make these changes.');
  else if (sync) console.log('Synced.');
  else {
    console.log(
      planned.commit
        ? 'Shared: lore/ and the .gitignore block are yours to commit; the board, journals and generated files stay private.'
        : 'Private: none of it shows in git status. `lore init --commit` shares lore/ through the repository instead.',
    );
    const settings = settingsOf(planned.root);
    if (planned.agents.length) {
      const names = planned.agents.map((id) => `${server.AGENT_NAMES[id]}${settings.agent === id ? ' (default)' : ''}`);
      console.log(`Agents: ${names.join(', ')}. Each session starts with the board brief, and the HUD starts with it.`);
    } else {
      console.log('Agents: none found (Claude Code, Codex). `lore connect claude` or `lore connect codex` wires one later.');
    }
  }
  if (changed && !dryRun) for (const step of planned.next) console.log(`Then: ${step}`);
  if (changed && !dryRun && !sync) {
    console.log(`Next: adapt lore/LORE.md and lore/policies/ to this repository (then \`lore sync\`); \`${hudLauncher}\` opens the board.`);
  }
}

async function check() {
  const server = await loadServer();
  let result;
  try {
    result = server.checkRepo({ cwd: target().repo, suiteDir, packageDir: root });
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

/** `lore connect <agent>`: wire one more agent; without one, say which are wired. */
async function connect() {
  const server = await loadServer();
  const id = positionals[0];
  if (id === undefined) {
    const config = configOf(server);
    const settings = settingsOf(config.mainRoot);
    const wired = Array.isArray(settings.agents) ? settings.agents : [];
    console.log(`LORE ${version} · agents · ${config.repoName}`);
    for (const f of server.detectAgents()) {
      const state = wired.includes(f.id) ? `connected${settings.agent === f.id ? ' (default)' : ''}` : 'not connected';
      console.log(`  ${f.name.padEnd(12)} ${state}${f.found ? ` · found: ${f.via}` : ' · not found on this machine'}`);
    }
    console.log('\n`lore connect claude` or `lore connect codex` wires one.');
    return;
  }
  if (!server.isAgentId(id)) fail(`unknown agent "${id}": use claude or codex`);
  let planned = plan(server, { sync: true, agents: [id] });
  if (!server.isAgentId(settingsOf(planned.root).agent)) planned = plan(server, { sync: true, agents: [id], defaultAgent: id });
  console.log(`LORE ${version} · connect ${id} · ${nameOf(server, planned.root)}`);
  const changed = carryOut(server, planned);
  console.log(changed ? `${server.AGENT_NAMES[id]} is connected: its sessions start with the board brief.` : `${server.AGENT_NAMES[id]} was already connected.`);
  if (changed) for (const step of planned.next) console.log(`Then: ${step}`);
}

/**
 * `lore memory seed|check <dir>`: Claude Code's memory folder as a hub of
 * policy areas (lore/policies/memory.md §0), with the repository's own copy
 * of the guard. Seeding also turns on the guard's hook.
 */
async function memory() {
  const server = await loadServer();
  const [action, dir] = positionals;
  if (!['seed', 'check'].includes(action) || !dir) fail('usage: lore memory seed|check <memory-dir>   (Claude Code: the folder holding its MEMORY.md)');
  const config = configOf(server);
  const script = [path.join(config.mainRoot, 'lore', 'scripts', 'provider-memory.mjs'), path.join(suiteDir, 'scripts', 'provider-memory.mjs')].find((f) => existsSync(f));
  const folder = path.resolve(dir);
  const run = spawnSync(process.execPath, [script, action === 'seed' ? 'init' : 'check', folder, '--repo', config.mainRoot], { stdio: 'inherit' });
  if (action === 'seed' && run.status === 0) {
    try {
      const planned = server.planInit({ cwd: config.mainRoot, suiteDir, packageDir: root, sync: true, agents: ['claude'], claudeMemory: folder.split(path.sep).join('/') });
      server.applyPlan(planned);
      console.log('memory: the guard now checks each memory write (a Claude Code hook in .claude/settings.local.json).');
    } catch (err) {
      console.log(`memory: seeded, but the guard's hook was not added: ${err.message}`);
    }
  }
  process.exit(run.status ?? 1);
}

/**
 * The agents' session-start hook. Keeps LORE's generated files current,
 * starts the HUD (unless config.json says "autostart": false), and prints the
 * brief, which the agent reads. It must never fail or stall a session, so
 * each step reports instead of throwing.
 */
async function session() {
  const server = await loadServer();
  const { repo } = target();
  const notes = [];
  try {
    const planned = server.planInit({ cwd: repo, suiteDir, packageDir: root, sync: true });
    if (server.pending(planned)) {
      server.applyPlan(planned);
      notes.push(`LORE regenerated ${changedPaths(planned).join(', ')} to match lore/LORE.md and the repository.`);
    }
  } catch (err) {
    if (!(err instanceof server.InitError)) notes.push(`LORE could not refresh its files: ${err.message}`);
  }
  try {
    const { config, live } = await server.findHud({ repo });
    if (!live && config.autostart && !process.env.CI) await startBackground({ repo, waitMs: 4000 });
  } catch (err) {
    notes.push(`The HUD did not start: ${err.message.split('\n')[0]}`);
  }
  try {
    console.log(await server.brief({ repo, cli }));
  } catch (err) {
    console.log(`LORE board brief unavailable: ${err.message}`);
  }
  for (const note of notes) console.log(note);
}

const USAGE = `lore ${version}

  lore init       install LORE in this repository, privately, and wire the agents it finds
  lore sync       regenerate the files LORE generates, after editing lore/LORE.md
  lore check      report generated files that are missing or stale (exit 1)
  lore connect    wire an agent: lore connect claude · lore connect codex (alone: which are wired)
  lore memory     lore memory seed <dir>: shape Claude Code's memory folder as LORE's hub (check: verify it)
  lore hud        open the HUD for a repository (starts it in the background, or reopens it)
  lore hud status say whether this repository's HUD is running, and where
  lore hud stop   stop it
  lore brief      print the board summary for an agent

  --repo <path>   the repository (default: the current folder)
  --dry-run      init, sync: list what would change and write nothing
  --commit       init: share lore/ through the repository (rules in .gitignore, not .git/info/exclude)
  --agents <ids> init: wire exactly these (claude,codex or none) instead of looking for them
  --yes          init: take the defaults without asking
  --data <dir>   keep the board and settings outside the repository (default <main checkout>/.lore)
  --port <n>     exact port (default: the repository's own stable port)
  --no-open      don't open the browser
  --foreground   keep the HUD in this terminal (Ctrl+C stops it)`;

if (command === 'init' || command === 'sync') {
  await install(command === 'sync');
} else if (command === 'check') {
  await check();
} else if (command === 'connect') {
  await connect();
} else if (command === 'memory') {
  await memory();
} else if (command === 'session') {
  await session();
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
    console.log(await brief({ ...target(), cli }));
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
