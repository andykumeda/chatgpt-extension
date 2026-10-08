import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const distribution = JSON.parse(fs.readFileSync(path.join(project, 'distribution/config.json')));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-codex-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const binary = path.join(root, 'codex with spaces');
  fs.mkdirSync(home);
  fs.writeFileSync(binary, '#!/bin/sh\necho NEVER_EXPOSE_CREDENTIALS\nexit 0\n', { mode: 0o700 });
  const manifest = path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts', distribution.hostName + '.json');
  const config = path.join(home, 'Library/Application Support/Local Codex/host-config.json');
  const app = path.join(home, 'Applications/Local Codex.app');
  const launcher = path.join(app, 'Contents/MacOS/native-host');
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const invoke = (command, extra = []) => {
    const result = spawnSync(process.execPath, [path.join(project, 'companion/setup.mjs'), command, '--json', '--home', home, '--codex', binary, ...extra], { encoding: 'utf8' });
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes('NEVER_EXPOSE_CREDENTIALS'));
    return { ...result, data: JSON.parse(result.stdout) };
  };
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  return { root, home, binary, manifest, config, app, launcher, invoke, write };
}

test('companion status is read-only; install is idempotent and keeps auth output private', t => {
  const f = fixture(t);
  const status = f.invoke('status');
  assert.equal(status.status, 0);
  assert.equal(status.data.authenticated, true);
  assert.equal(status.data.registered, false);
  assert.equal(fs.existsSync(f.manifest), false);
  assert.equal(f.invoke('install').status, 0);
  const original = fs.readFileSync(f.config, 'utf8');
  assert.equal(f.invoke('install').status, 0);
  assert.equal(fs.readFileSync(f.config, 'utf8'), original);
  assert.equal(f.invoke('status').data.registered, true);
  assert.equal(JSON.parse(original).binary, f.binary);
  assert.equal(JSON.parse(original).appVersion, JSON.parse(fs.readFileSync(path.join(project, 'package.json'))).version);
});

test('companion preserves source-installer state and explicit runtime recovery settings', t => {
  const f = fixture(t);
  const oldConfig = path.join(f.root, 'old/config.json');
  const state = path.join(f.root, 'previous chats');
  const runtimeState = path.join(f.root, 'runtime recovery');
  f.write(oldConfig, { binary: f.binary, codexHome: path.join(f.home, '.codex'), state, runtimeState, extensionId: distribution.extensionId });
  const oldLauncher = path.join(f.root, 'old/native-host');
  fs.writeFileSync(oldLauncher, `#!/bin/sh\nexport LOCAL_CODEX_CONFIG='${oldConfig}'\nexec '/some/node' '/some/bridge/host.mjs' "$@"\n`);
  f.write(f.manifest, { name: distribution.hostName, type: 'stdio', path: oldLauncher, allowed_origins: [`chrome-extension://${distribution.extensionId}/`] });
  assert.equal(f.invoke('install').status, 0);
  const installed = JSON.parse(fs.readFileSync(f.config));
  assert.equal(installed.state, state);
  assert.equal(installed.runtimeState, runtimeState);
});

test('live host prevents registration; stale PID permits it without deleting history', t => {
  const f = fixture(t);
  const state = path.join(f.home, '.codex/local-sidepanel');
  fs.mkdirSync(state, { recursive: true });
  const lock = path.join(state, 'bridge.lock');
  fs.writeFileSync(lock, String(process.pid));
  assert.equal(f.invoke('status').data.busy, true);
  assert.match(f.invoke('install').data.error, /running/);
  assert.equal(fs.existsSync(f.manifest), false);
  fs.writeFileSync(lock, '2147483647');
  assert.equal(f.invoke('install').status, 0);
  assert.equal(fs.readFileSync(lock, 'utf8'), '2147483647');
});

test('unknown registrations are never overwritten even if origins match', t => {
  const f = fixture(t);
  f.write(f.config, { state: path.join(f.home, '.codex/local-sidepanel') });
  f.write(f.manifest, { name: distribution.hostName, type: 'stdio', path: f.binary, allowed_origins: [`chrome-extension://${distribution.extensionId}/`] });
  const original = fs.readFileSync(f.manifest, 'utf8');
  assert.match(f.invoke('install').data.error, /Unrecognized/);
  assert.equal(fs.readFileSync(f.manifest, 'utf8'), original);
});

test('failed Codex authentication returns only false', t => {
  const f = fixture(t);
  fs.writeFileSync(f.binary, '#!/bin/sh\necho NEVER_EXPOSE_CREDENTIALS\nexit 1\n');
  assert.equal(f.invoke('status').data.authenticated, false);
});

test('invalid lock content blocks installation conservatively', t => {
  const f = fixture(t);
  const state = path.join(f.home, '.codex/local-sidepanel');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'bridge.lock'), 'not a PID');
  assert.equal(f.invoke('status').data.busy, true);
  assert.equal(f.invoke('install').status, 1);
});

test('packaged helper copies into Applications and then registers the stable launcher', t => {
  const f = fixture(t);
  fs.rmSync(f.app, { recursive: true });
  const source = path.join(f.root, 'download/Local Codex.app');
  const resources = path.join(source, 'Contents/Resources');
  fs.mkdirSync(path.join(resources, 'companion'), { recursive: true });
  fs.mkdirSync(path.join(resources, 'distribution'));
  fs.mkdirSync(path.join(resources, 'bridge'));
  fs.copyFileSync(path.join(project, 'bridge/paths.mjs'), path.join(resources, 'bridge/paths.mjs'));
  fs.mkdirSync(path.join(source, 'Contents/MacOS'));
  fs.copyFileSync(path.join(project, 'companion/setup.mjs'), path.join(resources, 'companion/setup.mjs'));
  fs.copyFileSync(path.join(project, 'distribution/config.json'), path.join(resources, 'distribution/config.json'));
  fs.copyFileSync(path.join(project, 'package.json'), path.join(resources, 'package.json'));
  fs.writeFileSync(path.join(source, 'Contents/MacOS/LocalCodex'), 'fixture');
  fs.writeFileSync(path.join(source, 'Contents/MacOS/native-host'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const result = spawnSync(process.execPath, [path.join(resources, 'companion/setup.mjs'), 'install', '--copy-app', '--json', '--home', f.home, '--codex', f.binary], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(JSON.parse(result.stdout).registered, true);
  assert.equal(JSON.parse(fs.readFileSync(f.manifest)).path, f.launcher);
  assert.equal(fs.readFileSync(path.join(f.app, 'Contents/MacOS/LocalCodex'), 'utf8'), 'fixture');
});

test('fresh explicit install creates only the default workspace; status stays read-only', t => {
  const f = fixture(t);
  const workspace = path.join(f.home, '.codex/Codex');
  assert.equal(f.invoke('status').status, 0);
  assert.equal(fs.existsSync(workspace), false);
  assert.equal(f.invoke('install').status, 0);
  assert.equal(fs.statSync(workspace).isDirectory(), true);
});

test('missing saved workspace refuses install without creating it or substituting a default', t => {
  const f = fixture(t);
  const state = path.join(f.home, '.codex/local-sidepanel');
  const saved = path.join(f.home, 'previous workspace');
  const index = { version: 1, workspace: saved, chats: [] };
  f.write(path.join(state, 'chats.json'), index);
  assert.match(f.invoke('install').data.error, /Workspace unavailable/);
  assert.equal(fs.existsSync(saved), false);
  assert.equal(fs.existsSync(path.join(f.home, '.codex/Codex')), false);
  assert.equal(fs.existsSync(f.manifest), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(state, 'chats.json'))), index);
});

test('forbidden preserved managed paths are rejected before registration', t => {
  const f = fixture(t);
  f.write(f.config, { state: path.join(f.home, 'Documents/private-state') });
  assert.match(f.invoke('install').data.error, /forbidden/);
  assert.equal(fs.existsSync(f.manifest), false);
  assert.equal(fs.existsSync(path.join(f.home, 'Documents')), false);
});
