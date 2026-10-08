import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PathPolicy } from '../bridge/paths.mjs';

export function assertHostIdle(state) {
  const lock = path.join(state, 'bridge.lock');
  if (!fs.existsSync(lock)) return;
  const pid = Number(fs.readFileSync(lock, 'utf8').trim());
  if (Number.isSafeInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; }
  }
  throw new Error('Close all Local Codex side panels before installing or updating. A native host may be running.');
}

export function sourceInstallation(project, home = os.homedir(), testing = false) {
  const policy = new PathPolicy(home);
  project = policy.directory(project);
  const relative = path.relative(path.join(home, 'Downloads'), project);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Move this bundle out of Downloads into a permanent local folder such as ~/Dev.');
  const runtime = path.join(project, testing ? '.runtime/testing' : '.runtime');
  const configPath = path.join(runtime, 'host-config.json');
  const hostRoot = testing ? path.join(project, '.runtime/chrome-test-profile/NativeMessagingHosts') : path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  const hostPath = path.join(hostRoot, 'com.local_codex.sidepanel.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'extension/manifest.json'), 'utf8'));
  const extensionId = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)].map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
  let previous = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  if (fs.existsSync(hostPath)) {
    const existing = JSON.parse(fs.readFileSync(hostPath, 'utf8'));
    if (existing.name !== 'com.local_codex.sidepanel' || existing.type !== 'stdio' || typeof existing.path !== 'string' || !path.isAbsolute(existing.path) || JSON.stringify(existing.allowed_origins) !== JSON.stringify([`chrome-extension://${extensionId}/`])) throw new Error('A different native host already uses this name. It was not overwritten.');
    // Read only our exact generated shell format; never execute an old launcher.
    const launcher = fs.readFileSync(existing.path, 'utf8');
    const match = launcher.match(/^#!\/bin\/sh\nexport LOCAL_CODEX_CONFIG='((?:[^']|'\\'')*)'\nexec '[^\n]+' '[^\n]+\/bridge\/host\.mjs' "\$@"\n$/);
    if (!match) throw new Error('Unrecognized native host installation. Existing registration was preserved.');
    previous = JSON.parse(fs.readFileSync(match[1].replaceAll("'\\''", "'"), 'utf8'));
    if (previous.extensionId !== extensionId) throw new Error('Existing configuration belongs to another extension.');
  }
  return { project, home, policy, runtime, configPath, hostRoot, hostPath, extensionId, previous, testing };
}

export function installSource({ project, home = os.homedir(), testing = false, env = process.env }) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const info = sourceInstallation(project, home, testing);
  const { policy, runtime, configPath, hostRoot, hostPath, extensionId, previous } = info;
  const binary = env.CODEX_BINARY || previous.binary || execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim();
  if (!path.isAbsolute(binary)) throw new Error('CODEX_BINARY must be absolute.');
  fs.accessSync(binary, fs.constants.X_OK);
  const codexHome = policy.safeFuture(env.CODEX_HOME || previous.codexHome || path.join(home, '.codex'));
  const state = policy.safeFuture(env.LOCAL_CODEX_STATE || previous.state || (testing ? path.join(project, '.runtime/browser-state') : path.join(home, '.codex/local-sidepanel')));
  const requestedRuntime = env.LOCAL_CODEX_RUNTIME_STATE || previous.runtimeState;
  const runtimeState = requestedRuntime ? policy.safeFuture(requestedRuntime) : undefined;
  assertHostIdle(previous.state || state); assertHostIdle(state);
  const indexPath = policy.safeFuture(path.join(state, 'chats.json'));
  const fresh = !fs.existsSync(indexPath);
  const index = fresh ? null : JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (index && (index.version !== 1 || !Array.isArray(index.chats))) throw new Error('Unsupported chat index. Existing state was preserved.');
  const workspace = fresh ? policy.safeFuture(path.join(home, '.codex/Codex')) : policy.directory(index.workspace);
  const launcher = policy.safeFuture(path.join(runtime, 'native-host'));
  for (const file of [configPath, hostPath]) policy.safeFuture(file);
  for (const directory of [runtime, hostRoot, codexHome, state, runtimeState, ...(fresh ? [workspace] : [])].filter(Boolean)) policy.create(directory);
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const atomic = (file, contents, mode) => {
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, contents, { mode, flag: 'wx' });
    fs.renameSync(temporary, file);
  };
  assertHostIdle(state);
  atomic(configPath, JSON.stringify({ binary, codexHome, state, extensionId, runtimeState }, null, 2), 0o600);
  atomic(launcher, `#!/bin/sh\nexport LOCAL_CODEX_CONFIG=${quote(configPath)}\nexec ${quote(process.execPath)} ${quote(path.join(info.project, 'bridge/host.mjs'))} "$@"\n`, 0o700);
  atomic(hostPath, JSON.stringify({ name: 'com.local_codex.sidepanel', description: 'Local Codex source installation', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), 0o600);
  return { ...info, state, workspace };
}
