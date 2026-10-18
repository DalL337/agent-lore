#!/usr/bin/env node
// lore — LORE's command line.
//
//   lore hud   [--repo <path>] [--data <dir>] [--port <n>] [--no-open]
//   lore brief [--repo <path>] [--data <dir>]
//
// --data keeps the board and settings in a folder outside the repository
// (default <repo>/.lore), so the HUD only reads the repository.
// The HUD runs from its prebuilt files in hud/dist (npm run build).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [command, ...args] = process.argv.slice(2);

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

const USAGE = `lore ${version}

  lore hud   [--repo <path>] [--data <dir>] [--port <n>] [--no-open]   open the HUD for a repository
  lore brief [--repo <path>] [--data <dir>]                            print the board summary for an agent

  --data <dir>   keep the board and settings outside the repository (default <repo>/.lore)`;

if (command === 'hud') {
  const { startHud } = await loadServer();
  const portText = option('--port');
  const port = portText === undefined ? undefined : Number(portText);
  if (port !== undefined && !(Number.isInteger(port) && port >= 0 && port < 65536)) fail(`--port must be a port number`);
  const hud = await startHud({ repo: option('--repo') ?? process.cwd(), data: option('--data'), port, version }).catch((err) => fail(err.message));
  console.log(`LORE HUD · ${hud.config.repoName} → ${hud.url}`);
  console.log(`  board    ${hud.meta.boardFile}`);
  console.log(`  journals ${hud.meta.journals}`);
  if (hud.meta.boardIgnored === false) {
    console.log(`  note     git would show ${hud.meta.boardFile} as untracked: add /.lore/ to .git/info/exclude to keep it private`);
  }
  console.log('Ctrl+C to stop.');
  if (!flag('--no-open')) openBrowser(hud.url);
  const stop = () => hud.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else if (command === 'brief') {
  const { brief } = await loadServer();
  // A brief must never block a session: report and exit 0.
  try {
    console.log(await brief({ repo: option('--repo') ?? process.cwd(), data: option('--data') }));
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
