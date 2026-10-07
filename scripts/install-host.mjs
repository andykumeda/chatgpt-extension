import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PathPolicy } from '../bridge/paths.mjs';

if (process.platform !== 'darwin') throw new Error('This installer currently supports macOS only.');
const policy = new PathPolicy();
const project = policy.directory(fileURLToPath(new URL('..', import.meta.url)));
const testing = process.argv.includes('--testing');
const runtime = policy.create(path.join(project, testing ? '.runtime/testing' : '.runtime'));
const manifest = JSON.parse(fs.readFileSync(path.join(project, 'extension/manifest.json'), 'utf8'));
const extensionId = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
const binary = process.env.CODEX_BINARY || execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim();
if (!path.isAbsolute(binary)) throw new Error('CODEX_BINARY must be absolute.');
fs.accessSync(binary, fs.constants.X_OK);
const codexHome = policy.directory(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const state = policy.create(process.env.LOCAL_CODEX_STATE || (testing ? path.join(project, '.runtime/browser-state') : path.join(os.homedir(), '.codex/local-sidepanel')));
const configPath = path.join(runtime, 'host-config.json');
policy.safeFuture(configPath);
fs.writeFileSync(configPath, JSON.stringify({ binary, codexHome, state, extensionId }, null, 2), { mode: 0o600 });
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const launcher = path.join(runtime, 'native-host');
policy.safeFuture(launcher);
fs.writeFileSync(launcher, `#!/bin/sh\nexport LOCAL_CODEX_CONFIG=${quote(configPath)}\nexec ${quote(process.execPath)} ${quote(path.join(project, 'bridge/host.mjs'))} "$@"\n`, { mode: 0o700 });
fs.chmodSync(launcher, 0o700);
// Chrome resolves user-level hosts relative to its actual --user-data-dir.
const hostRoot = policy.create(testing ? path.join(project, '.runtime/chrome-test-profile/NativeMessagingHosts')
  : path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts'));
const hostPath = path.join(hostRoot, 'com.local_codex.sidepanel.json');
policy.safeFuture(hostPath);
const hostManifest = { name: 'com.local_codex.sidepanel', description: 'Local Codex side-panel prototype', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] };
if (fs.existsSync(hostPath)) {
  const existing = JSON.parse(fs.readFileSync(hostPath, 'utf8'));
  if (existing.name !== hostManifest.name || existing.allowed_origins?.[0] !== hostManifest.allowed_origins[0]) throw new Error('A different native host already uses this name. It was not overwritten.');
}
fs.writeFileSync(hostPath, JSON.stringify(hostManifest, null, 2), { mode: 0o600 });
console.log(`Installed prototype host: ${hostPath}\nExtension ID: ${extensionId}\nLoad unpacked: ${path.join(project, 'extension')}\nBridge state: ${state}\nWorkspace default: ~/.codex/Codex (must exist)`);
