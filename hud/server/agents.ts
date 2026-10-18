// The agents LORE wires (docs/plans/lore-init.md, slice 3): how to tell
// they are on this machine, and the session hooks each one gets.
//
// Checked against the vendors' builds on 2026-10-18 (Claude Code 2.1.185
// and 2.1.301, codex-cli 0.162), with a probe hook in a scratch repository:
//   Claude Code  .claude/settings.local.json; runs `args` hooks directly (no
//                shell) in the project folder, with ${CLAUDE_PROJECT_DIR}
//                filled in; SessionStart stdout becomes context.
//   Codex        .codex/hooks.json, loaded only once the owner trusts the
//                folder, and each hook only once trusted in /hooks (by hash:
//                a changed hook needs trusting again). Hooks run in the
//                session's folder, possibly a subfolder, with no variable for
//                the project root, so the command carries an absolute path.
//                SessionStart stdout reaches the model as developer context.

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export type AgentId = 'claude' | 'codex';
export const AGENT_IDS: readonly AgentId[] = ['claude', 'codex'];
export const AGENT_NAMES: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex' };
export const isAgentId = (value: unknown): value is AgentId => value === 'claude' || value === 'codex';

export interface Machine {
  env: Record<string, string | undefined>;
  home: string;
  platform: NodeJS.Platform;
}

const thisMachine = (): Machine => ({ env: process.env, home: homedir(), platform: process.platform });

/** The file a command name resolves to on PATH, or null. */
export function onPath(command: string, machine: Machine = thisMachine()): string | null {
  const win = machine.platform === 'win32';
  const dirs = (machine.env.PATH ?? machine.env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  const exts = win ? (machine.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const file = path.join(dir, command + ext.toLowerCase());
      if (existsSync(file)) return file;
    }
  }
  return null;
}

/** An installed editor extension whose folder starts with `prefix` (VS Code and its forks). */
function editorExtension(home: string, prefix: string): string | null {
  for (const editor of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf']) {
    try {
      const hit = readdirSync(path.join(home, editor, 'extensions')).find((name) => name.startsWith(prefix));
      if (hit) return hit;
    } catch {
      // no such editor
    }
  }
  return null;
}

export interface Detection {
  id: AgentId;
  name: string;
  found: boolean;
  /** How it was found, for the owner: "`claude` on PATH", "the VS Code extension", "~/.codex". */
  via: string | null;
}

const PROBES: Record<AgentId, { command: string; extension: string; home: (m: Machine) => string }> = {
  claude: { command: 'claude', extension: 'anthropic.claude-code-', home: (m) => m.env.CLAUDE_CONFIG_DIR ?? path.join(m.home, '.claude') },
  codex: { command: 'codex', extension: 'openai.chatgpt-', home: (m) => m.env.CODEX_HOME ?? path.join(m.home, '.codex') },
};

/** Which agents this machine has: on PATH, as an editor extension, or by their settings folder. */
export function detectAgents(machine: Machine = thisMachine()): Detection[] {
  return AGENT_IDS.map((id) => {
    const probe = PROBES[id];
    const home = probe.home(machine);
    const via = onPath(probe.command, machine)
      ? `\`${probe.command}\` on PATH`
      : editorExtension(machine.home, probe.extension)
        ? 'the VS Code extension'
        : existsSync(home)
          ? path.relative(machine.home, home).startsWith('..')
            ? home
            : `~/${path.relative(machine.home, home).split(path.sep).join('/')}`
          : null;
    return { id, name: AGENT_NAMES[id], found: via !== null, via };
  });
}

// ── Hooks ──────────────────────────────────────────────────────────────

export interface HookGroup {
  matcher?: string;
  hooks: Record<string, unknown>[];
}
export type HookEvents = Record<string, HookGroup[]>;

/** A hook entry is LORE's when it runs LORE's launcher or memory guard. */
const LORE_COMMAND = /[\\/]\.lore[\\/]lore\.mjs|[\\/]lore[\\/]scripts[\\/]provider-memory\.mjs/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isLoreHook(hook: unknown): boolean {
  if (!isObject(hook)) return false;
  const parts = [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])].filter((p): p is string => typeof p === 'string');
  return LORE_COMMAND.test(parts.join(' '));
}

const PROJECT = '${CLAUDE_PROJECT_DIR}';

/**
 * Claude Code's hooks: the session brief (which also keeps generated files
 * current and starts the HUD), and, once Claude's memory is seeded, the
 * memory guard on every Write or Edit. In the main checkout they run from
 * the project folder; a linked worktree has no .lore/ or lore/scripts/ of
 * its own, so there `main` gives the main checkout's absolute path.
 */
export function claudeHooks(memoryGuard: boolean, main?: string): HookEvents {
  const base = main ? main.split(path.sep).join('/') : PROJECT;
  return {
    SessionStart: [
      {
        hooks: [
          { type: 'command', command: 'node', args: [`${base}/.lore/lore.mjs`, 'session', '--agent', 'claude', '--repo', PROJECT], timeout: 30, statusMessage: 'LORE: board brief' },
        ],
      },
    ],
    ...(memoryGuard
      ? {
          PostToolUse: [
            { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node', args: [`${base}/lore/scripts/provider-memory.mjs`, 'hook', ...(main ? ['--repo', base] : [])] }] },
          ],
        }
      : {}),
  };
}

/** What a linked worktree's Claude sessions may read and edit in the main checkout: LORE's folders only. */
export const mainDirectories = (main: string) => ['lore', '.lore', '.research'].map((d) => `${main.split(path.sep).join('/')}/${d}`);

/**
 * Settings text with `wanted` in permissions.additionalDirectories, and
 * none of `ours` that isn't wanted. Other entries are the owner's and stay.
 */
export function mergeDirectories(text: string, wanted: string[], ours: string[]): Merged {
  let doc: unknown;
  try {
    doc = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    return { error: `not valid JSON (${(err as Error).message})` };
  }
  if (!isObject(doc)) return { error: 'not a JSON object' };
  const before = JSON.stringify(doc);
  const permissions = isObject(doc.permissions) ? { ...doc.permissions } : {};
  const listed = Array.isArray(permissions.additionalDirectories) ? permissions.additionalDirectories : [];
  const kept = listed.filter((d) => !ours.includes(d as string));
  const dirs = [...kept, ...wanted.filter((d) => !kept.includes(d))];
  if (dirs.length) permissions.additionalDirectories = dirs;
  else delete permissions.additionalDirectories;
  const next: Record<string, unknown> = { ...doc, permissions };
  if (!Object.keys(permissions).length) delete next.permissions;
  if (JSON.stringify(next) === before) return { text };
  return { text: `${JSON.stringify(next, null, 2)}\n` };
}

/** Codex's hook: the session brief, by absolute path (Codex runs hooks in the session's folder). */
export function codexHooks(root: string): HookEvents {
  const launcher = path.join(root, '.lore', 'lore.mjs').split(path.sep).join('/');
  return {
    SessionStart: [{ hooks: [{ type: 'command', command: `node "${launcher}" session --agent codex`, timeout: 30, statusMessage: 'LORE: board brief' }] }],
  };
}

export type Merged = { text: string; error?: undefined } | { error: string; text?: undefined };

/**
 * A settings file with LORE's hook entries replaced by `wanted`, and
 * everything else as it was. When nothing changes, the text is returned as
 * is, so the owner's formatting survives. `create` holds fields for a new
 * file only.
 */
export function mergeHooks(text: string | null, wanted: HookEvents, create: Record<string, unknown> = {}): Merged {
  let doc: Record<string, unknown> = { ...create };
  if (text !== null && text.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^﻿/, ''));
    } catch (err) {
      return { error: `not valid JSON (${(err as Error).message})` };
    }
    if (!isObject(parsed)) return { error: 'not a JSON object' };
    doc = parsed;
  }
  const before = JSON.stringify(doc);
  const hooks: Record<string, unknown> = isObject(doc.hooks) ? structuredClone(doc.hooks) : {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups
      .map((g) => (isObject(g) && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isLoreHook(h)) } : g))
      .filter((g) => !(isObject(g) && Array.isArray(g.hooks) && g.hooks.length === 0));
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  for (const [event, groups] of Object.entries(wanted)) {
    hooks[event] = [...(Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []), ...groups];
  }
  const next: Record<string, unknown> = { ...doc, hooks };
  if (!Object.keys(hooks).length) delete next.hooks;
  if (text !== null && JSON.stringify(next) === before) return { text };
  return { text: `${JSON.stringify(next, null, 2)}\n` };
}

/** Does this settings text hold any of LORE's hooks? */
export function hasLoreHooks(text: string | null): boolean {
  if (!text) return false;
  try {
    const doc: unknown = JSON.parse(text.replace(/^﻿/, ''));
    if (!isObject(doc) || !isObject(doc.hooks)) return false;
    return Object.values(doc.hooks).some(
      (groups) => Array.isArray(groups) && groups.some((g) => isObject(g) && Array.isArray(g.hooks) && g.hooks.some(isLoreHook)),
    );
  } catch {
    return false;
  }
}
