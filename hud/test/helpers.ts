// Test repositories: a copy of fixtures/demo (or an empty folder) in the OS
// temp directory, outside any git checkout, so each one is its own repo root.

import { cp, mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/demo', import.meta.url));
const DAY = 86_400_000;

const made: string[] = [];

/** The demo repo; the cache-eviction journal is aged past the stale threshold. */
export async function demoRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lore-hud-demo-'));
  made.push(dir);
  await cp(FIXTURE, dir, { recursive: true });
  // On Windows, cp keeps each file's modified time, so the journals would age
  // with this checkout. Start them all fresh; then age the stale one.
  const now = new Date();
  for (const f of await readdir(path.join(dir, '.research'))) await utimes(path.join(dir, '.research', f), now, now);
  const old = new Date(Date.now() - 30 * DAY);
  await utimes(path.join(dir, '.research', '2026-09-20-cache-eviction.md'), old, old);
  return dir;
}

export async function emptyRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lore-hud-empty-'));
  made.push(dir);
  return dir;
}

export async function cleanup() {
  await Promise.all(made.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}
