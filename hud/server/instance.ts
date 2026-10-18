// One HUD per repository. A running HUD records itself in <data>/hud.json;
// `lore hud` finds it there and reopens it instead of starting a second
// server, and `lore hud stop` stops it. An entry counts as live only when
// its process exists AND the server at its address reports that same
// process id, so a stale file or a recycled pid never passes for the HUD.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import path from 'node:path';
import type { HudConfig } from './config.ts';

/**
 * GET a small JSON document from the local HUD. Plain node:http with no
 * keep-alive: a pooled fetch socket left open makes a short-lived CLI
 * process linger, and on Windows exiting around one can abort Node.
 */
export function getJson<T>(url: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = get(url, { agent: false, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`no answer from ${url}`)));
    req.on('error', reject);
  });
}

export interface HudInstance {
  pid: number;
  port: number;
  url: string;
  version: string;
  startedAt: string;
  repo: string;
}

export const instanceFile = (config: HudConfig) => path.join(config.dataDir, 'hud.json');

export function readInstance(config: HudConfig): HudInstance | null {
  try {
    const value = JSON.parse(readFileSync(instanceFile(config), 'utf8')) as Partial<HudInstance>;
    return Number.isInteger(value.pid) && Number.isInteger(value.port) && typeof value.url === 'string' ? (value as HudInstance) : null;
  } catch {
    return null;
  }
}

export function writeInstance(config: HudConfig, instance: HudInstance) {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(instanceFile(config), JSON.stringify(instance, null, 2) + '\n');
}

/** Remove the entry; with a pid, only if the entry is that process's (a newer HUD may have replaced it). */
export function clearInstance(config: HudConfig, pid?: number) {
  const file = instanceFile(config);
  if (!existsSync(file)) return;
  if (pid !== undefined && readInstance(config)?.pid !== pid) return;
  rmSync(file, { force: true });
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, we just may not signal it.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The HUD this repository has running, confirmed by asking it; null if none. */
export async function liveInstance(config: HudConfig): Promise<HudInstance | null> {
  const instance = readInstance(config);
  if (!instance || !processAlive(instance.pid)) return null;
  try {
    const meta = await getJson<{ pid?: number }>(`${instance.url}/api/meta`);
    return meta.pid === instance.pid ? instance : null;
  } catch {
    return null;
  }
}

/** Stop the repository's running HUD. Returns what was stopped, or null; a stale entry is cleared either way. */
export async function stopInstance(config: HudConfig): Promise<HudInstance | null> {
  const instance = await liveInstance(config);
  if (!instance) {
    clearInstance(config);
    return null;
  }
  process.kill(instance.pid);
  for (let i = 0; i < 50 && processAlive(instance.pid); i++) await new Promise((r) => setTimeout(r, 100));
  clearInstance(config, instance.pid);
  return instance;
}
