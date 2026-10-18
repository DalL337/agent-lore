// `npm run demo`: the built HUD on a throwaway copy of fixtures/demo.
// The copy lives in the temp folder, outside this git checkout, so the HUD
// treats it as its own repository; one journal is aged so a stale one shows.

import { cp, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { startHud } = await import(new URL('../dist/server/main.js', import.meta.url).href);

const repo = await mkdtemp(path.join(tmpdir(), 'lore-demo-'));
await cp(path.join(root, 'hud/fixtures/demo'), repo, { recursive: true });
const old = new Date(Date.now() - 30 * 86_400_000);
await utimes(path.join(repo, '.research/2026-09-20-cache-eviction.md'), old, old);

const hud = await startHud({ repo, version: 'demo' });
console.log(`LORE HUD demo → ${hud.url}   (a copy in ${repo}; deleted on exit)`);
console.log('Ctrl+C to stop.');
const stop = async () => {
  await hud.close();
  await rm(repo, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
