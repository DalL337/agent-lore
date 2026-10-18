// End-to-end check of the built HUD in a headless Chromium browser: it acts
// like a user and checks the board file on disk after each action.
//
//   npm run test:e2e        (builds first)
//
// Finds Chrome, Edge or Chromium on its own; set CHROME_PATH to choose one.
// Exits 0 when every check passes and the page logged no errors.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = setTimeout(() => {
  console.error('ui.e2e: timed out');
  process.exit(2);
}, 120_000);

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = process.env.LOCALAPPDATA ?? '';
  const files = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const file = files.find((f) => existsSync(f));
  if (file) return file;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    if (spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0) return name;
  }
  return null;
}

const browser = findBrowser();
if (!browser) {
  console.error('ui.e2e: no Chrome, Edge or Chromium found; set CHROME_PATH');
  process.exit(1);
}
const built = path.join(root, 'hud/dist/server/main.js');
if (!existsSync(built)) {
  console.error('ui.e2e: build the HUD first (npm run build)');
  process.exit(1);
}
const { startHud } = await import(pathToFileURL(built).href);

const demo = await mkdtemp(path.join(tmpdir(), 'lore-e2e-demo-'));
await cp(path.join(root, 'hud/fixtures/demo'), demo, { recursive: true });
// One journal untouched for a month, so the stale views have something in them.
const aged = new Date(Date.now() - 30 * 86_400_000);
await utimes(path.join(demo, '.research/2026-09-20-cache-eviction.md'), aged, aged);
const boardFile = path.join(demo, '.lore', 'board.json');
const disk = async () => JSON.parse(await readFile(boardFile, 'utf8'));
const profile = await mkdtemp(path.join(tmpdir(), 'lore-e2e-profile-'));
const hud = await startHud({ repo: demo, port: 0, version: 'e2e' });

const chrome = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    // CI runners (Ubuntu 24.04) block the sandbox's user namespaces; the page under test is our own.
    ...(process.env.CI ? ['--no-sandbox'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let debugPort = null;
for (let i = 0; i < 100 && !debugPort; i++) {
  await wait(100);
  debugPort = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').then((t) => t.split('\n')[0].trim()).catch(() => null);
}
let target = null;
for (let i = 0; i < 50 && !target; i++) {
  target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
  if (!target) await wait(100);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((x) => x.value ?? x.description).join(' '));
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
async function until(expression, label) {
  for (let i = 0; i < 50; i++) {
    if (await js(expression)) return true;
    await wait(100);
  }
  throw new Error(`never true: ${label}`);
}
const VK = { ArrowRight: 39, Enter: 13, Escape: 27 };
async function key(k, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, modifiers, windowsVirtualKeyCode: VK[k] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, modifiers, windowsVirtualKeyCode: VK[k] });
}
const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${hud.url}/` });
  await until(`!!document.querySelector('.card') && !!document.querySelector('.inbox-row')`, 'page loaded');

  // Inbox → Make card lands in the active column with the journal linked.
  await js(`[...document.querySelectorAll('.inbox-row')].find((r) => r.textContent.includes('Export file format')).querySelector('.pill-primary').click()`);
  await until(`![...document.querySelectorAll('.inbox-row')].some((r) => r.textContent.includes('Export file format'))`, 'inbox row gone');
  let b = await disk();
  let made = b.cards.find((c) => c.links?.journals?.includes('2026-10-16-export-format.md'));
  check('Inbox → Make card', made?.column === 'doing' && made?.title === 'Export file format', JSON.stringify(made && { column: made.column, title: made.title }));

  // New card through the editor (Ctrl+Enter submits); areas take the board's spelling.
  await js(`[...document.querySelectorAll('button')].find((x) => x.textContent === 'New card').click()`);
  await until(`document.querySelector('.drawer.open input[name=title]') === document.activeElement`, 'editor open');
  await send('Input.insertText', { text: 'Typed in the editor' });
  await js(`(() => { document.querySelector('.drawer input[name=area]').value = 'API Ui'; return true; })()`);
  await key('Enter', 2 /* ctrl */);
  await until(`!document.querySelector('.drawer.open')`, 'editor closed');
  b = await disk();
  made = b.cards.find((c) => c.title === 'Typed in the editor');
  check('New card via the editor', made?.column === 'next' && JSON.stringify(made.area) === '["api","ui"]', JSON.stringify(made && { column: made.column, area: made.area }));

  // Alt+ArrowRight moves a focused card one column right.
  await js(`document.querySelector('.card[data-id="csv-import"]').focus()`);
  await key('ArrowRight', 1 /* alt */);
  await until(`fetch('/api/board').then((r) => r.json()).then((x) => x.cards.find((c) => c.id === 'csv-import').column === 'next')`, 'moved');
  check('Alt+→ moves a card', (await disk()).cards.find((c) => c.id === 'csv-import').column === 'next');

  // Clearing a field in the editor sticks (null clears).
  await js(`document.querySelector('.card[data-id="rate-limits"]').click()`);
  await until(`!!document.querySelector('.drawer.open textarea[name=notes]')`, 'editor open');
  await js(`(() => { document.querySelector('.drawer textarea[name=notes]').value = ''; document.querySelector('.drawer form').requestSubmit(); return true; })()`);
  await until(`!document.querySelector('.drawer.open')`, 'saved');
  check('An emptied field is cleared', (await disk()).cards.find((c) => c.id === 'rate-limits').notes === undefined);

  // An outside edit (an agent writing the file) shows up live.
  b = await disk();
  b.cards.push({ id: 'from-agent', title: 'Written by an agent', column: 'blocked' });
  await writeFile(boardFile, JSON.stringify(b, null, 2));
  check('An outside edit appears live', await until(`!!document.querySelector('.card[data-id="from-agent"]')`, 'live push').catch(() => false));

  // Area lens from a chip click; Esc clears it.
  await js(`document.querySelector('.card[data-id="search-index"] .area').click()`);
  const dimmed = await js(`document.querySelectorAll('.card.is-dim').length`);
  await key('Escape');
  const cleared = await js(`document.querySelectorAll('.card.is-dim').length === 0 && !location.search.includes('area=')`);
  check('The area lens dims, Esc clears', dimmed > 0 && cleared, `${dimmed} dimmed`);

  // Journals live in the drawer: the nav link opens it, and closes it again.
  const navJournals = `document.querySelector('.nav-link[data-panel=journals]')`;
  await js(`${navJournals}.click()`);
  await until(`!!document.querySelector('.drawer.open .jrow')`, 'journals drawer');
  const opened = await js(`({ expanded: ${navJournals}.getAttribute('aria-expanded'), url: location.search })`);
  await js(`${navJournals}.click()`);
  const closed = await js(`!document.querySelector('.drawer.open') && !location.search.includes('panel=')`);
  check('The Journals link toggles its drawer', opened.expanded === 'true' && opened.url.includes('panel=journals') && closed, JSON.stringify(opened));

  // A count opens the drawer on its tab.
  await js(`[...document.querySelectorAll('.stat-btn')].find((b) => b.textContent.includes('stale')).click()`);
  await until(`!!document.querySelector('.drawer.open .jrow')`, 'stale journals');
  const stale = await js(`({ tab: document.querySelector('.drawer .filter[aria-selected=true]').textContent, rows: document.querySelectorAll('.drawer .jrow').length, url: location.search })`);
  check('The stale count opens Journals on Stale', stale.tab.startsWith('Stale') && stale.rows === 1 && stale.url.includes('jf=stale'), JSON.stringify(stale));

  // Policy lens from a journal chip, inside the drawer.
  await js(`[...document.querySelectorAll('.drawer .filter')].find((b) => b.textContent.startsWith('All')).click()`);
  await js(`document.querySelector('.drawer .jrow .chip-policy').click()`);
  const lens = await js(`({ match: document.querySelectorAll('.drawer .jrow.is-match').length, url: location.search })`);
  check('A policy chip filters the journals', lens.match > 0 && lens.url.includes('policy='), JSON.stringify(lens));
  await js(`document.querySelector('.drawer .filter-clear').click()`);

  // Reader opened from the list; back returns to the list with its tab kept.
  await js(`document.querySelector('.drawer .jrow').click()`);
  await until(`!!document.querySelector('.drawer .md')`, 'reader');
  const backLabel = await js(`document.querySelector('.drawer-back')?.textContent`);
  await js(`document.querySelector('.drawer-back').click()`);
  const backAt = await js(`({ rows: document.querySelectorAll('.drawer .jrow').length, tab: document.querySelector('.drawer .filter[aria-selected=true]').textContent })`);
  check('Back from a journal returns to the list', backLabel === '← Journals' && backAt.rows === 5 && backAt.tab.startsWith('All'), JSON.stringify({ backLabel, ...backAt }));

  // Push narrows the page beside the drawer; overlay leaves it; the choice survives a reload.
  const margin = `parseFloat(getComputedStyle(document.querySelector('main')).marginRight)`;
  await js(`[...document.querySelectorAll('.seg')].find((b) => b.textContent === 'Push').click()`);
  await wait(350);
  const pushed = await js(margin);
  await js(`[...document.querySelectorAll('.seg')].find((b) => b.textContent === 'Overlay').click()`);
  await wait(350);
  const overlaid = await js(margin);
  await send('Page.reload');
  await until(`!!document.querySelector('.drawer.open .jrow')`, 'panel reopened after reload');
  const remembered = await js(`document.querySelector('.seg[aria-pressed=true]').textContent`);
  check('Push and overlay, remembered across a reload', pushed > 400 && overlaid === 0 && remembered === 'Overlay', JSON.stringify({ pushed, overlaid, remembered }));

  // Saving a card opened over a panel returns to the panel.
  await js(`document.querySelector('.card[data-id="webhook-retries"]').click()`);
  await until(`!!document.querySelector('.drawer.open form.editor')`, 'editor over panel');
  await js(`document.querySelector('.drawer form').requestSubmit()`);
  await until(`!!document.querySelector('.drawer.open .jrow')`, 'back to journals');
  check('Saving a card returns to the open panel', true);
  await js(`document.querySelector('.drawer [aria-label=Close]').click()`);

  // Intake and done columns start stacked; a column's toggle deals it out, and that sticks.
  const stackState = `({ backlog: !!document.querySelector('.col-body[data-column=backlog].is-stacked'), next: !!document.querySelector('.col-body[data-column=next].is-stacked'), done: !!document.querySelector('.col-body[data-column=done].is-stacked') })`;
  const before = await js(stackState);
  await js(`document.querySelector('.col-body[data-column=backlog]').closest('.col').querySelector('.stack-toggle').click()`);
  await send('Page.reload');
  await until(`!!document.querySelector('.card')`, 'reloaded');
  await until(`!document.querySelector('.col-body[data-column=backlog].is-stacked')`, 'backlog dealt out').catch(() => {});
  const after = await js(stackState);
  check('Stacked columns: intake and done by default; a toggle sticks', before.backlog && !before.next && before.done && !after.backlog && after.done, JSON.stringify({ before, after }));
} catch (err) {
  check('run', false, err.message);
} finally {
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'console errors: none');
  ws.close();
  chrome.kill();
  await hud.close();
  await wait(300);
  await Promise.all([demo, profile].map((d) => rm(d, { recursive: true, force: true }).catch(() => {})));
  clearTimeout(deadline);
}
process.exit(results.every(Boolean) && errors.length === 0 ? 0 : 1);
